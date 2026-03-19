import { watch } from 'vue';
import { AUDIO_DELAY, settings, defaultAppSettings } from './playerState';
import { playerStorage, playerStorageKeys } from '../services/storage/playerStorage';

const migrateLegacySettings = () => {
  const legacyRaw = playerStorage.getString(playerStorageKeys.legacyAppSettings);
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

    if (!playerStorage.getString(playerStorageKeys.settings)) {
      playerStorage.writeSettings(settings.value);
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
