use std::collections::HashMap;

use iced::widget::canvas::{Frame, Path, Stroke, Text};
use iced::{Color, Point, Size};

use yamind_core::boundary::Boundary;
use yamind_core::geometry::Rect;
use yamind_core::id::NodeId;

use crate::text_measure;

/// Compute the bounding rectangle of a boundary from its member nodes' positions.
pub fn compute_boundary_rect(
    boundary: &Boundary,
    positions: &HashMap<NodeId, Rect>,
) -> Option<Rect> {
    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;
    let mut found = false;

    for nid in &boundary.node_ids {
        if let Some(rect) = positions.get(nid) {
            found = true;
            min_x = min_x.min(rect.x);
            min_y = min_y.min(rect.y);
            max_x = max_x.max(rect.x + rect.width);
            max_y = max_y.max(rect.y + rect.height);
        }
    }

    if !found {
        return None;
    }

    let pad = boundary.padding;
    Some(Rect::new(
        min_x - pad,
        min_y - pad,
        (max_x - min_x) + pad * 2.0,
        (max_y - min_y) + pad * 2.0,
    ))
}

/// Draw a boundary rectangle with optional label.
pub fn draw_boundary(
    frame: &mut Frame,
    boundary: &Boundary,
    bounds: &Rect,
    is_selected: bool,
) {
    let corner_radius = 8.0;
    let fill_color = Color::from_rgba(
        boundary.fill_color.r,
        boundary.fill_color.g,
        boundary.fill_color.b,
        boundary.fill_color.a,
    );
    let stroke_color = if is_selected {
        Color::from_rgb(1.0, 0.6, 0.0)
    } else {
        Color::from_rgba(
            boundary.stroke_color.r,
            boundary.stroke_color.g,
            boundary.stroke_color.b,
            boundary.stroke_color.a,
        )
    };

    // Rounded rectangle path
    let path = rounded_rect_path(bounds, corner_radius);

    // Fill
    frame.fill(&path, fill_color);

    // Dashed stroke
    let stroke_width = if is_selected {
        boundary.stroke_width + 1.0
    } else {
        boundary.stroke_width
    };

    // Draw dashed border by stroking segments of the rounded rect perimeter
    draw_dashed_rounded_rect(frame, bounds, corner_radius, stroke_color, stroke_width, 8.0, 8.0);

    // Draw label if present
    if !boundary.label.is_empty() {
        let font_size = 12.0;
        let label_padding = 4.0;
        let text_size = text_measure::measure_text(&boundary.label, font_size, None);

        // Background for label
        let label_bg_rect = Rect::new(
            bounds.x + 12.0 - label_padding,
            bounds.y - text_size.height / 2.0 - label_padding,
            text_size.width + label_padding * 2.0,
            text_size.height + label_padding * 2.0,
        );
        let bg_path = Path::rectangle(
            Point::new(label_bg_rect.x, label_bg_rect.y),
            Size::new(label_bg_rect.width, label_bg_rect.height),
        );
        frame.fill(&bg_path, Color::from_rgba(0.15, 0.15, 0.2, 0.9));

        let label = Text {
            content: boundary.label.clone(),
            position: Point::new(bounds.x + 12.0, bounds.y - text_size.height / 2.0),
            color: stroke_color,
            size: font_size.into(),
            ..Text::default()
        };
        frame.fill_text(label);
    }

}

fn rounded_rect_path(bounds: &Rect, r: f32) -> Path {
    Path::new(|builder| {
        let x = bounds.x;
        let y = bounds.y;
        let w = bounds.width;
        let h = bounds.height;
        let r = r.min(w / 2.0).min(h / 2.0);
        let k = r * 0.5522848; // bezier approximation of quarter circle

        // Start at top-left after corner
        builder.move_to(Point::new(x + r, y));
        // Top edge
        builder.line_to(Point::new(x + w - r, y));
        // Top-right corner
        builder.bezier_curve_to(
            Point::new(x + w - r + k, y),
            Point::new(x + w, y + r - k),
            Point::new(x + w, y + r),
        );
        // Right edge
        builder.line_to(Point::new(x + w, y + h - r));
        // Bottom-right corner
        builder.bezier_curve_to(
            Point::new(x + w, y + h - r + k),
            Point::new(x + w - r + k, y + h),
            Point::new(x + w - r, y + h),
        );
        // Bottom edge
        builder.line_to(Point::new(x + r, y + h));
        // Bottom-left corner
        builder.bezier_curve_to(
            Point::new(x + r - k, y + h),
            Point::new(x, y + h - r + k),
            Point::new(x, y + h - r),
        );
        // Left edge
        builder.line_to(Point::new(x, y + r));
        // Top-left corner
        builder.bezier_curve_to(
            Point::new(x, y + r - k),
            Point::new(x + r - k, y),
            Point::new(x + r, y),
        );
        builder.close();
    })
}

fn draw_dashed_rounded_rect(
    frame: &mut Frame,
    bounds: &Rect,
    r: f32,
    color: Color,
    width: f32,
    dash_len: f32,
    gap_len: f32,
) {
    let x = bounds.x;
    let y = bounds.y;
    let w = bounds.width;
    let h = bounds.height;
    let r = r.min(w / 2.0).min(h / 2.0);

    // Collect line segments along the rounded rect perimeter
    // For simplicity, draw the straight edges dashed and corners solid
    let stroke = Stroke::default().with_color(color).with_width(width);

    // Draw corners as solid arcs (small enough that dashing looks odd)
    let corner_k = r * 0.5522848; // bezier approximation

    // Top-right corner
    let tr = Path::new(|b| {
        b.move_to(Point::new(x + w - r, y));
        b.bezier_curve_to(
            Point::new(x + w - r + corner_k, y),
            Point::new(x + w, y + r - corner_k),
            Point::new(x + w, y + r),
        );
    });
    frame.stroke(&tr, stroke.clone());

    // Bottom-right corner
    let br = Path::new(|b| {
        b.move_to(Point::new(x + w, y + h - r));
        b.bezier_curve_to(
            Point::new(x + w, y + h - r + corner_k),
            Point::new(x + w - r + corner_k, y + h),
            Point::new(x + w - r, y + h),
        );
    });
    frame.stroke(&br, stroke.clone());

    // Bottom-left corner
    let bl = Path::new(|b| {
        b.move_to(Point::new(x + r, y + h));
        b.bezier_curve_to(
            Point::new(x + r - corner_k, y + h),
            Point::new(x, y + h - r + corner_k),
            Point::new(x, y + h - r),
        );
    });
    frame.stroke(&bl, stroke.clone());

    // Top-left corner
    let tl = Path::new(|b| {
        b.move_to(Point::new(x, y + r));
        b.bezier_curve_to(
            Point::new(x, y + r - corner_k),
            Point::new(x + r - corner_k, y),
            Point::new(x + r, y),
        );
    });
    frame.stroke(&tl, stroke.clone());

    // Dashed straight edges
    draw_dashed_line(frame, Point::new(x + r, y), Point::new(x + w - r, y), color, width, dash_len, gap_len);
    draw_dashed_line(frame, Point::new(x + w, y + r), Point::new(x + w, y + h - r), color, width, dash_len, gap_len);
    draw_dashed_line(frame, Point::new(x + w - r, y + h), Point::new(x + r, y + h), color, width, dash_len, gap_len);
    draw_dashed_line(frame, Point::new(x, y + h - r), Point::new(x, y + r), color, width, dash_len, gap_len);
}

fn draw_dashed_line(
    frame: &mut Frame,
    start: Point,
    end: Point,
    color: Color,
    width: f32,
    dash_len: f32,
    gap_len: f32,
) {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let total_len = (dx * dx + dy * dy).sqrt();
    if total_len < 0.1 {
        return;
    }
    let ux = dx / total_len;
    let uy = dy / total_len;

    let stroke = Stroke::default().with_color(color).with_width(width);
    let mut dist = 0.0;
    let mut drawing = true;

    while dist < total_len {
        let seg_len = if drawing { dash_len } else { gap_len };
        let seg_end = (dist + seg_len).min(total_len);

        if drawing {
            let p1 = Point::new(start.x + ux * dist, start.y + uy * dist);
            let p2 = Point::new(start.x + ux * seg_end, start.y + uy * seg_end);
            let path = Path::line(p1, p2);
            frame.stroke(&path, stroke.clone());
        }

        dist = seg_end;
        drawing = !drawing;
    }
}

