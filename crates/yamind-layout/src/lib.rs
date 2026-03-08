pub mod balanced;
pub mod engine;
pub mod radial;
pub mod routing;
pub mod spacing;
pub mod tree;

pub use balanced::BalancedLayout;
pub use engine::{LayoutAlgorithm, LayoutResult};
pub use tree::TreeLayout;

use std::collections::HashMap;
use yamind_core::document::LayoutType;
use yamind_core::geometry::Size;
use yamind_core::id::NodeId;
use yamind_core::Document;

/// Perform layout using the document's configured layout type.
pub fn perform_layout(
    document: &Document,
    node_sizes: &HashMap<NodeId, Size>,
) -> LayoutResult {
    match document.layout_config.layout_type {
        LayoutType::Map => BalancedLayout.layout(document, node_sizes),
        LayoutType::TreeRight | LayoutType::TreeDown => TreeLayout.layout(document, node_sizes),
    }
}
