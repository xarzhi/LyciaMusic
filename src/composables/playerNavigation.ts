import router from '../router';
import { useHomeNavigation } from './useHomeNavigation';
import { useNavigationStore } from '../shared/stores/navigation';

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

export const createPlayerNavigation = ({
  getArtistList,
  getAlbumList,
}: CreatePlayerNavigationDeps) => {
  const navigationStore = useNavigationStore();
  const {
    openHomeFolder,
    openHomeArtist,
    openHomeAlbum,
    openHomeAll,
    openRecent,
    openFavorites,
    openHomeStatistics,
  } = useHomeNavigation(router);

  const switchToFolderView = () => {
    return openHomeFolder();
  };

  const viewArtist = (name: string) => {
    return openHomeArtist(name);
  };

  const viewAlbum = (name: string) => {
    return openHomeAlbum(name);
  };

  const viewGenre = (name: string) => {
    navigationStore.viewGenre(name);
  };

  const viewYear = (name: string) => {
    navigationStore.viewYear(name);
  };

  const switchViewToAll = () => {
    return openHomeAll();
  };

  const switchViewToFolder = (path: string) => {
    return openHomeFolder(path);
  };

  const switchToRecent = () => {
    return openRecent();
  };

  const switchToFavorites = () => {
    return openFavorites();
  };

  const switchToStatistics = () => {
    return openHomeStatistics();
  };

  const setSearch = (query: string) => {
    navigationStore.setSearch(query);
  };

  const switchLocalTab = (tab: 'default' | 'artist' | 'album') => {
    navigationStore.switchLocalTab(tab, {
      firstArtistName: getArtistList()[0]?.name,
      firstAlbumKey: getAlbumList()[0]?.key,
    });
  };

  const switchFavTab = (tab: 'songs' | 'artists' | 'albums') => {
    navigationStore.switchFavTab(tab);
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
