<script setup lang="ts">
import { computed, ref } from 'vue';

import { useToast } from '../../composables/toast';
import { useSettings } from '../../features/settings/useSettings';
import {
  areShortcutBindingsEqual,
  createDefaultShortcutSettings,
  formatShortcutBinding,
  getShortcutBindingFromEvent,
  shortcutActionLabels,
  shortcutActionOrder,
} from '../../features/settings/shortcuts';
import type { ShortcutActionId } from '../../types';

const { settings } = useSettings();
const { showToast } = useToast();

const capturingActionId = ref<ShortcutActionId | null>(null);

const shortcutRows = computed(() => shortcutActionOrder.map((actionId) => ({
  actionId,
  label: shortcutActionLabels[actionId],
  localBinding: settings.value.shortcuts.local[actionId],
  globalBinding: settings.value.shortcuts.global[actionId],
})));

const startCapture = (actionId: ShortcutActionId) => {
  capturingActionId.value = actionId;
};

const stopCapture = () => {
  capturingActionId.value = null;
};

const restoreDefaults = () => {
  settings.value.shortcuts = createDefaultShortcutSettings();
  stopCapture();
};

const updateLocalShortcut = (
  actionId: ShortcutActionId,
  nextBinding: ReturnType<typeof getShortcutBindingFromEvent>,
) => {
  settings.value.shortcuts.local[actionId] = nextBinding;
};

const handleShortcutCapture = (actionId: ShortcutActionId, event: KeyboardEvent) => {
  if (capturingActionId.value !== actionId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (event.key === 'Escape') {
    stopCapture();
    return;
  }

  if (event.key === 'Backspace' || event.key === 'Delete') {
    updateLocalShortcut(actionId, null);
    stopCapture();
    return;
  }

  const nextBinding = getShortcutBindingFromEvent(event);
  if (!nextBinding) {
    return;
  }

  const conflictActionId = shortcutActionOrder.find(candidateActionId => (
    candidateActionId !== actionId
    && areShortcutBindingsEqual(settings.value.shortcuts.local[candidateActionId], nextBinding)
  ));

  if (conflictActionId) {
    showToast(
      `${shortcutActionLabels[conflictActionId]} 已使用 ${formatShortcutBinding(nextBinding)}`,
      'error',
    );
    return;
  }

  updateLocalShortcut(actionId, nextBinding);
  stopCapture();
};
</script>

<template>
  <div class="w-full space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <section class="space-y-3">
      <h2 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
        <span class="w-1 h-4 bg-[#EC4141] rounded-full"></span>
        快捷键
      </h2>

      <div class="flex flex-col rounded-xl overflow-hidden">
        <div class="p-4 border-b border-white/30 dark:border-white/5">
          <div class="text-sm font-medium text-gray-800 dark:text-gray-200">窗口内快捷键</div>
          <div class="mt-1 text-xs text-gray-600 dark:text-white/60">
            软件打开且窗口处于焦点时生效。默认支持按下 Space 播放/暂停。
          </div>
          <div class="mt-3 text-[11px] text-gray-500 dark:text-white/45">
            点击快捷键按钮后直接按键录入，按 Esc 取消，按 Backspace 或 Delete 清空当前绑定。
          </div>
        </div>

        <div class="px-4 py-3 grid grid-cols-[minmax(0,1.1fr)_minmax(180px,1fr)_minmax(180px,1fr)] gap-4 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-white/45 border-b border-white/30 dark:border-white/5">
          <div>功能说明</div>
          <div>快捷键</div>
          <div>全局快捷键</div>
        </div>

        <div
          v-for="row in shortcutRows"
          :key="row.actionId"
          class="px-4 py-3 border-b border-white/30 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/10 transition-colors grid grid-cols-[minmax(0,1.1fr)_minmax(180px,1fr)_minmax(180px,1fr)] gap-4 items-center"
        >
          <div class="min-w-0">
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">
              {{ row.label }}
            </div>
          </div>

          <button
            type="button"
            data-shortcut-capture="true"
            @click="startCapture(row.actionId)"
            @blur="capturingActionId === row.actionId && stopCapture()"
            @keydown="handleShortcutCapture(row.actionId, $event)"
            class="w-full rounded-full border px-4 py-3 text-left text-sm transition-all backdrop-blur-md"
            :class="capturingActionId === row.actionId
              ? 'border-[#EC4141] bg-red-500/10 text-[#EC4141] dark:bg-red-500/20 shadow-[0_0_12px_rgba(236,65,65,0.2)]'
              : 'border-white/30 bg-white/40 text-gray-800 shadow-sm hover:border-[#EC4141] hover:text-[#EC4141] hover:bg-white/50 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/20 dark:hover:border-[#EC4141]'"
          >
            {{ capturingActionId === row.actionId ? '按下新的快捷键' : formatShortcutBinding(row.localBinding) }}
          </button>

          <button
            type="button"
            disabled
            class="w-full rounded-full border border-white/20 bg-white/20 px-4 py-3 text-left text-sm text-gray-500 cursor-not-allowed backdrop-blur-sm dark:border-white/5 dark:bg-white/[0.02] dark:text-white/30"
          >
            {{ formatShortcutBinding(row.globalBinding, '预留') }}
          </button>
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
        <span class="w-1 h-4 bg-[#EC4141] rounded-full"></span>
        选项
      </h2>

      <div class="flex flex-col rounded-xl overflow-hidden">
        <div class="p-4 flex items-center justify-between border-b border-white/30 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/10 transition-colors">
          <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">启用窗口内快捷键</div>
            <div class="text-xs text-gray-600 dark:text-white/60 mt-0.5">关闭后将不再响应当前窗口内的所有快捷键</div>
          </div>
          <button
            @click="settings.shortcuts.enabled = !settings.shortcuts.enabled"
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
            :class="settings.shortcuts.enabled ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm"
              :class="settings.shortcuts.enabled ? 'translate-x-6' : 'translate-x-1'"
            />
          </button>
        </div>

        <div class="p-4 flex items-center justify-between border-b border-white/30 dark:border-white/5 last:border-0 opacity-70 cursor-not-allowed">
          <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">启用全局快捷键</div>
            <div class="text-xs text-gray-600 dark:text-white/60 mt-0.5">结构已预留，当前版本暂未接入系统级监听</div>
          </div>
          <div class="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-300 dark:bg-gray-700">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white translate-x-1 shadow-sm" />
          </div>
        </div>

        <div class="p-4 flex items-center justify-between hover:bg-white/40 dark:hover:bg-white/10 transition-colors opacity-70 cursor-not-allowed">
          <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">使用系统媒体快捷键</div>
            <div class="text-xs text-gray-600 dark:text-white/60 mt-0.5">播放/暂停、上一首、下一首等系统级媒体键入口已预留</div>
          </div>
          <div class="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-300 dark:bg-gray-700">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white translate-x-1 shadow-sm" />
          </div>
        </div>
      </div>

      <div class="flex justify-end">
        <button
          type="button"
          @click="restoreDefaults"
          class="text-xs px-4 py-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full text-gray-600 dark:text-gray-300 hover:text-[#EC4141] hover:border-[#EC4141] transition"
        >
          恢复默认
        </button>
      </div>
    </section>
  </div>
</template>
