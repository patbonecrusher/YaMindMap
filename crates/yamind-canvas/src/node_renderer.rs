use iced::widget::canvas::{Frame, Path, Stroke, Text};
use iced::{Color, Point, Size};
use yamind_core::geometry::Rect;
use yamind_core::style::{NodeShape, NodeStyle};

use crate::text_measure;

/// Width reserved inside the node for the icon/flag side column.
pub const SIDE_COLUMN_WIDTH: f32 = 22.0;

pub fn draw_node(
    frame: &mut Frame,
    bounds: &Rect,
    style: &NodeStyle,
    text: &str,
    is_selected: bool,
    _scale: f32,
    is_left_of_root: bool,
    side_column_width: f32,
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

    // Compute text region: shrink by side column on the appropriate side
    let (text_region_x, text_region_w) = if side_column_width > 0.0 {
        if is_left_of_root {
            // Column on left edge → text shifts right
            (bounds.x + side_column_width, bounds.width - side_column_width)
        } else {
            // Column on right edge → text stays, width shrinks
            (bounds.x, bounds.width - side_column_width)
        }
    } else {
        (bounds.x, bounds.width)
    };

    let usable_width = (text_region_w - padding_h * 2.0).max(1.0);

    let visual_lines = text_measure::wrap_text(text, font_size, usable_width);
    let total_text_height = visual_lines.len() as f32 * line_height;

    // Center text block vertically within bounds
    let text_y = bounds.y + (bounds.height - total_text_height) / 2.0;

    for (i, visual_line) in visual_lines.iter().enumerate() {
        // Measure each line for horizontal alignment
        let line_size = text_measure::measure_text(visual_line, font_size, None);
        let text_x = if shape == NodeShape::Ellipse || shape == NodeShape::Diamond {
            // Always center text in ellipse/diamond
            text_region_x + (text_region_w - line_size.width) / 2.0
        } else if is_left_of_root {
            // Right-align text for nodes left of root
            text_region_x + text_region_w - padding_h - line_size.width
        } else {
            // Left-align text for nodes right of root (and root itself)
            text_region_x + padding_h
        };

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

/// Draw attachment icons in a vertical column inside the node's reserved side region.
/// `padding_h` should match the node's horizontal text padding so icons align with the edge spacing.
pub fn draw_attachment_icons(
    frame: &mut Frame,
    bounds: &Rect,
    attachments: &[yamind_core::node::Attachment],
    _scale: f32,
    is_left_of_root: bool,
    padding_h: f32,
) {
    use yamind_core::node::AttachmentKind;

    let icon_size = 14.0_f32;
    let icon_spacing = 4.0_f32;
    let total_height = attachments.len() as f32 * icon_size
        + (attachments.len().saturating_sub(1)) as f32 * icon_spacing;
    // Center vertically within node
    let start_y = bounds.y + (bounds.height - total_height) / 2.0;
    // Align icon inset from the node edge by the same padding as text
    let icon_x = if is_left_of_root {
        bounds.x + padding_h - icon_size / 2.0
    } else {
        bounds.x + bounds.width - padding_h - icon_size / 2.0
    };

    for (i, attachment) in attachments.iter().enumerate() {
        let y = start_y + i as f32 * (icon_size + icon_spacing);
        let cx = icon_x + icon_size / 2.0;
        let cy = y + icon_size / 2.0;
        let r = icon_size / 2.0;

        // Badge colors per type
        let badge_color = match &attachment.kind {
            AttachmentKind::Url(_) => Color::from_rgb(0.25, 0.65, 0.35),     // green
            AttachmentKind::Document(_) => Color::from_rgb(0.35, 0.45, 0.65), // blue-gray
            AttachmentKind::Photo(_) => Color::from_rgb(0.55, 0.40, 0.70),    // purple
        };
        let white = Color::WHITE;

        // Filled circle badge
        let circle = Path::circle(Point::new(cx, cy), r);
        frame.fill(&circle, badge_color);

        match &attachment.kind {
            AttachmentKind::Url(_) => {
                // External link icon: open box with arrow pointing out top-right
                let s = r * 0.55;
                let lw = 1.5;
                // Box (missing top-right corner) — L-shaped path from top-left
                let box_path = Path::new(|builder| {
                    // Start at top-right area, go down, left, up, right (open top-right corner)
                    builder.move_to(Point::new(cx + s * 0.15, cy - s));  // top edge, slightly left of right
                    builder.line_to(Point::new(cx - s, cy - s));          // top-left
                    builder.line_to(Point::new(cx - s, cy + s));          // bottom-left
                    builder.line_to(Point::new(cx + s, cy + s));          // bottom-right
                    builder.line_to(Point::new(cx + s, cy - s * 0.15));  // right edge, slightly below top
                });
                frame.stroke(
                    &box_path,
                    Stroke::default().with_color(white).with_width(lw),
                );
                // Arrow: diagonal line from center toward top-right
                let arrow_line = Path::line(
                    Point::new(cx - s * 0.1, cy + s * 0.1),
                    Point::new(cx + s, cy - s),
                );
                frame.stroke(
                    &arrow_line,
                    Stroke::default().with_color(white).with_width(lw),
                );
                // Arrowhead: small V at the tip
                let head = Path::new(|builder| {
                    builder.move_to(Point::new(cx + s * 0.35, cy - s));
                    builder.line_to(Point::new(cx + s, cy - s));
                    builder.line_to(Point::new(cx + s, cy - s * 0.35));
                });
                frame.stroke(
                    &head,
                    Stroke::default().with_color(white).with_width(lw),
                );
            }
            AttachmentKind::Document(_) => {
                // Page icon: small rectangle with folded corner
                let w = r * 0.9;
                let h = r * 1.2;
                let px = cx - w / 2.0;
                let py = cy - h / 2.0;
                let fold = w * 0.3;
                let page = Path::new(|builder| {
                    builder.move_to(Point::new(px, py));
                    builder.line_to(Point::new(px + w - fold, py));
                    builder.line_to(Point::new(px + w, py + fold));
                    builder.line_to(Point::new(px + w, py + h));
                    builder.line_to(Point::new(px, py + h));
                    builder.close();
                });
                frame.stroke(
                    &page,
                    Stroke::default().with_color(white).with_width(1.2),
                );
            }
            AttachmentKind::Photo(_) => {
                // Mountain/landscape icon
                let s = r * 0.65;
                let mountain = Path::new(|builder| {
                    builder.move_to(Point::new(cx - s, cy + s * 0.5));
                    builder.line_to(Point::new(cx - s * 0.2, cy - s * 0.6));
                    builder.line_to(Point::new(cx + s * 0.3, cy + s * 0.1));
                    builder.line_to(Point::new(cx + s * 0.5, cy - s * 0.2));
                    builder.line_to(Point::new(cx + s, cy + s * 0.5));
                    builder.close();
                });
                frame.fill(&mountain, white);
            }
        }
    }
}

fn to_iced_color(c: &yamind_core::style::Color) -> Color {
    Color::from_rgba(c.r, c.g, c.b, c.a)
}
