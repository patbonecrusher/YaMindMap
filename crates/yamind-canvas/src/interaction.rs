use yamind_core::geometry::Point;
use yamind_core::id::NodeId;

/// Interaction state machine for the canvas.
#[derive(Debug, Clone)]
pub enum InteractionState {
    Idle,
    Hovering(NodeId),
    DraggingCanvas {
        last_screen_pos: Point,
    },
    DraggingNode {
        node_id: NodeId,
        start_world_pos: Point,
        current_world_pos: Point,
    },
    RubberBandSelect {
        start_world_pos: Point,
        current_world_pos: Point,
    },
    EditingNodeText {
        node_id: NodeId,
    },
}

impl Default for InteractionState {
    fn default() -> Self {
        Self::Idle
    }
}
