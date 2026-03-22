import { storeToRefs } from 'pinia';
import { playerStorage } from '../services/storage/playerStorage';
import { useCollectionsStore } from '../stores/collections';
import { useLibraryStore } from '../stores/library';
import { usePlaybackStore } from '../stores/playback';
import { useSettingsStore } from '../stores/settings';

interface PlayerPersistenceKeys {
  playerPlaylistPaths: string;
  playerQueuePaths: string;
  legacyPlayerPlaylist: string;
  legacyPlayerQueue: string;
}

export const createPlayerPersistence = ({ keys }: { keys: PlayerPersistenceKeys }) => {
  const collectionsStore = useCollectionsStore();
  const libraryStore = useLibraryStore();
  const playbackStore = usePlaybackStore();
  const settingsStore = useSettingsStore();
  const {
    artistCustomOrder,
    albumCustomOrder,
    folderCustomOrder,
    localCustomOrder,
  } = storeToRefs(libraryStore);
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
      songList: libraryStore.songList,
      watchedFolders: libraryStore.watchedFolders,
      favoritePaths: collectionsStore.favoritePaths,
      playlists: collectionsStore.playlists,
      settings: settingsStore.settings,
      playQueue: playbackStore.playQueue,
      artistCustomOrder: artistCustomOrder.value,
      albumCustomOrder: albumCustomOrder.value,
      folderCustomOrder: folderCustomOrder.value,
      localCustomOrder: localCustomOrder.value,
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
