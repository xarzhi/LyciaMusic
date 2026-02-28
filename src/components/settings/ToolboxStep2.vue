<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../../composables/toast';

const toast = useToast();

const props = defineProps<{
  targetPath: string;
}>();

const emit = defineEmits<{
  (e: 'next'): void;
  (e: 'back'): void;
}>();

const MUSICTAG_PATH_KEY = 'musictag_path';
const musicTagPath = ref('');
const isLaunching = ref(false);
const hasConfiguredPath = ref(false);

onMounted(() => {
  const saved = localStorage.getItem(MUSICTAG_PATH_KEY);
  if (saved) {
    musicTagPath.value = saved;
    hasConfiguredPath.value = true;
  }
});

const selectMusicTagPath = async () => {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      title: '选择 MusicTag 可执行文件',
      filters: [{ name: '可执行文件', extensions: ['exe'] }],
    });
    if (selected && typeof selected === 'string') {
      musicTagPath.value = selected;
      localStorage.setItem(MUSICTAG_PATH_KEY, selected);
      hasConfiguredPath.value = true;
      toast.showToast('MusicTag 路径已保存', 'success');
    }
  } catch (e) {
    console.error(e);
  }
};

const launchMusicTag = async () => {
  if (!musicTagPath.value) {
    toast.showToast('请先配置 MusicTag 路径', 'error');
    return;
  }
  
  isLaunching.value = true;
  try {
    await invoke('open_external_program', { 
      path: musicTagPath.value,
      args: props.targetPath ? [props.targetPath] : []
    });
    toast.showToast('MusicTag 已启动', 'success');
  } catch (e) {
    console.error(e);
    toast.showToast(`启动失败: ${e}`, 'error');
  } finally {
    isLaunching.value = false;
  }
};
</script>

<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <!-- 步骤说明 -->
    <div class="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 rounded-xl p-4">
      <div class="flex items-start gap-3">
        <span class="text-2xl">🏷️</span>
        <div>
          <h4 class="font-bold text-purple-800 dark:text-purple-300">标签编辑：使用 MusicTag</h4>
          <p class="text-sm text-purple-600 dark:text-purple-400 mt-1">
            使用 MusicTag 软件为歌曲写入正确的标签信息（标题、艺术家、专辑等）
          </p>
        </div>
      </div>
    </div>

    <!-- MusicTag 路径配置 -->
    <section class="space-y-3">
      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">MusicTag 路径</label>
      <div class="flex items-center gap-3">
        <div class="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm truncate" :class="musicTagPath ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'">
          {{ musicTagPath || '请选择 MusicTag.exe 路径...' }}
        </div>
        <button 
          @click="selectMusicTagPath"
          class="px-5 py-3 rounded-xl bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-white text-sm font-medium transition active:scale-95"
        >
          浏览...
        </button>
      </div>
    </section>

    <!-- 当前操作文件夹 -->
    <section class="space-y-3">
      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">操作文件夹</label>
      <div class="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-600 dark:text-gray-300 truncate">
        {{ targetPath || '未选择' }}
      </div>
    </section>

    <!-- 启动 MusicTag -->
    <button 
      @click="launchMusicTag"
      :disabled="!hasConfiguredPath || isLaunching"
      class="w-full px-6 py-4 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg"
    >
      <svg v-if="isLaunching" class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
      {{ isLaunching ? '启动中...' : '启动 MusicTag' }}
    </button>

    <!-- 提示 -->
    <div class="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-xl p-4">
      <div class="flex items-start gap-3">
        <span class="text-xl">💡</span>
        <div class="text-sm text-yellow-700 dark:text-yellow-300">
          <p class="font-medium">操作提示：</p>
          <ol class="mt-2 space-y-1 list-decimal list-inside text-yellow-600 dark:text-yellow-400">
            <li>在 MusicTag 中导入上述文件夹的歌曲</li>
            <li>使用 MusicTag 的标签识别功能自动匹配歌曲信息</li>
            <li>确认信息正确后保存标签</li>
            <li>完成后返回此处继续下一步</li>
          </ol>
        </div>
      </div>
    </div>

    <!-- 底部按钮 -->
    <div class="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
      <button 
        @click="emit('back')"
        class="flex-1 px-6 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition"
      >
        返回上一步
      </button>
      <button 
        @click="emit('next')"
        class="flex-1 px-6 py-3 rounded-xl bg-[#EC4141] text-white font-bold hover:bg-[#d13a3a] transition"
      >
        标签编辑完成，继续
      </button>
    </div>
  </div>
</template>
