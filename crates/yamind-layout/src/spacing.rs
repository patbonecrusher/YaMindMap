use std::collections::HashMap;
use yamind_core::geometry::Rect;
use yamind_core::id::NodeId;

/// Resolve vertical overlaps between sibling subtrees by pushing them apart.
pub fn resolve_overlaps(positions: &mut HashMap<NodeId, Rect>, min_gap: f32) {
    // Collect all rects sorted by Y position
    let mut entries: Vec<(NodeId, Rect)> = positions.iter().map(|(k, v)| (*k, *v)).collect();
    entries.sort_by(|a, b| a.1.y.partial_cmp(&b.1.y).unwrap());

    // Simple pairwise overlap resolution
    let mut changed = true;
    let mut iterations = 0;
    while changed && iterations < 50 {
        changed = false;
        iterations += 1;
        for i in 0..entries.len() {
            for j in (i + 1)..entries.len() {
                let a = entries[i].1;
                let b = entries[j].1;
                if a.intersects(&b.expanded(-min_gap)) {
                    // Only resolve if they're close in X (same column)
                    let x_overlap = (a.x < b.x + b.width) && (a.x + a.width > b.x);
                    if x_overlap {
                        let overlap_y =
                            (a.y + a.height + min_gap) - b.y;
                        if overlap_y > 0.0 {
                            entries[j].1.y += overlap_y;
                            changed = true;
                        }
                    }
                }
            }
        }
    }

    // Write back
    for (id, rect) in entries {
        positions.insert(id, rect);
    }
}
