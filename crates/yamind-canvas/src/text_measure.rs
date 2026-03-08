use iced::advanced::graphics::text::Paragraph;
use iced::advanced::text::Paragraph as ParagraphTrait;
use iced::advanced::text::Text;
use iced::{Font, Size};

fn make_paragraph(content: &str, font_size: f32, max_width: Option<f32>) -> Paragraph {
    let bounds = Size::new(
        max_width.unwrap_or(f32::INFINITY),
        f32::INFINITY,
    );

    Paragraph::with_text(Text {
        content,
        bounds,
        size: font_size.into(),
        line_height: iced::widget::text::LineHeight::Relative(1.3),
        font: Font::DEFAULT,
        horizontal_alignment: iced::alignment::Horizontal::Left,
        vertical_alignment: iced::alignment::Vertical::Top,
        shaping: iced::widget::text::Shaping::Advanced,
        wrapping: iced::widget::text::Wrapping::Word,
    })
}

/// Measure the pixel bounds of `content` at the given `font_size`,
/// wrapping to `max_width` if provided.
pub fn measure_text(content: &str, font_size: f32, max_width: Option<f32>) -> Size {
    make_paragraph(content, font_size, max_width).min_bounds()
}

/// Returns the visual lines after word-wrapping `content` within `max_width`.
/// Each entry is the text of one visual line.
pub fn wrap_text(content: &str, font_size: f32, max_width: f32) -> Vec<String> {
    let paragraph = make_paragraph(content, font_size, Some(max_width));
    let buffer = paragraph.buffer();

    let mut lines = Vec::new();
    for run in buffer.layout_runs() {
        // Extract the visual line text from glyph byte ranges
        if run.glyphs.is_empty() {
            lines.push(String::new());
        } else {
            let start = run.glyphs.first().unwrap().start;
            let end = run.glyphs.last().unwrap().end;
            lines.push(run.text[start..end].to_string());
        }
    }

    if lines.is_empty() {
        lines.push(String::new());
    }

    lines
}
