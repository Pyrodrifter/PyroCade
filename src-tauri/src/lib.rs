use tauri::Manager;

mod artwork;
mod backend;
mod config;
mod emulators;
mod storage;

// Android stays in the app-private data dir; user ROMs are SAF tree URIs.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            app.manage(backend::AppState::new(app.handle())?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backend::get_config,
            backend::set_config,
            backend::scan_library,
            backend::cached_library,
            backend::toggle_favorite,
            backend::record_play,
            backend::update_library_prefs,
            backend::get_favorites,
            backend::get_recently_played,
            backend::set_game_hidden,
            backend::set_system_games_hidden,
            backend::set_game_metadata,
            backend::set_game_emulator,
            backend::save_game_order,
            backend::list_extra_games,
            backend::remove_game,
            backend::add_game,
            backend::launch_game,
            emulators::list_emulators,
            emulators::check_emulator_update,
            emulators::install_emulator,
            emulators::uninstall_emulator,
            emulators::open_emulator_folder,
            emulators::pick_emulator_executable,
            emulators::add_custom_emulator,
            emulators::link_android_emulator,
            emulators::unlink_android_emulator,
            artwork::fetch_art,
            artwork::start_artwork_download,
            artwork::artwork_status,
            artwork::cancel_artwork_download,
            artwork::open_artwork_folder,
            artwork::import_artwork,
            artwork::artwork_sources,
            artwork::set_screenscraper,
            artwork::find_manuals,
            artwork::manual_url,
            backend::pick_folder,
            backend::open_manual,
            backend::app_version,
            backend::quit_app,
            backend::check_app_update,
            backend::install_app_update,
            backend::open_release,
            backend::feedback_info,
            backend::feedback_copy,
            backend::feedback_open
        ])
        .run(tauri::generate_context!())
        .expect("failed to run PyroCade");
}
