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

/// 数据库中歌曲的快照信息
struct DbSongSnapshot {
    file_modified_at: Option<i64>,
    file_size: i64,
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

/// 内部扫描核心逻辑 - 差异化批量同步
pub fn scan_single_directory_internal(
    folder_path: String,
    conn: &rusqlite::Connection,
) -> Result<Vec<Song>, String> {
    let normalized_folder = normalize_path(&folder_path);

    // ========== 第一步：获取内存快照（仅限当前文件夹） ==========
    let mut db_snapshot: HashMap<String, DbSongSnapshot> = HashMap::new();
    {
        let pattern = format!("{}%", normalized_folder);
        let mut stmt = conn
            .prepare("SELECT path, file_modified_at, file_size FROM songs WHERE path LIKE ?1")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([&pattern], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<i64>>(1)?,
                    row.get::<_, i64>(2).unwrap_or(0),
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows.flatten() {
            db_snapshot.insert(
                row.0,
                DbSongSnapshot {
                    file_modified_at: row.1,
                    file_size: row.2,
                },
            );
        }
    }

    let original_db_count = db_snapshot.len();

    // ========== 第二步：遍历磁盘文件，分类处理 ==========
    let mut songs: Vec<Song> = Vec::new();
    let mut to_add: Vec<Song> = Vec::new();
    let mut to_update: Vec<Song> = Vec::new();
    let mut disk_paths: std::collections::HashSet<String> = std::collections::HashSet::new();

    for entry in WalkDir::new(&normalized_folder)
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

        let raw_path_str = path.to_string_lossy().to_string();
        let path_str = normalize_path(&raw_path_str);
        disk_paths.insert(path_str.clone());

        // 获取磁盘文件的 mtime 和 size
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
            // Case B: 数据库中存在，对比 mtime 和 size
            if db_info.file_modified_at != disk_mtime || db_info.file_size != disk_size {
                // 文件已修改 → 重新解析
                if let Some(song) = parse_song_from_file(path, &path_str, &ext) {
                    to_update.push(song.clone());
                    songs.push(song);
                }
            } else {
                // 文件未修改 → 从数据库读取完整信息
                let mut stmt = conn
                    .prepare("SELECT title, artist, album, duration, cover_path, bitrate, sample_rate, bit_depth, format, file_size, added_at, file_modified_at FROM songs WHERE path = ?1")
                    .map_err(|e| e.to_string())?;

                if let Ok(song) = stmt.query_row([&path_str], |row| {
                    Ok(Song {
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
                        format: row.get(8).unwrap_or_else(|_| ext.clone()),
                        file_size: row.get::<_, i64>(9).unwrap_or(0) as u64,
                        added_at: row
                            .get::<_, Option<i64>>(10)
                            .unwrap_or(None)
                            .map(|v| v as u64),
                        file_modified_at: row
                            .get::<_, Option<i64>>(11)
                            .unwrap_or(None)
                            .map(|v| v as u64),
                    })
                }) {
                    songs.push(song);
                }
            }
        } else {
            // Case A: 新歌曲
            if let Some(song) = parse_song_from_file(path, &path_str, &ext) {
                to_add.push(song.clone());
                songs.push(song);
            }
        }
    }

    // ========== 第三步：处理残留（幽灵歌曲） ==========
    let to_delete: Vec<String> = db_snapshot.keys().cloned().collect();

    // ========== 第四步：空阈值保护 ==========
    // 只有当磁盘上完全没有音频文件时才触发保护
    // 如果磁盘上有新文件（比如重命名场景），则允许刷新
    if disk_paths.is_empty() && original_db_count > 0 {
        return Err("文件夹可能已断开连接或路径错误，未执行删除操作".to_string());
    }

    // ========== 第五步：事务批量提交 ==========
    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| e.to_string())?;

    // INSERT 新歌曲
    for song in &to_add {
        let file_size_i64 = song.file_size as i64;
        let added_at_i64 = song.added_at.map(|v| v as i64);
        let mtime_i64 = song.file_modified_at.map(|v| v as i64);

        conn.execute(
            "INSERT OR REPLACE INTO songs (path, title, artist, album, duration, cover_path, bitrate, sample_rate, bit_depth, format, file_size, added_at, file_modified_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                &song.path, &song.title, &song.artist, &song.album, &song.duration,
                &song.cover, &song.bitrate, &song.sample_rate, &song.bit_depth,
                &song.format, &file_size_i64, &added_at_i64, &mtime_i64
            ],
        ).ok();
    }

    // UPDATE 已修改的歌曲
    for song in &to_update {
        let file_size_i64 = song.file_size as i64;
        let mtime_i64 = song.file_modified_at.map(|v| v as i64);

        conn.execute(
            "UPDATE songs SET title = ?1, artist = ?2, album = ?3, duration = ?4, bitrate = ?5, sample_rate = ?6, bit_depth = ?7, format = ?8, file_size = ?9, file_modified_at = ?10 WHERE path = ?11",
            rusqlite::params![
                &song.title, &song.artist, &song.album, &song.duration,
                &song.bitrate, &song.sample_rate, &song.bit_depth, &song.format,
                &file_size_i64, &mtime_i64, &song.path
            ],
        ).ok();
    }

    // DELETE 已删除的歌曲
    for path in &to_delete {
        conn.execute("DELETE FROM songs WHERE path = ?1", [path])
            .ok();
    }

    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;

    // 日志输出
    if !to_add.is_empty() || !to_update.is_empty() || !to_delete.is_empty() {
        println!(
            "[刷新] 新增: {} 首, 更新: {} 首, 删除: {} 首",
            to_add.len(),
            to_update.len(),
            to_delete.len()
        );
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
