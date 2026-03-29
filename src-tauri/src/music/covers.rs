// music/covers.rs - 封面缓存与缩略图生成

use super::tags::{find_embedded_picture, read_tagged_file_from_path};
use super::types::ImageConcurrencyLimit;
use image::ImageFormat;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::{AppHandle, Manager, State};

pub fn get_cover_cache_dir(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap().join("covers");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

#[tauri::command]
pub fn run_cache_cleanup(app: &AppHandle) {
    let cache_dir = get_cover_cache_dir(app);
    let max_size = 500 * 1024 * 1024; // 500 MB

    std::thread::spawn(move || {
        if let Ok(read_dir) = fs::read_dir(&cache_dir) {
            let mut files: Vec<_> = read_dir
                .filter_map(|entry| entry.ok())
                .filter_map(|entry| {
                    let metadata = entry.metadata().ok()?;
                    let len = metadata.len();
                    let accessed = metadata
                        .accessed()
                        .or(metadata.modified())
                        .unwrap_or(SystemTime::now());
                    Some((entry.path(), len, accessed))
                })
                .collect();

            files.sort_by_key(|&(_, _, time)| time);
            let mut total_size: u64 = files.iter().map(|&(_, len, _)| len).sum();

            if total_size > max_size {
                println!("缓存清理开始: 当前 {} MB", total_size / 1024 / 1024);
                for (path, len, _) in files {
                    if total_size <= max_size {
                        break;
                    }
                    if fs::remove_file(&path).is_ok() {
                        total_size = total_size.saturating_sub(len);
                    }
                }
                println!("缓存清理结束: 剩余 {} MB", total_size / 1024 / 1024);
            }
        }
    });
}

fn generate_hash(path: &Path) -> String {
    let mut hasher = Sha256::new();

    if let Ok(metadata) = fs::metadata(path) {
        let len = metadata.len();
        let mtime_secs = metadata
            .modified()
            .unwrap_or(SystemTime::now())
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        hasher.update(len.to_be_bytes());
        hasher.update(mtime_secs.to_be_bytes());
    } else {
        hasher.update(
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
                .to_be_bytes(),
        );
    }

    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
    hasher.update(file_name.as_bytes());

    hex::encode(hasher.finalize())
}

fn is_cached_cover_valid(path: &Path) -> bool {
    image::open(path).is_ok()
}

fn create_temp_cache_path(cache_path: &Path) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let file_name = cache_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    cache_path.with_file_name(format!("{file_name}.{nonce}.tmp"))
}

fn persist_image_atomically(img: &image::DynamicImage, cache_path: &Path) -> Option<String> {
    let temp_path = create_temp_cache_path(cache_path);
    let file = fs::File::create(&temp_path).ok()?;
    let mut writer = BufWriter::new(file);

    if img.write_to(&mut writer, ImageFormat::Jpeg).is_err() || writer.flush().is_err() {
        let _ = fs::remove_file(&temp_path);
        return None;
    }
    drop(writer);

    if cache_path.exists() {
        if is_cached_cover_valid(cache_path) {
            let _ = fs::remove_file(&temp_path);
            return Some(cache_path.to_string_lossy().into_owned());
        }
        let _ = fs::remove_file(cache_path);
    }

    if fs::rename(&temp_path, cache_path).is_err() {
        let _ = fs::remove_file(&temp_path);
        if is_cached_cover_valid(cache_path) {
            return Some(cache_path.to_string_lossy().into_owned());
        }
        return None;
    }

    Some(cache_path.to_string_lossy().into_owned())
}

pub fn get_or_create_thumbnail(path: &Path, app: &AppHandle) -> Option<String> {
    let hash = generate_hash(path);
    let cache_dir = get_cover_cache_dir(app);
    let cache_path = cache_dir.join(format!("{}_thumb_300.jpg", hash));

    if cache_path.exists() {
        if is_cached_cover_valid(&cache_path) {
            return Some(cache_path.to_string_lossy().into_owned());
        }
        let _ = fs::remove_file(&cache_path);
    }

    if let Ok(tagged_file) = read_tagged_file_from_path(path) {
        if let Some(pic) = find_embedded_picture(&tagged_file) {
            if let Ok(img) = image::load_from_memory(pic.data()) {
                let resized = img.resize(300, 300, image::imageops::FilterType::Triangle);
                return persist_image_atomically(&resized, &cache_path);
            }
        }
    }
    None
}

pub fn get_or_create_full_cover(path: &Path, app: &AppHandle) -> Option<String> {
    let hash = generate_hash(path);
    let cache_dir = get_cover_cache_dir(app);
    let cache_path = cache_dir.join(format!("{}_full.jpg", hash));

    if cache_path.exists() {
        if is_cached_cover_valid(&cache_path) {
            return Some(cache_path.to_string_lossy().into_owned());
        }
        let _ = fs::remove_file(&cache_path);
    }

    if let Ok(tagged_file) = read_tagged_file_from_path(path) {
        if let Some(pic) = find_embedded_picture(&tagged_file) {
            if let Ok(img) = image::load_from_memory(pic.data()) {
                return persist_image_atomically(&img, &cache_path);
            }
        }
    }
    None
}

#[tauri::command]
pub async fn get_song_cover_thumbnail(
    path: String,
    app: AppHandle,
    semaphore: State<'_, ImageConcurrencyLimit>,
) -> Result<String, String> {
    let _permit = semaphore.0.acquire().await.map_err(|e| e.to_string())?;

    let p = Path::new(&path);
    let app_clone = app.clone();
    let p_buf = p.to_path_buf();

    let result =
        tauri::async_runtime::spawn_blocking(move || get_or_create_thumbnail(&p_buf, &app_clone))
            .await
            .map_err(|e| e.to_string())?;

    if let Some(cache_path_str) = result {
        return Ok(cache_path_str);
    }
    Ok(String::new())
}

#[tauri::command]
pub async fn get_song_cover(
    path: String,
    app: AppHandle,
    semaphore: State<'_, ImageConcurrencyLimit>,
) -> Result<String, String> {
    let _permit = semaphore.0.acquire().await.map_err(|e| e.to_string())?;

    let p = Path::new(&path);
    let app_clone = app.clone();
    let p_buf = p.to_path_buf();

    let result =
        tauri::async_runtime::spawn_blocking(move || get_or_create_full_cover(&p_buf, &app_clone))
            .await
            .map_err(|e| e.to_string())?;

    if let Some(cache_path_str) = result {
        return Ok(cache_path_str);
    }
    Ok(String::new())
}
