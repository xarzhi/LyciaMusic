use rusqlite::Connection;

fn get_table_columns(conn: &Connection, table_name: &str) -> Result<Vec<String>, String> {
    let query = format!("PRAGMA table_info({table_name})");
    conn.prepare(&query)
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .filter_map(|result| result.ok())
        .collect::<Vec<_>>()
        .pipe(Ok)
}

fn migrate_library_folders(conn: &Connection) -> Result<(), String> {
    let lib_columns = get_table_columns(conn, "library_folders")?;

    if !lib_columns.iter().any(|column| column == "path") {
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

    Ok(())
}

fn migrate_song_columns(conn: &Connection) -> Result<(), String> {
    let columns = get_table_columns(conn, "songs")?;

    if !columns.iter().any(|column| column == "bitrate") {
        conn.execute("ALTER TABLE songs ADD COLUMN bitrate INTEGER", [])
            .ok();
    }
    if !columns.iter().any(|column| column == "artist_names") {
        conn.execute("ALTER TABLE songs ADD COLUMN artist_names TEXT", [])
            .ok();
    }
    if !columns
        .iter()
        .any(|column| column == "effective_artist_names")
    {
        conn.execute(
            "ALTER TABLE songs ADD COLUMN effective_artist_names TEXT",
            [],
        )
        .ok();
    }
    if !columns.iter().any(|column| column == "album_artist") {
        conn.execute("ALTER TABLE songs ADD COLUMN album_artist TEXT", [])
            .ok();
    }
    if !columns.iter().any(|column| column == "album_key") {
        conn.execute("ALTER TABLE songs ADD COLUMN album_key TEXT", [])
            .ok();
    }
    if !columns
        .iter()
        .any(|column| column == "is_various_artists_album")
    {
        conn.execute(
            "ALTER TABLE songs ADD COLUMN is_various_artists_album INTEGER DEFAULT 0",
            [],
        )
        .ok();
    }
    if !columns
        .iter()
        .any(|column| column == "collapse_artist_credits")
    {
        conn.execute(
            "ALTER TABLE songs ADD COLUMN collapse_artist_credits INTEGER DEFAULT 0",
            [],
        )
        .ok();
    }
    if !columns.iter().any(|column| column == "sample_rate") {
        conn.execute("ALTER TABLE songs ADD COLUMN sample_rate INTEGER", [])
            .ok();
    }
    if !columns.iter().any(|column| column == "bit_depth") {
        conn.execute("ALTER TABLE songs ADD COLUMN bit_depth INTEGER", [])
            .ok();
    }
    if !columns.iter().any(|column| column == "format") {
        conn.execute("ALTER TABLE songs ADD COLUMN format TEXT", [])
            .ok();
    }
    if !columns.iter().any(|column| column == "container") {
        conn.execute("ALTER TABLE songs ADD COLUMN container TEXT", [])
            .ok();
    }
    if !columns.iter().any(|column| column == "codec") {
        conn.execute("ALTER TABLE songs ADD COLUMN codec TEXT", [])
            .ok();
    }
    if !columns.iter().any(|column| column == "file_size") {
        conn.execute("ALTER TABLE songs ADD COLUMN file_size INTEGER", [])
            .ok();
    }
    if !columns.iter().any(|column| column == "added_at") {
        conn.execute("ALTER TABLE songs ADD COLUMN added_at INTEGER", [])
            .ok();
    }
    if !columns.iter().any(|column| column == "file_modified_at") {
        conn.execute("ALTER TABLE songs ADD COLUMN file_modified_at INTEGER", [])
            .ok();
    }

    Ok(())
}

fn migrate_play_history(conn: &Connection) -> Result<(), String> {
    let columns = get_table_columns(conn, "play_history")?;

    if !columns.iter().any(|column| column == "played_seconds") {
        conn.execute(
            "ALTER TABLE play_history ADD COLUMN played_seconds INTEGER DEFAULT 0",
            [],
        )
        .ok();
    }

    if !columns.iter().any(|column| column == "song_id") {
        conn.execute("ALTER TABLE play_history ADD COLUMN song_id INTEGER", [])
            .ok();
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_play_history_song_id ON play_history(song_id)",
            [],
        )
        .ok();
    }

    Ok(())
}

fn merge_legacy_sidebar_roots(conn: &Connection) {
    conn.execute(
        "INSERT OR IGNORE INTO library_folders (path, added_at)
         SELECT path, added_at FROM sidebar_folders",
        [],
    )
    .ok();
}

pub(crate) fn run_migrations(conn: &Connection) -> Result<(), String> {
    migrate_library_folders(conn)?;
    merge_legacy_sidebar_roots(conn);
    migrate_song_columns(conn)?;
    migrate_play_history(conn)?;
    Ok(())
}

trait Pipe: Sized {
    fn pipe<T>(self, f: impl FnOnce(Self) -> T) -> T {
        f(self)
    }
}

impl<T> Pipe for T {}
