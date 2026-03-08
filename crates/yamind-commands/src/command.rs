use yamind_core::Document;

/// A reversible command that can be executed and undone.
pub trait Command: std::fmt::Debug {
    fn execute(&mut self, doc: &mut Document);
    fn undo(&mut self, doc: &mut Document);
    fn description(&self) -> &str;
}
