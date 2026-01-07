// music/covers.rs - 封面缓存与缩略图生成

use super::types::ImageConcurrencyLimit;
use image::ImageFormat;
use lofty::prelude::*;
use lofty::probe::Probe;
use sha2::{Digest, Sha256};
use std::fs;
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

pub fn get_or_create_thumbnail(path: &Path, app: &AppHandle) -> Option<String> {
    let hash = generate_hash(path);
    let cache_dir = get_cover_cache_dir(app);
    let cache_path = cache_dir.join(format!("{}_thumb_300.jpg", hash));

    if cache_path.exists() {
        return Some(cache_path.to_string_lossy().into_owned());
    }

    if let Ok(tagged_file) = Probe::open(path).ok()?.read() {
        if let Some(tag) = tagged_file.primary_tag() {
            let pictures = tag.pictures();
            let pic_opt = pictures
                .iter()
                .find(|p| p.pic_type() == lofty::picture::PictureType::CoverFront)
                .or(pictures.first());

            if let Some(pic) = pic_opt {
                if let Ok(img) = image::load_from_memory(pic.data()) {
                    let resized = img.resize(300, 300, image::imageops::FilterType::Triangle);
                    if let Ok(mut file) = fs::File::create(&cache_path) {
                        if resized.write_to(&mut file, ImageFormat::Jpeg).is_ok() {
                            return Some(cache_path.to_string_lossy().into_owned());
                        }
                    }
                }
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
        return Some(cache_path.to_string_lossy().into_owned());
    }

    if let Ok(tagged_file) = Probe::open(path).ok()?.read() {
        if let Some(tag) = tagged_file.primary_tag() {
            let pictures = tag.pictures();
            let pic_opt = pictures
                .iter()
                .find(|p| p.pic_type() == lofty::picture::PictureType::CoverFront)
                .or(pictures.first());

            if let Some(pic) = pic_opt {
                if fs::write(&cache_path, pic.data()).is_ok() {
                    return Some(cache_path.to_string_lossy().into_owned());
                }
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
