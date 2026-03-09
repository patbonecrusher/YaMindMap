mod app;
mod context_menu;
mod menu;
mod message;
mod open_handler;
mod shortcuts;
mod sidebar;
mod theme;
mod toolbar;

use app::App;
use iced::window;
use iced::Size;

const ICON_PNG: &[u8] = include_bytes!("../assets/icons/yamindmap_256.png");

fn load_icon() -> window::Icon {
    let img = image::load_from_memory(ICON_PNG)
        .expect("Failed to load icon")
        .to_rgba8();
    let (w, h) = img.dimensions();
    window::icon::from_rgba(img.into_raw(), w, h).expect("Failed to create icon")
}

fn main() -> iced::Result {
    env_logger::init();

    // Register Apple Event handler early so we catch file opens
    // from double-clicking .yamind files before iced takes over.
    menu::early_init();

    // Check if a file path was passed as argv[1] (e.g., from spawning a new instance)
    let file_arg: Option<std::path::PathBuf> = std::env::args_os()
        .nth(1)
        .map(std::path::PathBuf::from)
        .filter(|p| p.extension().is_some_and(|ext| ext == "yamind") && p.exists());

    if let Some(path) = file_arg {
        open_handler::enqueue_file(path);
    }

    // Try to read saved view state from the pending file to set initial window size/position.
    // peek_first_file() checks both argv-enqueued and Apple Event-queued files.
    let view_state = open_handler::peek_first_file().and_then(|path| {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|json| yamind_file::YaMindFile::from_json(&json).ok())
            .and_then(|f| f.view_state)
    });

    eprintln!("[DEBUG main] view_state from file: {:?}", view_state);

    let (win_size, win_position) = match &view_state {
        Some(vs) => (
            Size::new(vs.window_size.0, vs.window_size.1),
            vs.window_position
                .map(|(x, y)| window::Position::Specific(iced::Point::new(x, y)))
                .unwrap_or_default(),
        ),
        None => (Size::new(1200.0, 800.0), window::Position::default()),
    };

    iced::application(App::title, App::update, App::view)
        .subscription(App::subscription)
        .antialiasing(true)
        .window(window::Settings {
            size: win_size,
            position: win_position,
            icon: Some(load_icon()),
            ..Default::default()
        })
        .run_with(App::new)
}
