// music/scanner.rs - 扫描逻辑

use super::tags::{extract_text_metadata, read_tagged_file_from_path_for_scan};
use super::types::{FolderNode, GeneratedFolder, Song};
use super::utils::{descendant_like_patterns, is_supported_library_extension, normalize_path};
use crate::database::DbState;
use lofty::file::FileType;
use lofty::prelude::*;
use rayon::prelude::*;
use regex::Regex;
use rusqlite::{params, params_from_iter, OptionalExtension};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::OnceLock;
use std::sync::{Arc, Mutex};
use symphonia::core::codecs::CODEC_TYPE_NULL;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::{Limit, MetadataOptions};
use symphonia::core::probe::Hint;
use symphonia::core::units::TimeBase;
use tauri::{AppHandle, Emitter, State};
use walkdir::WalkDir;

const VARIOUS_ARTISTS: &str = "Various Artists";
const VARIOUS_ARTISTS_THRESHOLD: usize = 5;
const PROGRESS_EMIT_INTERVAL_MS: u64 = 200;
const DB_PROGRESS_BATCH: usize = 100;
const LIBRARY_SCAN_PROGRESS_EVENT: &str = "library-scan-progress";
const LIBRARY_SCAN_BATCH_EVENT: &str = "library-scan-batch";

const UNKNOWN_ARTIST: &str = "未知歌手";
const UNKNOWN_ALBUM: &str = "未知专辑";

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

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct ScanProgressPayload {
    phase: &'static str,
    current: usize,
    total: usize,
    folder_path: String,
    folder_index: usize,
    folder_total: usize,
    message: Option<String>,
    done: bool,
    failed: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct ScanBatchPayload {
    songs: Vec<Song>,
    deleted_paths: Vec<String>,
    folder_path: String,
    folder_index: usize,
    folder_total: usize,
}

#[derive(Clone)]
struct ScanProgressReporter {
    app: AppHandle,
    folder_path: String,
    folder_index: usize,
    folder_total: usize,
    parse_processed: Arc<AtomicUsize>,
    last_emit_ms: Arc<AtomicU64>,
}

struct DiskCandidate {
    index: usize,
    path: PathBuf,
    path_str: String,
    ext: String,
    disk_mtime: Option<i64>,
    disk_size: i64,
}

struct ParseTask {
    index: usize,
    path: PathBuf,
    path_str: String,
    ext: String,
    is_add: bool,
}

struct ParsedTaskResult {
    index: usize,
    song: Song,
    is_add: bool,
}

#[derive(Default)]
struct AudioIdentity {
    container: Option<String>,
    codec: Option<String>,
    duration_seconds: Option<u32>,
    sample_rate: Option<u32>,
    bit_depth: Option<u8>,
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

fn deserialize_string_list(raw: Option<String>) -> Vec<String> {
    raw.and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
}

fn serialize_string_list(values: &[String]) -> Result<String, String> {
    serde_json::to_string(values).map_err(|e| e.to_string())
}

fn i64_to_bool(v: Option<i64>) -> bool {
    v.unwrap_or(0) != 0
}

fn is_missing_text(value: &str, placeholder: &str) -> bool {
    let trimmed = value.trim();
    trimmed.is_empty() || trimmed == placeholder
}

fn pick_tag_value(current: &str, candidate: Option<&str>, placeholder: &str) -> Option<String> {
    if !is_missing_text(current, placeholder) {
        return None;
    }

    candidate
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn pick_optional_tag_value(current: &str, candidate: Option<&str>) -> Option<String> {
    if !current.trim().is_empty() {
        return None;
    }

    candidate
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn artist_split_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"(?i)[;,&/]|feat\.|\s+with\s+").expect("artist split regex"))
}

fn split_artist_names(artist: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();

    for part in artist_split_regex().split(artist) {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }

        let dedupe_key = trimmed.to_lowercase();
        if seen.insert(dedupe_key) {
            result.push(trimmed.to_string());
        }
    }

    if result.is_empty() && !artist.trim().is_empty() {
        result.push(artist.trim().to_string());
    }

    result
}

fn primary_artist_name(song: &Song) -> String {
    song.artist_names
        .first()
        .cloned()
        .unwrap_or_else(|| song.artist.clone())
}

fn normalize_album_key_part(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_ascii_lowercase()
    } else {
        trimmed.to_ascii_lowercase()
    }
}

fn build_album_key(album: &str, album_artist: &str) -> String {
    format!(
        "{}::{}",
        normalize_album_key_part(album, UNKNOWN_ALBUM),
        normalize_album_key_part(album_artist, VARIOUS_ARTISTS)
    )
}

fn fill_text_fields_from_tags(
    tagged_file: &impl lofty::file::TaggedFileExt,
    artist: &mut String,
    album: &mut String,
    title: &mut String,
    album_artist: &mut String,
) {
    let metadata = extract_text_metadata(tagged_file);

    if let Some(value) = pick_tag_value(artist, metadata.artist.as_deref(), UNKNOWN_ARTIST) {
        *artist = value;
    }

    if let Some(value) = pick_tag_value(album, metadata.album.as_deref(), UNKNOWN_ALBUM) {
        *album = value;
    }

    if let Some(value) = pick_optional_tag_value(title, metadata.title.as_deref()) {
        *title = value;
    }

    if let Some(value) = pick_optional_tag_value(album_artist, metadata.album_artist.as_deref()) {
        *album_artist = value;
    }
}

fn duration_seconds_from_timebase(time_base: TimeBase, frames: u64) -> u32 {
    let time = time_base.calc_time(frames);
    let rounded = time.seconds.saturating_add(u64::from(time.frac > 0.0));
    rounded.min(u32::MAX as u64) as u32
}

fn derive_bitrate_kbps(file_size: u64, duration: u32) -> u32 {
    if file_size == 0 || duration == 0 {
        return 0;
    }

    let bits = (file_size as u128).saturating_mul(8);
    let kbps = bits / (duration as u128) / 1000;
    kbps.min(u32::MAX as u128) as u32
}

fn song_metadata_incomplete(song: &Song) -> bool {
    is_missing_text(&song.artist, UNKNOWN_ARTIST)
        || is_missing_text(&song.album, UNKNOWN_ALBUM)
        || song.artist_names.is_empty()
        || song.album_artist.trim().is_empty()
        || song.album_key.trim().is_empty()
        || song.title.trim().is_empty()
        || song.duration == 0
}

fn song_identity_missing(song: &Song) -> bool {
    song.format.trim().is_empty()
        && song
            .container
            .as_deref()
            .map(|v| v.trim().is_empty())
            .unwrap_or(true)
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

fn preferred_parse_workers(task_count: usize) -> usize {
    if task_count <= 1 {
        return 1;
    }

    let available = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(4);

    preferred_parse_workers_for_available(task_count, available)
}

fn preferred_parse_workers_for_available(task_count: usize, available: usize) -> usize {
    if task_count <= 1 {
        return 1;
    }

    let reserved = if available <= 8 { 1 } else { 2 };
    let usable = available.saturating_sub(reserved).max(1);

    task_count.min(usable).max(1)
}

impl ScanProgressReporter {
    fn new(app: AppHandle, folder_path: String, folder_index: usize, folder_total: usize) -> Self {
        Self {
            app,
            folder_path,
            folder_index,
            folder_total,
            parse_processed: Arc::new(AtomicUsize::new(0)),
            last_emit_ms: Arc::new(AtomicU64::new(0)),
        }
    }

    fn emit(
        &self,
        phase: &'static str,
        current: usize,
        total: usize,
        message: Option<String>,
        done: bool,
        failed: bool,
    ) {
        let _ = self.app.emit(
            LIBRARY_SCAN_PROGRESS_EVENT,
            ScanProgressPayload {
                phase,
                current,
                total,
                folder_path: self.folder_path.clone(),
                folder_index: self.folder_index,
                folder_total: self.folder_total,
                message,
                done,
                failed,
            },
        );
    }

    fn emit_collecting(&self, current: usize, total: usize, message: Option<String>) {
        self.emit("collecting", current, total, message, false, false);
    }

    fn start_parsing(&self, total: usize) {
        self.parse_processed.store(0, Ordering::Relaxed);
        self.last_emit_ms.store(0, Ordering::Relaxed);
        self.emit(
            "parsing",
            0,
            total,
            Some(format!("正在解析 {} 首歌曲", total)),
            false,
            false,
        );
    }

    fn advance_parsing(&self, total: usize) {
        let processed = self.parse_processed.fetch_add(1, Ordering::Relaxed) + 1;
        let now = now_millis();
        let last = self.last_emit_ms.load(Ordering::Relaxed);
        let should_emit = processed == total
            || processed == 1
            || processed % 25 == 0
            || now.saturating_sub(last) >= PROGRESS_EMIT_INTERVAL_MS;

        if should_emit {
            self.last_emit_ms.store(now, Ordering::Relaxed);
            self.emit(
                "parsing",
                processed,
                total,
                Some(format!("已解析 {processed}/{total} 首歌曲")),
                false,
                false,
            );
        }
    }

    fn emit_writing(&self, current: usize, total: usize) {
        self.emit(
            "writing",
            current,
            total,
            Some(format!("正在写入数据库 {current}/{total}")),
            false,
            false,
        );
    }

    fn emit_complete(&self, total_songs: usize) {
        self.emit(
            "complete",
            total_songs,
            total_songs,
            Some(format!("已完成扫描，共 {} 首歌曲", total_songs)),
            true,
            false,
        );
    }

    fn emit_error(&self, message: String) {
        self.emit("error", 0, 0, Some(message), true, true);
    }

    fn emit_batch(&self, songs: Vec<Song>, deleted_paths: Vec<String>) {
        if songs.is_empty() && deleted_paths.is_empty() {
            return;
        }

        let _ = self.app.emit(
            LIBRARY_SCAN_BATCH_EVENT,
            ScanBatchPayload {
                songs,
                deleted_paths,
                folder_path: self.folder_path.clone(),
                folder_index: self.folder_index,
                folder_total: self.folder_total,
            },
        );
    }
}

/// 从文件解析歌曲信息
fn parse_song_from_file(path: &Path, path_str: &str, format: &str) -> Option<Song> {
    let mut artist = String::from("未知歌手");
    let mut album = String::from("未知专辑");
    let mut album_artist = String::new();
    let mut title = String::new();
    let mut duration = 0u32;
    let mut bitrate = 0u32;
    let mut sample_rate = 0u32;
    let mut bit_depth: Option<u8> = None;
    let mut file_size = 0u64;
    let mut file_modified_at: Option<u64> = None;
    let mut container = Some(normalize_container_from_extension(format));
    let mut codec = None;

    if let Ok(meta) = fs::metadata(path) {
        file_size = meta.len();
        if let Ok(modified) = meta.modified() {
            file_modified_at = modified
                .duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| d.as_secs());
        }
    }

    if let Ok(tagged_file) = read_tagged_file_from_path_for_scan(path).map_err(|e| e.to_string()) {
        let props = tagged_file.properties();
        duration = props.duration().as_secs() as u32;
        bitrate = props.audio_bitrate().unwrap_or(0);
        sample_rate = props.sample_rate().unwrap_or(0);
        bit_depth = props.bit_depth().map(|b| b as u8);
        container = Some(normalize_container(tagged_file.file_type()).to_string());

        fill_text_fields_from_tags(
            &tagged_file,
            &mut artist,
            &mut album,
            &mut title,
            &mut album_artist,
        );
    }

    if duration == 0 || sample_rate == 0 || bit_depth.is_none() {
        let identity = detect_audio_identity(path, format);

        if duration == 0 {
            duration = identity.duration_seconds.unwrap_or(0);
        }
        if sample_rate == 0 {
            sample_rate = identity.sample_rate.unwrap_or(0);
        }
        if bit_depth.is_none() {
            bit_depth = identity.bit_depth;
        }
        if container
            .as_deref()
            .map(|value| value.trim().is_empty())
            .unwrap_or(true)
        {
            container = identity.container;
        }
        codec = identity.codec;
    }
    if bitrate == 0 {
        bitrate = derive_bitrate_kbps(file_size, duration);
    }
    if title.trim().is_empty() {
        title = path.file_stem()?.to_string_lossy().to_string();
    }
    if album_artist.trim().is_empty() {
        album_artist = artist.clone();
    }

    let artist_names = split_artist_names(&artist);
    let album_key = build_album_key(&album, &album_artist);

    Some(Song {
        id: None,
        name: path.file_name()?.to_string_lossy().to_string(),
        path: path_str.to_string(),
        title,
        artist,
        artist_names: artist_names.clone(),
        effective_artist_names: artist_names,
        album,
        album_artist,
        album_key,
        is_various_artists_album: false,
        collapse_artist_credits: false,
        duration,
        cover: None,
        bitrate,
        sample_rate,
        bit_depth,
        format: format.to_string(),
        container,
        codec,
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

pub fn parse_audio_files_internal(paths: Vec<String>) -> Vec<Song> {
    let mut songs = Vec::new();
    let mut seen_paths = HashSet::new();

    for raw_path in paths {
        let normalized_path = normalize_path(&raw_path);
        if normalized_path.is_empty() || !seen_paths.insert(normalized_path.clone()) {
            continue;
        }

        let path = PathBuf::from(&normalized_path);
        if !path.is_file() {
            continue;
        }

        let extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase());

        let Some(extension) = extension else {
            continue;
        };

        if !is_supported_library_extension(&extension) {
            continue;
        }

        if let Some(song) = parse_song_from_file(&path, &normalized_path, &extension) {
            songs.push(song);
        }
    }

    songs
}

fn normalize_container(file_type: FileType) -> &'static str {
    match file_type {
        FileType::Aac => "aac",
        FileType::Aiff => "aiff",
        FileType::Ape => "ape",
        FileType::Flac => "flac",
        FileType::Mpeg => "mpeg",
        FileType::Mp4 => "mp4",
        FileType::Mpc => "mpc",
        FileType::Opus | FileType::Speex | FileType::Vorbis => "ogg",
        FileType::Wav => "wav",
        FileType::WavPack => "wavpack",
        FileType::Custom(name) => name,
        _ => "unknown",
    }
}

fn normalize_container_from_extension(ext: &str) -> String {
    match ext.to_ascii_lowercase().as_str() {
        "aif" | "aiff" => "aiff".to_string(),
        "m4a" | "m4b" | "m4p" | "mp4" => "mp4".to_string(),
        "mp1" | "mp2" | "mp3" => "mpeg".to_string(),
        "oga" | "ogg" | "opus" | "spx" | "speex" | "vorbis" => "ogg".to_string(),
        "wav" | "wave" => "wav".to_string(),
        "wv" => "wavpack".to_string(),
        other => other.to_string(),
    }
}

fn normalize_codec(short_name: &str) -> String {
    let codec = short_name.to_ascii_lowercase();
    if codec.starts_with("pcm_") {
        "pcm".to_string()
    } else if codec.starts_with("adpcm_") {
        "adpcm".to_string()
    } else {
        codec
    }
}

fn detect_audio_identity(path: &Path, ext: &str) -> AudioIdentity {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(_) => {
            return AudioIdentity {
                container: Some(normalize_container_from_extension(ext)),
                ..Default::default()
            };
        }
    };

    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    hint.with_extension(ext);

    let probed = match symphonia::default::get_probe().format(
        &hint,
        mss,
        &FormatOptions::default(),
        &MetadataOptions {
            limit_visual_bytes: Limit::Maximum(0),
            ..Default::default()
        },
    ) {
        Ok(probed) => probed,
        Err(_) => {
            return AudioIdentity {
                container: Some(normalize_container_from_extension(ext)),
                ..Default::default()
            };
        }
    };

    let track = match probed
        .format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
    {
        Some(track) => track,
        None => {
            return AudioIdentity {
                container: Some(normalize_container_from_extension(ext)),
                ..Default::default()
            };
        }
    };

    let duration_seconds = match (track.codec_params.time_base, track.codec_params.n_frames) {
        (Some(time_base), Some(frames)) if frames > 0 => {
            Some(duration_seconds_from_timebase(time_base, frames))
        }
        _ => None,
    };
    let sample_rate = track.codec_params.sample_rate;
    let bit_depth = track
        .codec_params
        .bits_per_sample
        .or(track.codec_params.bits_per_coded_sample)
        .and_then(|depth| u8::try_from(depth).ok());
    let codec = symphonia::default::get_codecs()
        .get_codec(track.codec_params.codec)
        .map(|descriptor| normalize_codec(descriptor.short_name));

    AudioIdentity {
        container: Some(normalize_container_from_extension(ext)),
        codec,
        duration_seconds,
        sample_rate,
        bit_depth,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        apply_scan_changes, collect_scan_diff, preferred_parse_workers_for_available,
        song_identity_missing, song_metadata_incomplete, DbSongSnapshot,
    };
    use crate::music::types::Song;
    use rusqlite::{params, Connection};
    use std::collections::HashMap;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_song(path: &str) -> Song {
        Song {
            id: None,
            name: PathBuf::from(path)
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.to_string()),
            title: "Demo".to_string(),
            path: path.to_string(),
            artist: "Artist".to_string(),
            artist_names: vec!["Artist".to_string()],
            effective_artist_names: vec!["Artist".to_string()],
            album: "Album".to_string(),
            album_artist: "Artist".to_string(),
            album_key: "album::artist".to_string(),
            is_various_artists_album: false,
            collapse_artist_credits: false,
            duration: 180,
            cover: None,
            bitrate: 320,
            sample_rate: 48_000,
            bit_depth: Some(24),
            format: "flac".to_string(),
            container: Some("flac".to_string()),
            codec: Some("flac".to_string()),
            file_size: 1024,
            added_at: Some(1),
            file_modified_at: Some(10),
        }
    }

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        conn.execute_batch(
            "
            CREATE TABLE songs (
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
            );
            CREATE TABLE artists (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                avatar_path TEXT
            );
            CREATE TABLE song_artists (
                song_id INTEGER NOT NULL,
                artist_id INTEGER NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (song_id, artist_id),
                FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE,
                FOREIGN KEY(artist_id) REFERENCES artists(id) ON DELETE CASCADE
            );
            CREATE INDEX idx_song_artists_artist_id ON song_artists(artist_id);
            ",
        )
        .expect("create scanner test schema");
        conn
    }

    fn create_empty_temp_dir() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("lycia_scanner_test_{unique}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn parse_workers_return_one_for_single_task() {
        assert_eq!(preferred_parse_workers_for_available(1, 32), 1);
    }

    #[test]
    fn parse_workers_reserve_one_core_on_smaller_cpus() {
        assert_eq!(preferred_parse_workers_for_available(10, 8), 7);
        assert_eq!(preferred_parse_workers_for_available(10, 4), 3);
    }

    #[test]
    fn parse_workers_reserve_two_cores_on_larger_cpus() {
        assert_eq!(preferred_parse_workers_for_available(32, 16), 14);
        assert_eq!(preferred_parse_workers_for_available(32, 24), 22);
    }

    #[test]
    fn parse_workers_never_exceed_task_count() {
        assert_eq!(preferred_parse_workers_for_available(3, 16), 3);
    }

    #[test]
    fn flags_incomplete_or_identity_less_songs_for_rescan() {
        let mut song = make_song("/music/demo.flac");
        assert!(!song_metadata_incomplete(&song));
        assert!(!song_identity_missing(&song));

        song.title.clear();
        assert!(song_metadata_incomplete(&song));

        song = make_song("/music/demo.flac");
        song.format.clear();
        song.container = None;
        assert!(song_identity_missing(&song));
    }

    #[test]
    fn collect_scan_diff_marks_missing_disk_songs_for_deletion() {
        let temp_dir = create_empty_temp_dir();
        let stale_path = temp_dir.join("stale.flac");
        let normalized_folder = temp_dir.to_string_lossy().replace('\\', "/");
        let normalized_song_path = stale_path.to_string_lossy().replace('\\', "/");
        let mut db_snapshot = HashMap::new();
        db_snapshot.insert(
            normalized_song_path.clone(),
            DbSongSnapshot {
                song: make_song(&normalized_song_path),
                file_modified_at: Some(10),
                file_size: 1024,
            },
        );

        let diff = collect_scan_diff(&normalized_folder, db_snapshot, None).expect("collect diff");

        assert_eq!(diff.songs.len(), 0);
        assert_eq!(diff.to_add.len(), 0);
        assert_eq!(diff.to_update.len(), 0);
        assert_eq!(diff.to_delete, vec![normalized_song_path]);
        assert!(!diff.has_disk_songs);

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn apply_scan_changes_writes_and_syncs_artist_relations() {
        let mut conn = setup_test_db();
        let added_song = make_song("/music/first.flac");

        apply_scan_changes(&mut conn, &[added_song.clone()], &[], &[], None).expect("insert batch");

        let inserted_title: String = conn
            .query_row(
                "SELECT title FROM songs WHERE path = ?1",
                params![added_song.path],
                |row| row.get(0),
            )
            .expect("read inserted song");
        let inserted_artist_links: i64 = conn
            .query_row("SELECT COUNT(*) FROM song_artists", [], |row| row.get(0))
            .expect("count artist links after insert");
        assert_eq!(inserted_title, "Demo");
        assert_eq!(inserted_artist_links, 1);

        let mut updated_song = added_song.clone();
        updated_song.title = "Updated Demo".to_string();
        updated_song.artist = "Updated Artist".to_string();
        updated_song.artist_names = vec!["Updated Artist".to_string(), "Guest".to_string()];
        updated_song.effective_artist_names = updated_song.artist_names.clone();
        updated_song.album_artist = "Updated Artist".to_string();
        updated_song.album_key = "album::updated artist".to_string();

        apply_scan_changes(&mut conn, &[], &[updated_song.clone()], &[], None).expect("update batch");

        let updated_title: String = conn
            .query_row(
                "SELECT title FROM songs WHERE path = ?1",
                params![updated_song.path],
                |row| row.get(0),
            )
            .expect("read updated song");
        let linked_artist_names: Vec<String> = conn
            .prepare(
                "SELECT artists.name
                 FROM song_artists
                 JOIN artists ON artists.id = song_artists.artist_id
                 ORDER BY song_artists.sort_order ASC",
            )
            .expect("prepare artist query")
            .query_map([], |row| row.get::<_, String>(0))
            .expect("query artist links")
            .filter_map(Result::ok)
            .collect();
        assert_eq!(updated_title, "Updated Demo");
        assert_eq!(linked_artist_names, vec!["Updated Artist".to_string(), "Guest".to_string()]);

        apply_scan_changes(&mut conn, &[], &[], std::slice::from_ref(&updated_song.path), None)
            .expect("delete batch");

        let remaining_songs: i64 = conn
            .query_row("SELECT COUNT(*) FROM songs", [], |row| row.get(0))
            .expect("count songs after delete");
        let remaining_artists: i64 = conn
            .query_row("SELECT COUNT(*) FROM artists", [], |row| row.get(0))
            .expect("count artists after delete");
        let remaining_links: i64 = conn
            .query_row("SELECT COUNT(*) FROM song_artists", [], |row| row.get(0))
            .expect("count links after delete");
        assert_eq!(remaining_songs, 0);
        assert_eq!(remaining_artists, 0);
        assert_eq!(remaining_links, 0);
    }
}

fn resolve_album_artist_for_group(songs: &[Song]) -> (String, bool, bool) {
    let tagged_album_artists: Vec<String> = songs
        .iter()
        .filter_map(|song| {
            let trimmed = song.album_artist.trim();
            (!trimmed.is_empty() && !trimmed.eq_ignore_ascii_case(&song.artist))
                .then(|| trimmed.to_string())
        })
        .collect();

    let primary_artists: Vec<String> = songs.iter().map(primary_artist_name).collect();
    let unique_primary_artists: HashSet<String> = primary_artists
        .iter()
        .map(|name| name.to_lowercase())
        .collect();

    if !tagged_album_artists.is_empty() {
        let unique_tagged: HashSet<String> = tagged_album_artists
            .iter()
            .map(|name| name.to_lowercase())
            .collect();
        let resolved = tagged_album_artists[0].clone();
        let is_various = unique_tagged.len() > 1 && unique_primary_artists.len() > 1;
        let collapse = unique_primary_artists.len() > VARIOUS_ARTISTS_THRESHOLD;
        return (
            if is_various {
                VARIOUS_ARTISTS.to_string()
            } else {
                resolved
            },
            is_various,
            collapse,
        );
    }

    if unique_primary_artists.len() <= 1 {
        return (
            primary_artists
                .first()
                .cloned()
                .unwrap_or_else(|| UNKNOWN_ARTIST.to_string()),
            false,
            false,
        );
    }

    let mut counts: HashMap<String, usize> = HashMap::new();
    for name in &primary_artists {
        *counts.entry(name.clone()).or_insert(0) += 1;
    }

    let dominant_artist = counts
        .into_iter()
        .max_by(|(left_name, left_count), (right_name, right_count)| {
            left_count
                .cmp(right_count)
                .then_with(|| right_name.cmp(left_name))
        })
        .map(|(name, _)| name)
        .unwrap_or_else(|| UNKNOWN_ARTIST.to_string());

    let all_unique = unique_primary_artists.len() == songs.len();
    let collapse = unique_primary_artists.len() > VARIOUS_ARTISTS_THRESHOLD;
    let is_various = collapse || all_unique;

    (
        if is_various {
            VARIOUS_ARTISTS.to_string()
        } else {
            dominant_artist
        },
        is_various,
        collapse,
    )
}

fn enrich_album_groups(songs: &mut [Song]) {
    let mut grouped_paths: HashMap<String, Vec<usize>> = HashMap::new();

    for (index, song) in songs.iter().enumerate() {
        let parent_folder = Path::new(&song.path)
            .parent()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
        let album_group_key = format!(
            "{}::{}",
            parent_folder,
            normalize_album_key_part(&song.album, UNKNOWN_ALBUM)
        );
        grouped_paths
            .entry(album_group_key)
            .or_default()
            .push(index);
    }

    for indexes in grouped_paths.into_values() {
        let group_songs: Vec<Song> = indexes.iter().map(|index| songs[*index].clone()).collect();
        let (album_artist, is_various, collapse) = resolve_album_artist_for_group(&group_songs);

        for index in indexes {
            let song = &mut songs[index];
            song.album_artist = album_artist.clone();
            song.album_key = build_album_key(&song.album, &song.album_artist);
            song.is_various_artists_album = is_various;
            song.collapse_artist_credits = collapse;
            song.effective_artist_names = if collapse {
                vec![VARIOUS_ARTISTS.to_string()]
            } else {
                song.artist_names.clone()
            };
        }
    }
}

fn load_db_snapshot_for_folder(
    conn: &rusqlite::Connection,
    normalized_folder: &str,
) -> Result<HashMap<String, DbSongSnapshot>, String> {
    let (pattern_forward, pattern_back) = descendant_like_patterns(normalized_folder);
    let mut snapshot = HashMap::new();

    let mut stmt = conn
        .prepare(
            "SELECT id, path, title, artist, artist_names, effective_artist_names, album, album_artist, album_key, is_various_artists_album, collapse_artist_credits, duration, cover_path, bitrate, sample_rate, bit_depth, format, container, codec, file_size, added_at, file_modified_at
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
                let duration = clamp_i64_to_u32(row.get::<_, Option<i64>>(11)?.unwrap_or(0));
                let bitrate = clamp_i64_to_u32(row.get::<_, Option<i64>>(13)?.unwrap_or(0));
                let sample_rate = clamp_i64_to_u32(row.get::<_, Option<i64>>(14)?.unwrap_or(0));
                let bit_depth = i64_to_u8_opt(row.get::<_, Option<i64>>(15)?);
                let file_size_i64 = row.get::<_, Option<i64>>(19)?.unwrap_or(0).max(0);
                let added_at_i64 = row.get::<_, Option<i64>>(20)?;
                let file_modified_at_i64 = row.get::<_, Option<i64>>(21)?;
                let artist_names = deserialize_string_list(row.get::<_, Option<String>>(4)?);
                let effective_artist_names =
                    deserialize_string_list(row.get::<_, Option<String>>(5)?);

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
                            artist_names,
                            effective_artist_names,
                            album: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                            album_artist: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                            album_key: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
                            is_various_artists_album: i64_to_bool(row.get::<_, Option<i64>>(9)?),
                            collapse_artist_credits: i64_to_bool(row.get::<_, Option<i64>>(10)?),
                            duration,
                            cover: row.get::<_, Option<String>>(12)?,
                            bitrate,
                            sample_rate,
                            bit_depth,
                            format: row.get::<_, Option<String>>(16)?.unwrap_or_default(),
                            container: row.get::<_, Option<String>>(17)?,
                            codec: row.get::<_, Option<String>>(18)?,
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

fn collect_disk_candidates(
    normalized_folder: &str,
    reporter: Option<&ScanProgressReporter>,
) -> Vec<DiskCandidate> {
    let mut candidates = Vec::new();
    let mut discovered = 0usize;

    if let Some(reporter) = reporter {
        reporter.emit_collecting(0, 0, Some("正在扫描文件夹".to_string()));
    }

    for entry in WalkDir::new(normalized_folder)
        .into_iter()
        .filter_map(|entry| entry.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = match path.extension() {
            Some(ext) => ext.to_string_lossy().to_lowercase(),
            None => continue,
        };

        if !is_supported_library_extension(&ext) {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };

        let raw_path_str = path.to_string_lossy().to_string();
        let path_str = normalize_path(&raw_path_str);

        discovered += 1;
        candidates.push(DiskCandidate {
            index: candidates.len(),
            path: path.to_path_buf(),
            path_str,
            ext,
            disk_mtime: metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs() as i64),
            disk_size: metadata.len() as i64,
        });

        if let Some(reporter) = reporter {
            if discovered == 1 || discovered % 200 == 0 {
                reporter.emit_collecting(
                    discovered,
                    0,
                    Some(format!("已发现 {} 首候选歌曲", discovered)),
                );
            }
        }
    }

    if let Some(reporter) = reporter {
        reporter.emit_collecting(
            candidates.len(),
            candidates.len(),
            Some(format!(
                "已完成文件收集，共 {} 首候选歌曲",
                candidates.len()
            )),
        );
    }

    candidates
}

fn parse_tasks_in_parallel(
    tasks: Vec<ParseTask>,
    reporter: Option<ScanProgressReporter>,
) -> Result<Vec<ParsedTaskResult>, String> {
    if tasks.is_empty() {
        return Ok(Vec::new());
    }

    let total = tasks.len();
    let worker_count = preferred_parse_workers(total);
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(worker_count)
        .build()
        .map_err(|error| error.to_string())?;

    let results = pool.install(|| {
        tasks
            .into_par_iter()
            .filter_map(|task| {
                let parsed = parse_song_from_file(&task.path, &task.path_str, &task.ext);

                if let Some(reporter) = reporter.as_ref() {
                    reporter.advance_parsing(total);
                }

                parsed.map(|song| ParsedTaskResult {
                    index: task.index,
                    song,
                    is_add: task.is_add,
                })
            })
            .collect()
    });

    Ok(results)
}

fn collect_scan_diff(
    normalized_folder: &str,
    mut db_snapshot: HashMap<String, DbSongSnapshot>,
    reporter: Option<&ScanProgressReporter>,
) -> Result<ScanDiff, String> {
    let candidates = collect_disk_candidates(normalized_folder, reporter);
    let has_disk_songs = !candidates.is_empty();
    let mut songs_by_index: Vec<Option<Song>> = vec![None; candidates.len()];
    let mut parse_tasks = Vec::new();

    for candidate in &candidates {
        if let Some(db_info) = db_snapshot.remove(&candidate.path_str) {
            if db_info.file_modified_at != candidate.disk_mtime
                || db_info.file_size != candidate.disk_size
                || song_identity_missing(&db_info.song)
                || song_metadata_incomplete(&db_info.song)
            {
                parse_tasks.push(ParseTask {
                    index: candidate.index,
                    path: candidate.path.clone(),
                    path_str: candidate.path_str.clone(),
                    ext: candidate.ext.clone(),
                    is_add: false,
                });
            } else {
                songs_by_index[candidate.index] = Some(db_info.song);
            }
        } else {
            parse_tasks.push(ParseTask {
                index: candidate.index,
                path: candidate.path.clone(),
                path_str: candidate.path_str.clone(),
                ext: candidate.ext.clone(),
                is_add: true,
            });
        }
    }

    if let Some(reporter) = reporter {
        reporter.start_parsing(parse_tasks.len());
    }

    let parsed_results = parse_tasks_in_parallel(parse_tasks, reporter.cloned())?;
    let mut to_add = Vec::new();
    let mut to_update = Vec::new();

    for result in parsed_results {
        songs_by_index[result.index] = Some(result.song.clone());
        if result.is_add {
            to_add.push(result.song);
        } else {
            to_update.push(result.song);
        }
    }

    let mut songs: Vec<Song> = songs_by_index.into_iter().flatten().collect();
    let to_delete: Vec<String> = db_snapshot.keys().cloned().collect();

    enrich_album_groups(&mut songs);

    let song_by_path: HashMap<String, Song> = songs
        .iter()
        .cloned()
        .map(|song| (song.path.clone(), song))
        .collect();

    let to_add = to_add
        .into_iter()
        .map(|song| song_by_path.get(&song.path).cloned().unwrap_or(song))
        .collect();

    let to_update = to_update
        .into_iter()
        .map(|song| song_by_path.get(&song.path).cloned().unwrap_or(song))
        .collect();

    Ok(ScanDiff {
        songs,
        to_add,
        to_update,
        to_delete,
        has_disk_songs,
    })
}

fn ensure_artist_id(
    conn: &rusqlite::Transaction<'_>,
    artist_cache: &mut HashMap<String, i64>,
    artist_name: &str,
) -> Result<i64, String> {
    let cache_key = artist_name.to_lowercase();
    if let Some(artist_id) = artist_cache.get(&cache_key) {
        return Ok(*artist_id);
    }

    conn.execute(
        "INSERT INTO artists (name) VALUES (?1)
         ON CONFLICT(name) DO NOTHING",
        params![artist_name],
    )
    .map_err(|e| e.to_string())?;

    let artist_id = conn
        .query_row(
            "SELECT id FROM artists WHERE name = ?1 COLLATE NOCASE",
            params![artist_name],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    artist_cache.insert(cache_key, artist_id);
    Ok(artist_id)
}

fn load_song_ids_by_paths(
    conn: &rusqlite::Transaction<'_>,
    paths: &[String],
) -> Result<HashMap<String, i64>, String> {
    if paths.is_empty() {
        return Ok(HashMap::new());
    }

    let placeholders = vec!["?"; paths.len()].join(", ");
    let sql = format!("SELECT path, id FROM songs WHERE path IN ({placeholders})");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(paths.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut song_ids = HashMap::with_capacity(paths.len());
    for row in rows.flatten() {
        song_ids.insert(row.0, row.1);
    }

    Ok(song_ids)
}

fn sync_song_artists_batch(
    conn: &rusqlite::Transaction<'_>,
    songs: &[Song],
    song_ids: &HashMap<String, i64>,
    artist_cache: &mut HashMap<String, i64>,
) -> Result<(), String> {
    if songs.is_empty() || song_ids.is_empty() {
        return Ok(());
    }

    let mut delete_stmt = conn
        .prepare("DELETE FROM song_artists WHERE song_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut insert_stmt = conn
        .prepare(
            "INSERT INTO song_artists (song_id, artist_id, sort_order)
             VALUES (?1, ?2, ?3)",
        )
        .map_err(|e| e.to_string())?;

    for song in songs {
        let Some(song_id) = song_ids.get(&song.path).copied() else {
            continue;
        };

        delete_stmt
            .execute(params![song_id])
            .map_err(|e| e.to_string())?;

        let normalized_names = if song.artist_names.is_empty() {
            vec![UNKNOWN_ARTIST.to_string()]
        } else {
            song.artist_names.clone()
        };

        for (sort_order, artist_name) in normalized_names.iter().enumerate() {
            let artist_id = ensure_artist_id(conn, artist_cache, artist_name)?;
            insert_stmt
                .execute(params![song_id, artist_id, sort_order as i64])
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn apply_insert_batch(conn: &mut rusqlite::Connection, songs: &[Song]) -> Result<(), String> {
    if songs.is_empty() {
        return Ok(());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut artist_cache = HashMap::new();
    {
        let mut insert_stmt = tx
            .prepare(
                "INSERT INTO songs (
                path,
                title,
                artist,
                artist_names,
                effective_artist_names,
                album,
                album_artist,
                album_key,
                is_various_artists_album,
                collapse_artist_credits,
                duration,
                cover_path,
                bitrate,
                sample_rate,
                bit_depth,
                format,
                container,
                codec,
                file_size,
                added_at,
                file_modified_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
             ON CONFLICT(path) DO UPDATE SET
                title = excluded.title,
                artist = excluded.artist,
                artist_names = excluded.artist_names,
                effective_artist_names = excluded.effective_artist_names,
                album = excluded.album,
                album_artist = excluded.album_artist,
                album_key = excluded.album_key,
                is_various_artists_album = excluded.is_various_artists_album,
                collapse_artist_credits = excluded.collapse_artist_credits,
                duration = excluded.duration,
                cover_path = COALESCE(songs.cover_path, excluded.cover_path),
                bitrate = excluded.bitrate,
                sample_rate = excluded.sample_rate,
                bit_depth = excluded.bit_depth,
                format = excluded.format,
                container = excluded.container,
                codec = excluded.codec,
                file_size = excluded.file_size,
                added_at = COALESCE(songs.added_at, excluded.added_at),
                file_modified_at = excluded.file_modified_at",
            )
            .map_err(|e| e.to_string())?;

        for song in songs {
            let file_size_i64 = u64_to_i64_saturated(song.file_size);
            let added_at_i64 = u64_opt_to_i64_saturated(song.added_at);
            let mtime_i64 = u64_opt_to_i64_saturated(song.file_modified_at);
            let artist_names_json = serialize_string_list(&song.artist_names)?;
            let effective_artist_names_json = serialize_string_list(&song.effective_artist_names)?;
            insert_stmt
                .execute(params![
                    &song.path,
                    &song.title,
                    &song.artist,
                    artist_names_json,
                    effective_artist_names_json,
                    &song.album,
                    &song.album_artist,
                    &song.album_key,
                    if song.is_various_artists_album { 1 } else { 0 },
                    if song.collapse_artist_credits { 1 } else { 0 },
                    song.duration as i64,
                    &song.cover,
                    song.bitrate as i64,
                    song.sample_rate as i64,
                    song.bit_depth.map(|v| v as i64),
                    &song.format,
                    &song.container,
                    &song.codec,
                    file_size_i64,
                    added_at_i64,
                    mtime_i64
                ])
                .map_err(|e| format!("insert failed for '{}': {}", song.path, e))?;
        }

        let song_paths: Vec<String> = songs.iter().map(|song| song.path.clone()).collect();
        let song_ids = load_song_ids_by_paths(&tx, &song_paths)?;
        sync_song_artists_batch(&tx, songs, &song_ids, &mut artist_cache)?;
    }

    tx.commit().map_err(|e| e.to_string())
}

fn apply_update_batch(conn: &mut rusqlite::Connection, songs: &[Song]) -> Result<(), String> {
    if songs.is_empty() {
        return Ok(());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut artist_cache = HashMap::new();
    {
        let mut update_stmt = tx
            .prepare(
                "UPDATE songs
             SET title = ?1,
                 artist = ?2,
                 artist_names = ?3,
                 effective_artist_names = ?4,
                 album = ?5,
                 album_artist = ?6,
                 album_key = ?7,
                 is_various_artists_album = ?8,
                 collapse_artist_credits = ?9,
                 duration = ?10,
                 bitrate = ?11,
                 sample_rate = ?12,
                 bit_depth = ?13,
                 format = ?14,
                 container = ?15,
                 codec = ?16,
                 file_size = ?17,
                 file_modified_at = ?18
             WHERE path = ?19",
            )
            .map_err(|e| e.to_string())?;

        for song in songs {
            let file_size_i64 = u64_to_i64_saturated(song.file_size);
            let mtime_i64 = u64_opt_to_i64_saturated(song.file_modified_at);
            let artist_names_json = serialize_string_list(&song.artist_names)?;
            let effective_artist_names_json = serialize_string_list(&song.effective_artist_names)?;
            update_stmt
                .execute(params![
                    &song.title,
                    &song.artist,
                    artist_names_json,
                    effective_artist_names_json,
                    &song.album,
                    &song.album_artist,
                    &song.album_key,
                    if song.is_various_artists_album { 1 } else { 0 },
                    if song.collapse_artist_credits { 1 } else { 0 },
                    song.duration as i64,
                    song.bitrate as i64,
                    song.sample_rate as i64,
                    song.bit_depth.map(|v| v as i64),
                    &song.format,
                    &song.container,
                    &song.codec,
                    file_size_i64,
                    mtime_i64,
                    &song.path
                ])
                .map_err(|e| format!("update failed for '{}': {}", song.path, e))?;
        }

        let song_paths: Vec<String> = songs.iter().map(|song| song.path.clone()).collect();
        let song_ids = load_song_ids_by_paths(&tx, &song_paths)?;
        sync_song_artists_batch(&tx, songs, &song_ids, &mut artist_cache)?;
    }

    tx.commit().map_err(|e| e.to_string())
}

fn apply_delete_batch(conn: &mut rusqlite::Connection, paths: &[String]) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut delete_stmt = tx
            .prepare("DELETE FROM songs WHERE path = ?1")
            .map_err(|e| e.to_string())?;

        for path in paths {
            delete_stmt
                .execute(params![path])
                .map_err(|e| format!("delete failed for '{}': {}", path, e))?;
        }
    }

    tx.commit().map_err(|e| e.to_string())
}

fn cleanup_unused_artists(conn: &mut rusqlite::Connection) {
    conn.execute(
        "DELETE FROM artists
         WHERE id NOT IN (SELECT DISTINCT artist_id FROM song_artists)",
        [],
    )
    .ok();
}

fn apply_scan_changes(
    conn: &mut rusqlite::Connection,
    to_add: &[Song],
    to_update: &[Song],
    to_delete: &[String],
    reporter: Option<&ScanProgressReporter>,
) -> Result<(), String> {
    if to_add.is_empty() && to_update.is_empty() && to_delete.is_empty() {
        if let Some(reporter) = reporter {
            reporter.emit_writing(0, 0);
        }
        return Ok(());
    }

    let total_operations = to_add.len() + to_update.len() + to_delete.len();
    let mut written_operations = 0usize;
    if let Some(reporter) = reporter {
        reporter.emit_writing(0, total_operations);
    }

    for chunk in to_add.chunks(DB_PROGRESS_BATCH) {
        apply_insert_batch(conn, chunk)?;
        written_operations += chunk.len();
        if let Some(reporter) = reporter {
            reporter.emit_writing(written_operations, total_operations);
            reporter.emit_batch(chunk.to_vec(), Vec::new());
        }
    }

    for chunk in to_update.chunks(DB_PROGRESS_BATCH) {
        apply_update_batch(conn, chunk)?;
        written_operations += chunk.len();
        if let Some(reporter) = reporter {
            reporter.emit_writing(written_operations, total_operations);
            reporter.emit_batch(chunk.to_vec(), Vec::new());
        }
    }

    for chunk in to_delete.chunks(DB_PROGRESS_BATCH) {
        apply_delete_batch(conn, chunk)?;
        written_operations += chunk.len();
        if let Some(reporter) = reporter {
            reporter.emit_writing(written_operations, total_operations);
            reporter.emit_batch(Vec::new(), chunk.to_vec());
        }
    }

    cleanup_unused_artists(conn);
    Ok(())
}

/// 内部扫描核心逻辑 - 差异化批量同步
pub fn scan_single_directory_internal(
    folder_path: String,
    db_conn: Arc<Mutex<rusqlite::Connection>>,
    app: Option<AppHandle>,
    folder_index: usize,
    folder_total: usize,
) -> Result<Vec<Song>, String> {
    let normalized_folder = normalize_path(&folder_path);
    let reporter = app.map(|app| {
        ScanProgressReporter::new(app, normalized_folder.clone(), folder_index, folder_total)
    });

    // Step 1: 仅持锁读取 DB 快照
    let db_snapshot = {
        let conn = db_conn.lock().map_err(|e| e.to_string())?;
        load_db_snapshot_for_folder(&conn, &normalized_folder)?
    };

    let original_db_count = db_snapshot.len();

    // Step 2: 无锁扫描文件系统 + 差异计算
    let scan_diff = collect_scan_diff(&normalized_folder, db_snapshot, reporter.as_ref())?;

    if !scan_diff.has_disk_songs && original_db_count > 0 {
        let error = "文件夹可能已断开连接或路径错误，未执行删除操作".to_string();
        if let Some(reporter) = reporter.as_ref() {
            reporter.emit_error(error.clone());
        }
        return Err(error);
    }

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
            reporter.as_ref(),
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

    if let Some(reporter) = reporter.as_ref() {
        reporter.emit_complete(scan_diff.songs.len());
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
        scan_single_directory_internal(folder_path, db_conn, None, 1, 1)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(result)
}

#[tauri::command]
pub async fn parse_audio_files(paths: Vec<String>) -> Result<Vec<Song>, String> {
    let result = tauri::async_runtime::spawn_blocking(move || parse_audio_files_internal(paths))
        .await
        .map_err(|e| e.to_string())?;

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
                    if is_supported_library_extension(&ext_str) {
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
