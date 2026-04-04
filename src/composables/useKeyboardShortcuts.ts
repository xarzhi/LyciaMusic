import { onMounted, onUnmounted } from 'vue';

import { useLibraryCollections } from '../features/collections/useLibraryCollections';
import { usePlaybackController } from '../features/playback/usePlaybackController';
import { useSettings } from '../features/settings/useSettings';
import {
  matchesShortcutEvent,
  shortcutActionOrder,
} from '../features/settings/shortcuts';
import type { ShortcutActionId } from '../types';
import { useLyrics } from './lyrics';
import { useUiStore } from '../shared/stores/ui';

const INTERACTIVE_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="textbox"]',
  '[data-shortcut-capture="true"]',
].join(', ');

const isTypingTarget = (target: EventTarget | null) => (
  target instanceof HTMLElement && !!target.closest(INTERACTIVE_SELECTOR)
);

export function useKeyboardShortcuts() {
  const { settings } = useSettings();
  const { currentSong, volume, togglePlay, nextSong, prevSong, handleVolume } = usePlaybackController();
  const { toggleFavorite } = useLibraryCollections();
  const { showDesktopLyrics, lyricsSettings } = useLyrics();
  const uiStore = useUiStore();

  const updateVolume = async (delta: number) => {
    const nextVolume = Math.max(0, Math.min(100, volume.value + delta));
    if (nextVolume === volume.value) {
      return;
    }

    await handleVolume({ target: { value: nextVolume.toString() } } as unknown as Event);
  };

  const actionHandlers: Record<ShortcutActionId, () => void | Promise<void>> = {
    togglePlay: () => togglePlay(),
    prevSong: () => prevSong(),
    nextSong: () => nextSong(),
    volumeUp: () => updateVolume(5),
    volumeDown: () => updateVolume(-5),
    toggleMiniMode: () => {
      uiStore.isMiniMode = !uiStore.isMiniMode;
    },
    toggleFavorite: () => {
      if (currentSong.value) {
        toggleFavorite(currentSong.value);
      }
    },
    toggleDesktopLyrics: () => {
      showDesktopLyrics.value = !showDesktopLyrics.value;
    },
    toggleLyricTranslation: () => {
      lyricsSettings.showTranslation = !lyricsSettings.showTranslation;
    },
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (!settings.value.shortcuts.enabled || event.defaultPrevented || event.repeat) {
      return;
    }

    if (isTypingTarget(event.target)) {
      return;
    }

    for (const actionId of shortcutActionOrder) {
      if (!matchesShortcutEvent(settings.value.shortcuts.local[actionId], event)) {
        continue;
      }

      event.preventDefault();
      event.stopPropagation();
      void actionHandlers[actionId]();
      return;
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
}
