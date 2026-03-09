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
        keyboard::Key::Named(keyboard::key::Named::Escape) => Some(Message::CancelDelete),
        keyboard::Key::Named(keyboard::key::Named::Delete)
        | keyboard::Key::Named(keyboard::key::Named::Backspace) => {
            Some(Message::DeleteSelected)
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
                    "Z" => Some(Message::Redo),
                    "=" | "+" => Some(Message::ZoomIn),
                    "-" => Some(Message::ZoomOut),
                    "0" => Some(Message::ZoomToFit),
                    "/" => Some(Message::ToggleFold),
                    "k" => {
                        if modifiers.shift() {
                            Some(Message::AddDocumentAttachment)
                        } else {
                            Some(Message::AddUrlAttachment)
                        }
                    }
                    "K" => Some(Message::AddDocumentAttachment),
                    "p" if modifiers.shift() => Some(Message::AddPhotoAttachment),
                    "P" => Some(Message::AddPhotoAttachment),
                    _ => None,
                }
            } else {
                None
            }
        }
        _ => None,
    }
}
