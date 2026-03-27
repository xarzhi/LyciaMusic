<script setup lang="ts">
import { ref, watch } from 'vue';
import { useToast } from '../../composables/toast';
import { appApi } from '../../services/tauri/appApi';

const toast = useToast();

const props = defineProps<{
  targetPath: string;
  musicTagPath: string;
}>();

const emit = defineEmits<{
  (e: 'next'): void;
  (e: 'back'): void;
  (e: 'preview-change', payload: {
    targetPath: string;
    musicTagPath: string;
    isLaunching: boolean;
    hasLaunched: boolean;
  }): void;
}>();

const isLaunching = ref(false);
const hasLaunched = ref(false);

const emitPreview = () => {
  emit('preview-change', {
    targetPath: props.targetPath,
    musicTagPath: props.musicTagPath,
    isLaunching: isLaunching.value,
    hasLaunched: hasLaunched.value,
  });
};

watch([() => props.targetPath, () => props.musicTagPath, isLaunching, hasLaunched], emitPreview, {
  immediate: true,
});

const launchMusicTag = async () => {
  if (!props.musicTagPath) {
    toast.showToast('请先返回准备页配置 MusicTag 路径', 'error');
    return;
  }

  isLaunching.value = true;

  try {
    await appApi.openExternalProgram(
      props.musicTagPath,
      props.targetPath ? [props.targetPath] : [],
    );
    hasLaunched.value = true;
    toast.showToast('MusicTag 已启动', 'success');
  } catch (error) {
    console.error(error);
    toast.showToast(`启动失败: ${error}`, 'error');
  } finally {
    isLaunching.value = false;
  }
};
</script>

<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <section class="rounded-3xl border border-violet-200/80 bg-violet-50/80 p-5 dark:border-violet-500/20 dark:bg-violet-500/10">
      <div class="flex items-start gap-4">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500 text-xl text-white shadow-sm">2</div>
        <div>
          <h3 class="text-lg font-semibold text-violet-950 dark:text-violet-200">标签编辑：启动 MusicTag</h3>
          <p class="mt-2 text-sm leading-7 text-violet-800/80 dark:text-violet-300">
            这一步不再配置路径，只负责启动 MusicTag。你在外部工具里完成标签修正后，再回到这里继续下一步。
          </p>
        </div>
      </div>
    </section>

    <section class="grid gap-4 lg:grid-cols-2">
      <div class="rounded-3xl border border-slate-200/70 bg-slate-50/75 p-5 dark:border-white/10 dark:bg-white/5">
        <div class="text-sm font-semibold text-slate-900 dark:text-white">MusicTag 路径</div>
        <div class="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white/85 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-black/20 dark:text-slate-300">
          <span class="break-all">{{ musicTagPath }}</span>
        </div>
      </div>

      <div class="rounded-3xl border border-slate-200/70 bg-slate-50/75 p-5 dark:border-white/10 dark:bg-white/5">
        <div class="text-sm font-semibold text-slate-900 dark:text-white">当前目标文件夹</div>
        <div class="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white/85 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-black/20 dark:text-slate-300">
          <span class="break-all">{{ targetPath }}</span>
        </div>
      </div>
    </section>

    <button
      @click="launchMusicTag"
      :disabled="!musicTagPath || isLaunching"
      class="flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 px-6 py-4 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
    >
      <svg v-if="isLaunching" class="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7m0 0v7m0-7L10 14m-4-4H5a2 2 0 00-2 2v7a2 2 0 002 2h7a2 2 0 002-2v-1" />
      </svg>
      {{ isLaunching ? '启动中...' : '启动 MusicTag' }}
    </button>

    <div class="flex gap-3 border-t border-slate-100 pt-4 dark:border-white/5">
      <button
        @click="emit('back')"
        class="flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/5"
      >
        返回上一步
      </button>
      <button
        @click="emit('next')"
        class="flex-1 rounded-2xl bg-[#EC4141] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#d63a3a]"
      >
        标签编辑完成，继续下一步
      </button>
    </div>
  </div>
</template>
