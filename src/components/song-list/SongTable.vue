<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { dragSession } from '../../composables/dragState';
import type { Song } from '../../types';
import { useLibraryCollections } from '../../features/collections/useLibraryCollections';
import { useSettings } from '../../features/settings/useSettings';
import { useRoute, useRouter } from 'vue-router';
import QualityBadge from '../common/QualityBadge.vue';
import { INDEX_KEYS } from '../../utils/alphabetIndex';
import { useCoverCache } from '../../composables/useCoverCache';
import { useHomeNavigation } from '../../composables/useHomeNavigation';
import { useLibraryRuntimeActions } from '../../features/library/useLibraryRuntimeActions';
import { usePlaybackController } from '../../features/playback/usePlaybackController';
import { usePlayerLibraryView } from '../../features/library/usePlayerLibraryView';
import { usePlayerViewState } from '../../composables/usePlayerViewState';
import { useSongTableAlphabetIndex } from '../../composables/useSongTableAlphabetIndex';
import { useSongTableLibraryState } from '../../features/library/useSongTableLibraryState';
import { useLibraryStore } from '../../features/library/store';

const { settings } = useSettings();
const libraryStore = useLibraryStore();
const { libraryScanProgress, lastLibraryScanError } = storeToRefs(libraryStore);
const { currentSong, isPlaying, formatDuration } = usePlaybackController();

const props = defineProps<{
  songs: Song[];
  isBatchMode: boolean;
  selectedPaths: Set<string>;
}>();

const emit = defineEmits<{
  (e: 'play', song: Song): void;
  (e: 'contextmenu', event: MouseEvent, song: Song): void;
  (e: 'update:selectedPaths', newSet: Set<string>): void;
  (e: 'drag-start', payload: { event: MouseEvent; song: Song; index: number }): void;
}>();

const {
  currentViewMode,
  localSortMode,
  folderSortMode,
  activeRootPath,
  currentFolderFilter,
} = usePlayerViewState();
const {
  folderTree,
  searchQuery,
  librarySongs,
} = usePlayerLibraryView();
const {
  addLibraryFolder,
  scanLibrary,
  refreshFolder,
  expandFolderPath,
} = useLibraryRuntimeActions();
const { isFavorite, toggleFavorite } = useLibraryCollections();
const router = useRouter();
const route = useRoute();
const { openHomeArtist } = useHomeNavigation(router);
const { coverCache, preloadCovers } = useCoverCache();

const ROW_HEIGHT = 72;
const OVERSCAN = 20;
const rootRef = ref<HTMLElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(600);

const updateContainerHeight = () => {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight;
  }
};

const virtualData = computed(() => {
  const total = props.songs.length;
  const start = Math.floor(scrollTop.value / ROW_HEIGHT);
  const visibleCount = Math.ceil(containerHeight.value / ROW_HEIGHT);
  const renderStart = Math.max(0, start - OVERSCAN);
  const renderEnd = Math.min(total, start + visibleCount + OVERSCAN);

  return {
    items: props.songs.slice(renderStart, renderEnd).map((song, index) => ({
      ...song,
      virtualIndex: renderStart + index,
    })),
    paddingTop: renderStart * ROW_HEIGHT,
    paddingBottom: (total - renderEnd) * ROW_HEIGHT,
  };
});

const onScroll = (event: Event) => {
  scrollTop.value = (event.target as HTMLElement).scrollTop;
};

const {
  showAlphabetIndex,
  activeIndexKey,
  indexBarRef,
  isIndexDragging,
  dragIndexKey,
  hoverIndexKey,
  isIndexBarVisible,
  canLocateCurrentSong,
  handleIndexHotspotEnter,
  handleIndexHotspotMove,
  handleIndexHotspotLeave,
  handleRootMouseMove,
  handleRootMouseLeave,
  handleIndexPointerDown,
  showIndexBar,
  scrollToCurrentSong,
} = useSongTableAlphabetIndex({
  songs: computed(() => props.songs),
  scrollTop,
  containerRef,
  rootRef,
  routePath: computed(() => route.path),
  currentViewMode,
  localSortMode,
  folderSortMode,
  activeRootPath,
  currentFolderFilter,
  folderTree,
  refreshFolder,
  expandFolderPath,
});

watch(
  () => virtualData.value.items,
  newItems => preloadCovers(newItems.map(song => song.path)),
  { immediate: true },
);

const handleMouseDown = (event: MouseEvent, song: Song, index: number) => {
  if (event.button !== 0) {
    return;
  }
  emit('drag-start', { event, song, index });
};

const showDragIcon = computed(() =>
  ['folder', 'playlist', 'all', 'artist', 'album', 'genre', 'year'].includes(currentViewMode.value),
);
const {
  showHeroScanCard,
  hasSearchQuery,
  showLibraryOnboarding,
  showFolderEmpty,
  showLibraryChecking,
  showLibraryEmptyResult,
  libraryScanPercent,
  libraryScanPhaseLabel,
  libraryScanFolderLabel,
  heroScanStatus,
  emptyStateMessage,
  retryHeroLibraryScan,
} = useSongTableLibraryState({
  currentViewMode,
  searchQuery,
  librarySongs,
  addLibraryFolder,
  scanLibrary,
});

const getClickableArtistNames = (song: Song) =>
  (Array.isArray(song.artist_names) && song.artist_names.length > 0 ? song.artist_names : [song.artist]).filter(Boolean);

const handleArtistClick = (artistName: string) => {
  void openHomeArtist(artistName);
};

onMounted(() => {
  window.addEventListener('resize', updateContainerHeight);
  if (containerRef.value) {
    updateContainerHeight();
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', updateContainerHeight);
});

defineExpose({ containerRef });

const getRowStyle = (songIndex: number, songPath: string) => {
  const baseStyle: Record<string, string | number> = { height: `${ROW_HEIGHT}px` };

  if (!dragSession.active || dragSession.insertIndex === -1) {
    return baseStyle;
  }

  const dragSourcePath = dragSession.songs[0]?.path;
  const dragIndex = props.songs.findIndex(song => song.path === dragSourcePath);
  const targetIndex = dragSession.insertIndex;

  if (songPath === dragSourcePath) {
    const diff = targetIndex - dragIndex;
    return {
      ...baseStyle,
      transform: `translateY(${diff * 100}%)`,
      transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
      opacity: 0,
      zIndex: 0,
    };
  }

  let translateY = 0;

  if (targetIndex > dragIndex) {
    if (songIndex > dragIndex && songIndex <= targetIndex) {
      translateY = -100;
    }
  } else if (targetIndex < dragIndex) {
    if (songIndex >= targetIndex && songIndex < dragIndex) {
      translateY = 100;
    }
  }

  if (translateY !== 0) {
    return {
      ...baseStyle,
      transform: `translateY(${translateY}%)`,
      transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
      zIndex: 1,
    };
  }

  return {
    ...baseStyle,
    transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
  };
};
</script>

<template>
  <div
    ref="rootRef"
    class="flex-1 min-h-0 min-w-0 relative overflow-x-hidden"
    @mousemove="handleRootMouseMove"
    @mouseleave="handleRootMouseLeave"
  >
    <div
      ref="containerRef"
      class="h-full overflow-y-auto overflow-x-hidden pl-2.5 pb-8 custom-scrollbar song-list-scroll-container"
      @scroll="onScroll"
    >
      <div class="w-full relative">
        <div :style="{ height: virtualData.paddingTop + 'px' }"></div>

        <div
          v-for="song in virtualData.items"
          :key="song.path"
          :data-index="song.virtualIndex"
          @mousedown="handleMouseDown($event, song, song.virtualIndex)"
          @dblclick="!isBatchMode && emit('play', song)"
          @contextmenu.prevent="emit('contextmenu', $event, song)"
          @dragstart.prevent
          class="group w-full min-w-0 border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 select-none cursor-default relative flex items-center px-2 gap-3"
          :class="{ 'bg-red-500/10 dark:bg-red-500/20': selectedPaths.has(song.path) }"
          :style="getRowStyle(song.virtualIndex, song.path)"
        >
          <div class="w-10 shrink-0 flex items-center justify-center">
            <div v-if="isBatchMode" class="flex items-center justify-center">
              <input type="checkbox" :checked="selectedPaths.has(song.path)" class="rounded text-[#EC4141] focus:ring-[#EC4141] pointer-events-none" />
            </div>
            <div v-else-if="currentSong?.path === song.path && isPlaying" class="flex items-center justify-center gap-[3px] w-5 h-5">
              <span class="spectrum-bar w-[3px] rounded-full bg-[#EC4141]" style="animation-delay: 0s"></span>
              <span class="spectrum-bar w-[3px] rounded-full bg-[#EC4141]" style="animation-delay: 0.2s"></span>
              <span class="spectrum-bar w-[3px] rounded-full bg-[#EC4141]" style="animation-delay: 0.4s"></span>
            </div>
            <div v-else-if="currentSong?.path === song.path && !isPlaying" class="flex items-center justify-center gap-[3px] w-5 h-5">
              <span class="w-[3px] h-[6px] rounded-full bg-[#EC4141]/60"></span>
              <span class="w-[3px] h-[10px] rounded-full bg-[#EC4141]/60"></span>
              <span class="w-[3px] h-[4px] rounded-full bg-[#EC4141]/60"></span>
            </div>
            <div v-else class="relative flex items-center justify-center w-5 h-5">
              <span class="absolute inset-0 flex items-center justify-center text-xs font-mono text-gray-400 dark:text-white/40 transition-opacity duration-150 group-hover:opacity-0">
                {{ song.virtualIndex + 1 < 10 ? '0' + (song.virtualIndex + 1) : song.virtualIndex + 1 }}
              </span>
              <div class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <span v-if="showDragIcon" class="text-gray-500 dark:text-white/60 active:text-[#EC4141] cursor-grab">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </span>
                <span v-else class="text-gray-500 dark:text-white/60">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
                  </svg>
                </span>
              </div>
            </div>
          </div>

          <div class="w-12 h-12 rounded-lg bg-gray-200/50 dark:bg-white/5 flex items-center justify-center shrink-0 overflow-hidden text-gray-400 dark:text-white/40 relative border border-black/5 dark:border-white/5">
            <img v-if="coverCache.get(song.path)" :src="coverCache.get(song.path)" class="w-full h-full object-cover transition-opacity duration-300" alt="Cover" />
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 opacity-40 absolute inset-0 m-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>

          <div class="flex-[0_1_40%] min-w-0 flex flex-col justify-center gap-0.5">
            <span class="text-[15px] text-gray-900 dark:text-gray-100 font-semibold truncate leading-snug">{{ song.title || song.name.replace(/\.[^/.]+$/, '') }}</span>
            <div class="flex items-center gap-1.5 text-xs text-gray-900 dark:text-gray-100 leading-snug">
              <QualityBadge
                v-if="settings.showQualityBadges"
                class="shrink-0"
                :bitrate="song.bitrate || 0"
                :sample-rate="song.sample_rate || 0"
                :bit-depth="song.bit_depth || 0"
                :format="song.format || ''"
                :codec="song.codec || ''"
                :container="song.container || ''"
              />
              <span v-if="currentViewMode === 'album'" class="truncate flex items-center gap-1 flex-wrap" :title="song.artist">
                <template v-for="(artistName, artistIndex) in getClickableArtistNames(song)" :key="`${song.path}-${artistName}`">
                  <button type="button" class="truncate hover:text-[#EC4141] transition-colors" @click.stop="handleArtistClick(artistName)">
                    {{ artistName }}
                  </button>
                  <span v-if="artistIndex < getClickableArtistNames(song).length - 1" class="opacity-60">/</span>
                </template>
              </span>
              <span v-else class="truncate">{{ song.artist }}</span>
            </div>
          </div>

          <div class="flex-1 min-w-0 truncate text-xs text-gray-900 dark:text-gray-100">
            {{ song.album }}
          </div>

          <div class="shrink-0 flex items-center gap-3 text-xs font-mono text-gray-900 dark:text-gray-100" :class="{ 'opacity-20 pointer-events-none': dragSession.active }">
            <button v-if="!isBatchMode" @click.stop="toggleFavorite(song)" class="focus:outline-none">
              <svg v-if="isFavorite(song)" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-[#EC4141]" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" /></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white opacity-0 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            </button>
            <span class="w-10 text-right">{{ formatDuration(song.duration) }}</span>
          </div>
        </div>

        <div :style="{ height: virtualData.paddingBottom + 'px' }"></div>
      </div>

      <div v-if="songs.length === 0" class="py-20 flex flex-col justify-center items-center select-none text-gray-500 dark:text-white/60">
        <template v-if="showLibraryOnboarding || showFolderEmpty || hasSearchQuery">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 mb-4 text-gray-300 dark:text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
          <p class="mb-6 text-[15px]">{{ showLibraryOnboarding ? '音乐库空空如也，快去添加你的本地音乐吧' : emptyStateMessage }}</p>
          <button v-if="showLibraryOnboarding" @click="addLibraryFolder" class="flex items-center gap-2 px-6 py-2.5 bg-[#EC4141] text-white hover:bg-[#d73a3a] rounded-full text-[14px] font-medium transition-colors shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            添加本地音乐
          </button>
        </template>
        <template v-else-if="showLibraryChecking">
          <div class="flex h-14 w-14 items-center justify-center rounded-full bg-white/70 shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:bg-white/10">
            <div class="h-6 w-6 rounded-full border-2 border-[#ec4141]/25 border-t-[#ec4141] scan-spinner"></div>
          </div>
          <p class="mt-5 text-[15px] font-medium text-gray-700 dark:text-white/80">正在检查你的音乐库…</p>
          <p class="mt-2 text-[13px] opacity-70">启动后会在后台快速核对目录变化，不会打断当前浏览。</p>
        </template>
        <template v-else-if="showLibraryEmptyResult">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 mb-4 text-gray-300 dark:text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 17V7a2 2 0 012-2h12a2 2 0 012 2v10"></path>
            <path d="M8 17h8"></path>
            <path d="M9 13V8l8-1v6"></path>
            <circle cx="7" cy="17" r="2"></circle>
            <circle cx="17" cy="15" r="2"></circle>
          </svg>
          <p class="mb-2 text-[15px]">{{ lastLibraryScanError ? '暂时无法读取你的音乐库' : '未在当前音乐库中发现可导入音频' }}</p>
          <p class="text-[13px] opacity-70">
            {{ lastLibraryScanError ? '你可以前往设置中的音乐库页重新扫描，或检查目录是否仍然可访问。' : '可以尝试重新选择文件夹，或确认目录中包含受支持的音频文件。' }}
          </p>
        </template>
        <template v-else-if="currentViewMode === 'playlist'">
          <p>{{ emptyStateMessage }}</p>
        </template>
        <template v-else>
          <p>{{ emptyStateMessage }}</p>
        </template>
      </div>
    </div>

    <transition name="library-hero">
      <div
        v-if="showHeroScanCard"
        class="absolute inset-0 z-30 flex items-center justify-center px-6"
      >
        <div class="absolute inset-0 bg-white/72 backdrop-blur-md dark:bg-black/45"></div>
        <div class="relative z-10 w-full max-w-[560px] overflow-hidden rounded-[32px] border border-white/60 bg-white/88 p-7 text-gray-800 shadow-[0_28px_80px_rgba(15,23,42,0.16)] backdrop-blur-2xl dark:border-white/10 dark:bg-black/70 dark:text-white">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#ec4141]/80">
                {{ libraryScanPhaseLabel }}
              </div>
              <h3 class="mt-3 text-[28px] font-semibold leading-tight">
                {{ heroScanStatus === 'error' ? '导入过程中出现问题' : heroScanStatus === 'success' ? '音乐库已经准备好了' : '正在导入你的音乐' }}
              </h3>
              <p class="mt-3 max-w-[420px] text-[14px] leading-6 text-gray-500 dark:text-white/65">
                {{
                  heroScanStatus === 'error'
                    ? (lastLibraryScanError || '你可以重新扫描当前目录，或重新选择一个可访问的音乐文件夹。')
                    : heroScanStatus === 'success'
                      ? (librarySongs.length > 0 ? '已经完成首次建立音乐库，马上就可以开始浏览和播放。' : '这次扫描没有发现可导入的音频文件。')
                      : '首次建立音乐库时会读取文件信息并写入数据库，通常只需要几十秒。'
                }}
              </p>
            </div>
            <div
              class="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              :class="heroScanStatus === 'error' ? 'bg-rose-500/12 text-rose-500' : heroScanStatus === 'success' ? 'bg-emerald-500/12 text-emerald-500' : 'bg-[#ec4141]/10 text-[#ec4141]'"
            >
              <svg v-if="heroScanStatus === 'success'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else-if="heroScanStatus === 'error'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.65 18h16.7a1 1 0 00.86-1.5l-7.5-13a1 1 0 00-1.72 0z" />
              </svg>
              <div v-else class="h-5 w-5 rounded-full border-2 border-current/25 border-t-current scan-spinner"></div>
            </div>
          </div>

          <div class="mt-6 overflow-hidden rounded-full bg-black/6 dark:bg-white/10">
            <div
              class="h-2.5 rounded-full bg-gradient-to-r from-[#ec4141] via-[#ff7b63] to-[#f7b267] transition-[width] duration-300 ease-out"
              :class="{ 'scan-progress-indeterminate': libraryScanProgress && libraryScanProgress.total <= 0 && heroScanStatus === 'scanning' }"
              :style="{ width: `${heroScanStatus === 'success' ? 100 : libraryScanPercent}%` }"
            ></div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-gray-500 dark:text-white/55">
            <span v-if="libraryScanFolderLabel">{{ libraryScanFolderLabel }}</span>
            <span v-if="libraryScanProgress && libraryScanProgress.total > 0">
              {{ libraryScanProgress.current }}/{{ libraryScanProgress.total }}
            </span>
            <span v-if="libraryScanProgress?.folder_path" class="truncate max-w-[280px]" :title="libraryScanProgress.folder_path">
              {{ libraryScanProgress.folder_path }}
            </span>
          </div>

          <div v-if="heroScanStatus === 'error'" class="mt-7 flex flex-wrap gap-3">
            <button type="button" class="hero-primary-btn" @click="retryHeroLibraryScan">重新扫描</button>
            <button type="button" class="hero-secondary-btn" @click="addLibraryFolder">重新选择文件夹</button>
          </div>
        </div>
      </div>
    </transition>

    <div
      v-if="showAlphabetIndex"
      class="absolute inset-y-0 right-0 z-20 flex items-center justify-end w-12 pr-1.5"
      @mouseenter="handleIndexHotspotEnter"
      @mousemove="handleIndexHotspotMove"
      @mouseleave="handleIndexHotspotLeave"
    >
      <div
        class="flex flex-col items-center gap-2 transition-all duration-300 ease-out"
        :class="isIndexBarVisible ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 translate-x-2 pointer-events-none'"
      >
        <div
          ref="indexBarRef"
          class="flex flex-col items-center gap-[1px] rounded-full bg-white px-1 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:bg-black"
        >
        <button
          v-for="key in INDEX_KEYS"
          :key="key"
          type="button"
          class="index-nav-item"
          :class="{
            'index-nav-item-active': activeIndexKey === key,
            'index-nav-item-hover': hoverIndexKey === key && activeIndexKey !== key && dragIndexKey !== key,
            'index-nav-item-drag': dragIndexKey === key && activeIndexKey !== key,
          }"
          @mouseenter="hoverIndexKey = key; showIndexBar()"
          @mouseleave="hoverIndexKey = null"
          @pointerdown="handleIndexPointerDown($event, key)"
          >
            {{ key }}
          </button>
        </div>

        <button
          type="button"
          class="index-locate-btn"
          :class="{ 'index-locate-btn-disabled': !canLocateCurrentSong }"
          :disabled="!canLocateCurrentSong"
          title="定位当前播放歌曲"
          @click="scrollToCurrentSong"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
            <circle cx="12" cy="12" r="3.25" stroke-width="1.8" />
          </svg>
        </button>
      </div>
    </div>

    <Teleport to="body">
      <transition name="index-bubble">
        <div v-if="isIndexDragging && dragIndexKey" class="fixed inset-0 z-[9998] pointer-events-none flex items-center justify-center">
          <div class="rounded-[28px] bg-black/72 px-7 py-5 text-5xl font-bold tracking-[0.12em] text-white shadow-2xl backdrop-blur-xl dark:bg-black/78">
            {{ dragIndexKey }}
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.song-list-scroll-container {
  overflow-anchor: none;
}

.spectrum-bar {
  animation: spectrum 1s ease-in-out infinite;
}

.scan-spinner {
  animation: scan-spin 0.9s linear infinite;
}

.hero-primary-btn,
.hero-secondary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 124px;
  border-radius: 9999px;
  padding: 0.8rem 1.2rem;
  font-size: 0.95rem;
  font-weight: 600;
  transition:
    transform 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.hero-primary-btn {
  background: #ec4141;
  color: white;
}

.hero-primary-btn:hover {
  transform: translateY(-1px);
  background: #d73a3a;
}

.hero-secondary-btn {
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: rgba(255, 255, 255, 0.7);
  color: rgb(31, 41, 55);
}

.hero-secondary-btn:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.92);
}

.index-nav-item {
  width: 1.05rem;
  height: 0.78rem;
  border-radius: 9999px;
  font-size: 0.58rem;
  line-height: 1;
  color: rgba(75, 85, 99, 0.85);
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.index-nav-item:hover {
  background: rgba(15, 23, 42, 0.08);
  color: rgb(17, 24, 39);
}

.index-nav-item-active {
  background: rgba(236, 65, 65, 0.18);
  color: #ec4141;
  transform: scale(1.06);
}

.index-nav-item-hover {
  background: rgba(15, 23, 42, 0.08);
  color: rgb(17, 24, 39);
}

.index-nav-item-drag {
  background: rgba(15, 23, 42, 0.12);
  color: rgb(17, 24, 39);
  transform: scale(1.04);
}

.index-locate-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 9999px;
  background: rgb(255, 255, 255);
  color: rgba(31, 41, 55, 0.88);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(10px);
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease,
    opacity 0.18s ease;
}

.index-locate-btn:hover {
  background: rgba(255, 255, 255, 0.68);
  color: #ec4141;
  transform: scale(1.05);
}

.index-locate-btn-disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

:global(.dark) .index-nav-item {
  color: rgba(255, 255, 255, 0.72);
}

:global(.dark) .index-nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.96);
}

:global(.dark) .index-nav-item-active {
  background: rgba(236, 65, 65, 0.24);
  color: #fda4af;
}

:global(.dark) .index-nav-item-hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.96);
}

:global(.dark) .index-nav-item-drag {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.98);
}

:global(.dark) .index-locate-btn {
  background: rgb(0, 0, 0);
  color: rgba(255, 255, 255, 0.86);
}

:global(.dark) .index-locate-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fda4af;
}

.index-bubble-enter-active,
.index-bubble-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.index-bubble-enter-from,
.index-bubble-leave-to {
  opacity: 0;
  transform: scale(0.92);
}

.library-hero-enter-active,
.library-hero-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.library-hero-enter-from,
.library-hero-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.scan-progress-indeterminate {
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

@keyframes scan-spin {
  to {
    transform: rotate(360deg);
  }
}

:global(.dark) .hero-secondary-btn {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
}

:global(.dark) .hero-secondary-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

@keyframes spectrum {
  0%, 100% { height: 4px; }
  25% { height: 14px; }
  50% { height: 6px; }
  75% { height: 12px; }
}
</style>
