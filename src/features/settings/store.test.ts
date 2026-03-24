import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useSettingsStore } from './store';

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('patches theme settings without losing nested custom background fields', () => {
    const settingsStore = useSettingsStore();

    settingsStore.patchTheme({
      mode: 'custom',
      customBackground: {
        imagePath: '/covers/demo.jpg',
        blur: 32,
      },
    });

    expect(settingsStore.theme.mode).toBe('custom');
    expect(settingsStore.theme.customBackground.imagePath).toBe('/covers/demo.jpg');
    expect(settingsStore.theme.customBackground.blur).toBe(32);
    expect(settingsStore.theme.customBackground.maskColor).toBe('#000000');
  });

  it('replaces theme through the settings domain instead of mutating ui state', () => {
    const settingsStore = useSettingsStore();

    settingsStore.replaceTheme({
      mode: 'dark',
      dynamicBgType: 'blur',
      windowMaterial: 'mica',
      customBgPath: '',
      opacity: 0.75,
      blur: 18,
      customBackground: {
        imagePath: '/covers/fallback.jpg',
        blur: 24,
        opacity: 0.85,
        maskColor: '#101010',
        maskAlpha: 0.45,
        scale: 1.08,
        foregroundStyle: 'light',
      },
    });

    expect(settingsStore.settings.theme.windowMaterial).toBe('mica');
    expect(settingsStore.settings.theme.customBackground.foregroundStyle).toBe('light');
  });
});
