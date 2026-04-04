<script setup lang="ts">
import {
  DEFAULT_PLAYER_FONT_PRESET,
  DEFAULT_PLAYER_FONT_SCALE,
  DEFAULT_PLAYER_LINE_GAP,
  DEFAULT_PLAYER_OFFSET_X,
  DEFAULT_PLAYER_OFFSET_Y,
  type LyricsFontOption,
} from '../../composables/lyrics';
import type {
  DesktopLyricsSettingsPatch,
  DesktopLyricsWindowSettings,
} from '../../features/desktopLyrics/shared';

const FONT_SCALE_STEP = 0.05;
const LINE_GAP_STEP = 0.05;
const OFFSET_STEP = 1;

defineProps<{
  menuStyle: Record<string, string>;
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
  (e: 'patch-settings', patch: DesktopLyricsSettingsPatch): void;
  (e: 'keep-open'): void;
}>();

function emitPatch(patch: DesktopLyricsSettingsPatch) {
  emit('patch-settings', patch);
}

function updateFontPreset(event: Event) {
  const target = event.target as HTMLSelectElement | null;
  if (!target) return;

  emitPatch({
    playerFontPreset: target.value,
  });
}
</script>

<template>
  <div
    class="settings-menu settings-menu-panel absolute left-1/2 top-full z-50 mt-3 -translate-x-1/2 rounded-[12px] text-xs text-white/80"
    :style="menuStyle"
    @mouseenter="emit('keep-open')"
  >
    <div class="settings-menu-scroll">
      <div class="settings-section">
        <div class="settings-section-title">显示</div>
        <button type="button" class="settings-item" @click="emitPatch({ isAlwaysOnTop: !settings.isAlwaysOnTop })">
          <span>窗口置顶</span>
          <span>{{ settings.isAlwaysOnTop ? 'ON' : 'OFF' }}</span>
        </button>
        <button type="button" class="settings-item" @click="emitPatch({ autoHideWhenFullscreen: !settings.autoHideWhenFullscreen })">
          <span>全屏时自动隐藏</span>
          <span>{{ settings.autoHideWhenFullscreen ? 'ON' : 'OFF' }}</span>
        </button>
        <button type="button" class="settings-item" @click="emitPatch({ showTranslation: !settings.showTranslation })">
          <span>翻译</span>
          <span>{{ settings.showTranslation ? 'ON' : 'OFF' }}</span>
        </button>
        <button type="button" class="settings-item" @click="emitPatch({ showRomaji: !settings.showRomaji })">
          <span>罗马音</span>
          <span>{{ settings.showRomaji ? 'ON' : 'OFF' }}</span>
        </button>
        <button type="button" class="settings-item" @click="emitPatch({ persistLock: !settings.persistLock })">
          <span>记住锁定</span>
          <span>{{ settings.persistLock ? 'ON' : 'OFF' }}</span>
        </button>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">版式</div>
        <div class="settings-control-row">
          <span>字号</span>
          <div class="settings-stepper">
            <button type="button" class="settings-mini-button" @click="emitPatch({ playerFontScale: settings.playerFontScale - FONT_SCALE_STEP })">-</button>
            <button type="button" class="settings-value-button" @click="emitPatch({ playerFontScale: DEFAULT_PLAYER_FONT_SCALE })">{{ fontScaleLabel }}</button>
            <button type="button" class="settings-mini-button" @click="emitPatch({ playerFontScale: settings.playerFontScale + FONT_SCALE_STEP })">+</button>
          </div>
        </div>

        <div class="settings-control-row">
          <span>行距</span>
          <div class="settings-stepper">
            <button type="button" class="settings-mini-button" @click="emitPatch({ playerLineGap: settings.playerLineGap - LINE_GAP_STEP })">-</button>
            <button type="button" class="settings-value-button" @click="emitPatch({ playerLineGap: DEFAULT_PLAYER_LINE_GAP })">{{ lineGapLabel }}</button>
            <button type="button" class="settings-mini-button" @click="emitPatch({ playerLineGap: settings.playerLineGap + LINE_GAP_STEP })">+</button>
          </div>
        </div>

        <div class="settings-control-row">
          <span>横向偏移</span>
          <div class="settings-stepper">
            <button type="button" class="settings-mini-button" @click="emitPatch({ playerOffsetX: settings.playerOffsetX - OFFSET_STEP })">-</button>
            <button type="button" class="settings-value-button" @click="emitPatch({ playerOffsetX: DEFAULT_PLAYER_OFFSET_X })">{{ offsetXLabel }}</button>
            <button type="button" class="settings-mini-button" @click="emitPatch({ playerOffsetX: settings.playerOffsetX + OFFSET_STEP })">+</button>
          </div>
        </div>

        <div class="settings-control-row">
          <span>纵向偏移</span>
          <div class="settings-stepper">
            <button type="button" class="settings-mini-button" @click="emitPatch({ playerOffsetY: settings.playerOffsetY - OFFSET_STEP })">-</button>
            <button type="button" class="settings-value-button" @click="emitPatch({ playerOffsetY: DEFAULT_PLAYER_OFFSET_Y })">{{ offsetYLabel }}</button>
            <button type="button" class="settings-mini-button" @click="emitPatch({ playerOffsetY: settings.playerOffsetY + OFFSET_STEP })">+</button>
          </div>
        </div>

        <div class="settings-control-stack">
          <span>对齐</span>
          <div class="settings-chip-group">
            <button
              v-for="option in alignmentOptions"
              :key="option.value"
              type="button"
              class="settings-chip"
              :class="{ 'settings-chip--active': settings.playerAlignment === option.value }"
              @click="emitPatch({ playerAlignment: option.value })"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="settings-control-stack">
          <div class="settings-control-header">
            <span>字体</span>
            <button type="button" class="settings-link-button" @click="emitPatch({ playerFontPreset: DEFAULT_PLAYER_FONT_PRESET })">重置</button>
          </div>
          <select class="settings-select" :value="settings.playerFontPreset" @change="updateFontPreset">
            <option v-for="option in availableFontOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <div class="settings-hint">{{ selectedFontLabel }}</div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">配色</div>
        <div class="settings-chip-group">
          <button type="button" class="settings-chip" :class="{ 'settings-chip--active': settings.colorScheme === 'auto' }" @click="emitPatch({ colorScheme: 'auto' })">封面</button>
          <button type="button" class="settings-chip" :class="{ 'settings-chip--active': settings.colorScheme === 'default' }" @click="emitPatch({ colorScheme: 'default' })">经典</button>
          <button type="button" class="settings-chip" :class="{ 'settings-chip--active': settings.colorScheme === 'pink' }" @click="emitPatch({ colorScheme: 'pink' })">粉</button>
          <button type="button" class="settings-chip" :class="{ 'settings-chip--active': settings.colorScheme === 'blue' }" @click="emitPatch({ colorScheme: 'blue' })">蓝</button>
          <button type="button" class="settings-chip" :class="{ 'settings-chip--active': settings.colorScheme === 'green' }" @click="emitPatch({ colorScheme: 'green' })">绿</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-menu {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(22, 24, 34, 0.9);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 18px 42px rgba(2, 6, 23, 0.34);
}

.settings-menu-panel {
  padding: 12px;
}

.settings-menu-scroll {
  display: flex;
  max-height: inherit;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding-right: 4px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background-color 160ms ease;
}

.settings-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.settings-control-row,
.settings-control-stack {
  display: flex;
  gap: 10px;
}

.settings-control-row {
  align-items: center;
  justify-content: space-between;
}

.settings-control-stack {
  flex-direction: column;
}

.settings-control-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.settings-stepper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.settings-mini-button,
.settings-value-button,
.settings-link-button,
.settings-chip,
.settings-select {
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.84);
}

.settings-mini-button,
.settings-value-button,
.settings-link-button,
.settings-chip {
  background: rgba(255, 255, 255, 0.04);
  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
}

.settings-mini-button:hover,
.settings-value-button:hover,
.settings-link-button:hover,
.settings-chip:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.settings-mini-button,
.settings-value-button {
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  font-size: 12px;
}

.settings-value-button {
  min-width: 64px;
  padding: 0 10px;
}

.settings-link-button {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
}

.settings-chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.settings-chip {
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 11px;
}

.settings-chip--active {
  border-color: rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

.settings-select {
  width: 100%;
  border-radius: 10px;
  background: rgba(9, 12, 20, 0.88);
  padding: 8px 10px;
  outline: none;
}

.settings-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.56);
}
</style>
