use iced::widget::canvas::{Frame, Path, Stroke};
use iced::{Color, Point};
use yamind_core::edge::BezierRoute;

pub fn draw_edge(frame: &mut Frame, route: &BezierRoute, color: Color, width: f32) {
    let path = Path::new(|builder| {
        builder.move_to(to_iced_point(&route.from));
        builder.bezier_curve_to(
            to_iced_point(&route.ctrl1),
            to_iced_point(&route.ctrl2),
            to_iced_point(&route.to),
        );
    });

    frame.stroke(
        &path,
        Stroke::default().with_color(color).with_width(width),
    );
}

fn to_iced_point(p: &yamind_core::geometry::Point) -> Point {
    Point::new(p.x, p.y)
}
