import { tauriInvoke } from './invoke';

export interface WindowMaterialCapabilities {
  isWindows: boolean;
  supportsAcrylic: boolean;
  supportsMica: boolean;
  systemTransparencyEnabled: boolean | null;
  windowsBuildNumber: number | null;
}

export const windowApi = {
  setMiniBoundaryEnabled: (enabled: boolean) =>
    tauriInvoke<void>('set_mini_boundary_enabled', { enabled }),
  setDarkModeForWindow: (dark: boolean) =>
    tauriInvoke<void>('set_dark_mode_for_window', { dark }),
  getWindowMaterialCapabilities: () =>
    tauriInvoke<WindowMaterialCapabilities>('get_window_material_capabilities'),
};
