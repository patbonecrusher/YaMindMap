use std::ffi::CString;

#[cfg(target_os = "macos")]
extern "C" {
    fn yamindmap_native_early_init();
    fn yamindmap_native_install_open_handler();
    fn yamindmap_native_set_icon(png_data: *const u8, png_len: std::ffi::c_ulong);
    fn yamindmap_native_init_menus(version: *const std::ffi::c_char);
    fn yamindmap_native_pop_menu_event() -> *const std::ffi::c_char;
    fn yamindmap_native_install_magnify_handler();
    fn yamindmap_native_pop_magnify(
        out_delta: *mut f32,
        out_x: *mut f32,
        out_y: *mut f32,
    ) -> i32;
}

/// Register Apple Event handler early, before iced starts.
pub fn early_init() {
    #[cfg(target_os = "macos")]
    unsafe {
        yamindmap_native_early_init();
    }
}

/// Install file-open delegate methods on winit's delegate.
/// Call from App::new() — after winit creates delegate, before event loop runs.
pub fn install_open_handler() {
    #[cfg(target_os = "macos")]
    unsafe {
        yamindmap_native_install_open_handler();
    }
}

/// Set the application icon from embedded PNG data.
pub fn set_icon(png_data: &[u8]) {
    #[cfg(target_os = "macos")]
    unsafe {
        yamindmap_native_set_icon(png_data.as_ptr(), png_data.len() as std::ffi::c_ulong);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = png_data;
}

/// Initialize native menus. Call after iced event loop is running (deferred).
pub fn init_menus() {
    #[cfg(target_os = "macos")]
    {
        let version = CString::new(env!("CARGO_PKG_VERSION")).unwrap();
        unsafe {
            yamindmap_native_init_menus(version.as_ptr());
        }
    }
}

/// Poll for native menu events.
pub fn poll_menu_event() -> Option<crate::message::Message> {
    #[cfg(target_os = "macos")]
    {
        let ptr = unsafe { yamindmap_native_pop_menu_event() };
        if ptr.is_null() {
            return None;
        }
        let id = unsafe { std::ffi::CStr::from_ptr(ptr) }
            .to_str()
            .unwrap_or("");
        match id {
            "new" => Some(crate::message::Message::MenuNew),
            "open" => Some(crate::message::Message::MenuOpen),
            "save" => Some(crate::message::Message::MenuSave),
            "save_as" => Some(crate::message::Message::MenuSaveAs),
            "undo" => Some(crate::message::Message::Undo),
            "redo" => Some(crate::message::Message::Redo),
            _ => None,
        }
    }

    #[cfg(not(target_os = "macos"))]
    None
}

/// Install native trackpad magnify (pinch) gesture handler.
pub fn install_magnify_handler() {
    #[cfg(target_os = "macos")]
    unsafe {
        yamindmap_native_install_magnify_handler();
    }
}

/// Poll for a pending pinch/magnify gesture event.
/// Returns `Some((delta, x, y))` where delta is the magnification factor
/// and (x, y) is the cursor position in window coordinates.
pub fn poll_magnify() -> Option<(f32, f32, f32)> {
    #[cfg(target_os = "macos")]
    {
        let mut delta: f32 = 0.0;
        let mut x: f32 = 0.0;
        let mut y: f32 = 0.0;
        let got = unsafe {
            yamindmap_native_pop_magnify(&mut delta, &mut x, &mut y)
        };
        if got != 0 {
            return Some((delta, x, y));
        }
    }
    None
}
