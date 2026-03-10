use std::collections::HashMap;
use std::path::PathBuf;

use iced::event;
use iced::keyboard;
use iced::mouse;
use iced::time;
use iced::widget::{button, canvas, column, container, row, stack, text, text_editor, Canvas};
use iced::window;
use iced::{Element, Event, Length, Point, Subscription, Task};

use yamind_canvas::interaction::InteractionState;
use yamind_canvas::program::{draw_canvas, CanvasData};
use yamind_canvas::viewport::Viewport;
use yamind_canvas::CanvasMessage;
use yamind_commands::{
    AddAttachmentCommand, AddBoundaryCommand, AddChildCommand, AddSiblingCommand, Command,
    CommandHistory, DeleteAndReparentCommand, DeleteBoundaryCommand, DeleteNodeCommand,
    EditBoundaryLabelCommand, EditTextCommand, MoveNodeCommand, RemoveAttachmentCommand,
};
use yamind_core::geometry::{self as geo, Rect};
use yamind_core::id::{BoundaryId, NodeId};
use yamind_core::{Document, Selection};
use yamind_layout::perform_layout;

use crate::message::{CanvasEvent, ContextAction, Message};
use crate::shortcuts;

/// Where a dragged node would be dropped.
#[derive(Debug, Clone, PartialEq)]
enum DropTarget {
    /// Reparent: become a child of `parent` at the end.
    OnNode { parent: NodeId },
    /// Reorder: insert before `sibling` within the same parent.
    BeforeSibling { parent: NodeId, index: usize },
}

const DRAG_THRESHOLD: f32 = 5.0;

pub struct App {
    document: Document,
    selection: Selection,
    history: CommandHistory,
    file_path: Option<PathBuf>,

    // Layout results
    positions: HashMap<NodeId, Rect>,
    edge_routes: HashMap<(NodeId, NodeId), yamind_core::edge::BezierRoute>,
    node_sizes: HashMap<NodeId, geo::Size>,

    // Canvas state
    viewport: Viewport,
    interaction: InteractionState,
    canvas_cache: canvas::Cache,

    // Spatial index for hit testing
    spatial_index: yamind_canvas::SpatialIndex,

    // Drag-and-drop state
    drop_target: Option<DropTarget>,
    drag_started: bool,

    // Hover state (for fold/unfold badges)
    hover_node: Option<NodeId>,

    // Delete confirmation dialog
    pending_delete: Option<NodeId>,

    // Inline text editing state
    editing_node: Option<NodeId>,
    editing_content: text_editor::Content,
    editing_original_text: String,
    editing_is_new_node: bool,

    // Track if we need initial setup
    needs_menu_setup: bool,
    screen_size: (f32, f32),
    window_position: Option<(f32, f32)>,
    window_id: Option<window::Id>,
    /// View state waiting to be applied once we have a window_id.
    pending_window_restore: Option<yamind_file::ViewState>,

    // URL attachment input overlay: (node_id, url_text, auto_fill_title, fetched_title)
    pending_url_input: Option<UrlInputState>,

    // Context menu state
    context_menu: Option<ContextMenuState>,

    // Boundary state
    selected_boundary: Option<BoundaryId>,
    hover_boundary: Option<BoundaryId>,
    editing_boundary: Option<BoundaryLabelEditState>,
}

#[derive(Debug, Clone)]
struct UrlInputState {
    node_id: NodeId,
    url: String,
    auto_fill_title: bool,
    fetched_title: Option<String>,
}

#[derive(Debug, Clone)]
struct BoundaryLabelEditState {
    boundary_id: BoundaryId,
    label: String,
}

#[derive(Debug, Clone)]
enum ContextMenuTarget {
    Node(NodeId),
    Boundary(BoundaryId),
}

#[derive(Debug, Clone)]
struct ContextMenuState {
    /// Screen-space position where the menu should appear.
    screen_pos: (f32, f32),
    /// What was right-clicked.
    target: ContextMenuTarget,
}

impl App {
    pub fn new() -> (Self, Task<Message>) {
        // Install file-open delegate methods on winit's delegate
        // (must happen after winit creates its delegate, before event loop runs)
        crate::menu::install_open_handler();
        crate::menu::install_magnify_handler();

        // Check if any files were queued (from argv or Apple Events during startup)
        let pending = crate::open_handler::take_pending_files();

        let (doc, file_path, view_state) = if let Some(path) = pending.into_iter().next() {
            // Load the file from Finder / argv
            match std::fs::read_to_string(&path) {
                Ok(json) => match yamind_file::YaMindFile::from_json(&json) {
                    Ok(file) => (file.document, Some(path), file.view_state),
                    Err(e) => {
                        log::error!("Failed to parse file {}: {}", path.display(), e);
                        (Self::demo_document(), None, None)
                    }
                },
                Err(e) => {
                    log::error!("Failed to read file {}: {}", path.display(), e);
                    (Self::demo_document(), None, None)
                }
            }
        } else {
            (Self::demo_document(), None, None)
        };

        let (viewport, screen_size, window_position) = if let Some(ref vs) = view_state {
            let mut vp = Viewport::new();
            vp.transform.translation = geo::Vector::new(vs.translation.0, vs.translation.1);
            vp.transform.scale = vs.scale;
            (vp, vs.window_size, vs.window_position)
        } else {
            (Viewport::new(), (1200.0, 800.0), None)
        };

        let mut app = Self {
            document: doc,
            selection: Selection::new(),
            history: CommandHistory::new(),
            file_path,
            positions: HashMap::new(),
            edge_routes: HashMap::new(),
            node_sizes: HashMap::new(),
            viewport,
            interaction: InteractionState::Idle,
            canvas_cache: canvas::Cache::new(),
            spatial_index: yamind_canvas::SpatialIndex::new(),
            drop_target: None,
            drag_started: false,
            hover_node: None,
            pending_delete: None,
            editing_node: None,
            editing_content: text_editor::Content::new(),
            editing_original_text: String::new(),
            editing_is_new_node: false,
            needs_menu_setup: true,
            screen_size,
            window_position,
            window_id: None,
            pending_window_restore: None,
            pending_url_input: None,
            context_menu: None,
            selected_boundary: None,
            hover_boundary: None,
            editing_boundary: None,
        };

        app.compute_layout();
        if view_state.is_none() {
            app.zoom_to_fit();
        }

        (app, Task::none())
    }

    fn demo_document() -> Document {
        let mut doc = Document::with_root("Central Topic");
        let root_id = doc.root_id.unwrap();
        let c1 = doc.add_child(root_id, "Branch 1");
        let c2 = doc.add_child(root_id, "Branch 2");
        let c3 = doc.add_child(root_id, "Branch 3");
        doc.add_child(c1, "Sub-topic 1.1");
        doc.add_child(c1, "Sub-topic 1.2");
        doc.add_child(c2, "Sub-topic 2.1");
        doc.add_child(c3, "Sub-topic 3.1");
        doc.add_child(c3, "Sub-topic 3.2");
        doc.add_child(c3, "Sub-topic 3.3");

        // Add demo attachments
        if let Some(node) = doc.get_node_mut(&c1) {
            node.content.attachments.push(yamind_core::node::Attachment {
                kind: yamind_core::node::AttachmentKind::Url("https://example.com".to_string()),
                label: Some("Example".to_string()),
            });
        }
        if let Some(node) = doc.get_node_mut(&c2) {
            node.content.attachments.push(yamind_core::node::Attachment {
                kind: yamind_core::node::AttachmentKind::Document("/tmp/test.pdf".to_string()),
                label: Some("Test Doc".to_string()),
            });
            node.content.attachments.push(yamind_core::node::Attachment {
                kind: yamind_core::node::AttachmentKind::Photo("/tmp/photo.png".to_string()),
                label: Some("Photo".to_string()),
            });
        }

        // Add demo boundary around Branch 3 and its children
        {
            let mut node_ids = vec![c3];
            if let Some(node) = doc.get_node(&c3) {
                node_ids.extend(node.children.iter());
            }
            let mut boundary = yamind_core::boundary::Boundary::new(node_ids);
            boundary.label = "Group".to_string();
            doc.boundaries.insert(boundary.id, boundary);
        }

        doc
    }

    fn compute_layout(&mut self) {
        // Compute node sizes (simple text measurement approximation)
        self.node_sizes.clear();
        for (id, node) in &self.document.nodes {
            let depth = self.document.depth_of(id);
            let default_style = self.document.default_styles.for_depth(depth);
            let resolved = node.style.merged_with(default_style);

            let font_size = resolved.font_size.unwrap_or(14.0);
            let padding_h = resolved.padding_h.unwrap_or(12.0);
            let padding_v = resolved.padding_v.unwrap_or(8.0);
            let min_width = resolved.min_width.unwrap_or(60.0);
            let max_width = resolved.max_width.unwrap_or(200.0);

            // Reserve side column width for attachments (and future flags)
            let side_col = if node.content.attachments.is_empty() {
                0.0
            } else {
                yamind_canvas::node_renderer::SIDE_COLUMN_WIDTH
            };

            let width = if let Some(mw) = node.manual_width {
                mw.max(min_width)
            } else {
                // Measure unwrapped text width to determine natural node width
                let unwrapped = yamind_canvas::text_measure::measure_text(
                    &node.content.text, font_size, None,
                );
                (unwrapped.width + padding_h * 2.0 + side_col).clamp(min_width, max_width)
            };

            // Measure text wrapped within the node's usable width to get height
            let usable_width = width - padding_h * 2.0 - side_col;
            let wrapped = yamind_canvas::text_measure::measure_text(
                &node.content.text, font_size, Some(usable_width),
            );
            let mut height = wrapped.height + padding_v * 2.0;

            // Ellipse/Diamond shapes need extra room — text must fit inside
            // the inscribed rectangle (factor ≈ √2 ≈ 1.42)
            let shape = resolved.shape.unwrap_or(yamind_core::style::NodeShape::RoundedRect);
            let (width, height) = match shape {
                yamind_core::style::NodeShape::Ellipse
                | yamind_core::style::NodeShape::Diamond => {
                    let w = width * 1.42;
                    height = height * 1.42;
                    (w.clamp(min_width, max_width.max(w)), height)
                }
                _ => (width, height),
            };

            self.node_sizes.insert(*id, geo::Size::new(width, height));
        }

        let result = perform_layout(&self.document, &self.node_sizes);
        self.positions = result.positions;
        self.edge_routes = result.edge_routes;

        // Update spatial index
        self.spatial_index.rebuild(
            self.positions
                .iter()
                .map(|(id, rect)| yamind_canvas::hit_test::NodeHitBox {
                    id: *id,
                    bounds: *rect,
                })
                .collect(),
        );

        self.canvas_cache.clear();
    }

    fn zoom_to_fit(&mut self) {
        if self.positions.is_empty() {
            return;
        }
        let mut min_x = f32::MAX;
        let mut min_y = f32::MAX;
        let mut max_x = f32::MIN;
        let mut max_y = f32::MIN;
        for rect in self.positions.values() {
            min_x = min_x.min(rect.x);
            min_y = min_y.min(rect.y);
            max_x = max_x.max(rect.x + rect.width);
            max_y = max_y.max(rect.y + rect.height);
        }
        let bounds = Rect::new(min_x, min_y, max_x - min_x, max_y - min_y);
        self.viewport
            .zoom_to_fit(bounds, self.screen_size.0, self.screen_size.1, 80.0);
        self.canvas_cache.clear();
    }

    pub fn title(&self) -> String {
        match &self.file_path {
            Some(path) => {
                let name = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "Untitled".into());
                format!("{} — YaMindMap", name)
            }
            None => "Untitled — YaMindMap".into(),
        }
    }

    pub fn update(&mut self, message: Message) -> Task<Message> {
        // When the delete dialog is open, only allow dialog-related messages
        if self.pending_delete.is_some() {
            match &message {
                Message::DeleteWithChildren(_)
                | Message::DeleteKeepChildren(_)
                | Message::CancelDelete => {} // allow these through
                _ => return Task::none(),
            }
        }
        // When the URL input overlay is open, only allow URL-related messages
        if self.pending_url_input.is_some() {
            match &message {
                Message::UrlInputChanged(_)
                | Message::ToggleAutoFillTitle
                | Message::FetchTitle
                | Message::TitleFetched(_)
                | Message::SubmitUrlAttachment
                | Message::CancelUrlAttachment => {}
                // Escape key produces CancelDelete — treat as cancel URL input
                Message::CancelDelete => {
                    self.pending_url_input = None;
                    return Task::none();
                }
                _ => return Task::none(),
            }
        }
        // When boundary label editing is open, only allow label-related messages
        if self.editing_boundary.is_some() {
            match &message {
                Message::BoundaryLabelChanged(_)
                | Message::CommitBoundaryLabel
                | Message::CancelBoundaryLabel => {}
                Message::CancelDelete => {
                    self.editing_boundary = None;
                    return Task::none();
                }
                _ => return Task::none(),
            }
        }
        // When context menu is open, only allow context-menu-related messages
        if self.context_menu.is_some() {
            match &message {
                Message::DismissContextMenu
                | Message::ContextMenuAction(_) => {}
                // Escape dismisses context menu
                Message::CancelDelete => {
                    self.context_menu = None;
                    return Task::none();
                }
                // Click events dismiss context menu (but not cursor moves or scroll)
                Message::CanvasEvent(CanvasEvent::LeftPress(..))
                | Message::CanvasEvent(CanvasEvent::RightPress(..))
                | Message::CanvasEvent(CanvasEvent::MiddlePress(..)) => {
                    self.context_menu = None;
                    return Task::none();
                }
                // Allow cursor moves and scrolls through without dismissing
                Message::CanvasEvent(CanvasEvent::CursorMoved(_))
                | Message::CanvasEvent(CanvasEvent::ScrollPan(..))
                | Message::CanvasEvent(CanvasEvent::ScrollZoom(..)) => {
                    return Task::none();
                }
                // Any other canvas event dismisses
                Message::CanvasEvent(_) => {
                    self.context_menu = None;
                    return Task::none();
                }
                _ => return Task::none(),
            }
        }
        match message {
            Message::AddChild => {
                if let Some(selected_id) = self.selection.single() {
                    let mut cmd = AddChildCommand::new(selected_id, "");
                    cmd.execute(&mut self.document);
                    let new_id = cmd.created_id().unwrap();
                    self.history.push_executed(Box::new(cmd));
                    self.compute_layout();
                    self.start_editing_new_node(new_id);
                    return iced::widget::focus_next();
                }
            }
            Message::AddSibling => {
                if let Some(selected_id) = self.selection.single() {
                    if !self.document.get_node(&selected_id).map_or(true, |n| n.is_root()) {
                        let mut cmd = AddSiblingCommand::new(selected_id, "");
                        cmd.execute(&mut self.document);
                        if let Some(new_id) = cmd.created_id() {
                            self.history.push_executed(Box::new(cmd));
                            self.compute_layout();
                            self.start_editing_new_node(new_id);
                            return iced::widget::focus_next();
                        }
                    }
                }
            }
            Message::ToggleFold => {
                // Toggle collapsed state for all selected nodes that have children
                for node_id in self.selection.nodes.clone() {
                    if let Some(node) = self.document.get_node_mut(&node_id) {
                        if !node.children.is_empty() {
                            node.collapsed = !node.collapsed;
                        }
                    }
                }
                self.compute_layout();
            }
            Message::DeleteSelected => {
                // Delete selected boundary if one is selected and no node is
                if self.selection.is_empty() {
                    if let Some(bid) = self.selected_boundary {
                        return self.update(Message::DeleteBoundary(bid));
                    }
                }
                if let Some(selected_id) = self.selection.single() {
                    // Can't delete root node
                    if self.document.get_node(&selected_id).map_or(true, |n| n.is_root()) {
                        return Task::none();
                    }
                    let has_children = self.document.get_node(&selected_id)
                        .map_or(false, |n| !n.children.is_empty());
                    if has_children {
                        // Show confirmation dialog
                        self.pending_delete = Some(selected_id);
                    } else {
                        // No children — delete immediately
                        self.history.execute(
                            Box::new(DeleteNodeCommand::new(selected_id)),
                            &mut self.document,
                        );
                        self.selection.clear();
                        self.compute_layout();
                    }
                }
            }
            Message::DeleteWithChildren(node_id) => {
                self.pending_delete = None;
                self.history.execute(
                    Box::new(DeleteNodeCommand::new(node_id)),
                    &mut self.document,
                );
                self.selection.clear();
                self.compute_layout();
            }
            Message::DeleteKeepChildren(node_id) => {
                self.pending_delete = None;
                self.history.execute(
                    Box::new(DeleteAndReparentCommand::new(node_id)),
                    &mut self.document,
                );
                self.selection.clear();
                self.compute_layout();
            }
            Message::CancelDelete => {
                self.pending_delete = None;
            }
            Message::Undo => {
                self.history.undo(&mut self.document);
                self.compute_layout();
            }
            Message::Redo => {
                self.history.redo(&mut self.document);
                self.compute_layout();
            }
            Message::ZoomIn => {
                let center = geo::Point::new(
                    self.screen_size.0 / 2.0,
                    self.screen_size.1 / 2.0,
                );
                self.viewport.zoom(1.2, center);
                self.canvas_cache.clear();
            }
            Message::ZoomOut => {
                let center = geo::Point::new(
                    self.screen_size.0 / 2.0,
                    self.screen_size.1 / 2.0,
                );
                self.viewport.zoom(1.0 / 1.2, center);
                self.canvas_cache.clear();
            }
            Message::ZoomToFit => {
                self.zoom_to_fit();
            }
            Message::Canvas(canvas_msg) => match canvas_msg {
                CanvasMessage::SelectNode(id) => {
                    if let Some(id) = id {
                        self.selection.select(id);
                    } else {
                        self.selection.clear();
                    }
                    self.canvas_cache.clear();
                }
                CanvasMessage::ToggleSelectNode(id) => {
                    self.selection.toggle(id);
                    self.canvas_cache.clear();
                }
                CanvasMessage::AddChild(parent_id) => {
                    self.history.execute(
                        Box::new(AddChildCommand::new(parent_id, "New Topic")),
                        &mut self.document,
                    );
                    self.compute_layout();
                }
                CanvasMessage::DeleteNode(id) => {
                    self.history.execute(
                        Box::new(DeleteNodeCommand::new(id)),
                        &mut self.document,
                    );
                    self.selection.clear();
                    self.compute_layout();
                }
                _ => {}
            },
            Message::CanvasEvent(canvas_event) => {
                return self.handle_canvas_event(canvas_event);
            }
            Message::PinchZoom(delta, x, y) => {
                // delta is the macOS magnification value: positive = zoom in, negative = zoom out
                let factor = 1.0 + delta;
                self.viewport.zoom(factor, geo::Point::new(x, y));
                self.canvas_cache.clear();
            }
            Message::MenuTick => {
                if self.needs_menu_setup {
                    self.needs_menu_setup = false;
                    const ICON_PNG: &[u8] = include_bytes!("../assets/icons/yamindmap_256.png");
                    crate::menu::set_icon(ICON_PNG);
                    crate::menu::init_menus();
                }
                // Check for files opened via macOS double-click / Finder
                let pending = crate::open_handler::take_pending_files();
                let mut tasks: Vec<Task<Message>> = Vec::new();
                for path in pending {
                    tasks.push(self.load_file(&path));
                }
                if let Some(menu_msg) = crate::menu::poll_menu_event() {
                    tasks.push(self.update(menu_msg));
                }
                // Poll for trackpad pinch (magnify) gestures
                while let Some((delta, x, y)) = crate::menu::poll_magnify() {
                    tasks.push(self.update(Message::PinchZoom(delta, x, y)));
                }
                if !tasks.is_empty() {
                    return Task::batch(tasks);
                }
            }
            Message::MenuNew => {
                // Launch a new instance of the app
                if let Ok(exe) = std::env::current_exe() {
                    let _ = std::process::Command::new(exe).spawn();
                }
            }
            Message::MenuOpen => {
                return self.open_file();
            }
            Message::MenuSave => {
                if self.file_path.is_some() {
                    self.save_to_current_path();
                } else {
                    self.save_as();
                }
            }
            Message::MenuSaveAs => {
                self.save_as();
            }
            Message::StartEditing(node_id) => {
                if let Some(node) = self.document.get_node(&node_id) {
                    self.editing_original_text = node.content.text.clone();
                    self.editing_content = text_editor::Content::with_text(&node.content.text);
                    self.editing_node = Some(node_id);
                    self.interaction = InteractionState::EditingNodeText { node_id };
                    // Select all text
                    self.editing_content.perform(text_editor::Action::SelectAll);
                    self.canvas_cache.clear();
                }
            }
            Message::TextEditorAction(action) => {
                if let Some(node_id) = self.editing_node {
                    self.editing_content.perform(action);
                    // Sync text back to document (Content::text() appends trailing \n)
                    let mut text = self.editing_content.text();
                    if text.ends_with('\n') {
                        text.pop();
                    }
                    if let Some(node) = self.document.get_node_mut(&node_id) {
                        node.content.text = text;
                    }
                    self.compute_layout();
                }
            }
            Message::CommitEditing => {
                self.commit_editing();
            }
            Message::CancelEditing => {
                if let Some(node_id) = self.editing_node.take() {
                    let is_new_node = self.editing_is_new_node;
                    self.editing_is_new_node = false;

                    if is_new_node {
                        // Cancel on a new node → undo the add entirely
                        self.history.undo(&mut self.document);
                    } else {
                        // Restore original text
                        if let Some(node) = self.document.get_node_mut(&node_id) {
                            node.content.text = std::mem::take(&mut self.editing_original_text);
                        }
                    }
                    self.editing_content = text_editor::Content::new();
                    self.editing_original_text.clear();
                    self.interaction = InteractionState::Idle;
                    self.compute_layout();
                }
            }
            Message::AddUrlAttachment => {
                if let Some(node_id) = self.selection.single() {
                    self.pending_url_input = Some(UrlInputState {
                        node_id,
                        url: String::new(),
                        auto_fill_title: true,
                        fetched_title: None,
                    });
                }
            }
            Message::AddDocumentAttachment => {
                if let Some(node_id) = self.selection.single() {
                    let dialog = rfd::FileDialog::new()
                        .set_title("Attach Document");
                    if let Some(path) = dialog.pick_file() {
                        let path_str = self.make_relative_path(&path);
                        let attachment = yamind_core::node::Attachment {
                            kind: yamind_core::node::AttachmentKind::Document(path_str),
                            label: path.file_name().map(|n| n.to_string_lossy().into_owned()),
                        };
                        self.history.execute(
                            Box::new(AddAttachmentCommand::new(node_id, attachment)),
                            &mut self.document,
                        );
                        self.compute_layout();
                    }
                }
            }
            Message::AddPhotoAttachment => {
                if let Some(node_id) = self.selection.single() {
                    let dialog = rfd::FileDialog::new()
                        .set_title("Attach Photo")
                        .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
                    if let Some(path) = dialog.pick_file() {
                        let path_str = self.make_relative_path(&path);
                        let attachment = yamind_core::node::Attachment {
                            kind: yamind_core::node::AttachmentKind::Photo(path_str),
                            label: path.file_name().map(|n| n.to_string_lossy().into_owned()),
                        };
                        self.history.execute(
                            Box::new(AddAttachmentCommand::new(node_id, attachment)),
                            &mut self.document,
                        );
                        self.compute_layout();
                    }
                }
            }
            Message::UrlInputChanged(new_text) => {
                if let Some(ref mut state) = self.pending_url_input {
                    state.url = new_text;
                    state.fetched_title = None;
                }
            }
            Message::ToggleAutoFillTitle => {
                if let Some(ref mut state) = self.pending_url_input {
                    state.auto_fill_title = !state.auto_fill_title;
                }
            }
            Message::FetchTitle => {
                if let Some(ref state) = self.pending_url_input {
                    let url = state.url.clone();
                    if !url.is_empty() {
                        return Task::perform(
                            async move { fetch_page_title(&url).await },
                            Message::TitleFetched,
                        );
                    }
                }
            }
            Message::TitleFetched(title) => {
                if let Some(ref mut state) = self.pending_url_input {
                    if !title.is_empty() {
                        state.fetched_title = Some(title);
                    }
                }
            }
            Message::SubmitUrlAttachment => {
                if let Some(state) = self.pending_url_input.take() {
                    if !state.url.is_empty() {
                        // If auto-fill is on and we have a title, rename the node
                        if state.auto_fill_title {
                            if let Some(ref title) = state.fetched_title {
                                if !title.is_empty() {
                                    self.history.execute(
                                        Box::new(EditTextCommand::new(state.node_id, title.clone())),
                                        &mut self.document,
                                    );
                                }
                            }
                        }
                        let attachment = yamind_core::node::Attachment {
                            kind: yamind_core::node::AttachmentKind::Url(state.url),
                            label: state.fetched_title,
                        };
                        self.history.execute(
                            Box::new(AddAttachmentCommand::new(state.node_id, attachment)),
                            &mut self.document,
                        );
                        self.compute_layout();
                    }
                }
            }
            Message::CancelUrlAttachment => {
                self.pending_url_input = None;
            }
            Message::AttachmentPicked(node_id, attachment) => {
                self.history.execute(
                    Box::new(AddAttachmentCommand::new(node_id, attachment)),
                    &mut self.document,
                );
                self.compute_layout();
            }
            Message::RemoveAttachment(node_id, idx) => {
                self.history.execute(
                    Box::new(RemoveAttachmentCommand::new(node_id, idx)),
                    &mut self.document,
                );
                self.compute_layout();
            }
            Message::OpenAttachment(node_id, idx) => {
                self.open_attachment(&node_id, idx);
            }
            Message::AddBoundary => {
                if let Some(selected_id) = self.selection.single() {
                    // Boundary wraps the selected node and its children
                    let mut node_ids = vec![selected_id];
                    if let Some(node) = self.document.get_node(&selected_id) {
                        node_ids.extend(node.children.iter());
                    }
                    let mut cmd = AddBoundaryCommand::new(node_ids);
                    cmd.execute(&mut self.document);
                    let bid = cmd.created_id();
                    self.history.push_executed(Box::new(cmd));
                    self.selected_boundary = Some(bid);
                    self.canvas_cache.clear();
                }
            }
            Message::DeleteBoundary(bid) => {
                self.history.execute(
                    Box::new(DeleteBoundaryCommand::new(bid)),
                    &mut self.document,
                );
                if self.selected_boundary == Some(bid) {
                    self.selected_boundary = None;
                }
                self.canvas_cache.clear();
            }
            Message::EditBoundaryLabel(bid) => {
                let label = self.document.boundaries.get(&bid)
                    .map(|b| b.label.clone())
                    .unwrap_or_default();
                self.editing_boundary = Some(BoundaryLabelEditState {
                    boundary_id: bid,
                    label,
                });
            }
            Message::BoundaryLabelChanged(new_text) => {
                if let Some(ref mut state) = self.editing_boundary {
                    state.label = new_text;
                }
            }
            Message::CommitBoundaryLabel => {
                if let Some(state) = self.editing_boundary.take() {
                    self.history.execute(
                        Box::new(EditBoundaryLabelCommand::new(state.boundary_id, state.label)),
                        &mut self.document,
                    );
                    self.canvas_cache.clear();
                }
            }
            Message::CancelBoundaryLabel => {
                self.editing_boundary = None;
            }
            Message::ShowContextMenu(pos) => {
                let world = self.viewport.screen_to_world(geo::Point::new(pos.x, pos.y));
                if let Some(node_id) = self.spatial_index.hit_test(world) {
                    self.context_menu = Some(ContextMenuState {
                        screen_pos: (pos.x, pos.y),
                        target: ContextMenuTarget::Node(node_id),
                    });
                }
            }
            Message::DismissContextMenu => {
                self.context_menu = None;
            }
            Message::ContextMenuAction(action) => {
                let target = self.context_menu.as_ref().map(|cm| cm.target.clone());
                self.context_menu = None;
                if let Some(target) = target {
                    match target {
                        ContextMenuTarget::Node(node_id) => match action {
                            ContextAction::AddBoundary => {
                                self.selection.select(node_id);
                                return self.update(Message::AddBoundary);
                            }
                            ContextAction::AddChild => {
                                self.selection.select(node_id);
                                return self.update(Message::AddChild);
                            }
                            ContextAction::AddSibling => {
                                self.selection.select(node_id);
                                return self.update(Message::AddSibling);
                            }
                            ContextAction::AddUrl => {
                                self.selection.select(node_id);
                                return self.update(Message::AddUrlAttachment);
                            }
                            ContextAction::AddDocument => {
                                self.selection.select(node_id);
                                return self.update(Message::AddDocumentAttachment);
                            }
                            ContextAction::AddPhoto => {
                                self.selection.select(node_id);
                                return self.update(Message::AddPhotoAttachment);
                            }
                            ContextAction::EditNode => {
                                return self.update(Message::StartEditing(node_id));
                            }
                            ContextAction::ToggleFold => {
                                self.selection.select(node_id);
                                return self.update(Message::ToggleFold);
                            }
                            ContextAction::Delete => {
                                self.selection.select(node_id);
                                return self.update(Message::DeleteSelected);
                            }
                            _ => {}
                        },
                        ContextMenuTarget::Boundary(bid) => match action {
                            ContextAction::EditBoundaryLabel => {
                                return self.update(Message::EditBoundaryLabel(bid));
                            }
                            ContextAction::DeleteBoundary => {
                                return self.update(Message::DeleteBoundary(bid));
                            }
                            _ => {}
                        },
                    }
                }
            }
            Message::WindowOpened(id, pos) => {
                self.window_id = Some(id);
                self.window_position = Some((pos.x, pos.y));
                return self.apply_pending_window_restore();
            }
            Message::WindowResized(id, size) => {
                self.window_id = Some(id);
                self.screen_size = (size.width, size.height);
                return self.apply_pending_window_restore();
            }
            Message::WindowMoved(pos) => {
                self.window_position = Some((pos.x, pos.y));
            }
        }

        Task::none()
    }

    fn handle_canvas_event(&mut self, event: CanvasEvent) -> Task<Message> {
        match event {
            CanvasEvent::LeftPress(pos, shift_held, alt_held) => {
                // If editing, commit on click away
                if self.editing_node.is_some() {
                    let world = self.viewport.screen_to_world(geo::Point::new(pos.x, pos.y));
                    let clicked_editing_node = self.editing_node
                        .and_then(|eid| self.spatial_index.hit_test(world).filter(|&hit| hit == eid))
                        .is_some();
                    if !clicked_editing_node {
                        // Commit via command for undo support
                        self.commit_editing();
                    } else {
                        // Clicked on the node being edited — ignore (keep editing)
                        return Task::none();
                    }
                }

                let world = self.viewport.screen_to_world(geo::Point::new(pos.x, pos.y));

                // Check if clicking an attachment icon
                if let Some((node_id, idx)) = self.hit_test_attachment(world) {
                    if alt_held {
                        // Alt+click → remove attachment
                        return self.update(Message::RemoveAttachment(node_id, idx));
                    } else {
                        return self.update(Message::OpenAttachment(node_id, idx));
                    }
                }

                // Check if clicking a fold/unfold badge
                if let Some(node_id) = self.hit_test_fold_badge(world) {
                    if let Some(node) = self.document.get_node_mut(&node_id) {
                        node.collapsed = !node.collapsed;
                    }
                    self.compute_layout();
                    return Task::none();
                }

                if let Some(node_id) = self.spatial_index.hit_test(world) {
                    self.selected_boundary = None;
                    if shift_held {
                        // Shift-click → toggle selection (add/remove)
                        self.selection.toggle(node_id);
                        // If we just deselected, don't start drag/resize
                        if !self.selection.is_selected(&node_id) {
                            return Task::none();
                        }
                    } else if !self.selection.is_selected(&node_id) {
                        // Not shift, not already selected → single-select
                        self.selection.select(node_id);
                    }
                    // else: already selected without shift → keep multi-selection for drag/resize

                    // Check if click is near the outer edge → resize
                    // (left edge for left-side nodes, right edge for right-side nodes)
                    let resize_handle_width = 6.0; // world-space pixels
                    let is_left_side = self.is_left_of_root(&node_id);
                    let is_resize = self.positions.get(&node_id).map_or(false, |rect| {
                        if is_left_side {
                            (world.x - rect.x).abs() < resize_handle_width
                        } else {
                            (world.x - (rect.x + rect.width)).abs() < resize_handle_width
                        }
                    });

                    if is_resize {
                        let original_width = self.positions.get(&node_id)
                            .map_or(100.0, |r| r.width);
                        // Collect other selected nodes' widths for multi-resize
                        let other_nodes: Vec<(NodeId, f32)> = self.selection.nodes.iter()
                            .filter(|id| **id != node_id)
                            .filter_map(|id| {
                                self.positions.get(id).map(|r| (*id, r.width))
                            })
                            .collect();
                        self.interaction = InteractionState::ResizingNode {
                            node_id,
                            start_world_x: world.x,
                            original_width,
                            other_nodes,
                        };
                    } else {
                        self.interaction = InteractionState::DraggingNode {
                            node_id,
                            start_world_pos: world,
                            current_world_pos: world,
                        };
                        self.drag_started = false;
                        self.drop_target = None;
                    }
                } else {
                    // Check if clicking on a boundary border
                    if let Some(bid) = self.hit_test_boundary(world) {
                        self.selected_boundary = Some(bid);
                        self.selection.clear();
                    } else {
                        self.selection.clear();
                        self.selected_boundary = None;
                        // Start rubber band selection on empty space
                        self.interaction = InteractionState::RubberBandSelect {
                            start_world_pos: world,
                            current_world_pos: world,
                        };
                    }
                }
                self.canvas_cache.clear();
            }
            CanvasEvent::LeftRelease(_pos) => {
                if let InteractionState::DraggingNode { node_id, .. } = &self.interaction {
                    if self.drag_started {
                        if let Some(target) = self.drop_target.take() {
                            let node_id = *node_id;
                            self.execute_drop(node_id, target);
                        }
                    }
                }
                // Rubber band: select all nodes within the rectangle
                if let InteractionState::RubberBandSelect {
                    start_world_pos,
                    current_world_pos,
                } = &self.interaction
                {
                    let rect = geo::Rect::from_points(*start_world_pos, *current_world_pos);
                    self.selection.clear();
                    for (id, node_rect) in &self.positions {
                        if rect.intersects(node_rect) {
                            self.selection.add(*id);
                        }
                    }
                }
                self.interaction = InteractionState::Idle;
                self.drag_started = false;
                self.drop_target = None;
                self.canvas_cache.clear();
            }
            CanvasEvent::MiddlePress(pos) => {
                self.interaction = InteractionState::DraggingCanvas {
                    last_screen_pos: geo::Point::new(pos.x, pos.y),
                };
            }
            CanvasEvent::MiddleRelease => {
                self.interaction = InteractionState::Idle;
            }
            CanvasEvent::CursorMoved(pos) => {
                let world = self.viewport.screen_to_world(geo::Point::new(pos.x, pos.y));
                match self.interaction.clone() {
                    InteractionState::DraggingCanvas { last_screen_pos } => {
                        let delta = geo::Vector::new(
                            pos.x - last_screen_pos.x,
                            pos.y - last_screen_pos.y,
                        );
                        self.viewport.pan(delta);
                        self.interaction = InteractionState::DraggingCanvas {
                            last_screen_pos: geo::Point::new(pos.x, pos.y),
                        };
                        self.canvas_cache.clear();
                    }
                    InteractionState::DraggingNode {
                        node_id,
                        start_world_pos,
                        ..
                    } => {
                        // Check drag threshold
                        if !self.drag_started {
                            let dist = start_world_pos.distance_to(world);
                            if dist < DRAG_THRESHOLD {
                                return Task::none();
                            }
                            self.drag_started = true;
                        }

                        self.interaction = InteractionState::DraggingNode {
                            node_id,
                            start_world_pos,
                            current_world_pos: world,
                        };

                        // Compute drop target
                        self.drop_target = self.compute_drop_target(node_id, world);
                        self.canvas_cache.clear();
                    }
                    InteractionState::ResizingNode {
                        node_id,
                        start_world_x,
                        original_width,
                        ref other_nodes,
                    } => {
                        let delta = world.x - start_world_x;
                        // Resize the primary node
                        let is_left = self.is_left_of_root(&node_id);
                        let new_width = if is_left {
                            (original_width - delta).max(40.0)
                        } else {
                            (original_width + delta).max(40.0)
                        };
                        let width_delta = new_width - original_width;
                        if let Some(node) = self.document.get_node_mut(&node_id) {
                            node.manual_width = Some(new_width);
                        }
                        // Apply same width delta to all other selected nodes
                        let others = other_nodes.clone();
                        for (other_id, other_orig_width) in &others {
                            let other_new = (other_orig_width + width_delta).max(40.0);
                            if let Some(node) = self.document.get_node_mut(other_id) {
                                node.manual_width = Some(other_new);
                            }
                        }
                        self.compute_layout();
                    }
                    InteractionState::RubberBandSelect {
                        start_world_pos, ..
                    } => {
                        self.interaction = InteractionState::RubberBandSelect {
                            start_world_pos,
                            current_world_pos: world,
                        };
                        // Live-update selection as the rectangle changes
                        let rect = geo::Rect::from_points(start_world_pos, world);
                        self.selection.clear();
                        for (id, node_rect) in &self.positions {
                            if rect.intersects(node_rect) {
                                self.selection.add(*id);
                            }
                        }
                        self.canvas_cache.clear();
                    }
                    _ => {
                        // Update hover state for fold/unfold badges
                        // Include badge area in hover detection
                        let mut new_hover = self.spatial_index.hit_test(world);
                        if new_hover.is_none() {
                            // Check if cursor is over any badge
                            if let Some(badge_node) = self.hit_test_fold_badge(world) {
                                new_hover = Some(badge_node);
                            }
                        }
                        if new_hover != self.hover_node {
                            self.hover_node = new_hover;
                            self.canvas_cache.clear();
                        }
                        // Update boundary hover (only when not over a node)
                        let new_boundary_hover = if new_hover.is_some() {
                            None
                        } else {
                            self.hit_test_boundary(world)
                        };
                        if new_boundary_hover != self.hover_boundary {
                            self.hover_boundary = new_boundary_hover;
                            self.canvas_cache.clear();
                        }
                    }
                }
            }
            CanvasEvent::ScrollPan(dx, dy) => {
                self.viewport.pan(geo::Vector::new(dx, dy));
                self.canvas_cache.clear();
            }
            CanvasEvent::ScrollZoom(delta_y, pos) => {
                let factor = if delta_y > 0.0 { 1.1 } else { 1.0 / 1.1 };
                self.viewport
                    .zoom(factor, geo::Point::new(pos.x, pos.y));
                self.canvas_cache.clear();
            }
            CanvasEvent::DoubleClick(pos) => {
                let world = self.viewport.screen_to_world(geo::Point::new(pos.x, pos.y));
                if let Some(node_id) = self.spatial_index.hit_test(world) {
                    self.selection.select(node_id);
                    if let Some(node) = self.document.get_node(&node_id) {
                        self.editing_original_text = node.content.text.clone();
                        self.editing_content = text_editor::Content::with_text(&node.content.text);
                        self.editing_node = Some(node_id);
                        // Select all text
                        self.editing_content.perform(text_editor::Action::SelectAll);
                        self.interaction = InteractionState::EditingNodeText { node_id };
                    }
                    self.canvas_cache.clear();
                    return iced::widget::focus_next();
                }
                // Double-click on boundary → edit label
                if let Some(bid) = self.hit_test_boundary(world) {
                    self.selected_boundary = Some(bid);
                    return self.update(Message::EditBoundaryLabel(bid));
                }
            }
            CanvasEvent::RightPress(_pos) => {
                // Wait for release to show context menu
            }
            CanvasEvent::RightRelease(pos) => {
                let world = self.viewport.screen_to_world(geo::Point::new(pos.x, pos.y));
                if let Some(node_id) = self.spatial_index.hit_test(world) {
                    self.selection.select(node_id);
                    self.selected_boundary = None;
                    self.context_menu = Some(ContextMenuState {
                        screen_pos: (pos.x, pos.y),
                        target: ContextMenuTarget::Node(node_id),
                    });
                    self.canvas_cache.clear();
                } else if let Some(bid) = self.hit_test_boundary(world) {
                    self.selected_boundary = Some(bid);
                    self.selection.clear();
                    self.context_menu = Some(ContextMenuState {
                        screen_pos: (pos.x, pos.y),
                        target: ContextMenuTarget::Boundary(bid),
                    });
                    self.canvas_cache.clear();
                }
            }
        }
        Task::none()
    }

    /// Start editing a newly created node (no separate edit command needed).
    fn start_editing_new_node(&mut self, node_id: NodeId) {
        self.selection.select(node_id);
        self.editing_original_text.clear();
        self.editing_content = text_editor::Content::new();
        self.editing_node = Some(node_id);
        self.editing_is_new_node = true;
        self.interaction = InteractionState::EditingNodeText { node_id };
        self.canvas_cache.clear();
    }

    /// Commit the current text edit via command history for undo support.
    fn commit_editing(&mut self) {
        if let Some(node_id) = self.editing_node.take() {
            let mut new_text = self.editing_content.text();
            if new_text.ends_with('\n') {
                new_text.pop();
            }
            let old_text = std::mem::take(&mut self.editing_original_text);
            let is_new_node = self.editing_is_new_node;
            self.editing_is_new_node = false;

            if is_new_node {
                // Update the AddChild/AddSiblingCommand on the undo stack so redo
                // recreates the node with the final text.
                self.history.update_last_text(new_text.clone());
                if let Some(node) = self.document.get_node_mut(&node_id) {
                    node.content.text = new_text;
                }
            } else {
                // For existing nodes, restore original text then apply via command
                if let Some(node) = self.document.get_node_mut(&node_id) {
                    node.content.text = old_text.clone();
                }
                if new_text != old_text {
                    self.history.execute(
                        Box::new(EditTextCommand::new(node_id, new_text)),
                        &mut self.document,
                    );
                }
            }

            self.editing_content = text_editor::Content::new();
            self.interaction = InteractionState::Idle;
            self.compute_layout();
        }
    }

    /// Check if a node is positioned to the left of the root node.
    fn is_left_of_root(&self, node_id: &NodeId) -> bool {
        let root_center_x = self.document.root_id
            .and_then(|rid| self.positions.get(&rid))
            .map(|r| r.center().x)
            .unwrap_or(0.0);
        self.positions.get(node_id)
            .map(|r| r.center().x < root_center_x)
            .unwrap_or(false)
    }

    /// Compute the center of a node's fold/unfold badge in world space.
    fn fold_badge_center(&self, node_id: &NodeId) -> Option<geo::Point> {
        let rect = self.positions.get(node_id)?;
        let node = self.document.get_node(node_id)?;
        if node.children.is_empty() || node.is_root() {
            return None;
        }
        let badge_r = 8.0;
        let is_left = self.is_left_of_root(node_id);
        let badge_x = if is_left {
            rect.x - badge_r - 2.0
        } else {
            rect.x + rect.width + badge_r + 2.0
        };
        let badge_y = rect.y + rect.height / 2.0;
        Some(geo::Point::new(badge_x, badge_y))
    }

    /// Hit-test fold/unfold badges. Returns the node_id if a badge was clicked.
    fn hit_test_fold_badge(&self, world: geo::Point) -> Option<NodeId> {
        let badge_r = 10.0; // slightly larger hit area than visual
        for (id, _) in &self.positions {
            let Some(node) = self.document.get_node(id) else { continue };
            // Badge is visible when collapsed OR when hovered with children
            let visible = node.collapsed || (self.hover_node == Some(*id) && !node.children.is_empty());
            if !visible {
                continue;
            }
            if let Some(center) = self.fold_badge_center(id) {
                if world.distance_to(center) <= badge_r {
                    return Some(*id);
                }
            }
        }
        None
    }

    /// Compute clickable rects for each attachment icon of a node (inside the side column).
    fn attachment_icon_rects(&self, node_id: &NodeId) -> Vec<(usize, Rect)> {
        let Some(bounds) = self.positions.get(node_id) else {
            return Vec::new();
        };
        let Some(node) = self.document.get_node(node_id) else {
            return Vec::new();
        };
        if node.content.attachments.is_empty() {
            return Vec::new();
        }

        let icon_size = 14.0_f32;
        let icon_spacing = 4.0_f32;
        let count = node.content.attachments.len();
        let is_left = self.is_left_of_root(node_id);
        let total_height = count as f32 * icon_size + (count.saturating_sub(1)) as f32 * icon_spacing;
        let start_y = bounds.y + (bounds.height - total_height) / 2.0;
        // Match the padding_h used in rendering so icon aligns with text edge spacing
        let depth = self.document.depth_of(node_id);
        let default_style = self.document.default_styles.for_depth(depth);
        let resolved = node.style.merged_with(default_style);
        let padding_h = resolved.padding_h.unwrap_or(12.0);
        let icon_x = if is_left {
            bounds.x + padding_h - icon_size / 2.0
        } else {
            bounds.x + bounds.width - padding_h - icon_size / 2.0
        };

        (0..count)
            .map(|i| {
                let y = start_y + i as f32 * (icon_size + icon_spacing);
                (i, Rect::new(icon_x, y, icon_size, icon_size))
            })
            .collect()
    }

    /// Hit-test attachment icons. Returns (node_id, attachment_index) if an icon was clicked.
    fn hit_test_attachment(&self, world: geo::Point) -> Option<(NodeId, usize)> {
        for (id, _) in &self.positions {
            for (idx, rect) in self.attachment_icon_rects(id) {
                if rect.contains(world) {
                    return Some((*id, idx));
                }
            }
        }
        None
    }

    /// Hit-test boundaries: check if a world point is anywhere inside a boundary rect.
    fn hit_test_boundary(&self, world: geo::Point) -> Option<BoundaryId> {
        for (bid, boundary) in &self.document.boundaries {
            if let Some(rect) = yamind_canvas::boundary_renderer::compute_boundary_rect(boundary, &self.positions) {
                if rect.contains(world) {
                    return Some(*bid);
                }
            }
        }
        None
    }

    /// Open an attachment using the system default handler.
    fn open_attachment(&self, node_id: &NodeId, idx: usize) {
        let Some(node) = self.document.get_node(node_id) else { return };
        let Some(attachment) = node.content.attachments.get(idx) else { return };
        use yamind_core::node::AttachmentKind;
        match &attachment.kind {
            AttachmentKind::Url(url) => {
                let _ = open::that(url);
            }
            AttachmentKind::Document(path) | AttachmentKind::Photo(path) => {
                let resolved = self.resolve_attachment_path(path);
                let _ = open::that(&resolved);
            }
        }
    }

    /// Resolve a potentially relative attachment path using the file's directory as base.
    fn resolve_attachment_path(&self, path: &str) -> String {
        let p = std::path::Path::new(path);
        if p.is_absolute() {
            return path.to_string();
        }
        if let Some(ref file_path) = self.file_path {
            if let Some(dir) = file_path.parent() {
                return dir.join(p).to_string_lossy().into_owned();
            }
        }
        path.to_string()
    }

    /// Make a path relative to the file's directory if possible.
    fn make_relative_path(&self, path: &std::path::Path) -> String {
        if let Some(ref file_path) = self.file_path {
            if let Some(dir) = file_path.parent() {
                if let Ok(rel) = path.strip_prefix(dir) {
                    return rel.to_string_lossy().into_owned();
                }
            }
        }
        path.to_string_lossy().into_owned()
    }

    /// Determine where a dragged node should be dropped based on cursor position.
    ///
    /// - Cursor above/below a node → reorder as sibling (bezier to parent)
    /// - Cursor left/right of a node → reparent as child (bezier to that node)
    fn compute_drop_target(&self, dragged_id: NodeId, cursor: geo::Point) -> Option<DropTarget> {
        // Find the nearest node (excluding dragged node and its descendants)
        let mut best: Option<(NodeId, f32)> = None;
        for (id, rect) in &self.positions {
            if *id == dragged_id || self.document.is_ancestor_of(dragged_id, *id) {
                continue;
            }
            let center = rect.center();
            let dist = cursor.distance_to(center);
            if best.map_or(true, |(_, d)| dist < d) {
                best = Some((*id, dist));
            }
        }

        let (nearest_id, _) = best?;
        let nearest_rect = self.positions.get(&nearest_id)?;
        let nearest_node = self.document.get_node(&nearest_id)?;
        let center = nearest_rect.center();

        // Direction from the nearest node's center to the cursor
        let dx = (cursor.x - center.x).abs();
        let dy = (cursor.y - center.y).abs();

        // If cursor is more horizontal than vertical relative to the node → reparent as child
        // If cursor is more vertical → reorder as sibling
        let is_horizontal = dx > dy;

        if is_horizontal {
            // Left/right of a node → become child of that node
            Some(DropTarget::OnNode { parent: nearest_id })
        } else {
            // Above/below a node → reorder as sibling of that node
            if let Some(parent_id) = nearest_node.parent {
                let parent = self.document.get_node(&parent_id)?;
                let idx = parent
                    .children
                    .iter()
                    .position(|c| *c == nearest_id)
                    .unwrap_or(0);

                if cursor.y < center.y {
                    // Above → insert before
                    Some(DropTarget::BeforeSibling {
                        parent: parent_id,
                        index: idx,
                    })
                } else {
                    // Below → insert after
                    Some(DropTarget::BeforeSibling {
                        parent: parent_id,
                        index: idx + 1,
                    })
                }
            } else {
                // Nearest is root, can't reorder root — reparent as child instead
                Some(DropTarget::OnNode { parent: nearest_id })
            }
        }
    }

    /// Execute the drop operation as an undoable command.
    fn execute_drop(&mut self, node_id: NodeId, target: DropTarget) {
        // Don't allow moving the root
        if self
            .document
            .get_node(&node_id)
            .map_or(true, |n| n.is_root())
        {
            return;
        }

        let (new_parent_id, new_index) = match target {
            DropTarget::OnNode { parent } => {
                // Append as last child
                let child_count = self
                    .document
                    .get_node(&parent)
                    .map_or(0, |n| n.children.len());
                (parent, child_count)
            }
            DropTarget::BeforeSibling { parent, index } => (parent, index),
        };

        // Check it's actually a change
        if let Some(node) = self.document.get_node(&node_id) {
            if let Some(current_parent) = node.parent {
                if current_parent == new_parent_id {
                    if let Some(parent) = self.document.get_node(&current_parent) {
                        if let Some(current_idx) =
                            parent.children.iter().position(|c| *c == node_id)
                        {
                            // Same position — no-op
                            if current_idx == new_index
                                || (new_index > 0 && current_idx == new_index - 1)
                            {
                                return;
                            }
                        }
                    }
                }
            }
        }

        self.history.execute(
            Box::new(MoveNodeCommand::new(node_id, new_parent_id, new_index)),
            &mut self.document,
        );
        self.compute_layout();
    }

    fn build_view_state(&self) -> yamind_file::ViewState {
        eprintln!(
            "[DEBUG save] screen_size={:?} window_position={:?} viewport=({:?}, scale={})",
            self.screen_size,
            self.window_position,
            self.viewport.transform.translation,
            self.viewport.transform.scale,
        );
        yamind_file::ViewState {
            translation: (
                self.viewport.transform.translation.x,
                self.viewport.transform.translation.y,
            ),
            scale: self.viewport.transform.scale,
            window_size: self.screen_size,
            window_position: self.window_position,
        }
    }

    fn save_to_current_path(&self) {
        if let Some(path) = &self.file_path {
            let file = yamind_file::YaMindFile::with_view_state(
                self.document.clone(),
                self.build_view_state(),
            );
            match file.to_json() {
                Ok(json) => {
                    if let Err(e) = std::fs::write(path, &json) {
                        log::error!("Failed to save file: {}", e);
                    }
                }
                Err(e) => log::error!("Failed to serialize document: {}", e),
            }
        }
    }

    fn save_as(&mut self) {
        let dialog = rfd::FileDialog::new()
            .set_title("Save Mind Map")
            .add_filter("YaMindMap", &["yamind"])
            .set_file_name("Untitled.yamind");

        if let Some(path) = dialog.save_file() {
            self.file_path = Some(path);
            self.save_to_current_path();
        }
    }

    fn open_file(&mut self) -> Task<Message> {
        let dialog = rfd::FileDialog::new()
            .set_title("Open Mind Map")
            .add_filter("YaMindMap", &["yamind"]);

        if let Some(path) = dialog.pick_file() {
            return self.load_file(&path);
        }
        Task::none()
    }

    fn apply_pending_window_restore(&mut self) -> Task<Message> {
        let Some(wid) = self.window_id else {
            return Task::none();
        };
        let Some(vs) = self.pending_window_restore.take() else {
            return Task::none();
        };
        eprintln!(
            "[DEBUG] Applying pending window restore: size=({}, {}), pos={:?}",
            vs.window_size.0, vs.window_size.1, vs.window_position
        );
        let mut tasks = vec![window::resize(
            wid,
            iced::Size::new(vs.window_size.0, vs.window_size.1),
        )];
        if let Some((x, y)) = vs.window_position {
            tasks.push(window::move_to(wid, Point::new(x, y)));
        }
        Task::batch(tasks)
    }

    fn load_file(&mut self, path: &std::path::Path) -> Task<Message> {
        match std::fs::read_to_string(path) {
            Ok(json) => match yamind_file::YaMindFile::from_json(&json) {
                Ok(file) => {
                    self.document = file.document;
                    self.selection.clear();
                    self.history = CommandHistory::new();
                    self.file_path = Some(path.to_path_buf());
                    self.compute_layout();
                    if let Some(vs) = file.view_state {
                        self.viewport.transform.translation =
                            geo::Vector::new(vs.translation.0, vs.translation.1);
                        self.viewport.transform.scale = vs.scale;
                        self.canvas_cache.clear();
                        // Store for deferred application (window_id might not be ready yet)
                        self.pending_window_restore = Some(vs);
                        return self.apply_pending_window_restore();
                    } else {
                        self.zoom_to_fit();
                    }
                }
                Err(e) => log::error!("Failed to parse file {}: {}", path.display(), e),
            },
            Err(e) => log::error!("Failed to read file {}: {}", path.display(), e),
        }
        Task::none()
    }

    pub fn view(&self) -> Element<'_, Message> {
        let drag_ghost = if self.drag_started {
            if let InteractionState::DraggingNode {
                node_id,
                start_world_pos,
                current_world_pos,
            } = &self.interaction
            {
                Some(DragGhostInfo {
                    node_id: *node_id,
                    world_pos: *current_world_pos,
                    start_world_pos: *start_world_pos,
                })
            } else {
                None
            }
        } else {
            None
        };

        let editing_node_id = self.editing_node;

        let rubber_band = if let InteractionState::RubberBandSelect {
            start_world_pos,
            current_world_pos,
        } = &self.interaction
        {
            Some((*start_world_pos, *current_world_pos))
        } else {
            None
        };

        let canvas = Canvas::new(MindMapProgram {
            viewport: &self.viewport,
            document: &self.document,
            selection: &self.selection,
            positions: &self.positions,
            edge_routes: &self.edge_routes,
            cache: &self.canvas_cache,
            drop_target: &self.drop_target,
            drag_ghost,
            rubber_band,
            editing_node_id,
            hover_node_id: self.hover_node,
            selected_boundary: self.selected_boundary,
            hover_boundary: self.hover_boundary,
        })
        .width(Length::Fill)
        .height(Length::Fill);

        // If editing, overlay a TextEditor widget at the node's screen position
        if let Some(node_id) = self.editing_node {
            if let Some(world_rect) = self.positions.get(&node_id) {
                let scale = self.viewport.scale();
                let t = &self.viewport.transform;

                // Get node style info
                let depth = self.document.depth_of(&node_id);
                let default_style = self.document.default_styles.for_depth(depth);
                let node = self.document.get_node(&node_id);
                let resolved = node
                    .map(|n| n.style.merged_with(default_style))
                    .unwrap_or_else(|| default_style.clone());
                let shape = resolved.shape.unwrap_or(yamind_core::style::NodeShape::RoundedRect);

                // For ellipse/diamond, the text area is the inscribed rectangle
                let (text_x, text_y, text_w, text_h) = match shape {
                    yamind_core::style::NodeShape::Ellipse
                    | yamind_core::style::NodeShape::Diamond => {
                        let factor = 1.0 / 1.42; // inverse of the 1.42 expansion
                        let tw = world_rect.width * factor;
                        let th = world_rect.height * factor;
                        let tx = world_rect.x + (world_rect.width - tw) / 2.0;
                        let ty = world_rect.y + (world_rect.height - th) / 2.0;
                        (tx, ty, tw, th)
                    }
                    _ => (world_rect.x, world_rect.y, world_rect.width, world_rect.height),
                };

                // Convert to screen space
                let screen_x = (text_x + t.translation.x) * scale;
                let screen_y = (text_y + t.translation.y) * scale;
                let screen_w = text_w * scale;
                let _screen_h = text_h * scale;

                let font_size = resolved.font_size.unwrap_or(14.0) * scale;
                let padding_h = resolved.padding_h.unwrap_or(12.0) * scale;
                let padding_v = resolved.padding_v.unwrap_or(8.0) * scale;

                let editor = text_editor(&self.editing_content)
                    .size(font_size)
                    .padding(iced::Padding::from([padding_v, padding_h]))
                    .width(screen_w)
                    .height(Length::Shrink)
                    .on_action(|action| Message::TextEditorAction(action))
                    .key_binding(|key_press| {
                        let text_editor::KeyPress { key, modifiers, .. } = &key_press;
                        match key.as_ref() {
                            keyboard::Key::Named(keyboard::key::Named::Enter) => {
                                if modifiers.shift() {
                                    // Shift+Enter → newline
                                    Some(text_editor::Binding::Enter)
                                } else {
                                    // Enter → commit
                                    Some(text_editor::Binding::Custom(Message::CommitEditing))
                                }
                            }
                            keyboard::Key::Named(keyboard::key::Named::Escape) => {
                                Some(text_editor::Binding::Custom(Message::CancelEditing))
                            }
                            _ => text_editor::Binding::from_key_press(key_press),
                        }
                    })
                    .style(|theme, status| {
                        let mut style = text_editor::default(theme, status);
                        style.background = iced::Background::Color(iced::Color::from_rgba(0.15, 0.15, 0.2, 0.95));
                        style.border = iced::Border {
                            color: iced::Color::from_rgb(1.0, 0.8, 0.0),
                            width: 2.0,
                            radius: 4.0.into(),
                        };
                        style.value = iced::Color::WHITE;
                        style.selection = iced::Color::from_rgba(0.3, 0.5, 0.9, 0.5);
                        style
                    });

                // Position the editor using padding as offset
                let pad_left = screen_x.max(0.0);
                let pad_top = screen_y.max(0.0);

                let clipped_editor = container(editor).clip(true);
                let positioned_editor = container(clipped_editor)
                    .padding(iced::padding::top(pad_top).left(pad_left))
                    .width(Length::Fill)
                    .height(Length::Fill);

                let base = stack![canvas, positioned_editor]
                    .width(Length::Fill)
                    .height(Length::Fill);
                let with_delete = self.maybe_with_delete_dialog(base.into());
                let with_url = self.maybe_with_url_input(with_delete);
                let with_boundary = self.maybe_with_boundary_label_input(with_url);
                return self.maybe_with_context_menu(with_boundary);
            }
        }

        let base = container(canvas)
            .width(Length::Fill)
            .height(Length::Fill);
        let with_delete = self.maybe_with_delete_dialog(base.into());
        let with_url = self.maybe_with_url_input(with_delete);
        let with_boundary = self.maybe_with_boundary_label_input(with_url);
        self.maybe_with_context_menu(with_boundary)
    }

    fn maybe_with_delete_dialog<'a>(&'a self, base: Element<'a, Message>) -> Element<'a, Message> {
        let Some(node_id) = self.pending_delete else {
            return base;
        };

        let node_name = self.document.get_node(&node_id)
            .map(|n| n.content.text.clone())
            .unwrap_or_default();
        let child_count = self.document.get_node(&node_id)
            .map(|n| n.children.len())
            .unwrap_or(0);

        let title = text(format!("Delete \"{}\"?", node_name))
            .size(16);
        let subtitle = text(format!(
            "This node has {} child{}.",
            child_count,
            if child_count == 1 { "" } else { "ren" }
        ))
        .size(13);

        let btn_style = |color: iced::Color| {
            move |_theme: &iced::Theme, _status: button::Status| {
                button::Style {
                    background: Some(iced::Background::Color(color)),
                    text_color: iced::Color::WHITE,
                    border: iced::Border {
                        radius: 6.0.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                }
            }
        };

        let delete_all_btn = button(text("Delete All").size(13))
            .on_press(Message::DeleteWithChildren(node_id))
            .padding([6, 16])
            .style(btn_style(iced::Color::from_rgb(0.8, 0.2, 0.2)));

        let keep_children_btn = button(text("Keep Children").size(13))
            .on_press(Message::DeleteKeepChildren(node_id))
            .padding([6, 16])
            .style(btn_style(iced::Color::from_rgb(0.3, 0.5, 0.8)));

        let cancel_btn = button(text("Cancel").size(13))
            .on_press(Message::CancelDelete)
            .padding([6, 16])
            .style(btn_style(iced::Color::from_rgb(0.4, 0.4, 0.4)));

        let dialog = container(
            column![
                title,
                subtitle,
                row![delete_all_btn, keep_children_btn, cancel_btn].spacing(8)
            ]
            .spacing(12)
            .align_x(iced::Alignment::Center),
        )
        .padding(20)
        .style(|_theme| container::Style {
            background: Some(iced::Background::Color(iced::Color::from_rgba(0.12, 0.12, 0.16, 0.97))),
            border: iced::Border {
                color: iced::Color::from_rgb(0.3, 0.3, 0.4),
                width: 1.0,
                radius: 12.0.into(),
            },
            ..Default::default()
        });

        let centered_dialog = container(dialog)
            .width(Length::Fill)
            .height(Length::Fill)
            .center_x(Length::Fill)
            .center_y(Length::Fill);

        // Semi-transparent backdrop
        let backdrop = container(
            button(container("").width(Length::Fill).height(Length::Fill))
                .on_press(Message::CancelDelete)
                .width(Length::Fill)
                .height(Length::Fill)
                .style(|_theme, _status| button::Style {
                    background: Some(iced::Background::Color(iced::Color::from_rgba(0.0, 0.0, 0.0, 0.5))),
                    ..Default::default()
                }),
        )
        .width(Length::Fill)
        .height(Length::Fill);

        stack![base, backdrop, centered_dialog]
            .width(Length::Fill)
            .height(Length::Fill)
            .into()
    }

    fn maybe_with_url_input<'a>(&'a self, base: Element<'a, Message>) -> Element<'a, Message> {
        let Some(ref url_state) = self.pending_url_input else {
            return base;
        };

        let url_text = url_state.url.clone();
        let auto_fill = url_state.auto_fill_title;

        let title = text("Insert Web Link").size(18);

        let input = iced::widget::text_input("https://example.com", &url_text)
            .on_input(Message::UrlInputChanged)
            .on_submit(Message::FetchTitle)
            .size(14)
            .padding(10)
            .width(Length::Fill);

        let btn_style = |color: iced::Color| {
            move |_theme: &iced::Theme, status: button::Status| {
                let bg = match status {
                    button::Status::Hovered => {
                        let mut c = color;
                        c.a = 0.9;
                        c
                    }
                    _ => color,
                };
                button::Style {
                    background: Some(iced::Background::Color(bg)),
                    text_color: iced::Color::WHITE,
                    border: iced::Border {
                        radius: 6.0.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                }
            }
        };

        // Title preview area
        let preview: Element<'a, Message> = if let Some(ref fetched) = url_state.fetched_title {
            container(
                text(fetched.as_str()).size(14),
            )
            .padding(14)
            .width(Length::Fill)
            .style(|_theme| container::Style {
                background: Some(iced::Background::Color(iced::Color::from_rgba(0.18, 0.18, 0.22, 1.0))),
                border: iced::Border {
                    radius: 6.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            })
            .into()
        } else if !url_text.is_empty() {
            // Show a "Fetch Title" button
            container(
                button(text("Fetch Page Title").size(13))
                    .on_press(Message::FetchTitle)
                    .padding([8, 16])
                    .style(btn_style(iced::Color::from_rgb(0.3, 0.4, 0.55))),
            )
            .padding(8)
            .width(Length::Fill)
            .center_x(Length::Fill)
            .style(|_theme| container::Style {
                background: Some(iced::Background::Color(iced::Color::from_rgba(0.18, 0.18, 0.22, 1.0))),
                border: iced::Border {
                    radius: 6.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            })
            .into()
        } else {
            container("").height(0).into()
        };

        // Auto fill toggle
        let auto_fill_label = if auto_fill { "Auto fill:  Webpage Title" } else { "Auto fill:  None" };
        let auto_fill_toggle = button(text(auto_fill_label).size(12))
            .on_press(Message::ToggleAutoFillTitle)
            .padding([4, 8])
            .style(|_theme, _status| button::Style {
                background: Some(iced::Background::Color(iced::Color::TRANSPARENT)),
                text_color: iced::Color::from_rgb(0.6, 0.6, 0.7),
                border: iced::Border::default(),
                ..Default::default()
            });

        // Bottom button row: Remove on left, Cancel + Insert on right
        let remove_btn = button(text("Remove").size(13))
            .on_press(Message::CancelUrlAttachment)
            .padding([8, 20])
            .style(btn_style(iced::Color::from_rgb(0.35, 0.35, 0.4)));

        let cancel_btn = button(text("Cancel").size(13))
            .on_press(Message::CancelUrlAttachment)
            .padding([8, 20])
            .style(btn_style(iced::Color::from_rgb(0.35, 0.35, 0.4)));

        let insert_btn = button(text("Insert").size(13))
            .on_press(Message::SubmitUrlAttachment)
            .padding([8, 20])
            .style(btn_style(iced::Color::from_rgb(0.3, 0.5, 0.85)));

        let dialog = container(
            column![
                title,
                input,
                preview,
                auto_fill_toggle,
                row![
                    remove_btn,
                    iced::widget::horizontal_space(),
                    cancel_btn,
                    insert_btn,
                ].spacing(8)
            ]
            .spacing(12)
            .width(420.0),
        )
        .padding(24)
        .style(|_theme| container::Style {
            background: Some(iced::Background::Color(iced::Color::from_rgba(0.12, 0.12, 0.16, 0.97))),
            border: iced::Border {
                color: iced::Color::from_rgb(0.3, 0.3, 0.4),
                width: 1.0,
                radius: 12.0.into(),
            },
            ..Default::default()
        });

        let centered_dialog = container(dialog)
            .width(Length::Fill)
            .height(Length::Fill)
            .center_x(Length::Fill)
            .center_y(Length::Fill);

        let backdrop = container(
            button(container("").width(Length::Fill).height(Length::Fill))
                .on_press(Message::CancelUrlAttachment)
                .width(Length::Fill)
                .height(Length::Fill)
                .style(|_theme, _status| button::Style {
                    background: Some(iced::Background::Color(iced::Color::from_rgba(0.0, 0.0, 0.0, 0.5))),
                    ..Default::default()
                }),
        )
        .width(Length::Fill)
        .height(Length::Fill);

        stack![base, backdrop, centered_dialog]
            .width(Length::Fill)
            .height(Length::Fill)
            .into()
    }

    fn maybe_with_boundary_label_input<'a>(&'a self, base: Element<'a, Message>) -> Element<'a, Message> {
        let Some(ref edit_state) = self.editing_boundary else {
            return base;
        };

        let title = text("Boundary Label").size(16).color(iced::Color::WHITE);

        let input = iced::widget::text_input("Enter label…", &edit_state.label)
            .on_input(Message::BoundaryLabelChanged)
            .on_submit(Message::CommitBoundaryLabel)
            .size(14)
            .padding([8, 12])
            .width(300.0);

        let ok_btn = button(text("OK").size(13))
            .on_press(Message::CommitBoundaryLabel)
            .padding([6, 16])
            .style(|_theme, _status| button::Style {
                background: Some(iced::Background::Color(iced::Color::from_rgb(0.3, 0.5, 0.9))),
                text_color: iced::Color::WHITE,
                border: iced::Border {
                    radius: 4.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            });

        let cancel_btn = button(text("Cancel").size(13))
            .on_press(Message::CancelBoundaryLabel)
            .padding([6, 16])
            .style(|_theme, _status| button::Style {
                background: Some(iced::Background::Color(iced::Color::from_rgba(1.0, 1.0, 1.0, 0.1))),
                text_color: iced::Color::WHITE,
                border: iced::Border {
                    color: iced::Color::from_rgba(1.0, 1.0, 1.0, 0.2),
                    width: 1.0,
                    radius: 4.0.into(),
                },
                ..Default::default()
            });

        let buttons_row = row![cancel_btn, ok_btn].spacing(8);

        let dialog = container(
            column![title, input, buttons_row]
                .spacing(12)
                .align_x(iced::Alignment::Center),
        )
        .padding(20)
        .width(340.0)
        .style(|_theme| container::Style {
            background: Some(iced::Background::Color(iced::Color::from_rgba(0.14, 0.14, 0.18, 0.97))),
            border: iced::Border {
                color: iced::Color::from_rgb(0.3, 0.3, 0.4),
                width: 1.0,
                radius: 12.0.into(),
            },
            ..Default::default()
        });

        let centered = container(dialog)
            .width(Length::Fill)
            .height(Length::Fill)
            .center_x(Length::Fill)
            .center_y(Length::Fill);

        let backdrop = container(
            button(container("").width(Length::Fill).height(Length::Fill))
                .on_press(Message::CancelBoundaryLabel)
                .width(Length::Fill)
                .height(Length::Fill)
                .style(|_theme, _status| button::Style {
                    background: Some(iced::Background::Color(iced::Color::from_rgba(0.0, 0.0, 0.0, 0.4))),
                    ..Default::default()
                }),
        )
        .width(Length::Fill)
        .height(Length::Fill);

        stack![base, backdrop, centered]
            .width(Length::Fill)
            .height(Length::Fill)
            .into()
    }

    fn maybe_with_context_menu<'a>(&'a self, base: Element<'a, Message>) -> Element<'a, Message> {
        let Some(ref cm) = self.context_menu else {
            return base;
        };

        let menu_item = |label: &'a str, action: ContextAction| -> Element<'a, Message> {
            button(text(label).size(13))
                .on_press(Message::ContextMenuAction(action))
                .width(Length::Fill)
                .padding([6, 14])
                .style(|_theme, status| {
                    let bg = match status {
                        button::Status::Hovered => iced::Color::from_rgba(0.3, 0.5, 0.9, 0.3),
                        _ => iced::Color::TRANSPARENT,
                    };
                    button::Style {
                        background: Some(iced::Background::Color(bg)),
                        text_color: iced::Color::WHITE,
                        border: iced::Border::default(),
                        ..Default::default()
                    }
                })
                .into()
        };

        let delete_item = |label: &'a str, action: ContextAction| -> Element<'a, Message> {
            button(text(label).size(13))
                .on_press(Message::ContextMenuAction(action))
                .width(Length::Fill)
                .padding([6, 14])
                .style(|_theme, status| {
                    let bg = match status {
                        button::Status::Hovered => iced::Color::from_rgba(0.8, 0.2, 0.2, 0.4),
                        _ => iced::Color::TRANSPARENT,
                    };
                    button::Style {
                        background: Some(iced::Background::Color(bg)),
                        text_color: iced::Color::from_rgb(1.0, 0.4, 0.4),
                        border: iced::Border::default(),
                        ..Default::default()
                    }
                })
                .into()
        };

        let sep = || -> Element<'a, Message> {
            container("")
                .width(Length::Fill)
                .height(1)
                .style(|_theme| container::Style {
                    background: Some(iced::Background::Color(iced::Color::from_rgba(1.0, 1.0, 1.0, 0.12))),
                    ..Default::default()
                })
                .into()
        };

        let mut items: Vec<Element<'_, Message>> = Vec::new();

        match &cm.target {
            ContextMenuTarget::Node(node_id) => {
                let node = self.document.get_node(node_id);
                let is_root = node.map_or(false, |n| n.is_root());
                let has_children = node.map_or(false, |n| !n.children.is_empty());
                let is_collapsed = node.map_or(false, |n| n.collapsed);

                items.push(menu_item("Add Child", ContextAction::AddChild));
                if !is_root {
                    items.push(menu_item("Add Sibling", ContextAction::AddSibling));
                }
                items.push(sep());
                items.push(menu_item("Insert Web Link…", ContextAction::AddUrl));
                items.push(menu_item("Attach Document…", ContextAction::AddDocument));
                items.push(menu_item("Attach Photo…", ContextAction::AddPhoto));
                items.push(sep());
                items.push(menu_item("Edit", ContextAction::EditNode));
                items.push(menu_item("Add Boundary", ContextAction::AddBoundary));
                if has_children {
                    let fold_label = if is_collapsed { "Expand" } else { "Collapse" };
                    items.push(menu_item(fold_label, ContextAction::ToggleFold));
                }
                if !is_root {
                    items.push(sep());
                    items.push(delete_item("Delete", ContextAction::Delete));
                }
            }
            ContextMenuTarget::Boundary(_bid) => {
                items.push(menu_item("Edit Label", ContextAction::EditBoundaryLabel));
                items.push(sep());
                items.push(delete_item("Delete", ContextAction::DeleteBoundary));
            }
        }

        let menu_col = iced::widget::Column::with_children(items)
            .spacing(1)
            .width(180.0);

        let menu = container(menu_col)
            .padding([6, 0])
            .style(|_theme| container::Style {
                background: Some(iced::Background::Color(iced::Color::from_rgba(0.14, 0.14, 0.18, 0.97))),
                border: iced::Border {
                    color: iced::Color::from_rgb(0.3, 0.3, 0.4),
                    width: 1.0,
                    radius: 8.0.into(),
                },
                ..Default::default()
            });

        // Position the menu at the click location, clamped to screen
        let menu_x = cm.screen_pos.0.min(self.screen_size.0 - 200.0).max(0.0);
        let menu_y = cm.screen_pos.1.min(self.screen_size.1 - 300.0).max(0.0);

        let positioned_menu = container(menu)
            .padding(iced::padding::top(menu_y).left(menu_x))
            .width(Length::Fill)
            .height(Length::Fill);

        // Transparent backdrop to dismiss on click outside
        let backdrop = container(
            button(container("").width(Length::Fill).height(Length::Fill))
                .on_press(Message::DismissContextMenu)
                .width(Length::Fill)
                .height(Length::Fill)
                .style(|_theme, _status| button::Style {
                    background: Some(iced::Background::Color(iced::Color::TRANSPARENT)),
                    ..Default::default()
                }),
        )
        .width(Length::Fill)
        .height(Length::Fill);

        stack![base, backdrop, positioned_menu]
            .width(Length::Fill)
            .height(Length::Fill)
            .into()
    }

    pub fn subscription(&self) -> Subscription<Message> {
        let keyboard_sub = event::listen_with(Self::handle_normal_event);

        // Poll for native menu events every 50ms
        let menu_sub = time::every(std::time::Duration::from_millis(50))
            .map(|_| Message::MenuTick);

        Subscription::batch([keyboard_sub, menu_sub])
    }

    fn handle_normal_event(event: Event, status: event::Status, id: window::Id) -> Option<Message> {
        match event {
            Event::Keyboard(keyboard::Event::KeyPressed {
                key,
                modifiers,
                ..
            }) => {
                // Don't fire shortcuts when a widget (e.g. TextEditor) captured the event
                if status == event::Status::Captured {
                    return None;
                }
                shortcuts::handle_key(key, modifiers)
            }
            Event::Window(window::Event::Opened { position, .. }) => {
                position.map(|pos| Message::WindowOpened(id, pos))
            }
            Event::Window(window::Event::Resized(size)) => {
                Some(Message::WindowResized(id, size))
            }
            Event::Window(window::Event::Moved(pos)) => {
                Some(Message::WindowMoved(pos))
            }
            _ => None,
        }
    }

}

/// Info about an active node drag, passed to the canvas for rendering.
#[derive(Debug, Clone)]
struct DragGhostInfo {
    node_id: NodeId,
    /// Current cursor position in world space.
    world_pos: geo::Point,
    /// Drag start position in world space.
    start_world_pos: geo::Point,
}

/// Canvas program that renders the mind map.
struct MindMapProgram<'a> {
    viewport: &'a Viewport,
    document: &'a Document,
    selection: &'a Selection,
    positions: &'a HashMap<NodeId, Rect>,
    edge_routes: &'a HashMap<(NodeId, NodeId), yamind_core::edge::BezierRoute>,
    cache: &'a canvas::Cache,
    drop_target: &'a Option<DropTarget>,
    drag_ghost: Option<DragGhostInfo>,
    #[allow(dead_code)]
    editing_node_id: Option<NodeId>,
    hover_node_id: Option<NodeId>,
    rubber_band: Option<(geo::Point, geo::Point)>,
    selected_boundary: Option<BoundaryId>,
    hover_boundary: Option<BoundaryId>,
}

impl<'a> canvas::Program<Message> for MindMapProgram<'a> {
    type State = CanvasInteractionState;

    fn update(
        &self,
        state: &mut Self::State,
        event: canvas::Event,
        bounds: iced::Rectangle,
        cursor: mouse::Cursor,
    ) -> (canvas::event::Status, Option<Message>) {
        let Some(cursor_pos) = cursor.position_in(bounds) else {
            return (canvas::event::Status::Ignored, None);
        };

        match event {
            canvas::Event::Mouse(mouse_event) => match mouse_event {
                mouse::Event::ButtonPressed(mouse::Button::Left) => {
                    if state.last_click_time.elapsed() < std::time::Duration::from_millis(400)
                        && state
                            .last_click_pos
                            .map_or(false, |p| {
                                (p.x - cursor_pos.x).abs() < 5.0
                                    && (p.y - cursor_pos.y).abs() < 5.0
                            })
                    {
                        // Double click
                        state.last_click_time = std::time::Instant::now();
                        state.last_click_pos = Some(cursor_pos);
                        return (
                            canvas::event::Status::Captured,
                            Some(Message::CanvasEvent(CanvasEvent::DoubleClick(cursor_pos))),
                        );
                    }
                    state.last_click_time = std::time::Instant::now();
                    state.last_click_pos = Some(cursor_pos);
                    // Check if clicking near a node's right edge → resize
                    let world = self.viewport.screen_to_world(
                        geo::Point::new(cursor_pos.x, cursor_pos.y),
                    );
                    let resize_handle_width = 6.0;
                    let root_center_x = self.document.root_id
                        .and_then(|rid| self.positions.get(&rid))
                        .map(|r| r.center().x)
                        .unwrap_or(0.0);
                    let hit_node = self.positions.values().any(|rect| rect.contains(world));
                    let is_resize = self.positions.iter().any(|(id, rect)| {
                        if !rect.contains(world) || self.document.root_id == Some(*id) {
                            return false;
                        }
                        let is_left = rect.center().x < root_center_x;
                        if is_left {
                            (world.x - rect.x).abs() < resize_handle_width
                        } else {
                            (world.x - (rect.x + rect.width)).abs() < resize_handle_width
                        }
                    });
                    if is_resize {
                        state.resizing = true;
                    } else if hit_node {
                        state.dragging = true;
                    } else {
                        state.rubber_banding = true;
                    }
                    (
                        canvas::event::Status::Captured,
                        Some(Message::CanvasEvent(CanvasEvent::LeftPress(cursor_pos, state.shift_held, state.alt_held))),
                    )
                }
                mouse::Event::ButtonReleased(mouse::Button::Left) => {
                    state.dragging = false;
                    state.resizing = false;
                    state.rubber_banding = false;
                    (
                        canvas::event::Status::Captured,
                        Some(Message::CanvasEvent(CanvasEvent::LeftRelease(cursor_pos))),
                    )
                }
                mouse::Event::ButtonPressed(mouse::Button::Middle) => {
                    state.panning = true;
                    (
                        canvas::event::Status::Captured,
                        Some(Message::CanvasEvent(CanvasEvent::MiddlePress(cursor_pos))),
                    )
                }
                mouse::Event::ButtonReleased(mouse::Button::Middle) => {
                    state.panning = false;
                    (
                        canvas::event::Status::Captured,
                        Some(Message::CanvasEvent(CanvasEvent::MiddleRelease)),
                    )
                }
                mouse::Event::ButtonPressed(mouse::Button::Right) => {
                    // Check if right-clicking on a node or boundary → context menu
                    let world = self.viewport.screen_to_world(
                        geo::Point::new(cursor_pos.x, cursor_pos.y),
                    );
                    let hit_node = self.positions.iter().any(|(_, rect)| rect.contains(world));
                    let hit_boundary = self.document.boundaries.values().any(|b| {
                        yamind_canvas::boundary_renderer::compute_boundary_rect(b, self.positions)
                            .map_or(false, |r| r.contains(world))
                    });
                    if hit_node || hit_boundary {
                        state.right_click_on_node = true;
                        (
                            canvas::event::Status::Captured,
                            Some(Message::CanvasEvent(CanvasEvent::RightPress(cursor_pos))),
                        )
                    } else {
                        // Right-click on empty space → pan
                        state.panning = true;
                        (
                            canvas::event::Status::Captured,
                            Some(Message::CanvasEvent(CanvasEvent::MiddlePress(cursor_pos))),
                        )
                    }
                }
                mouse::Event::ButtonReleased(mouse::Button::Right) => {
                    let was_node = state.right_click_on_node;
                    state.right_click_on_node = false;
                    if was_node {
                        (
                            canvas::event::Status::Captured,
                            Some(Message::CanvasEvent(CanvasEvent::RightRelease(cursor_pos))),
                        )
                    } else {
                        state.panning = false;
                        (
                            canvas::event::Status::Captured,
                            Some(Message::CanvasEvent(CanvasEvent::MiddleRelease)),
                        )
                    }
                }
                mouse::Event::CursorMoved { .. } => {
                    let status = if state.panning || state.dragging || state.resizing || state.rubber_banding {
                        canvas::event::Status::Captured
                    } else {
                        canvas::event::Status::Ignored
                    };
                    // Always forward cursor moves (needed for hover tracking)
                    (
                        status,
                        Some(Message::CanvasEvent(CanvasEvent::CursorMoved(cursor_pos))),
                    )
                }
                mouse::Event::WheelScrolled { delta } => {
                    if state.cmd_held {
                        // Cmd + two-finger scroll → zoom
                        let delta_y = match delta {
                            mouse::ScrollDelta::Lines { y, .. } => y,
                            mouse::ScrollDelta::Pixels { y, .. } => y / 50.0,
                        };
                        (
                            canvas::event::Status::Captured,
                            Some(Message::CanvasEvent(CanvasEvent::ScrollZoom(
                                delta_y,
                                cursor_pos,
                            ))),
                        )
                    } else {
                        // Two-finger scroll → pan
                        let (dx, dy) = match delta {
                            mouse::ScrollDelta::Lines { x, y } => (x * 20.0, y * 20.0),
                            mouse::ScrollDelta::Pixels { x, y } => (x, y),
                        };
                        (
                            canvas::event::Status::Captured,
                            Some(Message::CanvasEvent(CanvasEvent::ScrollPan(dx, dy))),
                        )
                    }
                }
                _ => (canvas::event::Status::Ignored, None),
            },
            canvas::Event::Keyboard(kb_event) => {
                match kb_event {
                    keyboard::Event::ModifiersChanged(mods) => {
                        state.cmd_held = mods.command();
                        state.shift_held = mods.shift();
                        state.alt_held = mods.alt();
                    }
                    _ => {}
                }
                (canvas::event::Status::Ignored, None)
            }
            _ => (canvas::event::Status::Ignored, None),
        }
    }

    fn draw(
        &self,
        _state: &Self::State,
        renderer: &iced::Renderer,
        _theme: &iced::Theme,
        bounds: iced::Rectangle,
        _cursor: mouse::Cursor,
    ) -> Vec<canvas::Geometry> {
        // Layer 1: cached mind map content
        let geometry = self.cache.draw(renderer, bounds.size(), |frame| {
            let data = CanvasData {
                document: self.document,
                selection: self.selection,
                positions: self.positions,
                edge_routes: self.edge_routes,
                editing_node_id: self.editing_node_id,
                hover_node_id: self.hover_node_id,
                selected_boundary: self.selected_boundary,
                hover_boundary: self.hover_boundary,
            };
            draw_canvas(frame, self.viewport, &data);
        });

        let mut layers = vec![geometry];

        // Layer 2: uncached drag overlay (ghost node + connector line + drop indicator)
        if let Some(ref ghost) = self.drag_ghost {
            let mut overlay = canvas::Frame::new(renderer, bounds.size());

            draw_drag_overlay(
                &mut overlay,
                self.viewport,
                self.positions,
                self.document,
                ghost,
                self.drop_target,
            );

            layers.push(overlay.into_geometry());
        }

        // Layer 3: rubber band selection rectangle
        if let Some((start, end)) = self.rubber_band {
            let mut overlay = canvas::Frame::new(renderer, bounds.size());
            let scale = self.viewport.scale();
            let t = &self.viewport.transform;

            let s = iced::Point::new(
                (start.x + t.translation.x) * scale,
                (start.y + t.translation.y) * scale,
            );
            let e = iced::Point::new(
                (end.x + t.translation.x) * scale,
                (end.y + t.translation.y) * scale,
            );
            let x = s.x.min(e.x);
            let y = s.y.min(e.y);
            let w = (s.x - e.x).abs();
            let h = (s.y - e.y).abs();

            if w > 1.0 || h > 1.0 {
                use iced::widget::canvas::{Path, Stroke};
                let rect_path = Path::rectangle(
                    iced::Point::new(x, y),
                    iced::Size::new(w, h),
                );
                overlay.fill(
                    &rect_path,
                    iced::Color::from_rgba(0.3, 0.5, 0.9, 0.15),
                );
                overlay.stroke(
                    &rect_path,
                    Stroke::default()
                        .with_color(iced::Color::from_rgba(0.3, 0.5, 0.9, 0.6))
                        .with_width(1.5),
                );
            }

            layers.push(overlay.into_geometry());
        }

        layers
    }

    fn mouse_interaction(
        &self,
        state: &Self::State,
        bounds: iced::Rectangle,
        cursor: mouse::Cursor,
    ) -> mouse::Interaction {
        if state.panning {
            return mouse::Interaction::Grabbing;
        }

        if state.resizing {
            return mouse::Interaction::ResizingHorizontally;
        }

        if let Some(cursor_pos) = cursor.position_in(bounds) {
            let world = self
                .viewport
                .screen_to_world(geo::Point::new(cursor_pos.x, cursor_pos.y));
            // Check if cursor is over a node
            // (We don't have access to spatial_index here, so we check positions directly)
            let resize_handle_width = 6.0;
            let root_center_x = self.document.root_id
                .and_then(|rid| self.positions.get(&rid))
                .map(|r| r.center().x)
                .unwrap_or(0.0);
            for (id, rect) in self.positions {
                if rect.contains(world) {
                    let is_left = rect.center().x < root_center_x;
                    let on_resize_edge = if is_left {
                        (world.x - rect.x).abs() < resize_handle_width
                    } else {
                        (world.x - (rect.x + rect.width)).abs() < resize_handle_width
                    };
                    // Don't show resize on root node
                    let is_root = self.document.root_id == Some(*id);
                    if on_resize_edge && !is_root {
                        return mouse::Interaction::ResizingHorizontally;
                    }
                    if state.dragging {
                        return mouse::Interaction::Grabbing;
                    }
                    return mouse::Interaction::Pointer;
                }
            }
        }

        mouse::Interaction::default()
    }
}

/// State maintained by the canvas interaction handler across frames.
pub struct CanvasInteractionState {
    dragging: bool,
    panning: bool,
    resizing: bool,
    rubber_banding: bool,
    cmd_held: bool,
    shift_held: bool,
    alt_held: bool,
    right_click_on_node: bool,
    last_click_time: std::time::Instant,
    last_click_pos: Option<Point>,
}

impl Default for CanvasInteractionState {
    fn default() -> Self {
        Self {
            dragging: false,
            panning: false,
            resizing: false,
            rubber_banding: false,
            cmd_held: false,
            shift_held: false,
            alt_held: false,
            right_click_on_node: false,
            last_click_time: std::time::Instant::now(),
            last_click_pos: None,
        }
    }
}

/// Draw a visual indicator for the drop target (called in world space).
fn draw_drop_indicator(
    frame: &mut canvas::Frame,
    positions: &HashMap<NodeId, Rect>,
    document: &Document,
    target: &DropTarget,
) {
    use iced::widget::canvas::{Path, Stroke};
    use iced::Color;

    let highlight_color = Color::from_rgba(0.2, 0.8, 0.2, 0.7);
    let line_color = Color::from_rgba(0.2, 0.8, 0.2, 0.9);

    match target {
        DropTarget::OnNode { parent } => {
            // Highlight the target node with a green border
            if let Some(rect) = positions.get(parent) {
                let expanded = rect.expanded(4.0);
                let path = Path::rectangle(
                    iced::Point::new(expanded.x, expanded.y),
                    iced::Size::new(expanded.width, expanded.height),
                );
                frame.stroke(
                    &path,
                    Stroke::default()
                        .with_color(highlight_color)
                        .with_width(3.0),
                );
            }
        }
        DropTarget::BeforeSibling { parent, index } => {
            // Draw a horizontal line at the insertion point
            if let Some(parent_node) = document.get_node(parent) {
                let line_rect = if *index < parent_node.children.len() {
                    // Draw line above the sibling at this index
                    let sibling_id = parent_node.children[*index];
                    positions.get(&sibling_id).map(|r| {
                        (
                            iced::Point::new(r.x, r.y - 4.0),
                            iced::Point::new(r.x + r.width, r.y - 4.0),
                        )
                    })
                } else if !parent_node.children.is_empty() {
                    // Draw line below the last child
                    let last_id = *parent_node.children.last().unwrap();
                    positions.get(&last_id).map(|r| {
                        (
                            iced::Point::new(r.x, r.y + r.height + 4.0),
                            iced::Point::new(r.x + r.width, r.y + r.height + 4.0),
                        )
                    })
                } else {
                    None
                };

                if let Some((start, end)) = line_rect {
                    let path = Path::line(start, end);
                    frame.stroke(
                        &path,
                        Stroke::default()
                            .with_color(line_color)
                            .with_width(3.0),
                    );
                    // Draw small circles at the ends
                    let dot1 = Path::circle(start, 4.0);
                    let dot2 = Path::circle(end, 4.0);
                    frame.fill(&dot1, line_color);
                    frame.fill(&dot2, line_color);
                }
            }
        }
    }
}

/// Draw the ghost node following the cursor, and a bezier connector + drop
/// indicator when close to another node.
fn draw_drag_overlay(
    frame: &mut canvas::Frame,
    viewport: &Viewport,
    positions: &HashMap<NodeId, Rect>,
    document: &Document,
    ghost: &DragGhostInfo,
    drop_target: &Option<DropTarget>,
) {
    use iced::widget::canvas::{Path, Stroke};
    use iced::Color;
    use yamind_canvas::node_renderer;

    let Some(node) = document.get_node(&ghost.node_id) else {
        return;
    };
    let Some(original_rect) = positions.get(&ghost.node_id) else {
        return;
    };

    let scale = viewport.scale();
    let t = &viewport.transform;

    // Ghost position in world space: original rect shifted by drag delta
    let dx = ghost.world_pos.x - ghost.start_world_pos.x;
    let dy = ghost.world_pos.y - ghost.start_world_pos.y;
    let ghost_world = Rect::new(
        original_rect.x + dx,
        original_rect.y + dy,
        original_rect.width,
        original_rect.height,
    );

    // Ghost rect in screen space
    let screen_rect = Rect::new(
        (ghost_world.x + t.translation.x) * scale,
        (ghost_world.y + t.translation.y) * scale,
        ghost_world.width * scale,
        ghost_world.height * scale,
    );

    // Draw the ghost node (semi-transparent)
    frame.with_save(|frame| {
        let depth = document.depth_of(&ghost.node_id);
        let default_style = document.default_styles.for_depth(depth);
        let mut resolved = node.style.merged_with(default_style);

        if let Some(ref mut c) = resolved.fill_color {
            c.a *= 0.5;
        }
        if let Some(ref mut c) = resolved.stroke_color {
            c.a *= 0.5;
        }
        if let Some(ref mut c) = resolved.font_color {
            c.a *= 0.5;
        }

        node_renderer::draw_node(
            frame,
            &screen_rect,
            &resolved,
            &node.content.text,
            false,
            scale,
            false, // ghost node alignment doesn't matter
            0.0,   // no side column for ghost
        );
    });

    // If there's a drop target, draw a bezier from ghost to target + indicator
    if let Some(target) = drop_target {
        // BeforeSibling → bezier goes to the parent (we're becoming a sibling)
        // OnNode → bezier goes to that node (we're becoming its child)
        let bezier_target_id = match target {
            DropTarget::OnNode { parent } => Some(*parent),
            DropTarget::BeforeSibling { parent, .. } => Some(*parent),
        };
        let target_node_id = bezier_target_id;

        if let Some(tid) = target_node_id {
            if let Some(target_rect) = positions.get(&tid) {
                let ghost_center = screen_rect.center();
                let target_center = target_rect.center();

                let src = iced::Point::new(ghost_center.x, ghost_center.y);
                let dst = iced::Point::new(
                    (target_center.x + t.translation.x) * scale,
                    (target_center.y + t.translation.y) * scale,
                );

                let color = Color::from_rgba(0.2, 0.8, 0.2, 0.8);

                // Bezier curve from ghost to target
                let cdx = (dst.x - src.x) * 0.4;
                let ctrl1 = iced::Point::new(src.x + cdx, src.y);
                let ctrl2 = iced::Point::new(dst.x - cdx, dst.y);

                let path = Path::new(|builder| {
                    builder.move_to(src);
                    builder.bezier_curve_to(ctrl1, ctrl2, dst);
                });
                frame.stroke(
                    &path,
                    Stroke::default().with_color(color).with_width(2.5),
                );

                // Small dot at the target end
                let dot = Path::circle(dst, 4.0);
                frame.fill(&dot, color);
            }
        }

        // Drop indicator (highlight / insertion line) in world space
        frame.with_save(|frame| {
            frame.scale(scale);
            frame.translate(iced::Vector::new(t.translation.x, t.translation.y));
            draw_drop_indicator(frame, positions, document, target);
        });
    }
}

/// Fetch the <title> from a URL. Returns empty string on failure.
async fn fetch_page_title(url: &str) -> String {
    let Ok(response) = reqwest::get(url).await else {
        return String::new();
    };
    let Ok(body) = response.text().await else {
        return String::new();
    };
    // Simple <title> extraction — no full HTML parser needed
    if let Some(start) = body.find("<title>").or_else(|| body.find("<TITLE>")) {
        let after = &body[start + 7..];
        if let Some(end) = after.find("</title>").or_else(|| after.find("</TITLE>")) {
            let title = after[..end].trim();
            // Decode basic HTML entities
            return title
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&#x27;", "'");
        }
    }
    String::new()
}
