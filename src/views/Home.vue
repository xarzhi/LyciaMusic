<template>
  <div class="flex flex-col h-full">
    <HomeViewPane
      :viewTransitionKey="viewTransitionKey"
      :localViewMode="localViewMode"
      :isBatchMode="isBatchMode"
      :isManagementMode="isManagementMode"
      :activeRootPath="activeRootPath || ''"
      :selectedCount="selectedPaths.size"
      :folderTree="folderTree"
      :currentFolderFilter="currentFolderFilter"
      :playlistDetail="playlistDetail"
      :localSongList="localSongList"
      :artistActiveTab="artistActiveTab"
      :localFilterCondition="localFilterCondition"
      :selectedAlbumSong="selectedAlbumSong"
      :artistAlbumList="artistAlbumList"
      :coverCache="coverCache"
      :loadingSet="loadingSet"
      :selectedPaths="selectedPaths"
      :songTableRef="songTableRef"
      @update:isBatchMode="isBatchMode = $event"
      @update:isManagementMode="isManagementMode = $event"
      @update:artistActiveTab="artistActiveTab = $event"
      @update:selectedPaths="selectedPaths = $event"
      @playAll="handlePlayAll"
      @batchPlay="handleBatchPlay"
      @showAddToPlaylist="showAddToPlaylistModal = true"
      @batchDelete="requestBatchDelete"
      @folderBatchDelete="handleFolderBatchDelete"
      @batchMove="handleBatchMove"
      @addFolder="handleAddFolder"
      @refreshFolder="handleRefreshFolder"
      @removeFolder="handleRemoveFolderWithConfirm"
      @rootCreateFolder="handleRootCreateFolderRequest"
      @rootDeleteFolder="handleRootDeleteFolderRequest"
      @activeRootChange="handleActiveRootChange"
      @renamePlaylist="handleRenamePlaylist"
      @refreshAll="handleRefreshAll"
      @playSong="playSong"
      @contextMenuSong="handleContextMenu"
      @tableDragStart="handleTableDragStart"
      @artistAlbumClick="handleArtistAlbumClick"
    />

    <DragGhost />

    <AddToPlaylistModal
      :visible="showAddToPlaylistModal"
      :selectedCount="isBatchMode ? selectedPaths.size : 1"
      @close="showAddToPlaylistModal = false"
      @add="handleAddToPlaylist"
    />

    <MoveToFolderModal
      :visible="showMoveToFolderModal"
      :selectedCount="selectedPaths.size"
      @close="showMoveToFolderModal = false"
      @confirm="confirmBatchMove"
    />

    <SongContextMenu
      :visible="showContextMenu"
      :x="contextMenuX"
      :y="contextMenuY"
      :song="contextMenuTargetSong"
      :is-playlist-view="localViewMode === 'playlist'"
      :isManagementMode="isManagementMode"
      @close="showContextMenu = false"
      @add-to-playlist="showAddToPlaylistModal = true"
      @delete-disk="handleSongPhysicalDelete"
    />

    <ModernModal
      :visible="showConfirm"
      :title="confirmTitle"
      :content="confirmMessage"
      type="danger"
      :confirm-text="confirmButtonText"
      @confirm="executeConfirmAction"
      @cancel="showConfirm = false"
    />

    <ModernModal
      v-model:visible="showSongPhysicalDeleteConfirm"
      title="Delete File Permanently"
      :content="`Are you sure you want to permanently delete '${songToPhysicalDelete?.title}' from disk? This cannot be undone.`"
      type="danger"
      confirm-text="Delete Permanently"
      @confirm="executeSongPhysicalDelete"
    />

    <ModernModal
      v-model:visible="showFolderDeleteConfirm"
      title="Delete Folder"
      :content="`Are you sure you want to delete folder '${folderToDeletePath}'? This will also remove local files inside it.`"
      type="danger"
      confirm-text="Delete Folder"
      @confirm="executeDeleteFolder"
    />

    <ModernInputModal
      :visible="showCreateFolderModal"
      title="Create Folder"
      placeholder="Enter folder name"
      confirm-text="Create"
      @cancel="showCreateFolderModal = false"
      @confirm="confirmCreateFolder"
    />

    <ModernInputModal
      :visible="showRenameModal"
      title="Rename Playlist"
      :initial-value="renameInitialValue"
      @cancel="showRenameModal = false"
      @confirm="confirmRename"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';

import DragGhost from '../components/common/DragGhost.vue';
import HomeViewPane from '../components/home/HomeViewPane.vue';
import ModernInputModal from '../components/common/ModernInputModal.vue';
import ModernModal from '../components/common/ModernModal.vue';
import AddToPlaylistModal from '../components/overlays/AddToPlaylistModal.vue';
import MoveToFolderModal from '../components/overlays/MoveToFolderModal.vue';
import SongContextMenu from '../components/overlays/SongContextMenu.vue';
import { useCoverCache } from '../composables/useCoverCache';
import { useHomeArtistAlbums } from '../composables/useHomeArtistAlbums';
import { useHomeBatchActions } from '../composables/useHomeBatchActions';
import { useHomeFolderManagement } from '../composables/useHomeFolderManagement';
import { useHomeNavigation } from '../composables/useHomeNavigation';
import { useHomePlaylistRename } from '../composables/useHomePlaylistRename';
import { useHomeRouteSync } from '../composables/useHomeRouteSync';
import { useHomeViewState } from '../composables/useHomeViewState';
import { useLibraryCollections } from '../composables/useLibraryCollections';
import { useLibraryRuntimeActions } from '../composables/useLibraryRuntimeActions';
import { usePlaybackController } from '../composables/usePlaybackController';
import { usePlayerLibraryView } from '../composables/usePlayerLibraryView';
import { usePlayerViewState } from '../composables/usePlayerViewState';
import { useSongContextActions } from '../composables/useSongContextActions';
import { useSongDrag } from '../composables/useSongDrag';
import { useToast } from '../composables/toast';
import { useLibraryStore } from '../stores/library';

const route = useRoute();
const router = useRouter();
const { openHomeAlbum } = useHomeNavigation(router);
const { showToast } = useToast();
const libraryStore = useLibraryStore();
const {
  songList,
  albumSortMode,
  albumCustomOrder,
} = storeToRefs(libraryStore);

const {
  currentViewMode,
  activeRootPath,
  currentFolderFilter,
  filterCondition,
} = usePlayerViewState();
const {
  displaySongList,
  librarySongs,
  folderTree,
  searchQuery,
} = usePlayerLibraryView();
const { playSong } = usePlaybackController();
const {
  moveFilesToFolder,
  refreshAllFolders,
  deleteFromDisk,
  addLibraryFolder,
  createFolder,
  deleteFolder,
  expandFolderPath,
  fetchFolderTree,
  removeLibraryFolderLinked,
  refreshFolder,
} = useLibraryRuntimeActions();

const {
  addSongsToPlaylist,
  favoritePaths,
  removeFromHistory,
  playlists,
} = useLibraryCollections();

const { coverCache, loadingSet, preloadCovers } = useCoverCache();

const isBatchMode = ref(false);
const isManagementMode = ref(false);
const selectedPaths = ref<Set<string>>(new Set());
const songTableRef = ref<any>(null);

const {
  localViewMode,
  localFilterCondition,
  artistActiveTab,
  viewTransitionKey,
} = useHomeViewState({
  currentViewMode,
  filterCondition,
  isManagementMode,
});

const localSongList = computed(() => displaySongList.value);
const selectedAlbumSong = computed(() => localSongList.value[0] || null);

const { handleTableDragStart } = useSongDrag(
  localSongList,
  isBatchMode,
  selectedPaths,
  songTableRef,
);

const showAddToPlaylistModal = ref(false);

const {
  showContextMenu,
  contextMenuX,
  contextMenuY,
  contextMenuTargetSong,
  showSongPhysicalDeleteConfirm,
  songToPhysicalDelete,
  handleContextMenu,
  handleSongPhysicalDelete,
  executeSongPhysicalDelete,
} = useSongContextActions({
  isBatchMode,
  deleteFromDisk,
});

watch(isBatchMode, value => {
  if (!value) {
    selectedPaths.value.clear();
  }
});

const {
  showMoveToFolderModal,
  showConfirm,
  confirmTitle,
  confirmButtonText,
  confirmMessage,
  requestBatchDelete,
  handleFolderBatchDelete,
  executeConfirmAction,
  handleBatchMove,
  confirmBatchMove,
  handleAddToPlaylist,
  openConfirm,
} = useHomeBatchActions({
  currentViewMode,
  selectedPaths,
  isBatchMode,
  isManagementMode,
  songList,
  favoritePaths,
  playlists,
  contextMenuTargetSong,
  showAddToPlaylistModal,
  addSongsToPlaylist,
  moveFilesToFolder,
  removeFromHistory,
  showToast,
  getRoutePath: () => route.path,
});

const {
  showCreateFolderModal,
  showFolderDeleteConfirm,
  folderToDeletePath,
  handleActiveRootChange,
  confirmCreateFolder,
  executeDeleteFolder,
  handleAddFolder,
  handleRootCreateFolderRequest,
  handleRootDeleteFolderRequest,
  handleRefreshFolder,
  handleRemoveFolderWithConfirm,
} = useHomeFolderManagement({
  isManagementMode,
  activeRootPath,
  currentFolderFilter,
  folderTree,
  songList,
  refreshFolder,
  fetchFolderTree,
  createFolder,
  deleteFolder,
  expandFolderPath,
  addLibraryFolder,
  removeLibraryFolderLinked,
  showToast,
  openConfirm,
});

useHomeRouteSync({
  route,
  router,
  currentViewMode,
  filterCondition,
  currentFolderFilter,
  activeRootPath,
  folderTree,
  searchQuery,
});

const {
  showRenameModal,
  renameInitialValue,
  handleRenamePlaylist,
  confirmRename,
} = useHomePlaylistRename({
  currentViewMode,
  filterCondition,
  playlists,
  showToast,
});

const playlistDetail = computed(() => {
  if (localViewMode.value !== 'playlist') {
    return null;
  }

  const playlist = playlists.value.find(item => item.id === localFilterCondition.value);
  if (!playlist) {
    return null;
  }

  return {
    name: playlist.name,
    date: (playlist as any).createdAt || '',
  };
});

const { artistAlbumList } = useHomeArtistAlbums({
  localFilterCondition,
  filterCondition,
  librarySongs,
  albumSortMode,
  albumCustomOrder,
  preloadCovers,
});

const handlePlayAll = () => {
  if (localSongList.value.length > 0) {
    void playSong(localSongList.value[0]);
  }
};

const handleBatchPlay = () => {
  const selectedSongs = localSongList.value.filter(song => selectedPaths.value.has(song.path));
  if (selectedSongs.length > 0) {
    void playSong(selectedSongs[0]);
  }
};

const handleRefreshAll = async () => {
  await refreshAllFolders();
  showToast('Refresh completed', 'success');
};

const handleArtistAlbumClick = (albumKey: string) => {
  void openHomeAlbum(albumKey);
};
</script>

<style scoped>
.home-view-fade-enter-active,
.home-view-fade-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.home-view-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.home-view-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
