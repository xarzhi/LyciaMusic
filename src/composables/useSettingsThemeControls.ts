import { computed, onMounted, ref } from 'vue';

import { useThemeSettings } from './useThemeSettings';
import { useWindowMaterial, type WindowMaterialMode } from './windowMaterial';

export function useSettingsThemeControls() {
  const { theme, setThemeMode, setDynamicBackgroundType, setWindowMaterial } = useThemeSettings();
  const { capabilities, loadWindowMaterialCapabilities } = useWindowMaterial();
  const showCustomModal = ref(false);

  const colorScheme = computed({
    get: () => theme.value.mode,
    set: (value: 'light' | 'dark' | 'custom') => {
      setThemeMode(value);
    },
  });

  const materialMode = computed({
    get: () => theme.value.windowMaterial,
    set: (value: WindowMaterialMode) => {
      setWindowMaterial(value);
    },
  });

  const isWindows11 = computed(
    () => capabilities.value.isWindows && (capabilities.value.windowsBuildNumber ?? 0) >= 22000,
  );
  const hasWindowMaterialSelected = computed(() => materialMode.value !== 'none');
  const isWindowMaterialDisabled = computed(() => colorScheme.value === 'custom');
  const isDynamicBgDisabled = computed(
    () => colorScheme.value === 'custom' || hasWindowMaterialSelected.value,
  );

  const setColorScheme = (mode: 'light' | 'dark' | 'custom') => {
    colorScheme.value = mode;
  };

  const setDynamicType = (type: 'none' | 'flow' | 'blur') => {
    if (isDynamicBgDisabled.value) {
      return;
    }

    setDynamicBackgroundType(type);
  };

  const toggleWindowMaterial = (mode: Exclude<WindowMaterialMode, 'none'>) => {
    if (!isWindows11.value || isWindowMaterialDisabled.value) {
      return;
    }

    if (materialMode.value === mode) {
      materialMode.value = 'none';
      return;
    }

    materialMode.value = mode;
  };

  const openCustomModal = () => {
    showCustomModal.value = true;
  };

  onMounted(() => {
    void loadWindowMaterialCapabilities();
  });

  return {
    theme,
    showCustomModal,
    colorScheme,
    materialMode,
    isWindows11,
    hasWindowMaterialSelected,
    isWindowMaterialDisabled,
    isDynamicBgDisabled,
    setColorScheme,
    setDynamicType,
    toggleWindowMaterial,
    openCustomModal,
  };
}
