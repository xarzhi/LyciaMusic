import * as State from './playerState';
import { playerStorage } from '../services/storage/playerStorage';
import { useSettingsStore } from '../stores/settings';

interface PlayerPersistenceKeys {
  playerPlaylistPaths: string;
  playerQueuePaths: string;
  legacyPlayerPlaylist: string;
  legacyPlayerQueue: string;
}

export const createPlayerPersistence = ({ keys }: { keys: PlayerPersistenceKeys }) => {
  const settingsStore = useSettingsStore();
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const flushPersistedState = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    playerStorage.writePlayerState({
      playlistPathKey: keys.playerPlaylistPaths,
      queuePathKey: keys.playerQueuePaths,
      legacyPlaylistKey: keys.legacyPlayerPlaylist,
      legacyQueueKey: keys.legacyPlayerQueue,
      songList: State.songList.value,
      watchedFolders: State.watchedFolders.value,
      favoritePaths: State.favoritePaths.value,
      playlists: State.playlists.value,
      settings: settingsStore.settings,
      playQueue: State.playQueue.value,
      artistCustomOrder: State.artistCustomOrder.value,
      albumCustomOrder: State.albumCustomOrder.value,
      folderCustomOrder: State.folderCustomOrder.value,
      localCustomOrder: State.localCustomOrder.value,
    });
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
