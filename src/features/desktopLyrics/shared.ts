import type {
  DesktopLyricsSettings,
  LyricsSettings,
  LyricsStatus,
  LyricLine,
} from '../../composables/lyrics';
import type { Song } from '../../types';

export const DESKTOP_LYRICS_WINDOW_LABEL = 'desktop-lyrics';
export const DESKTOP_LYRICS_STATE_EVENT = 'desktop-lyrics:state';
export const DESKTOP_LYRICS_PLAYBACK_EVENT = 'desktop-lyrics:playback';
export const DESKTOP_LYRICS_REQUEST_STATE_EVENT = 'desktop-lyrics:request-state';
export const DESKTOP_LYRICS_ACTION_EVENT = 'desktop-lyrics:action';
export const DESKTOP_LYRICS_VISIBILITY_EVENT = 'desktop-lyrics:visibility';
export const DESKTOP_LYRICS_BOUNDS_EVENT = 'desktop-lyrics:bounds';
export const DESKTOP_LYRICS_BOUNDS_KEY = 'desktop_lyrics_window_bounds';

export const DESKTOP_LYRICS_WINDOW_DEFAULT_WIDTH = 900;
export const DESKTOP_LYRICS_WINDOW_DEFAULT_HEIGHT = 220;
export const DESKTOP_LYRICS_WINDOW_MIN_WIDTH = 520;
export const DESKTOP_LYRICS_WINDOW_MIN_HEIGHT = 120;

type LyricsContentSettingsFields =
  | 'showTranslation'
  | 'showRomaji';

export interface DesktopLyricsWindowSettings
  extends Pick<LyricsSettings, LyricsContentSettingsFields>, DesktopLyricsSettings {}

export interface DesktopLyricsSongSnapshot {
  path: string;
  title: string;
  artist: string;
}

export interface DesktopLyricsWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesktopLyricsStatePayload {
  song: DesktopLyricsSongSnapshot | null;
  parsedLyrics: LyricLine[];
  lyricsStatus: LyricsStatus;
  fallbackText: string;
  playbackTime: number;
  syncedAt: number;
  isPlaying: boolean;
  audioDelay: number;
  settings: DesktopLyricsWindowSettings;
  themeColors: string[];
}

export interface DesktopLyricsPlaybackPayload {
  playbackTime: number;
  syncedAt: number;
  isPlaying: boolean;
  audioDelay: number;
}

export type DesktopLyricsSettingsPatch = Partial<DesktopLyricsWindowSettings>;

export type DesktopLyricsAction =
  | { type: 'toggle-play' }
  | { type: 'prev-song' }
  | { type: 'next-song' }
  | { type: 'adjust-offset'; delta: number }
  | { type: 'close' }
  | { type: 'update-settings'; patch: DesktopLyricsSettingsPatch };

export function createDesktopLyricsSongSnapshot(song: Song | null): DesktopLyricsSongSnapshot | null {
  if (!song) return null;

  return {
    path: song.path,
    title: song.title || song.name,
    artist: song.artist || 'Unknown Artist',
  };
}
