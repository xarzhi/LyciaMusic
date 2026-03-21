<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { usePlayer } from './composables/player';
import { useLibraryCollections } from './composables/useLibraryCollections';
import { useAppThemeSync } from './composables/useAppThemeSync';
import { useExternalPathBridge } from './composables/useExternalPathBridge';
import { useAppShellTheme } from './composables/useAppShellTheme';
import { useMiniModeWindow } from './composables/useMiniModeWindow';
import Sidebar from './components/layout/Sidebar.vue';
import TitleBar from './components/layout/TitleBar.vue';
import PlayerFooter from './components/layout/PlayerFooter.vue';
import GlobalBackground from './components/layout/GlobalBackground.vue';

const PlayQueueSidebar = defineAsyncComponent(() => import('./components/player/PlayQueueSidebar.vue'));
const PlayerDetail = defineAsyncComponent(() => import('./components/player/PlayerDetail.vue'));
const AddToPlaylistModal = defineAsyncComponent(() => import('./components/overlays/AddToPlaylistModal.vue'));
const Toast = defineAsyncComponent(() => import('./components/common/Toast.vue'));
const MiniPlayer = defineAsyncComponent(() => import('./components/layout/MiniPlayer.vue'));

const {
  init,
  playQueue,
  isMiniMode,
  showPlayerDetail,
  showMiniPlaylist,
  showPlaylist,
  closeMiniPlaylist,
  showVolumePopover,
  handleExternalPaths,
  libraryScanProgress,
} = usePlayer();
const {
  showAddToPlaylistModal,
  playlistAddTargetSongs,
  addSongsToPlaylist,
} = useLibraryCollections();

const { hasWindowMaterial, isMicaWindowMaterial, syncWindowMaterial } = useAppThemeSync();
const { mainBlurStyle, mainContainerClass } = useAppShellTheme({
  showPlayerDetail,
  hasWindowMaterial,
  isMicaWindowMaterial,
});
const { isExternalDragActive } = useExternalPathBridge({ handleExternalPaths });

useMiniModeWindow({
  isMiniMode,
  showMiniPlaylist,
  showVolumePopover,
  showPlaylist,
  closeMiniPlaylist,
  syncWindowMaterial,
});

init();

const isFooterVisible = computed(() => playQueue.value.length > 0);
const libraryScanPercent = computed(() => {
  if (!libraryScanProgress.value) return 0;
  if (libraryScanProgress.value.total <= 0) return 8;
  const percent = (libraryScanProgress.value.current / libraryScanProgress.value.total) * 100;
  return Math.min(100, Math.max(6, percent));
});
const libraryScanPhaseLabel = computed(() => {
  switch (libraryScanProgress.value?.phase) {
    case 'collecting':
      return '扫描文件';
    case 'parsing':
      return '解析元数据';
    case 'writing':
      return '写入音乐库';
    case 'complete':
      return '扫描完成';
    case 'error':
      return '扫描失败';
    default:
      return '扫描音乐库';
  }
});
const libraryScanFolderLabel = computed(() => {
  if (!libraryScanProgress.value || libraryScanProgress.value.folder_total <= 1) {
    return '';
  }

  return `文件夹 ${libraryScanProgress.value.folder_index}/${libraryScanProgress.value.folder_total}`;
});

const handleGlobalAdd = (playlistId: string) => {
  addSongsToPlaylist(playlistId, playlistAddTargetSongs.value);
  showAddToPlaylistModal.value = false;
};
</script>

<template>
  <div
    class="flex flex-col h-screen w-full text-gray-800 dark:text-gray-200 relative overflow-hidden font-sans"
    :class="{ 'bg-transparent border-0': isMiniMode }"
    :style="{ backgroundColor: isMiniMode ? 'transparent' : '' }"
  >
    <transition name="window-restore">
      <GlobalBackground v-if="!isMiniMode" />
    </transition>

    <transition name="drop-overlay">
      <div
        v-if="isExternalDragActive && !isMiniMode"
        class="absolute inset-0 z-[140] pointer-events-none flex items-center justify-center bg-black/15 backdrop-blur-sm"
      >
        <div class="rounded-[28px] border border-white/35 bg-white/75 px-8 py-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.2)] dark:border-white/10 dark:bg-black/65">
          <div class="text-lg font-semibold text-gray-900 dark:text-white">松开即可导入或播放</div>
          <div class="mt-2 text-sm text-gray-600 dark:text-white/70">音频文件将直接播放，文件夹将导入音乐库</div>
        </div>
      </div>
    </transition>

    <transition name="scan-progress">
      <div
        v-if="libraryScanProgress && !isMiniMode"
        class="hidden absolute right-4 top-14 z-[145] w-[320px] overflow-hidden rounded-[22px] border border-white/45 bg-white/82 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-black/70"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#ec4141]/80">
              {{ libraryScanPhaseLabel }}
            </div>
            <div class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
              {{ libraryScanProgress.message || '正在处理音乐库' }}
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-white/55">
              <span v-if="libraryScanFolderLabel">{{ libraryScanFolderLabel }}</span>
              <span v-if="libraryScanProgress.total > 0">
                {{ libraryScanProgress.current }}/{{ libraryScanProgress.total }}
              </span>
              <span class="truncate max-w-[220px]" :title="libraryScanProgress.folder_path">
                {{ libraryScanProgress.folder_path }}
              </span>
            </div>
          </div>
          <div
            class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
            :class="libraryScanProgress.failed ? 'bg-rose-500' : libraryScanProgress.done ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'"
          ></div>
        </div>

        <div class="mt-3 h-2 overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
          <div
            class="h-full rounded-full bg-gradient-to-r from-[#ec4141] via-[#ff8364] to-[#f7b267] transition-[width] duration-300 ease-out"
            :class="{ 'scan-progress-bar-indeterminate': libraryScanProgress.total <= 0 && !libraryScanProgress.done }"
            :style="{ width: `${libraryScanPercent}%` }"
          ></div>
        </div>
      </div>
    </transition>

    <MiniPlayer v-if="isMiniMode" />

    <transition name="window-restore">
      <div
        v-if="!isMiniMode"
        class="flex-1 flex overflow-hidden relative z-10 transition-colors duration-500"
        :class="mainContainerClass"
        :style="{ backdropFilter: mainBlurStyle }"
      >
        <Sidebar />

        <div class="flex-1 flex flex-col min-w-0">
          <TitleBar />
          <main class="flex-1 overflow-hidden relative min-h-0">
            <router-view v-slot="{ Component, route }">
              <transition name="page-fade" mode="out-in">
                <component
                  v-if="!route.meta.keepAlive"
                  :is="Component"
                  :key="route.path"
                />
                <KeepAlive v-else include="Home">
                  <component
                    :is="Component"
                    :key="String(route.name ?? route.path)"
                  />
                </KeepAlive>
              </transition>
            </router-view>
          </main>
        </div>
      </div>
    </transition>

    <div v-if="!isMiniMode && isFooterVisible" class="relative z-[60]">
      <!-- Player Detail (鍨簳婊戝姩灞? -->
      <PlayerDetail />
      
      <!-- Player Footer (鎮诞瑕嗙洊灞? -->
      <transition name="footer-slide">
        <PlayerFooter />
      </transition>
    </div>

    <PlayQueueSidebar v-if="!isMiniMode" />

    <AddToPlaylistModal
      v-if="!isMiniMode"
      :visible="showAddToPlaylistModal"
      :selectedCount="playlistAddTargetSongs.length"
      @close="showAddToPlaylistModal = false"
      @add="handleGlobalAdd"
    />

    <Toast />
  </div>
</template>

<style>
body.mini-mode-active,
html.mini-mode-active,
#app.mini-mode-active {
  background-color: transparent !important;
  background: transparent !important;
  border-width: 0 !important;
  outline: none !important;
  border-style: none !important;
  box-shadow: none !important;
}

.mini-mode-active * {
  border-color: transparent !important;
  box-shadow: none !important;
}


.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.footer-slide-enter-active,
.footer-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.footer-slide-enter-from,
.footer-slide-leave-to {
  transform: translateY(100%);
  max-height: 0 !important;
  opacity: 0;
}

.footer-slide-enter-to,
.footer-slide-leave-from {
  transform: translateY(0);
  max-height: 80px !important;
  opacity: 1;
}

/* 绐楀彛杩樺師杩囨浮鍔ㄧ敾 */
.window-restore-enter-active {
  transition: opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.window-restore-leave-active {
  transition: none;
}

.window-restore-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.window-restore-leave-to {
  opacity: 0;
}

.drop-overlay-enter-active,
.drop-overlay-leave-active {
  transition: opacity 0.18s ease;
}

.drop-overlay-enter-from,
.drop-overlay-leave-to {
  opacity: 0;
}

.scan-progress-enter-active,
.scan-progress-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.scan-progress-enter-from,
.scan-progress-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}

.scan-progress-bar-indeterminate {
  min-width: 28%;
  animation: scan-progress-indeterminate 1.1s ease-in-out infinite alternate;
}

@keyframes scan-progress-indeterminate {
  from {
    transform: translateX(-14%);
  }

  to {
    transform: translateX(14%);
  }
}
</style>
