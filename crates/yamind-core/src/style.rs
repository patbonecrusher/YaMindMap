use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl Color {
    pub const WHITE: Color = Color { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    pub const BLACK: Color = Color { r: 0.0, g: 0.0, b: 0.0, a: 1.0 };
    pub const TRANSPARENT: Color = Color { r: 0.0, g: 0.0, b: 0.0, a: 0.0 };

    pub fn rgb(r: f32, g: f32, b: f32) -> Self {
        Self { r, g, b, a: 1.0 }
    }

    pub fn rgba(r: f32, g: f32, b: f32, a: f32) -> Self {
        Self { r, g, b, a }
    }

    pub fn from_hex(hex: &str) -> Option<Self> {
        let hex = hex.trim_start_matches('#');
        if hex.len() != 6 {
            return None;
        }
        let r = u8::from_str_radix(&hex[0..2], 16).ok()? as f32 / 255.0;
        let g = u8::from_str_radix(&hex[2..4], 16).ok()? as f32 / 255.0;
        let b = u8::from_str_radix(&hex[4..6], 16).ok()? as f32 / 255.0;
        Some(Self::rgb(r, g, b))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NodeShape {
    RoundedRect,
    Ellipse,
    Diamond,
    Capsule,
    Underline,
}

impl Default for NodeShape {
    fn default() -> Self {
        Self::RoundedRect
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NodeStyle {
    pub shape: Option<NodeShape>,
    pub fill_color: Option<Color>,
    pub stroke_color: Option<Color>,
    pub stroke_width: Option<f32>,
    pub font_family: Option<String>,
    pub font_size: Option<f32>,
    pub font_color: Option<Color>,
    pub padding_h: Option<f32>,
    pub padding_v: Option<f32>,
    pub min_width: Option<f32>,
    pub max_width: Option<f32>,
    pub corner_radius: Option<f32>,
}

impl NodeStyle {
    pub fn empty() -> Self {
        Self {
            shape: None,
            fill_color: None,
            stroke_color: None,
            stroke_width: None,
            font_family: None,
            font_size: None,
            font_color: None,
            padding_h: None,
            padding_v: None,
            min_width: None,
            max_width: None,
            corner_radius: None,
        }
    }

    /// Merge: self values take priority, fill gaps from `other`.
    pub fn merged_with(&self, other: &NodeStyle) -> NodeStyle {
        NodeStyle {
            shape: self.shape.or(other.shape),
            fill_color: self.fill_color.or(other.fill_color),
            stroke_color: self.stroke_color.or(other.stroke_color),
            stroke_width: self.stroke_width.or(other.stroke_width),
            font_family: self.font_family.clone().or_else(|| other.font_family.clone()),
            font_size: self.font_size.or(other.font_size),
            font_color: self.font_color.or(other.font_color),
            padding_h: self.padding_h.or(other.padding_h),
            padding_v: self.padding_v.or(other.padding_v),
            min_width: self.min_width.or(other.min_width),
            max_width: self.max_width.or(other.max_width),
            corner_radius: self.corner_radius.or(other.corner_radius),
        }
    }
}

impl Default for NodeStyle {
    fn default() -> Self {
        Self::empty()
    }
}

/// Default styles by depth level (root = 0, branch = 1, topic = 2+).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DefaultStyles {
    pub root: NodeStyle,
    pub branch: NodeStyle,
    pub topic: NodeStyle,
}

impl Default for DefaultStyles {
    fn default() -> Self {
        Self {
            root: NodeStyle {
                shape: Some(NodeShape::Ellipse),
                fill_color: Some(Color::from_hex("4A90D9").unwrap()),
                stroke_color: Some(Color::from_hex("2C5F8A").unwrap()),
                stroke_width: Some(2.0),
                font_size: Some(18.0),
                font_color: Some(Color::WHITE),
                padding_h: Some(24.0),
                padding_v: Some(16.0),
                min_width: Some(120.0),
                max_width: Some(300.0),
                corner_radius: Some(8.0),
                ..NodeStyle::empty()
            },
            branch: NodeStyle {
                shape: Some(NodeShape::RoundedRect),
                fill_color: Some(Color::from_hex("5BA5E6").unwrap()),
                stroke_color: Some(Color::from_hex("3D7AB8").unwrap()),
                stroke_width: Some(1.5),
                font_size: Some(14.0),
                font_color: Some(Color::WHITE),
                padding_h: Some(16.0),
                padding_v: Some(10.0),
                min_width: Some(80.0),
                max_width: Some(250.0),
                corner_radius: Some(6.0),
                ..NodeStyle::empty()
            },
            topic: NodeStyle {
                shape: Some(NodeShape::RoundedRect),
                fill_color: Some(Color::from_hex("E8F0FE").unwrap()),
                stroke_color: Some(Color::from_hex("A4C2E8").unwrap()),
                stroke_width: Some(1.0),
                font_size: Some(12.0),
                font_color: Some(Color::from_hex("333333").unwrap()),
                padding_h: Some(12.0),
                padding_v: Some(8.0),
                min_width: Some(60.0),
                max_width: Some(200.0),
                corner_radius: Some(4.0),
                ..NodeStyle::empty()
            },
        }
    }
}

impl DefaultStyles {
    pub fn for_depth(&self, depth: usize) -> &NodeStyle {
        match depth {
            0 => &self.root,
            1 => &self.branch,
            _ => &self.topic,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LineStyle {
    Bezier,
    Straight,
    Elbow,
    Rounded,
}

impl Default for LineStyle {
    fn default() -> Self {
        Self::Bezier
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EdgeStyle {
    pub line_style: LineStyle,
    pub color: Color,
    pub width: f32,
}

impl Default for EdgeStyle {
    fn default() -> Self {
        Self {
            line_style: LineStyle::Bezier,
            color: Color::from_hex("888888").unwrap(),
            width: 2.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RichStyle {
    Bold,
    Italic,
    Underline,
    Color(u8, u8, u8),
    FontSize(u16),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RichSpan {
    pub start: usize,
    pub end: usize,
    pub style: RichStyle,
}
