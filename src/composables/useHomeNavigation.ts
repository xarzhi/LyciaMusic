import type { Router } from 'vue-router';

type HomeNavigationTarget =
  | { view: 'all' }
  | { view: 'artist' | 'album' | 'playlist'; filter: string }
  | { view: 'folder'; folder?: string }
  | { view: 'statistics' };

const buildHomeLocation = (target: HomeNavigationTarget) => {
  switch (target.view) {
    case 'artist':
    case 'album':
    case 'playlist':
      return {
        path: '/',
        query: {
          view: target.view,
          filter: target.filter,
        },
      };
    case 'folder':
      return {
        path: '/',
        query: target.folder
          ? {
              view: 'folder',
              folder: target.folder,
            }
          : {
              view: 'folder',
            },
      };
    case 'statistics':
      return {
        path: '/',
        query: {
          view: 'statistics',
        },
      };
    default:
      return {
        path: '/',
        query: {},
      };
  }
};

export function useHomeNavigation(router: Router) {
  const openHome = async (target: HomeNavigationTarget, options: { replace?: boolean } = {}) => {
    const location = buildHomeLocation(target);
    if (options.replace) {
      await router.replace(location);
      return;
    }

    await router.push(location);
  };

  const openHomeAll = (options?: { replace?: boolean }) =>
    openHome({ view: 'all' }, options);

  const openHomeArtist = (artistName: string, options?: { replace?: boolean }) =>
    openHome({ view: 'artist', filter: artistName }, options);

  const openHomeAlbum = (albumKey: string, options?: { replace?: boolean }) =>
    openHome({ view: 'album', filter: albumKey }, options);

  const openHomePlaylist = (playlistId: string, options?: { replace?: boolean }) =>
    openHome({ view: 'playlist', filter: playlistId }, options);

  const openHomeFolder = (folderPath?: string, options?: { replace?: boolean }) =>
    openHome({ view: 'folder', folder: folderPath }, options);

  const openHomeStatistics = (options?: { replace?: boolean }) =>
    openHome({ view: 'statistics' }, options);

  return {
    openHome,
    openHomeAll,
    openHomeArtist,
    openHomeAlbum,
    openHomePlaylist,
    openHomeFolder,
    openHomeStatistics,
  };
}
