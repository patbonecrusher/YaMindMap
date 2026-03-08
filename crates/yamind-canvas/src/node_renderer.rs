use iced::widget::canvas::{Frame, Path, Stroke, Text};
use iced::{Color, Point, Size};
use yamind_core::geometry::Rect;
use yamind_core::style::{NodeShape, NodeStyle};

use crate::text_measure;

pub fn draw_node(
    frame: &mut Frame,
    bounds: &Rect,
    style: &NodeStyle,
    text: &str,
    is_selected: bool,
    _scale: f32,
) {
    let shape = style.shape.unwrap_or(NodeShape::RoundedRect);
    let fill = to_iced_color(
        &style
            .fill_color
            .unwrap_or(yamind_core::style::Color::from_hex("4A90D9").unwrap()),
    );
    let stroke_color = to_iced_color(
        &style
            .stroke_color
            .unwrap_or(yamind_core::style::Color::from_hex("2C5F8A").unwrap()),
    );
    let stroke_width = style.stroke_width.unwrap_or(1.5);
    let _corner_radius = style.corner_radius.unwrap_or(6.0);

    let top_left = Point::new(bounds.x, bounds.y);
    let size = Size::new(bounds.width, bounds.height);

    match shape {
        NodeShape::RoundedRect => {
            let path = Path::rectangle(top_left, size);
            frame.fill(&path, fill);
            frame.stroke(
                &path,
                Stroke::default()
                    .with_color(if is_selected {
                        Color::from_rgb(1.0, 0.6, 0.0)
                    } else {
                        stroke_color
                    })
                    .with_width(if is_selected {
                        stroke_width + 1.5
                    } else {
                        stroke_width
                    }),
            );
        }
        NodeShape::Ellipse => {
            let cx = bounds.x + bounds.width / 2.0;
            let cy = bounds.y + bounds.height / 2.0;
            let rx = bounds.width / 2.0;
            let ry = bounds.height / 2.0;
            let path = Path::new(|builder| {
                // Approximate ellipse with 4 bezier curves
                let kx = rx * 0.5522848;
                let ky = ry * 0.5522848;
                builder.move_to(Point::new(cx, cy - ry));
                builder.bezier_curve_to(
                    Point::new(cx + kx, cy - ry),
                    Point::new(cx + rx, cy - ky),
                    Point::new(cx + rx, cy),
                );
                builder.bezier_curve_to(
                    Point::new(cx + rx, cy + ky),
                    Point::new(cx + kx, cy + ry),
                    Point::new(cx, cy + ry),
                );
                builder.bezier_curve_to(
                    Point::new(cx - kx, cy + ry),
                    Point::new(cx - rx, cy + ky),
                    Point::new(cx - rx, cy),
                );
                builder.bezier_curve_to(
                    Point::new(cx - rx, cy - ky),
                    Point::new(cx - kx, cy - ry),
                    Point::new(cx, cy - ry),
                );
                builder.close();
            });
            frame.fill(&path, fill);
            frame.stroke(
                &path,
                Stroke::default()
                    .with_color(if is_selected {
                        Color::from_rgb(1.0, 0.6, 0.0)
                    } else {
                        stroke_color
                    })
                    .with_width(if is_selected {
                        stroke_width + 1.5
                    } else {
                        stroke_width
                    }),
            );
        }
        NodeShape::Diamond => {
            let cx = bounds.x + bounds.width / 2.0;
            let cy = bounds.y + bounds.height / 2.0;
            let path = Path::new(|builder| {
                builder.move_to(Point::new(cx, bounds.y));
                builder.line_to(Point::new(bounds.x + bounds.width, cy));
                builder.line_to(Point::new(cx, bounds.y + bounds.height));
                builder.line_to(Point::new(bounds.x, cy));
                builder.close();
            });
            frame.fill(&path, fill);
            frame.stroke(
                &path,
                Stroke::default()
                    .with_color(if is_selected {
                        Color::from_rgb(1.0, 0.6, 0.0)
                    } else {
                        stroke_color
                    })
                    .with_width(if is_selected {
                        stroke_width + 1.5
                    } else {
                        stroke_width
                    }),
            );
        }
        NodeShape::Capsule | NodeShape::Underline => {
            // Capsule: just use a rounded rect for now
            let path = Path::rectangle(top_left, size);
            frame.fill(&path, fill);
            frame.stroke(
                &path,
                Stroke::default()
                    .with_color(if is_selected {
                        Color::from_rgb(1.0, 0.6, 0.0)
                    } else {
                        stroke_color
                    })
                    .with_width(if is_selected {
                        stroke_width + 1.5
                    } else {
                        stroke_width
                    }),
            );
        }
    }

    // Draw text (multiline with proper word wrapping via iced's text shaping)
    let font_size = style.font_size.unwrap_or(14.0);
    let font_color = to_iced_color(
        &style
            .font_color
            .unwrap_or(yamind_core::style::Color::WHITE),
    );
    let padding_h = style.padding_h.unwrap_or(12.0);
    let _padding_v = style.padding_v.unwrap_or(8.0);
    let line_height = font_size * 1.3;
    let usable_width = (bounds.width - padding_h * 2.0).max(1.0);

    let visual_lines = text_measure::wrap_text(text, font_size, usable_width);
    let total_text_height = visual_lines.len() as f32 * line_height;

    // Center text block vertically within bounds
    let text_y = bounds.y + (bounds.height - total_text_height) / 2.0;

    for (i, visual_line) in visual_lines.iter().enumerate() {
        // Measure each line to center it horizontally
        let line_size = text_measure::measure_text(visual_line, font_size, None);
        let text_x = bounds.x + (bounds.width - line_size.width) / 2.0;

        let text_pos = Point::new(text_x, text_y + i as f32 * line_height);
        let label = Text {
            content: visual_line.clone(),
            position: text_pos,
            color: font_color,
            size: font_size.into(),
            ..Text::default()
        };
        frame.fill_text(label);
    }
}

fn to_iced_color(c: &yamind_core::style::Color) -> Color {
    Color::from_rgba(c.r, c.g, c.b, c.a)
}
