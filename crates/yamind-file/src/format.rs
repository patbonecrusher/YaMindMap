use serde::{Deserialize, Serialize};
use yamind_core::Document;

const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
pub struct YaMindFile {
    pub version: u32,
    pub document: Document,
}

impl YaMindFile {
    pub fn new(document: Document) -> Self {
        Self {
            version: FORMAT_VERSION,
            document,
        }
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}
