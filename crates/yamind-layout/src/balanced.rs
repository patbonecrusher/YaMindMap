use std::collections::HashMap;
use yamind_core::document::LayoutDirection;
use yamind_core::geometry::{Rect, Size};
use yamind_core::id::NodeId;
use yamind_core::Document;

use crate::engine::{LayoutAlgorithm, LayoutResult};
use crate::routing::compute_edge_routes;

/// Balanced map layout: distributes root's children left and right
/// to minimize overall height difference.
pub struct BalancedLayout;

impl LayoutAlgorithm for BalancedLayout {
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

        let root_size = node_sizes
            .get(&root_id)
            .copied()
            .unwrap_or(Size::new(120.0, 50.0));

        // Place root at origin
        let root_rect = Rect::from_center(yamind_core::Point::ORIGIN, root_size);
        positions.insert(root_id, root_rect);

        let Some(root_node) = document.get_node(&root_id) else {
            return LayoutResult {
                positions,
                edge_routes: HashMap::new(),
            };
        };

        if root_node.children.is_empty() {
            let edge_routes = compute_edge_routes(document, &positions);
            return LayoutResult {
                positions,
                edge_routes,
            };
        }

        let h_gap = document.layout_config.h_gap;
        let v_gap = document.layout_config.v_gap;

        // Partition children left/right
        let (left_children, right_children) = partition_children(
            document,
            &root_node.children,
            node_sizes,
            v_gap,
            document.layout_config.direction,
        );

        // Layout right children
        let right_x = root_rect.x + root_rect.width + h_gap;
        layout_children_column(
            document,
            &right_children,
            node_sizes,
            right_x,
            root_rect.center().y,
            h_gap,
            v_gap,
            false,
            &mut positions,
        );

        // Layout left children
        let left_x = root_rect.x - h_gap;
        layout_children_column(
            document,
            &left_children,
            node_sizes,
            left_x,
            root_rect.center().y,
            h_gap,
            v_gap,
            true,
            &mut positions,
        );

        let edge_routes = compute_edge_routes(document, &positions);
        LayoutResult {
            positions,
            edge_routes,
        }
    }
}

fn partition_children(
    document: &Document,
    children: &[NodeId],
    node_sizes: &HashMap<NodeId, Size>,
    v_gap: f32,
    direction: LayoutDirection,
) -> (Vec<NodeId>, Vec<NodeId>) {
    match direction {
        LayoutDirection::RightOnly => (Vec::new(), children.to_vec()),
        LayoutDirection::LeftOnly => (children.to_vec(), Vec::new()),
        LayoutDirection::Balanced => {
            // Greedy partition to balance total height
            let mut left = Vec::new();
            let mut right = Vec::new();
            let mut left_height: f32 = 0.0;
            let mut right_height: f32 = 0.0;

            for child_id in children {
                let subtree_h = estimate_subtree_height(document, child_id, node_sizes, v_gap);
                if right_height <= left_height {
                    right.push(*child_id);
                    right_height += subtree_h + v_gap;
                } else {
                    left.push(*child_id);
                    left_height += subtree_h + v_gap;
                }
            }
            (left, right)
        }
    }
}

fn estimate_subtree_height(
    document: &Document,
    node_id: &NodeId,
    node_sizes: &HashMap<NodeId, Size>,
    v_gap: f32,
) -> f32 {
    let node_h = node_sizes
        .get(node_id)
        .map(|s| s.height)
        .unwrap_or(40.0);

    let Some(node) = document.get_node(node_id) else {
        return node_h;
    };

    if node.children.is_empty() || node.collapsed {
        return node_h;
    }

    let children_total: f32 = node
        .children
        .iter()
        .map(|c| estimate_subtree_height(document, c, node_sizes, v_gap))
        .sum::<f32>()
        + (node.children.len() as f32 - 1.0).max(0.0) * v_gap;

    children_total.max(node_h)
}

#[allow(clippy::too_many_arguments)]
fn layout_children_column(
    document: &Document,
    children: &[NodeId],
    node_sizes: &HashMap<NodeId, Size>,
    anchor_x: f32,
    center_y: f32,
    h_gap: f32,
    v_gap: f32,
    is_left: bool,
    positions: &mut HashMap<NodeId, Rect>,
) {
    if children.is_empty() {
        return;
    }

    // Calculate total height of all subtrees
    let subtree_heights: Vec<f32> = children
        .iter()
        .map(|c| estimate_subtree_height(document, c, node_sizes, v_gap))
        .collect();

    let total_height: f32 = subtree_heights.iter().sum::<f32>()
        + (children.len() as f32 - 1.0) * v_gap;

    let mut current_y = center_y - total_height / 2.0;

    for (i, child_id) in children.iter().enumerate() {
        let child_size = node_sizes
            .get(child_id)
            .copied()
            .unwrap_or(Size::new(100.0, 40.0));

        let subtree_h = subtree_heights[i];
        let child_center_y = current_y + subtree_h / 2.0;

        let child_x = if is_left {
            anchor_x - child_size.width
        } else {
            anchor_x
        };

        let child_rect = Rect::new(
            child_x,
            child_center_y - child_size.height / 2.0,
            child_size.width,
            child_size.height,
        );
        positions.insert(*child_id, child_rect);

        // Recursively layout grandchildren
        if let Some(child_node) = document.get_node(child_id) {
            if !child_node.children.is_empty() && !child_node.collapsed {
                let next_x = if is_left {
                    child_rect.x - h_gap
                } else {
                    child_rect.x + child_rect.width + h_gap
                };
                layout_children_column(
                    document,
                    &child_node.children,
                    node_sizes,
                    next_x,
                    child_center_y,
                    h_gap,
                    v_gap,
                    is_left,
                    positions,
                );
            }
        }

        current_y += subtree_h + v_gap;
    }
}
