import { open } from '@tauri-apps/plugin-dialog';
import { onMounted, ref, watch } from 'vue';

import { normalizeForegroundStyle } from '../features/settings/store';
import { useThemeSettings } from './useThemeSettings';
import type { ThemeSettings } from '../types';

const cloneTheme = (value: ThemeSettings): ThemeSettings => JSON.parse(JSON.stringify(value)) as ThemeSettings;

export function useCustomThemeModal() {
  const { theme, patchTheme, replaceTheme, updateCustomBackground } = useThemeSettings();
  const originalTheme = ref<ThemeSettings | null>(null);
  const preview = ref({
    ...theme.value.customBackground,
    foregroundStyle: normalizeForegroundStyle(theme.value.customBackground.foregroundStyle),
  });

  onMounted(() => {
    originalTheme.value = cloneTheme(theme.value);
  });

  watch(preview, (nextPreview) => {
    updateCustomBackground({ ...nextPreview });

    if (nextPreview.imagePath) {
      patchTheme({
        mode: 'custom',
        dynamicBgType: 'none',
        windowMaterial: 'none',
      });
    }
  }, { deep: true });

  const handleSelectImage = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });

      if (selected && typeof selected === 'string') {
        preview.value.imagePath = selected;
      }
    } catch {
      // Ignore dialog cancellation.
    }
  };

  const handleCancel = () => {
    if (originalTheme.value) {
      replaceTheme(originalTheme.value);
    }
  };

  return {
    preview,
    handleSelectImage,
    handleCancel,
  };
}
