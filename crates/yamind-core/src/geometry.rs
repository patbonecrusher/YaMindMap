use serde::{Deserialize, Serialize};
use std::ops::{Add, Mul, Sub};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

impl Point {
    pub const ORIGIN: Point = Point { x: 0.0, y: 0.0 };

    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    pub fn distance_to(self, other: Point) -> f32 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        (dx * dx + dy * dy).sqrt()
    }
}

impl Add<Vector> for Point {
    type Output = Point;
    fn add(self, v: Vector) -> Point {
        Point::new(self.x + v.x, self.y + v.y)
    }
}

impl Sub for Point {
    type Output = Vector;
    fn sub(self, other: Point) -> Vector {
        Vector::new(self.x - other.x, self.y - other.y)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Vector {
    pub x: f32,
    pub y: f32,
}

impl Vector {
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    pub fn length(self) -> f32 {
        (self.x * self.x + self.y * self.y).sqrt()
    }
}

impl Add for Vector {
    type Output = Vector;
    fn add(self, other: Vector) -> Vector {
        Vector::new(self.x + other.x, self.y + other.y)
    }
}

impl Mul<f32> for Vector {
    type Output = Vector;
    fn mul(self, s: f32) -> Vector {
        Vector::new(self.x * s, self.y * s)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Size {
    pub width: f32,
    pub height: f32,
}

impl Size {
    pub fn new(width: f32, height: f32) -> Self {
        Self { width, height }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl Rect {
    pub fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self { x, y, width, height }
    }

    /// Create a rect from two corner points (in any order).
    pub fn from_points(a: Point, b: Point) -> Self {
        let x = a.x.min(b.x);
        let y = a.y.min(b.y);
        Self {
            x,
            y,
            width: (a.x - b.x).abs(),
            height: (a.y - b.y).abs(),
        }
    }

    pub fn from_center(center: Point, size: Size) -> Self {
        Self {
            x: center.x - size.width / 2.0,
            y: center.y - size.height / 2.0,
            width: size.width,
            height: size.height,
        }
    }

    pub fn center(&self) -> Point {
        Point::new(self.x + self.width / 2.0, self.y + self.height / 2.0)
    }

    pub fn top_left(&self) -> Point {
        Point::new(self.x, self.y)
    }

    pub fn bottom_right(&self) -> Point {
        Point::new(self.x + self.width, self.y + self.height)
    }

    pub fn contains(&self, p: Point) -> bool {
        p.x >= self.x
            && p.x <= self.x + self.width
            && p.y >= self.y
            && p.y <= self.y + self.height
    }

    pub fn intersects(&self, other: &Rect) -> bool {
        self.x < other.x + other.width
            && self.x + self.width > other.x
            && self.y < other.y + other.height
            && self.y + self.height > other.y
    }

    pub fn union(&self, other: &Rect) -> Rect {
        let x = self.x.min(other.x);
        let y = self.y.min(other.y);
        let right = (self.x + self.width).max(other.x + other.width);
        let bottom = (self.y + self.height).max(other.y + other.height);
        Rect::new(x, y, right - x, bottom - y)
    }

    pub fn expanded(&self, padding: f32) -> Rect {
        Rect::new(
            self.x - padding,
            self.y - padding,
            self.width + padding * 2.0,
            self.height + padding * 2.0,
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Transform2D {
    pub translation: Vector,
    pub scale: f32,
}

impl Transform2D {
    pub fn identity() -> Self {
        Self {
            translation: Vector::new(0.0, 0.0),
            scale: 1.0,
        }
    }

    /// Transform a point from world space to screen space.
    pub fn apply(&self, p: Point) -> Point {
        Point::new(
            (p.x + self.translation.x) * self.scale,
            (p.y + self.translation.y) * self.scale,
        )
    }

    /// Transform a point from screen space to world space.
    pub fn inverse(&self, p: Point) -> Point {
        Point::new(
            p.x / self.scale - self.translation.x,
            p.y / self.scale - self.translation.y,
        )
    }
}

impl Default for Transform2D {
    fn default() -> Self {
        Self::identity()
    }
}
