use yamind_core::boundary::Boundary;
use yamind_core::id::{BoundaryId, NodeId};

use crate::command::Command;

/// Create a new boundary around a set of nodes.
#[derive(Debug)]
pub struct AddBoundaryCommand {
    node_ids: Vec<NodeId>,
    boundary_id: BoundaryId,
    created: Option<Boundary>,
}

impl AddBoundaryCommand {
    pub fn new(node_ids: Vec<NodeId>) -> Self {
        let boundary_id = BoundaryId::new();
        Self {
            node_ids,
            boundary_id,
            created: None,
        }
    }

    pub fn created_id(&self) -> BoundaryId {
        self.boundary_id
    }
}

impl Command for AddBoundaryCommand {
    fn execute(&mut self, doc: &mut yamind_core::Document) {
        if let Some(boundary) = self.created.take() {
            // Re-execute (redo) — restore the same boundary
            doc.boundaries.insert(self.boundary_id, boundary);
        } else {
            let mut boundary = Boundary::new(self.node_ids.clone());
            boundary.id = self.boundary_id;
            doc.boundaries.insert(self.boundary_id, boundary);
        }
    }

    fn undo(&mut self, doc: &mut yamind_core::Document) {
        self.created = doc.boundaries.swap_remove(&self.boundary_id);
    }

    fn description(&self) -> &str {
        "Add Boundary"
    }
}

/// Delete a boundary.
#[derive(Debug)]
pub struct DeleteBoundaryCommand {
    boundary_id: BoundaryId,
    removed: Option<Boundary>,
}

impl DeleteBoundaryCommand {
    pub fn new(boundary_id: BoundaryId) -> Self {
        Self {
            boundary_id,
            removed: None,
        }
    }
}

impl Command for DeleteBoundaryCommand {
    fn execute(&mut self, doc: &mut yamind_core::Document) {
        self.removed = doc.boundaries.swap_remove(&self.boundary_id);
    }

    fn undo(&mut self, doc: &mut yamind_core::Document) {
        if let Some(boundary) = self.removed.take() {
            doc.boundaries.insert(self.boundary_id, boundary);
        }
    }

    fn description(&self) -> &str {
        "Delete Boundary"
    }
}

/// Edit a boundary's label.
#[derive(Debug)]
pub struct EditBoundaryLabelCommand {
    boundary_id: BoundaryId,
    new_label: String,
    old_label: Option<String>,
}

impl EditBoundaryLabelCommand {
    pub fn new(boundary_id: BoundaryId, new_label: String) -> Self {
        Self {
            boundary_id,
            new_label,
            old_label: None,
        }
    }
}

impl Command for EditBoundaryLabelCommand {
    fn execute(&mut self, doc: &mut yamind_core::Document) {
        if let Some(boundary) = doc.boundaries.get_mut(&self.boundary_id) {
            self.old_label = Some(boundary.label.clone());
            boundary.label = self.new_label.clone();
        }
    }

    fn undo(&mut self, doc: &mut yamind_core::Document) {
        if let Some(old) = self.old_label.take() {
            if let Some(boundary) = doc.boundaries.get_mut(&self.boundary_id) {
                boundary.label = old;
            }
        }
    }

    fn description(&self) -> &str {
        "Edit Boundary Label"
    }
}
