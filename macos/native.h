#ifndef YAMINDMAP_NATIVE_H
#define YAMINDMAP_NATIVE_H

/// Register Apple Event handler for file opening.
/// Call BEFORE iced starts, so we catch double-click opens during launch.
void yamindmap_native_early_init(void);

/// Install file-open delegate methods on winit's app delegate.
/// Call from App::new() — after winit creates its delegate, before event loop runs.
void yamindmap_native_install_open_handler(void);

/// Set the application icon from PNG data (used in About panel).
void yamindmap_native_set_icon(const unsigned char* png_data, unsigned long png_len);

/// Initialize native macOS menus and mark app as ready.
/// Call AFTER iced/winit event loop is running (deferred).
void yamindmap_native_init_menus(const char* version);

/// Pop the next pending file path (from double-click open during startup).
/// Returns a malloc'd string the caller must free, or NULL if empty.
char* yamindmap_native_pop_file(void);

/// Pop the next pending menu event ID.
/// Returns a static string (do NOT free), or NULL if empty.
const char* yamindmap_native_pop_menu_event(void);

/// Install a local event monitor for trackpad pinch (magnify) gestures.
void yamindmap_native_install_magnify_handler(void);

/// Pop the next pending magnify event.
/// Returns 1 if an event was available (and fills out_delta/out_x/out_y), 0 otherwise.
int yamindmap_native_pop_magnify(float *out_delta, float *out_x, float *out_y);

#endif
