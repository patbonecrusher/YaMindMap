use yamind_core::Document;

/// A reversible command that can be executed and undone.
pub trait Command: std::fmt::Debug {
    fn execute(&mut self, doc: &mut Document);
    fn undo(&mut self, doc: &mut Document);
    fn description(&self) -> &str;
    /// Update the text associated with this command (for new-node edit flow).
    fn set_text(&mut self, _text: String) {}
}
