<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { useToast } from '../../composables/toast';
import ToolboxStep1 from './ToolboxStep1.vue';
import ToolboxStep2 from './ToolboxStep2.vue';
import ToolboxStep3 from './ToolboxStep3.vue';
import ToolboxStep4 from './ToolboxStep4.vue';

type ToolboxView = 'setup' | 'preprocess' | 'tagging' | 'rename' | 'refresh';

interface ProgressStep {
  key: ToolboxView;
  label: string;
}

interface PreviewListItem {
  originalName: string;
  newName: string;
}

const toast = useToast();

const MUSICTAG_PATH_KEY = 'toolbox_musictag_path';

const currentView = ref<ToolboxView>('setup');
const targetPath = ref('');
const musicTagPath = ref('');

const progressSteps: ProgressStep[] = [
  { key: 'setup', label: '预设' },
  { key: 'preprocess', label: '预处理' },
  { key: 'tagging', label: '编辑标签' },
  { key: 'rename', label: '重命名' },
  { key: 'refresh', label: '完成' },
];

const preprocessPreview = ref({
  targetPath: '',
  isScanning: false,
  hasScanned: false,
  removeTrackPrefix: true,
  items: [] as PreviewListItem[],
});

const taggingPreview = ref({
  targetPath: '',
  musicTagPath: '',
  isLaunching: false,
  hasLaunched: false,
});

const renamePreview = ref({
  targetPath: '',
  template: '{title} - {artist}',
  isScanning: false,
  hasScanned: false,
  items: [] as PreviewListItem[],
  skippedCount: 0,
});

const refreshPreview = ref({
  targetPath: '',
  isRefreshing: false,
  refreshed: false,
});

const canStart = computed(() => Boolean(targetPath.value && musicTagPath.value));
const currentProgressIndex = computed(() =>
  progressSteps.findIndex((step) => step.key === currentView.value),
);
const setupReadyCount = computed(() => Number(Boolean(musicTagPath.value)) + Number(Boolean(targetPath.value)));

const getPathLeaf = (path: string) => {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? '未选择';
};

onMounted(() => {
  const savedMusicTagPath = localStorage.getItem(MUSICTAG_PATH_KEY);

  if (savedMusicTagPath) {
    musicTagPath.value = savedMusicTagPath;
  }
});

const selectExecutable = async () => {
  try {
    const selected = await open({
      multiple: false,
      title: '选择 MusicTag 可执行文件',
      filters: [{ name: '可执行文件', extensions: ['exe'] }],
    });

    if (!selected || typeof selected !== 'string') {
      return;
    }

    musicTagPath.value = selected;
    localStorage.setItem(MUSICTAG_PATH_KEY, selected);
    toast.showToast('MusicTag 路径已保存', 'success');
  } catch (error) {
    console.error(error);
    toast.showToast(`选择路径失败: ${error}`, 'error');
  }
};

const selectTargetFolder = async () => {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择要整理的目标文件夹',
    });

    if (selected && typeof selected === 'string') {
      targetPath.value = selected;
    }
  } catch (error) {
    console.error(error);
    toast.showToast(`选择文件夹失败: ${error}`, 'error');
  }
};

const resetPreviewState = () => {
  preprocessPreview.value = {
    targetPath: '',
    isScanning: false,
    hasScanned: false,
    removeTrackPrefix: true,
    items: [],
  };
  taggingPreview.value = {
    targetPath: '',
    musicTagPath: '',
    isLaunching: false,
    hasLaunched: false,
  };
  renamePreview.value = {
    targetPath: '',
    template: '{title} - {artist}',
    isScanning: false,
    hasScanned: false,
    items: [],
    skippedCount: 0,
  };
  refreshPreview.value = {
    targetPath: '',
    isRefreshing: false,
    refreshed: false,
  };
};

const startFlow = () => {
  if (!canStart.value) {
    toast.showToast('请先选择 MusicTag 和目标文件夹', 'error');
    return;
  }

  currentView.value = 'preprocess';
};

const nextStep = () => {
  if (currentView.value === 'preprocess') {
    currentView.value = 'tagging';
    return;
  }

  if (currentView.value === 'tagging') {
    currentView.value = 'rename';
    return;
  }

  if (currentView.value === 'rename') {
    currentView.value = 'refresh';
  }
};

const prevStep = () => {
  if (currentView.value === 'tagging') {
    currentView.value = 'preprocess';
    return;
  }

  if (currentView.value === 'rename') {
    currentView.value = 'tagging';
    return;
  }

  if (currentView.value === 'refresh') {
    currentView.value = 'rename';
  }
};

const restart = () => {
  currentView.value = 'setup';
  targetPath.value = '';
  resetPreviewState();
};
</script>

<template>
  <div class="w-full space-y-6 pb-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <section class="w-full rounded-[28px] border border-white/50 bg-white/72 px-5 py-5 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.3)] backdrop-blur dark:border-white/10 dark:bg-black/20">
      <div class="grid items-start gap-y-3 [grid-template-columns:repeat(4,minmax(0,1fr)_88px)_minmax(0,1fr)]">
        <template v-for="(step, index) in progressSteps" :key="step.key">
          <div class="flex flex-col items-center gap-3">
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold transition"
              :class="
                index < currentProgressIndex
                  ? 'border-[#EC4141] bg-[#EC4141] text-white shadow-[0_10px_24px_-16px_rgba(236,65,65,0.9)]'
                  : index === currentProgressIndex
                  ? 'border-[#EC4141]/30 bg-[#EC4141]/10 text-[#EC4141]'
                  : 'border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-500'
              "
            >
              <span v-if="index < currentProgressIndex">✓</span>
              <span v-else>{{ index + 1 }}</span>
            </div>

            <div
              class="text-center text-xs font-medium transition"
              :class="
                index <= currentProgressIndex
                  ? 'text-slate-800 dark:text-white'
                  : 'text-slate-400 dark:text-slate-500'
              "
            >
              {{ step.label }}
            </div>
          </div>

          <div
            v-if="index < progressSteps.length - 1"
            class="mt-5 h-1 rounded-full transition"
            :class="
              index < currentProgressIndex
                ? 'bg-[#EC4141]'
                : 'bg-slate-200 dark:bg-white/10'
            "
          ></div>
        </template>
      </div>
    </section>

    <div
      v-if="currentView === 'setup'"
      class="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(520px,3fr)]"
    >
      <section class="rounded-[30px] border border-white/50 bg-white/72 p-7 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/10 dark:bg-black/20">
        <div class="space-y-4">
          <div class="rounded-3xl border border-slate-200/70 bg-slate-50/85 p-5 dark:border-white/10 dark:bg-white/5">
            <div class="mb-3 flex items-center justify-between gap-4">
              <div>
                <label class="text-sm font-semibold text-slate-900 dark:text-white">MusicTag 路径</label>
                <p class="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">用于歌曲标签写入和人工校正。</p>
              </div>
              <button
                @click="selectExecutable"
                class="shrink-0 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/20"
              >
                选择路径
              </button>
            </div>
            <div class="rounded-2xl border border-dashed border-slate-300 bg-white/85 px-4 py-3 text-sm text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-slate-300">
              <span v-if="musicTagPath" class="break-all text-slate-700 dark:text-slate-200">{{ musicTagPath }}</span>
              <span v-else>请选择 MusicTag.exe</span>
            </div>
          </div>

          <div class="rounded-3xl border border-slate-200/70 bg-slate-50/85 p-5 dark:border-white/10 dark:bg-white/5">
            <div class="mb-3 flex items-center justify-between gap-4">
              <div>
                <label class="text-sm font-semibold text-slate-900 dark:text-white">目标文件夹</label>
                <p class="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">这里决定本次要处理的整批歌曲文件。</p>
              </div>
              <button
                @click="selectTargetFolder"
                class="shrink-0 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/20"
              >
                选择文件夹
              </button>
            </div>
            <div class="rounded-2xl border border-dashed border-slate-300 bg-white/85 px-4 py-3 text-sm text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-slate-300">
              <span v-if="targetPath" class="break-all text-slate-700 dark:text-slate-200">{{ targetPath }}</span>
              <span v-else>请选择要整理的歌曲目录</span>
            </div>
          </div>

          <div class="pt-2">
            <button
              @click="startFlow"
              :disabled="!canStart"
              class="rounded-2xl bg-[#EC4141] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(236,65,65,0.8)] transition hover:bg-[#d63a3a] disabled:cursor-not-allowed disabled:opacity-45"
            >
              开始流程
            </button>
          </div>
        </div>
      </section>

      <aside class="xl:sticky xl:top-6 xl:self-start">
        <section class="rounded-[30px] border border-white/50 bg-white/72 p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/10 dark:bg-black/20">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">实时预览</h3>
              <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">当前预设完成后，工具箱会进入分步整理模式。</p>
            </div>
            <div class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {{ setupReadyCount }}/2
            </div>
          </div>

          <div class="mt-5 space-y-4">
            <div class="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
              <div class="text-xs uppercase tracking-[0.18em] text-slate-400">MusicTag</div>
              <div class="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {{ musicTagPath ? '已连接' : '等待选择' }}
              </div>
              <p class="mt-2 break-all text-sm text-slate-500 dark:text-slate-400">
                {{ musicTagPath || '选择 MusicTag 后，这里会显示可执行文件路径。' }}
              </p>
            </div>

            <div class="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
              <div class="text-xs uppercase tracking-[0.18em] text-slate-400">Folder</div>
              <div class="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {{ targetPath ? getPathLeaf(targetPath) : '等待选择' }}
              </div>
              <p class="mt-2 break-all text-sm text-slate-500 dark:text-slate-400">
                {{ targetPath || '选择目标文件夹后，这里会显示本次处理目录。' }}
              </p>
            </div>

            <div class="rounded-3xl border border-[#EC4141]/12 bg-[#EC4141]/6 p-4 dark:border-[#EC4141]/20">
              <div class="text-sm font-semibold text-slate-900 dark:text-white">接下来会发生什么</div>
              <ul class="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li>1. 先扫描并清理序号前缀。</li>
                <li>2. 再启动 MusicTag 完成标签编辑。</li>
                <li>3. 最后按标签批量重命名并刷新音乐库。</li>
              </ul>
            </div>
          </div>
        </section>
      </aside>
    </div>

    <div
      v-else
      class="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(520px,3fr)]"
    >
      <section class="rounded-[30px] border border-white/50 bg-white/72 p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/10 dark:bg-black/20">
        <ToolboxStep1
          v-if="currentView === 'preprocess'"
          :target-path="targetPath"
          @next="nextStep"
          @skip="nextStep"
          @preview-change="preprocessPreview = $event"
        />

        <ToolboxStep2
          v-else-if="currentView === 'tagging'"
          :target-path="targetPath"
          :music-tag-path="musicTagPath"
          @back="prevStep"
          @next="nextStep"
          @preview-change="taggingPreview = $event"
        />

        <ToolboxStep3
          v-else-if="currentView === 'rename'"
          :target-path="targetPath"
          @back="prevStep"
          @next="nextStep"
          @preview-change="renamePreview = $event"
        />

        <ToolboxStep4
          v-else-if="currentView === 'refresh'"
          :target-path="targetPath"
          @back="prevStep"
          @restart="restart"
          @close="restart"
          @preview-change="refreshPreview = $event"
        />
      </section>

      <aside class="xl:sticky xl:top-6 xl:self-start">
        <section class="rounded-[30px] border border-white/50 bg-white/72 p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/10 dark:bg-black/20">
          <template v-if="currentView === 'preprocess'">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold text-slate-900 dark:text-white">实时预览</h3>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">预处理结果会即时显示在这里。</p>
              </div>
              <div class="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                {{ preprocessPreview.items.length }} 项
              </div>
            </div>

            <div class="mt-5 space-y-4">
              <div class="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
                <div class="text-xs uppercase tracking-[0.18em] text-slate-400">规则</div>
                <div class="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                  {{ preprocessPreview.removeTrackPrefix ? '去除序号前缀' : '未启用清洗规则' }}
                </div>
                <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {{ preprocessPreview.targetPath || '先在左侧确认目标文件夹。' }}
                </p>
              </div>

              <div
                v-if="preprocessPreview.isScanning"
                class="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-6 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
              >
                正在扫描文件名，请稍候…
              </div>

              <div
                v-else-if="!preprocessPreview.hasScanned"
                class="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-6 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
              >
                点击左侧“扫描文件”后，这里会显示改名前后的预览列表。
              </div>

              <div
                v-else-if="preprocessPreview.items.length === 0"
                class="rounded-3xl border border-emerald-200/80 bg-emerald-50/80 p-6 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
              >
                当前文件名已经比较干净，这一步可以直接跳过。
              </div>

              <div
                v-else
                class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 dark:border-white/10 dark:bg-black/20"
              >
                <div class="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-white/5 dark:text-white">
                  改名前后
                </div>
                <div class="max-h-[420px] overflow-y-auto">
                  <div
                    v-for="item in preprocessPreview.items"
                    :key="`${item.originalName}-${item.newName}`"
                    class="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 dark:border-white/5"
                  >
                    <div class="truncate text-slate-500 dark:text-slate-400">{{ item.originalName }}</div>
                    <div class="text-center text-slate-300">→</div>
                    <div class="truncate font-medium text-slate-900 dark:text-white">{{ item.newName }}</div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="currentView === 'tagging'">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold text-slate-900 dark:text-white">实时预览</h3>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">这一步是外部工具协作，右侧展示当前工作状态。</p>
              </div>
              <div
                class="rounded-full px-3 py-1 text-xs font-medium"
                :class="
                  taggingPreview.hasLaunched
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                "
              >
                {{ taggingPreview.hasLaunched ? '已启动' : '待启动' }}
              </div>
            </div>

            <div class="mt-5 space-y-4">
              <div class="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
                <div class="text-xs uppercase tracking-[0.18em] text-slate-400">MusicTag</div>
                <div class="mt-2 break-all text-sm font-medium text-slate-900 dark:text-white">{{ taggingPreview.musicTagPath || musicTagPath }}</div>
              </div>

              <div class="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
                <div class="text-xs uppercase tracking-[0.18em] text-slate-400">Folder</div>
                <div class="mt-2 break-all text-sm font-medium text-slate-900 dark:text-white">{{ taggingPreview.targetPath || targetPath }}</div>
              </div>

              <div
                class="rounded-3xl border p-4 text-sm"
                :class="
                  taggingPreview.isLaunching
                    ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                    : taggingPreview.hasLaunched
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400'
                "
              >
                <div class="font-semibold">
                  {{
                    taggingPreview.isLaunching
                      ? '正在启动 MusicTag…'
                      : taggingPreview.hasLaunched
                      ? 'MusicTag 已启动'
                      : '等待启动 MusicTag'
                  }}
                </div>
                <p class="mt-2 leading-7">
                  {{
                    taggingPreview.hasLaunched
                      ? '在外部工具中完成标签修正后，回到左侧点击继续下一步。'
                      : '启动后请在 MusicTag 中导入目标文件夹并完成标签编辑。'
                  }}
                </p>
              </div>
            </div>
          </template>

          <template v-else-if="currentView === 'rename'">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold text-slate-900 dark:text-white">实时预览</h3>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">模板变化和扫描结果会同步显示在这里。</p>
              </div>
              <div class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                {{ renamePreview.items.length }} 项
              </div>
            </div>

            <div class="mt-5 space-y-4">
              <div class="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
                <div class="text-xs uppercase tracking-[0.18em] text-slate-400">Template</div>
                <div class="mt-2 font-mono text-sm font-medium text-slate-900 dark:text-white">{{ renamePreview.template }}</div>
                <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {{ renamePreview.skippedCount > 0 ? `当前有 ${renamePreview.skippedCount} 项会被跳过。` : '当前模板将用于本次批量重命名。' }}
                </p>
              </div>

              <div
                v-if="renamePreview.isScanning"
                class="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-6 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
              >
                正在生成重命名预览，请稍候…
              </div>

              <div
                v-else-if="!renamePreview.hasScanned"
                class="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-6 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
              >
                左侧调整模板后点击“扫描并预览”，这里会展示最终命名结果。
              </div>

              <div
                v-else-if="renamePreview.items.length === 0"
                class="rounded-3xl border border-amber-200/80 bg-amber-50/80 p-6 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
              >
                暂时没有可重命名的文件，请确认歌曲已经写入标签信息。
              </div>

              <div
                v-else
                class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 dark:border-white/10 dark:bg-black/20"
              >
                <div class="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-white/5 dark:text-white">
                  重命名预览
                </div>
                <div class="max-h-[420px] overflow-y-auto">
                  <div
                    v-for="item in renamePreview.items"
                    :key="`${item.originalName}-${item.newName}`"
                    class="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 dark:border-white/5"
                  >
                    <div class="truncate text-slate-500 dark:text-slate-400">{{ item.originalName }}</div>
                    <div class="text-center text-slate-300">→</div>
                    <div class="truncate font-medium text-slate-900 dark:text-white">{{ item.newName }}</div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="currentView === 'refresh'">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold text-slate-900 dark:text-white">实时预览</h3>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">这里显示刷新进度和最终完成状态。</p>
              </div>
              <div
                class="rounded-full px-3 py-1 text-xs font-medium"
                :class="
                  refreshPreview.refreshed
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                "
              >
                {{ refreshPreview.refreshed ? '已完成' : '待刷新' }}
              </div>
            </div>

            <div class="mt-5 space-y-4">
              <div class="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
                <div class="text-xs uppercase tracking-[0.18em] text-slate-400">Folder</div>
                <div class="mt-2 break-all text-sm font-medium text-slate-900 dark:text-white">{{ refreshPreview.targetPath || targetPath }}</div>
              </div>

              <div
                class="rounded-3xl border p-5 text-sm"
                :class="
                  refreshPreview.isRefreshing
                    ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                    : refreshPreview.refreshed
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
                "
              >
                <div class="font-semibold">
                  {{
                    refreshPreview.isRefreshing
                      ? '正在刷新音乐库…'
                      : refreshPreview.refreshed
                      ? '音乐库已经更新'
                      : '等待执行最后一步'
                  }}
                </div>
                <p class="mt-2 leading-7">
                  {{
                    refreshPreview.refreshed
                      ? '当前流程已经完成，你可以直接开始处理下一批文件。'
                      : '点击左侧刷新按钮后，这里会显示最终完成状态。'
                  }}
                </p>
              </div>
            </div>
          </template>
        </section>
      </aside>
    </div>
  </div>
</template>
