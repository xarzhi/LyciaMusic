import * as State from './playerState';

interface PlayerPersistenceKeys {
  playerPlaylistPaths: string;
  playerQueuePaths: string;
  legacyPlayerPlaylist: string;
  legacyPlayerQueue: string;
}

export const createPlayerPersistence = ({ keys }: { keys: PlayerPersistenceKeys }) => {
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const flushPersistedState = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    localStorage.setItem(keys.playerPlaylistPaths, JSON.stringify(State.songList.value.map(song => song.path)));
    localStorage.setItem('player_watched_folders', JSON.stringify(State.watchedFolders.value));
    localStorage.setItem('player_favorites', JSON.stringify(State.favoritePaths.value));
    localStorage.setItem('player_custom_playlists', JSON.stringify(State.playlists.value));
    localStorage.setItem('player_settings', JSON.stringify(State.settings.value));
    localStorage.setItem(keys.playerQueuePaths, JSON.stringify(State.playQueue.value.map(song => song.path)));
    localStorage.setItem('player_artist_custom_order', JSON.stringify(State.artistCustomOrder.value));
    localStorage.setItem('player_album_custom_order', JSON.stringify(State.albumCustomOrder.value));
    localStorage.setItem('player_folder_custom_order', JSON.stringify(State.folderCustomOrder.value));
    localStorage.setItem('player_local_custom_order', JSON.stringify(State.localCustomOrder.value));
    localStorage.removeItem(keys.legacyPlayerPlaylist);
    localStorage.removeItem(keys.legacyPlayerQueue);
  };

  const schedulePersistedState = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(() => {
      flushPersistedState();
    }, 200);
  };

  const dispose = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
  };

  return {
    flushPersistedState,
    schedulePersistedState,
    dispose,
  };
};
