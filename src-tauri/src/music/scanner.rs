// music/scanner.rs - 扫描逻辑

use super::types::{FolderNode, GeneratedFolder, Song};
use super::utils::{descendant_like_patterns, normalize_path};
use crate::database::DbState;
use lofty::prelude::*;
use lofty::probe::Probe;
use rusqlite::{params, OptionalExtension};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};
use walkdir::WalkDir;

/// 数据库中歌曲的快照信息
struct DbSongSnapshot {
    song: Song,
    file_modified_at: Option<i64>,
    file_size: i64,
}

struct ScanDiff {
    songs: Vec<Song>,
    to_add: Vec<Song>,
    to_update: Vec<Song>,
    to_delete: Vec<String>,
    has_disk_songs: bool,
}

fn clamp_i64_to_u32(v: i64) -> u32 {
    if v <= 0 {
        0
    } else if v > u32::MAX as i64 {
        u32::MAX
    } else {
        v as u32
    }
}

fn i64_to_u64_opt(v: Option<i64>) -> Option<u64> {
    v.filter(|x| *x >= 0).map(|x| x as u64)
}

fn i64_to_u8_opt(v: Option<i64>) -> Option<u8> {
    v.filter(|x| *x >= 0 && *x <= u8::MAX as i64)
        .map(|x| x as u8)
}

fn u64_to_i64_saturated(v: u64) -> i64 {
    if v > i64::MAX as u64 {
        i64::MAX
    } else {
        v as i64
    }
}

fn u64_opt_to_i64_saturated(v: Option<u64>) -> Option<i64> {
    v.map(u64_to_i64_saturated)
}

/// 从文件解析歌曲信息
fn parse_song_from_file(path: &Path, path_str: &str, format: &str) -> Option<Song> {
    let mut artist = String::from("未知歌手");
    let mut album = String::from("未知专辑");
    let mut title = String::new();
    let mut duration = 0u32;
    let mut bitrate = 0u32;
    let mut sample_rate = 0u32;
    let mut bit_depth: Option<u8> = None;
    let mut file_size = 0u64;
    let mut file_modified_at: Option<u64> = None;

    if let Ok(meta) = fs::metadata(path) {
        file_size = meta.len();
        if let Ok(modified) = meta.modified() {
            file_modified_at = modified
                .duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| d.as_secs());
        }
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

    Some(Song {
        id: None,
        name: path.file_name()?.to_string_lossy().to_string(),
        path: path_str.to_string(),
        title,
        artist,
        album,
        duration,
        cover: None,
        bitrate,
        sample_rate,
        bit_depth,
        format: format.to_string(),
        file_size,
        added_at: Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        ),
        file_modified_at,
    })
}

fn load_db_snapshot_for_folder(
    conn: &rusqlite::Connection,
    normalized_folder: &str,
) -> Result<HashMap<String, DbSongSnapshot>, String> {
    let (pattern_forward, pattern_back) = descendant_like_patterns(normalized_folder);
    let mut snapshot = HashMap::new();

    let mut stmt = conn
        .prepare(
            "SELECT id, path, title, artist, album, duration, cover_path, bitrate, sample_rate, bit_depth, format, file_size, added_at, file_modified_at
             FROM songs
             WHERE path = ?1
                OR path LIKE ?2 ESCAPE '^'
                OR path LIKE ?3 ESCAPE '^'",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(
            params![normalized_folder, pattern_forward, pattern_back],
            |row| {
                let path: String = row.get(1)?;
                let duration = clamp_i64_to_u32(row.get::<_, Option<i64>>(5)?.unwrap_or(0));
                let bitrate = clamp_i64_to_u32(row.get::<_, Option<i64>>(7)?.unwrap_or(0));
                let sample_rate = clamp_i64_to_u32(row.get::<_, Option<i64>>(8)?.unwrap_or(0));
                let bit_depth = i64_to_u8_opt(row.get::<_, Option<i64>>(9)?);
                let file_size_i64 = row.get::<_, Option<i64>>(11)?.unwrap_or(0).max(0);
                let added_at_i64 = row.get::<_, Option<i64>>(12)?;
                let file_modified_at_i64 = row.get::<_, Option<i64>>(13)?;

                let name = Path::new(&path)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| path.clone());

                Ok((
                    path.clone(),
                    DbSongSnapshot {
                        file_modified_at: file_modified_at_i64,
                        file_size: file_size_i64,
                        song: Song {
                            id: row.get::<_, i64>(0).ok(),
                            name,
                            path,
                            title: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                            artist: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                            album: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                            duration,
                            cover: row.get::<_, Option<String>>(6)?,
                            bitrate,
                            sample_rate,
                            bit_depth,
                            format: row.get::<_, Option<String>>(10)?.unwrap_or_default(),
                            file_size: file_size_i64 as u64,
                            added_at: i64_to_u64_opt(added_at_i64),
                            file_modified_at: i64_to_u64_opt(file_modified_at_i64),
                        },
                    },
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    for row in rows.flatten() {
        snapshot.insert(row.0, row.1);
    }

    Ok(snapshot)
}

fn collect_scan_diff(
    normalized_folder: &str,
    mut db_snapshot: HashMap<String, DbSongSnapshot>,
) -> ScanDiff {
    let mut songs: Vec<Song> = Vec::new();
    let mut to_add: Vec<Song> = Vec::new();
    let mut to_update: Vec<Song> = Vec::new();
    let mut has_disk_songs = false;

    for entry in WalkDir::new(normalized_folder)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = match path.extension() {
            Some(e) => e.to_string_lossy().to_lowercase(),
            None => continue,
        };

        if !["mp3", "flac", "wav"].contains(&ext.as_str()) {
            continue;
        }
        has_disk_songs = true;

        let raw_path_str = path.to_string_lossy().to_string();
        let path_str = normalize_path(&raw_path_str);

        let (disk_mtime, disk_size) = match fs::metadata(path) {
            Ok(meta) => {
                let mtime = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64);
                let size = meta.len() as i64;
                (mtime, size)
            }
            Err(_) => continue,
        };

        if let Some(db_info) = db_snapshot.remove(&path_str) {
            if db_info.file_modified_at != disk_mtime || db_info.file_size != disk_size {
                if let Some(song) = parse_song_from_file(path, &path_str, &ext) {
                    to_update.push(song.clone());
                    songs.push(song);
                }
            } else {
                songs.push(db_info.song);
            }
        } else if let Some(song) = parse_song_from_file(path, &path_str, &ext) {
            to_add.push(song.clone());
            songs.push(song);
        }
    }

    let to_delete: Vec<String> = db_snapshot.keys().cloned().collect();

    ScanDiff {
        songs,
        to_add,
        to_update,
        to_delete,
        has_disk_songs,
    }
}

fn apply_scan_changes(
    conn: &mut rusqlite::Connection,
    to_add: &[Song],
    to_update: &[Song],
    to_delete: &[String],
) -> Result<(), String> {
    if to_add.is_empty() && to_update.is_empty() && to_delete.is_empty() {
        return Ok(());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    {
        let mut insert_stmt = tx
            .prepare(
                "INSERT INTO songs (path, title, artist, album, duration, cover_path, bitrate, sample_rate, bit_depth, format, file_size, added_at, file_modified_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                 ON CONFLICT(path) DO UPDATE SET
                    title = excluded.title,
                    artist = excluded.artist,
                    album = excluded.album,
                    duration = excluded.duration,
                    cover_path = COALESCE(songs.cover_path, excluded.cover_path),
                    bitrate = excluded.bitrate,
                    sample_rate = excluded.sample_rate,
                    bit_depth = excluded.bit_depth,
                    format = excluded.format,
                    file_size = excluded.file_size,
                    added_at = COALESCE(songs.added_at, excluded.added_at),
                    file_modified_at = excluded.file_modified_at",
            )
            .map_err(|e| e.to_string())?;

        for song in to_add {
            let file_size_i64 = u64_to_i64_saturated(song.file_size);
            let added_at_i64 = u64_opt_to_i64_saturated(song.added_at);
            let mtime_i64 = u64_opt_to_i64_saturated(song.file_modified_at);
            insert_stmt
                .execute(params![
                    &song.path,
                    &song.title,
                    &song.artist,
                    &song.album,
                    song.duration as i64,
                    &song.cover,
                    song.bitrate as i64,
                    song.sample_rate as i64,
                    song.bit_depth.map(|v| v as i64),
                    &song.format,
                    file_size_i64,
                    added_at_i64,
                    mtime_i64
                ])
                .map_err(|e| format!("insert failed for '{}': {}", song.path, e))?;
        }
    }

    {
        let mut update_stmt = tx
            .prepare(
                "UPDATE songs
                 SET title = ?1,
                     artist = ?2,
                     album = ?3,
                     duration = ?4,
                     bitrate = ?5,
                     sample_rate = ?6,
                     bit_depth = ?7,
                     format = ?8,
                     file_size = ?9,
                     file_modified_at = ?10
                 WHERE path = ?11",
            )
            .map_err(|e| e.to_string())?;

        for song in to_update {
            let file_size_i64 = u64_to_i64_saturated(song.file_size);
            let mtime_i64 = u64_opt_to_i64_saturated(song.file_modified_at);
            update_stmt
                .execute(params![
                    &song.title,
                    &song.artist,
                    &song.album,
                    song.duration as i64,
                    song.bitrate as i64,
                    song.sample_rate as i64,
                    song.bit_depth.map(|v| v as i64),
                    &song.format,
                    file_size_i64,
                    mtime_i64,
                    &song.path
                ])
                .map_err(|e| format!("update failed for '{}': {}", song.path, e))?;
        }
    }

    {
        let mut delete_stmt = tx
            .prepare("DELETE FROM songs WHERE path = ?1")
            .map_err(|e| e.to_string())?;
        for path in to_delete {
            delete_stmt
                .execute(params![path])
                .map_err(|e| format!("delete failed for '{}': {}", path, e))?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// 内部扫描核心逻辑 - 差异化批量同步
pub fn scan_single_directory_internal(
    folder_path: String,
    db_conn: Arc<Mutex<rusqlite::Connection>>,
) -> Result<Vec<Song>, String> {
    let normalized_folder = normalize_path(&folder_path);

    // Step 1: 仅持锁读取 DB 快照
    let db_snapshot = {
        let conn = db_conn.lock().map_err(|e| e.to_string())?;
        load_db_snapshot_for_folder(&conn, &normalized_folder)?
    };

    let original_db_count = db_snapshot.len();

    // Step 2: 无锁扫描文件系统 + 差异计算
    let scan_diff = collect_scan_diff(&normalized_folder, db_snapshot);

    // Step 3: 空阈值保护
    if !scan_diff.has_disk_songs && original_db_count > 0 {
        return Err("文件夹可能已断开连接或路径错误，未执行删除操作".to_string());
    }

    // Step 4: 仅持锁写入 DB
    {
        let mut conn = db_conn.lock().map_err(|e| e.to_string())?;
        apply_scan_changes(
            &mut conn,
            &scan_diff.to_add,
            &scan_diff.to_update,
            &scan_diff.to_delete,
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

    Ok(scan_diff.songs)
}

#[tauri::command]
pub async fn scan_music_folder(
    folder_path: String,
    _app: AppHandle,
    db_state: State<'_, DbState>,
) -> Result<Vec<Song>, String> {
    let db_conn = db_state.conn.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        scan_single_directory_internal(folder_path, db_conn)
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

    let song_path: Option<String> = stmt
        .query_row(params![&path_str, pattern_forward, pattern_back], |row| {
            row.get(0)
        })
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
