import { storeToRefs } from 'pinia';

import { playerStorage, playerStorageKeys } from '../services/storage/playerStorage';
import {
  defaultAppSettings,
  mergeAppSettings,
  useSettingsStore,
} from '../stores/settings';

let didMigrateLegacySettings = false;

const migrateLegacySettings = (mergeSettings: (partialSettings: Partial<typeof defaultAppSettings>) => void) => {
  if (didMigrateLegacySettings) {
    return;
  }

  didMigrateLegacySettings = true;
  const legacyRaw = playerStorage.getString(playerStorageKeys.legacyAppSettings);
  if (!legacyRaw) return;

  try {
    const parsed = JSON.parse(legacyRaw) as Partial<typeof defaultAppSettings>;
    mergeSettings(parsed);

    if (!playerStorage.getString(playerStorageKeys.settings)) {
      playerStorage.writeSettings(mergeAppSettings(defaultAppSettings, parsed));
    }
  } catch (error) {
    console.error('Failed to parse legacy app settings', error);
  }
};

export function useSettings() {
  const settingsStore = useSettingsStore();
  const { settings, audioDelay, theme, sidebar } = storeToRefs(settingsStore);

  migrateLegacySettings(settingsStore.patchSettings);

  return {
    settings,
    audioDelay,
    theme,
    sidebar,
    patchSettings: settingsStore.patchSettings,
    patchTheme: settingsStore.patchTheme,
    replaceTheme: settingsStore.replaceTheme,
    patchSidebar: settingsStore.patchSidebar,
  };
}
