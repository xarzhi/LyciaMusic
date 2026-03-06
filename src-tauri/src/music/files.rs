// music/files.rs - 文件操作命令

use crate::error::CommandError;
use lofty::prelude::*;
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use std::fs;
use std::path::Path;
use std::process::Command;

fn contains_lrc_timestamp(text: &str) -> bool {
    let bytes = text.as_bytes();
    let mut i = 0usize;

    while i < bytes.len() {
        if bytes[i] == b'[' {
            let mut j = i + 1;
            let mut min_digits = 0usize;
            while j < bytes.len() && bytes[j].is_ascii_digit() {
                min_digits += 1;
                j += 1;
            }

            if min_digits > 0 && j < bytes.len() && bytes[j] == b':' {
                j += 1;
                if j + 1 < bytes.len() && bytes[j].is_ascii_digit() && bytes[j + 1].is_ascii_digit()
                {
                    j += 2;

                    if j < bytes.len() && bytes[j] == b'.' {
                        j += 1;
                        let mut frac_digits = 0usize;
                        while j < bytes.len() && bytes[j].is_ascii_digit() {
                            frac_digits += 1;
                            j += 1;
                        }
                        if frac_digits > 0 && j < bytes.len() && bytes[j] == b']' {
                            return true;
                        }
                    } else if j < bytes.len() && bytes[j] == b']' {
                        return true;
                    }
                }
            }
        }
        i += 1;
    }

    false
}

fn read_sidecar_lrc(path_obj: &Path) -> Option<String> {
    let stem = path_obj.file_stem()?.to_string_lossy().to_string();
    let parent = path_obj.parent()?;

    let exact_path = parent.join(format!("{}.lrc", stem));
    if let Ok(content) = fs::read_to_string(&exact_path) {
        return Some(content);
    }

    let entries = fs::read_dir(parent).ok()?;
    for entry in entries.flatten() {
        let candidate = entry.path();
        if !candidate.is_file() {
            continue;
        }

        let ext_is_lrc = candidate
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("lrc"))
            .unwrap_or(false);
        if !ext_is_lrc {
            continue;
        }

        let candidate_stem = candidate.file_stem()?.to_string_lossy().to_string();
        if !candidate_stem.eq_ignore_ascii_case(&stem) {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&candidate) {
            return Some(content);
        }
    }

    None
}

#[tauri::command]
pub async fn get_song_lyrics(path: String) -> Result<String, String> {
    if let Ok(probe) = Probe::open(&path) {
        if let Ok(tagged_file) = probe.read() {
            if let Some(tag) = tagged_file.primary_tag() {
                if let Some(lyrics) = tag.get_string(&ItemKey::Lyrics) {
                    return Ok(lyrics.to_string());
                }
                for item in tag.items() {
                    if item.key() == &ItemKey::Comment {
                        if let Some(text) = item.value().text() {
                            if contains_lrc_timestamp(text) {
                                return Ok(text.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    let path_obj = Path::new(&path);
    if let Some(content) = read_sidecar_lrc(path_obj) {
        return Ok(content);
    }

    Ok(String::new())
}

#[tauri::command]
pub fn batch_move_music_files(
    paths: Vec<String>,
    target_folder: String,
) -> Result<u32, CommandError> {
    let mut success_count = 0;
    let target = Path::new(&target_folder);
    if !target.exists() || !target.is_dir() {
        return Err(CommandError::new("TARGET_NOT_FOUND", "目标文件夹不存在"));
    }
    for path_str in paths {
        let src = Path::new(&path_str);
        if let Some(file_name) = src.file_name() {
            let dest = target.join(file_name);
            if fs::rename(src, &dest).is_ok() {
                success_count += 1;
            }
        }
    }
    Ok(success_count)
}

#[tauri::command]
pub fn move_music_file(old_path: String, new_path: String) -> Result<(), String> {
    let src = Path::new(&old_path);
    let dest = Path::new(&new_path);
    if !src.exists() {
        return Err("源文件不存在".to_string());
    }
    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::rename(src, dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn show_in_folder(path: String) {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .unwrap_or_else(|_| {
                println!("Failed");
                child_dummy()
            });
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .unwrap_or_else(|_| {
                println!("Failed");
                child_dummy()
            });
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = std::path::Path::new(&path).parent() {
            Command::new("xdg-open").arg(parent).spawn().ok();
        }
    }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn child_dummy() -> std::process::Child {
    Command::new("true").spawn().unwrap()
}

#[tauri::command]
pub fn delete_music_file(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_folder(path: String) -> Result<(), String> {
    fs::remove_dir_all(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_file_to_folder(source_path: String, target_folder: String) -> Result<(), String> {
    let source = Path::new(&source_path);
    let filename = source.file_name().ok_or("Invalid source filename")?;
    let target = Path::new(&target_folder).join(filename);

    if target.exists() {
        return Err("Target file already exists".to_string());
    }

    fs::rename(source, target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_directory(path: String) -> bool {
    Path::new(&path).is_dir()
}
