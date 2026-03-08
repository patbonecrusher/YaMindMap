use std::cell::RefCell;

use muda::{AboutMetadata, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};

/// Menu item IDs for custom actions.
pub const MENU_NEW: &str = "new";
pub const MENU_OPEN: &str = "open";
pub const MENU_SAVE: &str = "save";
pub const MENU_SAVE_AS: &str = "save_as";

// Keep the Menu alive on the main thread for the lifetime of the process.
// If dropped, muda's internal Obj-C action targets get deallocated
// and clicking custom menu items crashes.
thread_local! {
    static MENU_BAR: RefCell<Option<Menu>> = const { RefCell::new(None) };
}

/// Build and install the native menu bar.
/// Must be called after iced/winit has initialized NSApp.
pub fn setup_menu_bar() {
    MENU_BAR.with(|cell| {
        if cell.borrow().is_some() {
            return;
        }
        let menu_bar = Menu::new();

        // -- App menu --
        let app_menu = Submenu::new("YaMindMap", true);
        let _ = app_menu.append_items(&[
            &PredefinedMenuItem::about(
                None,
                Some(AboutMetadata {
                    name: Some("YaMindMap".into()),
                    version: Some(env!("CARGO_PKG_VERSION").into()),
                    comments: Some("A fast, GPU-accelerated mind map application".into()),
                    ..Default::default()
                }),
            ),
            &PredefinedMenuItem::separator(),
            &PredefinedMenuItem::services(None),
            &PredefinedMenuItem::separator(),
            &PredefinedMenuItem::hide(None),
            &PredefinedMenuItem::hide_others(None),
            &PredefinedMenuItem::show_all(None),
            &PredefinedMenuItem::separator(),
            &PredefinedMenuItem::quit(None),
        ]);

        // -- File menu --
        let file_menu = Submenu::new("File", true);
        let new_item =
            MenuItem::with_id(MENU_NEW, "New", true, Some("CmdOrCtrl+N".parse().unwrap()));
        let open_item =
            MenuItem::with_id(MENU_OPEN, "Open...", true, Some("CmdOrCtrl+O".parse().unwrap()));
        let save_item =
            MenuItem::with_id(MENU_SAVE, "Save", true, Some("CmdOrCtrl+S".parse().unwrap()));
        let save_as_item = MenuItem::with_id(
            MENU_SAVE_AS,
            "Save As...",
            true,
            Some("CmdOrCtrl+Shift+S".parse().unwrap()),
        );
        let _ = file_menu.append_items(&[
            &new_item,
            &open_item,
            &PredefinedMenuItem::separator(),
            &save_item,
            &save_as_item,
            &PredefinedMenuItem::separator(),
            &PredefinedMenuItem::close_window(None),
        ]);

        // -- Edit menu --
        let edit_menu = Submenu::new("Edit", true);
        let _ = edit_menu.append_items(&[
            &PredefinedMenuItem::undo(None),
            &PredefinedMenuItem::redo(None),
            &PredefinedMenuItem::separator(),
            &PredefinedMenuItem::cut(None),
            &PredefinedMenuItem::copy(None),
            &PredefinedMenuItem::paste(None),
            &PredefinedMenuItem::select_all(None),
        ]);

        // -- View menu --
        let view_menu = Submenu::new("View", true);
        let _ = view_menu.append_items(&[&PredefinedMenuItem::fullscreen(None)]);

        // -- Window menu --
        let window_menu = Submenu::new("Window", true);
        let _ = window_menu.append_items(&[
            &PredefinedMenuItem::minimize(None),
            &PredefinedMenuItem::maximize(None),
            &PredefinedMenuItem::separator(),
            &PredefinedMenuItem::bring_all_to_front(None),
        ]);

        let _ = menu_bar.append_items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
        ]);

        #[cfg(target_os = "macos")]
        {
            menu_bar.init_for_nsapp();
        }

        *cell.borrow_mut() = Some(menu_bar);
    });

    #[cfg(target_os = "macos")]
    force_set_nsapp_menu();
}

/// Force the menu onto NSApp.mainMenu using objc2.
/// Ensures the menu is visible even if winit tried to set its own.
#[cfg(target_os = "macos")]
fn force_set_nsapp_menu() {
    use objc2_app_kit::NSApplication;
    use objc2_foundation::MainThreadMarker;

    let mtm = MainThreadMarker::new().expect("must be on main thread");
    let app = NSApplication::sharedApplication(mtm);

    if let Some(current_menu) = app.mainMenu() {
        app.setMainMenu(Some(&current_menu));
    }
}

/// Poll for menu events and return the corresponding Message, if any.
pub fn poll_menu_event() -> Option<crate::message::Message> {
    if let Ok(event) = MenuEvent::receiver().try_recv() {
        let id = event.id.0.as_str();
        match id {
            MENU_NEW => Some(crate::message::Message::MenuNew),
            MENU_OPEN => Some(crate::message::Message::MenuOpen),
            MENU_SAVE => Some(crate::message::Message::MenuSave),
            MENU_SAVE_AS => Some(crate::message::Message::MenuSaveAs),
            _ => None,
        }
    } else {
        None
    }
}
