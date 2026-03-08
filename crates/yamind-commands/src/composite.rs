use crate::command::Command;
use yamind_core::Document;

/// A batch of commands executed as a single undoable unit.
#[derive(Debug)]
pub struct CompositeCommand {
    description: String,
    commands: Vec<Box<dyn Command>>,
}

impl CompositeCommand {
    pub fn new(description: impl Into<String>, commands: Vec<Box<dyn Command>>) -> Self {
        Self {
            description: description.into(),
            commands,
        }
    }
}

impl Command for CompositeCommand {
    fn execute(&mut self, doc: &mut Document) {
        for cmd in &mut self.commands {
            cmd.execute(doc);
        }
    }

    fn undo(&mut self, doc: &mut Document) {
        for cmd in self.commands.iter_mut().rev() {
            cmd.undo(doc);
        }
    }

    fn description(&self) -> &str {
        &self.description
    }
}
