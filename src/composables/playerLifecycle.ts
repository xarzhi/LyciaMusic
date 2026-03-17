import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { onMounted, onScopeDispose, watch } from 'vue';
import * as State from './playerState';
import { extractDominantColors } from './colorExtraction';

const PLAYER_OUTPUT_DEVICE_KEY = 'player_output_device';
const PLAYER_OUTPUT_DEVICE_MODE_KEY = 'player_output_device_mode';
const PLAYER_LAST_TIME_KEY = 'player_last_time';

type ArtistSortMode = 'count' | 'name' | 'custom';
type AlbumSortMode = 'count' | 'name' | 'artist' | 'custom';
type FolderSortMode = 'title' | 'name' | 'artist' | 'added_at' | 'custom';
type LocalSortMode = 'title' | 'name' | 'artist' | 'added_at' | 'custom' | 'default';
type PlaylistSortMode = 'title' | 'name' | 'artist' | 'added_at' | 'custom';

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
  const storedOutputDevice = localStorage.getItem(PLAYER_OUTPUT_DEVICE_KEY);
  const storedOutputMode = localStorage.getItem(PLAYER_OUTPUT_DEVICE_MODE_KEY);

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
  const storedArtistSort = localStorage.getItem('player_artist_sort_mode');
  if (storedArtistSort) {
    State.artistSortMode.value = storedArtistSort as ArtistSortMode;
  }

  const storedAlbumSort = localStorage.getItem('player_album_sort_mode');
  if (storedAlbumSort && ['count', 'name', 'artist', 'custom'].includes(storedAlbumSort)) {
    State.albumSortMode.value = storedAlbumSort as AlbumSortMode;
  }

  const storedArtistOrder = localStorage.getItem('player_artist_custom_order');
  if (storedArtistOrder) {
    try {
      State.artistCustomOrder.value = JSON.parse(storedArtistOrder);
    } catch {}
  }

  const storedAlbumOrder = localStorage.getItem('player_album_custom_order');
  if (storedAlbumOrder) {
    try {
      State.albumCustomOrder.value = JSON.parse(storedAlbumOrder);
    } catch {}
  }

  const storedFolderSort = localStorage.getItem('player_folder_sort_mode');
  if (storedFolderSort && ['title', 'name', 'artist', 'added_at', 'custom'].includes(storedFolderSort)) {
    State.folderSortMode.value = storedFolderSort as FolderSortMode;
  }

  const storedLocalSort = localStorage.getItem('player_local_sort_mode');
  if (storedLocalSort && ['title', 'name', 'artist', 'added_at', 'custom', 'default'].includes(storedLocalSort)) {
    State.localSortMode.value = storedLocalSort as LocalSortMode;
  }

  const storedPlaylistSort = localStorage.getItem('player_playlist_sort_mode');
  if (storedPlaylistSort && ['title', 'name', 'artist', 'added_at', 'custom'].includes(storedPlaylistSort)) {
    State.playlistSortMode.value = storedPlaylistSort as PlaylistSortMode;
  }

  const storedFolderOrder = localStorage.getItem('player_folder_custom_order');
  if (storedFolderOrder) {
    try {
      const parsedOrder = JSON.parse(storedFolderOrder);
      if (parsedOrder && typeof parsedOrder === 'object' && !Array.isArray(parsedOrder)) {
        State.folderCustomOrder.value = parsedOrder;
      }
    } catch {}
  }

  const storedLocalOrder = localStorage.getItem('player_local_custom_order');
  if (storedLocalOrder) {
    try {
      const parsedOrder = JSON.parse(storedLocalOrder);
      if (Array.isArray(parsedOrder)) {
        State.localCustomOrder.value = parsedOrder;
      }
    } catch {}
  }
};

const restoreAppSettings = () => {
  const storedSettings = localStorage.getItem('player_settings');
  if (!storedSettings) return;

  try {
    const saved = JSON.parse(storedSettings);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;

    const savedTheme =
      saved.theme && typeof saved.theme === 'object' ? saved.theme : {};
    const savedSidebar =
      saved.sidebar && typeof saved.sidebar === 'object' ? saved.sidebar : {};
    const savedCustomBackground =
      savedTheme.customBackground && typeof savedTheme.customBackground === 'object'
        ? savedTheme.customBackground
        : {};

    let dynamicBgType = savedTheme.dynamicBgType;
    if (dynamicBgType === undefined && savedTheme.enableDynamicBg !== undefined) {
      dynamicBgType = savedTheme.enableDynamicBg ? 'flow' : 'none';
    }

    const savedWindowMaterial = ['none', 'mica', 'acrylic'].includes(savedTheme.windowMaterial)
      ? savedTheme.windowMaterial
      : State.settings.value.theme.windowMaterial;

    State.settings.value = {
      ...State.settings.value,
      ...saved,
      theme: {
        ...State.settings.value.theme,
        ...savedTheme,
        windowMaterial: savedWindowMaterial,
        dynamicBgType:
          savedWindowMaterial !== 'none'
            ? 'none'
            : (dynamicBgType || State.settings.value.theme.dynamicBgType),
        customBackground: {
          ...State.settings.value.theme.customBackground,
          ...savedCustomBackground,
        },
      },
      sidebar: {
        ...State.settings.value.sidebar,
        ...savedSidebar,
      },
    };
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
        State.libraryScanProgress.value = {
          ...event.payload,
          message: event.payload.message ?? null,
        };

        if (event.payload.failed) {
          State.lastLibraryScanError.value = event.payload.message ?? '扫描音乐库时出现问题';
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
      localStorage.setItem('player_volume', value.toString());
    });

    watch(State.playMode, value => {
      localStorage.setItem('player_mode', value.toString());
    });

    watch(
      [
        () => State.songList.value.map(song => song.path),
        State.watchedFolders,
        State.favoritePaths,
        State.playlists,
        State.settings,
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
      localStorage.setItem('player_artist_sort_mode', value);
    });
    watch(State.albumSortMode, value => {
      localStorage.setItem('player_album_sort_mode', value);
    });
    watch(State.folderSortMode, value => {
      localStorage.setItem('player_folder_sort_mode', value);
    });
    watch(State.localSortMode, value => {
      localStorage.setItem('player_local_sort_mode', value);
    });
    watch(State.playlistSortMode, value => {
      localStorage.setItem('player_playlist_sort_mode', value);
    });

    watch(State.currentSong, song => {
      if (song?.path) {
        localStorage.setItem(lastSongPathKey, song.path);
        localStorage.removeItem(legacyLastSongKey);
        return;
      }

      localStorage.removeItem(lastSongPathKey);
      localStorage.removeItem(legacyLastSongKey);
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
        localStorage.setItem(PLAYER_LAST_TIME_KEY, State.currentTime.value.toString());
      }
    });

    const beforeUnloadHandler = () => {
      flushPersistedState();
      localStorage.setItem(PLAYER_LAST_TIME_KEY, State.currentTime.value.toString());
    };

    onMounted(async () => {
      const storedVolume = localStorage.getItem('player_volume');
      if (storedVolume) {
        State.volume.value = parseInt(storedVolume, 10);
        await invoke('set_volume', { volume: State.volume.value / 100 });
      }

      await restoreOutputDevice();

      const storedFolders = localStorage.getItem('player_watched_folders');
      if (storedFolders) {
        try {
          State.watchedFolders.value = JSON.parse(storedFolders);
        } catch {}
      }

      const storedFavorites = localStorage.getItem('player_favorites');
      if (storedFavorites) {
        try {
          State.favoritePaths.value = JSON.parse(storedFavorites);
        } catch {}
      }

      const storedPlaylists = localStorage.getItem('player_custom_playlists');
      if (storedPlaylists) {
        try {
          State.playlists.value = JSON.parse(storedPlaylists);
        } catch {}
      }

      restoreSortSettings();
      restoreAppSettings();

      await restorePathBackedState();
      await restoreRecentHistory();
      refreshStateSongReferences();

      const storedLastTime = localStorage.getItem(PLAYER_LAST_TIME_KEY);
      if (storedLastTime) {
        State.currentTime.value = parseFloat(storedLastTime);
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
