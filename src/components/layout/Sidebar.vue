<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { usePlayer, dragSession } from '../../composables/player';
import { useLibraryCollections } from '../../composables/useLibraryCollections';
import { usePlayerViewState } from '../../composables/usePlayerViewState';
import { useCoverCache } from '../../composables/useCoverCache';
import { useHomeNavigation } from '../../composables/useHomeNavigation';
import ModernInputModal from '../common/ModernInputModal.vue';
import ModernModal from '../common/ModernModal.vue';
import PlaylistContextMenu from '../overlays/PlaylistContextMenu.vue';
import SidebarNavigation from './SidebarNavigation.vue';
import SidebarPlaylists from './SidebarPlaylists.vue';

const {
  artistList,
  albumList,
  playSong,
  addSongsToQueue,
  clearQueue,
  settings,
} = usePlayer();
const {
  currentViewMode,
  filterCondition,
  currentFolderFilter,
} = usePlayerViewState();
const {
  playlists,
  createPlaylist,
  deletePlaylist,
  viewPlaylist,
  reorderPlaylists,
  getSongsFromPlaylist,
} = useLibraryCollections();

const route = useRoute();
const router = useRouter();
const {
  openHomeAll,
  openHomeFolder,
  openHomePlaylist,
  openHomeStatistics,
} = useHomeNavigation(router);
const { preloadCovers, loadCover } = useCoverCache();

const isPlaylistOpen = ref(true);
const dragOverId = ref<string | null>(null);
const dragPosition = ref<'top' | 'bottom' | null>(null);

const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const targetPlaylist = ref<{ id: string; name: string } | null>(null);
const selectedPlaylistIds = ref<Set<string>>(new Set());
const lastSelectedPlaylistId = ref<string | null>(null);

const showCreateModal = ref(false);
const showDeleteModal = ref(false);
const playlistsToDelete = ref<string[]>([]);
const deleteModalContent = ref('');

const playlistCoverCache = ref<Map<string, string>>(new Map());
const playlistRealFirstSongMap = new Map<string, string>();
let playlistCoverRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let playlistCoverRefreshIdleId: number | null = null;

const handleHoverArtists = () => {
  if (artistList.value.length > 0) {
    preloadCovers(artistList.value.slice(0, 30).map(a => a.firstSongPath).filter(Boolean));
  }
};

const handleHoverAlbums = () => {
  if (albumList.value.length > 0) {
    preloadCovers(albumList.value.slice(0, 30).map(a => a.firstSongPath).filter(Boolean));
  }
};

let mouseDownInfo: { x: number; y: number; index: number; playlist: any } | null = null;

const handleMouseDown = (e: MouseEvent, index: number, playlist: any) => {
  if (e.button !== 0) return;
  mouseDownInfo = { x: e.clientX, y: e.clientY, index, playlist };
};

const handleGlobalMouseMove = (e: MouseEvent) => {
  if (mouseDownInfo && !dragSession.active) {
    const dist = Math.sqrt(Math.pow(e.clientX - mouseDownInfo.x, 2) + Math.pow(e.clientY - mouseDownInfo.y, 2));
    if (dist > 5) {
      dragSession.active = true;
      dragSession.type = 'playlist';
      dragSession.data = { index: mouseDownInfo.index, id: mouseDownInfo.playlist.id, name: mouseDownInfo.playlist.name };
    }
  }
};

const handleGlobalMouseUp = () => {
  if (dragSession.active && dragSession.type === 'playlist' && dragOverId.value && mouseDownInfo) {
    const fromIndex = mouseDownInfo.index;
    const targetIndex = playlists.value.findIndex(p => p.id === dragOverId.value);

    if (targetIndex !== -1) {
      let toIndex = targetIndex;
      if (dragPosition.value === 'bottom') {
        toIndex += 1;
      }
      if (fromIndex < toIndex) {
        toIndex -= 1;
      }
      if (fromIndex !== toIndex) {
        reorderPlaylists(fromIndex, toIndex);
      }
    }
  }

  mouseDownInfo = null;
  if (dragSession.type === 'playlist') {
    dragSession.active = false;
    dragSession.type = 'song';
    dragSession.data = null;
    dragOverId.value = null;
    dragPosition.value = null;
  }
};

const handleItemMouseMove = (e: MouseEvent, playlistId: string) => {
  if (dragSession.active && dragSession.type === 'playlist') {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    dragOverId.value = playlistId;
    dragPosition.value = e.clientY < mid ? 'top' : 'bottom';
  }
};

const handleCreatePlaylist = () => {
  showCreateModal.value = true;
};

const confirmCreatePlaylist = (name: string) => {
  if (name) {
    createPlaylist(name);
  }
};

const handleDeletePlaylist = (id: string, name: string) => {
  playlistsToDelete.value = [id];
  deleteModalContent.value = `Delete playlist "${name}"?`;
  showDeleteModal.value = true;
};

const handleDeletePlaylistBatch = (ids: string[], count: number) => {
  playlistsToDelete.value = ids;
  deleteModalContent.value = `Delete ${count} playlists?`;
  showDeleteModal.value = true;
};

const confirmDeletePlaylist = () => {
  playlistsToDelete.value.forEach(id => deletePlaylist(id));
  selectedPlaylistIds.value.clear();
  playlistsToDelete.value = [];
  showDeleteModal.value = false;
};

const handlePlaylistClick = (e: MouseEvent, id: string) => {
  e.stopPropagation();
  void openHomePlaylist(id);

  if (e.shiftKey && lastSelectedPlaylistId.value) {
    const list = playlists.value;
    const lastIndex = list.findIndex(p => p.id === lastSelectedPlaylistId.value);
    const currentIndex = list.findIndex(p => p.id === id);
    if (lastIndex !== -1 && currentIndex !== -1) {
      const start = Math.min(lastIndex, currentIndex);
      const end = Math.max(lastIndex, currentIndex);
      for (let i = start; i <= end; i++) {
        selectedPlaylistIds.value.add(list[i].id);
      }
    }
  } else if (e.ctrlKey || e.metaKey) {
    if (selectedPlaylistIds.value.has(id)) {
      selectedPlaylistIds.value.delete(id);
    } else {
      selectedPlaylistIds.value.add(id);
    }
    lastSelectedPlaylistId.value = id;
  } else {
    selectedPlaylistIds.value.clear();
    selectedPlaylistIds.value.add(id);
    lastSelectedPlaylistId.value = id;
  }
};

const handleBackgroundClick = () => {
  if (currentViewMode.value === 'playlist' && filterCondition.value) {
    selectedPlaylistIds.value.clear();
    selectedPlaylistIds.value.add(filterCondition.value);
  }
};

const handlePlaylistContextMenu = (e: MouseEvent, list: { id: string; name: string }) => {
  e.preventDefault();
  e.stopPropagation();
  targetPlaylist.value = list;

  if (!selectedPlaylistIds.value.has(list.id)) {
    selectedPlaylistIds.value.clear();
    selectedPlaylistIds.value.add(list.id);
    lastSelectedPlaylistId.value = list.id;
    viewPlaylist(list.id);
  }

  contextMenuX.value = e.clientX;
  contextMenuY.value = e.clientY;
  showContextMenu.value = true;
};

const handleMenuPlay = () => {
  if (!targetPlaylist.value) {
    return;
  }

  const songs = getSongsFromPlaylist(targetPlaylist.value.id);
  if (songs.length > 0) {
    clearQueue();
    void openHomePlaylist(targetPlaylist.value.id);
    setTimeout(() => {
      playSong(songs[0]);
    }, 50);
  }
  showContextMenu.value = false;
};

const handleOpenAllView = () => {
  void openHomeAll();
};

const handleOpenArtistsView = () => {
  void router.push('/artists');
};

const handleOpenAlbumsView = () => {
  void router.push('/albums');
};

const handleOpenFavoritesView = () => {
  void router.push('/favorites');
};

const handleOpenRecentView = () => {
  void router.push('/recent');
};

const handleOpenFolderView = () => {
  void openHomeFolder(currentFolderFilter.value || undefined);
};

const handleOpenStatisticsView = () => {
  void openHomeStatistics();
};

const handleMenuAddToQueue = () => {
  if (selectedPlaylistIds.value.size > 1) {
    selectedPlaylistIds.value.forEach(id => {
      addSongsToQueue(getSongsFromPlaylist(id));
    });
  } else if (targetPlaylist.value) {
    addSongsToQueue(getSongsFromPlaylist(targetPlaylist.value.id));
  }
  showContextMenu.value = false;
};

const handleMenuDelete = () => {
  if (selectedPlaylistIds.value.size > 0) {
    handleDeletePlaylistBatch(Array.from(selectedPlaylistIds.value), selectedPlaylistIds.value.size);
  } else if (targetPlaylist.value) {
    handleDeletePlaylist(targetPlaylist.value.id, targetPlaylist.value.name);
  }
  showContextMenu.value = false;
};

const updateCoverIfChanged = async (playlistId: string, firstSongPath: string) => {
  if (playlistRealFirstSongMap.get(playlistId) === firstSongPath && playlistCoverCache.value.has(playlistId)) {
    return;
  }

  playlistRealFirstSongMap.set(playlistId, firstSongPath);
  try {
    const assetUrl = await loadCover(firstSongPath);
    if (assetUrl) {
      playlistCoverCache.value.set(playlistId, assetUrl);
    } else {
      playlistCoverCache.value.delete(playlistId);
    }
  } catch {
    playlistCoverCache.value.delete(playlistId);
  }
};

const calculatePlaylistCovers = async () => {
  await Promise.all(playlists.value.map(async (pl) => {
    if (pl.songPaths.length > 0) {
      await updateCoverIfChanged(pl.id, pl.songPaths[0]);
      return;
    }

    if (playlistCoverCache.value.has(pl.id)) {
      playlistCoverCache.value.delete(pl.id);
      playlistRealFirstSongMap.delete(pl.id);
    }
  }));
};

const schedulePlaylistCoverRefresh = () => {
  if (playlistCoverRefreshTimer) {
    clearTimeout(playlistCoverRefreshTimer);
  }
  if (playlistCoverRefreshIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(playlistCoverRefreshIdleId);
    playlistCoverRefreshIdleId = null;
  }

  const runRefresh = () => {
    playlistCoverRefreshIdleId = null;
    playlistCoverRefreshTimer = null;
    void calculatePlaylistCovers();
  };

  if ('requestIdleCallback' in window) {
    playlistCoverRefreshIdleId = window.requestIdleCallback(runRefresh, { timeout: 500 });
    return;
  }

  playlistCoverRefreshTimer = setTimeout(runRefresh, 180);
};

watch(
  () => playlists.value.map(pl => `${pl.id}:${pl.songPaths[0] ?? ''}:${pl.songPaths.length}`).join('|'),
  () => {
    schedulePlaylistCoverRefresh();
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener('mousemove', handleGlobalMouseMove);
  window.addEventListener('mouseup', handleGlobalMouseUp);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleGlobalMouseMove);
  window.removeEventListener('mouseup', handleGlobalMouseUp);
  if (playlistCoverRefreshTimer) {
    clearTimeout(playlistCoverRefreshTimer);
  }
  if (playlistCoverRefreshIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(playlistCoverRefreshIdleId);
  }
});
</script>

<template>
  <aside class="w-48 bg-transparent flex flex-col border-r border-transparent h-full select-none overflow-hidden relative transition-colors duration-600">
    <div class="h-16 flex items-center px-6 shrink-0 mb-2 cursor-default relative" data-tauri-drag-region>
      <div class="flex items-center pointer-events-none -translate-x-[4px] -translate-y-[4px]">
        <img src="/app_logo_black.png" alt="Logo" class="w-8 h-8 object-contain drop-shadow-sm opacity-80 dark:hidden" />
        <img src="/app_logo_white.png" alt="Logo" class="w-8 h-8 object-contain drop-shadow-sm opacity-80 hidden dark:block" />
        <h1 class="text-[17px] font-medium text-black/80 dark:text-white/80 tracking-wide -ml-1.5 mt-1.5 ">
          ycia Player
        </h1>
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4" @click="handleBackgroundClick">
      <SidebarNavigation
        :sidebar="settings.sidebar"
        :currentViewMode="currentViewMode"
        :currentPath="route.path"
        :isDragActive="dragSession.active"
        @openAll="handleOpenAllView"
        @openArtists="handleOpenArtistsView"
        @openAlbums="handleOpenAlbumsView"
        @openFavorites="handleOpenFavoritesView"
        @openRecent="handleOpenRecentView"
        @openFolder="handleOpenFolderView"
        @openStatistics="handleOpenStatisticsView"
        @hoverArtists="handleHoverArtists"
        @hoverAlbums="handleHoverAlbums"
      />

      <SidebarPlaylists
        v-model:isOpen="isPlaylistOpen"
        :playlists="playlists"
        :selectedPlaylistIds="selectedPlaylistIds"
        :playlistCoverCache="playlistCoverCache"
        :dragState="dragSession"
        :dragOverId="dragOverId"
        :dragPosition="dragPosition"
        @createPlaylist="handleCreatePlaylist"
        @mouseDown="handleMouseDown"
        @itemMouseMove="handleItemMouseMove"
        @playlistClick="handlePlaylistClick"
        @playlistContextMenu="handlePlaylistContextMenu"
        @deletePlaylist="handleDeletePlaylist"
      />
    </nav>

    <PlaylistContextMenu
      :visible="showContextMenu"
      :x="contextMenuX"
      :y="contextMenuY"
      :playlist-name="targetPlaylist?.name || ''"
      :selected-count="selectedPlaylistIds.size"
      @close="showContextMenu = false"
      @cancel="showContextMenu = false"
      @play="handleMenuPlay"
      @add-to-queue="handleMenuAddToQueue"
      @delete="handleMenuDelete"
    />

    <ModernModal
      v-model:visible="showDeleteModal"
      title="鍒犻櫎姝屽崟"
      :content="deleteModalContent"
      type="danger"
      confirm-text="鍒犻櫎"
      @confirm="confirmDeletePlaylist"
    />

    <ModernInputModal
      v-model:visible="showCreateModal"
      title="鏂板缓姝屽崟"
      placeholder="璇疯緭鍏ユ瓕鍗曞悕绉?"
      confirm-text="鍒涘缓"
      @confirm="confirmCreatePlaylist"
    />
  </aside>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 10px;
}
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}
</style>
