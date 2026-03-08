use yamind_core::geometry::{Point, Transform2D, Vector};

pub struct Viewport {
    pub transform: Transform2D,
}

impl Viewport {
    pub fn new() -> Self {
        Self {
            transform: Transform2D::identity(),
        }
    }

    /// Pan by a screen-space delta.
    pub fn pan(&mut self, delta: Vector) {
        self.transform.translation.x += delta.x / self.transform.scale;
        self.transform.translation.y += delta.y / self.transform.scale;
    }

    /// Zoom toward a screen-space point.
    pub fn zoom(&mut self, factor: f32, screen_point: Point) {
        let world_before = self.screen_to_world(screen_point);

        self.transform.scale *= factor;
        self.transform.scale = self.transform.scale.clamp(0.1, 5.0);

        let world_after = self.screen_to_world(screen_point);
        self.transform.translation.x += world_after.x - world_before.x;
        self.transform.translation.y += world_after.y - world_before.y;
    }

    /// Convert screen coordinates to world coordinates.
    pub fn screen_to_world(&self, p: Point) -> Point {
        self.transform.inverse(p)
    }

    /// Convert world coordinates to screen coordinates.
    pub fn world_to_screen(&self, p: Point) -> Point {
        self.transform.apply(p)
    }

    pub fn scale(&self) -> f32 {
        self.transform.scale
    }

    /// Zoom to fit a bounding rect, with padding.
    pub fn zoom_to_fit(
        &mut self,
        bounds: yamind_core::geometry::Rect,
        screen_width: f32,
        screen_height: f32,
        padding: f32,
    ) {
        let available_w = screen_width - padding * 2.0;
        let available_h = screen_height - padding * 2.0;

        if bounds.width <= 0.0 || bounds.height <= 0.0 {
            return;
        }

        let scale_x = available_w / bounds.width;
        let scale_y = available_h / bounds.height;
        self.transform.scale = scale_x.min(scale_y).clamp(0.1, 5.0);

        let center = bounds.center();
        self.transform.translation.x = screen_width / (2.0 * self.transform.scale) - center.x;
        self.transform.translation.y = screen_height / (2.0 * self.transform.scale) - center.y;
    }
}

impl Default for Viewport {
    fn default() -> Self {
        Self::new()
    }
}
