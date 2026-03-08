mod app;
mod context_menu;
mod message;
mod shortcuts;
mod sidebar;
mod theme;
mod toolbar;

use app::App;
use iced::Size;

fn main() -> iced::Result {
    env_logger::init();

    iced::application("YaMindMap", App::update, App::view)
        .subscription(App::subscription)
        .window_size(Size::new(1200.0, 800.0))
        .antialiasing(true)
        .run_with(App::new)
}
