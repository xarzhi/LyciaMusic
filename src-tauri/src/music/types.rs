// music/types.rs - 数据结构定义

use serde::Serialize;
use tokio::sync::Semaphore;

/// 并发控制状态
pub struct ImageConcurrencyLimit(pub Semaphore);

#[derive(Serialize, Clone, Debug)]
pub struct Song {
    pub name: String,
    pub title: String,
    pub path: String,
    pub artist: String,
    pub album: String,
    pub duration: u32,
    pub cover: Option<String>,
    pub bitrate: u32,
    pub sample_rate: u32,
    pub bit_depth: Option<u8>,
    pub format: String,
    pub file_size: u64,
}

#[derive(Serialize)]
pub struct GeneratedFolder {
    pub name: String,
    pub path: String,
    pub songs: Vec<Song>,
}

#[derive(Serialize, Clone, Debug)]
pub struct FolderNode {
    pub name: String,
    pub path: String,
    pub children: Vec<FolderNode>,
    pub song_count: usize,
    pub cover_song_path: Option<String>,
    pub is_expanded: bool,
}

#[derive(Serialize)]
pub struct LibraryFolder {
    pub path: String,
    pub song_count: usize,
}
