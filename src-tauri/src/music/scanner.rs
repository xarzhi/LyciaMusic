// music/scanner.rs - 扫描逻辑

use super::types::{FolderNode, GeneratedFolder, Song};
use super::utils::normalize_path;
use crate::database::DbState;
use lofty::prelude::*;
use lofty::probe::Probe;
use rusqlite::OptionalExtension;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use walkdir::WalkDir;

/// 内部扫描核心逻辑
pub fn scan_single_directory_internal(
    folder_path: String,
    conn: &rusqlite::Connection,
) -> Result<Vec<Song>, String> {
    let mut songs = Vec::new();
    let normalized_folder = normalize_path(&folder_path);

    for entry in WalkDir::new(&normalized_folder)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if ["mp3", "flac", "wav"].contains(&ext_str.as_str()) {
                    let raw_path_str = path.to_string_lossy().to_string();
                    let path_str = normalize_path(&raw_path_str);
                    let format = ext_str.clone();

                    let mut stmt = conn.prepare("SELECT title, artist, album, duration, cover_path, bitrate, sample_rate, bit_depth, format, file_size FROM songs WHERE path = ?1").unwrap();
                    let db_song = stmt
                        .query_row([&path_str], |row| {
                            Ok((
                                Song {
                                    name: path.file_name().unwrap().to_string_lossy().to_string(),
                                    path: path_str.clone(),
                                    title: row.get(0).unwrap_or_default(),
                                    artist: row.get(1).unwrap_or_default(),
                                    album: row.get(2).unwrap_or_default(),
                                    duration: row.get(3).unwrap_or_default(),
                                    cover: row.get(4).unwrap_or_default(),
                                    bitrate: row.get(5).unwrap_or(0),
                                    sample_rate: row.get(6).unwrap_or(0),
                                    bit_depth: row.get::<_, Option<u8>>(7).unwrap_or(None),
                                    format: row.get(8).unwrap_or_else(|_| format.clone()),
                                    file_size: row.get::<_, i64>(9).unwrap_or(0) as u64,
                                },
                                row.get::<_, Option<u32>>(5).unwrap_or(None),
                            ))
                        })
                        .optional()
                        .unwrap_or(None);

                    if let Some((mut song, db_bitrate)) = db_song {
                        if db_bitrate.is_none() {
                            if let Some(tagged_file) =
                                Probe::open(path).ok().and_then(|p| p.read().ok())
                            {
                                let props = tagged_file.properties();
                                song.bitrate = props.audio_bitrate().unwrap_or(0);
                                song.sample_rate = props.sample_rate().unwrap_or(0);
                                song.bit_depth = props.bit_depth().map(|b| b as u8);
                                song.format = format.clone();

                                if let Ok(meta) = fs::metadata(path) {
                                    song.file_size = meta.len();
                                }

                                let file_size_i64 = song.file_size as i64;
                                conn.execute(
                                    "UPDATE songs SET bitrate = ?1, sample_rate = ?2, bit_depth = ?3, format = ?4, file_size = ?5 WHERE path = ?6",
                                    (&song.bitrate, &song.sample_rate, &song.bit_depth, &song.format, &file_size_i64, &path_str),
                                ).ok();
                            }
                        }
                        songs.push(song);
                    } else {
                        let mut artist = String::from("未知歌手");
                        let mut album = String::from("未知专辑");
                        let mut title = String::new();
                        let mut duration = 0u32;
                        let mut bitrate = 0u32;
                        let mut sample_rate = 0u32;
                        let mut bit_depth: Option<u8> = None;
                        let mut file_size = 0u64;

                        if let Ok(meta) = fs::metadata(path) {
                            file_size = meta.len();
                        }

                        if let Ok(tagged_file) = Probe::open(path)
                            .map_err(|e| e.to_string())
                            .and_then(|p| p.read().map_err(|e| e.to_string()))
                        {
                            let props = tagged_file.properties();
                            duration = props.duration().as_secs() as u32;
                            bitrate = props.audio_bitrate().unwrap_or(0);
                            sample_rate = props.sample_rate().unwrap_or(0);
                            bit_depth = props.bit_depth().map(|b| b as u8);

                            if let Some(tag) = tagged_file.primary_tag() {
                                if let Some(art) = tag.artist() {
                                    artist = art.to_string();
                                }
                                if let Some(alb) = tag.album() {
                                    album = alb.to_string();
                                }
                                if let Some(tit) = tag.title() {
                                    title = tit.to_string();
                                }
                            }
                        }

                        let cover_path: Option<String> = None;
                        let file_size_i64 = file_size as i64;

                        conn.execute(
                            "INSERT OR REPLACE INTO songs (path, title, artist, album, duration, cover_path, bitrate, sample_rate, bit_depth, format, file_size) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                            (&path_str, &title, &artist, &album, &duration, &cover_path, &bitrate, &sample_rate, &bit_depth, &format, &file_size_i64),
                        ).ok();

                        songs.push(Song {
                            name: path.file_name().unwrap().to_string_lossy().to_string(),
                            path: path_str,
                            title,
                            artist,
                            album,
                            duration,
                            cover: cover_path,
                            bitrate,
                            sample_rate,
                            bit_depth,
                            format,
                            file_size,
                        });
                    }
                }
            }
        }
    }
    Ok(songs)
}

#[tauri::command]
pub async fn scan_music_folder(
    folder_path: String,
    _app: AppHandle,
    db_state: State<'_, DbState>,
) -> Result<Vec<Song>, String> {
    let db_conn = db_state.conn.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let conn = db_conn.lock().map_err(|e| e.to_string())?;
        scan_single_directory_internal(folder_path, &conn)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(result)
}

#[tauri::command]
pub async fn scan_folder_as_playlists(
    root_path: String,
    app: AppHandle,
    db_state: State<'_, DbState>,
) -> Result<Vec<GeneratedFolder>, String> {
    let songs = scan_music_folder(root_path.clone(), app, db_state).await?;

    let mut map: HashMap<PathBuf, Vec<Song>> = HashMap::new();

    for song in songs {
        let p = PathBuf::from(&song.path);
        if let Some(parent) = p.parent() {
            map.entry(parent.to_path_buf())
                .or_insert_with(Vec::new)
                .push(song);
        }
    }

    let mut result = Vec::new();
    for (folder_path, folder_songs) in map {
        if !folder_songs.is_empty() {
            let folder_name = folder_path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| "未知文件夹".to_string());
            result.push(GeneratedFolder {
                name: folder_name,
                path: folder_path.to_string_lossy().into_owned(),
                songs: folder_songs,
            });
        }
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

/// 查找文件夹中的第一首歌曲
pub fn find_first_song_recursive(path: &Path, conn: &rusqlite::Connection) -> Option<String> {
    let path_str = normalize_path(&path.to_string_lossy());
    let pattern_forward = format!("{}/%", path_str);
    let pattern_back = format!("{}\\%", path_str);

    let mut stmt = conn
        .prepare(
            "SELECT path FROM songs WHERE path LIKE ?1 OR path LIKE ?2 ORDER BY path ASC LIMIT 1",
        )
        .ok()?;

    let song_path: Option<String> = stmt
        .query_row([&pattern_forward, &pattern_back], |row| row.get(0))
        .optional()
        .ok()?;

    song_path
}

#[tauri::command]
pub async fn get_folder_first_song(
    folder_path: String,
    db_state: State<'_, DbState>,
) -> Result<Option<String>, String> {
    let db_conn = db_state.conn.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let conn = db_conn.lock().map_err(|e| e.to_string())?;
        let path = std::path::Path::new(&folder_path);
        Ok(find_first_song_recursive(path, &conn))
    })
    .await
    .map_err(|e| e.to_string())?;

    result
}

/// 递归扫描文件夹层级
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
        let entries: Vec<_> = read_dir.filter_map(|e| e.ok()).collect();

        let mut songs_in_this_dir = 0;
        let mut subdirs = Vec::new();

        for entry in entries {
            let path = entry.path();
            if path.is_dir() {
                subdirs.push(path);
            } else if path.is_file() {
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if ["mp3", "flac", "wav"].contains(&ext_str.as_str()) {
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

        node.children.sort_by(|a, b| a.name.cmp(&b.name));
    } else {
        return None;
    }

    Some(node)
}
