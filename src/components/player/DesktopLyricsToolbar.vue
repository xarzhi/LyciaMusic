<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import type { LyricsFontOption } from '../../composables/lyrics';
import type {
  DesktopLyricsAction,
  DesktopLyricsSettingsPatch,
  DesktopLyricsWindowSettings,
} from '../../features/desktopLyrics/shared';
import DesktopLyricsSettingsMenu from './DesktopLyricsSettingsMenu.vue';

const props = defineProps<{
  isPlaying: boolean;
  offsetLabel: string;
  settings: DesktopLyricsWindowSettings;
  availableFontOptions: LyricsFontOption[];
  selectedFontLabel: string;
  fontScaleLabel: string;
  lineGapLabel: string;
  offsetXLabel: string;
  offsetYLabel: string;
  alignmentOptions: Array<{ value: DesktopLyricsWindowSettings['playerAlignment']; label: string }>;
}>();

const emit = defineEmits<{
  (e: 'action', action: DesktopLyricsAction): void;
  (e: 'patch-settings', patch: DesktopLyricsSettingsPatch): void;
  (e: 'menu-visibility-change', visible: boolean): void;
}>();

const showSettings = ref(false);
const settingsTriggerRef = ref<HTMLElement | null>(null);
const settingsMenuRef = ref<{ $el?: HTMLElement } | null>(null);
const settingsMenuStyle = ref<Record<string, string>>({});

let closeTimer: ReturnType<typeof setTimeout> | null = null;

function emitAction(action: DesktopLyricsAction) {
  emit('action', action);
}

function patchSettings(patch: DesktopLyricsSettingsPatch) {
  emit('patch-settings', patch);
}

function openSettings() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  showSettings.value = true;
  void nextTick(updateSettingsMenuPosition);
}

function closeSettings() {
  if (closeTimer) {
    clearTimeout(closeTimer);
  }

  closeTimer = setTimeout(() => {
    showSettings.value = false;
  }, 220);
}

function keepSettingsOpen() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function updateSettingsMenuPosition() {
  const trigger = settingsTriggerRef.value;
  if (!trigger) return;

  const rect = trigger.getBoundingClientRect();
  const menuWidth = 320;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left = rect.left + rect.width / 2 - menuWidth / 2;
  left = Math.max(12, Math.min(left, viewportWidth - menuWidth - 12));

  const top = rect.bottom + 12;
  const maxHeight = Math.max(180, viewportHeight - top - 12);

  settingsMenuStyle.value = {
    position: 'fixed',
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${menuWidth}px`,
    maxHeight: `${Math.round(maxHeight)}px`,
    zIndex: '140',
  };
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node | null;
  if (!target) return;
  if (settingsTriggerRef.value?.contains(target)) return;
  if (settingsMenuRef.value?.$el?.contains?.(target)) return;

  showSettings.value = false;
}

onMounted(() => {
  window.addEventListener('mousedown', handleClickOutside);
  window.addEventListener('resize', updateSettingsMenuPosition);
});

onUnmounted(() => {
  window.removeEventListener('mousedown', handleClickOutside);
  window.removeEventListener('resize', updateSettingsMenuPosition);
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
});

watch(showSettings, (visible) => {
  emit('menu-visibility-change', visible);
  if (visible) {
    void nextTick(updateSettingsMenuPosition);
  }
});
</script>

<template>
  <div class="desktop-toolbar" @mousedown.stop>
    <div class="desktop-toolbar-track">
      <button
        class="desktop-toolbar-button"
        :title="`歌词提前 0.5s（当前 ${props.offsetLabel}）`"
        @click="emitAction({ type: 'adjust-offset', delta: -0.5 })"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
          <path stroke-linecap="round" stroke-linejoin="round" d="m11 7-5 5 5 5" />
          <path stroke-linecap="round" stroke-linejoin="round" d="m18 7-5 5 5 5" />
        </svg>
      </button>

      <button
        class="desktop-toolbar-button"
        :title="`歌词延后 0.5s（当前 ${props.offsetLabel}）`"
        @click="emitAction({ type: 'adjust-offset', delta: 0.5 })"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
          <path stroke-linecap="round" stroke-linejoin="round" d="m6 7 5 5-5 5" />
          <path stroke-linecap="round" stroke-linejoin="round" d="m13 7 5 5-5 5" />
        </svg>
      </button>

      <span class="desktop-toolbar-divider" aria-hidden="true"></span>

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

      <div class="relative" @mouseenter="openSettings" @mouseleave="closeSettings">
        <button ref="settingsTriggerRef" class="desktop-toolbar-button" title="设置">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36 6.36-2.12-2.12M8.76 8.76 5.64 5.64m12.72 0-2.12 2.12M8.76 15.24l-3.12 3.12" />
            <circle cx="12" cy="12" r="3.25" />
          </svg>
        </button>

        <DesktopLyricsSettingsMenu
          v-show="showSettings"
          ref="settingsMenuRef"
          :menu-style="settingsMenuStyle"
          :settings="props.settings"
          :available-font-options="props.availableFontOptions"
          :selected-font-label="props.selectedFontLabel"
          :font-scale-label="props.fontScaleLabel"
          :line-gap-label="props.lineGapLabel"
          :offset-x-label="props.offsetXLabel"
          :offset-y-label="props.offsetYLabel"
          :alignment-options="props.alignmentOptions"
          @patch-settings="patchSettings"
          @keep-open="keepSettingsOpen"
        />
      </div>

      <span class="desktop-toolbar-divider" aria-hidden="true"></span>

      <button
        class="desktop-toolbar-button"
        :class="{ 'desktop-toolbar-button--active': props.settings.isLocked }"
        :title="props.settings.isLocked ? '已锁定位置并启用鼠标穿透' : '锁定位置并启用鼠标穿透'"
        @click="patchSettings({ isLocked: !props.settings.isLocked })"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 10V7.5a4 4 0 1 1 8 0V10m-9 0h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
          <path v-if="!props.settings.isLocked" stroke-linecap="round" stroke-linejoin="round" d="M12 14v3" />
        </svg>
      </button>

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

.desktop-toolbar-button--active {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
}

.desktop-toolbar-divider {
  width: 1px;
  height: 18px;
  background: linear-gradient(180deg, transparent, rgba(123, 164, 255, 0.82), transparent);
  opacity: 0.7;
}
</style>
