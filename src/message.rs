use yamind_canvas::CanvasMessage;

#[derive(Debug, Clone)]
pub enum Message {
    Canvas(CanvasMessage),
    // Keyboard shortcuts
    AddChild,
    AddSibling,
    DeleteSelected,
    Undo,
    Redo,
    ZoomIn,
    ZoomOut,
    ZoomToFit,
    // Canvas interaction
    CanvasEvent(CanvasEvent),
}

#[derive(Debug, Clone)]
pub enum CanvasEvent {
    LeftPress(iced::Point),
    LeftRelease(iced::Point),
    RightPress(iced::Point),
    MiddlePress(iced::Point),
    MiddleRelease,
    CursorMoved(iced::Point),
    /// Two-finger scroll → pan (dx, dy in pixels)
    ScrollPan(f32, f32),
    /// Cmd + two-finger scroll → zoom (delta_y, cursor position)
    ScrollZoom(f32, iced::Point),
    DoubleClick(iced::Point),
}
