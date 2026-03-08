use iced::widget::canvas::{Frame, Path, Stroke};
use iced::{Color, Point, Size};
use yamind_core::geometry::Rect;

/// Draw a rubber-band selection rectangle.
pub fn draw_rubber_band(frame: &mut Frame, rect: &Rect) {
    let path = Path::rectangle(
        Point::new(rect.x, rect.y),
        Size::new(rect.width, rect.height),
    );
    frame.fill(&path, Color::from_rgba(0.3, 0.5, 0.8, 0.15));
    frame.stroke(
        &path,
        Stroke::default()
            .with_color(Color::from_rgba(0.3, 0.5, 0.8, 0.6))
            .with_width(1.0),
    );
}
