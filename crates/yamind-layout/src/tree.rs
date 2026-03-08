use std::collections::HashMap;
use yamind_core::geometry::{Rect, Size};
use yamind_core::id::NodeId;
use yamind_core::Document;

use crate::engine::{LayoutAlgorithm, LayoutResult};
use crate::routing::compute_edge_routes;

/// Tree layout — positions all children to the right (or below).
pub struct TreeLayout;

impl LayoutAlgorithm for TreeLayout {
    fn layout(
        &self,
        document: &Document,
        node_sizes: &HashMap<NodeId, Size>,
    ) -> LayoutResult {
        let mut positions = HashMap::new();

        let Some(root_id) = document.root_id else {
            return LayoutResult {
                positions,
                edge_routes: HashMap::new(),
            };
        };

        let h_gap = document.layout_config.h_gap;
        let v_gap = document.layout_config.v_gap;

        layout_subtree(
            document,
            &root_id,
            node_sizes,
            0.0,
            0.0,
            h_gap,
            v_gap,
            &mut positions,
        );

        // Center the tree on origin
        if !positions.is_empty() {
            let min_x = positions.values().map(|r| r.x).fold(f32::MAX, f32::min);
            let min_y = positions.values().map(|r| r.y).fold(f32::MAX, f32::min);
            let max_x = positions
                .values()
                .map(|r| r.x + r.width)
                .fold(f32::MIN, f32::max);
            let max_y = positions
                .values()
                .map(|r| r.y + r.height)
                .fold(f32::MIN, f32::max);
            let cx = (min_x + max_x) / 2.0;
            let cy = (min_y + max_y) / 2.0;
            for rect in positions.values_mut() {
                rect.x -= cx;
                rect.y -= cy;
            }
        }

        let edge_routes = compute_edge_routes(document, &positions);
        LayoutResult {
            positions,
            edge_routes,
        }
    }
}

/// Layout a subtree rooted at `node_id`, placing it at `(x, start_y)`.
/// Returns the total height consumed by this subtree.
pub fn layout_subtree(
    document: &Document,
    node_id: &NodeId,
    node_sizes: &HashMap<NodeId, Size>,
    x: f32,
    start_y: f32,
    h_gap: f32,
    v_gap: f32,
    positions: &mut HashMap<NodeId, Rect>,
) -> f32 {
    let node_size = node_sizes
        .get(node_id)
        .copied()
        .unwrap_or(Size::new(100.0, 40.0));

    let Some(node) = document.get_node(node_id) else {
        return node_size.height;
    };

    if node.children.is_empty() || node.collapsed {
        positions.insert(
            *node_id,
            Rect::new(x, start_y, node_size.width, node_size.height),
        );
        return node_size.height;
    }

    // Layout children first to know total height
    let child_x = x + node_size.width + h_gap;
    let mut child_y = start_y;
    let mut children_total_height = 0.0;

    for (i, child_id) in node.children.iter().enumerate() {
        let h = layout_subtree(
            document,
            child_id,
            node_sizes,
            child_x,
            child_y,
            h_gap,
            v_gap,
            positions,
        );
        child_y += h;
        children_total_height += h;
        if i < node.children.len() - 1 {
            child_y += v_gap;
            children_total_height += v_gap;
        }
    }

    // Center parent vertically among its children
    let parent_y = start_y + (children_total_height - node_size.height) / 2.0;
    positions.insert(
        *node_id,
        Rect::new(x, parent_y.max(start_y), node_size.width, node_size.height),
    );

    children_total_height.max(node_size.height)
}
