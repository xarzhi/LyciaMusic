mod database;
pub mod error;
mod music;
mod player;
mod statistics;
mod toolbox;
mod window_boundary;
mod window_material;
mod window_theme;

use database::{clear_all_app_data, DbState};
use music::{
    add_library_folder, add_sidebar_folder, batch_move_music_files, create_folder, delete_folder,
    delete_music_file, get_folder_first_song, get_library_folders, get_library_hierarchy,
    get_library_songs_cached, get_sidebar_folders, get_sidebar_hierarchy, get_song_cover,
    get_song_cover_thumbnail, get_song_lyrics, is_directory, move_file_to_folder, move_music_file,
    parse_audio_files, remove_library_folder, remove_sidebar_folder, run_cache_cleanup,
    scan_folder_as_playlists, scan_library, scan_music_folder, show_in_folder,
    ImageConcurrencyLimit,
};
use player::{
    get_current_output_device, get_output_devices, get_playback_progress, init_player,
    pause_audio, play_audio, resume_audio, seek_audio, set_output_device, set_volume,
};
use statistics::{
    add_to_history, clear_recent_history, get_behavior_stats, get_format_distribution,
    get_library_stats, get_quality_distribution, get_recent_history, import_recent_history,
    record_play, remove_from_recent_history,
};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tokio::sync::Semaphore;
use toolbox::{apply_rename, open_external_program, preview_rename, refresh_folder_songs};
use window_boundary::set_mini_boundary_enabled;
use window_material::get_window_material_capabilities;
use window_theme::set_dark_mode_for_window;

#[derive(Default)]
struct PendingOpenPaths(Mutex<Vec<String>>);

fn append_unique_paths(target: &mut Vec<String>, incoming: impl IntoIterator<Item = String>) {
    let mut seen = target.iter().cloned().collect::<HashSet<_>>();

    for path in incoming {
        if seen.insert(path.clone()) {
            target.push(path);
        }
    }
}

fn collect_existing_open_paths(
    args: impl IntoIterator<Item = String>,
    current_exe: Option<&Path>,
) -> Vec<String> {
    let mut paths = Vec::new();
    let mut seen = HashSet::new();

    for arg in args {
        let trimmed = arg.trim();
        if trimmed.is_empty() {
            continue;
        }

        let normalized = music::utils::normalize_path(trimmed);
        if normalized.is_empty() {
            continue;
        }

        let candidate = PathBuf::from(&normalized);
        if !candidate.exists() {
            continue;
        }

        if current_exe.is_some_and(|exe| exe == candidate.as_path()) {
            continue;
        }

        if seen.insert(normalized.clone()) {
            paths.push(normalized);
        }
    }

    paths
}

fn queue_open_paths(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }

    if let Some(state) = app.try_state::<PendingOpenPaths>() {
        if let Ok(mut pending_paths) = state.0.lock() {
            append_unique_paths(&mut pending_paths, paths);
        }
    }
}

#[tauri::command]
fn consume_pending_open_paths(
    state: tauri::State<PendingOpenPaths>,
) -> Result<Vec<String>, String> {
    let mut pending_paths = state.0.lock().map_err(|e| e.to_string())?;
    Ok(std::mem::take(&mut *pending_paths))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let current_exe = std::env::current_exe().ok();
            let open_paths = collect_existing_open_paths(argv.into_iter(), current_exe.as_deref());
            queue_open_paths(app, open_paths);
            let _ = app.emit("app:open-paths", ());

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(PendingOpenPaths::default());

            let db_state = DbState::new(app.handle())?;
            app.manage(db_state);

            let player_state = init_player(app.handle());
            app.manage(player_state);

            app.manage(ImageConcurrencyLimit(Semaphore::new(4)));
            run_cache_cleanup(app.handle());

            let current_exe = std::env::current_exe().ok();
            let initial_open_paths =
                collect_existing_open_paths(std::env::args().skip(1), current_exe.as_deref());
            queue_open_paths(app.handle(), initial_open_paths);

            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    use raw_window_handle::HasWindowHandle;

                    if let Ok(handle) = window.as_ref().window().window_handle() {
                        if let raw_window_handle::RawWindowHandle::Win32(win32) = handle.as_raw() {
                            window_boundary::install_boundary_subclass(win32.hwnd.get() as isize);
                        }
                    }
                }
            }

            let handle = app.handle();
            let show_item = MenuItem::with_id(handle, "show", "显示主界面", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(handle, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(handle, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app.handle())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_music_folder,
            parse_audio_files,
            scan_folder_as_playlists,
            get_song_cover_thumbnail,
            get_song_cover,
            get_song_lyrics,
            batch_move_music_files,
            move_music_file,
            show_in_folder,
            delete_music_file,
            play_audio,
            pause_audio,
            resume_audio,
            seek_audio,
            set_volume,
            get_playback_progress,
            preview_rename,
            apply_rename,
            get_output_devices,
            get_current_output_device,
            set_output_device,
            get_library_folders,
            is_directory,
            add_library_folder,
            remove_library_folder,
            get_library_songs_cached,
            scan_library,
            get_library_hierarchy,
            get_sidebar_folders,
            add_sidebar_folder,
            remove_sidebar_folder,
            get_sidebar_hierarchy,
            create_folder,
            delete_folder,
            move_file_to_folder,
            get_folder_first_song,
            get_library_stats,
            add_to_history,
            record_play,
            get_recent_history,
            import_recent_history,
            remove_from_recent_history,
            clear_recent_history,
            get_behavior_stats,
            get_quality_distribution,
            get_format_distribution,
            clear_all_app_data,
            open_external_program,
            refresh_folder_songs,
            set_mini_boundary_enabled,
            get_window_material_capabilities,
            set_dark_mode_for_window,
            consume_pending_open_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
