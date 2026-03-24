use super::super::types::{FolderNode, GeneratedFolder, Song};
use super::super::utils::{
    descendant_like_patterns, is_supported_library_extension, normalize_path,
};
use super::diff::{collect_scan_diff, load_db_snapshot_for_folder};
use super::parser::parse_audio_files_internal;
use super::progress::ScanProgressReporter;
use super::repository::apply_scan_changes;
use crate::database::DbState;
use rusqlite::{params, OptionalExtension};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

pub fn scan_single_directory_internal(
    folder_path: String,
    db_conn: Arc<Mutex<rusqlite::Connection>>,
    app: Option<AppHandle>,
    folder_index: usize,
    folder_total: usize,
) -> Result<Vec<Song>, String> {
    let normalized_folder = normalize_path(&folder_path);
    let reporter = app.map(|app| {
        ScanProgressReporter::new(app, normalized_folder.clone(), folder_index, folder_total)
    });

    let db_snapshot = {
        let conn = db_conn.lock().map_err(|error| error.to_string())?;
        load_db_snapshot_for_folder(&conn, &normalized_folder)?
    };

    let original_db_count = db_snapshot.len();
    let scan_diff = collect_scan_diff(&normalized_folder, db_snapshot, reporter.as_ref())?;

    if !scan_diff.has_disk_songs && original_db_count > 0 {
        let error = "文件夹可能已断开连接或路径错误，未执行删除操作".to_string();
        if let Some(reporter) = reporter.as_ref() {
            reporter.emit_error(error.clone());
        }
        return Err(error);
    }

    {
        let mut conn = db_conn.lock().map_err(|error| error.to_string())?;
        apply_scan_changes(
            &mut conn,
            &scan_diff.to_add,
            &scan_diff.to_update,
            &scan_diff.to_delete,
            reporter.as_ref(),
        )?;
    }

    if !scan_diff.to_add.is_empty()
        || !scan_diff.to_update.is_empty()
        || !scan_diff.to_delete.is_empty()
    {
        println!(
            "[刷新] 新增: {} 首, 更新: {} 首, 删除: {} 首",
            scan_diff.to_add.len(),
            scan_diff.to_update.len(),
            scan_diff.to_delete.len()
        );
    }

    if let Some(reporter) = reporter.as_ref() {
        reporter.emit_complete(scan_diff.songs.len());
    }

    Ok(scan_diff.songs)
}

#[tauri::command]
pub async fn scan_music_folder(
    folder_path: String,
    _app: AppHandle,
    db_state: State<'_, DbState>,
) -> Result<Vec<Song>, String> {
    let db_conn = db_state.conn.clone();

    tauri::async_runtime::spawn_blocking(move || {
        scan_single_directory_internal(folder_path, db_conn, None, 1, 1)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn parse_audio_files(paths: Vec<String>) -> Result<Vec<Song>, String> {
    let result = tauri::async_runtime::spawn_blocking(move || parse_audio_files_internal(paths))
        .await
        .map_err(|error| error.to_string())?;

    Ok(result)
}

#[tauri::command]
pub async fn scan_folder_as_playlists(
    root_path: String,
    app: AppHandle,
    db_state: State<'_, DbState>,
) -> Result<Vec<GeneratedFolder>, String> {
    let songs = scan_music_folder(root_path.clone(), app, db_state).await?;

    let mut grouped: HashMap<PathBuf, Vec<Song>> = HashMap::new();
    for song in songs {
        let path = PathBuf::from(&song.path);
        if let Some(parent) = path.parent() {
            grouped.entry(parent.to_path_buf()).or_default().push(song);
        }
    }

    let mut result = Vec::new();
    for (folder_path, folder_songs) in grouped {
        if folder_songs.is_empty() {
            continue;
        }

        let folder_name = folder_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "未知文件夹".to_string());
        result.push(GeneratedFolder {
            name: folder_name,
            path: folder_path.to_string_lossy().into_owned(),
            songs: folder_songs,
        });
    }
    result.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(result)
}

pub fn find_first_song_recursive(path: &Path, conn: &rusqlite::Connection) -> Option<String> {
    let path_str = normalize_path(&path.to_string_lossy());
    let (pattern_forward, pattern_back) = descendant_like_patterns(&path_str);

    let mut stmt = conn
        .prepare(
            "SELECT path
             FROM songs
             WHERE path = ?1
                OR path LIKE ?2 ESCAPE '^'
                OR path LIKE ?3 ESCAPE '^'
             ORDER BY path ASC
             LIMIT 1",
        )
        .ok()?;

    stmt.query_row(params![&path_str, pattern_forward, pattern_back], |row| {
        row.get(0)
    })
    .optional()
    .ok()?
}

#[tauri::command]
pub async fn get_folder_first_song(
    folder_path: String,
    db_state: State<'_, DbState>,
) -> Result<Option<String>, String> {
    let db_conn = db_state.conn.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let conn = db_conn.lock().map_err(|error| error.to_string())?;
        let path = Path::new(&folder_path);
        Ok(find_first_song_recursive(path, &conn))
    })
    .await
    .map_err(|error| error.to_string())?
}

pub fn scan_folder_recursive(
    folder_path: PathBuf,
    current_depth: u32,
    max_depth: u32,
    conn: &rusqlite::Connection,
) -> Option<FolderNode> {
    if current_depth > max_depth {
        return None;
    }

    let folder_name = folder_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let mut node = FolderNode {
        name: folder_name,
        path: normalize_path(&folder_path.to_string_lossy()),
        children: Vec::new(),
        song_count: 0,
        cover_song_path: None,
        is_expanded: false,
    };

    if let Ok(read_dir) = fs::read_dir(&folder_path) {
        let entries: Vec<_> = read_dir.filter_map(|entry| entry.ok()).collect();
        let mut songs_in_this_dir = 0;
        let mut subdirs = Vec::new();

        for entry in entries {
            let path = entry.path();
            if path.is_dir() {
                subdirs.push(path);
            } else if path.is_file() {
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if is_supported_library_extension(&ext_str) {
                        songs_in_this_dir += 1;
                    }
                }
            }
        }

        for sub in subdirs {
            if let Some(child_node) = scan_folder_recursive(sub, current_depth + 1, max_depth, conn)
            {
                node.song_count += child_node.song_count;
                node.children.push(child_node);
            }
        }

        node.song_count += songs_in_this_dir;
        if node.song_count > 0 {
            node.cover_song_path = find_first_song_recursive(&folder_path, conn);
        }

        node.children
            .sort_by(|left, right| left.name.cmp(&right.name));
    } else {
        return None;
    }

    Some(node)
}
