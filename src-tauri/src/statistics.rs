use crate::database::DbState;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

/// 路径规范化：统一使用正斜杠，避免跨平台路径匹配问题
#[inline]
fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

/// 统计范围
#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
pub enum StatisticsScope {
    All,                                  // 全库
    Playlist { song_paths: Vec<String> }, // 歌单（前端传入路径列表）
    Folder { path: String },              // 文件夹路径
    Artist { name: String },              // 歌手名
}

/// 时间范围（基于入库时间 added_at）
#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
pub enum TimeRange {
    All,      // 全部
    Days7,    // 最近7天
    Days30,   // 最近30天
    ThisYear, // 今年
}

/// 统计结果
#[derive(Serialize)]
pub struct LibraryStats {
    pub total_songs: i64,
    pub total_duration: i64,  // 秒
    pub total_file_size: i64, // 字节
    pub favorite_count: i64,
}

impl TimeRange {
    /// 转换为 [from, to) 时间戳范围（秒），None 表示无限制
    fn to_timestamp_range(&self) -> (Option<i64>, Option<i64>) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        match self {
            TimeRange::All => (None, None),
            TimeRange::Days7 => {
                let from = now - 7 * 24 * 60 * 60;
                (Some(from), None)
            }
            TimeRange::Days30 => {
                let from = now - 30 * 24 * 60 * 60;
                (Some(from), None)
            }
            TimeRange::ThisYear => {
                // 简化实现：使用365天近似一年
                // TODO: 如需精确计算年初时间戳，可引入 chrono 库
                let from = now - 365 * 24 * 60 * 60;
                (Some(from), None)
            }
        }
    }
}

/// 获取统计数据（支持 scope + time_range 过滤）
#[tauri::command]
pub fn get_statistics(
    db: State<DbState>,
    scope: StatisticsScope,
    time_range: TimeRange,
    favorite_paths: Vec<String>,
) -> Result<LibraryStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // 构建 WHERE 子句
    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    // 时间范围过滤
    let (from_ts, to_ts) = time_range.to_timestamp_range();
    if let Some(from) = from_ts {
        conditions.push("added_at >= ?".to_string());
        params.push(Box::new(from));
    }
    if let Some(to) = to_ts {
        conditions.push("added_at < ?".to_string());
        params.push(Box::new(to));
    }

    // Scope 过滤
    match &scope {
        StatisticsScope::All => {
            // 无额外条件
        }
        StatisticsScope::Playlist { song_paths } => {
            if song_paths.is_empty() {
                return Ok(LibraryStats {
                    total_songs: 0,
                    total_duration: 0,
                    total_file_size: 0,
                    favorite_count: 0,
                });
            }
            // 使用参数绑定构建 IN 子句
            let placeholders: Vec<String> = song_paths.iter().map(|_| "?".to_string()).collect();
            conditions.push(format!("path IN ({})", placeholders.join(",")));
            for path in song_paths {
                params.push(Box::new(path.clone()));
            }
        }
        StatisticsScope::Folder { path } => {
            // 使用 LIKE 进行路径前缀匹配
            // 需要转义路径中的特殊字符并添加通配符
            let normalized_path = normalize_path(path);
            let pattern = format!("{}%", normalized_path);
            conditions.push("REPLACE(path, '\\', '/') LIKE ?".to_string());
            params.push(Box::new(pattern));
        }
        StatisticsScope::Artist { name } => {
            conditions.push("artist = ?".to_string());
            params.push(Box::new(name.clone()));
        }
    }

    // 构建完整 SQL
    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };

    let sql = format!(
        "SELECT COUNT(*), COALESCE(SUM(duration), 0), COALESCE(SUM(file_size), 0) FROM songs{}",
        where_clause
    );

    // 执行查询
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let (total_songs, total_duration, total_file_size): (i64, i64, i64) = conn
        .query_row(&sql, params_ref.as_slice(), |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?;

    // 计算收藏数量（基于 scope 过滤）
    let favorite_count = match &scope {
        StatisticsScope::All => favorite_paths.len() as i64,
        StatisticsScope::Playlist { song_paths } => {
            let song_set: std::collections::HashSet<&String> = song_paths.iter().collect();
            favorite_paths
                .iter()
                .filter(|p| song_set.contains(p))
                .count() as i64
        }
        StatisticsScope::Folder { path } => {
            let normalized_path = normalize_path(path);
            favorite_paths
                .iter()
                .filter(|p| normalize_path(p).starts_with(&normalized_path))
                .count() as i64
        }
        StatisticsScope::Artist { name: _ } => {
            // 歌手的收藏需要查数据库
            // 暂时返回 0，可后续优化
            0
        }
    };

    Ok(LibraryStats {
        total_songs,
        total_duration,
        total_file_size,
        favorite_count,
    })
}

/// 保留旧接口作为兼容别名
#[tauri::command]
pub fn get_library_stats(
    db: State<DbState>,
    favorite_paths: Vec<String>,
) -> Result<LibraryStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let (total_songs, total_duration, total_file_size): (i64, i64, i64) = conn
        .query_row(
            "SELECT 
                COUNT(*), 
                COALESCE(SUM(duration), 0), 
                COALESCE(SUM(file_size), 0) 
             FROM songs",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let favorite_count = favorite_paths.len() as i64;

    Ok(LibraryStats {
        total_songs,
        total_duration,
        total_file_size,
        favorite_count,
    })
}

// =====================================================
// 播放历史与行为统计
// =====================================================

/// 记录一次播放事件
#[tauri::command]
pub fn record_play(db: State<DbState>, song_path: String, duration: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    conn.execute(
        "INSERT INTO play_history (song_path, played_at, played_seconds, event) VALUES (?1, ?2, ?3, 'play')",
        rusqlite::params![song_path, now, duration],
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
    pub hour_distribution: Vec<i64>, // 24 个元素，索引 0-23 代表小时
}

#[derive(Serialize)]
pub struct TopSong {
    pub song_path: String,
    pub play_count: i64,
    pub value: i64,
}

/// 构建行为统计的 SCOPE 查询条件
/// 返回: (join_clause, where_clause)
/// 注意：这里的 where_clause 不包含 WHERE 关键字，只是条件部分
fn build_scope_query_parts(
    scope: &StatisticsScope,
    params: &mut Vec<Box<dyn rusqlite::ToSql>>,
    param_start_index: usize,
) -> (String, String) {
    let mut conditions = Vec::new();
    let mut join_clause = String::new();

    match scope {
        StatisticsScope::All => {}
        StatisticsScope::Playlist { song_paths } => {
            if song_paths.is_empty() {
                conditions.push("1 = 0".to_string());
            } else {
                let placeholders: Vec<String> = (0..song_paths.len())
                    .map(|i| format!("?{}", param_start_index + i))
                    .collect();
                conditions.push(format!(
                    "play_history.song_path IN ({})",
                    placeholders.join(",")
                ));
                for path in song_paths {
                    params.push(Box::new(path.clone()));
                }
            }
        }
        StatisticsScope::Folder { path } => {
            let normalized_path = normalize_path(path);
            let pattern = format!("{}%", normalized_path);
            conditions.push(format!(
                "REPLACE(play_history.song_path, '\\', '/') LIKE ?{}",
                param_start_index
            ));
            params.push(Box::new(pattern));
        }
        StatisticsScope::Artist { name } => {
            join_clause = "JOIN songs s ON play_history.song_path = s.path".to_string();
            conditions.push(format!("s.artist = ?{}", param_start_index));
            params.push(Box::new(name.clone()));
        }
    }

    let where_part = if conditions.is_empty() {
        String::new()
    } else {
        format!("({})", conditions.join(" AND "))
    };

    (join_clause, where_part)
}

/// 构建行为统计的 TIME 查询条件
/// 返回: where_part (不含 WHERE)
fn build_time_query_parts(
    time_range: &TimeRange,
    params: &mut Vec<Box<dyn rusqlite::ToSql>>,
    param_start_index: usize,
) -> String {
    // 语义：[from, to)
    // to 如果为 None，则表示到“现在”（或者无上限，取决于需求，这里通常是无上限，即到查询时刻）
    let (from_ts, to_ts) = time_range.to_timestamp_range();
    let mut conditions = Vec::new();
    let mut current_idx = param_start_index;

    if let Some(from) = from_ts {
        conditions.push(format!("played_at >= ?{}", current_idx));
        params.push(Box::new(from));
        current_idx += 1;
    }

    if let Some(to) = to_ts {
        conditions.push(format!("played_at < ?{}", current_idx));
        params.push(Box::new(to));
    }

    if conditions.is_empty() {
        String::new()
    } else {
        format!("({})", conditions.join(" AND "))
    }
}

/// 获取行为统计数据
#[tauri::command]
pub fn get_behavior_stats(
    db: State<DbState>,
    scope: StatisticsScope,
    time_range: TimeRange, // 新增参数
) -> Result<BehaviorStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // 闭包：构建完整的 WHERE 子句和 Params
    let prepare_query = |scope: &StatisticsScope,
                         time_range: &TimeRange|
     -> (String, String, Vec<Box<dyn rusqlite::ToSql>>) {
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        // 1. 构建 Scope 条件
        // params 目前为空，start_index = 1
        let (join_clause, scope_where) = build_scope_query_parts(scope, &mut params, 1);

        // 2. 构建 Time 条件
        // params 可能已有内容，start_index = params.len() + 1
        let start_idx = params.len() + 1;
        let time_where = build_time_query_parts(time_range, &mut params, start_idx);

        // 3. 拼接 WHERE
        let full_where = match (scope_where.is_empty(), time_where.is_empty()) {
            (true, true) => String::new(),
            (false, true) => format!("WHERE {}", scope_where),
            (true, false) => format!("WHERE {}", time_where),
            (false, false) => format!("WHERE {} AND {}", scope_where, time_where),
        };

        (full_where, join_clause, params)
    };

    // 指标 A1: 播放次数 (Total Plays)
    let (where_clause, join_clause, params) = prepare_query(&scope, &time_range);
    let sql_plays = format!(
        "SELECT COUNT(*) FROM play_history {} {}",
        join_clause, where_clause
    );
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let total_plays: i64 = conn
        .query_row(&sql_plays, params_ref.as_slice(), |row| row.get(0))
        .unwrap_or(0);

    // 指标 A2: 播放总时长 (Total Duration)
    // 重新构建 params
    let (where_clause, join_clause, params) = prepare_query(&scope, &time_range);
    let sql_duration = format!(
        "SELECT COALESCE(SUM(played_seconds), 0) FROM play_history {} {}",
        join_clause, where_clause
    );
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let total_duration: i64 = conn
        .query_row(&sql_duration, params_ref.as_slice(), |row| row.get(0))
        .unwrap_or(0);

    // 指标 B1: Top 3 歌曲 (按次数)
    let (where_clause, join_clause, params) = prepare_query(&scope, &time_range);
    let sql_top_plays = format!(
        "SELECT play_history.song_path, COUNT(*) as cnt 
         FROM play_history 
         {} 
         {} 
         GROUP BY play_history.song_path 
         ORDER BY cnt DESC 
         LIMIT 3",
        join_clause, where_clause
    );
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut top_songs: Vec<TopSong> = Vec::new();
    {
        let mut stmt = conn.prepare(&sql_top_plays).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params_ref.as_slice(), |row| {
                let count: i64 = row.get(1)?;
                Ok(TopSong {
                    song_path: row.get(0)?,
                    play_count: count,
                    value: count,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            if let Ok(s) = row {
                top_songs.push(s);
            }
        }
    }

    // 指标 B2: Top 3 歌曲 (按时长)
    let (where_clause, join_clause, params) = prepare_query(&scope, &time_range);
    let sql_top_duration = format!(
        "SELECT play_history.song_path, COALESCE(SUM(played_seconds), 0) as duration 
         FROM play_history 
         {} 
         {} 
         GROUP BY play_history.song_path 
         ORDER BY duration DESC 
         LIMIT 3",
        join_clause, where_clause
    );
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut top_songs_by_duration: Vec<TopSong> = Vec::new();
    {
        let mut stmt = conn.prepare(&sql_top_duration).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params_ref.as_slice(), |row| {
                let duration: i64 = row.get(1)?;
                Ok(TopSong {
                    song_path: row.get(0)?,
                    play_count: 0, // 时长榜不关注次数
                    value: duration,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            if let Ok(s) = row {
                top_songs_by_duration.push(s);
            }
        }
    }

    // 指标 C: 小时分布 (暂保持按次数统计)
    let (where_clause, join_clause, params) = prepare_query(&scope, &time_range);
    let sql_hours = format!(
        "SELECT CAST(strftime('%H', played_at, 'unixepoch', 'localtime') AS INTEGER) as hour, 
                COUNT(*) as cnt 
         FROM play_history 
         {} 
         {} 
         GROUP BY hour",
        join_clause, where_clause
    );
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut hour_distribution: Vec<i64> = vec![0; 24];
    {
        let mut stmt = conn.prepare(&sql_hours).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params_ref.as_slice(), |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            if let Ok((hour, count)) = row {
                if hour >= 0 && hour < 24 {
                    hour_distribution[hour as usize] = count;
                }
            }
        }
    }

    Ok(BehaviorStats {
        total_plays, // renamed from total_plays_7d for clarity, but frontend might need update if I change jsonKey?
        // Wait, `BehaviorStats` struct rename keys will break frontend type.
        // Let's check struct definition.
        total_duration,
        top_songs, // renamed from top_songs_7d
        top_songs_by_duration,
        hour_distribution,
    })
}
