<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../../composables/toast';

interface CleanPreview {
  original_path: string;
  original_name: string;
  new_name: string;
  status: string;
  error?: string;
}

const toast = useToast();

const props = defineProps<{
  targetPath: string;
}>();

const emit = defineEmits<{
  (e: 'next'): void;
  (e: 'skip'): void;
  (e: 'preview-change', payload: {
    targetPath: string;
    isScanning: boolean;
    hasScanned: boolean;
    removeTrackPrefix: boolean;
    items: Array<{
      originalName: string;
      newName: string;
    }>;
  }): void;
}>();

const isScanning = ref(false);
const isApplying = ref(false);
const hasScanned = ref(false);
const removeTrackPrefix = ref(true);
const previewItems = ref<CleanPreview[]>([]);

watch(removeTrackPrefix, () => {
  hasScanned.value = false;
  previewItems.value = [];
});

const validItems = computed(() =>
  previewItems.value.filter((item) => item.status !== 'skipped' && !item.error),
);

const emitPreview = () => {
  emit('preview-change', {
    targetPath: props.targetPath,
    isScanning: isScanning.value,
    hasScanned: hasScanned.value,
    removeTrackPrefix: removeTrackPrefix.value,
    items: validItems.value.map((item) => ({
      originalName: item.original_name,
      newName: item.new_name,
    })),
  });
};

watch(
  [() => props.targetPath, isScanning, hasScanned, removeTrackPrefix, validItems],
  emitPreview,
  { immediate: true, deep: true },
);

const handleScan = async () => {
  if (!props.targetPath) {
    toast.showToast('请先返回准备页选择目标文件夹', 'error');
    return;
  }

  isScanning.value = true;

  try {
    const config = {
      mode: 'rules',
      template: '',
      remove_track_prefix: removeTrackPrefix.value,
      remove_source_prefix: false,
    };

    const result = await invoke<CleanPreview[]>('preview_rename', {
      rootPath: props.targetPath,
      config,
    });

    previewItems.value = result;
    hasScanned.value = true;
  } catch (error) {
    console.error(error);
    toast.showToast(`扫描失败: ${error}`, 'error');
  } finally {
    isScanning.value = false;
  }
};

const handleApply = async () => {
  if (validItems.value.length === 0) {
    emit('next');
    return;
  }

  isApplying.value = true;

  try {
    const operations = validItems.value.map((item) => ({
      original_path: item.original_path,
      new_name: item.new_name,
    }));

    const count = await invoke<number>('apply_rename', { operations });
    toast.showToast(`成功清洗 ${count} 个文件名`, 'success');
    emit('next');
  } catch (error) {
    console.error(error);
    toast.showToast(`应用修改失败: ${error}`, 'error');
  } finally {
    isApplying.value = false;
  }
};
</script>

<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <section class="rounded-3xl border border-sky-200/80 bg-sky-50/80 p-5 dark:border-sky-500/20 dark:bg-sky-500/10">
      <div class="flex items-start gap-4">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-xl text-white shadow-sm">1</div>
        <div>
          <h3 class="text-lg font-semibold text-sky-950 dark:text-sky-200">预处理：去除序号前缀</h3>
          <p class="mt-2 text-sm leading-7 text-sky-800/80 dark:text-sky-300">
            这一步只处理文件名前面的轨道序号，例如 <code class="rounded bg-white/70 px-1.5 py-0.5 dark:bg-white/10">01. Song.flac</code>
            变为
            <code class="rounded bg-white/70 px-1.5 py-0.5 dark:bg-white/10">Song.flac</code>。
          </p>
        </div>
      </div>
    </section>

    <section class="rounded-3xl border border-slate-200/70 bg-slate-50/75 p-5 dark:border-white/10 dark:bg-white/5">
      <div class="text-sm font-semibold text-slate-900 dark:text-white">当前目标文件夹</div>
      <div class="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white/85 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-black/20 dark:text-slate-300">
        <span class="break-all">{{ targetPath }}</span>
      </div>
    </section>

    <section class="rounded-3xl border border-slate-200/70 bg-slate-50/75 p-5 dark:border-white/10 dark:bg-white/5">
      <div class="text-sm font-semibold text-slate-900 dark:text-white">预处理选项</div>
      <label class="mt-4 flex cursor-pointer items-start gap-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-4 transition hover:border-sky-300 dark:border-white/10 dark:bg-black/20 dark:hover:border-sky-400/40">
        <input
          v-model="removeTrackPrefix"
          type="checkbox"
          class="mt-1 h-5 w-5 rounded border-slate-300 text-[#EC4141] focus:ring-[#EC4141]"
        />
        <div>
          <div class="text-sm font-semibold text-slate-900 dark:text-white">去除序号前缀</div>
          <p class="mt-1 text-xs leading-6 text-slate-600 dark:text-white/60">
            适合从下载站或网盘整理出来的曲目文件，能减少后续标签识别时的干扰。
          </p>
        </div>
      </label>
    </section>

    <button
      @click="handleScan"
      :disabled="!targetPath || isScanning"
      class="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/20"
    >
      <svg v-if="isScanning" class="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      {{ isScanning ? '扫描中...' : hasScanned ? '重新扫描' : '扫描文件' }}
    </button>

    <div class="flex gap-3 border-t border-slate-100 pt-4 dark:border-white/5">
      <button
        @click="emit('skip')"
        class="flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/5"
      >
        跳过此步骤
      </button>
      <button
        v-if="hasScanned"
        @click="handleApply"
        :disabled="isApplying"
        class="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#EC4141] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#d63a3a] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg v-if="isApplying" class="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {{ validItems.length > 0 ? `应用并继续 (${validItems.length})` : '继续下一步' }}
      </button>
    </div>
  </div>
</template>
