import { getCurrentWindow } from '@tauri-apps/api/window';
import { computed, nextTick, watch, type Ref } from 'vue';
import type { AppSettings } from '../types';
import { useWindowMaterial } from './windowMaterial';

interface UseAppThemeSyncOptions {
  settings: Ref<AppSettings>;
}

export function useAppThemeSync({ settings }: UseAppThemeSyncOptions) {
  const { activeWindowMaterial, applyWindowMaterial, loadWindowMaterialCapabilities } = useWindowMaterial();

  const hasWindowMaterial = computed(() => activeWindowMaterial.value !== 'none');
  const isMicaWindowMaterial = computed(() => activeWindowMaterial.value === 'mica');

  const applyTheme = async () => {
    const theme = settings.value.theme;
    const isDarkSystem = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let isDarkMode = false;

    if (theme.mode === 'custom') {
      const style = theme.customBackground.foregroundStyle || 'auto';
      if (style === 'light') {
        isDarkMode = true;
      } else if (style === 'dark') {
        isDarkMode = false;
      } else {
        isDarkMode = isDarkSystem;
      }
    } else {
      isDarkMode = theme.mode === 'dark';
    }

    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      try {
        await getCurrentWindow().setTheme('dark');
      } catch (error) {
        console.warn('Failed to set window theme:', error);
      }
      return;
    }

    document.documentElement.classList.remove('dark');
    try {
      await getCurrentWindow().setTheme('light');
    } catch (error) {
      console.warn('Failed to set window theme:', error);
    }
  };

  const syncWindowMaterial = async () => {
    await nextTick();
    await applyWindowMaterial(
      settings.value.theme.windowMaterial,
      document.documentElement.classList.contains('dark'),
    );
  };

  void loadWindowMaterialCapabilities();

  watch(
    settings,
    async () => {
      await applyTheme();
      await syncWindowMaterial();
    },
    { deep: true, immediate: true },
  );

  return {
    activeWindowMaterial,
    hasWindowMaterial,
    isMicaWindowMaterial,
    syncWindowMaterial,
  };
}
