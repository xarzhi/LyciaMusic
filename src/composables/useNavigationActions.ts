import type { Ref } from 'vue';
import router from '../router';
import { useHomeNavigation } from './useHomeNavigation';

interface NavigationStoreApi {
  switchToFolderView: () => void;
  viewArtist: (name: string) => void;
  viewAlbum: (name: string) => void;
  viewGenre: (name: string) => void;
  viewYear: (name: string) => void;
  switchViewToAll: () => void;
  switchViewToFolder: (path: string) => void;
  switchToRecent: () => void;
  switchToFavorites: () => void;
  switchToStatistics: () => void;
  setSearch: (query: string) => void;
  switchLocalTab: (tab: 'default' | 'artist' | 'album', options?: { firstArtistName?: string; firstAlbumKey?: string }) => void;
  switchFavTab: (tab: 'songs' | 'artists' | 'albums') => void;
}

interface UseNavigationActionsOptions {
  navigationStore: NavigationStoreApi;
  artistList: Ref<Array<{ name: string }>>;
  albumList: Ref<Array<{ key: string }>>;
}

export function useNavigationActions({
  navigationStore,
  artistList,
  albumList,
}: UseNavigationActionsOptions) {
  const {
    openHomeFolder,
    openHomeArtist,
    openHomeAlbum,
    openHomeAll,
    openRecent,
    openFavorites,
    openHomeStatistics,
  } = useHomeNavigation(router);

  const switchToFolderView = () => openHomeFolder();
  const viewArtist = (name: string) => openHomeArtist(name);
  const viewAlbum = (name: string) => openHomeAlbum(name);
  const viewGenre = (name: string) => navigationStore.viewGenre(name);
  const viewYear = (name: string) => navigationStore.viewYear(name);
  const switchViewToAll = () => openHomeAll();
  const switchViewToFolder = (path: string) => openHomeFolder(path);
  const switchToRecent = () => openRecent();
  const switchToFavorites = () => openFavorites();
  const switchToStatistics = () => openHomeStatistics();
  const setSearch = (query: string) => navigationStore.setSearch(query);
  const switchLocalTab = (tab: 'default' | 'artist' | 'album') =>
    navigationStore.switchLocalTab(tab, {
      firstArtistName: artistList.value[0]?.name,
      firstAlbumKey: albumList.value[0]?.key,
    });
  const switchFavTab = (tab: 'songs' | 'artists' | 'albums') => navigationStore.switchFavTab(tab);

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
}
