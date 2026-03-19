import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { watch, type Ref } from 'vue';

interface UseMiniModeWindowOptions {
  isMiniMode: Ref<boolean>;
  showMiniPlaylist: Ref<boolean>;
  showVolumePopover: Ref<boolean>;
  showPlaylist: Ref<boolean>;
  closeMiniPlaylist: () => void;
  syncWindowMaterial: () => Promise<void>;
}

const MINI_WIDTH = 300;
const MINI_BASE_HEIGHT = 75;
const MINI_EXPANDED_HEIGHT = 420;

export function useMiniModeWindow({
  isMiniMode,
  showMiniPlaylist,
  showVolumePopover,
  showPlaylist,
  closeMiniPlaylist,
  syncWindowMaterial,
}: UseMiniModeWindowOptions) {
  const appWindow = getCurrentWindow();
  let normalSize = { width: 960, height: 600 };
  let normalPosition: { x: number; y: number } | null = null;
  let miniPosition: { x: number; y: number } | null = null;
  let wasMaximized = false;
  let isResizing = false;

  const getWindowLogicalPosition = async () => {
    const factor = await appWindow.scaleFactor();
    const physicalPosition = await appWindow.outerPosition();
    const logicalPosition = physicalPosition.toLogical(factor);
    return { x: logicalPosition.x, y: logicalPosition.y };
  };

  const setWindowLogicalPosition = async (position: { x: number; y: number }) => {
    await appWindow.setPosition(new LogicalPosition(position.x, position.y));
  };

  const getCurrentMonitorLogicalBounds = async () => {
    const monitor = await currentMonitor();
    if (!monitor) return null;

    const scaleFactor = monitor.scaleFactor || await appWindow.scaleFactor();
    const monitorPosition = monitor.position.toLogical(scaleFactor);
    const monitorSize = monitor.size.toLogical(scaleFactor);

    return {
      left: monitorPosition.x,
      top: monitorPosition.y,
      right: monitorPosition.x + monitorSize.width,
      bottom: monitorPosition.y + monitorSize.height,
      width: monitorSize.width,
      height: monitorSize.height,
    };
  };

  const applyMiniWindowHeight = async (height: number) => {
    const monitorBounds = await getCurrentMonitorLogicalBounds();
    const width = monitorBounds ? Math.min(MINI_WIDTH, monitorBounds.width) : MINI_WIDTH;
    const clampedHeight = monitorBounds ? Math.min(height, monitorBounds.height) : height;

    await appWindow.setMinSize(new LogicalSize(width, clampedHeight));
    await appWindow.setMaxSize(new LogicalSize(width, clampedHeight));
    await appWindow.setSize(new LogicalSize(width, clampedHeight));
  };

  watch(
    [isMiniMode, showMiniPlaylist, showVolumePopover],
    async ([miniMode, miniQueueVisible, volumeVisible], [prevMiniMode]) => {
      if (isResizing) return;
      if (!miniMode && !prevMiniMode) return;

      isResizing = true;
      try {
        if (miniMode) {
          if (!prevMiniMode) {
            await appWindow.hide();

            wasMaximized = await appWindow.isMaximized();
            if (wasMaximized) await appWindow.unmaximize();

            const factor = await appWindow.scaleFactor();
            const size = await appWindow.innerSize();
            if (size.width / factor > 600) {
              normalSize = { width: size.width / factor, height: size.height / factor };
            }
            normalPosition = await getWindowLogicalPosition();

            showPlaylist.value = false;
            await appWindow.setResizable(false);
            await appWindow.setAlwaysOnTop(true);
            if (appWindow.setShadow) await appWindow.setShadow(false);

            document.body.classList.add('mini-mode-active');
            document.documentElement.classList.add('mini-mode-active');
            const appEl = document.getElementById('app');
            if (appEl) appEl.classList.add('mini-mode-active');

            await invoke('set_mini_boundary_enabled', { enabled: true });
          }

          let height = MINI_BASE_HEIGHT;
          if (miniQueueVisible) {
            height = MINI_EXPANDED_HEIGHT;
          } else if (volumeVisible) {
            height = MINI_BASE_HEIGHT + 60;
          }

          await applyMiniWindowHeight(height);
          if (!prevMiniMode && miniPosition) {
            await setWindowLogicalPosition(miniPosition);
          }

          if (!prevMiniMode) {
            await appWindow.show();
          }
          return;
        }

        await appWindow.hide();

        miniPosition = await getWindowLogicalPosition();
        closeMiniPlaylist();
        await invoke('set_mini_boundary_enabled', { enabled: false });
        await appWindow.setResizable(true);
        await appWindow.setMaxSize(null);
        await appWindow.setMinSize(new LogicalSize(960, 600));
        await appWindow.setSize(new LogicalSize(normalSize.width, normalSize.height));
        if (normalPosition) {
          await setWindowLogicalPosition(normalPosition);
        }
        await appWindow.setAlwaysOnTop(false);
        if (appWindow.setShadow) await appWindow.setShadow(true);

        document.body.classList.remove('mini-mode-active');
        document.documentElement.classList.remove('mini-mode-active');
        const appEl = document.getElementById('app');
        if (appEl) appEl.classList.remove('mini-mode-active');

        if (wasMaximized) await appWindow.maximize();

        await appWindow.show();
        await syncWindowMaterial();
      } catch (error) {
        console.error('Mini Mode Resize Error:', error);
      } finally {
        isResizing = false;
      }
    },
  );
}
