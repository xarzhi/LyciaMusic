use rusqlite::Connection;
use std::fs;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub struct DbState {
    pub conn: Arc<Mutex<Connection>>,
}

impl DbState {
    pub fn new(app_handle: &AppHandle) -> Result<Self, String> {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;

        if !app_dir.exists() {
            fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
        }

        let db_path = app_dir.join("library.db");
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

        // Create songs table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS songs (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                title TEXT,
                artist TEXT,
                album TEXT,
                duration INTEGER,
                cover_path TEXT,
                added_at INTEGER
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        // Create library_folders table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS library_folders (
                path TEXT PRIMARY KEY,
                added_at INTEGER
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        // Migration: Add path column to library_folders if missing (fix for older DBs)
        let lib_columns: Vec<String> = conn
            .prepare("PRAGMA table_info(library_folders)")
            .map_err(|e| e.to_string())?
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        if !lib_columns.contains(&"path".to_string()) {
            // Old table without path column - recreate it
            conn.execute("DROP TABLE IF EXISTS library_folders", [])
                .ok();
            conn.execute(
                "CREATE TABLE library_folders (
                    path TEXT PRIMARY KEY,
                    added_at INTEGER
                )",
                [],
            )
            .ok();
        }

        // Create sidebar_folders table (New for Decoupling)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS sidebar_folders (
                path TEXT PRIMARY KEY,
                added_at INTEGER
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        // --- Migration: Add audio quality columns (v1.1.1) ---
        let columns: Vec<String> = conn
            .prepare("PRAGMA table_info(songs)")
            .map_err(|e| e.to_string())?
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        if !columns.contains(&"bitrate".to_string()) {
            conn.execute("ALTER TABLE songs ADD COLUMN bitrate INTEGER", [])
                .ok();
        }
        if !columns.contains(&"sample_rate".to_string()) {
            conn.execute("ALTER TABLE songs ADD COLUMN sample_rate INTEGER", [])
                .ok();
        }
        if !columns.contains(&"bit_depth".to_string()) {
            conn.execute("ALTER TABLE songs ADD COLUMN bit_depth INTEGER", [])
                .ok();
        }
        if !columns.contains(&"format".to_string()) {
            conn.execute("ALTER TABLE songs ADD COLUMN format TEXT", [])
                .ok();
        }
        if !columns.contains(&"file_size".to_string()) {
            conn.execute("ALTER TABLE songs ADD COLUMN file_size INTEGER", [])
                .ok();
        }
        if !columns.contains(&"added_at".to_string()) {
            conn.execute("ALTER TABLE songs ADD COLUMN added_at INTEGER", [])
                .ok();
        }
        if !columns.contains(&"file_modified_at".to_string()) {
            conn.execute("ALTER TABLE songs ADD COLUMN file_modified_at INTEGER", [])
                .ok();
        }

        // --- Index for time range queries (v1.2.0) ---
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_songs_added_at ON songs(added_at)",
            [],
        )
        .ok();

        // --- Play History Table (v1.3.0) ---
        conn.execute(
            "CREATE TABLE IF NOT EXISTS play_history (
                id INTEGER PRIMARY KEY,
                song_path TEXT NOT NULL,
                played_at INTEGER NOT NULL,
                event TEXT DEFAULT 'play'
            )",
            [],
        )
        .ok();

        // Index for time-based queries on play_history
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at)",
            [],
        )
        .ok();

        // --- Migration: Add played_seconds column (vNext) ---
        let ph_columns: Vec<String> = conn
            .prepare("PRAGMA table_info(play_history)")
            .map_err(|e| e.to_string())?
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        if !ph_columns.contains(&"played_seconds".to_string()) {
            // Default to 0 for existing rows (safe for calculation)
            conn.execute(
                "ALTER TABLE play_history ADD COLUMN played_seconds INTEGER DEFAULT 0",
                [],
            )
            .ok();
        }

        Ok(DbState {
            conn: Arc::new(Mutex::new(conn)),
        })
    }
}
