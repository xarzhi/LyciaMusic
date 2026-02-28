<script setup lang="ts">
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../../composables/toast';

const toast = useToast();

const props = defineProps<{
  targetPath: string;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'restart'): void;
  (e: 'close'): void;
}>();

const isRefreshing = ref(false);
const refreshed = ref(false);

const handleRefresh = async () => {
  if (!props.targetPath) {
    toast.showToast('没有目标文件夹', 'error');
    return;
  }
  
  isRefreshing.value = true;
  try {
    // 调用后端刷新指定文件夹
    await invoke('refresh_folder_songs', { folderPath: props.targetPath });
    toast.showToast('歌曲信息已刷新', 'success');
    refreshed.value = true;
  } catch (e) {
    console.error(e);
    toast.showToast(`刷新失败: ${e}`, 'error');
  } finally {
    isRefreshing.value = false;
  }
};
</script>

<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <!-- 完成状态 -->
    <div v-if="refreshed" class="text-center py-8">
      <div class="w-20 h-20 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
        <span class="text-4xl">🎉</span>
      </div>
      <h3 class="text-2xl font-bold text-gray-800 dark:text-white mb-2">全部完成！</h3>
      <p class="text-gray-500 dark:text-gray-400">您的音乐文件已成功整理完毕</p>
    </div>

    <!-- 刷新步骤 -->
    <div v-else class="space-y-6">
      <!-- 步骤说明 -->
      <div class="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4">
        <div class="flex items-start gap-3">
          <span class="text-2xl">🔄</span>
          <div>
            <h4 class="font-bold text-amber-800 dark:text-amber-300">刷新歌曲信息</h4>
            <p class="text-sm text-amber-600 dark:text-amber-400 mt-1">
              重新扫描目标文件夹，更新软件内的歌曲元数据
            </p>
          </div>
        </div>
      </div>

      <!-- 操作文件夹 -->
      <section class="space-y-3">
        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">操作文件夹</label>
        <div class="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-600 dark:text-gray-300 truncate">
          {{ targetPath || '未选择' }}
        </div>
      </section>

      <!-- 刷新按钮 -->
      <button 
        @click="handleRefresh"
        :disabled="!targetPath || isRefreshing"
        class="w-full px-6 py-4 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg"
      >
        <svg v-if="isRefreshing" class="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {{ isRefreshing ? '刷新中...' : '刷新歌曲信息' }}
      </button>
    </div>

    <!-- 底部按钮 -->
    <div class="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
      <button 
        v-if="!refreshed"
        @click="emit('back')"
        class="flex-1 px-6 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition"
      >
        返回上一步
      </button>
      <button 
        v-if="refreshed"
        @click="emit('restart')"
        class="flex-1 px-6 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition"
      >
        处理另一个文件夹
      </button>
      <button 
        v-if="refreshed"
        @click="emit('close')"
        class="flex-1 px-6 py-3 rounded-xl bg-[#EC4141] text-white font-bold hover:bg-[#d13a3a] transition"
      >
        完成
      </button>
    </div>
  </div>
</template>
