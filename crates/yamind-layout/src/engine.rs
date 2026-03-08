use std::collections::HashMap;
use yamind_core::edge::BezierRoute;
use yamind_core::geometry::{Rect, Size};
use yamind_core::id::NodeId;
use yamind_core::Document;

/// Result of a layout computation.
#[derive(Debug, Clone)]
pub struct LayoutResult {
    pub positions: HashMap<NodeId, Rect>,
    pub edge_routes: HashMap<(NodeId, NodeId), BezierRoute>,
}

/// Trait for layout algorithms.
pub trait LayoutAlgorithm {
    fn layout(
        &self,
        document: &Document,
        node_sizes: &HashMap<NodeId, Size>,
    ) -> LayoutResult;
}
