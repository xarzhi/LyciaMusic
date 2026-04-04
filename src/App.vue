<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';

import MainShell from './components/layout/MainShell.vue';
import DesktopLyricsWindow from './components/player/DesktopLyricsWindow.vue';
import { DESKTOP_LYRICS_WINDOW_LABEL } from './features/desktopLyrics/shared';

const currentWindowLabel = (() => {
  try {
    return getCurrentWindow().label;
  } catch {
    return 'main';
  }
})();

const isDesktopLyricsWindow = currentWindowLabel === DESKTOP_LYRICS_WINDOW_LABEL;
</script>

<template>
  <DesktopLyricsWindow v-if="isDesktopLyricsWindow" />
  <MainShell v-else />
</template>
