import { defineStore } from 'pinia';
import * as State from '../composables/playerState';

export type NavigationViewMode =
  | 'all'
  | 'folder'
  | 'artist'
  | 'album'
  | 'genre'
  | 'year'
  | 'playlist'
  | 'recent'
  | 'favorites'
  | 'statistics';

interface SwitchLocalTabOptions {
  firstArtistName?: string;
  firstAlbumKey?: string;
}

const resetViewFilter = (mode: NavigationViewMode, filter = '') => {
  State.currentViewMode.value = mode;
  State.filterCondition.value = filter;
  State.searchQuery.value = '';
};

export const useNavigationStore = defineStore('navigation', () => {
  const switchToFolderView = (fallbackFolder?: string) => {
    State.currentViewMode.value = 'folder';
    State.searchQuery.value = '';

    if (!State.currentFolderFilter.value) {
      State.currentFolderFilter.value = fallbackFolder || State.watchedFolders.value[0] || '';
    }
  };

  const viewArtist = (name: string) => {
    resetViewFilter('artist', name);
  };

  const viewAlbum = (name: string) => {
    resetViewFilter('album', name);
  };

  const viewGenre = (name: string) => {
    resetViewFilter('genre', name);
  };

  const viewYear = (name: string) => {
    resetViewFilter('year', name);
  };

  const viewPlaylist = (id: string) => {
    resetViewFilter('playlist', id);
  };

  const switchViewToAll = () => {
    resetViewFilter('all');
  };

  const switchViewToFolder = (path: string) => {
    resetViewFilter('folder', path);
  };

  const switchToRecent = () => {
    State.currentViewMode.value = 'recent';
    State.searchQuery.value = '';
  };

  const switchToFavorites = () => {
    State.currentViewMode.value = 'favorites';
    State.searchQuery.value = '';
  };

  const switchToStatistics = () => {
    State.currentViewMode.value = 'statistics';
    State.searchQuery.value = '';
  };

  const setSearch = (query: string) => {
    State.searchQuery.value = query;
  };

  const switchLocalTab = (
    tab: 'default' | 'artist' | 'album',
    options: SwitchLocalTabOptions = {},
  ) => {
    State.localMusicTab.value = tab;
    State.currentArtistFilter.value = '';
    State.currentAlbumFilter.value = '';

    if (tab === 'artist') {
      State.currentArtistFilter.value = options.firstArtistName || '';
    }

    if (tab === 'album') {
      State.currentAlbumFilter.value = options.firstAlbumKey || '';
    }
  };

  const switchFavTab = (tab: 'songs' | 'artists' | 'albums') => {
    State.favTab.value = tab;
  };

  return {
    currentViewMode: State.currentViewMode,
    filterCondition: State.filterCondition,
    searchQuery: State.searchQuery,
    localMusicTab: State.localMusicTab,
    currentArtistFilter: State.currentArtistFilter,
    currentAlbumFilter: State.currentAlbumFilter,
    currentFolderFilter: State.currentFolderFilter,
    favTab: State.favTab,
    favDetailFilter: State.favDetailFilter,
    recentTab: State.recentTab,
    activeRootPath: State.activeRootPath,
    switchToFolderView,
    viewArtist,
    viewAlbum,
    viewGenre,
    viewYear,
    viewPlaylist,
    switchViewToAll,
    switchViewToFolder,
    switchToRecent,
    switchToFavorites,
    switchToStatistics,
    setSearch,
    switchLocalTab,
    switchFavTab,
  };
});
