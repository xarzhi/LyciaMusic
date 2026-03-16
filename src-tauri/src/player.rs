use cpal::traits::{DeviceTrait, HostTrait};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use serde::Serialize;
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
};
use std::fs::File;
use std::io::BufReader;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub struct TimedSource<S> {
    pub inner: S,
    pub samples_played: Arc<AtomicU64>,
}

impl<S> Iterator for TimedSource<S>
where
    S: Source<Item = f32>,
{
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        let sample = self.inner.next();
        if sample.is_some() {
            self.samples_played.fetch_add(1, Ordering::Relaxed);
        }
        sample
    }
}

impl<S> Source for TimedSource<S>
where
    S: Source<Item = f32>,
{
    fn channels(&self) -> u16 {
        self.inner.channels()
    }

    fn sample_rate(&self) -> u32 {
        self.inner.sample_rate()
    }

    fn current_frame_len(&self) -> Option<usize> {
        self.inner.current_frame_len()
    }

    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }
}

pub struct SharedProgress {
    pub samples_played: Arc<AtomicU64>,
    pub sample_rate: Arc<AtomicU32>,
    pub channels: Arc<AtomicU32>,
}

pub enum AudioCommand {
    Play(String),
    Pause,
    Resume,
    Seek {
        time: f64,
        is_playing: bool,
        request_id: u64,
    },
    SetVolume(f32),
    SetDevice(Option<String>),
}

pub struct PlayerState {
    pub tx: Mutex<Sender<AudioCommand>>,
    pub progress: Arc<SharedProgress>,
    pub controls: Arc<Mutex<Option<MediaControls>>>,
    pub output_status: Arc<Mutex<AudioOutputStatus>>,
}

#[derive(Serialize, Clone)]
pub struct AudioDevice {
    id: String,
    name: String,
}

#[derive(Serialize, Clone, Default)]
pub struct AudioOutputStatus {
    selected_device_id: Option<String>,
    active_device_name: Option<String>,
    follows_system_default: bool,
}

#[derive(Serialize, Clone)]
struct SeekCompletedPayload {
    request_id: u64,
    time: f64,
}

#[tauri::command]
pub fn get_output_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let devices = host.output_devices().map_err(|e| e.to_string())?;
    let mut result = Vec::new();

    for device in devices {
        if let Ok(name) = device.name() {
            result.push(AudioDevice {
                id: name.clone(),
                name,
            });
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn set_output_device(
    device_id: Option<String>,
    state: tauri::State<PlayerState>,
) -> Result<(), String> {
    let tx = state.tx.lock().map_err(|e| e.to_string())?;
    tx.send(AudioCommand::SetDevice(device_id))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_current_output_device(
    state: tauri::State<PlayerState>,
) -> Result<AudioOutputStatus, String> {
    let status = state.output_status.lock().map_err(|e| e.to_string())?;
    Ok(status.clone())
}

fn default_output_device_name(host: &cpal::Host) -> Option<String> {
    host.default_output_device()?.name().ok()
}

fn create_output_stream(
    host: &cpal::Host,
    device_name: Option<&str>,
) -> Option<(OutputStream, OutputStreamHandle, String)> {
    if let Some(name) = device_name {
        if let Ok(mut devices) = host.output_devices() {
            if let Some(device) = devices.find(|d| d.name().map(|n| n == name).unwrap_or(false)) {
                if let Ok((stream, handle)) = OutputStream::try_from_device(&device) {
                    return Some((stream, handle, name.to_string()));
                }
            }
        }
    }

    let default_device = host.default_output_device()?;
    let active_name = default_device.name().ok()?;
    let (stream, handle) = OutputStream::try_from_device(&default_device).ok()?;
    Some((stream, handle, active_name))
}

fn emit_output_status(
    app: &AppHandle,
    status: &Arc<Mutex<AudioOutputStatus>>,
    selected_device_id: Option<String>,
    active_device_name: Option<String>,
) {
    let next_status = AudioOutputStatus {
        selected_device_id: selected_device_id.clone(),
        active_device_name,
        follows_system_default: selected_device_id.is_none(),
    };

    if let Ok(mut current_status) = status.lock() {
        *current_status = next_status.clone();
    }

    let _ = app.emit("audio-output-device-changed", next_status);
}

fn restore_current_playback(
    stream_data: &Option<(OutputStream, OutputStreamHandle, String)>,
    current_sink: &mut Option<Sink>,
    current_path: &str,
    current_volume: f32,
    is_playing_flag: bool,
    progress: &Arc<SharedProgress>,
) {
    if current_path.is_empty() {
        return;
    }

    if let Some((_, handle, _)) = stream_data {
        *current_sink = Sink::try_new(handle).ok();

        let current_samples = progress.samples_played.load(Ordering::Relaxed);
        let rate = progress.sample_rate.load(Ordering::Relaxed);
        let channels = progress.channels.load(Ordering::Relaxed);
        let time_played = if rate > 0 && channels > 0 {
            current_samples as f64 / (rate as u64 * channels as u64) as f64
        } else {
            0.0
        };
        let jump_target = Duration::from_secs_f64(time_played);

        if let Ok(file) = File::open(current_path) {
            let reader = BufReader::with_capacity(512 * 1024, file);
            if let Ok(source) = Decoder::new(reader) {
                let timed_source = TimedSource {
                    inner: source.convert_samples::<f32>().skip_duration(jump_target),
                    samples_played: progress.samples_played.clone(),
                };
                if let Some(sink) = current_sink.as_ref() {
                    sink.set_volume(current_volume);
                    sink.append(timed_source);
                    if is_playing_flag {
                        sink.play();
                    } else {
                        sink.pause();
                    }
                }
            }
        }
    }
}

pub fn init_player(app: &AppHandle) -> PlayerState {
    let (tx, rx) = channel::<AudioCommand>();
    let shared_progress = Arc::new(SharedProgress {
        samples_played: Arc::new(AtomicU64::new(0)),
        sample_rate: Arc::new(AtomicU32::new(44100)),
        channels: Arc::new(AtomicU32::new(2)),
    });
    let thread_progress = shared_progress.clone();
    let thread_app_handle = app.clone();
    let controls = Arc::new(Mutex::new(None));
    let output_status = Arc::new(Mutex::new(AudioOutputStatus::default()));

    if let Some(window) = app.get_webview_window("main") {
        if let Ok(handle) = window.window_handle() {
            let raw_handle = handle.as_raw();

            #[cfg(target_os = "windows")]
            {
                if let RawWindowHandle::Win32(h) = raw_handle {
                    let hwnd = h.hwnd.get() as *mut std::ffi::c_void;

                    let config = PlatformConfig {
                        dbus_name: "my_cloud_music",
                        display_name: "My Cloud Music",
                        hwnd: Some(hwnd),
                    };

                    match MediaControls::new(config) {
                        Ok(mut mc) => {
                            let app_clone = app.clone();
                            let _ = mc.attach(move |event| match event {
                                MediaControlEvent::Play => {
                                    let _ = app_clone.emit("player:play", ());
                                }
                                MediaControlEvent::Pause => {
                                    let _ = app_clone.emit("player:pause", ());
                                }
                                MediaControlEvent::Next => {
                                    let _ = app_clone.emit("player:next", ());
                                }
                                MediaControlEvent::Previous => {
                                    let _ = app_clone.emit("player:prev", ());
                                }
                                _ => {}
                            });
                            *controls.lock().unwrap() = Some(mc);
                        }
                        Err(e) => println!("Error initializing MediaControls: {:?}", e),
                    }
                }
            }
        }
    }

    let thread_output_status = output_status.clone();

    thread::spawn(move || {
        let host = cpal::default_host();
        let mut selected_device_name: Option<String> = None;
        let mut stream_data = create_output_stream(&host, None);
        let mut current_sink: Option<Sink> = None;
        let mut current_path = String::new();
        let mut current_volume = 1.0;
        let mut is_playing_flag = false;
        let mut active_device_name = stream_data.as_ref().map(|(_, _, name)| name.clone());

        if let Some((_, handle, _)) = &stream_data {
            current_sink = Sink::try_new(handle).ok();
        }

        emit_output_status(
            &thread_app_handle,
            &thread_output_status,
            selected_device_name.clone(),
            active_device_name.clone(),
        );

        loop {
            match rx.recv_timeout(Duration::from_millis(750)) {
                Ok(cmd) => match cmd {
                    AudioCommand::Play(path) => {
                        current_path = path.clone();
                        is_playing_flag = true;

                        if let Some((_, handle, _)) = &stream_data {
                            if let Some(sink) = &current_sink {
                                sink.stop();
                            }
                            current_sink = Sink::try_new(handle).ok();

                            if let Ok(file) = File::open(&current_path) {
                                let reader = BufReader::with_capacity(512 * 1024, file);
                                if let Ok(source) = Decoder::new(reader) {
                                    let rate = source.sample_rate();
                                    let channels = source.channels();
                                    thread_progress.sample_rate.store(rate, Ordering::Relaxed);
                                    thread_progress
                                        .channels
                                        .store(channels as u32, Ordering::Relaxed);
                                    thread_progress.samples_played.store(0, Ordering::Relaxed);

                                    let timed_source = TimedSource {
                                        inner: source.convert_samples::<f32>(),
                                        samples_played: thread_progress.samples_played.clone(),
                                    };

                                    if let Some(sink) = &current_sink {
                                        sink.append(timed_source);
                                        sink.set_volume(current_volume);
                                        sink.play();
                                    }
                                }
                            }
                        }
                    }
                    AudioCommand::Pause => {
                        is_playing_flag = false;
                        if let Some(sink) = &current_sink {
                            sink.pause();
                        }
                    }
                    AudioCommand::Resume => {
                        is_playing_flag = true;
                        if let Some(sink) = &current_sink {
                            sink.play();
                        }
                    }
                    AudioCommand::Seek {
                        time,
                        is_playing,
                        request_id,
                    } => {
                        let clamped_time = time.max(0.0);
                        let jump_target = Duration::from_secs_f64(clamped_time);
                        is_playing_flag = is_playing;

                        if let Some(sink) = &current_sink {
                            if sink.try_seek(jump_target).is_ok() {
                                let rate = thread_progress.sample_rate.load(Ordering::Relaxed);
                                let channels = thread_progress.channels.load(Ordering::Relaxed);
                                let samples_at_target =
                                    (clamped_time * rate as f64 * channels as f64).round() as u64;
                                thread_progress
                                    .samples_played
                                    .store(samples_at_target, Ordering::Relaxed);

                                if is_playing {
                                    sink.play();
                                } else {
                                    sink.pause();
                                }
                            } else if !current_path.is_empty() {
                                if let Some((_, handle, _)) = &stream_data {
                                    sink.stop();
                                    current_sink = Sink::try_new(handle).ok();

                                    if let Ok(file) = File::open(&current_path) {
                                        let reader = BufReader::with_capacity(512 * 1024, file);
                                        if let Ok(source) = Decoder::new(reader) {
                                            let rate = source.sample_rate();
                                            let channels = source.channels();
                                            let samples_to_skip =
                                                (clamped_time * rate as f64 * channels as f64)
                                                    .round() as u64;
                                            thread_progress
                                                .samples_played
                                                .store(samples_to_skip, Ordering::Relaxed);

                                            let timed_source = TimedSource {
                                                inner: source
                                                    .convert_samples::<f32>()
                                                    .skip_duration(jump_target),
                                                samples_played: thread_progress
                                                    .samples_played
                                                    .clone(),
                                            };

                                            if let Some(new_sink) = &current_sink {
                                                new_sink.set_volume(current_volume);
                                                new_sink.append(timed_source);
                                                if is_playing {
                                                    new_sink.play();
                                                } else {
                                                    new_sink.pause();
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        let _ = thread_app_handle.emit(
                            "seek_completed",
                            SeekCompletedPayload {
                                request_id,
                                time: clamped_time,
                            },
                        );
                    }
                    AudioCommand::SetVolume(vol) => {
                        current_volume = vol;
                        if let Some(sink) = &current_sink {
                            sink.set_volume(vol);
                        }
                    }
                    AudioCommand::SetDevice(device_name) => {
                        selected_device_name = device_name;

                        if let Some(sink) = &current_sink {
                            sink.stop();
                        }
                        current_sink = None;

                        stream_data = create_output_stream(&host, selected_device_name.as_deref());
                        active_device_name = stream_data.as_ref().map(|(_, _, name)| name.clone());

                        restore_current_playback(
                            &stream_data,
                            &mut current_sink,
                            &current_path,
                            current_volume,
                            is_playing_flag,
                            &thread_progress,
                        );

                        emit_output_status(
                            &thread_app_handle,
                            &thread_output_status,
                            selected_device_name.clone(),
                            active_device_name.clone(),
                        );
                    }
                },
                Err(RecvTimeoutError::Timeout) => {
                    if selected_device_name.is_none() {
                        let next_default_name = default_output_device_name(&host);
                        if next_default_name != active_device_name {
                            if let Some(sink) = &current_sink {
                                sink.stop();
                            }
                            current_sink = None;
                            stream_data = create_output_stream(&host, None);
                            active_device_name =
                                stream_data.as_ref().map(|(_, _, name)| name.clone());

                            restore_current_playback(
                                &stream_data,
                                &mut current_sink,
                                &current_path,
                                current_volume,
                                is_playing_flag,
                                &thread_progress,
                            );

                            emit_output_status(
                                &thread_app_handle,
                                &thread_output_status,
                                None,
                                active_device_name.clone(),
                            );
                        }
                    }
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    PlayerState {
        tx: Mutex::new(tx),
        progress: shared_progress,
        controls,
        output_status,
    }
}

#[tauri::command]
pub fn play_audio(
    path: String,
    title: String,
    artist: String,
    album: String,
    cover: String,
    duration: u32,
    state: tauri::State<PlayerState>,
) -> Result<(), String> {
    let tx = state.tx.lock().map_err(|e| e.to_string())?;
    tx.send(AudioCommand::Play(path))
        .map_err(|e| e.to_string())?;

    if let Ok(mut controls) = state.controls.lock() {
        if let Some(mc) = controls.as_mut() {
            let _ = mc.set_metadata(MediaMetadata {
                title: Some(&title),
                artist: Some(&artist),
                album: Some(&album),
                cover_url: if cover.is_empty() { None } else { Some(&cover) },
                duration: if duration > 0 {
                    Some(Duration::from_secs(duration as u64))
                } else {
                    None
                },
            });
            let _ = mc.set_playback(MediaPlayback::Playing {
                progress: Some(MediaPosition(Duration::from_secs(0))),
            });
        }
    }

    Ok(())
}

#[tauri::command]
pub fn pause_audio(state: tauri::State<PlayerState>) -> Result<(), String> {
    let tx = state.tx.lock().map_err(|e| e.to_string())?;
    tx.send(AudioCommand::Pause).map_err(|e| e.to_string())?;
    if let Ok(mut controls) = state.controls.lock() {
        if let Some(mc) = controls.as_mut() {
            let _ = mc.set_playback(MediaPlayback::Paused { progress: None });
        }
    }
    Ok(())
}

#[tauri::command]
pub fn resume_audio(state: tauri::State<PlayerState>) -> Result<(), String> {
    let tx = state.tx.lock().map_err(|e| e.to_string())?;
    tx.send(AudioCommand::Resume).map_err(|e| e.to_string())?;
    if let Ok(mut controls) = state.controls.lock() {
        if let Some(mc) = controls.as_mut() {
            let _ = mc.set_playback(MediaPlayback::Playing { progress: None });
        }
    }
    Ok(())
}

#[tauri::command]
pub fn seek_audio(
    time: f64,
    is_playing: bool,
    request_id: u64,
    state: tauri::State<PlayerState>,
) -> Result<(), String> {
    let tx = state.tx.lock().map_err(|e| e.to_string())?;
    tx.send(AudioCommand::Seek {
        time,
        is_playing,
        request_id,
    })
    .map_err(|e| e.to_string())?;

    if let Ok(mut controls) = state.controls.lock() {
        if let Some(mc) = controls.as_mut() {
            let progress = MediaPosition(Duration::from_secs_f64(time.max(0.0)));
            if is_playing {
                let _ = mc.set_playback(MediaPlayback::Playing {
                    progress: Some(progress),
                });
            } else {
                let _ = mc.set_playback(MediaPlayback::Paused {
                    progress: Some(progress),
                });
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn set_volume(volume: f32, state: tauri::State<PlayerState>) -> Result<(), String> {
    let tx = state.tx.lock().map_err(|e| e.to_string())?;
    tx.send(AudioCommand::SetVolume(volume))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_playback_progress(state: tauri::State<PlayerState>) -> f64 {
    let samples = state.progress.samples_played.load(Ordering::Relaxed);
    let rate = state.progress.sample_rate.load(Ordering::Relaxed);
    let channels = state.progress.channels.load(Ordering::Relaxed);

    if rate == 0 || channels == 0 {
        return 0.0;
    }

    let total_samples_per_sec = rate as u64 * channels as u64;
    samples as f64 / total_samples_per_sec as f64
}
