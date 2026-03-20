import { ref } from 'vue';
import { defineStore } from 'pinia';

import { useLibraryStore } from './library';

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
  return {
    currentViewMode: mode,
    filterCondition: filter,
    searchQuery: '',
  };
};

export const useNavigationStore = defineStore('navigation', () => {
  const libraryStore = useLibraryStore();

  const currentViewMode = ref<NavigationViewMode>('all');
  const filterCondition = ref('');
  const searchQuery = ref('');
  const localMusicTab = ref<'default' | 'artist' | 'album'>('default');
  const currentArtistFilter = ref('');
  const currentAlbumFilter = ref('');
  const currentFolderFilter = ref('');
  const favTab = ref<'songs' | 'artists' | 'albums'>('songs');
  const favDetailFilter = ref<{ type: 'artist' | 'album'; name: string } | null>(null);
  const recentTab = ref<'songs' | 'playlists' | 'albums'>('songs');
  const activeRootPath = ref<string | null>(null);

  const applyViewFilter = (mode: NavigationViewMode, filter = '') => {
    const next = resetViewFilter(mode, filter);
    currentViewMode.value = next.currentViewMode;
    filterCondition.value = next.filterCondition;
    searchQuery.value = next.searchQuery;
  };

  const switchToFolderView = (fallbackFolder?: string) => {
    applyViewFilter('folder');

    if (!currentFolderFilter.value) {
      currentFolderFilter.value = fallbackFolder || libraryStore.watchedFolders[0] || '';
    }
  };

  const viewArtist = (name: string) => {
    applyViewFilter('artist', name);
  };

  const viewAlbum = (name: string) => {
    applyViewFilter('album', name);
  };

  const viewGenre = (name: string) => {
    applyViewFilter('genre', name);
  };

  const viewYear = (name: string) => {
    applyViewFilter('year', name);
  };

  const viewPlaylist = (id: string) => {
    applyViewFilter('playlist', id);
  };

  const switchViewToAll = () => {
    applyViewFilter('all');
  };

  const switchViewToFolder = (path: string) => {
    applyViewFilter('folder', path);
  };

  const switchToRecent = () => {
    currentViewMode.value = 'recent';
    searchQuery.value = '';
  };

  const switchToFavorites = () => {
    currentViewMode.value = 'favorites';
    searchQuery.value = '';
  };

  const switchToStatistics = () => {
    currentViewMode.value = 'statistics';
    searchQuery.value = '';
  };

  const setSearch = (query: string) => {
    searchQuery.value = query;
  };

  const switchLocalTab = (
    tab: 'default' | 'artist' | 'album',
    options: SwitchLocalTabOptions = {},
  ) => {
    localMusicTab.value = tab;
    currentArtistFilter.value = '';
    currentAlbumFilter.value = '';

    if (tab === 'artist') {
      currentArtistFilter.value = options.firstArtistName || '';
    }

    if (tab === 'album') {
      currentAlbumFilter.value = options.firstAlbumKey || '';
    }
  };

  const switchFavTab = (tab: 'songs' | 'artists' | 'albums') => {
    favTab.value = tab;
  };

  return {
    currentViewMode,
    filterCondition,
    searchQuery,
    localMusicTab,
    currentArtistFilter,
    currentAlbumFilter,
    currentFolderFilter,
    favTab,
    favDetailFilter,
    recentTab,
    activeRootPath,
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
