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

/// Escape special characters for SQL LIKE pattern with `ESCAPE '^'`.
pub fn escape_like(input: &str) -> String {
    input
        .replace('^', "^^")
        .replace('%', "^%")
        .replace('_', "^_")
}

/// Build forward/backward descendant LIKE patterns for a folder path.
/// Caller should use:
/// `path = ?1 OR path LIKE ?2 ESCAPE '^' OR path LIKE ?3 ESCAPE '^'`
pub fn descendant_like_patterns(folder_path: &str) -> (String, String) {
    let forward_base = if folder_path.ends_with('/') || folder_path.ends_with('\\') {
        folder_path.to_string()
    } else {
        format!("{folder_path}/")
    };

    let backward_base = if folder_path.ends_with('/') || folder_path.ends_with('\\') {
        folder_path.to_string()
    } else {
        format!("{folder_path}\\")
    };

    (
        format!("{}%", escape_like(&forward_base)),
        format!("{}%", escape_like(&backward_base)),
    )
}
