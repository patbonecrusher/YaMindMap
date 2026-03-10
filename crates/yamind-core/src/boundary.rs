use crate::id::{BoundaryId, NodeId};
use crate::style::Color;
use serde::{Deserialize, Serialize};

/// A visual grouping frame around a set of nodes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Boundary {
    pub id: BoundaryId,
    pub label: String,
    pub node_ids: Vec<NodeId>,
    pub fill_color: Color,
    pub stroke_color: Color,
    pub stroke_width: f32,
    pub padding: f32,
}

impl Boundary {
    pub fn new(node_ids: Vec<NodeId>) -> Self {
        Self {
            id: BoundaryId::new(),
            label: String::new(),
            node_ids,
            fill_color: Color::rgba(0.3, 0.5, 0.8, 0.1),
            stroke_color: Color::rgba(0.45, 0.65, 0.95, 0.7),
            stroke_width: 1.5,
            padding: 10.0,
        }
    }
}
