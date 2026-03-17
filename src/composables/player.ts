import { computed, watch, onMounted, onScopeDispose } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import * as State from './playerState';
export * from './playerState';
import { useLyrics } from './lyrics';
import { useSettings as useAppSettings } from './settings';
import { useToast } from './toast';
import { extractDominantColors } from './colorExtraction';
import { createPlayerLibraryBatch } from './playerLibraryBatch';
import { createPlayerLibraryManager } from './playerLibraryManager';
import { createPlayerNavigation } from './playerNavigation';
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
import { createPlayerRestore } from './playerRestore';
import {
  getLibraryAddScanOptions,
} from './playerLibraryScan';
import type { ScanLibraryOptions } from './playerLibraryScan';
import { convertFileSrc } from '@tauri-apps/api/core';
import { compareByAlphabetIndex, sortItemsByAlphabetIndex } from '../utils/alphabetIndex';

// 动画�?ID

// 校准定时�?ID
let dominantColorTaskId = 0;
let playerInitDone = false;
const PLAYER_OUTPUT_DEVICE_KEY = 'player_output_device';
const PLAYER_OUTPUT_DEVICE_MODE_KEY = 'player_output_device_mode';

// 插值锚�?



// 🟢 Seek 状态标志位（用于禁止同步期间回�?UI�?
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



// 🟢 辅助函数：判断是否为直属父目�?(非递归)

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
const parseStoredJson = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const finalizeLibraryScanProgress = (songs: State.Song[], failed = false, message?: string) => {
  const existing = State.libraryScanProgress.value;
  State.libraryScanProgress.value = {
    phase: failed ? 'error' : 'complete',
    current: songs.length,
    total: songs.length,
    folder_path: existing?.folder_path ?? State.libraryScanSession.value?.sourcePath ?? '',
    folder_index: existing?.folder_index ?? 0,
    folder_total: existing?.folder_total ?? Math.max(1, State.libraryFolders.value.length),
    message: message ?? (failed ? '扫描音乐库时出现问题' : `已完成扫描，�?${songs.length} 首歌曲`),
    done: true,
    failed,
  };
};

const readStoredStringArray = (key: string): string[] | null => {
  const parsed = parseStoredJson<unknown>(localStorage.getItem(key));
  if (!Array.isArray(parsed)) return null;
  return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const readStoredSongArray = (key: string): State.Song[] => {
  const parsed = parseStoredJson<unknown>(localStorage.getItem(key));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is State.Song => !!item && typeof item === 'object' && typeof (item as State.Song).path === 'string');
};

const readStoredSong = (key: string): State.Song | null => {
  const parsed = parseStoredJson<unknown>(localStorage.getItem(key));
  if (!parsed || typeof parsed !== 'object') return null;
  return typeof (parsed as State.Song).path === 'string' ? parsed as State.Song : null;
};

const readStoredHistory = (key: string): State.HistoryItem[] => {
  const parsed = parseStoredJson<unknown>(localStorage.getItem(key));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is State.HistoryItem => {
    if (!item || typeof item !== 'object') return false;
    const historyItem = item as State.HistoryItem;
    return !!historyItem.song && typeof historyItem.song.path === 'string' && typeof historyItem.playedAt === 'number';
  });
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
  const lookup = new Map<string, State.Song>();

  for (const song of fallbackSongs) {
    if (song?.path && !lookup.has(song.path)) {
      lookup.set(song.path, song);
    }
  }

  for (const song of State.librarySongs.value) {
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

export function usePlayer() {



  const { loadLyrics } = useLyrics();
  const { settings: appSettings } = useAppSettings();
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
  let playerNavigation: ReturnType<typeof createPlayerNavigation>;
  let playerPlayback: ReturnType<typeof createPlayerPlayback>;
  const playerPlaylist = createPlayerPlaylist({
    switchViewToAll,
  });
  const playerHistoryFavorites = createPlayerHistoryFavorites({
    legacyPlayerHistoryKey: LEGACY_PLAYER_HISTORY_KEY,
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
  libraryRuntime = createPlayerLibraryRuntime({
    fetchLibraryFolders,
    flushBufferedLibraryScanBatch,
    refreshStateSongReferences,
    finalizeLibraryScanProgress,
    onSilentScanError: () => {
      useToast().showToast("?????????????????", "error");
    },
  });



  // ... (格式化函数保持不�? ...

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

  function formatDuration(seconds: number) { if (!seconds) return "00:00"; const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; }

  function formatTimeAgo(timestamp: number) { const now = Date.now(); const diff = now - timestamp; const oneHour = 60 * 60 * 1000; if (diff < oneHour) return `${Math.max(1, Math.floor(diff / 60000))}分钟前`; if (diff < 24 * oneHour) return `${Math.floor(diff / oneHour)}小时前`; return `${Math.floor(diff / (24 * oneHour))}天前`; }



  // ... (计算属性保持不�? ...

  const isLocalMusic = computed(() => State.currentViewMode.value === 'all' || State.currentViewMode.value === 'artist' || State.currentViewMode.value === 'album');

  const isFolderMode = computed(() => State.currentViewMode.value === 'folder');




  // 🟢 核心：定义“库内歌曲�?  // 使用新的 librarySongs 状�?(�?scanLibrary populates)
  const librarySongs = computed(() => {
    return State.librarySongs.value;
  });

  onMounted(async () => {
    await libraryRuntime.bootstrapLibrary();
  });

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
        ? "?????????????"
        : linkedSidebar
          ? "???????????????????"
          : "??????????";
      useToast().showToast(toastText, "success");
      return;
      useToast().showToast(
        linkedSidebar
          ? "???????????????????"
          : "??????????",
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
        `已导�?${importedFolderCount} 个文件夹，并开始播�?${getSongTitleLabel(playableSongs[0])}`,
        'success'
      );
      if (ignoredFileCount > 0) {
        useToast().showToast(`已忽�?${ignoredFileCount} 个不支持的文件`, 'info');
      }
      if (skippedFolderCount > 0) {
        useToast().showToast(`${skippedFolderCount} 个文件夹已在音乐库中，已跳过`, 'info');
      }
      return;
    }

    if (importedFolderCount > 0) {
      useToast().showToast(`已导�?${importedFolderCount} 个文件夹`, 'success');
      if (ignoredFileCount > 0) {
        useToast().showToast(`已忽�?${ignoredFileCount} 个不支持的文件`, 'info');
      }
      if (skippedFolderCount > 0) {
        useToast().showToast(`${skippedFolderCount} 个文件夹已在音乐库中，已跳过`, 'info');
      }
      return;
    }

    if (playableSongs.length > 1) {
      useToast().showToast(`已载�?${playableSongs.length} 首歌曲并开始播放`, 'success');
      if (ignoredFileCount > 0) {
        useToast().showToast(`已忽�?${ignoredFileCount} 个不支持的文件`, 'info');
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
        ? '???????????????????'
        : '???????????????????????',
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
          ? "已从本地音乐库和侧边栏同步移除文件夹"
          : "已从音乐库移除文件夹",
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
      const selected = await open({ directory: true, multiple: false, title: '???????' });
      if (selected && typeof selected === 'string') {
        const scanOptions = getLibraryAddScanOptions(selected);
        await addLibraryFolderLinked(selected, {
          showToast: scanOptions.visibility === 'silent',
          scanOptions,
        });
      }
    } catch (e) {
      console.error("Failed to add library folder:", e);
      useToast().showToast("???????: " + e, "error");
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

  // 🟢 Helper: Recursively remove node from tree for Optimistic UI


  // 🟢 Physical Folder Deletion (Management Mode)
  async function deleteFolder(path: string) {
    return playerFileManager.deleteFolder(path);
  }

  // 🟢 Helper: Recursively increment song count for a folder


  // 🟢 Helper: Recursively decrement song count for a folder


  // 🟢 Helper: Update folder cover when first song changes



  // 🟢 Physical File Move (Management Mode)
  async function moveFilePhysical(sourcePath: string, targetFolderPath: string) {
    return playerFileManager.moveFilePhysical(sourcePath, targetFolderPath);
  }

  // 🟢 Helper: Find a node in the tree


  async function scanLibrary(options: ScanLibraryOptions = {}) {
    return libraryRuntime.scanLibrary(options);
    /*

        State.lastLibraryScanError.value = errorMessage;
        finalizeLibraryScanProgress([], true, errorMessage || '扫描音乐库时出现问题');
        if (session.visibility === 'silent') {
          useToast().showToast("后台扫描失败，请在音乐库设置中重�?, "error");
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







    // 🟢 排序逻辑



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







    // 🟢 排序逻辑



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

  playerNavigation = createPlayerNavigation({
    getArtistList: () => artistList.value,
    getAlbumList: () => albumList.value,
  });

  const filteredArtistList = computed(() => {
    const query = State.searchQuery.value.trim().toLowerCase();
    if (!query) return artistList.value;
    return artistList.value.filter(artist => (artist.name || '').toLowerCase().includes(query));
  });

  const filteredAlbumList = computed(() => {
    const query = State.searchQuery.value.trim().toLowerCase();
    if (!query) return albumList.value;
    return albumList.value.filter(album =>
      (album.name || '').toLowerCase().includes(query) ||
      (album.artist || '').toLowerCase().includes(query)
    );
  });







  const folderList = computed(() => {



    // folderList 顺序直接�?watchedFolders 数组顺序决定，因此支持手动排�?


    return State.watchedFolders.value.map(folderPath => {



      // 🟢 关键修改：仅统计直属该目录的歌曲 (非递归)



      const songsInFolder = State.songList.value.filter(s => isDirectParent(folderPath, s.path));



      return {



        path: folderPath,



        name: folderPath.split(/[/\\]/).pop() || folderPath,



        count: songsInFolder.length,



        firstSongPath: songsInFolder.length > 0 ? songsInFolder[0].path : ''



      };



    });



  });

  const favoriteSongList = computed(() => { return librarySongs.value.filter(s => State.favoritePaths.value.includes(s.path)); });

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
    State.recentSongs.value.forEach(item => {
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

  const recentPlaylistList = computed(() => { const result: { id: string, name: string, count: number, playedAt: number, firstSongPath: string }[] = []; State.playlists.value.forEach(pl => { let lastPlayedTime = 0; let hasPlayed = false; const plSongPaths = new Set(pl.songPaths); for (const historyItem of State.recentSongs.value) { if (plSongPaths.has(historyItem.song.path)) { if (historyItem.playedAt > lastPlayedTime) { lastPlayedTime = historyItem.playedAt; hasPlayed = true; } } } if (hasPlayed) { result.push({ id: pl.id, name: pl.name, count: pl.songPaths.length, playedAt: lastPlayedTime, firstSongPath: pl.songPaths.length > 0 ? pl.songPaths[0] : '' }); } }); return result.sort((a, b) => b.playedAt - a.playedAt); });



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

    if (State.searchQuery.value.trim()) {

      const q = State.searchQuery.value.toLowerCase();

      if (State.currentViewMode.value === 'favorites') return favoriteSongList.value.filter(s => s.name.toLowerCase().includes(q) || getSongArtistSearchText(s).includes(q));

      if (State.currentViewMode.value === 'recent') return State.recentSongs.value.map(h => h.song).filter(s => s.name.toLowerCase().includes(q));

      if (State.currentViewMode.value === 'all') {
        return sortItemsByAlphabetIndex(
          librarySongs.value.filter(s =>
            s.name.toLowerCase().includes(q) ||
            getSongArtistSearchText(s).includes(q) ||
            s.album.toLowerCase().includes(q),
          ),
          getSongTitleLabel,
        );
      }

      if (State.currentViewMode.value === 'folder') {
        return sortItemsByAlphabetIndex(
          State.songList.value.filter(s =>
            s.name.toLowerCase().includes(q) ||
            getSongArtistSearchText(s).includes(q) ||
            s.album.toLowerCase().includes(q),
          ),
          getSongTitleLabel,
        );
      }

      // 🟢 搜索逻辑：优先搜库，也可以搜当前文件夹的
      return librarySongs.value.filter(s => s.name.toLowerCase().includes(q) || getSongArtistSearchText(s).includes(q) || s.album.toLowerCase().includes(q));

    }

    if (State.currentViewMode.value === 'all') {
      let base = [...librarySongs.value];
      if (State.localMusicTab.value === 'artist' && State.currentArtistFilter.value) {
        base = base.filter(s => songHasArtist(s, State.currentArtistFilter.value));
      } else if (State.localMusicTab.value === 'album' && State.currentAlbumFilter.value) {
        base = base.filter(s => matchesAlbumKey(s, State.currentAlbumFilter.value));
      }

      // 🟢 应用本地音乐排序
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
    if (State.currentViewMode.value === 'folder') {
      if (State.currentFolderFilter.value) {
        let songs = State.songList.value.filter(s => isDirectParent(State.currentFolderFilter.value, s.path));

        // 🟢 添加排序逻辑
        if (State.folderSortMode.value === 'title') {
          songs = sortItemsByAlphabetIndex(songs, getSongTitleLabel);
        } else if (State.folderSortMode.value === 'name') {
          songs = sortItemsByAlphabetIndex(songs, getSongFileNameLabel);
        } else if (State.folderSortMode.value === 'artist') {
          // 按歌手名排序
          songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
        } else if (State.folderSortMode.value === 'added_at') {
          // 🟢 添加时间排序 (降序)
          songs.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
        } else if (State.folderSortMode.value === 'custom') {
          // 自定义排�?拖拽后的顺序)
          const customOrder = State.folderCustomOrder.value[State.currentFolderFilter.value] || [];
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
        return []; // 🟢 No folder selected = empty list
      }
    }



    if (State.currentViewMode.value === 'recent') {
      let songs = State.recentSongs.value.map(h => h.song);

      // 🟢 应用排序 (与本地音乐共享模�?
      if (State.localSortMode.value === 'title') {
        songs.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'name') {
        songs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'artist') {
        songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
      } else if (State.localSortMode.value === 'added_at') {
        // 最近播放本身就是按时间排的,但如果用户选了添加时间,则按扫描入库时间�?        songs.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
      }

      return songs;
    }

    if (State.currentViewMode.value === 'favorites') {
      let songs = [];
      if (State.favTab.value === 'songs') {
        songs = [...favoriteSongList.value];
      } else if (State.favTab.value === 'artists') {
        songs = State.favDetailFilter.value?.type === 'artist' ? favoriteSongList.value.filter(s => songHasArtist(s, State.favDetailFilter.value!.name)) : [];
      } else if (State.favTab.value === 'albums') {
        songs = State.favDetailFilter.value?.type === 'album' ? favoriteSongList.value.filter(s => matchesAlbumKey(s, State.favDetailFilter.value!.name)) : [];
      } else {
        songs = [...favoriteSongList.value];
      }

      // 🟢 应用排序
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

    if (State.currentViewMode.value === 'playlist') {
      const pl = State.playlists.value.find(p => p.id === State.filterCondition.value);
      if (!pl) return [];

      const songMap = new Map();
      State.librarySongs.value.forEach(s => songMap.set(s.path, s));
      State.songList.value.forEach(s => {
        if (!songMap.has(s.path)) songMap.set(s.path, s);
      });

      let songs = pl.songPaths
        .map(path => songMap.get(path))
        .filter((s): s is State.Song => !!s);

      // 🟢 应用歌单排序
      if (State.playlistSortMode.value === 'title') {
        songs.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'zh-CN'));
      } else if (State.playlistSortMode.value === 'name') {
        songs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      } else if (State.playlistSortMode.value === 'artist') {
        songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
      } else if (State.playlistSortMode.value === 'added_at') {
        songs.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
      }
      // 'custom' 模式不需要排�?因为它已经通过 map(path => ...) 维持�?songPaths 的顺�?
      return songs;
    }

    return librarySongs.value.filter(s =>
      songHasArtist(s, State.filterCondition.value) ||
      matchesAlbumKey(s, State.filterCondition.value) ||
      (s.genre || 'Unknown') === State.filterCondition.value ||
      ((s.year?.substring(0, 4)) || 'Unknown') === State.filterCondition.value
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
    handleAutoNext,
    onBeforePlay: (song, options) => {
      playerQueue.handleBeforePlay(song, options);
    },
  });

  watch(displaySongList, async (newList) => {

    if (State.currentViewMode.value === 'favorites' && (State.favTab.value === 'artists' || State.favTab.value === 'albums') && !State.favDetailFilter.value) return;

    if (newList.length > 0) { try { const cover = await invoke<string>('get_song_cover', { path: newList[0].path }); State.playlistCover.value = cover; } catch { State.playlistCover.value = ''; } } else { State.playlistCover.value = ''; }

  }, { immediate: true });



  async function addFoldersFromStructure() {
    return playerFolderImport.addFoldersFromStructure();
  }







  function getSongsInFolder(folderPath: string) { return playerFolderImport.getSongsInFolder(folderPath); }







  // 🟢 重点：创建歌单时，记录当前日�?
  function createPlaylist(n: string, initialSongs: string[] = []) {
    playerPlaylist.createPlaylist(n, initialSongs);
  }



  async function moveFilesToFolder(paths: string[], targetFolder: string) {
    return playerFileManager.moveFilesToFolder(paths, targetFolder);
  }



  async function refreshFolder(folderPath: string) {
    return playerFileManager.refreshFolder(folderPath);
  }



  // ... (其他函数保持不变) ...

  function deletePlaylist(id: string) { playerPlaylist.deletePlaylist(id); }

  function addToPlaylist(pid: string, path: string) { playerPlaylist.addToPlaylist(pid, path); }

  function removeFromPlaylist(pid: string, path: string) { playerPlaylist.removeFromPlaylist(pid, path); }

  function addSongsToPlaylist(playlistId: string, songPaths: string[]): number { return playerPlaylist.addSongsToPlaylist(playlistId, songPaths); }

  function viewPlaylist(id: string) { playerPlaylist.viewPlaylist(id); }

  function switchToFolderView() { playerNavigation.switchToFolderView(); }

  function removeFolder(folderPath: string) {
    playerFileManager.removeFolder(folderPath);
  }

  function viewArtist(n: string) { playerNavigation.viewArtist(n); }

  function viewAlbum(n: string) { playerNavigation.viewAlbum(n); }

  function viewGenre(n: string) { playerNavigation.viewGenre(n); }

  function viewYear(n: string) { playerNavigation.viewYear(n); }

  function switchViewToAll() { playerNavigation.switchViewToAll(); }

  function switchViewToFolder(p: string) { playerNavigation.switchViewToFolder(p); }

  function switchToRecent() { playerNavigation.switchToRecent(); }

  function switchToFavorites() { playerNavigation.switchToFavorites(); }

  function switchToStatistics() { playerNavigation.switchToStatistics(); }

  function setSearch(q: string) { playerNavigation.setSearch(q); }

  function switchLocalTab(tab: 'default' | 'artist' | 'album') { playerNavigation.switchLocalTab(tab); }

  function switchFavTab(tab: 'songs' | 'artists' | 'albums') { playerNavigation.switchFavTab(tab); }

  function isFavorite(s: State.Song | null) { return playerHistoryFavorites.isFavorite(s); }

  function toggleFavorite(s: State.Song) { playerHistoryFavorites.toggleFavorite(s); }

  async function addToHistory(song: State.Song) {
    return playerHistoryFavorites.addToHistory(song);
  }

  async function removeFromHistory(songPaths: string[]) {
    return playerHistoryFavorites.removeFromHistory(songPaths);
  }

  async function clearHistory() {
    return playerHistoryFavorites.clearHistory();
  }

  function clearLocalMusic() { playerFolderImport.clearLocalMusic(); }

  function clearFavorites() { playerHistoryFavorites.clearFavorites(); }

  async function addFolder() {
    return playerFolderImport.addFolder();
  }
  function generateOrganizedPath(song: State.Song): string { return playerFileManager.generateOrganizedPath(song); }
  async function moveFile(song: State.Song, newPath: string) { return playerFileManager.moveFile(song, newPath); }
  function handleAutoNext() { if (State.playMode.value === 1 && State.currentSong.value) { playSong(State.currentSong.value); } else { nextSong(); } }
  async function handleVolume(e: Event) { return playerUiShell.handleVolume(e); }
  async function toggleMute() { return playerUiShell.toggleMute(); }
  function toggleMode() { playerQueue.toggleMode(); }
  function togglePlaylist() { playerUiShell.togglePlaylist(); }
  function toggleMiniPlaylist() { playerUiShell.toggleMiniPlaylist(); }
  function closeMiniPlaylist() { playerUiShell.closeMiniPlaylist(); }
  async function handleScan() { return playerUiShell.handleScan(); }
  function playNext(song: State.Song) { playerQueue.playNext(song); }
  async function removeSongFromList(song: State.Song) {
    return playerUiShell.removeSongFromList(song);
  }
  async function openInFinder(path: string) { return playerFileManager.openInFinder(path); }
  async function deleteFromDisk(song: State.Song) {
    return playerFileManager.deleteFromDisk(song);
  }

  async function playSong(song: State.Song, options: PlaySongOptions = {}) {
    return playerPlayback.playSong(song, options);
  }

  async function pauseSong() {
    return playerPlayback.pauseSong();
  }

  async function togglePlay() {
    return playerPlayback.togglePlay();
  }

  function nextSong() { playerQueue.nextSong(); }

  function prevSong() { playerQueue.prevSong(); }

  async function clearQueue() { return playerQueue.clearQueue(); }

  function removeSongFromQueue(song: State.Song) { playerQueue.removeSongFromQueue(song); }

  function addSongToQueue(song: State.Song) { playerQueue.addSongToQueue(song); }

  function addSongsToQueue(songs: State.Song[]) { playerQueue.addSongsToQueue(songs); }


  function getSongsFromPlaylist(playlistId: string): State.Song[] { return playerPlaylist.getSongsFromPlaylist(playlistId); }
  async function seekTo(newTime: number) {
    return playerPlayback.seekTo(newTime);
  }
  async function playAt(time: number) {
    return playerPlayback.playAt(time);
  }
  async function handleSeek(e: MouseEvent) {
    return playerPlayback.handleSeek(e);
  }
  async function stepSeek(step: number) {
    return playerPlayback.stepSeek(step);
  }
  async function toggleAlwaysOnTop(enable: boolean) { return playerUiShell.toggleAlwaysOnTop(enable); }
  function togglePlayerDetail() { playerUiShell.togglePlayerDetail(); }
  function toggleQueue() { playerUiShell.toggleQueue(); }
  function openAddToPlaylistDialog(songPath: string) { playerPlaylist.openAddToPlaylistDialog(songPath); }

  function init() {
    if (playerInitDone) {
      return;
    }
    playerInitDone = true;
    // 注册系统媒体控制事件监听
    listen('player:play', () => { if (!State.isPlaying.value) togglePlay(); });
    listen('player:pause', () => { if (State.isPlaying.value) togglePlay(); });
    listen('player:next', () => { nextSong(); });
    listen('player:prev', () => { prevSong(); });
    listen<LibraryScanBatchPayload>('library-scan-batch', (event) => {
      applyLibraryScanBatch(event.payload);
    });
    listen<LibraryScanProgressPayload>('library-scan-progress', (event) => {
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
    });
    // ?? seek_completed ???????
    listen<SeekCompletedPayload>('seek_completed', (e) => {
      playerPlayback.handleSeekCompleted(e.payload);
    });

    watch(State.volume, (v) => localStorage.setItem('player_volume', v.toString()));
    watch(State.playMode, (v) => localStorage.setItem('player_mode', v.toString()));
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

    // 🟢 持久化排序状�?    watch(State.artistSortMode, (v) => localStorage.setItem('player_artist_sort_mode', v));
    watch(State.albumSortMode, (v) => localStorage.setItem('player_album_sort_mode', v));
    watch(State.folderSortMode, (v) => localStorage.setItem('player_folder_sort_mode', v));
    watch(State.localSortMode, (v) => localStorage.setItem('player_local_sort_mode', v));
    watch(State.playlistSortMode, (v) => localStorage.setItem('player_playlist_sort_mode', v));

    watch(State.currentSong, (newSong) => {
      if (newSong?.path) {
        localStorage.setItem(PLAYER_LAST_SONG_PATH_KEY, newSong.path);
        localStorage.removeItem(LEGACY_PLAYER_LAST_SONG_KEY);
      } else {
        localStorage.removeItem(PLAYER_LAST_SONG_PATH_KEY);
        localStorage.removeItem(LEGACY_PLAYER_LAST_SONG_KEY);
      }
    });

    watch(State.currentCover, async (newCover) => {
      if (!newCover) return;

      const taskId = ++dominantColorTaskId;
      let url = newCover;
      if (!newCover.startsWith('http') && !newCover.startsWith('data:')) {
        url = convertFileSrc(newCover);
      }

      const colors = await extractDominantColors(url, 4);
      if (taskId !== dominantColorTaskId) return;
      State.dominantColors.value = colors;
    });

    watch(State.isPlaying, (playing) => {
      if (!playing) {
        localStorage.setItem('player_last_time', State.currentTime.value.toString());
      }
    });

    onMounted(async () => {
      // 🟢 性能优化：同步恢复持久化数据，避免空状态渲染后再次闪烁
      const restoreState = async () => {
        const sVol = localStorage.getItem('player_volume'); if (sVol) { State.volume.value = parseInt(sVol); await invoke('set_volume', { volume: State.volume.value / 100.0 }); }
        const sOutputDevice = localStorage.getItem(PLAYER_OUTPUT_DEVICE_KEY);
        const sOutputMode = localStorage.getItem(PLAYER_OUTPUT_DEVICE_MODE_KEY);
        if ((sOutputMode === 'manual' || (!sOutputMode && sOutputDevice)) && sOutputDevice) {
          await invoke('set_output_device', { deviceId: sOutputDevice }).catch((error) => {
            console.warn('Failed to restore output device:', error);
          });
        } else {
          await invoke('set_output_device', { deviceId: null }).catch((error) => {
            console.warn('Failed to restore default output device mode:', error);
          });
        }
        const sFolders = localStorage.getItem('player_watched_folders'); if (sFolders) try { State.watchedFolders.value = JSON.parse(sFolders); } catch (e) { }
        const sFavs = localStorage.getItem('player_favorites'); if (sFavs) try { State.favoritePaths.value = JSON.parse(sFavs); } catch (e) { }
        const sPlaylists = localStorage.getItem('player_custom_playlists'); if (sPlaylists) try { State.playlists.value = JSON.parse(sPlaylists); } catch (e) { }

        // 🟢 读取排序状�?        const sArtistSort = localStorage.getItem('player_artist_sort_mode'); if (sArtistSort) State.artistSortMode.value = sArtistSort as any;
        const sAlbumSort = localStorage.getItem('player_album_sort_mode'); if (sAlbumSort && ['count', 'name', 'artist', 'custom'].includes(sAlbumSort)) State.albumSortMode.value = sAlbumSort as any;
        const sArtistOrder = localStorage.getItem('player_artist_custom_order'); if (sArtistOrder) try { State.artistCustomOrder.value = JSON.parse(sArtistOrder); } catch (e) { }
        const sAlbumOrder = localStorage.getItem('player_album_custom_order'); if (sAlbumOrder) try { State.albumCustomOrder.value = JSON.parse(sAlbumOrder); } catch (e) { }
        const sFolderSort = localStorage.getItem('player_folder_sort_mode');
        if (sFolderSort && ['title', 'name', 'artist', 'added_at', 'custom'].includes(sFolderSort)) {
          State.folderSortMode.value = sFolderSort as any;
        }
        const sLocalSort = localStorage.getItem('player_local_sort_mode');
        if (sLocalSort && ['title', 'name', 'artist', 'added_at', 'custom', 'default'].includes(sLocalSort)) {
          State.localSortMode.value = sLocalSort as any;
        }
        const sPlaylistSort = localStorage.getItem('player_playlist_sort_mode');
        if (sPlaylistSort && ['title', 'name', 'artist', 'added_at', 'custom'].includes(sPlaylistSort)) {
          State.playlistSortMode.value = sPlaylistSort as any;
        }
        const sFolderOrder = localStorage.getItem('player_folder_custom_order');
        if (sFolderOrder) {
          try {
            const parsedOrder = JSON.parse(sFolderOrder);
            if (parsedOrder && typeof parsedOrder === 'object' && !Array.isArray(parsedOrder)) {
              State.folderCustomOrder.value = parsedOrder;
            }
          } catch (e) { }
        }
        const sLocalOrder = localStorage.getItem('player_local_custom_order');
        if (sLocalOrder) {
          try {
            const parsedOrder = JSON.parse(sLocalOrder);
            if (Array.isArray(parsedOrder)) {
              State.localCustomOrder.value = parsedOrder;
            }
          } catch (e) { }
        }

        const sSettings = localStorage.getItem('player_settings');
        if (sSettings) {
          try {
            const saved = JSON.parse(sSettings);
            // 确保 saved 是真实存在的对象 (排除 null)
            if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
              const savedTheme = (saved.theme && typeof saved.theme === 'object') ? saved.theme : {};
              const savedSidebar = (saved.sidebar && typeof saved.sidebar === 'object') ? saved.sidebar : {};
              const savedCustomBg = (savedTheme.customBackground && typeof savedTheme.customBackground === 'object') ? savedTheme.customBackground : {};

              // 迁移逻辑：将旧的 enableDynamicBg 转换为新�?dynamicBgType
              let dynamicBgType = savedTheme.dynamicBgType;
              if (dynamicBgType === undefined && savedTheme.enableDynamicBg !== undefined) {
                dynamicBgType = savedTheme.enableDynamicBg ? 'flow' : 'none';
              }

              const savedWindowMaterial = ['none', 'mica', 'acrylic'].includes(savedTheme.windowMaterial)
                ? savedTheme.windowMaterial
                : State.settings.value.theme.windowMaterial;

              const merged = {
                ...State.settings.value,
                ...saved,
                theme: {
                  ...State.settings.value.theme,
                  ...savedTheme,
                  windowMaterial: savedWindowMaterial,
                  dynamicBgType: savedWindowMaterial !== 'none'
                    ? 'none'
                    : (dynamicBgType || State.settings.value.theme.dynamicBgType),
                  customBackground: {
                    ...State.settings.value.theme.customBackground,
                    ...savedCustomBg
                  }
                },
                sidebar: {
                  ...State.settings.value.sidebar,
                  ...savedSidebar
                }
              };
              State.settings.value = merged;
            }
          } catch (e) {
            console.error("Failed to parse settings:", e);
          }
        }


        // 🟢 读取 playQueue

        await restorePathBackedState();
        await restoreRecentHistory();
        refreshStateSongReferences();

        const lastTime = localStorage.getItem('player_last_time');
        if (lastTime) {
          State.currentTime.value = parseFloat(lastTime);
        }
      };

      await restoreState();

      window.addEventListener('beforeunload', () => {
        flushPersistedState();
        localStorage.setItem('player_last_time', State.currentTime.value.toString());
      });
    });

    onScopeDispose(() => {
      playerPlayback.dispose();
      libraryRuntime.dispose();
      disposePlayerPersistence();
      disposeLibraryBatch();
    });
  }

  async function refreshAllFolders() {
    return playerFileManager.refreshAllFolders();
  }

  return {
    ...State,
    artistList, albumList, filteredArtistList, filteredAlbumList, genreList, yearList, folderList, favoriteSongList, favArtistList, favAlbumList, recentAlbumList, recentPlaylistList, displaySongList, isLocalMusic, isFolderMode,
    init, formatDuration, formatTimeAgo,
    // Library
    fetchLibraryFolders,
    addLibraryFolder,
    addLibraryFolderLinked,
    removeLibraryFolder,
    removeLibraryFolderLinked,
    handleExternalPaths,
    scanLibrary,
    // Existing
    playSong,
    pauseSong,
    togglePlay, nextSong, prevSong, handleSeek, handleVolume, toggleMute, handleScan, toggleMode, togglePlaylist, toggleMiniPlaylist, closeMiniPlaylist,
    addFolder, addLibraryFolderPath, switchViewToAll, switchViewToFolder, switchToFolderView, switchToRecent, switchToFavorites, switchToStatistics, switchLocalTab, switchFavTab,
    removeFolder, addToHistory, removeFromHistory, clearHistory, clearLocalMusic, clearFavorites, addSongsToPlaylist, isFavorite, toggleFavorite,
    viewArtist, viewAlbum, viewGenre, viewYear, setSearch, createPlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, viewPlaylist,
    moveFile, generateOrganizedPath, playNext, removeSongFromList, openInFinder, deleteFromDisk,
    stepSeek, toggleAlwaysOnTop, togglePlayerDetail, seekTo, openAddToPlaylistDialog, playAt,
    addFoldersFromStructure, getSongsInFolder,
    moveFilesToFolder,
    refreshFolder,
    refreshAllFolders,
    clearQueue, removeSongFromQueue, addSongToQueue, toggleQueue,
    addSongsToQueue, getSongsFromPlaylist,
    // Mini 模式
    isMiniMode: State.isMiniMode,
    reorderWatchedFolders: (from: number, to: number) => {
      const list = [...State.watchedFolders.value];
      const [removed] = list.splice(from, 1);
      list.splice(to, 0, removed);
      State.watchedFolders.value = list;
    },
    reorderPlaylists: (from: number, to: number) => {
      const list = [...State.playlists.value];
      const [removed] = list.splice(from, 1);
      list.splice(to, 0, removed);
      State.playlists.value = list;
    },
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
    folderTree: State.folderTree,
    activeRootPath: State.activeRootPath,
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









