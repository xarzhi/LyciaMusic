<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Song, usePlayer, dragSession } from '../../composables/player';
import { currentSong, isPlaying } from '../../composables/playerState';
import { useSettings } from '../../composables/settings';
import { useRoute, useRouter } from 'vue-router';
import QualityBadge from '../common/QualityBadge.vue';
import { INDEX_KEYS, getAlphabetIndexKey, type AlphabetIndexKey } from '../../utils/alphabetIndex';
import { useCoverCache } from '../../composables/useCoverCache';

const { settings } = useSettings();

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
  isFavorite,
  toggleFavorite,
  formatDuration,
  currentViewMode,
  viewArtist,
  addLibraryFolder,
  searchQuery,
  librarySongs,
  localSortMode,
  folderSortMode,
  activeRootPath,
  currentFolderFilter,
  folderTree,
  refreshFolder,
  expandFolderPath,
} = usePlayer();
const router = useRouter();
const route = useRoute();
const { coverCache, preloadCovers } = useCoverCache();

const ROW_HEIGHT = 72;
const OVERSCAN = 20;
const INDEX_PROXIMITY_PX = 72;
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

const indexLabelGetter = computed<((song: Song) => string) | null>(() => {
  if (currentViewMode.value === 'all' && ['default', 'title', 'name'].includes(localSortMode.value)) {
    return localSortMode.value === 'name'
      ? (song: Song) => song.name
      : (song: Song) => song.title || song.name;
  }

  if (currentViewMode.value === 'folder' && ['title', 'name'].includes(folderSortMode.value)) {
    return folderSortMode.value === 'name'
      ? (song: Song) => song.name
      : (song: Song) => song.title || song.name;
  }

  return null;
});

const showAlphabetIndex = computed(() => {
  const isHomeRoute = route.path === '/';
  return isHomeRoute && !!indexLabelGetter.value && props.songs.length > 0;
});

const firstSongIndexByKey = computed(() => {
  const keyMap = new Map<AlphabetIndexKey, number>();

  if (!indexLabelGetter.value) {
    return keyMap;
  }

  props.songs.forEach((song, index) => {
    const key = getAlphabetIndexKey(indexLabelGetter.value!(song));
    if (!keyMap.has(key)) {
      keyMap.set(key, index);
    }
  });

  return keyMap;
});

const activeIndexKey = computed<AlphabetIndexKey | null>(() => {
  if (!indexLabelGetter.value || props.songs.length === 0) {
    return null;
  }

  const visibleIndex = Math.min(
    props.songs.length - 1,
    Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT)),
  );

  return getAlphabetIndexKey(indexLabelGetter.value(props.songs[visibleIndex]));
});

const indexBarRef = ref<HTMLElement | null>(null);
const isIndexDragging = ref(false);
const dragIndexKey = ref<AlphabetIndexKey | null>(null);
const hoverIndexKey = ref<AlphabetIndexKey | null>(null);
const isIndexBarVisible = ref(false);
const INDEX_AUTO_HIDE_MS = 500;
let hideIndexBarTimer: ReturnType<typeof setTimeout> | null = null;

const currentSongIndex = computed(() => {
  if (!currentSong?.value?.path) {
    return -1;
  }

  return props.songs.findIndex(song => song.path === currentSong.value?.path);
});

const normalizePath = (path: string | null | undefined) =>
  (path || '').replace(/\\/g, '/').replace(/\/+$/, '');

const getParentFolderPath = (path: string) => path.replace(/[\\/][^\\/]+$/, '');

const findOwningRootPath = (targetPath: string) => {
  const normalizedTarget = normalizePath(targetPath);
  const rootPaths = folderTree.value
    .map(node => node.path)
    .filter(rootPath => {
      const normalizedRoot = normalizePath(rootPath);
      return (
        normalizedTarget === normalizedRoot ||
        normalizedTarget.startsWith(`${normalizedRoot}/`)
      );
    })
    .sort((left, right) => normalizePath(right).length - normalizePath(left).length);

  return rootPaths[0] || null;
};

const canLocateCurrentSong = computed(() => {
  if (!currentSong?.value?.path) {
    return false;
  }

  if (currentSongIndex.value >= 0) {
    return true;
  }

  if (currentViewMode.value !== 'folder') {
    return false;
  }

  const currentSongFolderPath = getParentFolderPath(currentSong.value.path);
  return !!findOwningRootPath(currentSongFolderPath);
});

const clearHideIndexBarTimer = () => {
  if (hideIndexBarTimer) {
    clearTimeout(hideIndexBarTimer);
    hideIndexBarTimer = null;
  }
};

const showIndexBar = () => {
  if (!showAlphabetIndex.value) {
    return;
  }

  clearHideIndexBarTimer();
  isIndexBarVisible.value = true;
};

const scheduleHideIndexBar = () => {
  clearHideIndexBarTimer();

  if (!showAlphabetIndex.value || isIndexDragging.value) {
    return;
  }

  hideIndexBarTimer = setTimeout(() => {
    if (!isIndexDragging.value) {
      isIndexBarVisible.value = false;
    }
  }, INDEX_AUTO_HIDE_MS);
};

const revealIndexBarTemporarily = () => {
  showIndexBar();
  scheduleHideIndexBar();
};

const scrollFolderTargetsIntoView = (folderPath: string, rootPath: string | null) => {
  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-folder-path]')).filter(
    element =>
      element.dataset.folderPath === folderPath ||
      (!!rootPath && element.dataset.folderPath === rootPath),
  );

  targets.forEach(element => {
    element.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    });
  });
};

const scrollToCurrentSong = async () => {
  if (!currentSong?.value?.path) {
    return;
  }

  showIndexBar();

  if (currentSongIndex.value >= 0) {
    if (currentViewMode.value === 'folder' && currentFolderFilter.value) {
      scrollFolderTargetsIntoView(currentFolderFilter.value, activeRootPath.value);
    }
    jumpToSongIndex(currentSongIndex.value);
    scheduleHideIndexBar();
    return;
  }

  if (currentViewMode.value !== 'folder') {
    scheduleHideIndexBar();
    return;
  }

  const targetFolderPath = getParentFolderPath(currentSong.value.path);
  const targetRootPath = findOwningRootPath(targetFolderPath);

  if (!targetRootPath) {
    scheduleHideIndexBar();
    return;
  }

  activeRootPath.value = targetRootPath;
  currentFolderFilter.value = targetFolderPath;
  expandFolderPath(targetFolderPath);
  await refreshFolder(targetFolderPath);
  await nextTick();
  requestAnimationFrame(() => {
    scrollFolderTargetsIntoView(targetFolderPath, targetRootPath);
  });

  const refreshedSongIndex = props.songs.findIndex(song => song.path === currentSong.value?.path);
  if (refreshedSongIndex >= 0) {
    jumpToSongIndex(refreshedSongIndex);
  }

  scheduleHideIndexBar();
};

const handleIndexHotspotEnter = () => {
  showIndexBar();
};

const handleIndexHotspotMove = () => {
  showIndexBar();
};

const handleIndexHotspotLeave = () => {
  scheduleHideIndexBar();
};

const handleRootMouseMove = (event: MouseEvent) => {
  if (!showAlphabetIndex.value || !rootRef.value) {
    return;
  }

  const rect = rootRef.value.getBoundingClientRect();
  const distanceToRight = rect.right - event.clientX;

  if (distanceToRight <= INDEX_PROXIMITY_PX) {
    revealIndexBarTemporarily();
  }
};

const handleRootMouseLeave = () => {
  scheduleHideIndexBar();
};

const jumpToSongIndex = (songIndex: number) => {
  if (!containerRef.value) {
    return;
  }

  const targetTop = songIndex * ROW_HEIGHT;
  containerRef.value.scrollTo({ top: targetTop, behavior: 'auto' });
  scrollTop.value = targetTop;
};

const resolveNearestIndexKey = (targetKey: AlphabetIndexKey) => {
  if (firstSongIndexByKey.value.has(targetKey)) {
    return targetKey;
  }

  const targetIndex = INDEX_KEYS.indexOf(targetKey);
  for (let offset = 1; offset < INDEX_KEYS.length; offset += 1) {
    const forwardKey = INDEX_KEYS[targetIndex + offset];
    if (forwardKey && firstSongIndexByKey.value.has(forwardKey)) {
      return forwardKey;
    }

    const backwardKey = INDEX_KEYS[targetIndex - offset];
    if (backwardKey && firstSongIndexByKey.value.has(backwardKey)) {
      return backwardKey;
    }
  }

  return null;
};

const navigateToIndexKey = (targetKey: AlphabetIndexKey) => {
  const resolvedKey = resolveNearestIndexKey(targetKey);
  if (!resolvedKey) {
    return;
  }

  const songIndex = firstSongIndexByKey.value.get(resolvedKey);
  if (songIndex === undefined) {
    return;
  }

  jumpToSongIndex(songIndex);
};

const updateDragIndexFromPoint = (clientY: number) => {
  if (!indexBarRef.value) {
    return;
  }

  const rect = indexBarRef.value.getBoundingClientRect();
  const relativeY = Math.min(Math.max(clientY - rect.top, 0), rect.height);
  const slotHeight = rect.height / INDEX_KEYS.length;
  const slotIndex = Math.min(
    INDEX_KEYS.length - 1,
    Math.max(0, Math.floor(relativeY / Math.max(slotHeight, 1))),
  );

  const targetKey = INDEX_KEYS[slotIndex];
  dragIndexKey.value = targetKey;
  navigateToIndexKey(targetKey);
};

const handleGlobalIndexPointerMove = (event: PointerEvent) => {
  if (!isIndexDragging.value) {
    return;
  }

  updateDragIndexFromPoint(event.clientY);
};

const stopIndexDrag = () => {
  if (!isIndexDragging.value) {
    return;
  }

  isIndexDragging.value = false;
  dragIndexKey.value = null;
  window.removeEventListener('pointermove', handleGlobalIndexPointerMove);
  window.removeEventListener('pointerup', stopIndexDrag);
  window.removeEventListener('pointercancel', stopIndexDrag);
  scheduleHideIndexBar();
};

const handleIndexPointerDown = (event: PointerEvent, key: AlphabetIndexKey) => {
  if (!showAlphabetIndex.value) {
    return;
  }

  isIndexDragging.value = true;
  showIndexBar();
  dragIndexKey.value = key;
  navigateToIndexKey(key);
  window.addEventListener('pointermove', handleGlobalIndexPointerMove);
  window.addEventListener('pointerup', stopIndexDrag);
  window.addEventListener('pointercancel', stopIndexDrag);
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  event.preventDefault();
};

watch(
  () => virtualData.value.items,
  newItems => preloadCovers(newItems.map(song => song.path)),
  { immediate: true },
);

watch(
  showAlphabetIndex,
  visible => {
    clearHideIndexBarTimer();
    if (visible) {
      revealIndexBarTemporarily();
    } else {
      isIndexBarVisible.value = false;
      hoverIndexKey.value = null;
    }
  },
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
const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0);
const isLibraryEmpty = computed(() => librarySongs.value.length === 0);
const showLibraryOnboarding = computed(
  () => currentViewMode.value === 'all' && !hasSearchQuery.value && isLibraryEmpty.value,
);
const showFolderEmpty = computed(() => currentViewMode.value === 'folder' && !hasSearchQuery.value);
const emptyStateMessage = computed(() => {
  if (hasSearchQuery.value) return '未找到匹配的歌曲';
  if (showFolderEmpty.value) return '该文件夹内暂无歌曲';
  if (currentViewMode.value === 'playlist') return '歌单暂无歌曲';
  return '列表为空';
});

const getClickableArtistNames = (song: Song) =>
  (Array.isArray(song.artist_names) && song.artist_names.length > 0 ? song.artist_names : [song.artist]).filter(Boolean);

const handleArtistClick = (artistName: string) => {
  viewArtist(artistName);
  router.push('/');
};

onMounted(() => {
  window.addEventListener('resize', updateContainerHeight);
  if (containerRef.value) {
    updateContainerHeight();
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', updateContainerHeight);
  stopIndexDrag();
  clearHideIndexBarTimer();
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
            <div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/50 leading-snug">
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

          <div class="flex-1 min-w-0 truncate text-xs text-gray-500 dark:text-white/40">
            {{ song.album }}
          </div>

          <div class="shrink-0 flex items-center gap-3 text-xs font-mono text-gray-500 dark:text-white/50" :class="{ 'opacity-20 pointer-events-none': dragSession.active }">
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
          <p v-if="showLibraryOnboarding" class="mb-6 -mt-4 text-[13px] opacity-70">
            你可以在右上角设置的“常规”里管理音乐库与文件夹关联。
          </p>
          <button v-if="showLibraryOnboarding" @click="addLibraryFolder" class="flex items-center gap-2 px-6 py-2.5 bg-[#EC4141] text-white hover:bg-[#d73a3a] rounded-full text-[14px] font-medium transition-colors shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            添加本地音乐
          </button>
        </template>
        <template v-else-if="currentViewMode === 'playlist'">
          <p>{{ emptyStateMessage }}</p>
        </template>
        <template v-else>
          <p>{{ emptyStateMessage }}</p>
        </template>
      </div>
    </div>

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

@keyframes spectrum {
  0%, 100% { height: 4px; }
  25% { height: 14px; }
  50% { height: 6px; }
  75% { height: 12px; }
}
</style>
