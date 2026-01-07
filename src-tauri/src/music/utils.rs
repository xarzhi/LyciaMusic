// music/utils.rs - 辅助函数

use std::fs;

/// 路径标准化
pub fn normalize_path(path_str: &str) -> String {
    if let Ok(p) = fs::canonicalize(path_str) {
        let mut s = p.to_string_lossy().into_owned();
        if cfg!(windows) && s.starts_with(r"\\?\") {
            s = s[4..].to_string();
        }
        return s;
    }
    let s = path_str.to_string();
    if cfg!(windows) {
        s.replace("/", "\\")
    } else {
        s
    }
}
