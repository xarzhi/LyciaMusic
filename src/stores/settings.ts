import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import type { AppSettings, SidebarSettings, ThemeSettings } from '../types';

export type ThemeSettingsPatch = Partial<Omit<ThemeSettings, 'customBackground'>> & {
  customBackground?: Partial<ThemeSettings['customBackground']>;
};

export type SidebarSettingsPatch = Partial<SidebarSettings>;

export interface AppSettingsPatch extends Partial<Omit<AppSettings, 'theme' | 'sidebar'>> {
  theme?: ThemeSettingsPatch;
  sidebar?: SidebarSettingsPatch;
}

export const defaultAppSettings: AppSettings = {
  minimizeToTray: false,
  closeToTray: false,
  showQualityBadges: true,
  linkFoldersToLibrary: false,
  lyricsSyncOffset: 0,
  organizeRoot: 'D:\\Music',
  enableAutoOrganize: true,
  organizeRule: '{Artist}/{Album}/{Title}',
  theme: {
    mode: 'light',
    dynamicBgType: 'flow',
    windowMaterial: 'none',
    customBgPath: '',
    opacity: 0.8,
    blur: 20,
    customBackground: {
      imagePath: '',
      blur: 20,
      opacity: 1,
      maskColor: '#000000',
      maskAlpha: 0.4,
      scale: 1,
      foregroundStyle: 'auto',
    },
  },
  sidebar: {
    showLocalMusic: true,
    showArtists: true,
    showAlbums: true,
    showFavorites: true,
    showRecent: true,
    showFolders: true,
    showStatistics: true,
  },
};

export const createDefaultAppSettings = (): AppSettings => ({
  ...defaultAppSettings,
  theme: {
    ...defaultAppSettings.theme,
    customBackground: {
      ...defaultAppSettings.theme.customBackground,
    },
  },
  sidebar: {
    ...defaultAppSettings.sidebar,
  },
});

export const mergeAppSettings = (
  base: AppSettings,
  patch: AppSettingsPatch,
): AppSettings => ({
  ...base,
  ...patch,
  theme: {
    ...base.theme,
    ...(patch.theme ?? {}),
    customBackground: {
      ...base.theme.customBackground,
      ...(patch.theme?.customBackground ?? {}),
    },
  },
  sidebar: {
    ...base.sidebar,
    ...(patch.sidebar ?? {}),
  },
});

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(createDefaultAppSettings());
  const audioDelay = computed(() => settings.value.lyricsSyncOffset);

  const replaceSettings = (nextSettings: AppSettings) => {
    settings.value = mergeAppSettings(createDefaultAppSettings(), nextSettings);
  };

  const patchSettings = (partialSettings: AppSettingsPatch) => {
    settings.value = mergeAppSettings(settings.value, partialSettings);
  };

  const resetSettings = () => {
    settings.value = createDefaultAppSettings();
  };

  return {
    settings,
    audioDelay,
    replaceSettings,
    patchSettings,
    resetSettings,
  };
});
