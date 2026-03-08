mod app;
mod context_menu;
mod message;
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

    iced::application("YaMindMap", App::update, App::view)
        .subscription(App::subscription)
        .window_size(Size::new(1200.0, 800.0))
        .antialiasing(true)
        .window(window::Settings {
            icon: Some(load_icon()),
            ..Default::default()
        })
        .run_with(App::new)
}
