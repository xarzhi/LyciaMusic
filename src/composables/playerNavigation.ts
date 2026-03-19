import { useNavigationStore } from '../stores/navigation';

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

  const switchToFolderView = () => {
    navigationStore.switchToFolderView();
  };

  const viewArtist = (name: string) => {
    navigationStore.viewArtist(name);
  };

  const viewAlbum = (name: string) => {
    navigationStore.viewAlbum(name);
  };

  const viewGenre = (name: string) => {
    navigationStore.viewGenre(name);
  };

  const viewYear = (name: string) => {
    navigationStore.viewYear(name);
  };

  const switchViewToAll = () => {
    navigationStore.switchViewToAll();
  };

  const switchViewToFolder = (path: string) => {
    navigationStore.switchViewToFolder(path);
  };

  const switchToRecent = () => {
    navigationStore.switchToRecent();
  };

  const switchToFavorites = () => {
    navigationStore.switchToFavorites();
  };

  const switchToStatistics = () => {
    navigationStore.switchToStatistics();
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
