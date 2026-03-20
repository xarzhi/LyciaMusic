import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { onMounted, onScopeDispose, watch } from 'vue';
import { storeToRefs } from 'pinia';

import * as State from './playerState';
import { extractDominantColors } from './colorExtraction';
import {
  playerStorage,
  playerStorageKeys,
  type AlbumSortMode,
  type ArtistSortMode,
  type FolderSortMode,
  type LocalSortMode,
  type PlaylistSortMode,
} from '../services/storage/playerStorage';
import { useCollectionsStore } from '../stores/collections';
import { useLibraryStore } from '../stores/library';
import { mergeAppSettings, useSettingsStore } from '../stores/settings';
import type { AppSettings } from '../types';

interface SeekCompletedPayload {
  request_id: number;
  time: number;
}

interface LibraryScanBatchPayload {
  songs: State.Song[];
  deleted_paths: string[];
  folder_path: string;
  folder_index: number;
  folder_total: number;
}

interface LibraryScanProgressPayload extends State.LibraryScanProgress {}

interface CreatePlayerLifecycleDeps {
  bootstrapLibrary: () => Promise<void>;
  togglePlay: () => void | Promise<void>;
  nextSong: () => void;
  prevSong: () => void;
  applyLibraryScanBatch: (payload: LibraryScanBatchPayload) => void;
  flushBufferedLibraryScanBatch: () => void;
  handleSeekCompleted: (payload: SeekCompletedPayload) => void;
  schedulePersistedState: () => void;
  flushPersistedState: () => void;
  restorePathBackedState: () => Promise<void>;
  restoreRecentHistory: () => Promise<void>;
  refreshStateSongReferences: () => void;
  disposePlayerPlayback: () => void;
  disposeLibraryRuntime: () => void;
  disposePlayerPersistence: () => void;
  disposeLibraryBatch: () => void;
  lastSongPathKey: string;
  legacyLastSongKey: string;
}

let lifecycleInitDone = false;
let dominantColorTaskId = 0;

const restoreOutputDevice = async () => {
  const storedOutputDevice = playerStorage.getString(playerStorageKeys.outputDevice);
  const storedOutputMode = playerStorage.getString(playerStorageKeys.outputDeviceMode);

  if ((storedOutputMode === 'manual' || (!storedOutputMode && storedOutputDevice)) && storedOutputDevice) {
    await invoke('set_output_device', { deviceId: storedOutputDevice }).catch(error => {
      console.warn('Failed to restore output device:', error);
    });
    return;
  }

  await invoke('set_output_device', { deviceId: null }).catch(error => {
    console.warn('Failed to restore default output device mode:', error);
  });
};

const restoreSortSettings = () => {
  const storedArtistSort = playerStorage.getString(playerStorageKeys.artistSortMode);
  if (storedArtistSort) {
    State.artistSortMode.value = storedArtistSort as ArtistSortMode;
  }

  const storedAlbumSort = playerStorage.getString(playerStorageKeys.albumSortMode);
  if (storedAlbumSort && ['count', 'name', 'artist', 'custom'].includes(storedAlbumSort)) {
    State.albumSortMode.value = storedAlbumSort as AlbumSortMode;
  }

  const storedArtistOrder = playerStorage.readStringArray(playerStorageKeys.artistCustomOrder);
  if (storedArtistOrder) {
    State.artistCustomOrder.value = storedArtistOrder;
  }

  const storedAlbumOrder = playerStorage.readStringArray(playerStorageKeys.albumCustomOrder);
  if (storedAlbumOrder) {
    State.albumCustomOrder.value = storedAlbumOrder;
  }

  const storedFolderSort = playerStorage.getString(playerStorageKeys.folderSortMode);
  if (storedFolderSort && ['title', 'name', 'artist', 'added_at', 'custom'].includes(storedFolderSort)) {
    State.folderSortMode.value = storedFolderSort as FolderSortMode;
  }

  const storedLocalSort = playerStorage.getString(playerStorageKeys.localSortMode);
  if (storedLocalSort && ['title', 'name', 'artist', 'added_at', 'custom', 'default'].includes(storedLocalSort)) {
    State.localSortMode.value = storedLocalSort as LocalSortMode;
  }

  const storedPlaylistSort = playerStorage.getString(playerStorageKeys.playlistSortMode);
  if (storedPlaylistSort && ['title', 'name', 'artist', 'added_at', 'custom'].includes(storedPlaylistSort)) {
    State.playlistSortMode.value = storedPlaylistSort as PlaylistSortMode;
  }

  const storedFolderOrder = playerStorage.readObject<Record<string, string[]>>(playerStorageKeys.folderCustomOrder);
  if (storedFolderOrder) {
    State.folderCustomOrder.value = storedFolderOrder;
  }

  const storedLocalOrder = playerStorage.readStringArray(playerStorageKeys.localCustomOrder);
  if (storedLocalOrder) {
    State.localCustomOrder.value = storedLocalOrder;
  }
};

const restoreAppSettings = (
  currentSettings: AppSettings,
  replaceSettings: (settings: AppSettings) => void,
) => {
  const storedSettings = playerStorage.readSettings();
  if (!storedSettings) return;

  try {
    const saved = storedSettings as Partial<typeof currentSettings>;
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
    type SavedThemeShape = Partial<typeof currentSettings.theme> & {
      enableDynamicBg?: boolean;
      dynamicBgType?: string;
      windowMaterial?: string;
    };

    const savedTheme =
      (saved.theme && typeof saved.theme === 'object' ? saved.theme : {}) as SavedThemeShape;
    const savedSidebar =
      (saved.sidebar && typeof saved.sidebar === 'object' ? saved.sidebar : {}) as Partial<typeof currentSettings.sidebar>;
    const savedCustomBackground =
      savedTheme.customBackground && typeof savedTheme.customBackground === 'object'
        ? savedTheme.customBackground
        : {} as Partial<typeof currentSettings.theme.customBackground>;

    let dynamicBgType = savedTheme.dynamicBgType;
    if (dynamicBgType === undefined && savedTheme.enableDynamicBg !== undefined) {
      dynamicBgType = savedTheme.enableDynamicBg ? 'flow' : 'none';
    }

    const savedWindowMaterial = typeof savedTheme.windowMaterial === 'string'
      && ['none', 'mica', 'acrylic'].includes(savedTheme.windowMaterial)
      ? savedTheme.windowMaterial as typeof currentSettings.theme.windowMaterial
      : currentSettings.theme.windowMaterial;

    replaceSettings(mergeAppSettings(currentSettings, {
      ...saved,
      theme: {
        ...savedTheme,
        windowMaterial: savedWindowMaterial,
        dynamicBgType:
          savedWindowMaterial !== 'none'
            ? 'none'
            : (dynamicBgType || currentSettings.theme.dynamicBgType),
        customBackground: savedCustomBackground,
      },
      sidebar: savedSidebar,
    }));
  } catch (error) {
    console.error('Failed to parse settings:', error);
  }
};

export const createPlayerLifecycle = ({
  bootstrapLibrary,
  togglePlay,
  nextSong,
  prevSong,
  applyLibraryScanBatch,
  flushBufferedLibraryScanBatch,
  handleSeekCompleted,
  schedulePersistedState,
  flushPersistedState,
  restorePathBackedState,
  restoreRecentHistory,
  refreshStateSongReferences,
  disposePlayerPlayback,
  disposeLibraryRuntime,
  disposePlayerPersistence,
  disposeLibraryBatch,
  lastSongPathKey,
  legacyLastSongKey,
}: CreatePlayerLifecycleDeps) => {
  const collectionsStore = useCollectionsStore();
  const libraryStore = useLibraryStore();
  const settingsStore = useSettingsStore();
  const { settings } = storeToRefs(settingsStore);
  const { songList, watchedFolders } = storeToRefs(libraryStore);
  const { favoritePaths, playlists } = storeToRefs(collectionsStore);

  onMounted(async () => {
    await bootstrapLibrary();
  });

  const init = () => {
    if (lifecycleInitDone) {
      return;
    }
    lifecycleInitDone = true;

    const listenerRegistrations = [
      listen('player:play', () => {
        if (!State.isPlaying.value) {
          void togglePlay();
        }
      }),
      listen('player:pause', () => {
        if (State.isPlaying.value) {
          void togglePlay();
        }
      }),
      listen('player:next', () => {
        nextSong();
      }),
      listen('player:prev', () => {
        prevSong();
      }),
      listen<LibraryScanBatchPayload>('library-scan-batch', event => {
        applyLibraryScanBatch(event.payload);
      }),
      listen<LibraryScanProgressPayload>('library-scan-progress', event => {
        libraryStore.setLibraryScanProgress({
          ...event.payload,
          message: event.payload.message ?? null,
        });

        if (event.payload.failed) {
          libraryStore.setLastLibraryScanError(event.payload.message ?? 'Library scan failed');
        }

        if (event.payload.done) {
          flushBufferedLibraryScanBatch();
        }
      }),
      listen<SeekCompletedPayload>('seek_completed', event => {
        handleSeekCompleted(event.payload);
      }),
    ];

    watch(State.volume, value => {
      playerStorage.writeNumber(playerStorageKeys.volume, value);
    });

    watch(State.playMode, value => {
      playerStorage.writeNumber(playerStorageKeys.playMode, value);
    });

    watch(
      [
        () => songList.value.map(song => song.path),
        watchedFolders,
        favoritePaths,
        playlists,
        settings,
        () => State.playQueue.value.map(song => song.path),
        State.artistCustomOrder,
        State.albumCustomOrder,
        State.folderCustomOrder,
        State.localCustomOrder,
      ],
      () => {
        schedulePersistedState();
      },
      { deep: true }
    );

    watch(State.artistSortMode, value => {
      playerStorage.setString(playerStorageKeys.artistSortMode, value);
    });
    watch(State.albumSortMode, value => {
      playerStorage.setString(playerStorageKeys.albumSortMode, value);
    });
    watch(State.folderSortMode, value => {
      playerStorage.setString(playerStorageKeys.folderSortMode, value);
    });
    watch(State.localSortMode, value => {
      playerStorage.setString(playerStorageKeys.localSortMode, value);
    });
    watch(State.playlistSortMode, value => {
      playerStorage.setString(playerStorageKeys.playlistSortMode, value);
    });

    watch(State.currentSong, song => {
      if (song?.path) {
        playerStorage.setString(lastSongPathKey, song.path);
        playerStorage.remove(legacyLastSongKey);
        return;
      }

      playerStorage.remove(lastSongPathKey);
      playerStorage.remove(legacyLastSongKey);
    });

    watch(State.currentCover, async currentCover => {
      if (!currentCover) return;

      const taskId = ++dominantColorTaskId;
      let coverUrl = currentCover;
      if (!currentCover.startsWith('http') && !currentCover.startsWith('data:')) {
        coverUrl = convertFileSrc(currentCover);
      }

      const colors = await extractDominantColors(coverUrl, 4);
      if (taskId !== dominantColorTaskId) return;
      State.dominantColors.value = colors;
    });

    watch(State.isPlaying, playing => {
      if (!playing) {
        playerStorage.writeNumber(playerStorageKeys.lastTime, State.currentTime.value);
      }
    });

    const beforeUnloadHandler = () => {
      flushPersistedState();
      playerStorage.writeNumber(playerStorageKeys.lastTime, State.currentTime.value);
    };

    onMounted(async () => {
      const storedVolume = playerStorage.readNumber(playerStorageKeys.volume);
      if (storedVolume !== null) {
        State.volume.value = storedVolume;
        await invoke('set_volume', { volume: State.volume.value / 100 });
      }

      await restoreOutputDevice();

      libraryStore.setWatchedFolders(
        playerStorage.readStringArray(playerStorageKeys.watchedFolders) ?? [],
      );

      collectionsStore.setFavoritePaths(
        playerStorage.readStringArray(playerStorageKeys.favorites) ?? [],
      );

      collectionsStore.setPlaylists(playerStorage.readPlaylists());

      restoreSortSettings();
      restoreAppSettings(settings.value, settingsStore.replaceSettings);

      await restorePathBackedState();
      await restoreRecentHistory();
      refreshStateSongReferences();

      const storedLastTime = playerStorage.readNumber(playerStorageKeys.lastTime);
      if (storedLastTime !== null) {
        State.currentTime.value = storedLastTime;
      }

      window.addEventListener('beforeunload', beforeUnloadHandler);
    });

    onScopeDispose(() => {
      void Promise.all(listenerRegistrations).then(unlisteners => {
        unlisteners.forEach(unlisten => unlisten());
      });
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      disposePlayerPlayback();
      disposeLibraryRuntime();
      disposePlayerPersistence();
      disposeLibraryBatch();
    });
  };

  return {
    init,
  };
};
