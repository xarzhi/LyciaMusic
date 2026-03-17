import { invoke } from '@tauri-apps/api/core';
import * as State from './playerState';

interface PlaySongOptions {
  updateShuffleHistory?: boolean;
  clearShuffleFuture?: boolean;
  preserveQueue?: boolean;
}

interface SeekCompletedPayload {
  request_id: number;
  time: number;
}

interface CreatePlayerPlaybackDeps {
  getDisplaySongList: () => State.Song[];
  addToHistory: (song: State.Song) => void | Promise<void>;
  loadLyrics: () => void | Promise<void>;
  handleAutoNext: () => void;
  onBeforePlay?: (song: State.Song, options: PlaySongOptions) => void;
}

let progressFrameId: number | null = null;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let playRequestId = 0;
let latestSeekRequestId = 0;
let playbackAnchorTime = 0;
let playbackStartOffset = 0;
let sessionStartTime: number | null = null;
let accumulatedTime = 0;
let isSeeking = false;

export const createPlayerPlayback = ({
  getDisplaySongList,
  addToHistory,
  loadLyrics,
  handleAutoNext,
  onBeforePlay,
}: CreatePlayerPlaybackDeps) => {
  const stopPlaybackRuntime = () => {
    if (progressFrameId !== null) {
      cancelAnimationFrame(progressFrameId);
      progressFrameId = null;
    }
    if (syncIntervalId !== null) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
  };

  const reanchorPlaybackClock = (time: number) => {
    playbackAnchorTime = performance.now();
    playbackStartOffset = time;
    State.currentTime.value = time;
  };

  const startPlaybackRuntime = () => {
    stopPlaybackRuntime();
    reanchorPlaybackClock(State.currentTime.value);

    const update = () => {
      if (!State.currentSong.value || !State.isPlaying.value) return;

      const now = performance.now();
      const delta = (now - playbackAnchorTime) / 1000.0;
      State.currentTime.value = playbackStartOffset + delta;

      if (State.currentTime.value >= State.currentSong.value.duration) {
        handleAutoNext();
        return;
      }

      progressFrameId = requestAnimationFrame(update);
    };

    progressFrameId = requestAnimationFrame(update);
    syncIntervalId = setInterval(async () => {
      if (!State.isPlaying.value || isSeeking) return;

      try {
        const realTime = await invoke<number>('get_playback_progress');
        if (Math.abs(realTime - State.currentTime.value) > 0.05) {
          reanchorPlaybackClock(realTime);
        }
      } catch {}
    }, 1000);
  };

  const flushPlaySession = () => {
    const song = State.currentSong.value;
    if (!song) return;

    let currentSession = 0;
    if (State.isPlaying.value && sessionStartTime) {
      currentSession = (Date.now() - sessionStartTime) / 1000;
    }

    const totalDuration = accumulatedTime + currentSession;
    if (totalDuration >= 10) {
      invoke('record_play', {
        songPath: song.path,
        duration: Math.floor(totalDuration),
      }).catch(error => console.warn('record_play failed:', error));
    }

    accumulatedTime = 0;
    sessionStartTime = null;
  };

  const playSong = async (song: State.Song, options: PlaySongOptions = {}) => {
    const requestId = ++playRequestId;

    flushPlaySession();
    onBeforePlay?.(song, options);

    const preserveQueue = options.preserveQueue ?? false;
    State.currentSong.value = song;

    if (!preserveQueue) {
      const displaySongList = getDisplaySongList();
      if (displaySongList.some(item => item.path === song.path)) {
        State.playQueue.value = [...displaySongList];
      } else if (!State.playQueue.value.some(item => item.path === song.path)) {
        if (State.playQueue.value.length === 0) {
          State.playQueue.value = [song];
        } else {
          State.playQueue.value.push(song);
        }
      }
    }

    State.isPlaying.value = true;
    State.isSongLoaded.value = false;
    stopPlaybackRuntime();
    reanchorPlaybackClock(0);
    accumulatedTime = 0;
    sessionStartTime = null;

    addToHistory(song);

    try {
      const cover = await invoke<string>('get_song_cover', { path: song.path }).catch(() => '');
      if (requestId !== playRequestId || State.currentSong.value?.path !== song.path) return;

      State.currentCover.value = cover;
      await invoke('play_audio', {
        path: song.path,
        title: song.name,
        artist: song.artist || 'Unknown Artist',
        album: song.album || 'Unknown Album',
        cover,
        duration: Math.floor(song.duration),
      });
      if (requestId !== playRequestId || State.currentSong.value?.path !== song.path) return;

      State.isSongLoaded.value = true;
      sessionStartTime = Date.now();
      loadLyrics();
      startPlaybackRuntime();
    } catch {
      if (requestId !== playRequestId || State.currentSong.value?.path !== song.path) return;

      State.isPlaying.value = false;
      State.isSongLoaded.value = false;
      sessionStartTime = null;
      stopPlaybackRuntime();
    }
  };

  const pauseSong = async () => {
    if (State.isPlaying.value && sessionStartTime) {
      accumulatedTime += (Date.now() - sessionStartTime) / 1000;
      sessionStartTime = null;
    }

    State.isPlaying.value = false;
    await invoke('pause_audio');
    stopPlaybackRuntime();
  };

  const togglePlay = async () => {
    if (!State.currentSong.value) return;

    if (State.isPlaying.value) {
      if (sessionStartTime) {
        accumulatedTime += (Date.now() - sessionStartTime) / 1000;
        sessionStartTime = null;
      }

      await invoke('pause_audio');
      State.isPlaying.value = false;
      stopPlaybackRuntime();
      return;
    }

    if (!State.isSongLoaded.value) {
      await playSong(State.currentSong.value);
    } else {
      await invoke('resume_audio');
      sessionStartTime = Date.now();
    }

    State.isPlaying.value = true;
    startPlaybackRuntime();
  };

  const seekTo = async (newTime: number) => {
    if (!State.currentSong.value) return;

    if (State.isPlaying.value && sessionStartTime) {
      accumulatedTime += (Date.now() - sessionStartTime) / 1000;
      sessionStartTime = Date.now();
    }

    isSeeking = true;
    stopPlaybackRuntime();
    const targetTime = Math.max(0, Math.min(newTime, State.currentSong.value.duration));
    const requestId = ++latestSeekRequestId;
    reanchorPlaybackClock(targetTime);

    try {
      await invoke('seek_audio', {
        time: targetTime,
        isPlaying: State.isPlaying.value,
        requestId,
      });
      reanchorPlaybackClock(targetTime);
      if (State.isPlaying.value) {
        startPlaybackRuntime();
      }
    } catch (error) {
      isSeeking = false;
      if (State.isPlaying.value) {
        startPlaybackRuntime();
      }
      throw error;
    }
  };

  const playAt = async (time: number) => {
    await seekTo(time);
    if (!State.isPlaying.value) {
      setTimeout(async () => {
        if (!State.isPlaying.value) {
          await togglePlay();
        }
      }, 150);
    }
  };

  const handleSeek = async (event: MouseEvent) => {
    if (!State.currentSong.value) return;

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    await seekTo(progress * State.currentSong.value.duration);
  };

  const stepSeek = async (step: number) => {
    if (!State.currentSong.value) return;
    await seekTo(State.currentTime.value + step);
  };

  const handleSeekCompleted = (payload: SeekCompletedPayload) => {
    if (payload.request_id !== latestSeekRequestId) return;

    isSeeking = false;
    reanchorPlaybackClock(payload.time);
  };

  const dispose = () => {
    stopPlaybackRuntime();
  };

  return {
    flushPlaySession,
    playSong,
    pauseSong,
    togglePlay,
    seekTo,
    playAt,
    handleSeek,
    stepSeek,
    handleSeekCompleted,
    stopPlaybackRuntime,
    dispose,
  };
};
