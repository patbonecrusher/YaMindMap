use yamind_canvas::CanvasMessage;
use yamind_core::id::NodeId;
use yamind_core::node::Attachment;

#[derive(Debug, Clone)]
pub enum Message {
    #[allow(dead_code)]
    Canvas(CanvasMessage),
    // Keyboard shortcuts
    AddChild,
    AddSibling,
    DeleteSelected,
    DeleteWithChildren(NodeId),
    DeleteKeepChildren(NodeId),
    CancelDelete,
    ToggleFold,
    Undo,
    Redo,
    ZoomIn,
    ZoomOut,
    ZoomToFit,
    // Canvas interaction
    CanvasEvent(CanvasEvent),
    // Menu actions
    MenuNew,
    MenuOpen,
    MenuSave,
    MenuSaveAs,
    MenuTick,
    // Inline text editing
    #[allow(dead_code)]
    StartEditing(yamind_core::id::NodeId),
    TextEditorAction(iced::widget::text_editor::Action),
    CommitEditing,
    CancelEditing,
    // Trackpad pinch zoom (delta, cursor_x, cursor_y)
    PinchZoom(f32, f32, f32),
    // Window events
    WindowOpened(iced::window::Id, iced::Point),
    WindowResized(iced::window::Id, iced::Size),
    WindowMoved(iced::Point),
    // Attachments
    AddUrlAttachment,
    AddDocumentAttachment,
    AddPhotoAttachment,
    UrlInputChanged(String),
    ToggleAutoFillTitle,
    FetchTitle,
    TitleFetched(String),
    SubmitUrlAttachment,
    CancelUrlAttachment,
    #[allow(dead_code)]
    AttachmentPicked(NodeId, Attachment),
    RemoveAttachment(NodeId, usize),
    OpenAttachment(NodeId, usize),
    // Context menu
    #[allow(dead_code)]
    ShowContextMenu(iced::Point),     // screen position
    DismissContextMenu,
    ContextMenuAction(ContextAction),
}

#[derive(Debug, Clone)]
pub enum ContextAction {
    AddChild,
    AddSibling,
    AddUrl,
    AddDocument,
    AddPhoto,
    EditNode,
    ToggleFold,
    Delete,
}

#[derive(Debug, Clone)]
pub enum CanvasEvent {
    LeftPress(iced::Point, bool, bool), // point, shift_held, alt_held
    LeftRelease(iced::Point),
    RightPress(iced::Point),
    RightRelease(iced::Point),
    MiddlePress(iced::Point),
    MiddleRelease,
    CursorMoved(iced::Point),
    /// Two-finger scroll → pan (dx, dy in pixels)
    ScrollPan(f32, f32),
    /// Cmd + two-finger scroll → zoom (delta_y, cursor position)
    ScrollZoom(f32, iced::Point),
    DoubleClick(iced::Point),
}
