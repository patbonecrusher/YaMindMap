use std::collections::HashMap;

use iced::event;
use iced::keyboard;
use iced::mouse;
use iced::widget::{canvas, container, Canvas};
use iced::{Element, Event, Length, Point, Subscription, Task};

use yamind_canvas::interaction::InteractionState;
use yamind_canvas::program::{draw_canvas, CanvasData};
use yamind_canvas::viewport::Viewport;
use yamind_canvas::CanvasMessage;
use yamind_commands::{
    AddChildCommand, AddSiblingCommand, CommandHistory, DeleteNodeCommand, MoveNodeCommand,
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

    // Track if we need initial zoom-to-fit
    needs_initial_fit: bool,
    screen_size: (f32, f32),
}

impl App {
    pub fn new() -> (Self, Task<Message>) {
        let mut doc = Document::with_root("Central Topic");

        // Add some demo children
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

        let mut app = Self {
            document: doc,
            selection: Selection::new(),
            history: CommandHistory::new(),
            positions: HashMap::new(),
            edge_routes: HashMap::new(),
            node_sizes: HashMap::new(),
            viewport: Viewport::new(),
            interaction: InteractionState::Idle,
            canvas_cache: canvas::Cache::new(),
            spatial_index: yamind_canvas::SpatialIndex::new(),
            drop_target: None,
            drag_started: false,
            needs_initial_fit: true,
            screen_size: (800.0, 600.0),
        };

        app.compute_layout();

        (app, Task::none())
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

            // Approximate text width: ~0.6 * font_size per character
            let text_width = node.content.text.len() as f32 * font_size * 0.6;
            let width = (text_width + padding_h * 2.0).clamp(min_width, max_width);
            let height = font_size + padding_v * 2.0;

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
        "YaMindMap".to_string()
    }

    pub fn update(&mut self, message: Message) -> Task<Message> {
        match message {
            Message::AddChild => {
                if let Some(selected_id) = self.selection.single() {
                    self.history
                        .execute(Box::new(AddChildCommand::new(selected_id, "New Topic")), &mut self.document);
                    self.compute_layout();
                }
            }
            Message::AddSibling => {
                if let Some(selected_id) = self.selection.single() {
                    if !self.document.get_node(&selected_id).map_or(true, |n| n.is_root()) {
                        self.history.execute(
                            Box::new(AddSiblingCommand::new(selected_id, "New Topic")),
                            &mut self.document,
                        );
                        self.compute_layout();
                    }
                }
            }
            Message::DeleteSelected => {
                if let Some(selected_id) = self.selection.single() {
                    if !self.document.get_node(&selected_id).map_or(true, |n| n.is_root()) {
                        self.history.execute(
                            Box::new(DeleteNodeCommand::new(selected_id)),
                            &mut self.document,
                        );
                        self.selection.clear();
                        self.compute_layout();
                    }
                }
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
                self.handle_canvas_event(canvas_event);
            }
        }

        Task::none()
    }

    fn handle_canvas_event(&mut self, event: CanvasEvent) {
        match event {
            CanvasEvent::LeftPress(pos) => {
                let world = self.viewport.screen_to_world(geo::Point::new(pos.x, pos.y));
                if let Some(node_id) = self.spatial_index.hit_test(world) {
                    self.selection.select(node_id);
                    self.interaction = InteractionState::DraggingNode {
                        node_id,
                        start_world_pos: world,
                        current_world_pos: world,
                    };
                    self.drag_started = false;
                    self.drop_target = None;
                } else {
                    self.selection.clear();
                    self.interaction = InteractionState::Idle;
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
                                return;
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
                    _ => {}
                }
            }
            CanvasEvent::Scroll(delta_y, pos) => {
                let factor = if delta_y > 0.0 { 1.1 } else { 1.0 / 1.1 };
                self.viewport
                    .zoom(factor, geo::Point::new(pos.x, pos.y));
                self.canvas_cache.clear();
            }
            CanvasEvent::DoubleClick(pos) => {
                let world = self.viewport.screen_to_world(geo::Point::new(pos.x, pos.y));
                if let Some(node_id) = self.spatial_index.hit_test(world) {
                    self.selection.select(node_id);
                    // TODO: Enter inline text editing mode
                    self.canvas_cache.clear();
                }
            }
            CanvasEvent::RightPress(_pos) => {
                // TODO: Context menu
            }
        }
    }

    /// Determine where a dragged node should be dropped based on cursor position.
    fn compute_drop_target(&self, dragged_id: NodeId, cursor: geo::Point) -> Option<DropTarget> {
        // Find the node under the cursor (excluding the dragged node itself)
        let hover_id = self.positions.iter().find_map(|(id, rect)| {
            if *id != dragged_id && rect.contains(cursor) {
                Some(*id)
            } else {
                None
            }
        })?;

        let hover_rect = self.positions.get(&hover_id)?;
        let hover_node = self.document.get_node(&hover_id)?;

        // Determine drop zone based on vertical position within the hovered node.
        // Top 25%: insert before this sibling
        // Middle 50%: reparent (become child of this node)
        // Bottom 25%: insert after this sibling
        let relative_y = (cursor.y - hover_rect.y) / hover_rect.height;

        if let Some(parent_id) = hover_node.parent {
            if relative_y < 0.25 {
                // Insert before this sibling
                let parent = self.document.get_node(&parent_id)?;
                let idx = parent
                    .children
                    .iter()
                    .position(|c| *c == hover_id)
                    .unwrap_or(0);
                return Some(DropTarget::BeforeSibling {
                    parent: parent_id,
                    index: idx,
                });
            } else if relative_y > 0.75 {
                // Insert after this sibling
                let parent = self.document.get_node(&parent_id)?;
                let idx = parent
                    .children
                    .iter()
                    .position(|c| *c == hover_id)
                    .unwrap_or(0);
                return Some(DropTarget::BeforeSibling {
                    parent: parent_id,
                    index: idx + 1,
                });
            }
        }

        // Middle zone or root node: reparent as child
        // Don't allow dropping onto the dragged node's own descendant
        if self.document.is_ancestor_of(dragged_id, hover_id) {
            return None;
        }

        Some(DropTarget::OnNode { parent: hover_id })
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

        let canvas = Canvas::new(MindMapProgram {
            viewport: &self.viewport,
            document: &self.document,
            selection: &self.selection,
            positions: &self.positions,
            edge_routes: &self.edge_routes,
            cache: &self.canvas_cache,
            drop_target: &self.drop_target,
            drag_ghost,
        })
        .width(Length::Fill)
        .height(Length::Fill);

        container(canvas)
            .width(Length::Fill)
            .height(Length::Fill)
            .into()
    }

    pub fn subscription(&self) -> Subscription<Message> {
        event::listen_with(|event, _status, _id| match event {
            Event::Keyboard(keyboard::Event::KeyPressed {
                key,
                modifiers,
                ..
            }) => shortcuts::handle_key(key, modifiers),
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)) => None,
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Middle)) => None,
            _ => None,
        })
    }
}

/// Info about an active node drag, passed to the canvas for rendering.
#[derive(Debug, Clone)]
struct DragGhostInfo {
    node_id: NodeId,
    /// Offset from the node's layout center to the drag start point.
    world_pos: geo::Point,
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
                    state.dragging = true;
                    (
                        canvas::event::Status::Captured,
                        Some(Message::CanvasEvent(CanvasEvent::LeftPress(cursor_pos))),
                    )
                }
                mouse::Event::ButtonReleased(mouse::Button::Left) => {
                    state.dragging = false;
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
                    if state.panning || state.dragging {
                        (
                            canvas::event::Status::Captured,
                            Some(Message::CanvasEvent(CanvasEvent::CursorMoved(cursor_pos))),
                        )
                    } else {
                        (canvas::event::Status::Ignored, None)
                    }
                }
                mouse::Event::WheelScrolled { delta } => {
                    let delta_y = match delta {
                        mouse::ScrollDelta::Lines { y, .. } => y,
                        mouse::ScrollDelta::Pixels { y, .. } => y / 50.0,
                    };
                    (
                        canvas::event::Status::Captured,
                        Some(Message::CanvasEvent(CanvasEvent::Scroll(
                            delta_y,
                            cursor_pos,
                        ))),
                    )
                }
                _ => (canvas::event::Status::Ignored, None),
            },
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
            };
            draw_canvas(frame, self.viewport, &data);
        });

        let mut layers = vec![geometry];

        // Layer 2: uncached drag overlay (ghost node + drop indicator)
        if let Some(ref ghost) = self.drag_ghost {
            let mut overlay = canvas::Frame::new(renderer, bounds.size());

            // Draw drop indicator
            if let Some(target) = self.drop_target {
                let scale = self.viewport.scale();
                let t = &self.viewport.transform;
                overlay.scale(scale);
                overlay.translate(iced::Vector::new(t.translation.x, t.translation.y));
                draw_drop_indicator(&mut overlay, self.positions, self.document, target);
                // Reset transform for the ghost (we'll apply it manually)
                overlay.translate(iced::Vector::new(-t.translation.x, -t.translation.y));
                overlay.scale(1.0 / scale);
            }

            // Draw the ghost node at the cursor position
            draw_drag_ghost(
                &mut overlay,
                self.viewport,
                self.document,
                self.positions,
                ghost,
            );

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

        if let Some(cursor_pos) = cursor.position_in(bounds) {
            let world = self
                .viewport
                .screen_to_world(geo::Point::new(cursor_pos.x, cursor_pos.y));
            // Check if cursor is over a node
            // (We don't have access to spatial_index here, so we check positions directly)
            for (_, rect) in self.positions {
                if rect.contains(world) {
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
    last_click_time: std::time::Instant,
    last_click_pos: Option<Point>,
}

impl Default for CanvasInteractionState {
    fn default() -> Self {
        Self {
            dragging: false,
            panning: false,
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

/// Draw a semi-transparent ghost of the dragged node at the cursor position.
fn draw_drag_ghost(
    frame: &mut canvas::Frame,
    viewport: &Viewport,
    document: &Document,
    positions: &HashMap<NodeId, Rect>,
    ghost: &DragGhostInfo,
) {
    use yamind_canvas::node_renderer;

    let Some(node) = document.get_node(&ghost.node_id) else {
        return;
    };
    let Some(original_rect) = positions.get(&ghost.node_id) else {
        return;
    };

    // Compute the offset: how far the cursor moved in world space
    let dx = ghost.world_pos.x - ghost.start_world_pos.x;
    let dy = ghost.world_pos.y - ghost.start_world_pos.y;

    // Ghost rect = original rect shifted by the drag delta, then transformed to screen space
    let ghost_world = Rect::new(
        original_rect.x + dx,
        original_rect.y + dy,
        original_rect.width,
        original_rect.height,
    );

    // Transform to screen space
    let scale = viewport.scale();
    let t = &viewport.transform;

    let screen_rect = Rect::new(
        (ghost_world.x + t.translation.x) * scale,
        (ghost_world.y + t.translation.y) * scale,
        ghost_world.width * scale,
        ghost_world.height * scale,
    );

    // Save frame state, apply alpha
    frame.with_save(|frame| {
        let depth = document.depth_of(&ghost.node_id);
        let default_style = document.default_styles.for_depth(depth);
        let mut resolved = node.style.merged_with(default_style);

        // Make the ghost semi-transparent
        if let Some(ref mut fill) = resolved.fill_color {
            fill.a *= 0.5;
        }
        if let Some(ref mut stroke) = resolved.stroke_color {
            stroke.a *= 0.5;
        }
        if let Some(ref mut font_color) = resolved.font_color {
            font_color.a *= 0.5;
        }

        node_renderer::draw_node(
            frame,
            &screen_rect,
            &resolved,
            &node.content.text,
            false,
            scale,
        );
    });
}
