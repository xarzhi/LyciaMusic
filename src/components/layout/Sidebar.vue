<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import ModernInputModal from '../common/ModernInputModal.vue';
import ModernModal from '../common/ModernModal.vue';
import PlaylistContextMenu from '../overlays/PlaylistContextMenu.vue';
import { useCoverCache } from '../../composables/useCoverCache';
import { useHomeNavigation } from '../../composables/useHomeNavigation';
import { useLibraryCollections } from '../../composables/useLibraryCollections';
import { usePlayer, dragSession } from '../../composables/player';
import { usePlayerViewState } from '../../composables/usePlayerViewState';
import { useSidebarPlaylistContextMenu } from '../../composables/useSidebarPlaylistContextMenu';
import { useSidebarPlaylistCovers } from '../../composables/useSidebarPlaylistCovers';
import { useSidebarPlaylistDragDrop } from '../../composables/useSidebarPlaylistDragDrop';
import { useSidebarPlaylistSelection } from '../../composables/useSidebarPlaylistSelection';
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
const showCreateModal = ref(false);

const handleHoverArtists = () => {
  if (artistList.value.length > 0) {
    preloadCovers(artistList.value.slice(0, 30).map(artist => artist.firstSongPath).filter(Boolean));
  }
};

const handleHoverAlbums = () => {
  if (albumList.value.length > 0) {
    preloadCovers(albumList.value.slice(0, 30).map(album => album.firstSongPath).filter(Boolean));
  }
};

const {
  selectedPlaylistIds,
  ensurePlaylistSelected,
  handlePlaylistClick,
  handleBackgroundClick,
} = useSidebarPlaylistSelection({
  playlists,
  currentViewMode,
  filterCondition,
  openHomePlaylist,
});

const clearPlaylistSelection = () => {
  selectedPlaylistIds.value.clear();
};

const {
  showContextMenu,
  contextMenuX,
  contextMenuY,
  targetPlaylist,
  showDeleteModal,
  deleteModalContent,
  handleDeletePlaylist,
  confirmDeletePlaylist,
  handlePlaylistContextMenu,
  handleMenuPlay,
  handleMenuAddToQueue,
  handleMenuDelete,
} = useSidebarPlaylistContextMenu({
  selectedPlaylistIds,
  ensurePlaylistSelected,
  viewPlaylist,
  getSongsFromPlaylist,
  addSongsToQueue,
  clearQueue,
  playSong,
  openHomePlaylist,
  deletePlaylist,
  clearSelection: clearPlaylistSelection,
});

const {
  dragOverId,
  dragPosition,
  handleMouseDown,
  handleItemMouseMove,
} = useSidebarPlaylistDragDrop({
  playlists,
  dragSession,
  reorderPlaylists,
});

const { playlistCoverCache } = useSidebarPlaylistCovers({
  playlists,
  loadCover,
});

const handleCreatePlaylist = () => {
  showCreateModal.value = true;
};

const confirmCreatePlaylist = (name: string) => {
  if (name) {
    createPlaylist(name);
  }
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
      title="Delete Playlist"
      :content="deleteModalContent"
      type="danger"
      confirm-text="Delete"
      @confirm="confirmDeletePlaylist"
    />

    <ModernInputModal
      v-model:visible="showCreateModal"
      title="Create Playlist"
      placeholder="Enter playlist name"
      confirm-text="Create"
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
