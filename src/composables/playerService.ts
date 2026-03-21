import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { open } from '@tauri-apps/plugin-dialog';
import * as State from './playerState';
export * from './playerState';
import { useLyrics } from './lyrics';
import { useSettings as useAppSettings } from './settings';
import { useToast } from './toast';
import { createPlayerLibraryBatch } from './playerLibraryBatch';
import { createPlayerLibraryManager } from './playerLibraryManager';
import { createPlayerHistoryFavorites } from './playerHistoryFavorites';
import { createPlayerFileManager } from './playerFileManager';
import { createPlayerFolderTree } from './playerFolderTree';
import { createPlayerFolderImport } from './playerFolderImport';
import { createPlayerUiShell } from './playerUiShell';
import { createPlayerPlayback } from './playerPlayback';
import { createPlayerPersistence } from './playerPersistence';
import { createPlayerPlaylist } from './playerPlaylist';
import { createPlayerQueue } from './playerQueue';
import { createPlayerLibraryRuntime } from './playerLibraryRuntime';
import { createPlayerLifecycle } from './playerLifecycle';
import { createPlayerRestore } from './playerRestore';
import { useCollectionsActions } from './useCollectionsActions';
import { useFileImport } from './useFileImport';
import { useLibrarySync } from './useLibrarySync';
import { useNavigationActions } from './useNavigationActions';
import { usePlaybackActions } from './usePlaybackActions';
import { useWindowActions } from './useWindowActions';
import {
  getLibraryAddScanOptions,
} from './playerLibraryScan';
import type { ScanLibraryOptions } from './playerLibraryScan';
import { compareByAlphabetIndex, sortItemsByAlphabetIndex } from '../utils/alphabetIndex';
import { playerStorage } from '../services/storage/playerStorage';
import { playbackApi } from '../services/tauri/playbackApi';
import { useCollectionsStore } from '../stores/collections';
import { useLibraryStore } from '../stores/library';
import { useNavigationStore } from '../stores/navigation';
import { usePlaybackStore } from '../stores/playback';
import { useUiStore } from '../stores/ui';




// Helper: detect whether a song belongs directly under the given folder.

const isDirectParent = (parentPath: string, childPath: string) => {

  if (!parentPath || !childPath) return false;

  const p = parentPath.replace(/\\/g, '/').replace(/\/$/, '');

  const c = childPath.replace(/\\/g, '/');

  const lastSlash = c.lastIndexOf('/');

  return lastSlash !== -1 && c.substring(0, lastSlash) === p;

};




interface ArtistListItem {
  name: string;
  count: number;
  firstSongPath: string;
}

interface AlbumListItem {
  key: string;
  name: string;
  count: number;
  artist: string;
  firstSongPath: string;
}

type ExternalPathSource = 'drop' | 'open';

interface PlaySongOptions {
  updateShuffleHistory?: boolean;
  clearShuffleFuture?: boolean;
  preserveQueue?: boolean;
}

interface HandleExternalPathsOptions {
  source?: ExternalPathSource;
}

const PLAYER_PLAYLIST_PATHS_KEY = 'player_playlist_paths';
const PLAYER_QUEUE_PATHS_KEY = 'player_queue_paths';
const PLAYER_LAST_SONG_PATH_KEY = 'player_last_song_path';
const LEGACY_PLAYER_PLAYLIST_KEY = 'player_playlist';
const LEGACY_PLAYER_QUEUE_KEY = 'player_queue';
const LEGACY_PLAYER_HISTORY_KEY = 'player_history';
const LEGACY_PLAYER_LAST_SONG_KEY = 'player_last_song';

const finalizeLibraryScanProgress = (songs: State.Song[], failed = false, message?: string) => {
  const libraryStore = useLibraryStore();
  const existing = libraryStore.libraryScanProgress;
  libraryStore.setLibraryScanProgress({
    phase: failed ? 'error' : 'complete',
    current: songs.length,
    total: songs.length,
    folder_path: existing?.folder_path ?? libraryStore.libraryScanSession?.sourcePath ?? '',
    folder_index: existing?.folder_index ?? 0,
    folder_total: existing?.folder_total ?? Math.max(1, libraryStore.libraryFolders.length),
    message: message ?? (failed ? '扫描音乐库时出现问题' : `已完成扫描，共 ${songs.length} 首歌曲`),
    done: true,
    failed,
  });
};

const readStoredStringArray = (key: string): string[] | null => {
  return playerStorage.readStringArray(key);
};

const readStoredSongArray = (key: string): State.Song[] => {
  return playerStorage.readSongArray(key);
};

const readStoredSong = (key: string): State.Song | null => {
  return playerStorage.readSong(key);
};

const readStoredHistory = (key: string): State.HistoryItem[] => {
  return playerStorage.readHistory(key);
};

const getSongArtistNames = (song: State.Song) => {
  if (Array.isArray(song.effective_artist_names) && song.effective_artist_names.length > 0) {
    return song.effective_artist_names;
  }
  if (Array.isArray(song.artist_names) && song.artist_names.length > 0) {
    return song.artist_names;
  }
  return [song.artist || 'Unknown'];
};

const songHasArtist = (song: State.Song, artistName: string) =>
  getSongArtistNames(song).some(name => name === artistName);

const getSongAlbumKey = (song: State.Song) =>
  song.album_key || `${song.album || 'Unknown'}::${song.album_artist || song.artist || 'Unknown'}`;

const matchesAlbumKey = (song: State.Song, albumKey: string) => getSongAlbumKey(song) === albumKey;
const getSongArtistSearchText = (song: State.Song) =>
  [song.artist, song.album_artist, ...getSongArtistNames(song)].join(' ').toLowerCase();

const getSongTitleLabel = (song: State.Song) => song.title || song.name;
const getSongFileNameLabel = (song: State.Song) => song.name;
const dedupePaths = (paths: string[]) => Array.from(new Set(paths.map(path => path.trim()).filter(Boolean)));
const dedupeSongs = (songs: State.Song[]) => {
  const seen = new Set<string>();
  return songs.filter(song => {
    if (seen.has(song.path)) return false;
    seen.add(song.path);
    return true;
  });
};

const createSongLookup = (fallbackSongs: State.Song[] = []) => {
  const libraryStore = useLibraryStore();
  const lookup = new Map<string, State.Song>();

  for (const song of fallbackSongs) {
    if (song?.path && !lookup.has(song.path)) {
      lookup.set(song.path, song);
    }
  }

  for (const song of libraryStore.librarySongs) {
    if (song?.path) {
      lookup.set(song.path, song);
    }
  }

  return lookup;
};

const resolveSongsFromPaths = (paths: string[], fallbackSongs: State.Song[] = []) => {
  const lookup = createSongLookup(fallbackSongs);
  return paths
    .map(path => lookup.get(path))
    .filter((song): song is State.Song => !!song);
};

function createPlayerService() {



  const { loadLyrics } = useLyrics();
  const { settings: appSettings } = useAppSettings();
  const collectionsStore = useCollectionsStore();
  const libraryStore = useLibraryStore();
  const navigationStore = useNavigationStore();
  const playbackStore = usePlaybackStore();
  const uiStore = useUiStore();
  const collectionsRefs = storeToRefs(collectionsStore);
  const libraryRefs = storeToRefs(libraryStore);
  const navigationRefs = storeToRefs(navigationStore);
  const playbackRefs = storeToRefs(playbackStore);
  const uiRefs = storeToRefs(uiStore);
  const { favoritePaths, playlists, recentSongs } = collectionsRefs;
  const {
    songList,
    librarySongs,
    folderTree,
    watchedFolders,
  } = libraryRefs;
  const {
    currentViewMode,
    filterCondition,
    searchQuery,
    localMusicTab,
    currentArtistFilter,
    currentAlbumFilter,
    currentFolderFilter,
    favTab,
    favDetailFilter,
    activeRootPath,
  } = navigationRefs;
  const { currentSong, playMode } = playbackRefs;
  const { isMiniMode, playlistCover } = uiRefs;
  const {
    applyLibraryScanBatch,
    flushBufferedLibraryScanBatch,
    refreshStateSongReferences,
    dispose: disposeLibraryBatch,
  } = createPlayerLibraryBatch({
    createSongLookup,
  });
  let playerQueue: ReturnType<typeof createPlayerQueue>;
  const resetShuffleState = () => playerQueue.resetShuffleState();
  let playerPlayback: ReturnType<typeof createPlayerPlayback>;
  const playerPlaylist = createPlayerPlaylist({
    switchViewToAll: () => navigationStore.switchViewToAll(),
  });
  const playerHistoryFavorites = createPlayerHistoryFavorites({
    legacyPlayerHistoryKey: LEGACY_PLAYER_HISTORY_KEY,
  });
  const collectionsActions = useCollectionsActions({
    playerPlaylist,
    playerHistoryFavorites,
  });
  const playerFileManager = createPlayerFileManager({
    removeSidebarFolderLinked,
    removeFromHistory: (songPaths: string[]) => playerHistoryFavorites.removeFromHistory(songPaths),
    showToast: (message, type) => useToast().showToast(message, type),
  });
  let libraryRuntime: ReturnType<typeof createPlayerLibraryRuntime>;
  const {
    fetchLibraryFolders,
    addLibraryFolderRecord,
    linkLibraryFolder,
    unlinkLibraryFolder,
    linkSidebarFolder,
    unlinkSidebarFolder,
    processExternalPaths,
  } = createPlayerLibraryManager({
    appSettings,
    fetchSidebarTree,
    scanLibrary,
    playSong,
    dedupePaths,
    dedupeSongs,
    resetShuffleState,
  });
  const playerFolderTree = createPlayerFolderTree({
    appSettings,
    addLibraryFolderPath,
    linkFolderTreeToLibrary: linkSidebarFolder,
    unlinkFolderTreeFromLibrary: unlinkSidebarFolder,
    showToast: (message, type) => useToast().showToast(message, type),
  });
  const playerFolderImport = createPlayerFolderImport({
    showToast: (message, type) => useToast().showToast(message, type),
  });
  const playerUiShell = createPlayerUiShell({
    addFolder,
    removeFromHistory: (songPaths: string[]) => playerHistoryFavorites.removeFromHistory(songPaths),
  });
  const playbackActions = usePlaybackActions({
    currentSong,
    playMode,
    getPlayerPlayback: () => playerPlayback,
    getPlayerQueue: () => playerQueue,
    playerUiShell,
  });
  libraryRuntime = createPlayerLibraryRuntime({
    fetchLibraryFolders,
    flushBufferedLibraryScanBatch,
    refreshStateSongReferences,
    finalizeLibraryScanProgress,
    onSilentScanError: () => {
      useToast().showToast("\u540e\u53f0\u626b\u63cf\u5931\u8d25\uff0c\u8bf7\u5728\u97f3\u4e50\u5e93\u8bbe\u7f6e\u4e2d\u91cd\u8bd5", "error");
    },
  });



  // Formatting helpers.

  const {
    restoreRecentHistory,
    restorePathBackedState,
  } = createPlayerRestore({
    keys: {
      playerPlaylistPaths: PLAYER_PLAYLIST_PATHS_KEY,
      playerQueuePaths: PLAYER_QUEUE_PATHS_KEY,
      playerLastSongPath: PLAYER_LAST_SONG_PATH_KEY,
      legacyPlayerPlaylist: LEGACY_PLAYER_PLAYLIST_KEY,
      legacyPlayerQueue: LEGACY_PLAYER_QUEUE_KEY,
      legacyPlayerHistory: LEGACY_PLAYER_HISTORY_KEY,
      legacyPlayerLastSong: LEGACY_PLAYER_LAST_SONG_KEY,
    },
    createSongLookup,
    resolveSongsFromPaths,
    readStoredHistory,
    readStoredSongArray,
    readStoredSong,
    readStoredStringArray,
    loadLibrarySongsFromCache: () => libraryRuntime.loadLibrarySongsFromCache(),
  });
  const {
    flushPersistedState,
    schedulePersistedState,
    dispose: disposePlayerPersistence,
  } = createPlayerPersistence({
    keys: {
      playerPlaylistPaths: PLAYER_PLAYLIST_PATHS_KEY,
      playerQueuePaths: PLAYER_QUEUE_PATHS_KEY,
      legacyPlayerPlaylist: LEGACY_PLAYER_PLAYLIST_KEY,
      legacyPlayerQueue: LEGACY_PLAYER_QUEUE_KEY,
    },
  });

  const playerLifecycle = createPlayerLifecycle({
    bootstrapLibrary: () => libraryRuntime.bootstrapLibrary(),
    togglePlay,
    nextSong,
    prevSong,
    applyLibraryScanBatch,
    flushBufferedLibraryScanBatch,
    handleSeekCompleted: payload => playerPlayback.handleSeekCompleted(payload),
    schedulePersistedState,
    flushPersistedState,
    restorePathBackedState,
    restoreRecentHistory,
    refreshStateSongReferences,
    disposePlayerPlayback: () => playerPlayback.dispose(),
    disposeLibraryRuntime: () => libraryRuntime.dispose(),
    disposePlayerPersistence,
    disposeLibraryBatch,
    lastSongPathKey: PLAYER_LAST_SONG_PATH_KEY,
    legacyLastSongKey: LEGACY_PLAYER_LAST_SONG_KEY,
  });

  function formatDuration(seconds: number) { if (!seconds) return "00:00"; const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; }

  function formatTimeAgo(timestamp: number) { const now = Date.now(); const diff = now - timestamp; const oneHour = 60 * 60 * 1000; if (diff < oneHour) return `${Math.max(1, Math.floor(diff / 60000))}分钟前`; if (diff < 24 * oneHour) return `${Math.floor(diff / oneHour)}小时前`; return `${Math.floor(diff / (24 * oneHour))}天前`; }



  // Computed state.

  const isLocalMusic = computed(() => currentViewMode.value === 'all' || currentViewMode.value === 'artist' || currentViewMode.value === 'album');

  const isFolderMode = computed(() => currentViewMode.value === 'folder');

  // --- Library Management ---
  async function addLibraryFolderLinked(
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean; scanOptions?: ScanLibraryOptions } = {}
  ) {
    const { syncLinked = true, showToast = false, scanOptions } = options;
    const { linkedSidebar, resolvedScanOptions } = await linkLibraryFolder(path, {
      syncLinked,
      scanOptions,
    });

    if (showToast) {
      const toastText = resolvedScanOptions.visibility === 'silent'
        ? "\u5df2\u5c06\u6587\u4ef6\u5939\u52a0\u5165\u97f3\u4e50\u5e93"
        : linkedSidebar
          ? "\u5df2\u5c06\u6587\u4ef6\u5939\u540c\u6b65\u5230\u4fa7\u8fb9\u680f\u548c\u97f3\u4e50\u5e93"
          : "\u5df2\u6dfb\u52a0\u6587\u4ef6\u5939";
      useToast().showToast(toastText, "success");
      return;
      useToast().showToast(
        linkedSidebar
          ? "\u5df2\u5c06\u6587\u4ef6\u5939\u540c\u6b65\u5230\u4fa7\u8fb9\u680f\u548c\u97f3\u4e50\u5e93"
          : "\u5df2\u6dfb\u52a0\u6587\u4ef6\u5939",
        "success"
      );
    }
  }

  async function handleExternalPaths(
    paths: string[],
    options: HandleExternalPathsOptions = {}
  ) {
    const {
      source,
      importedFolderCount,
      skippedFolderCount,
      playableSongs,
      ignoredFileCount,
    } = await processExternalPaths(paths, options);

    if (importedFolderCount > 0 && playableSongs.length > 0) {
      useToast().showToast(
        `已导入 ${importedFolderCount} 个文件夹，并开始播放 ${getSongTitleLabel(playableSongs[0])}`,
        'success'
      );
      if (ignoredFileCount > 0) {
        useToast().showToast(`已忽略 ${ignoredFileCount} 个不支持的文件`, 'info');
      }
      if (skippedFolderCount > 0) {
        useToast().showToast(`${skippedFolderCount} 个文件夹已在音乐库中，已跳过`, 'info');
      }
      return;
    }

    if (importedFolderCount > 0) {
      useToast().showToast(`已导入 ${importedFolderCount} 个文件夹`, 'success');
      if (ignoredFileCount > 0) {
        useToast().showToast(`已忽略 ${ignoredFileCount} 个不支持的文件`, 'info');
      }
      if (skippedFolderCount > 0) {
        useToast().showToast(`${skippedFolderCount} 个文件夹已在音乐库中，已跳过`, 'info');
      }
      return;
    }

    if (playableSongs.length > 1) {
      useToast().showToast(`已载入 ${playableSongs.length} 首歌曲并开始播放`, 'success');
      if (ignoredFileCount > 0) {
        useToast().showToast(`已忽略 ${ignoredFileCount} 个不支持的文件`, 'info');
      }
      if (skippedFolderCount > 0) {
        useToast().showToast(`${skippedFolderCount} 个文件夹已在音乐库中，已跳过`, 'info');
      }
      return;
    }

    if (playableSongs.length === 1) {
      useToast().showToast(`正在播放 ${getSongTitleLabel(playableSongs[0])}`, 'success');
      if (skippedFolderCount > 0) {
        useToast().showToast(`${skippedFolderCount} 个文件夹已在音乐库中，已跳过`, 'info');
      }
      return;
    }

    if (skippedFolderCount > 0) {
      useToast().showToast(`${skippedFolderCount} 个文件夹已在音乐库中，未重复导入`, 'info');
      return;
    }

    useToast().showToast(
      source === 'open'
        ? '没有找到可导入的音乐文件或文件夹'
        : '拖入的内容中没有可导入的音乐文件或文件夹',
      'error'
    );
  }

  async function removeLibraryFolderLinked(
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean } = {}
  ) {
    const { syncLinked = true, showToast = true } = options;

    const { removedSidebar } = await unlinkLibraryFolder(path, { syncLinked });

    if (showToast) {
      useToast().showToast(
        removedSidebar
          ? "\u5df2\u4ece\u672c\u5730\u97f3\u4e50\u5e93\u548c\u4fa7\u8fb9\u680f\u540c\u6b65\u79fb\u9664\u6587\u4ef6\u5939"
          : "\u5df2\u4ece\u97f3\u4e50\u5e93\u79fb\u9664\u6587\u4ef6\u5939",
        "success"
      );
    }
  }

  async function addSidebarFolderLinked(
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean } = {}
  ) {
    return playerFolderTree.addFolderTreeFolderLinked(path, options);
  }

  async function removeSidebarFolderLinked(
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean } = {}
  ) {
    return playerFolderTree.removeFolderTreeFolderLinked(path, options);
  }

  async function addLibraryFolder() {
    try {
      const selected = await open({ directory: true, multiple: false, title: '\u9009\u62e9\u97f3\u4e50\u6587\u4ef6\u5939' });
      if (selected && typeof selected === 'string') {
        const scanOptions = getLibraryAddScanOptions(selected);
        await addLibraryFolderLinked(selected, {
          showToast: scanOptions.visibility === 'silent',
          scanOptions,
        });
      }
    } catch (e) {
      console.error("Failed to add library folder:", e);
      useToast().showToast("\u6dfb\u52a0\u97f3\u4e50\u6587\u4ef6\u5939\u5931\u8d25: " + e, "error");
    }
  }

  async function addLibraryFolderPath(path: string) {
    try {
      await addLibraryFolderRecord(path, getLibraryAddScanOptions(path));
    } catch (e) {
      console.error("Failed to add library folder path:", e);
    }
  }

  async function removeLibraryFolder(path: string) {
    try {
      await removeLibraryFolderLinked(path);
    } catch (e) {
      console.error("Failed to remove library folder:", e);
    }
  }

  // Helper: recursively remove a node from the tree for optimistic UI


  // Physical folder deletion in management mode
  async function deleteFolder(path: string) {
    return playerFileManager.deleteFolder(path);
  }

  // Helper: recursively increment the song count for a folder


  // Helper: recursively decrement the song count for a folder


  // Helper: update folder cover when the first song changes



  // Physical file move in management mode
  async function moveFilePhysical(sourcePath: string, targetFolderPath: string) {
    return playerFileManager.moveFilePhysical(sourcePath, targetFolderPath);
  }

  // Helper: find a node in the tree


  async function scanLibrary(options: ScanLibraryOptions = {}) {
    return libraryRuntime.scanLibrary(options);
    /*

        libraryStore.setLastLibraryScanError(errorMessage);
        finalizeLibraryScanProgress([], true, errorMessage || '扫描音乐库时出现问题');
        if (session.visibility === 'silent') {
          useToast().showToast('后台扫描失败，请在音乐库设置中重试', 'error');
        }
      } finally {
        libraryRefreshPromise = null;
      }
    })();

    return libraryRefreshPromise;
    */
  }

  // --- Sidebar Folder Management (New) ---




  async function fetchSidebarTree() {
    return playerFolderTree.fetchFolderTree();
  }

  async function createFolder(parentPath: string, folderName: string) {
    return playerFolderTree.createFolder(parentPath, folderName);
  }

  async function addSidebarFolder() {
    return playerFolderTree.addFolderTreeFolder();
  }

  async function removeSidebarFolder(path: string) {
    return playerFolderTree.removeFolderTreeFolder(path);
  }



  const artistList = computed<ArtistListItem[]>(() => {



    const map = new Map<string, { count: number; firstSongPath: string }>();



    librarySongs.value.forEach(song => {
      getSongArtistNames(song).forEach(artistName => {
        const key = artistName || 'Unknown';
        const existing = map.get(key);

        if (existing) {
          existing.count += 1;
        } else {
          map.set(key, { count: 1, firstSongPath: song.path });
        }
      });
    });







    const list = Array.from(map, ([name, value]) => ({
      name,
      count: value.count,
      firstSongPath: value.firstSongPath,
    }));







    // Sorting logic



    if (State.artistSortMode.value === 'name') {



      list.sort((a, b) => compareByAlphabetIndex(a.name, b.name));



    } else if (State.artistSortMode.value === 'custom') {



      const orderMap = new Map(State.artistCustomOrder.value.map((name, index) => [name, index]));



      list.sort((a, b) => {



        const left = orderMap.has(a.name) ? orderMap.get(a.name)! : Number.MAX_SAFE_INTEGER;
        const right = orderMap.has(b.name) ? orderMap.get(b.name)! : Number.MAX_SAFE_INTEGER;

        return left - right;



      });



    } else {



      // Default: count



      list.sort((a, b) => b.count - a.count || compareByAlphabetIndex(a.name, b.name));



    }



    return list;



  });







  const albumList = computed<AlbumListItem[]>(() => {



    const map = new Map<string, AlbumListItem>();



    librarySongs.value.forEach(song => {
      const key = getSongAlbumKey(song);
      const existing = map.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, {
          key,
          name: song.album || 'Unknown',
          count: 1,
          artist: song.album_artist || song.artist || 'Unknown',
          firstSongPath: song.path,
        });
      }
    });







    const list = Array.from(map.values());







    // Sorting logic



    if (State.albumSortMode.value === 'name') {



      list.sort((a, b) => compareByAlphabetIndex(a.name, b.name));



    } else if (State.albumSortMode.value === 'custom') {



      const orderMap = new Map(State.albumCustomOrder.value.map((key, index) => [key, index]));



      list.sort((a, b) => {



        const left = orderMap.has(a.key) ? orderMap.get(a.key)! : Number.MAX_SAFE_INTEGER;
        const right = orderMap.has(b.key) ? orderMap.get(b.key)! : Number.MAX_SAFE_INTEGER;

        return left - right;



      });



    } else if (State.albumSortMode.value === 'count') {
      list.sort((a, b) => b.count - a.count || compareByAlphabetIndex(a.artist, b.artist));
    } else {
      list.sort((a, b) => {
        const artistDiff = compareByAlphabetIndex(a.artist, b.artist);
        return artistDiff !== 0 ? artistDiff : compareByAlphabetIndex(a.name, b.name);
      });
    }



    return list;



  });

  const filteredArtistList = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return artistList.value;
    return artistList.value.filter(artist => (artist.name || '').toLowerCase().includes(query));
  });

  const filteredAlbumList = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return albumList.value;
    return albumList.value.filter(album =>
      (album.name || '').toLowerCase().includes(query) ||
      (album.artist || '').toLowerCase().includes(query)
    );
  });







  const folderList = computed(() => {



      // folderList order follows watchedFolders so manual reordering is preserved


    return watchedFolders.value.map(folderPath => {



      // Only count songs directly under the folder, not recursively



      const songsInFolder = songList.value.filter(s => isDirectParent(folderPath, s.path));



      return {



        path: folderPath,



        name: folderPath.split(/[/\\]/).pop() || folderPath,



        count: songsInFolder.length,



        firstSongPath: songsInFolder.length > 0 ? songsInFolder[0].path : ''



      };



    });



  });

  const favoriteSongList = computed(() => { return librarySongs.value.filter(s => favoritePaths.value.includes(s.path)); });

  const favArtistList = computed(() => {
    const map = new Map<string, { count: number; firstSongPath: string }>();
    favoriteSongList.value.forEach(song => {
      getSongArtistNames(song).forEach(name => {
        const existing = map.get(name);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(name, { count: 1, firstSongPath: song.path });
        }
      });
    });
    return Array.from(map, ([name, value]) => ({ name, count: value.count, firstSongPath: value.firstSongPath }))
      .sort((a, b) => b.count - a.count || compareByAlphabetIndex(a.name, b.name));
  });

  const favAlbumList = computed(() => {
    const map = new Map<string, { key: string; name: string; count: number; artist: string; firstSongPath: string }>();
    favoriteSongList.value.forEach(song => {
      const key = getSongAlbumKey(song);
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { key, name: song.album || 'Unknown', count: 1, artist: song.album_artist || song.artist || 'Unknown', firstSongPath: song.path });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || compareByAlphabetIndex(a.artist, b.artist));
  });

  const recentAlbumList = computed(() => {
    const map = new Map<string, { key: string; name: string; artist: string; playedAt: number; firstSongPath: string }>();
    recentSongs.value.forEach(item => {
      const key = getSongAlbumKey(item.song);
      if (!map.has(key) || item.playedAt > map.get(key)!.playedAt) {
        map.set(key, {
          key,
          name: item.song.album || 'Unknown',
          artist: item.song.album_artist || item.song.artist || 'Unknown',
          playedAt: item.playedAt,
          firstSongPath: item.song.path
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.playedAt - a.playedAt);
  });

  const recentPlaylistList = computed(() => { const result: { id: string, name: string, count: number, playedAt: number, firstSongPath: string }[] = []; playlists.value.forEach(pl => { let lastPlayedTime = 0; let hasPlayed = false; const plSongPaths = new Set(pl.songPaths); for (const historyItem of recentSongs.value) { if (plSongPaths.has(historyItem.song.path)) { if (historyItem.playedAt > lastPlayedTime) { lastPlayedTime = historyItem.playedAt; hasPlayed = true; } } } if (hasPlayed) { result.push({ id: pl.id, name: pl.name, count: pl.songPaths.length, playedAt: lastPlayedTime, firstSongPath: pl.songPaths.length > 0 ? pl.songPaths[0] : '' }); } }); return result.sort((a, b) => b.playedAt - a.playedAt); });



  const genreList = computed(() => {

    const map = new Map();

    librarySongs.value.forEach(s => {

      const k = s.genre || 'Unknown';

      map.set(k, (map.get(k) || 0) + 1);

    });

    return Array.from(map).map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count);

  });



  const yearList = computed(() => {

    const map = new Map();

    librarySongs.value.forEach(s => {

      const k = (s.year && s.year.length >= 4) ? s.year.substring(0, 4) : 'Unknown';

      map.set(k, (map.get(k) || 0) + 1);

    });

    return Array.from(map).map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.name.localeCompare(a.name));

  });



  const displaySongList = computed(() => {

    if (searchQuery.value.trim()) {

      const q = searchQuery.value.toLowerCase();

      if (currentViewMode.value === 'favorites') return favoriteSongList.value.filter(s => s.name.toLowerCase().includes(q) || getSongArtistSearchText(s).includes(q));

      if (currentViewMode.value === 'recent') return recentSongs.value.map(h => h.song).filter(s => s.name.toLowerCase().includes(q));

      if (currentViewMode.value === 'all') {
        return sortItemsByAlphabetIndex(
          librarySongs.value.filter(s =>
            s.name.toLowerCase().includes(q) ||
            getSongArtistSearchText(s).includes(q) ||
            s.album.toLowerCase().includes(q),
          ),
          getSongTitleLabel,
        );
      }

      if (currentViewMode.value === 'folder') {
        return sortItemsByAlphabetIndex(
          songList.value.filter(s =>
            s.name.toLowerCase().includes(q) ||
            getSongArtistSearchText(s).includes(q) ||
            s.album.toLowerCase().includes(q),
          ),
          getSongTitleLabel,
        );
      }

      // Search local library first, then fall back to the current folder subset
      return librarySongs.value.filter(s => s.name.toLowerCase().includes(q) || getSongArtistSearchText(s).includes(q) || s.album.toLowerCase().includes(q));

    }

    if (currentViewMode.value === 'all') {
      let base = [...librarySongs.value];
      if (localMusicTab.value === 'artist' && currentArtistFilter.value) {
        base = base.filter(s => songHasArtist(s, currentArtistFilter.value));
      } else if (localMusicTab.value === 'album' && currentAlbumFilter.value) {
        base = base.filter(s => matchesAlbumKey(s, currentAlbumFilter.value));
      }

      // Apply local music sorting
      if (State.localSortMode.value === 'title') {
        base = sortItemsByAlphabetIndex(base, getSongTitleLabel);
      } else if (State.localSortMode.value === 'name') {
        base = sortItemsByAlphabetIndex(base, getSongFileNameLabel);
      } else if (State.localSortMode.value === 'artist') {
        base.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
      } else if (State.localSortMode.value === 'added_at') {
        base.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
      } else if (State.localSortMode.value === 'custom') {
        const orderMap = new Map(State.localCustomOrder.value.map((path, i) => [path, i]));
        base.sort((a, b) => {
          const ia = orderMap.has(a.path) ? orderMap.get(a.path)! : 999999;
          const ib = orderMap.has(b.path) ? orderMap.get(b.path)! : 999999;
          return ia - ib;
        });
      } else {
        base = sortItemsByAlphabetIndex(base, getSongTitleLabel);
      }

      return base;
    }

    // ???????????????????????
    if (currentViewMode.value === 'folder') {
      if (currentFolderFilter.value) {
        let songs = songList.value.filter(s => isDirectParent(currentFolderFilter.value, s.path));

        // Apply folder sorting
        if (State.folderSortMode.value === 'title') {
          songs = sortItemsByAlphabetIndex(songs, getSongTitleLabel);
        } else if (State.folderSortMode.value === 'name') {
          songs = sortItemsByAlphabetIndex(songs, getSongFileNameLabel);
        } else if (State.folderSortMode.value === 'artist') {
          // Sort by artist name
          songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
        } else if (State.folderSortMode.value === 'added_at') {
          // Sort by added time in descending order
          songs.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
        } else if (State.folderSortMode.value === 'custom') {
          // Preserve custom drag-and-drop order
          const customOrder = State.folderCustomOrder.value[currentFolderFilter.value] || [];
          if (customOrder.length > 0) {
            const orderMap = new Map(customOrder.map((path, i) => [path, i]));
            songs.sort((a, b) => {
              const ia = orderMap.has(a.path) ? orderMap.get(a.path)! : 999999;
              const ib = orderMap.has(b.path) ? orderMap.get(b.path)! : 999999;
              return ia - ib;
            });
          }
        }

        return songs;
      } else {
        return []; // No folder selected means an empty list
      }
    }



    if (currentViewMode.value === 'recent') {
      let songs = recentSongs.value.map(h => h.song);

      // Apply sorting shared with local music views
      if (State.localSortMode.value === 'title') {
        songs.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'name') {
        songs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'artist') {
        songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
      } else if (State.localSortMode.value === 'added_at') {
        // Recent plays are already time-ordered, but added_at should still sort by import time
        songs.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
      }

      return songs;
    }

    if (currentViewMode.value === 'favorites') {
      let songs = [];
      if (favTab.value === 'songs') {
        songs = [...favoriteSongList.value];
      } else if (favTab.value === 'artists') {
        songs = favDetailFilter.value?.type === 'artist' ? favoriteSongList.value.filter(s => songHasArtist(s, favDetailFilter.value!.name)) : [];
      } else if (favTab.value === 'albums') {
        songs = favDetailFilter.value?.type === 'album' ? favoriteSongList.value.filter(s => matchesAlbumKey(s, favDetailFilter.value!.name)) : [];
      } else {
        songs = [...favoriteSongList.value];
      }

      // Apply sorting
      if (State.localSortMode.value === 'title') {
        songs.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'name') {
        songs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'artist') {
        songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
      } else if (State.localSortMode.value === 'added_at') {
        songs.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
      }

      return songs;
    }

    if (currentViewMode.value === 'playlist') {
      const pl = playlists.value.find(p => p.id === filterCondition.value);
      if (!pl) return [];

      const songMap = new Map();
      librarySongs.value.forEach(s => songMap.set(s.path, s));
      songList.value.forEach(s => {
        if (!songMap.has(s.path)) songMap.set(s.path, s);
      });

      let songs = pl.songPaths
        .map(path => songMap.get(path))
        .filter((s): s is State.Song => !!s);

      // Apply playlist sorting
      if (State.playlistSortMode.value === 'title') {
        songs.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'zh-CN'));
      } else if (State.playlistSortMode.value === 'name') {
        songs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      } else if (State.playlistSortMode.value === 'artist') {
        songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
      } else if (State.playlistSortMode.value === 'added_at') {
        songs.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
      }
      // Custom mode keeps the playlist's stored songPaths order
      return songs;
    }

    return librarySongs.value.filter(s =>
      songHasArtist(s, filterCondition.value) ||
      matchesAlbumKey(s, filterCondition.value) ||
      (s.genre || 'Unknown') === filterCondition.value ||
      ((s.year?.substring(0, 4)) || 'Unknown') === filterCondition.value
    );

  });



  playerQueue = createPlayerQueue({
    playSong: (song, options) => playerPlayback.playSong(song, options),
    stopPlaybackRuntime: () => playerPlayback.stopPlaybackRuntime(),
    showToast: (message, type) => useToast().showToast(message, type),
  });

  playerPlayback = createPlayerPlayback({
    getDisplaySongList: () => displaySongList.value,
    addToHistory,
    loadLyrics,
    handleAutoNext: playbackActions.handleAutoNext,
    onBeforePlay: (song, options) => {
      playerQueue.handleBeforePlay(song, options);
    },
  });

  watch(displaySongList, async (newList) => {

    if (currentViewMode.value === 'favorites' && (favTab.value === 'artists' || favTab.value === 'albums') && !favDetailFilter.value) return;

    if (newList.length > 0) { try { const cover = await playbackApi.getSongCover(newList[0].path); playlistCover.value = cover; } catch { playlistCover.value = ''; } } else { playlistCover.value = ''; }

  }, { immediate: true });

  const navigationActions = useNavigationActions({
    navigationStore,
    artistList,
    albumList,
  });
  const librarySync = useLibrarySync({
    fetchLibraryFolders,
    addLibraryFolder,
    addLibraryFolderLinked,
    removeLibraryFolder,
    removeLibraryFolderLinked,
    handleExternalPaths,
    scanLibrary,
    addLibraryFolderPath,
    refreshFolder,
    refreshAllFolders,
  });
  const fileImportActions = useFileImport({
    addFolder,
    addFoldersFromStructure,
    getSongsInFolder,
    clearLocalMusic,
  });
  const windowActions = useWindowActions({
    playerUiShell,
  });



  async function addFoldersFromStructure() {
    return playerFolderImport.addFoldersFromStructure();
  }







  function getSongsInFolder(folderPath: string) { return playerFolderImport.getSongsInFolder(folderPath); }







  async function moveFilesToFolder(paths: string[], targetFolder: string) {
    return playerFileManager.moveFilesToFolder(paths, targetFolder);
  }



  async function refreshFolder(folderPath: string) {
    return playerFileManager.refreshFolder(folderPath);
  }

  function removeFolder(folderPath: string) {
    playerFileManager.removeFolder(folderPath);
  }

  async function addToHistory(song: State.Song) {
    return playerHistoryFavorites.addToHistory(song);
  }

  function clearLocalMusic() { playerFolderImport.clearLocalMusic(); }

  async function addFolder() {
    return playerFolderImport.addFolder();
  }
  function generateOrganizedPath(song: State.Song): string { return playerFileManager.generateOrganizedPath(song); }
  async function moveFile(song: State.Song, newPath: string) { return playerFileManager.moveFile(song, newPath); }
  async function openInFinder(path: string) { return playerFileManager.openInFinder(path); }
  async function deleteFromDisk(song: State.Song) {
    return playerFileManager.deleteFromDisk(song);
  }

  async function playSong(song: State.Song, options: PlaySongOptions = {}) {
    return playerPlayback.playSong(song, options);
  }
  async function togglePlay() {
    return playerPlayback.togglePlay();
  }

  function nextSong() { playerQueue.nextSong(); }

  function prevSong() { playerQueue.prevSong(); }
  function init() {
    playerLifecycle.init();
  }

  async function refreshAllFolders() {
    return playerFileManager.refreshAllFolders();
  }

  return {
    ...State,
    ...collectionsRefs,
    ...libraryRefs,
    ...navigationRefs,
    ...playbackRefs,
    ...uiRefs,
    artistList, albumList, filteredArtistList, filteredAlbumList, genreList, yearList, folderList, favoriteSongList, favArtistList, favAlbumList, recentAlbumList, recentPlaylistList, displaySongList, isLocalMusic, isFolderMode,
    init, formatDuration, formatTimeAgo,
    // Library
    ...librarySync,
    ...fileImportActions,
    removeFolder,
    moveFile, generateOrganizedPath, openInFinder, deleteFromDisk,
    moveFilesToFolder,
    ...collectionsActions,
    ...navigationActions,
    ...playbackActions,
    ...windowActions,
    // Mini 妯″紡
    isMiniMode,
    reorderWatchedFolders: (from: number, to: number) => libraryStore.reorderWatchedFolders(from, to),
    reorderPlaylists: (from: number, to: number) => collectionsStore.reorderPlaylists(from, to),
    updateArtistOrder: (newOrder: string[]) => {
      State.artistCustomOrder.value = newOrder;
      if (State.artistSortMode.value !== 'custom') State.artistSortMode.value = 'custom';
    },
    updateAlbumOrder: (newOrder: string[]) => {
      State.albumCustomOrder.value = newOrder;
      if (State.albumSortMode.value !== 'custom') State.albumSortMode.value = 'custom';
    },
    updateFolderOrder: (folderPath: string, newOrder: string[]) => {
      State.folderCustomOrder.value[folderPath] = newOrder;
      if (State.folderSortMode.value !== 'custom') State.folderSortMode.value = 'custom';
    },
    updateLocalOrder: (newOrder: string[]) => {
      State.localCustomOrder.value = newOrder;
      if (State.localSortMode.value !== 'custom') State.localSortMode.value = 'custom';
    },
    setFolderSortMode: (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom') => {
      State.folderSortMode.value = mode;
    },
    setLocalSortMode: (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom' | 'default') => {
      State.localSortMode.value = mode;
    },
    setPlaylistSortMode: (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom') => {
      State.playlistSortMode.value = mode;
    },

    // Sidebar (Decoupled)
    folderTree,
    activeRootPath,
    deleteFolder,
    moveFilePhysical,
    fetchFolderTree: fetchSidebarTree,
    addSidebarFolder,
    addSidebarFolderLinked,
    removeSidebarFolder,
    removeSidebarFolderLinked,
    createFolder,
    expandFolderPath: (targetPath: string) => {
      playerFolderTree.expandFolderPath(targetPath);
    },

    folderSortMode: computed(() => State.folderSortMode.value),
    folderCustomOrder: computed(() => State.folderCustomOrder.value),
    localSortMode: computed(() => State.localSortMode.value),
    playlistSortMode: computed(() => State.playlistSortMode.value),
  };
}

let playerService: ReturnType<typeof createPlayerService> | null = null;

export function usePlayerService() {
  if (!playerService) {
    playerService = createPlayerService();
  }

  return playerService;
}










