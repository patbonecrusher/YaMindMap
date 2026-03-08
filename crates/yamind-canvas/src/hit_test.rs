use rstar::{RTree, RTreeObject, AABB};
use yamind_core::geometry::{Point, Rect};
use yamind_core::id::NodeId;

#[derive(Debug, Clone)]
pub struct NodeHitBox {
    pub id: NodeId,
    pub bounds: Rect,
}

impl RTreeObject for NodeHitBox {
    type Envelope = AABB<[f32; 2]>;

    fn envelope(&self) -> Self::Envelope {
        AABB::from_corners(
            [self.bounds.x, self.bounds.y],
            [
                self.bounds.x + self.bounds.width,
                self.bounds.y + self.bounds.height,
            ],
        )
    }
}

pub struct SpatialIndex {
    tree: RTree<NodeHitBox>,
}

impl SpatialIndex {
    pub fn new() -> Self {
        Self {
            tree: RTree::new(),
        }
    }

    pub fn rebuild(&mut self, entries: Vec<NodeHitBox>) {
        self.tree = RTree::bulk_load(entries);
    }

    /// Find the topmost node at the given world-space point.
    pub fn hit_test(&self, point: Point) -> Option<NodeId> {
        let query_rect = AABB::from_corners(
            [point.x, point.y],
            [point.x, point.y],
        );
        self.tree
            .locate_in_envelope_intersecting(&query_rect)
            .next()
            .map(|hit| hit.id)
    }

    /// Find all nodes intersecting a rect.
    pub fn query_rect(&self, rect: &Rect) -> Vec<NodeId> {
        let envelope = AABB::from_corners(
            [rect.x, rect.y],
            [rect.x + rect.width, rect.y + rect.height],
        );
        self.tree
            .locate_in_envelope_intersecting(&envelope)
            .map(|hit| hit.id)
            .collect()
    }
}

impl Default for SpatialIndex {
    fn default() -> Self {
        Self::new()
    }
}
