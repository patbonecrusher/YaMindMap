use crate::geometry::Point;
use crate::id::{NodeId, RelationshipId};
use crate::style::EdgeStyle;
use serde::{Deserialize, Serialize};

/// A relationship is an arbitrary connection between two nodes
/// (not a parent-child edge — those are implicit in the tree).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Relationship {
    pub id: RelationshipId,
    pub from: NodeId,
    pub to: NodeId,
    pub label: String,
    pub style: EdgeStyle,
    pub control_points: Vec<Point>,
}

impl Relationship {
    pub fn new(from: NodeId, to: NodeId) -> Self {
        Self {
            id: RelationshipId::new(),
            from,
            to,
            label: String::new(),
            style: EdgeStyle::default(),
            control_points: Vec::new(),
        }
    }
}

/// Computed bezier route for rendering a parent→child edge.
#[derive(Debug, Clone, PartialEq)]
pub struct BezierRoute {
    pub from: Point,
    pub ctrl1: Point,
    pub ctrl2: Point,
    pub to: Point,
}
