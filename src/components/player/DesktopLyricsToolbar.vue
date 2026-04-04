<script setup lang="ts">
import type { DesktopLyricsAction } from '../../features/desktopLyrics/shared';

const props = defineProps<{
  isPlaying: boolean;
}>();

const emit = defineEmits<{
  (e: 'action', action: DesktopLyricsAction): void;
}>();

function emitAction(action: DesktopLyricsAction) {
  emit('action', action);
}
</script>

<template>
  <div class="desktop-toolbar" @mousedown.stop>
    <div class="desktop-toolbar-track">
      <button class="desktop-toolbar-button" title="上一首" @click="emitAction({ type: 'prev-song' })">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7 6v12" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 7 9.5 12 17 17V7Z" />
        </svg>
      </button>

      <button
        class="desktop-toolbar-button desktop-toolbar-button--primary"
        :title="props.isPlaying ? '暂停' : '播放'"
        @click="emitAction({ type: 'toggle-play' })"
      >
        <svg v-if="props.isPlaying" xmlns="http://www.w3.org/2000/svg" class="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.5v13l10-6.5-10-6.5Z" />
        </svg>
      </button>

      <button class="desktop-toolbar-button" title="下一首" @click="emitAction({ type: 'next-song' })">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 6v12" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M7 7l7.5 5L7 17V7Z" />
        </svg>
      </button>

      <span class="desktop-toolbar-divider" aria-hidden="true"></span>

      <button class="desktop-toolbar-button" title="关闭桌面歌词" @click="emitAction({ type: 'close' })">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.desktop-toolbar {
  display: flex;
  justify-content: center;
  color: rgba(255, 255, 255, 0.92);
  pointer-events: auto;
}

.desktop-toolbar-track {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 42px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(40, 40, 43, 0.96), rgba(28, 29, 32, 0.92));
  box-shadow: 0 10px 22px rgba(6, 8, 15, 0.2);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.desktop-toolbar-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  color: rgba(240, 244, 255, 0.86);
  transition: color 160ms ease, background-color 160ms ease, transform 160ms ease;
}

.desktop-toolbar-button:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}

.desktop-toolbar-button--primary {
  width: 28px;
  height: 28px;
  color: #ffffff;
}

.desktop-toolbar-button--primary:hover {
  transform: scale(1.04);
}

.desktop-toolbar-divider {
  width: 1px;
  height: 18px;
  background: linear-gradient(180deg, transparent, rgba(123, 164, 255, 0.82), transparent);
  opacity: 0.7;
}
</style>
