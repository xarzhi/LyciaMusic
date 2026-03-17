import { watch } from 'vue';
import { AUDIO_DELAY, settings, defaultAppSettings } from './playerState';

const LEGACY_SETTINGS_KEY = 'app_settings';
const PLAYER_SETTINGS_KEY = 'player_settings';

const migrateLegacySettings = () => {
  const legacyRaw = localStorage.getItem(LEGACY_SETTINGS_KEY);
  if (!legacyRaw) return;

  try {
    const parsed = JSON.parse(legacyRaw) as Partial<typeof defaultAppSettings>;
    settings.value = {
      ...settings.value,
      ...parsed,
      theme: {
        ...settings.value.theme,
        ...(parsed.theme ?? {}),
        customBackground: {
          ...settings.value.theme.customBackground,
          ...(parsed.theme?.customBackground ?? {}),
        },
      },
      sidebar: {
        ...settings.value.sidebar,
        ...(parsed.sidebar ?? {}),
      },
    };

    if (!localStorage.getItem(PLAYER_SETTINGS_KEY)) {
      localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(settings.value));
    }
  } catch (error) {
    console.error('Failed to parse legacy app settings', error);
  }
};

migrateLegacySettings();
AUDIO_DELAY.value = settings.value.lyricsSyncOffset;

watch(
  settings,
  nextSettings => {
    AUDIO_DELAY.value = nextSettings.lyricsSyncOffset;
  },
  { deep: true }
);

export function useSettings() {
  return {
    settings,
  };
}
