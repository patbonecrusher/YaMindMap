use crate::boundary::Boundary;
use crate::edge::Relationship;
use crate::id::{BoundaryId, NodeId, RelationshipId};
use crate::node::MindMapNode;
use crate::style::{DefaultStyles, EdgeStyle};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LayoutType {
    Map,
    TreeRight,
    TreeDown,
}

impl Default for LayoutType {
    fn default() -> Self {
        Self::Map
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LayoutDirection {
    Balanced,
    LeftOnly,
    RightOnly,
}

impl Default for LayoutDirection {
    fn default() -> Self {
        Self::Balanced
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LayoutConfig {
    pub layout_type: LayoutType,
    pub direction: LayoutDirection,
    pub h_gap: f32,
    pub v_gap: f32,
}

impl Default for LayoutConfig {
    fn default() -> Self {
        Self {
            layout_type: LayoutType::Map,
            direction: LayoutDirection::Balanced,
            h_gap: 60.0,
            v_gap: 20.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub nodes: IndexMap<NodeId, MindMapNode>,
    pub root_id: Option<NodeId>,
    pub relationships: IndexMap<RelationshipId, Relationship>,
    pub boundaries: IndexMap<BoundaryId, Boundary>,
    pub default_styles: DefaultStyles,
    pub default_edge_style: EdgeStyle,
    pub layout_config: LayoutConfig,
}

impl Document {
    pub fn new() -> Self {
        Self {
            nodes: IndexMap::new(),
            root_id: None,
            relationships: IndexMap::new(),
            boundaries: IndexMap::new(),
            default_styles: DefaultStyles::default(),
            default_edge_style: EdgeStyle::default(),
            layout_config: LayoutConfig::default(),
        }
    }

    /// Create a document with a root node.
    pub fn with_root(text: impl Into<String>) -> Self {
        let mut doc = Self::new();
        let id = NodeId::new();
        let node = MindMapNode::new(id, text);
        doc.nodes.insert(id, node);
        doc.root_id = Some(id);
        doc
    }

    pub fn root(&self) -> Option<&MindMapNode> {
        self.root_id.and_then(|id| self.nodes.get(&id))
    }

    pub fn root_mut(&mut self) -> Option<&mut MindMapNode> {
        self.root_id.and_then(|id| self.nodes.get_mut(&id))
    }

    pub fn get_node(&self, id: &NodeId) -> Option<&MindMapNode> {
        self.nodes.get(id)
    }

    pub fn get_node_mut(&mut self, id: &NodeId) -> Option<&mut MindMapNode> {
        self.nodes.get_mut(id)
    }

    /// Compute the depth of a node in the tree.
    pub fn depth_of(&self, id: &NodeId) -> usize {
        let mut depth = 0;
        let mut current = *id;
        while let Some(node) = self.nodes.get(&current) {
            if let Some(parent) = node.parent {
                depth += 1;
                current = parent;
            } else {
                break;
            }
        }
        depth
    }

    /// Add a child node to a parent.
    pub fn add_child(&mut self, parent_id: NodeId, text: impl Into<String>) -> NodeId {
        let child_id = NodeId::new();
        let mut child = MindMapNode::new(child_id, text);
        child.parent = Some(parent_id);

        if let Some(parent) = self.nodes.get_mut(&parent_id) {
            parent.children.push(child_id);
        }
        self.nodes.insert(child_id, child);
        child_id
    }

    /// Add a sibling after the given node.
    pub fn add_sibling(&mut self, sibling_of: NodeId, text: impl Into<String>) -> Option<NodeId> {
        let parent_id = self.nodes.get(&sibling_of)?.parent?;
        let new_id = NodeId::new();
        let mut new_node = MindMapNode::new(new_id, text);
        new_node.parent = Some(parent_id);

        let parent = self.nodes.get_mut(&parent_id)?;
        let pos = parent
            .children
            .iter()
            .position(|c| *c == sibling_of)
            .unwrap_or(parent.children.len());
        parent.children.insert(pos + 1, new_id);

        self.nodes.insert(new_id, new_node);
        Some(new_id)
    }

    /// Remove a node and all its descendants. Returns removed nodes.
    pub fn remove_subtree(&mut self, id: NodeId) -> Vec<MindMapNode> {
        let mut removed = Vec::new();
        let mut stack = vec![id];

        // Remove from parent's children list
        if let Some(node) = self.nodes.get(&id) {
            if let Some(parent_id) = node.parent {
                if let Some(parent) = self.nodes.get_mut(&parent_id) {
                    parent.children.retain(|c| *c != id);
                }
            }
        }

        while let Some(node_id) = stack.pop() {
            if let Some(node) = self.nodes.swap_remove(&node_id) {
                stack.extend(node.children.iter());
                removed.push(node);
            }
        }

        if self.root_id == Some(id) {
            self.root_id = None;
        }

        removed
    }

    /// Move a node to a new parent at the given child index.
    /// Also handles reordering within the same parent.
    /// Returns `(old_parent_id, old_child_index)` for undo, or `None` if the move is invalid.
    pub fn move_node(
        &mut self,
        node_id: NodeId,
        new_parent_id: NodeId,
        insert_index: usize,
    ) -> Option<(NodeId, usize)> {
        // Can't move root
        let old_parent_id = self.nodes.get(&node_id)?.parent?;

        // Can't move a node into its own subtree
        if self.is_ancestor_of(node_id, new_parent_id) {
            return None;
        }

        // Find old index
        let old_index = self
            .nodes
            .get(&old_parent_id)?
            .children
            .iter()
            .position(|c| *c == node_id)?;

        // Remove from old parent
        self.nodes.get_mut(&old_parent_id)?.children.remove(old_index);

        // Adjust insert index if moving within the same parent and the
        // removal shifted indices
        let adjusted_index = if old_parent_id == new_parent_id && insert_index > old_index {
            insert_index - 1
        } else {
            insert_index
        };

        // Insert into new parent
        let new_parent = self.nodes.get_mut(&new_parent_id)?;
        let clamped = adjusted_index.min(new_parent.children.len());
        new_parent.children.insert(clamped, node_id);

        // Update node's parent pointer
        self.nodes.get_mut(&node_id)?.parent = Some(new_parent_id);

        Some((old_parent_id, old_index))
    }

    /// Check if `ancestor_id` is an ancestor of `descendant_id`.
    pub fn is_ancestor_of(&self, ancestor_id: NodeId, descendant_id: NodeId) -> bool {
        let mut current = descendant_id;
        while let Some(node) = self.nodes.get(&current) {
            if let Some(parent) = node.parent {
                if parent == ancestor_id {
                    return true;
                }
                current = parent;
            } else {
                break;
            }
        }
        false
    }

    /// Collect all visible node IDs (skip collapsed subtrees).
    pub fn visible_node_ids(&self) -> Vec<NodeId> {
        let Some(root_id) = self.root_id else {
            return Vec::new();
        };
        let mut result = Vec::new();
        let mut stack = vec![root_id];
        while let Some(id) = stack.pop() {
            result.push(id);
            if let Some(node) = self.nodes.get(&id) {
                if !node.collapsed {
                    for child_id in node.children.iter().rev() {
                        stack.push(*child_id);
                    }
                }
            }
        }
        result
    }
}

impl Default for Document {
    fn default() -> Self {
        Self::new()
    }
}
