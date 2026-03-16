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
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| e.to_string())?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| e.to_string())?;
        conn.pragma_update(None, "synchronous", "NORMAL")
            .map_err(|e| e.to_string())?;
        conn.pragma_update(None, "temp_store", "MEMORY")
            .map_err(|e| e.to_string())?;

        // Create songs table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS songs (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                title TEXT,
                artist TEXT,
                artist_names TEXT,
                effective_artist_names TEXT,
                album TEXT,
                album_artist TEXT,
                album_key TEXT,
                is_various_artists_album INTEGER DEFAULT 0,
                collapse_artist_credits INTEGER DEFAULT 0,
                duration INTEGER,
                cover_path TEXT,
                bitrate INTEGER,
                sample_rate INTEGER,
                bit_depth INTEGER,
                format TEXT,
                container TEXT,
                codec TEXT,
                file_size INTEGER,
                added_at INTEGER,
                file_modified_at INTEGER
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS artists (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                avatar_path TEXT
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS song_artists (
                song_id INTEGER NOT NULL,
                artist_id INTEGER NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (song_id, artist_id),
                FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE,
                FOREIGN KEY(artist_id) REFERENCES artists(id) ON DELETE CASCADE
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_song_artists_artist_id ON song_artists(artist_id)",
            [],
        )
        .ok();

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
        if !columns.contains(&"artist_names".to_string()) {
            conn.execute("ALTER TABLE songs ADD COLUMN artist_names TEXT", [])
                .ok();
        }
        if !columns.contains(&"effective_artist_names".to_string()) {
            conn.execute(
                "ALTER TABLE songs ADD COLUMN effective_artist_names TEXT",
                [],
            )
            .ok();
        }
        if !columns.contains(&"album_artist".to_string()) {
            conn.execute("ALTER TABLE songs ADD COLUMN album_artist TEXT", [])
                .ok();
        }
        if !columns.contains(&"album_key".to_string()) {
            conn.execute("ALTER TABLE songs ADD COLUMN album_key TEXT", [])
                .ok();
        }
        if !columns.contains(&"is_various_artists_album".to_string()) {
            conn.execute(
                "ALTER TABLE songs ADD COLUMN is_various_artists_album INTEGER DEFAULT 0",
                [],
            )
            .ok();
        }
        if !columns.contains(&"collapse_artist_credits".to_string()) {
            conn.execute(
                "ALTER TABLE songs ADD COLUMN collapse_artist_credits INTEGER DEFAULT 0",
                [],
            )
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
        if !columns.contains(&"container".to_string()) {
            conn.execute("ALTER TABLE songs ADD COLUMN container TEXT", [])
                .ok();
        }
        if !columns.contains(&"codec".to_string()) {
            conn.execute("ALTER TABLE songs ADD COLUMN codec TEXT", [])
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
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_songs_album_key ON songs(album_key)",
            [],
        )
        .ok();
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_songs_album_artist ON songs(album_artist)",
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

        // --- Migration: Add song_id column (v1.4.0) ---
        if !ph_columns.contains(&"song_id".to_string()) {
            conn.execute("ALTER TABLE play_history ADD COLUMN song_id INTEGER", [])
                .ok();

            // 创建 song_id 索引
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_play_history_song_id ON play_history(song_id)",
                [],
            )
            .ok();
        }

        Ok(DbState {
            conn: Arc::new(Mutex::new(conn)),
        })
    }
}
