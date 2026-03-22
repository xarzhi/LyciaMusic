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
import DragGhost from '../components/common/DragGhost.vue';
import HomeViewPane from '../components/home/HomeViewPane.vue';
import ModernInputModal from '../components/common/ModernInputModal.vue';
import ModernModal from '../components/common/ModernModal.vue';
import AddToPlaylistModal from '../components/overlays/AddToPlaylistModal.vue';
import MoveToFolderModal from '../components/overlays/MoveToFolderModal.vue';
import SongContextMenu from '../components/overlays/SongContextMenu.vue';
import { useHomePageModel } from '../composables/useHomePageModel';

const {
  viewTransitionKey,
  localViewMode,
  isBatchMode,
  isManagementMode,
  activeRootPath,
  selectedPaths,
  folderTree,
  currentFolderFilter,
  playlistDetail,
  localSongList,
  artistActiveTab,
  localFilterCondition,
  selectedAlbumSong,
  artistAlbumList,
  coverCache,
  loadingSet,
  songTableRef,
  handlePlayAll,
  handleBatchPlay,
  showAddToPlaylistModal,
  requestBatchDelete,
  handleFolderBatchDelete,
  handleBatchMove,
  handleAddFolder,
  handleRefreshFolder,
  handleRemoveFolderWithConfirm,
  handleRootCreateFolderRequest,
  handleRootDeleteFolderRequest,
  handleActiveRootChange,
  handleRenamePlaylist,
  handleRefreshAll,
  playSong,
  handleContextMenu,
  handleTableDragStart,
  handleArtistAlbumClick,
  showMoveToFolderModal,
  confirmBatchMove,
  showContextMenu,
  contextMenuX,
  contextMenuY,
  contextMenuTargetSong,
  showConfirm,
  confirmTitle,
  confirmMessage,
  confirmButtonText,
  executeConfirmAction,
  showSongPhysicalDeleteConfirm,
  songToPhysicalDelete,
  handleSongPhysicalDelete,
  executeSongPhysicalDelete,
  showFolderDeleteConfirm,
  folderToDeletePath,
  executeDeleteFolder,
  showCreateFolderModal,
  confirmCreateFolder,
  showRenameModal,
  renameInitialValue,
  confirmRename,
  handleAddToPlaylist,
} = useHomePageModel();
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
