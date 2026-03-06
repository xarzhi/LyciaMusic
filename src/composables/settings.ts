import { ref, watch } from 'vue';
import { AUDIO_DELAY } from './playerState';

const SETTINGS_KEY = 'app_settings';
const DEFAULT_LYRICS_SYNC_OFFSET = 0;

interface AppSettings {
  minimizeToTray: boolean;
  closeToTray: boolean;
  showQualityBadges: boolean; // v1.1.1: Audio quality badges
  linkFoldersToLibrary: boolean;
  lyricsSyncOffset: number;
  // Add other settings here in the future
}

const defaultSettings: AppSettings = {
  minimizeToTray: false,
  closeToTray: false,
  showQualityBadges: true,
  linkFoldersToLibrary: false,
  lyricsSyncOffset: DEFAULT_LYRICS_SYNC_OFFSET,
};

const settings = ref<AppSettings>({ ...defaultSettings });

// Load from localStorage
const stored = localStorage.getItem(SETTINGS_KEY);
if (stored) {
  try {
    settings.value = { ...defaultSettings, ...JSON.parse(stored) };
  } catch (e) {
    console.error('Failed to parse settings', e);
  }
}

AUDIO_DELAY.value = settings.value.lyricsSyncOffset;

// Watch for changes and save
watch(
  settings,
  (newSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    AUDIO_DELAY.value = newSettings.lyricsSyncOffset;
  },
  { deep: true }
);

export function useSettings() {
  return {
    settings,
  };
}
