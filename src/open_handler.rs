use std::path::PathBuf;
use std::sync::Mutex;

/// Extra file paths queued from Rust side (e.g., argv).
static EXTRA_FILES: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

#[cfg(target_os = "macos")]
extern "C" {
    fn yamindmap_native_pop_file() -> *mut std::ffi::c_char;
}

/// Queue a file path to be opened on the next tick (used for argv).
pub fn enqueue_file(path: PathBuf) {
    if let Ok(mut files) = EXTRA_FILES.lock() {
        files.push(path);
    }
}

/// Peek at the first pending file path without consuming it.
pub fn peek_first_file() -> Option<PathBuf> {
    if let Ok(extra) = EXTRA_FILES.lock() {
        if let Some(first) = extra.first() {
            return Some(first.clone());
        }
    }

    // Check native macOS queue without consuming (pop + re-push)
    #[cfg(target_os = "macos")]
    {
        let ptr = unsafe { yamindmap_native_pop_file() };
        if !ptr.is_null() {
            let c_str = unsafe { std::ffi::CStr::from_ptr(ptr) };
            let path = c_str.to_str().ok().map(PathBuf::from);
            unsafe { libc::free(ptr as *mut std::ffi::c_void) };
            if let Some(ref p) = path {
                // Re-enqueue so take_pending_files() will find it later
                enqueue_file(p.clone());
            }
            return path;
        }
    }

    None
}

/// Drain any pending file open requests from native layer + Rust queue.
pub fn take_pending_files() -> Vec<PathBuf> {
    let mut files = Vec::new();

    // Drain Rust-side queue (argv)
    if let Ok(mut extra) = EXTRA_FILES.lock() {
        files.append(&mut extra);
    }

    // Drain native macOS queue (Apple Events / delegate)
    #[cfg(target_os = "macos")]
    {
        loop {
            let ptr = unsafe { yamindmap_native_pop_file() };
            if ptr.is_null() {
                break;
            }
            let c_str = unsafe { std::ffi::CStr::from_ptr(ptr) };
            if let Ok(s) = c_str.to_str() {
                files.push(PathBuf::from(s));
            }
            unsafe { libc::free(ptr as *mut std::ffi::c_void) };
        }
    }

    files
}
