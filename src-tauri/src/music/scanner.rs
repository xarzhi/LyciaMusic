// music/scanner.rs - 扫描逻辑

use super::tags::{extract_text_metadata, read_tagged_file_from_path};
use super::types::{FolderNode, GeneratedFolder, Song};
use super::utils::{descendant_like_patterns, is_supported_library_extension, normalize_path};
use crate::database::DbState;
use lofty::file::FileType;
use lofty::prelude::*;
use lofty::probe::Probe;
use regex::Regex;
use rusqlite::{params, OptionalExtension};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::sync::{Arc, Mutex};
use symphonia::core::codecs::CODEC_TYPE_NULL;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::TimeBase;
use tauri::{AppHandle, State};
use walkdir::WalkDir;

const VARIOUS_ARTISTS: &str = "Various Artists";
const VARIOUS_ARTISTS_THRESHOLD: usize = 5;

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
    let identity = detect_audio_identity(path, format);

    if let Ok(meta) = fs::metadata(path) {
        file_size = meta.len();
        if let Ok(modified) = meta.modified() {
            file_modified_at = modified
                .duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| d.as_secs());
        }
    }

    if let Ok(tagged_file) = read_tagged_file_from_path(path).map_err(|e| e.to_string()) {
        let props = tagged_file.properties();
        duration = props.duration().as_secs() as u32;
        bitrate = props.audio_bitrate().unwrap_or(0);
        sample_rate = props.sample_rate().unwrap_or(0);
        bit_depth = props.bit_depth().map(|b| b as u8);

        fill_text_fields_from_tags(
            &tagged_file,
            &mut artist,
            &mut album,
            &mut title,
            &mut album_artist,
        );
    }

    if duration == 0 {
        duration = identity.duration_seconds.unwrap_or(0);
    }
    if sample_rate == 0 {
        sample_rate = identity.sample_rate.unwrap_or(0);
    }
    if bit_depth.is_none() {
        bit_depth = identity.bit_depth;
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
        container: identity.container,
        codec: identity.codec,
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

fn detect_container(path: &Path) -> Option<String> {
    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);
    let probe = Probe::new(reader).guess_file_type().ok()?;
    let file_type = probe.file_type()?;
    Some(normalize_container(file_type).to_string())
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

fn detect_codec(path: &Path, ext: &str) -> Option<String> {
    let file = File::open(path).ok()?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    hint.with_extension(ext);

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .ok()?;

    let track = probed
        .format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)?;

    let descriptor = symphonia::default::get_codecs().get_codec(track.codec_params.codec)?;
    Some(normalize_codec(descriptor.short_name))
}

fn detect_stream_details(path: &Path, ext: &str) -> (Option<u32>, Option<u32>, Option<u8>) {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(_) => return (None, None, None),
    };

    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    hint.with_extension(ext);

    let probed = match symphonia::default::get_probe().format(
        &hint,
        mss,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    ) {
        Ok(probed) => probed,
        Err(_) => return (None, None, None),
    };

    let track = match probed
        .format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
    {
        Some(track) => track,
        None => return (None, None, None),
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

    (duration_seconds, sample_rate, bit_depth)
}

fn detect_audio_identity(path: &Path, ext: &str) -> AudioIdentity {
    let (duration_seconds, sample_rate, bit_depth) = detect_stream_details(path, ext);

    AudioIdentity {
        container: detect_container(path),
        codec: detect_codec(path, ext),
        duration_seconds,
        sample_rate,
        bit_depth,
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
        grouped_paths.entry(album_group_key).or_default().push(index);
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
                let effective_artist_names = deserialize_string_list(row.get::<_, Option<String>>(5)?);

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

fn collect_scan_diff(
    normalized_folder: &str,
    mut db_snapshot: HashMap<String, DbSongSnapshot>,
) -> ScanDiff {
    let mut songs: Vec<Song> = Vec::new();
    let mut to_add: Vec<Song> = Vec::new();
    let mut to_update: Vec<Song> = Vec::new();
    let mut has_disk_songs = false;

    fn song_identity_missing(song: &Song) -> bool {
        song.container
            .as_deref()
            .map(|v| v.trim().is_empty())
            .unwrap_or(true)
            || song
                .codec
                .as_deref()
                .map(|v| v.trim().is_empty())
                .unwrap_or(true)
    }

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

        if !is_supported_library_extension(&ext) {
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
            if db_info.file_modified_at != disk_mtime
                || db_info.file_size != disk_size
                || song_identity_missing(&db_info.song)
                || song_metadata_incomplete(&db_info.song)
            {
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

    enrich_album_groups(&mut songs);

    let song_by_path: HashMap<String, Song> = songs
        .iter()
        .cloned()
        .map(|song| (song.path.clone(), song))
        .collect();

    let to_add = to_add
        .into_iter()
        .map(|song| {
            song_by_path
                .get(&song.path)
                .cloned()
                .unwrap_or(song)
        })
        .collect();

    let to_update = to_update
        .into_iter()
        .map(|song| {
            song_by_path
                .get(&song.path)
                .cloned()
                .unwrap_or(song)
        })
        .collect();

    ScanDiff {
        songs,
        to_add,
        to_update,
        to_delete,
        has_disk_songs,
    }
}

fn get_song_id_by_path(
    conn: &rusqlite::Transaction<'_>,
    path: &str,
) -> Result<Option<i64>, String> {
    conn.query_row("SELECT id FROM songs WHERE path = ?1", params![path], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())
}

fn ensure_artist_id(
    conn: &rusqlite::Transaction<'_>,
    artist_name: &str,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO artists (name) VALUES (?1)
         ON CONFLICT(name) DO NOTHING",
        params![artist_name],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id FROM artists WHERE name = ?1 COLLATE NOCASE",
        params![artist_name],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

fn sync_song_artists(
    conn: &rusqlite::Transaction<'_>,
    song_id: i64,
    artist_names: &[String],
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM song_artists WHERE song_id = ?1",
        params![song_id],
    )
    .map_err(|e| e.to_string())?;

    let normalized_names = if artist_names.is_empty() {
        vec![UNKNOWN_ARTIST.to_string()]
    } else {
        artist_names.to_vec()
    };

    for (sort_order, artist_name) in normalized_names.iter().enumerate() {
        let artist_id = ensure_artist_id(conn, artist_name)?;
        conn.execute(
            "INSERT INTO song_artists (song_id, artist_id, sort_order)
             VALUES (?1, ?2, ?3)",
            params![song_id, artist_id, sort_order as i64],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
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

        for song in to_add {
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

            if let Some(song_id) = get_song_id_by_path(&tx, &song.path)? {
                sync_song_artists(&tx, song_id, &song.artist_names)?;
            }
        }
    }

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

        for song in to_update {
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

            if let Some(song_id) = get_song_id_by_path(&tx, &song.path)? {
                sync_song_artists(&tx, song_id, &song.artist_names)?;
            }
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

    tx.execute(
        "DELETE FROM artists
         WHERE id NOT IN (SELECT DISTINCT artist_id FROM song_artists)",
        [],
    )
    .ok();

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
