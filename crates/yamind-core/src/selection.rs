use crate::id::NodeId;
use std::collections::HashSet;

#[derive(Debug, Clone, Default)]
pub struct Selection {
    pub nodes: HashSet<NodeId>,
}

impl Selection {
    pub fn new() -> Self {
        Self {
            nodes: HashSet::new(),
        }
    }

    pub fn clear(&mut self) {
        self.nodes.clear();
    }

    pub fn select(&mut self, id: NodeId) {
        self.nodes.clear();
        self.nodes.insert(id);
    }

    pub fn toggle(&mut self, id: NodeId) {
        if !self.nodes.remove(&id) {
            self.nodes.insert(id);
        }
    }

    pub fn add(&mut self, id: NodeId) {
        self.nodes.insert(id);
    }

    pub fn is_selected(&self, id: &NodeId) -> bool {
        self.nodes.contains(id)
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    pub fn single(&self) -> Option<NodeId> {
        if self.nodes.len() == 1 {
            self.nodes.iter().next().copied()
        } else {
            None
        }
    }

    pub fn count(&self) -> usize {
        self.nodes.len()
    }
}
