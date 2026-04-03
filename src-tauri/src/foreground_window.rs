use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundFullscreenState {
    pub is_fullscreen: bool,
}

#[tauri::command]
pub fn get_foreground_fullscreen_state() -> ForegroundFullscreenState {
    ForegroundFullscreenState {
        is_fullscreen: platform_is_foreground_fullscreen(),
    }
}

#[cfg(target_os = "windows")]
fn platform_is_foreground_fullscreen() -> bool {
    use std::mem::zeroed;
    use windows_sys::Win32::{
        Foundation::RECT,
        Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST},
        UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
        },
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return false;
        }

        if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
            return false;
        }

        let mut foreground_pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut foreground_pid);
        if foreground_pid == std::process::id() {
            return false;
        }

        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        if monitor.is_null() {
            return false;
        }

        let mut monitor_info: MONITORINFO = zeroed();
        monitor_info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(monitor, &mut monitor_info) == 0 {
            return false;
        }

        let mut rect: RECT = zeroed();
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return false;
        }

        let monitor_rect = monitor_info.rcMonitor;
        let tolerance = 2;

        let width_delta = ((rect.right - rect.left) - (monitor_rect.right - monitor_rect.left)).abs();
        let height_delta = ((rect.bottom - rect.top) - (monitor_rect.bottom - monitor_rect.top)).abs();
        let left_delta = (rect.left - monitor_rect.left).abs();
        let top_delta = (rect.top - monitor_rect.top).abs();

        width_delta <= tolerance
            && height_delta <= tolerance
            && left_delta <= tolerance
            && top_delta <= tolerance
    }
}

#[cfg(not(target_os = "windows"))]
fn platform_is_foreground_fullscreen() -> bool {
    false
}
