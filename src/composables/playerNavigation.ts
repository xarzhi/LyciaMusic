import * as State from './playerState';

interface ArtistListItem {
  name: string;
}

interface AlbumListItem {
  key: string;
}

interface CreatePlayerNavigationDeps {
  getArtistList: () => ArtistListItem[];
  getAlbumList: () => AlbumListItem[];
}

type NavigationViewMode = 'all' | 'folder' | 'artist' | 'album' | 'genre' | 'year' | 'playlist' | 'recent' | 'favorites' | 'statistics';

const resetViewFilter = (mode: NavigationViewMode, filter = '') => {
  State.currentViewMode.value = mode;
  State.filterCondition.value = filter;
  State.searchQuery.value = '';
};

export const createPlayerNavigation = ({
  getArtistList,
  getAlbumList,
}: CreatePlayerNavigationDeps) => {
  const switchToFolderView = () => {
    State.currentViewMode.value = 'folder';
    State.searchQuery.value = '';

    if (!State.currentFolderFilter.value && State.watchedFolders.value.length > 0) {
      State.currentFolderFilter.value = State.watchedFolders.value[0];
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

  const switchLocalTab = (tab: 'default' | 'artist' | 'album') => {
    State.localMusicTab.value = tab;
    State.currentArtistFilter.value = '';
    State.currentAlbumFilter.value = '';

    if (tab === 'artist') {
      const firstArtist = getArtistList()[0];
      if (firstArtist) {
        State.currentArtistFilter.value = firstArtist.name;
      }
    }

    if (tab === 'album') {
      const firstAlbum = getAlbumList()[0];
      if (firstAlbum) {
        State.currentAlbumFilter.value = firstAlbum.key;
      }
    }
  };

  const switchFavTab = (tab: 'songs' | 'artists' | 'albums') => {
    State.favTab.value = tab;
  };

  return {
    switchToFolderView,
    viewArtist,
    viewAlbum,
    viewGenre,
    viewYear,
    switchViewToAll,
    switchViewToFolder,
    switchToRecent,
    switchToFavorites,
    switchToStatistics,
    setSearch,
    switchLocalTab,
    switchFavTab,
  };
};
