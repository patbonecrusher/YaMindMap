use crate::command::Command;
use yamind_core::id::NodeId;
use yamind_core::node::{Attachment, MindMapNode};
use yamind_core::Document;

#[derive(Debug)]
pub struct AddChildCommand {
    parent_id: NodeId,
    text: String,
    created_id: Option<NodeId>,
}

impl AddChildCommand {
    pub fn new(parent_id: NodeId, text: impl Into<String>) -> Self {
        Self {
            parent_id,
            text: text.into(),
            created_id: None,
        }
    }

    pub fn created_id(&self) -> Option<NodeId> {
        self.created_id
    }
}

impl Command for AddChildCommand {
    fn execute(&mut self, doc: &mut Document) {
        let id = if let Some(existing_id) = self.created_id {
            // Redo: reuse the same ID so subsequent commands still reference it
            doc.add_child_with_id(self.parent_id, existing_id, &self.text)
        } else {
            doc.add_child(self.parent_id, &self.text)
        };
        self.created_id = Some(id);
    }

    fn undo(&mut self, doc: &mut Document) {
        if let Some(id) = self.created_id {
            doc.remove_subtree(id);
        }
    }

    fn description(&self) -> &str {
        "Add child node"
    }

    fn set_text(&mut self, text: String) {
        self.text = text;
    }
}

#[derive(Debug)]
pub struct AddSiblingCommand {
    sibling_of: NodeId,
    text: String,
    created_id: Option<NodeId>,
}

impl AddSiblingCommand {
    pub fn new(sibling_of: NodeId, text: impl Into<String>) -> Self {
        Self {
            sibling_of,
            text: text.into(),
            created_id: None,
        }
    }

    pub fn created_id(&self) -> Option<NodeId> {
        self.created_id
    }
}

impl Command for AddSiblingCommand {
    fn execute(&mut self, doc: &mut Document) {
        self.created_id = if let Some(existing_id) = self.created_id {
            doc.add_sibling_with_id(self.sibling_of, existing_id, &self.text)
        } else {
            doc.add_sibling(self.sibling_of, &self.text)
        };
    }

    fn undo(&mut self, doc: &mut Document) {
        if let Some(id) = self.created_id {
            doc.remove_subtree(id);
        }
    }

    fn description(&self) -> &str {
        "Add sibling node"
    }

    fn set_text(&mut self, text: String) {
        self.text = text;
    }
}

#[derive(Debug)]
pub struct DeleteNodeCommand {
    node_id: NodeId,
    removed_nodes: Vec<MindMapNode>,
    parent_id: Option<NodeId>,
    child_index: Option<usize>,
}

impl DeleteNodeCommand {
    pub fn new(node_id: NodeId) -> Self {
        Self {
            node_id,
            removed_nodes: Vec::new(),
            parent_id: None,
            child_index: None,
        }
    }
}

impl Command for DeleteNodeCommand {
    fn execute(&mut self, doc: &mut Document) {
        // Record parent info for undo
        if let Some(node) = doc.get_node(&self.node_id) {
            self.parent_id = node.parent;
            if let Some(parent_id) = node.parent {
                if let Some(parent) = doc.get_node(&parent_id) {
                    self.child_index = parent
                        .children
                        .iter()
                        .position(|c| *c == self.node_id);
                }
            }
        }
        self.removed_nodes = doc.remove_subtree(self.node_id);
    }

    fn undo(&mut self, doc: &mut Document) {
        // Re-insert all removed nodes
        for node in self.removed_nodes.drain(..) {
            doc.nodes.insert(node.id, node);
        }
        // Re-attach to parent
        if let Some(parent_id) = self.parent_id {
            if let Some(parent) = doc.get_node_mut(&parent_id) {
                let idx = self.child_index.unwrap_or(parent.children.len());
                parent.children.insert(idx, self.node_id);
            }
        }
    }

    fn description(&self) -> &str {
        "Delete node"
    }
}

/// Delete a node but reparent its children to the deleted node's parent.
#[derive(Debug)]
pub struct DeleteAndReparentCommand {
    node_id: NodeId,
    removed_node: Option<MindMapNode>,
    parent_id: Option<NodeId>,
    child_index: Option<usize>,
    children: Vec<NodeId>,
}

impl DeleteAndReparentCommand {
    pub fn new(node_id: NodeId) -> Self {
        Self {
            node_id,
            removed_node: None,
            parent_id: None,
            child_index: None,
            children: Vec::new(),
        }
    }
}

impl Command for DeleteAndReparentCommand {
    fn execute(&mut self, doc: &mut Document) {
        if let Some(node) = doc.get_node(&self.node_id) {
            self.parent_id = node.parent;
            self.children = node.children.clone();
            if let Some(parent_id) = node.parent {
                if let Some(parent) = doc.get_node(&parent_id) {
                    self.child_index = parent
                        .children
                        .iter()
                        .position(|c| *c == self.node_id);
                }
            }
        }

        // Reparent children to the deleted node's parent at the same position
        if let Some(parent_id) = self.parent_id {
            let idx = self.child_index.unwrap_or(0);
            // Remove self from parent's children
            if let Some(parent) = doc.get_node_mut(&parent_id) {
                parent.children.retain(|c| *c != self.node_id);
            }
            // Insert children where self was
            for (i, child_id) in self.children.iter().enumerate() {
                if let Some(child) = doc.get_node_mut(child_id) {
                    child.parent = Some(parent_id);
                }
                if let Some(parent) = doc.get_node_mut(&parent_id) {
                    let insert_at = (idx + i).min(parent.children.len());
                    parent.children.insert(insert_at, *child_id);
                }
            }
        }

        // Remove just the node itself (not its subtree)
        self.removed_node = doc.nodes.swap_remove(&self.node_id);
    }

    fn undo(&mut self, doc: &mut Document) {
        // Re-insert the deleted node
        if let Some(node) = self.removed_node.take() {
            doc.nodes.insert(node.id, node);
        }

        if let Some(parent_id) = self.parent_id {
            // Remove children from parent's children list
            if let Some(parent) = doc.get_node_mut(&parent_id) {
                parent.children.retain(|c| !self.children.contains(c));
            }
            // Re-insert self at original position
            if let Some(parent) = doc.get_node_mut(&parent_id) {
                let idx = self.child_index.unwrap_or(parent.children.len());
                parent.children.insert(idx, self.node_id);
            }
        }

        // Reparent children back to deleted node
        for child_id in &self.children {
            if let Some(child) = doc.get_node_mut(child_id) {
                child.parent = Some(self.node_id);
            }
        }
    }

    fn description(&self) -> &str {
        "Delete node (keep children)"
    }
}

/// Move a node to a new parent (reparent) or reorder within the same parent.
#[derive(Debug)]
pub struct MoveNodeCommand {
    node_id: NodeId,
    new_parent_id: NodeId,
    new_index: usize,
    old_parent_id: Option<NodeId>,
    old_index: Option<usize>,
}

impl MoveNodeCommand {
    pub fn new(node_id: NodeId, new_parent_id: NodeId, new_index: usize) -> Self {
        Self {
            node_id,
            new_parent_id,
            new_index,
            old_parent_id: None,
            old_index: None,
        }
    }
}

impl Command for MoveNodeCommand {
    fn execute(&mut self, doc: &mut Document) {
        if let Some((old_parent, old_idx)) =
            doc.move_node(self.node_id, self.new_parent_id, self.new_index)
        {
            self.old_parent_id = Some(old_parent);
            self.old_index = Some(old_idx);
        }
    }

    fn undo(&mut self, doc: &mut Document) {
        if let (Some(old_parent), Some(old_idx)) = (self.old_parent_id, self.old_index) {
            doc.move_node(self.node_id, old_parent, old_idx);
        }
    }

    fn description(&self) -> &str {
        "Move node"
    }
}

#[derive(Debug)]
pub struct EditTextCommand {
    node_id: NodeId,
    new_text: String,
    old_text: String,
}

impl EditTextCommand {
    pub fn new(node_id: NodeId, new_text: impl Into<String>) -> Self {
        Self {
            node_id,
            new_text: new_text.into(),
            old_text: String::new(),
        }
    }
}

impl Command for EditTextCommand {
    fn execute(&mut self, doc: &mut Document) {
        if let Some(node) = doc.get_node_mut(&self.node_id) {
            self.old_text = node.content.text.clone();
            node.content.text = self.new_text.clone();
        }
    }

    fn undo(&mut self, doc: &mut Document) {
        if let Some(node) = doc.get_node_mut(&self.node_id) {
            node.content.text = self.old_text.clone();
        }
    }

    fn description(&self) -> &str {
        "Edit text"
    }
}

#[derive(Debug)]
pub struct AddAttachmentCommand {
    node_id: NodeId,
    attachment: Attachment,
    index: Option<usize>,
}

impl AddAttachmentCommand {
    pub fn new(node_id: NodeId, attachment: Attachment) -> Self {
        Self {
            node_id,
            attachment,
            index: None,
        }
    }
}

impl Command for AddAttachmentCommand {
    fn execute(&mut self, doc: &mut Document) {
        if let Some(node) = doc.get_node_mut(&self.node_id) {
            node.content.attachments.push(self.attachment.clone());
            self.index = Some(node.content.attachments.len() - 1);
        }
    }

    fn undo(&mut self, doc: &mut Document) {
        if let Some(idx) = self.index {
            if let Some(node) = doc.get_node_mut(&self.node_id) {
                if idx < node.content.attachments.len() {
                    node.content.attachments.remove(idx);
                }
            }
        }
    }

    fn description(&self) -> &str {
        "Add attachment"
    }
}

#[derive(Debug)]
pub struct RemoveAttachmentCommand {
    node_id: NodeId,
    index: usize,
    removed: Option<Attachment>,
}

impl RemoveAttachmentCommand {
    pub fn new(node_id: NodeId, index: usize) -> Self {
        Self {
            node_id,
            index,
            removed: None,
        }
    }
}

impl Command for RemoveAttachmentCommand {
    fn execute(&mut self, doc: &mut Document) {
        if let Some(node) = doc.get_node_mut(&self.node_id) {
            if self.index < node.content.attachments.len() {
                self.removed = Some(node.content.attachments.remove(self.index));
            }
        }
    }

    fn undo(&mut self, doc: &mut Document) {
        if let Some(attachment) = self.removed.take() {
            if let Some(node) = doc.get_node_mut(&self.node_id) {
                let idx = self.index.min(node.content.attachments.len());
                node.content.attachments.insert(idx, attachment);
            }
        }
    }

    fn description(&self) -> &str {
        "Remove attachment"
    }
}
