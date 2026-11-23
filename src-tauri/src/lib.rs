mod commands;
mod icons;
mod preview;
mod watcher;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use watcher::WatcherState;

pub struct StartupPath(pub Mutex<Option<String>>);

fn extract_path_from_args(args: &[String]) -> Option<String> {
    for arg in args.iter().skip(1) {
        let trimmed = arg.trim().trim_matches('"');
        if trimmed.is_empty() || trimmed.starts_with('-') {
            continue;
        }
        let pb = PathBuf::from(trimmed);
        if pb.exists() {
            if pb.is_dir() {
                return Some(pb.to_string_lossy().to_string());
            } else if let Some(parent) = pb.parent() {
                return Some(parent.to_string_lossy().to_string());
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_args: Vec<String> = std::env::args().collect();
    let initial_path = extract_path_from_args(&initial_args);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
            if let Some(path) = extract_path_from_args(&args) {
                let _ = app.emit("open-path", path);
            }
        }))
        .manage(WatcherState::new())
        .manage(StartupPath(Mutex::new(initial_path)))
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    // Cool-toned airy Windows 11 Acrylic frosted glass
                    let _ = window_vibrancy::apply_acrylic(&window, Some((10, 13, 18, 96)));
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_directory,
            commands::get_drives,
            commands::get_quick_access,
            commands::get_startup_path,
            commands::is_default_file_manager,
            commands::set_default_file_manager,
            commands::search_recursive,
            commands::read_text_preview,
            commands::inspect_zip,
            commands::extract_zip,
            commands::get_folder_summary,
            commands::open_file,
            commands::open_with_dialog,
            commands::reveal_in_explorer,
            commands::open_in_terminal,
            commands::create_folder,
            commands::create_file,
            commands::rename_entry,
            commands::delete_entries,
            commands::copy_entries,
            commands::move_entries,
            commands::batch_move,
            commands::watch_directory,
            commands::open_special_folder,
            commands::show_native_properties,
            commands::list_gallery_images,
            commands::calculate_folder_size,
            commands::compress_to_zip,
            commands::set_window_effect,
            icons::get_file_icons,
            preview::inspect_office_document,
            preview::inspect_executable,
            preview::list_subfolders,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Folio");
}
