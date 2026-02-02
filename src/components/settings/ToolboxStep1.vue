<script setup lang="ts">
import { ref, computed } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../../composables/toast';

const toast = useToast();

const props = defineProps<{
  targetPath: string;
}>();

const emit = defineEmits<{
  (e: 'update:targetPath', path: string): void;
  (e: 'next'): void;
  (e: 'skip'): void;
}>();

interface CleanPreview {
  original_path: string;
  original_name: string;
  new_name: string;
  status: string;
  error?: string;
}

const isScanning = ref(false);
const isApplying = ref(false);
const previewItems = ref<CleanPreview[]>([]);
const hasScanned = ref(false);

const removeTrackPrefix = ref(true);
const removeSourcePrefix = ref(false);

const selectFolder = async () => {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择要整理的文件夹',
    });
    if (selected && typeof selected === 'string') {
      emit('update:targetPath', selected);
      hasScanned.value = false;
      previewItems.value = [];
    }
  } catch (e) {
    console.error(e);
  }
};

const handleScan = async () => {
  if (!props.targetPath) return;
  isScanning.value = true;
  try {
    const config = {
      mode: 'rules',
      template: '',
      remove_track_prefix: removeTrackPrefix.value,
      remove_source_prefix: removeSourcePrefix.value,
    };
    const res = await invoke<CleanPreview[]>('preview_rename', {
      rootPath: props.targetPath,
      config,
    });
    previewItems.value = res;
    hasScanned.value = true;
  } catch (e) {
    console.error(e);
    toast.showToast(`扫描失败: ${e}`, 'error');
  } finally {
    isScanning.value = false;
  }
};

const validItems = computed(() => 
  previewItems.value.filter(i => i.status !== 'skipped' && !i.error)
);

const handleApply = async () => {
  if (validItems.value.length === 0) {
    emit('next');
    return;
  }
  
  isApplying.value = true;
  try {
    const operations = validItems.value.map(item => ({
      original_path: item.original_path,
      new_name: item.new_name
    }));
    
    const count = await invoke<number>('apply_rename', { operations });
    toast.showToast(`成功清洗 ${count} 个文件名`, 'success');
    emit('next');
  } catch (e) {
    console.error(e);
    toast.showToast(`应用修改失败: ${e}`, 'error');
  } finally {
    isApplying.value = false;
  }
};
</script>

<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <!-- 步骤说明 -->
    <div class="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-4">
      <div class="flex items-start gap-3">
        <span class="text-2xl">🧹</span>
        <div>
          <h4 class="font-bold text-blue-800 dark:text-blue-300">预处理：清洗文件名</h4>
          <p class="text-sm text-blue-600 dark:text-blue-400 mt-1">
            去除下载歌曲常见的序号前缀（如 <code class="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">01. Song.flac</code> → <code class="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">Song.flac</code>）
          </p>
        </div>
      </div>
    </div>

    <!-- 选择文件夹 -->
    <section class="space-y-3">
      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">目标文件夹</label>
      <div class="flex items-center gap-3">
        <div class="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-600 dark:text-gray-300 truncate">
          {{ targetPath || '请选择要整理的文件夹...' }}
        </div>
        <button 
          @click="selectFolder"
          class="px-5 py-3 rounded-xl bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-white text-sm font-medium transition active:scale-95"
        >
          浏览...
        </button>
      </div>
    </section>

    <!-- 清洗规则 -->
    <section class="space-y-3">
      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">清洗规则</label>
      <div class="space-y-2">
        <label class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-white/5 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10 transition">
          <input type="checkbox" v-model="removeTrackPrefix" class="rounded text-[#EC4141] focus:ring-[#EC4141] w-5 h-5 border-gray-300 dark:border-gray-600" />
          <div class="flex-1">
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">去除序号前缀</div>
            <div class="text-xs text-gray-500"><code class="font-mono">01. Song</code> → <code class="font-mono">Song</code></div>
          </div>
        </label>

        <label class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-white/5 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10 transition">
          <input type="checkbox" v-model="removeSourcePrefix" class="rounded text-[#EC4141] focus:ring-[#EC4141] w-5 h-5 border-gray-300 dark:border-gray-600" />
          <div class="flex-1">
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">去除来源前缀</div>
            <div class="text-xs text-gray-500"><code class="font-mono">[网易云] Song</code> → <code class="font-mono">Song</code></div>
          </div>
        </label>
      </div>
    </section>

    <!-- 扫描按钮 -->
    <button 
      v-if="!hasScanned"
      @click="handleScan"
      :disabled="!targetPath || isScanning"
      class="w-full px-6 py-3 rounded-xl bg-gray-800 dark:bg-white/10 text-white font-medium hover:bg-gray-700 dark:hover:bg-white/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      <svg v-if="isScanning" class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      {{ isScanning ? '扫描中...' : '扫描文件' }}
    </button>

    <!-- 预览结果 -->
    <div v-if="hasScanned" class="space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="font-bold text-gray-800 dark:text-gray-200">扫描结果</h4>
        <span class="text-sm text-gray-500">{{ validItems.length }} 个文件需要清洗</span>
      </div>
      
      <div v-if="validItems.length === 0" class="text-center py-8 text-gray-500">
        <span class="text-4xl mb-2 block">✨</span>
        <p>所有文件名都很干净，无需清洗！</p>
      </div>
      
      <div v-else class="max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-white/10">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 dark:bg-white/5 sticky top-0">
            <tr>
              <th class="px-4 py-2 text-left text-gray-500 font-medium">原文件名</th>
              <th class="px-2 py-2 text-center text-gray-400 w-8">→</th>
              <th class="px-4 py-2 text-left text-gray-500 font-medium">新文件名</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-white/5">
            <tr v-for="item in validItems" :key="item.original_path" class="hover:bg-gray-50 dark:hover:bg-white/5">
              <td class="px-4 py-2 text-gray-600 dark:text-gray-400 truncate max-w-xs">{{ item.original_name }}</td>
              <td class="px-2 py-2 text-center text-gray-400">→</td>
              <td class="px-4 py-2 text-gray-900 dark:text-white font-medium truncate max-w-xs">{{ item.new_name }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 底部按钮 -->
    <div class="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
      <button 
        @click="emit('skip')"
        class="flex-1 px-6 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition"
      >
        跳过此步骤
      </button>
      <button 
        v-if="hasScanned"
        @click="handleApply"
        :disabled="isApplying"
        class="flex-1 px-6 py-3 rounded-xl bg-[#EC4141] text-white font-bold hover:bg-[#d13a3a] transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <svg v-if="isApplying" class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {{ validItems.length > 0 ? `应用并继续 (${validItems.length})` : '继续下一步' }}
      </button>
    </div>
  </div>
</template>
