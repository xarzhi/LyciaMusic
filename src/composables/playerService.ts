import { watch } from 'vue';
import { storeToRefs } from 'pinia';

import { useLyrics } from './lyrics';
import { useToast } from './toast';
import { createPlayerFileManager } from './playerFileManager';
import { createPlayerFolderImport } from './playerFolderImport';
import { createPlayerFolderTree } from './playerFolderTree';
import { createPlayerHistoryFavorites } from './playerHistoryFavorites';
import { createPlayerLibraryBatch } from './playerLibraryBatch';
import { createPlayerLibraryManager } from './playerLibraryManager';
import { createPlayerLibraryRuntime } from './playerLibraryRuntime';
import { createPlayerLifecycle } from './playerLifecycle';
import { createPlayerPersistence } from './playerPersistence';
import { createPlayerPlayback } from './playerPlayback';
import { createPlayerPlaylist } from './playerPlaylist';
import { createPlayerQueue } from './playerQueue';
import { createPlayerRestore } from './playerRestore';
import { createPlayerUiShell } from './playerUiShell';
import type { ScanLibraryOptions } from './playerLibraryScan';
import { useCollectionsActions } from './useCollectionsActions';
import { useFileImport } from './useFileImport';
import { useLibrarySync } from './useLibrarySync';
import { useNavigationActions } from './useNavigationActions';
import { usePlaybackActions } from './usePlaybackActions';
import { usePlayerLibraryView } from './usePlayerLibraryView';
import { useWindowActions } from './useWindowActions';
import { playerStorage } from '../services/storage/playerStorage';
import { playbackApi } from '../services/tauri/playbackApi';
import { useCollectionsStore } from '../stores/collections';
import { useLibraryStore } from '../stores/library';
import { useNavigationStore } from '../stores/navigation';
import { usePlaybackStore } from '../stores/playback';
import { useUiStore } from '../stores/ui';
import type { HistoryItem, Song } from '../types';

interface PlaySongOptions {
  updateShuffleHistory?: boolean;
  clearShuffleFuture?: boolean;
  preserveQueue?: boolean;
}

const PLAYER_PLAYLIST_PATHS_KEY = 'player_playlist_paths';
const PLAYER_QUEUE_PATHS_KEY = 'player_queue_paths';
const PLAYER_LAST_SONG_PATH_KEY = 'player_last_song_path';
const LEGACY_PLAYER_PLAYLIST_KEY = 'player_playlist';
const LEGACY_PLAYER_QUEUE_KEY = 'player_queue';
const LEGACY_PLAYER_HISTORY_KEY = 'player_history';
const LEGACY_PLAYER_LAST_SONG_KEY = 'player_last_song';

const finalizeLibraryScanProgress = (songs: Song[], failed = false, message?: string) => {
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

const readStoredStringArray = (key: string): string[] | null => playerStorage.readStringArray(key);
const readStoredSongArray = (key: string): Song[] => playerStorage.readSongArray(key);
const readStoredSong = (key: string): Song | null => playerStorage.readSong(key);
const readStoredHistory = (key: string): HistoryItem[] => playerStorage.readHistory(key);

const dedupePaths = (paths: string[]) =>
  Array.from(new Set(paths.map(path => path.trim()).filter(Boolean)));

const dedupeSongs = (songs: Song[]) => {
  const seen = new Set<string>();

  return songs.filter(song => {
    if (seen.has(song.path)) {
      return false;
    }

    seen.add(song.path);
    return true;
  });
};

const createSongLookup = (fallbackSongs: Song[] = []) => {
  const libraryStore = useLibraryStore();
  const lookup = new Map<string, Song>();

  for (const song of fallbackSongs) {
    if (song?.path && !lookup.has(song.path)) {
      lookup.set(song.path, song);
    }
  }

  for (const song of libraryStore.canonicalSongs) {
    if (song?.path) {
      lookup.set(song.path, song);
    }
  }

  return lookup;
};

const resolveSongsFromPaths = (paths: string[], fallbackSongs: Song[] = []) => {
  const lookup = createSongLookup(fallbackSongs);

  return paths
    .map(path => lookup.get(path))
    .filter((song): song is Song => !!song);
};

const formatDuration = (seconds: number) => {
  if (!seconds) {
    return '00:00';
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatTimeAgo = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;
  const oneHour = 60 * 60 * 1000;

  if (diff < oneHour) {
    return `${Math.max(1, Math.floor(diff / 60000))}分钟前`;
  }

  if (diff < 24 * oneHour) {
    return `${Math.floor(diff / oneHour)}小时前`;
  }

  return `${Math.floor(diff / (24 * oneHour))}天前`;
};

function createPlayerService() {
  const { loadLyrics } = useLyrics();
  const { showToast } = useToast();

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

  const { playlistSortMode } = collectionsRefs;
  const {
    artistSortMode,
    albumSortMode,
    artistCustomOrder,
    albumCustomOrder,
    folderSortMode,
    folderCustomOrder,
    localSortMode,
    localCustomOrder,
  } = libraryRefs;
  const { currentViewMode, favTab, favDetailFilter } = navigationRefs;
  const { currentSong, playMode } = playbackRefs;
  const { playlistCover } = uiRefs;

  const libraryView = usePlayerLibraryView();
  const {
    artistList,
    albumList,
    filteredArtistList,
    filteredAlbumList,
    genreList,
    yearList,
    folderList,
    favoriteSongList,
    favArtistList,
    favAlbumList,
    recentAlbumList,
    recentPlaylistList,
    currentViewSongs,
    isLocalMusic,
    isFolderMode,
  } = libraryView;

  const {
    applyLibraryScanBatch,
    flushBufferedLibraryScanBatch,
    refreshStateSongReferences,
    dispose: disposeLibraryBatch,
  } = createPlayerLibraryBatch({
    createSongLookup,
  });

  let librarySync: ReturnType<typeof useLibrarySync>;
  let playerQueue: ReturnType<typeof createPlayerQueue>;
  let playerPlayback: ReturnType<typeof createPlayerPlayback>;
  let libraryRuntime: ReturnType<typeof createPlayerLibraryRuntime>;

  const addLibraryFolder = async (): Promise<void> => {
    await librarySync.addLibraryFolder();
  };
  const addLibraryFolderPath = async (path: string): Promise<void> => {
    await librarySync.addLibraryFolderPath(path);
  };
  const removeLibraryFolderPath = async (path: string): Promise<void> => {
    await librarySync.removeLibraryFolderPath(path);
  };
  const removeLibraryFolderLinked = async (
    path: string,
    options: { showToast?: boolean } = {},
  ): Promise<void> => {
    await librarySync.removeLibraryFolderLinked(path, options);
  };
  const resetShuffleState = () => playerQueue.resetShuffleState();

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
    removeLibraryFolderLinked,
    removeFromHistory: (songPaths: string[]) => playerHistoryFavorites.removeFromHistory(songPaths),
    showToast,
  });

  const {
    fetchLibraryFolders,
    addLibraryFolderRecord,
    removeLibraryFolderRecord,
    linkLibraryFolder,
    unlinkLibraryFolder,
    processExternalPaths,
  } = createPlayerLibraryManager({
    fetchFolderTree,
    scanLibrary,
    playSong,
    dedupePaths,
    dedupeSongs,
    resetShuffleState,
  });

  const playerFolderTree = createPlayerFolderTree({
    addLibraryFolderPath,
    removeLibraryFolderPath,
    showToast,
  });

  const playerFolderImport = createPlayerFolderImport({
    showToast,
  });

  const playerUiShell = createPlayerUiShell({
    addFolder: () => addLibraryFolder(),
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
      showToast('后台扫描失败，请在音乐库设置中重试', 'error');
    },
  });

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

  playerQueue = createPlayerQueue({
    playSong: (song, options) => playerPlayback.playSong(song, options),
    stopPlaybackRuntime: () => playerPlayback.stopPlaybackRuntime(),
    showToast,
  });

  playerPlayback = createPlayerPlayback({
    getDisplaySongList: () => currentViewSongs.value,
    addToHistory,
    loadLyrics,
    handleAutoNext: playbackActions.handleAutoNext,
    onBeforePlay: (song, options) => {
      playerQueue.handleBeforePlay(song, options);
    },
  });

  watch(currentViewSongs, async newList => {
    if (
      currentViewMode.value === 'favorites' &&
      (favTab.value === 'artists' || favTab.value === 'albums') &&
      !favDetailFilter.value
    ) {
      return;
    }

    if (newList.length === 0) {
      playlistCover.value = '';
      return;
    }

    try {
      playlistCover.value = await playbackApi.getSongCover(newList[0].path);
    } catch {
      playlistCover.value = '';
    }
  }, { immediate: true });

  const navigationActions = useNavigationActions({
    navigationStore,
    artistList,
    albumList,
  });

  librarySync = useLibrarySync({
    fetchLibraryFolders,
    scanLibrary,
    refreshFolder,
    refreshAllFolders,
    linkLibraryFolder,
    unlinkLibraryFolder,
    processExternalPaths,
    addLibraryFolderRecord,
    removeLibraryFolderRecord,
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

  async function deleteFolder(path: string) {
    return playerFileManager.deleteFolder(path);
  }

  async function moveFilePhysical(sourcePath: string, targetFolderPath: string) {
    return playerFileManager.moveFilePhysical(sourcePath, targetFolderPath);
  }

  async function scanLibrary(options: ScanLibraryOptions = {}) {
    return libraryRuntime.scanLibrary(options);
  }

  async function fetchFolderTree() {
    return playerFolderTree.fetchFolderTree();
  }

  async function createFolder(parentPath: string, folderName: string) {
    return playerFolderTree.createFolder(parentPath, folderName);
  }

  async function addFoldersFromStructure() {
    return playerFolderImport.addFoldersFromStructure();
  }

  function getSongsInFolder(folderPath: string) {
    return playerFolderImport.getSongsInFolder(folderPath);
  }

  async function moveFilesToFolder(paths: string[], targetFolder: string) {
    return playerFileManager.moveFilesToFolder(paths, targetFolder);
  }

  async function refreshFolder(folderPath: string) {
    return playerFileManager.refreshFolder(folderPath);
  }

  function removeFolder(folderPath: string) {
    playerFileManager.removeFolder(folderPath);
  }

  async function addToHistory(song: Song) {
    return playerHistoryFavorites.addToHistory(song);
  }

  function clearLocalMusic() {
    playerFolderImport.clearLocalMusic();
  }

  async function addFolder() {
    return playerFolderImport.addFolder();
  }

  function generateOrganizedPath(song: Song): string {
    return playerFileManager.generateOrganizedPath(song);
  }

  async function moveFile(song: Song, newPath: string) {
    return playerFileManager.moveFile(song, newPath);
  }

  async function openInFinder(path: string) {
    return playerFileManager.openInFinder(path);
  }

  async function deleteFromDisk(song: Song) {
    return playerFileManager.deleteFromDisk(song);
  }

  async function playSong(song: Song, options: PlaySongOptions = {}) {
    return playerPlayback.playSong(song, options);
  }

  async function togglePlay() {
    return playerPlayback.togglePlay();
  }

  function nextSong() {
    playerQueue.nextSong();
  }

  function prevSong() {
    playerQueue.prevSong();
  }

  function init() {
    playerLifecycle.init();
  }

  async function refreshAllFolders() {
    return playerFileManager.refreshAllFolders();
  }

  return {
    ...collectionsRefs,
    ...libraryRefs,
    ...navigationRefs,
    ...playbackRefs,
    ...uiRefs,
    artistList,
    albumList,
    filteredArtistList,
    filteredAlbumList,
    genreList,
    yearList,
    folderList,
    favoriteSongList,
    favArtistList,
    favAlbumList,
    recentAlbumList,
    recentPlaylistList,
    currentViewSongs,
    displaySongList: currentViewSongs,
    isLocalMusic,
    isFolderMode,
    init,
    formatDuration,
    formatTimeAgo,
    ...librarySync,
    ...fileImportActions,
    removeFolder,
    moveFile,
    generateOrganizedPath,
    openInFinder,
    deleteFromDisk,
    moveFilesToFolder,
    ...collectionsActions,
    ...navigationActions,
    ...playbackActions,
    ...windowActions,
    reorderWatchedFolders: (from: number, to: number) => libraryStore.reorderWatchedFolders(from, to),
    reorderPlaylists: (from: number, to: number) => collectionsStore.reorderPlaylists(from, to),
    updateArtistOrder: (newOrder: string[]) => {
      artistCustomOrder.value = newOrder;
      if (artistSortMode.value !== 'custom') {
        artistSortMode.value = 'custom';
      }
    },
    updateAlbumOrder: (newOrder: string[]) => {
      albumCustomOrder.value = newOrder;
      if (albumSortMode.value !== 'custom') {
        albumSortMode.value = 'custom';
      }
    },
    updateFolderOrder: (folderPath: string, newOrder: string[]) => {
      folderCustomOrder.value = {
        ...folderCustomOrder.value,
        [folderPath]: newOrder,
      };
      if (folderSortMode.value !== 'custom') {
        folderSortMode.value = 'custom';
      }
    },
    updateLocalOrder: (newOrder: string[]) => {
      localCustomOrder.value = newOrder;
      if (localSortMode.value !== 'custom') {
        localSortMode.value = 'custom';
      }
    },
    setFolderSortMode: (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom') => {
      folderSortMode.value = mode;
    },
    setLocalSortMode: (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom' | 'default') => {
      localSortMode.value = mode;
    },
    setPlaylistSortMode: (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom') => {
      playlistSortMode.value = mode;
    },
    deleteFolder,
    moveFilePhysical,
    fetchFolderTree,
    createFolder,
    expandFolderPath: (targetPath: string) => {
      playerFolderTree.expandFolderPath(targetPath);
    },
  };
}

let playerService: ReturnType<typeof createPlayerService> | null = null;

export function usePlayerService() {
  if (!playerService) {
    playerService = createPlayerService();
  }

  return playerService;
}
