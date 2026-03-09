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
    AddChildCommand, AddSiblingCommand, Command, CommandHistory, DeleteAndReparentCommand,
    DeleteNodeCommand, EditTextCommand, MoveNodeCommand,
};
use yamind_core::geometry::{self as geo, Rect};
use yamind_core::id::NodeId;
use yamind_core::{Document, Selection};
use yamind_layout::perform_layout;

use crate::message::{CanvasEvent, Message};
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

            let width = if let Some(mw) = node.manual_width {
                mw.max(min_width)
            } else {
                // Measure unwrapped text width to determine natural node width
                let unwrapped = yamind_canvas::text_measure::measure_text(
                    &node.content.text, font_size, None,
                );
                (unwrapped.width + padding_h * 2.0).clamp(min_width, max_width)
            };

            // Measure text wrapped within the node's usable width to get height
            let usable_width = width - padding_h * 2.0;
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
            Message::WindowOpened(id, pos) => {
                eprintln!("[DEBUG] WindowOpened: id={:?} pos=({}, {})", id, pos.x, pos.y);
                self.window_id = Some(id);
                self.window_position = Some((pos.x, pos.y));
                // Apply any pending window restore now that we have the ID
                return self.apply_pending_window_restore();
            }
            Message::WindowResized(id, size) => {
                eprintln!("[DEBUG] WindowResized: id={:?} {}x{}", id, size.width, size.height);
                self.window_id = Some(id);
                self.screen_size = (size.width, size.height);
                // Apply any pending window restore now that we have the ID
                return self.apply_pending_window_restore();
            }
            Message::WindowMoved(pos) => {
                eprintln!("[DEBUG] WindowMoved: ({}, {})", pos.x, pos.y);
                self.window_position = Some((pos.x, pos.y));
            }
        }

        Task::none()
    }

    fn handle_canvas_event(&mut self, event: CanvasEvent) -> Task<Message> {
        match event {
            CanvasEvent::LeftPress(pos, shift_held) => {
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

                // Check if clicking a fold/unfold badge
                if let Some(node_id) = self.hit_test_fold_badge(world) {
                    if let Some(node) = self.document.get_node_mut(&node_id) {
                        node.collapsed = !node.collapsed;
                    }
                    self.compute_layout();
                    return Task::none();
                }

                if let Some(node_id) = self.spatial_index.hit_test(world) {
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
                    self.selection.clear();
                    // Start rubber band selection on empty space
                    self.interaction = InteractionState::RubberBandSelect {
                        start_world_pos: world,
                        current_world_pos: world,
                    };
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
            }
            CanvasEvent::RightPress(_pos) => {
                // TODO: Context menu
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
                return self.maybe_with_delete_dialog(base.into());
            }
        }

        let base = container(canvas)
            .width(Length::Fill)
            .height(Length::Fill);
        self.maybe_with_delete_dialog(base.into())
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
                        Some(Message::CanvasEvent(CanvasEvent::LeftPress(cursor_pos, state.shift_held))),
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
                    // Also allow right-click drag for panning
                    state.panning = true;
                    (
                        canvas::event::Status::Captured,
                        Some(Message::CanvasEvent(CanvasEvent::MiddlePress(cursor_pos))),
                    )
                }
                mouse::Event::ButtonReleased(mouse::Button::Right) => {
                    state.panning = false;
                    (
                        canvas::event::Status::Captured,
                        Some(Message::CanvasEvent(CanvasEvent::MiddleRelease)),
                    )
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
