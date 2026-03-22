import { storeToRefs } from 'pinia';

import { useLibraryStore } from '../stores/library';
import { useNavigationStore } from '../stores/navigation';
import { usePlayerLibraryView } from './usePlayerLibraryView';

export function useLibraryBrowse() {
  const libraryStore = useLibraryStore();
  const navigationStore = useNavigationStore();
  const libraryView = usePlayerLibraryView();

  const {
    searchQuery,
    localMusicTab,
    currentViewMode,
    currentFolderFilter,
    activeRootPath,
  } = storeToRefs(navigationStore);
  const {
    libraryFolders,
    librarySongs,
    artistSortMode,
    albumSortMode,
    artistCustomOrder,
    albumCustomOrder,
  } = storeToRefs(libraryStore);
  const { folderTree } = libraryView;

  const updateArtistOrder = (newOrder: string[]) => {
    artistCustomOrder.value = newOrder;
    if (artistSortMode.value !== 'custom') {
      artistSortMode.value = 'custom';
    }
  };

  const updateAlbumOrder = (newOrder: string[]) => {
    albumCustomOrder.value = newOrder;
    if (albumSortMode.value !== 'custom') {
      albumSortMode.value = 'custom';
    }
  };

  const reorderWatchedFolders = (from: number, to: number) => {
    libraryStore.reorderWatchedFolders(from, to);
  };

  return {
    searchQuery,
    localMusicTab,
    currentViewMode,
    currentFolderFilter,
    activeRootPath,
    folderTree,
    libraryFolders,
    librarySongs,
    artistSortMode,
    albumSortMode,
    artistList: libraryView.artistList,
    albumList: libraryView.albumList,
    filteredArtistList: libraryView.filteredArtistList,
    filteredAlbumList: libraryView.filteredAlbumList,
    folderList: libraryView.folderList,
    favoriteSongList: libraryView.favoriteSongList,
    favArtistList: libraryView.favArtistList,
    favAlbumList: libraryView.favAlbumList,
    recentPlaylistList: libraryView.recentPlaylistList,
    updateArtistOrder,
    updateAlbumOrder,
    reorderWatchedFolders,
  };
}
