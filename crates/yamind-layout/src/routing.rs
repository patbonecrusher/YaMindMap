use std::collections::HashMap;
use yamind_core::edge::BezierRoute;
use yamind_core::geometry::{Point, Rect};
use yamind_core::id::NodeId;
use yamind_core::Document;

/// Calculate bezier routes for all parent-child edges.
pub fn compute_edge_routes(
    document: &Document,
    positions: &HashMap<NodeId, Rect>,
) -> HashMap<(NodeId, NodeId), BezierRoute> {
    let mut routes = HashMap::new();

    for (id, node) in &document.nodes {
        for child_id in &node.children {
            let Some(parent_rect) = positions.get(id) else {
                continue;
            };
            let Some(child_rect) = positions.get(child_id) else {
                continue;
            };

            let route = bezier_between(parent_rect, child_rect);
            routes.insert((*id, *child_id), route);
        }
    }

    routes
}

fn bezier_between(parent: &Rect, child: &Rect) -> BezierRoute {
    let parent_center = parent.center();
    let child_center = child.center();

    // Determine connection points based on relative position
    let (from, to) = if child_center.x >= parent_center.x {
        // Child is to the right
        (
            Point::new(parent.x + parent.width, parent_center.y),
            Point::new(child.x, child_center.y),
        )
    } else {
        // Child is to the left
        (
            Point::new(parent.x, parent_center.y),
            Point::new(child.x + child.width, child_center.y),
        )
    };

    // S-curve with ~50% horizontal offset
    let dx = (to.x - from.x) * 0.5;
    let ctrl1 = Point::new(from.x + dx, from.y);
    let ctrl2 = Point::new(to.x - dx, to.y);

    BezierRoute {
        from,
        ctrl1,
        ctrl2,
        to,
    }
}
