use iced::keyboard;

use crate::message::Message;

pub fn handle_key(key: keyboard::Key, modifiers: keyboard::Modifiers) -> Option<Message> {
    match key.as_ref() {
        keyboard::Key::Named(keyboard::key::Named::Tab) => Some(Message::AddChild),
        keyboard::Key::Named(keyboard::key::Named::Enter) => {
            if modifiers.shift() {
                None // Reserved for inline editing
            } else {
                Some(Message::AddSibling)
            }
        }
        keyboard::Key::Named(keyboard::key::Named::Delete)
        | keyboard::Key::Named(keyboard::key::Named::Backspace) => {
            if modifiers.command() || modifiers.shift() {
                Some(Message::DeleteSelected)
            } else {
                None
            }
        }
        keyboard::Key::Character(ref c) => {
            let c: &str = c;
            if modifiers.command() {
                match c {
                    "z" => {
                        if modifiers.shift() {
                            Some(Message::Redo)
                        } else {
                            Some(Message::Undo)
                        }
                    }
                    "=" | "+" => Some(Message::ZoomIn),
                    "-" => Some(Message::ZoomOut),
                    "0" => Some(Message::ZoomToFit),
                    _ => None,
                }
            } else {
                None
            }
        }
        _ => None,
    }
}
