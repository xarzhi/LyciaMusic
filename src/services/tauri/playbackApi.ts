import { tauriInvoke } from './invoke';

interface PlayAudioOptions {
  path: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
}

interface SeekAudioOptions {
  time: number;
  isPlaying: boolean;
  requestId: number;
}

export const playbackApi = {
  setVolume: (volume: number) => tauriInvoke<void>('set_volume', { volume }),
  getPlaybackProgress: () => tauriInvoke<number>('get_playback_progress'),
  recordPlay: (songPath: string, duration: number) =>
    tauriInvoke<void>('record_play', { songPath, duration }),
  getSongCover: (path: string) => tauriInvoke<string>('get_song_cover', { path }),
  playAudio: (options: PlayAudioOptions) => tauriInvoke<void>('play_audio', options),
  pauseAudio: () => tauriInvoke<void>('pause_audio'),
  resumeAudio: () => tauriInvoke<void>('resume_audio'),
  seekAudio: (options: SeekAudioOptions) => tauriInvoke<void>('seek_audio', options),
};
