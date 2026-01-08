use crate::database::DbState;
use serde::Serialize;
use tauri::State;

/// 曲库统计数据
#[derive(Serialize)]
pub struct LibraryStats {
    pub total_songs: i64,
    pub total_duration: i64,  // 秒
    pub total_file_size: i64, // 字节
    pub favorite_count: i64,
}

/// 获取曲库统计数据（使用 SQL 聚合，性能优秀）
#[tauri::command]
pub fn get_library_stats(
    db: State<DbState>,
    favorite_paths: Vec<String>,
) -> Result<LibraryStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // 使用 SQL 聚合函数直接计算，避免前端遍历
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

    // 收藏数量 = 前端传入的收藏路径数量
    // (收藏数据存储在前端 localStorage，后端无法直接访问)
    let favorite_count = favorite_paths.len() as i64;

    Ok(LibraryStats {
        total_songs,
        total_duration,
        total_file_size,
        favorite_count,
    })
}
