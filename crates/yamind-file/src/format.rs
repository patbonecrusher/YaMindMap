use serde::{Deserialize, Serialize};
use yamind_core::Document;

const FORMAT_VERSION: u32 = 1;

/// Persisted viewport and window state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewState {
    /// Viewport translation (pan offset in world units).
    pub translation: (f32, f32),
    /// Viewport zoom scale.
    pub scale: f32,
    /// Window inner size (logical pixels).
    pub window_size: (f32, f32),
    /// Window position on screen (logical pixels).
    pub window_position: Option<(f32, f32)>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YaMindFile {
    pub version: u32,
    pub document: Document,
    /// Viewport and window state (optional for backward compat with older files).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view_state: Option<ViewState>,
}

impl YaMindFile {
    pub fn new(document: Document) -> Self {
        Self {
            version: FORMAT_VERSION,
            document,
            view_state: None,
        }
    }

    pub fn with_view_state(document: Document, view_state: ViewState) -> Self {
        Self {
            version: FORMAT_VERSION,
            document,
            view_state: Some(view_state),
        }
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}
