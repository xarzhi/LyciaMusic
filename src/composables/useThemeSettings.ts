import { computed } from 'vue';
import { storeToRefs } from 'pinia';

import { useSettingsStore, type ThemeSettingsPatch } from '../stores/settings';
import type { ThemeSettings } from '../types';
import type { WindowMaterialMode } from './windowMaterial';

const resolveThemeDarkMode = (theme: ThemeSettings) => {
  if (theme.mode !== 'custom') {
    return theme.mode === 'dark';
  }

  const foregroundStyle = theme.customBackground.foregroundStyle || 'auto';
  if (foregroundStyle === 'light') {
    return true;
  }
  if (foregroundStyle === 'dark') {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export function useThemeSettings() {
  const settingsStore = useSettingsStore();
  const { settings, theme } = storeToRefs(settingsStore);

  const isCustomTheme = computed(() => theme.value.mode === 'custom');
  const isDarkTheme = computed(() => resolveThemeDarkMode(theme.value));

  const replaceTheme = (nextTheme: ThemeSettings) => {
    settingsStore.replaceTheme(nextTheme);
  };

  const patchTheme = (partialTheme: ThemeSettingsPatch) => {
    settingsStore.patchTheme(partialTheme);
  };

  const setThemeMode = (mode: ThemeSettings['mode']) => {
    if (mode === 'custom') {
      patchTheme({
        mode,
        dynamicBgType: 'none',
        windowMaterial: 'none',
      });
      return;
    }

    patchTheme({ mode });
  };

  const setDynamicBackgroundType = (dynamicBgType: ThemeSettings['dynamicBgType']) => {
    patchTheme({ dynamicBgType });
  };

  const setWindowMaterial = (windowMaterial: WindowMaterialMode) => {
    patchTheme({
      windowMaterial,
      ...(windowMaterial !== 'none' ? { dynamicBgType: 'none' as const } : {}),
    });
  };

  const updateCustomBackground = (customBackground: ThemeSettingsPatch['customBackground']) => {
    patchTheme({ customBackground });
  };

  return {
    settings,
    theme,
    isCustomTheme,
    isDarkTheme,
    replaceTheme,
    patchTheme,
    setThemeMode,
    setDynamicBackgroundType,
    setWindowMaterial,
    updateCustomBackground,
  };
}
