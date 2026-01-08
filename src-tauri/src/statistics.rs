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
