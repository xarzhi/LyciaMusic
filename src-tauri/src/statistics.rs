use crate::database::DbState;
use crate::music::utils::{format_distribution_bucket, is_lossless_audio, normalize_path};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

// =====================================================
// 辅助函数
// =====================================================

/// 判断是否为无效的专辑/歌手名（用于统计时排除）
fn is_invalid_name(name: &str) -> bool {
    let normalized = name.trim().to_lowercase();
    normalized.is_empty()
        || normalized == "未知"
        || normalized == "未知专辑"
        || normalized == "未知歌手"
        || normalized == "unknown"
        || normalized == "unknown album"
        || normalized == "unknown artist"
}

/// 判断是否为 Hi-Res (24bit + >=48kHz)
fn is_hires(bit_depth: Option<i64>, sample_rate: i64) -> bool {
    bit_depth.unwrap_or(0) >= 24 && sample_rate >= 48000
}

// =====================================================
// 曲库统计
// =====================================================

/// 曲库统计结果（简化版）
#[derive(Serialize)]
pub struct LibraryStats {
    pub total_songs: i64,
    pub total_duration: i64,   // 秒
    pub total_file_size: i64,  // 字节
    pub album_count: i64,      // 专辑数（排除空/未知）
    pub artist_count: i64,     // 歌手数（排除空/未知）
    pub lossless_count: i64,   // 无损数量
    pub hires_count: i64,      // Hi-Res 数量 (24bit + >=48k)
    pub this_month_added: i64, // 本月首次入库数量
}

/// 音质分布统计
#[derive(Serialize)]
pub struct QualityDistribution {
    pub hires: i64,         // Hi-Res (24bit + >=48kHz 无损)
    pub super_quality: i64, // SQ (普通无损)
    pub high_quality: i64,  // HQ (有损 >= 256kbps)
    pub other: i64,         // 其他
}

/// 文件格式分布统计
#[derive(Serialize)]
pub struct FormatDistribution {
    pub flac: i64,
    pub mp3: i64,
    pub alac: i64,
    pub wav: i64,
    pub aiff: i64,
    pub aac: i64,
    pub ogg: i64,
    pub other: i64,
}

/// 获取文件格式分布统计
#[tauri::command]
pub fn get_format_distribution(db: State<DbState>) -> Result<FormatDistribution, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT format, container, codec FROM songs")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0).unwrap_or_default(),
                row.get::<_, Option<String>>(1).ok().flatten(),
                row.get::<_, Option<String>>(2).ok().flatten(),
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut flac = 0i64;
    let mut mp3 = 0i64;
    let mut alac = 0i64;
    let mut wav = 0i64;
    let mut aiff = 0i64;
    let mut aac = 0i64;
    let mut ogg = 0i64;
    let mut other = 0i64;

    for row in rows.flatten() {
        match format_distribution_bucket(row.1.as_deref(), row.2.as_deref(), &row.0) {
            "flac" => flac += 1,
            "mp3" => mp3 += 1,
            "alac" => alac += 1,
            "wav" => wav += 1,
            "aiff" => aiff += 1,
            "aac" => aac += 1,
            "ogg" => ogg += 1,
            _ => other += 1,
        }
    }

    Ok(FormatDistribution {
        flac,
        mp3,
        alac,
        wav,
        aiff,
        aac,
        ogg,
        other,
    })
}

/// 获取音质分布统计
#[tauri::command]
pub fn get_quality_distribution(db: State<DbState>) -> Result<QualityDistribution, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT format, codec, bit_depth, sample_rate, bitrate FROM songs")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0).unwrap_or_default(),
                row.get::<_, Option<String>>(1).ok().flatten(),
                row.get::<_, Option<i64>>(2).ok().flatten(),
                row.get::<_, i64>(3).unwrap_or(0),
                row.get::<_, i64>(4).unwrap_or(0),
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut hires = 0i64;
    let mut super_quality = 0i64;
    let mut high_quality = 0i64;
    let mut other = 0i64;

    for row in rows.flatten() {
        let (format, codec, bit_depth, sample_rate, bitrate) = row;
        let is_lossless = is_lossless_audio(codec.as_deref(), &format);
        let is_hr = is_hires(bit_depth, sample_rate);

        if is_lossless && is_hr {
            hires += 1;
        } else if is_lossless {
            super_quality += 1;
        } else if bitrate >= 256 {
            high_quality += 1;
        } else {
            other += 1;
        }
    }

    Ok(QualityDistribution {
        hires,
        super_quality,
        high_quality,
        other,
    })
}

/// 获取曲库统计（全库，无 scope/time_range 参数）
#[tauri::command]
pub fn get_library_stats(db: State<DbState>) -> Result<LibraryStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // 基础统计
    let (total_songs, total_duration, total_file_size): (i64, i64, i64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(duration), 0), COALESCE(SUM(file_size), 0) FROM songs",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    // 专辑数（排除空/未知）- 在 Rust 端过滤
    let album_count: i64 = {
        let mut stmt = conn
            .prepare("SELECT DISTINCT album FROM songs WHERE album IS NOT NULL AND album != ''")
            .map_err(|e| e.to_string())?;
        let albums: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .filter(|name: &String| !is_invalid_name(name))
            .collect();
        albums.len() as i64
    };

    // 歌手数（排除空/未知）
    let artist_count: i64 = {
        let mut stmt = conn
            .prepare("SELECT DISTINCT artist FROM songs WHERE artist IS NOT NULL AND artist != ''")
            .map_err(|e| e.to_string())?;
        let artists: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .filter(|name: &String| !is_invalid_name(name))
            .collect();
        artists.len() as i64
    };

    // 无损数量 + Hi-Res 数量
    let (lossless_count, hires_count): (i64, i64) = {
        let mut stmt = conn
            .prepare("SELECT format, codec, bit_depth, sample_rate FROM songs")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0).unwrap_or_default(),
                    row.get::<_, Option<String>>(1).ok().flatten(),
                    row.get::<_, Option<i64>>(2).ok().flatten(),
                    row.get::<_, i64>(3).unwrap_or(0),
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut lossless = 0i64;
        let mut hires = 0i64;
        for row in rows.flatten() {
            if is_lossless_audio(row.1.as_deref(), &row.0) {
                lossless += 1;
                if is_hires(row.2, row.3) {
                    hires += 1;
                }
            }
        }
        (lossless, hires)
    };

    // 本月首次入库数量
    let this_month_added: i64 = {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        // 简化：30天内入库
        let month_start = now - 30 * 24 * 60 * 60;
        conn.query_row(
            "SELECT COUNT(*) FROM songs WHERE added_at >= ?1",
            [month_start],
            |row| row.get(0),
        )
        .unwrap_or(0)
    };

    Ok(LibraryStats {
        total_songs,
        total_duration,
        total_file_size,
        album_count,
        artist_count,
        lossless_count,
        hires_count,
        this_month_added,
    })
}

// =====================================================
// 播放历史与行为统计
// =====================================================

/// 时间范围（用于行为统计）
#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
pub enum TimeRange {
    All,
    Days7,
    Days30,
    ThisYear,
}

impl TimeRange {
    fn to_timestamp_from(&self) -> Option<i64> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        match self {
            TimeRange::All => None,
            TimeRange::Days7 => Some(now - 7 * 24 * 60 * 60),
            TimeRange::Days30 => Some(now - 30 * 24 * 60 * 60),
            TimeRange::ThisYear => Some(now - 365 * 24 * 60 * 60),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentHistoryEntry {
    pub song_path: String,
    pub played_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentHistoryImportEntry {
    pub song_path: String,
    pub played_at: i64,
}

fn lookup_song_id(conn: &rusqlite::Connection, normalized_path: &str) -> Option<i64> {
    conn.query_row(
        "SELECT id FROM songs WHERE path = ?1",
        [normalized_path],
        |row| row.get(0),
    )
    .ok()
}

fn insert_history_event(
    conn: &rusqlite::Connection,
    normalized_path: &str,
    played_at: i64,
    played_seconds: i64,
    event: &str,
) -> Result<(), String> {
    let song_id = match lookup_song_id(conn, normalized_path) {
        Some(id) => id,
        None => return Ok(()),
    };

    conn.execute(
        "INSERT INTO play_history (song_path, song_id, played_at, played_seconds, event) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![normalized_path, song_id, played_at, played_seconds, event],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn add_to_history(db: State<DbState>, song_path: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let normalized_path = normalize_path(&song_path);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    insert_history_event(&conn, &normalized_path, now, 0, "recent")
}

#[tauri::command]
pub fn import_recent_history(
    db: State<DbState>,
    entries: Vec<RecentHistoryImportEntry>,
) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }

    let mut deduped = std::collections::HashMap::<String, i64>::new();
    for entry in entries {
        let normalized_path = normalize_path(&entry.song_path);
        if normalized_path.is_empty() {
            continue;
        }

        let existing = deduped.entry(normalized_path).or_insert(entry.played_at);
        if entry.played_at > *existing {
            *existing = entry.played_at;
        }
    }

    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (song_path, played_at) in deduped {
        insert_history_event(&tx, &song_path, played_at, 0, "recent")?;
    }

    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_recent_history(
    db: State<DbState>,
    limit: Option<usize>,
) -> Result<Vec<RecentHistoryEntry>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let max_rows = limit.unwrap_or(1000).clamp(1, 5000) as i64;

    let mut stmt = conn
        .prepare(
            "SELECT s.path, MAX(ph.played_at) AS played_at
             FROM play_history ph
             INNER JOIN songs s ON ph.song_id = s.id
             WHERE ph.event = 'recent'
             GROUP BY ph.song_id
             ORDER BY played_at DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([max_rows], |row| {
            Ok(RecentHistoryEntry {
                song_path: row.get(0)?,
                played_at: row.get::<_, i64>(1)? * 1000,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|row| row.ok()).collect())
}

#[tauri::command]
pub fn remove_from_recent_history(
    db: State<DbState>,
    song_paths: Vec<String>,
) -> Result<(), String> {
    if song_paths.is_empty() {
        return Ok(());
    }

    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut stmt = tx
        .prepare("DELETE FROM play_history WHERE event = 'recent' AND song_path = ?1")
        .map_err(|e| e.to_string())?;

    for song_path in song_paths {
        let normalized_path = normalize_path(&song_path);
        if normalized_path.is_empty() {
            continue;
        }
        stmt.execute([normalized_path]).map_err(|e| e.to_string())?;
    }

    drop(stmt);
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_recent_history(db: State<DbState>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM play_history WHERE event = 'recent'", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 记录一次播放事件（通过 song_path 查找 song_id）
#[tauri::command]
pub fn record_play(db: State<DbState>, song_path: String, duration: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // 规范化路径，确保与数据库中的路径格式一致
    let normalized_path = normalize_path(&song_path);

    // 通过 path 查找 song_id
    let song_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM songs WHERE path = ?1",
            [&normalized_path],
            |row| row.get(0),
        )
        .ok();

    // 如果找不到歌曲，静默返回（歌曲可能已删除）
    let song_id = match song_id {
        Some(id) => id,
        None => return Ok(()),
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    conn.execute(
        "INSERT INTO play_history (song_path, song_id, played_at, played_seconds, event) VALUES (?1, ?2, ?3, ?4, 'play')",
        rusqlite::params![&normalized_path, song_id, now, duration],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// 行为统计结果
#[derive(Serialize)]
pub struct BehaviorStats {
    pub total_plays: i64,
    pub total_duration: i64,
    pub top_songs: Vec<TopSong>,
    pub top_songs_by_duration: Vec<TopSong>,
    pub top_artists: Vec<TopArtist>,
    pub top_albums: Vec<TopAlbum>,
    pub hour_distribution: Vec<i64>,
    pub recent_activity: Vec<i64>,
}

#[derive(Serialize)]
pub struct TopSong {
    pub song_path: String,
    pub play_count: i64,
    pub value: i64,
}

#[derive(Serialize)]
pub struct TopArtist {
    pub artist: String,
    pub play_count: i64,
}

#[derive(Serialize)]
pub struct TopAlbum {
    pub album: String,
    pub play_count: i64,
}

/// 获取行为统计（全库，JOIN songs 表过滤有效歌曲）
#[tauri::command]
pub fn get_behavior_stats(
    db: State<DbState>,
    time_range: TimeRange,
) -> Result<BehaviorStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // 构建时间条件
    let time_condition = match time_range.to_timestamp_from() {
        Some(from) => format!("AND ph.played_at >= {}", from),
        None => String::new(),
    };

    // 只统计 song_id 非空且在 songs 表中存在的记录
    let base_join = "FROM play_history ph INNER JOIN songs s ON ph.song_id = s.id";

    // 指标 A1: 播放次数
    let sql_plays = format!(
        "SELECT COUNT(*) {} WHERE ph.event = 'play' AND ph.song_id IS NOT NULL {}",
        base_join, time_condition
    );
    let total_plays: i64 = conn
        .query_row(&sql_plays, [], |row| row.get(0))
        .unwrap_or(0);

    // 指标 A2: 播放总时长
    let sql_duration = format!(
        "SELECT COALESCE(SUM(ph.played_seconds), 0) {} WHERE ph.event = 'play' AND ph.song_id IS NOT NULL {}",
        base_join, time_condition
    );
    let total_duration: i64 = conn
        .query_row(&sql_duration, [], |row| row.get(0))
        .unwrap_or(0);

    // 指标 B1: Top 5 歌曲 (按次数)
    let sql_top_plays = format!(
        "SELECT s.path, COUNT(*) as cnt 
         {} 
         WHERE ph.event = 'play' AND ph.song_id IS NOT NULL {} 
         GROUP BY ph.song_id 
         ORDER BY cnt DESC 
         LIMIT 5",
        base_join, time_condition
    );
    let mut top_songs: Vec<TopSong> = Vec::new();
    {
        let mut stmt = conn.prepare(&sql_top_plays).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let count: i64 = row.get(1)?;
                Ok(TopSong {
                    song_path: row.get(0)?,
                    play_count: count,
                    value: count,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            top_songs.push(row);
        }
    }

    // 指标 B2: Top 5 歌曲 (按时长)
    let sql_top_duration = format!(
        "SELECT s.path, COALESCE(SUM(ph.played_seconds), 0) as duration 
         {} 
         WHERE ph.event = 'play' AND ph.song_id IS NOT NULL {} 
         GROUP BY ph.song_id 
         ORDER BY duration DESC 
         LIMIT 5",
        base_join, time_condition
    );
    let mut top_songs_by_duration: Vec<TopSong> = Vec::new();
    {
        let mut stmt = conn.prepare(&sql_top_duration).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let duration: i64 = row.get(1)?;
                Ok(TopSong {
                    song_path: row.get(0)?,
                    play_count: 0,
                    value: duration,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            top_songs_by_duration.push(row);
        }
    }

    // 指标 C: 小时分布
    let sql_hours = format!(
        "SELECT CAST(strftime('%H', ph.played_at, 'unixepoch', 'localtime') AS INTEGER) as hour, 
                COUNT(*) as cnt 
         {} 
         WHERE ph.event = 'play' AND ph.song_id IS NOT NULL {} 
         GROUP BY hour",
        base_join, time_condition
    );
    let mut hour_distribution: Vec<i64> = vec![0; 24];
    {
        let mut stmt = conn.prepare(&sql_hours).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            if row.0 >= 0 && row.0 < 24 {
                hour_distribution[row.0 as usize] = row.1;
            }
        }
    }

    // 指标 D1: Top 5 歌手
    let sql_top_artists = format!(
        "SELECT TRIM(s.artist) as artist, COUNT(*) as cnt 
         {} 
         WHERE ph.event = 'play' AND ph.song_id IS NOT NULL {} 
           AND s.artist IS NOT NULL 
           AND TRIM(s.artist) != '' 
           AND LOWER(TRIM(s.artist)) NOT IN ('未知', '未知歌手', 'unknown', 'unknown artist') 
         GROUP BY TRIM(s.artist) 
         ORDER BY cnt DESC 
         LIMIT 5",
        base_join, time_condition
    );
    let mut top_artists: Vec<TopArtist> = Vec::new();
    {
        let mut stmt = conn.prepare(&sql_top_artists).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(TopArtist {
                    artist: row.get(0)?,
                    play_count: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            top_artists.push(row);
        }
    }

    // 指标 D2: Top 5 专辑
    let sql_top_albums = format!(
        "SELECT TRIM(s.album) as album, COUNT(*) as cnt 
         {} 
         WHERE ph.event = 'play' AND ph.song_id IS NOT NULL {} 
           AND s.album IS NOT NULL 
           AND TRIM(s.album) != '' 
           AND LOWER(TRIM(s.album)) NOT IN ('未知', '未知专辑', 'unknown', 'unknown album') 
         GROUP BY TRIM(s.album) 
         ORDER BY cnt DESC 
         LIMIT 5",
        base_join, time_condition
    );
    let mut top_albums: Vec<TopAlbum> = Vec::new();
    {
        let mut stmt = conn.prepare(&sql_top_albums).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(TopAlbum {
                    album: row.get(0)?,
                    play_count: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            top_albums.push(row);
        }
    }

    // 指标 E: 最近 7 天播放趋势 (Timeline)
    // 即使 time_range 不是 7Days，我们也始终返回最近 7 天的趋势供 UI 显示
    let mut recent_activity: Vec<i64> = vec![0; 7];
    {
        // 算出 7 天前的零点时间戳 (简化处理，按 24h 倒推)
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let day_seconds = 24 * 60 * 60;
        let start_time = now - 7 * day_seconds;

        // 查询最近 7 天的每一天的播放时长
        // Output: day_offset (0-6), total_duration
        let sql_activity = format!(
            "SELECT CAST((ph.played_at - {}) / {} AS INTEGER) as day_offset, 
                    COALESCE(SUM(ph.played_seconds), 0) as duration 
             FROM play_history ph 
             INNER JOIN songs s ON ph.song_id = s.id 
             WHERE ph.played_at >= {} AND ph.event = 'play' AND ph.song_id IS NOT NULL 
             GROUP BY day_offset",
            start_time, day_seconds, start_time
        );

        let mut stmt = conn.prepare(&sql_activity).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?;

        for row in rows.flatten() {
            let offset = row.0;
            if offset >= 0 && offset < 7 {
                recent_activity[offset as usize] = row.1;
            }
        }
    }

    Ok(BehaviorStats {
        total_plays,
        total_duration,
        top_songs,
        top_songs_by_duration,
        top_artists,
        top_albums,
        hour_distribution,
        recent_activity,
    })
}
