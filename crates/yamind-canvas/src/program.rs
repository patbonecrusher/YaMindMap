use std::collections::HashMap;

use iced::mouse;
use iced::widget::canvas;
use iced::widget::canvas::event::{self, Event};
use iced::widget::canvas::{Cache, Geometry};
use iced::{Color, Point, Rectangle, Renderer, Theme};

use yamind_core::edge::BezierRoute;
use yamind_core::geometry::{self as geo, Rect};
use yamind_core::id::{BoundaryId, NodeId};
use yamind_core::{Document, Selection};

use crate::boundary_renderer;
use crate::edge_renderer;
use crate::hit_test::{NodeHitBox, SpatialIndex};
use crate::interaction::InteractionState;
use crate::node_renderer;
use crate::viewport::Viewport;

/// Messages emitted by the canvas to the application.
#[derive(Debug, Clone)]
pub enum CanvasMessage {
    SelectNode(Option<NodeId>),
    ToggleSelectNode(NodeId),
    AddChild(NodeId),
    AddSibling(NodeId),
    DeleteNode(NodeId),
    EditNode(NodeId),
    FinishEdit(NodeId, String),
    MoveNode(NodeId, geo::Point),
    RubberBandSelect(Vec<NodeId>),
    ZoomToFit,
}

pub struct MindMapCanvas {
    pub viewport: Viewport,
    pub interaction: InteractionState,
    pub spatial_index: SpatialIndex,

    // GPU caches — separate layers for minimal redraws
    edge_cache: Cache,
    node_cache: Cache,
    selection_cache: Cache,
}

impl MindMapCanvas {
    pub fn new() -> Self {
        Self {
            viewport: Viewport::new(),
            interaction: InteractionState::Idle,
            spatial_index: SpatialIndex::new(),
            edge_cache: Cache::new(),
            node_cache: Cache::new(),
            selection_cache: Cache::new(),
        }
    }

    pub fn clear_all_caches(&mut self) {
        self.edge_cache.clear();
        self.node_cache.clear();
        self.selection_cache.clear();
    }

    pub fn clear_node_cache(&mut self) {
        self.node_cache.clear();
    }

    pub fn clear_edge_cache(&mut self) {
        self.edge_cache.clear();
    }

    pub fn clear_selection_cache(&mut self) {
        self.selection_cache.clear();
    }

    pub fn rebuild_spatial_index(&mut self, positions: &HashMap<NodeId, Rect>) {
        let entries: Vec<NodeHitBox> = positions
            .iter()
            .map(|(id, rect)| NodeHitBox {
                id: *id,
                bounds: *rect,
            })
            .collect();
        self.spatial_index.rebuild(entries);
    }
}

impl Default for MindMapCanvas {
    fn default() -> Self {
        Self::new()
    }
}

/// Data the canvas needs to render. Passed as the state for canvas::Program.
pub struct CanvasData<'a> {
    pub document: &'a Document,
    pub selection: &'a Selection,
    pub positions: &'a HashMap<NodeId, Rect>,
    pub edge_routes: &'a HashMap<(NodeId, NodeId), BezierRoute>,
    /// Node currently being edited (skip canvas rendering — overlaid by TextEditor).
    pub editing_node_id: Option<NodeId>,
    /// Node currently hovered (for showing collapse button).
    pub hover_node_id: Option<NodeId>,
    /// Currently selected boundary.
    pub selected_boundary: Option<BoundaryId>,
    /// Currently hovered boundary.
    pub hover_boundary: Option<BoundaryId>,
}

impl canvas::Program<CanvasMessage> for MindMapCanvas {
    type State = ();

    fn update(
        &self,
        _state: &mut Self::State,
        event: Event,
        bounds: Rectangle,
        cursor: mouse::Cursor,
    ) -> (event::Status, Option<CanvasMessage>) {
        let Some(_cursor_pos) = cursor.position_in(bounds) else {
            return (event::Status::Ignored, None);
        };

        match event {
            Event::Mouse(mouse::Event::WheelScrolled { delta }) => {
                let _delta_y = match delta {
                    mouse::ScrollDelta::Lines { y, .. } => y,
                    mouse::ScrollDelta::Pixels { y, .. } => y / 50.0,
                };
                // Zoom is handled by returning a message; the app handles viewport mutation
                (event::Status::Captured, None)
            }
            _ => (event::Status::Ignored, None),
        }
    }

    fn draw(
        &self,
        _state: &Self::State,
        _renderer: &Renderer,
        _theme: &Theme,
        _bounds: Rectangle,
        _cursor: mouse::Cursor,
    ) -> Vec<Geometry> {
        // We return empty geometries here; the actual drawing happens via
        // the app's view() which calls draw_canvas with CanvasData.
        vec![]
    }
}

/// Draw the mind map onto a frame. Called from the app's canvas view.
pub fn draw_canvas(
    frame: &mut canvas::Frame,
    viewport: &Viewport,
    data: &CanvasData,
) {
    let scale = viewport.scale();
    let transform = &viewport.transform;

    // Apply viewport transform
    frame.scale(scale);
    frame.translate(iced::Vector::new(
        transform.translation.x,
        transform.translation.y,
    ));

    // Draw boundaries (behind edges and nodes)
    for (bid, boundary) in &data.document.boundaries {
        if let Some(rect) = boundary_renderer::compute_boundary_rect(boundary, data.positions) {
            let is_highlighted = data.selected_boundary == Some(*bid) || data.hover_boundary == Some(*bid);
            boundary_renderer::draw_boundary(frame, boundary, &rect, is_highlighted);
        }
    }

    // Draw edges
    let edge_color = Color::from_rgb(
        data.document.default_edge_style.color.r,
        data.document.default_edge_style.color.g,
        data.document.default_edge_style.color.b,
    );
    let edge_width = data.document.default_edge_style.width;

    for (_, route) in data.edge_routes {
        edge_renderer::draw_edge(frame, route, edge_color, edge_width);
    }

    // Draw nodes
    for (id, rect) in data.positions {
        // Skip the node being edited — it's overlaid by a TextEditor widget
        if data.editing_node_id == Some(*id) {
            continue;
        }
        let Some(node) = data.document.get_node(id) else {
            continue;
        };

        let depth = data.document.depth_of(id);
        let default_style = data.document.default_styles.for_depth(depth);
        let resolved_style = node.style.merged_with(default_style);
        let is_selected = data.selection.is_selected(id);

        // Check if this node is to the left of root (for right-aligning text)
        let is_left_of_root = data.document.root_id
            .and_then(|rid| data.positions.get(&rid))
            .map(|root_rect| rect.center().x < root_rect.center().x)
            .unwrap_or(false);

        let side_col = if node.content.attachments.is_empty() {
            0.0
        } else {
            node_renderer::SIDE_COLUMN_WIDTH
        };

        node_renderer::draw_node(
            frame,
            rect,
            &resolved_style,
            &node.content.text,
            is_selected,
            scale,
            is_left_of_root,
            side_col,
        );

        // Draw attachment icons inside the reserved side column
        if !node.content.attachments.is_empty() {
            let padding_h = resolved_style.padding_h.unwrap_or(12.0);
            node_renderer::draw_attachment_icons(
                frame,
                rect,
                &node.content.attachments,
                scale,
                is_left_of_root,
                padding_h,
            );
        }

        // Draw fold/unfold badge
        if !node.children.is_empty() && !node.is_root() {
            let should_draw = node.collapsed || data.hover_node_id == Some(*id);
            if should_draw {
                let badge_r = 8.0;
                let badge_x = if is_left_of_root {
                    rect.x - badge_r - 2.0
                } else {
                    rect.x + rect.width + badge_r + 2.0
                };
                let badge_y = rect.y + rect.height / 2.0;
                let badge = iced::widget::canvas::Path::circle(
                    Point::new(badge_x, badge_y),
                    badge_r,
                );
                let (badge_color, badge_text, font_size) = if node.collapsed {
                    (Color::from_rgb(0.9, 0.6, 0.1), format!("{}", node.children.len()), 11.0)
                } else {
                    (Color::from_rgb(0.4, 0.4, 0.45), "−".to_string(), 13.0)
                };
                frame.fill(&badge, badge_color);
                let text_size = crate::text_measure::measure_text(&badge_text, font_size, None);
                let label = iced::widget::canvas::Text {
                    content: badge_text,
                    position: Point::new(
                        badge_x - text_size.width / 2.0,
                        badge_y - text_size.height / 2.0,
                    ),
                    color: Color::WHITE,
                    size: font_size.into(),
                    ..iced::widget::canvas::Text::default()
                };
                frame.fill_text(label);
            }
        }
    }
}

