use crate::geometry::Rect;
use crate::id::NodeId;
use crate::style::{NodeStyle, RichSpan};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NodeContent {
    pub text: String,
    pub rich_spans: Vec<RichSpan>,
    pub notes: String,
}

impl NodeContent {
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            rich_spans: Vec::new(),
            notes: String::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MindMapNode {
    pub id: NodeId,
    pub parent: Option<NodeId>,
    pub children: Vec<NodeId>,
    pub content: NodeContent,
    pub style: NodeStyle,
    pub collapsed: bool,
    /// Manual position override (if user has dragged the node).
    pub manual_position: Option<(f32, f32)>,
    /// Computed bounds from layout engine — not serialized.
    #[serde(skip)]
    pub computed_bounds: Option<Rect>,
}

impl MindMapNode {
    pub fn new(id: NodeId, text: impl Into<String>) -> Self {
        Self {
            id,
            parent: None,
            children: Vec::new(),
            content: NodeContent::new(text),
            style: NodeStyle::empty(),
            collapsed: false,
            manual_position: None,
            computed_bounds: None,
        }
    }

    pub fn depth(&self) -> usize {
        // Depth is computed from the document tree, not stored.
        // This is a placeholder; actual depth is computed by Document.
        0
    }

    pub fn is_root(&self) -> bool {
        self.parent.is_none()
    }
}
