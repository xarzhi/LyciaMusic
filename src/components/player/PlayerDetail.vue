<script setup lang="ts">
import { computed } from 'vue';
import { usePlayer } from '../../composables/player';
import { useSharedTransition } from '../../composables/useSharedTransition';
import { useLyrics } from '../../composables/lyrics';
import { getCurrentWindow } from '@tauri-apps/api/window'; 
import LyricsView from './LyricsView.vue';
import QueueList from './QueueList.vue';
import PlayerDetailBackground from './PlayerDetailBackground.vue';
import PlayerDetailLeft from './PlayerDetailLeft.vue';

const { 
  showPlayerDetail, showQueue, currentSong
} = usePlayer();

const { parsedLyrics } = useLyrics();

const { staggerPhase } = useSharedTransition();

// --- 窗口控制 ---
const appWindow = getCurrentWindow();
const minimize = () => appWindow.minimize();
const toggleMaximize = async () => { const isMax = await appWindow.isMaximized(); isMax ? appWindow.unmaximize() : appWindow.maximize(); };
const closeApp = () => appWindow.close();

// --- 配角过渡样式工具 ---
const staggerStyle = (phase: number, translateDir: 'Y' | 'X' = 'Y', distance = 20) => {
  const visible = showPlayerDetail.value || staggerPhase.value >= phase;
  const translate = translateDir === 'Y' ? `translateY(${distance}px)` : `translateX(${distance}px)`;
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translate(0, 0)' : translate,
    transition: `opacity 400ms cubic-bezier(0.34,1.56,0.64,1) ${showPlayerDetail.value ? phase * 100 : 0}ms, transform 400ms cubic-bezier(0.34,1.56,0.64,1) ${showPlayerDetail.value ? phase * 100 : 0}ms`,
  };
};

// --- CSS 过渡驱动，不再依赖 JS FLIP 生命周期 ---
const handleClose = () => {
  showPlayerDetail.value = false;
};

// 计算无歌词时的 Meta Info
const metaInfo = computed(() => {
  if (!currentSong.value) return [];
  const s = currentSong.value;
  return [
    { label: '歌手', value: s.artist },
    { label: '专辑', value: s.album },
    { label: '品质', value: s.bitrate ? `${s.sample_rate}Hz / ${s.bitrate}kbps` : 'Standard' },
    s.genre ? { label: '流派', value: s.genre } : null,
    s.year ? { label: '年份', value: s.year } : null,
  ].filter(item => item !== null && item.value) as {label: string, value: string}[];
});
</script>

<template>
  <div 
    class="fixed inset-x-0 bottom-0 z-[50] overflow-visible flex flex-col font-sans select-none text-white transition-all duration-700 cubic-bezier(0.34,1.56,0.64,1)"
    :class="showPlayerDetail ? 'h-[100vh]' : 'h-20 pointer-events-none'"
  >
    <div class="relative w-full h-[100vh] flex flex-col pt-[calc(100vh-100%)]">
      
      <!-- 沉浸式背景层 -->
      <div class="absolute inset-0 transition-opacity duration-700" :style="{ opacity: showPlayerDetail ? 1 : 0 }">
        <PlayerDetailBackground :bgOpacity="1" />
        <div class="absolute inset-0 bg-[#0a0a0a] z-[-1]"></div>
      </div>

      <!-- 顶栏 (h-14) -->
      <div 
        class="relative z-[60] h-14 flex items-center justify-between px-6"
        :style="staggerStyle(1, 'Y', -10)"
      >
        <div class="absolute inset-0" data-tauri-drag-region></div>

        <div class="flex items-center w-1/4 relative z-10">
          <button @click="handleClose" class="p-2 hover:bg-white/10 rounded-lg transition text-white/50 hover:text-white" title="收起详情页">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
        </div>

        <div class="flex-1 flex justify-center text-sm font-medium text-white/80 truncate px-4 pointer-events-none drop-shadow-md">
          {{ currentSong?.title || currentSong?.name }} <span v-if="currentSong?.artist" class="opacity-60 mx-1">-</span> <span class="opacity-60">{{ currentSong?.artist }}</span>
        </div>

        <div class="flex items-center justify-end w-1/4 gap-2 relative z-10">
          <button @click="minimize" class="p-2 hover:bg-white/10 rounded-lg transition text-white/50 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14" /></svg></button>
          <button @click="toggleMaximize" class="p-2 hover:bg-white/10 rounded-lg transition text-white/50 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg></button>
          <button @click="closeApp" class="p-2 hover:bg-red-500 rounded-lg transition text-white/50 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
        </div>
      </div>

      <!-- top bar 下方：绝对定位的封面，跨越整个滑动容器 -->
      <PlayerDetailLeft :isExpanded="showPlayerDetail" />

      <!-- 主内容区域 (歌词/信息居右，左侧留空给绝对定位的封面) -->
      <div class="relative z-50 flex-1 flex min-h-0 px-8 pb-20">
        <!-- 左侧留白占位 -->
        <div class="w-1/2 min-w-[300px] h-full pointer-events-none"></div>

        <!-- 右侧歌词 / 元信息 -->
        <div 
          class="flex-1 h-full flex flex-col justify-center max-w-[600px] pr-8 pl-4 py-8"
          :style="staggerStyle(2, 'X', 20)"
        >
          <transition name="fade-scale" mode="out-in">
            <!-- 队列列表 -->
            <QueueList v-if="showQueue" class="h-full rounded-2xl bg-black/10 backdrop-blur-sm border border-white/5 shadow-xl p-4" />
            
            <!-- 有歌词时 -->
            <LyricsView v-else-if="parsedLyrics.length > 0" class="h-full" />
            
            <!-- 无歌词时显示大号元数据 -->
            <div v-else class="flex flex-col items-center justify-center h-full opacity-80" style="text-shadow: 0 2px 10px rgba(0,0,0,0.4);">
              <div v-for="(info, index) in metaInfo" :key="index" class="flex items-center text-xl sm:text-2xl font-medium mb-4 tracking-wider">
                <span class="text-white/40 mr-4">{{ info.label }}</span>
                <span class="text-white drop-shadow-md">{{ info.value }}</span>
              </div>
            </div>
          </transition>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.97) translateY(10px);
}
.text-shadow-sm {
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}
</style>