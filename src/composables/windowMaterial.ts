import { invoke } from '@tauri-apps/api/core';
import { Effect, getCurrentWindow, type Color } from '@tauri-apps/api/window';
import { ref } from 'vue';

export type WindowMaterialMode = 'none' | 'mica' | 'acrylic';
export type ResolvedWindowMaterial = 'none' | 'mica' | 'acrylic';

export interface WindowMaterialCapabilities {
  isWindows: boolean;
  supportsAcrylic: boolean;
  supportsMica: boolean;
  systemTransparencyEnabled: boolean | null;
  windowsBuildNumber: number | null;
}

const defaultCapabilities = (): WindowMaterialCapabilities => ({
  isWindows: false,
  supportsAcrylic: false,
  supportsMica: false,
  systemTransparencyEnabled: null,
  windowsBuildNumber: null,
});

const capabilities = ref<WindowMaterialCapabilities>(defaultCapabilities());
const activeWindowMaterial = ref<ResolvedWindowMaterial>('none');
const isWindowMaterialReady = ref(false);

let loadPromise: Promise<WindowMaterialCapabilities> | null = null;

const MICA_DARK_EFFECT = 'micaDark' as Effect;
const MICA_LIGHT_EFFECT = 'micaLight' as Effect;

function normalizeCapabilities(
  value: Partial<WindowMaterialCapabilities> | null | undefined,
): WindowMaterialCapabilities {
  return {
    ...defaultCapabilities(),
    ...value,
  };
}

export function resolveWindowMaterial(
  mode: WindowMaterialMode,
  value: WindowMaterialCapabilities = capabilities.value,
): ResolvedWindowMaterial {
  const isWindows11 = value.isWindows && value.windowsBuildNumber !== null && value.windowsBuildNumber >= 22000;

  if (!isWindows11 || value.systemTransparencyEnabled === false) {
    return 'none';
  }

  if (mode === 'mica') {
    return value.supportsMica ? 'mica' : 'none';
  }

  if (mode === 'acrylic') {
    return value.supportsAcrylic ? 'acrylic' : 'none';
  }

  return 'none';
}

function getAcrylicTint(isDark: boolean): Color {
  return isDark ? [18, 18, 18, 140] : [248, 248, 248, 125];
}

function getBaseWindowColor(isDark: boolean): Color {
  return isDark ? [18, 18, 18, 255] : [250, 250, 250, 255];
}

function getTransparentWindowColor(): Color {
  return [0, 0, 0, 0];
}

async function trySetWindowBackgroundColor(color: Color): Promise<void> {
  const appWindow = getCurrentWindow();

  try {
    await appWindow.setBackgroundColor(color);
  } catch (error) {
    console.warn('Failed to set window background color:', error);
  }
}

export async function loadWindowMaterialCapabilities(force = false): Promise<WindowMaterialCapabilities> {
  if (isWindowMaterialReady.value && !force) {
    return capabilities.value;
  }

  if (loadPromise && !force) {
    return loadPromise;
  }

  loadPromise = invoke<WindowMaterialCapabilities>('get_window_material_capabilities')
    .then((result) => {
      const normalized = normalizeCapabilities(result);
      capabilities.value = normalized;
      isWindowMaterialReady.value = true;
      return normalized;
    })
    .catch((error) => {
      console.error('Failed to query window material capabilities:', error);
      const fallback = defaultCapabilities();
      capabilities.value = fallback;
      isWindowMaterialReady.value = true;
      return fallback;
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export async function applyWindowMaterial(mode: WindowMaterialMode, isDark: boolean): Promise<ResolvedWindowMaterial> {
  const value = await loadWindowMaterialCapabilities();
  const resolved = resolveWindowMaterial(mode, value);
  const appWindow = getCurrentWindow();

  try {
    if (resolved === 'mica') {
      await trySetWindowBackgroundColor(getTransparentWindowColor());
      await appWindow.setEffects({
        effects: [isDark ? MICA_DARK_EFFECT : MICA_LIGHT_EFFECT],
      });
    } else if (resolved === 'acrylic') {
      await trySetWindowBackgroundColor(getTransparentWindowColor());
      await invoke('set_dark_mode_for_window', { dark: isDark });
      await appWindow.setEffects({
        effects: [Effect.Acrylic],
        color: getAcrylicTint(isDark),
      });
    } else {
      await appWindow.clearEffects();
      await trySetWindowBackgroundColor(getBaseWindowColor(isDark));
    }

    activeWindowMaterial.value = resolved;
  } catch (error) {
    console.error('Failed to apply window material:', error);
    activeWindowMaterial.value = 'none';
  }

  return activeWindowMaterial.value;
}

export function useWindowMaterial() {
  return {
    capabilities,
    activeWindowMaterial,
    isWindowMaterialReady,
    loadWindowMaterialCapabilities,
    applyWindowMaterial,
  };
}
