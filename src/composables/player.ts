import { computed, watch, onMounted, onScopeDispose } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import * as State from './playerState';
export * from './playerState';
import { useLyrics } from './lyrics';
import { useSettings as useAppSettings } from './settings';
import { useToast } from './toast';
import { extractDominantColors } from './colorExtraction';
import { convertFileSrc } from '@tauri-apps/api/core';
import { compareByAlphabetIndex, sortItemsByAlphabetIndex } from '../utils/alphabetIndex';

// 动画帧 ID

let progressFrameId: number | null = null;
// 校准定时器 ID
let syncIntervalId: any = null;
let dominantColorTaskId = 0;
let playRequestId = 0;
let latestSeekRequestId = 0;
const shuffleHistory: string[] = [];
const shuffleFuture: string[] = [];
let hasBootstrappedLibrary = false;
let libraryBootstrapPromise: Promise<void> | null = null;
let libraryRefreshPromise: Promise<void> | null = null;
let libraryRefreshIdleId: number | null = null;
let libraryRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let playerInitDone = false;

// 插值锚点

let playbackAnchorTime = 0;

let playbackStartOffset = 0;

// 播放时长统计状态（模块顶层，确保跨调用共享）
let sessionStartTime: number | null = null;
let accumulatedTime = 0;

// 🟢 Seek 状态标志位（用于禁止同步期间回滚 UI）
let isSeeking = false;

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

interface ScanLibraryOptions {
  trigger?: State.LibraryScanTrigger;
  visibility?: State.LibraryScanVisibility;
  sourcePath?: string;
}



// 🟢 辅助函数：判断是否为直属父目录 (非递归)

const isDirectParent = (parentPath: string, childPath: string) => {

  if (!parentPath || !childPath) return false;

  const p = parentPath.replace(/\\/g, '/').replace(/\/$/, '');

  const c = childPath.replace(/\\/g, '/');

  const lastSlash = c.lastIndexOf('/');

  return lastSlash !== -1 && c.substring(0, lastSlash) === p;

};



// 定义后端返回的结构

interface GeneratedFolder {

  name: string;

  path: string;

  songs: State.Song[];

}

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

interface RecentHistoryRecord {
  songPath: string;
  playedAt: number;
}

interface RecentHistoryImportRecord {
  songPath: string;
  playedAt: number;
}

const PLAYER_PLAYLIST_PATHS_KEY = 'player_playlist_paths';
const PLAYER_QUEUE_PATHS_KEY = 'player_queue_paths';
const PLAYER_LAST_SONG_PATH_KEY = 'player_last_song_path';
const LEGACY_PLAYER_PLAYLIST_KEY = 'player_playlist';
const LEGACY_PLAYER_QUEUE_KEY = 'player_queue';
const LEGACY_PLAYER_HISTORY_KEY = 'player_history';
const LEGACY_PLAYER_LAST_SONG_KEY = 'player_last_song';
const LIBRARY_SCAN_VISIBILITY_PRIORITY: Record<State.LibraryScanVisibility, number> = {
  silent: 1,
  inline: 2,
  hero: 3,
};

const parseStoredJson = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const resolveScanLibraryOptions = (
  options: ScanLibraryOptions = {},
): Required<ScanLibraryOptions> => ({
  trigger: options.trigger ?? 'manual-rescan',
  visibility: options.visibility ?? 'inline',
  sourcePath: options.sourcePath ?? '',
});

const isLibraryScanActive = () =>
  !!State.libraryScanProgress.value && !State.libraryScanProgress.value.done && !State.libraryScanProgress.value.failed;

const shouldReplaceLibraryScanSession = (nextVisibility: State.LibraryScanVisibility) => {
  if (!State.libraryScanSession.value) {
    return true;
  }

  if (!isLibraryScanActive()) {
    return true;
  }

  const currentPriority = LIBRARY_SCAN_VISIBILITY_PRIORITY[State.libraryScanSession.value.visibility];
  const nextPriority = LIBRARY_SCAN_VISIBILITY_PRIORITY[nextVisibility];
  return nextPriority > currentPriority;
};

const startLibraryScanSession = (options: Required<ScanLibraryOptions>) => {
  const nextSession: State.LibraryScanSession = {
    trigger: options.trigger,
    visibility: options.visibility,
    startedAt: Date.now(),
    hadLibraryFoldersAtStart: State.libraryFolders.value.length > 0,
    hadSongsAtStart: State.librarySongs.value.length > 0,
    sourcePath: options.sourcePath || undefined,
  };

  if (shouldReplaceLibraryScanSession(options.visibility)) {
    State.libraryScanSession.value = nextSession;
    return nextSession;
  }

  if (
    State.libraryScanSession.value &&
    !State.libraryScanSession.value.sourcePath &&
    nextSession.sourcePath
  ) {
    State.libraryScanSession.value = {
      ...State.libraryScanSession.value,
      sourcePath: nextSession.sourcePath,
    };
  }

  return State.libraryScanSession.value!;
};

const beginLibraryScanProgress = (session: State.LibraryScanSession) => {
  State.libraryScanProgress.value = {
    phase: 'collecting',
    current: 0,
    total: 0,
    folder_path: session.sourcePath ?? '',
    folder_index: session.sourcePath ? 1 : 0,
    folder_total: Math.max(1, State.libraryFolders.value.length),
    message: null,
    done: false,
    failed: false,
  };
};

const getLibraryAddScanOptions = (path: string): Required<ScanLibraryOptions> => {
  const isFirstImport = State.libraryFolders.value.length === 0 && State.librarySongs.value.length === 0;
  return {
    trigger: isFirstImport ? 'first-import' : 'folder-add',
    visibility: isFirstImport ? 'hero' : 'silent',
    sourcePath: path,
  };
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
    message: message ?? (failed ? '扫描音乐库时出现问题' : `已完成扫描，共 ${songs.length} 首歌曲`),
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

const LIBRARY_SCAN_BATCH_FLUSH_MS = 120;
let libraryScanBatchFlushTimer: ReturnType<typeof setTimeout> | null = null;
const pendingLibraryScanSongs = new Map<string, State.Song>();
const pendingLibraryScanDeletedPaths = new Set<string>();
const pendingLibraryScanFallbackSongs = new Map<string, State.Song>();

const flushBufferedLibraryScanBatch = () => {
  if (libraryScanBatchFlushTimer) {
    clearTimeout(libraryScanBatchFlushTimer);
    libraryScanBatchFlushTimer = null;
  }

  if (pendingLibraryScanSongs.size === 0 && pendingLibraryScanDeletedPaths.size === 0) {
    pendingLibraryScanFallbackSongs.clear();
    return;
  }

  const merged = new Map<string, State.Song>();
  for (const song of State.librarySongs.value) {
    if (!pendingLibraryScanDeletedPaths.has(song.path)) {
      merged.set(song.path, song);
    }
  }

  for (const [path, song] of pendingLibraryScanSongs) {
    if (!pendingLibraryScanDeletedPaths.has(path)) {
      merged.set(path, song);
    }
  }

  State.librarySongs.value = Array.from(merged.values());
  refreshStateSongReferences(Array.from(pendingLibraryScanFallbackSongs.values()));

  pendingLibraryScanSongs.clear();
  pendingLibraryScanDeletedPaths.clear();
  pendingLibraryScanFallbackSongs.clear();
};

const scheduleLibraryScanBatchFlush = () => {
  if (libraryScanBatchFlushTimer) return;
  libraryScanBatchFlushTimer = setTimeout(() => {
    flushBufferedLibraryScanBatch();
  }, LIBRARY_SCAN_BATCH_FLUSH_MS);
};

const applyLibraryScanBatch = (payload: LibraryScanBatchPayload) => {
  const incomingSongs = Array.isArray(payload.songs) ? payload.songs : [];

  for (const deletedPath of payload.deleted_paths ?? []) {
    pendingLibraryScanDeletedPaths.add(deletedPath);
    pendingLibraryScanSongs.delete(deletedPath);
    pendingLibraryScanFallbackSongs.delete(deletedPath);
  }

  for (const song of incomingSongs) {
    if (!song?.path) continue;
    pendingLibraryScanDeletedPaths.delete(song.path);
    pendingLibraryScanSongs.set(song.path, song);
    pendingLibraryScanFallbackSongs.set(song.path, song);
  }

  scheduleLibraryScanBatchFlush();
};

const refreshStateSongReferences = (fallbackSongs: State.Song[] = []) => {
  const lookup = createSongLookup([
    ...fallbackSongs,
    ...State.songList.value,
    ...State.playQueue.value,
    ...State.recentSongs.value.map(item => item.song),
    ...(State.currentSong.value ? [State.currentSong.value] : []),
  ]);

  State.songList.value = State.songList.value
    .map(song => lookup.get(song.path) ?? song)
    .filter((song): song is State.Song => !!song);
  State.playQueue.value = State.playQueue.value
    .map(song => lookup.get(song.path) ?? song)
    .filter((song): song is State.Song => !!song);
  State.recentSongs.value = State.recentSongs.value
    .map(item => {
      const song = lookup.get(item.song.path) ?? item.song;
      return song ? { ...item, song } : null;
    })
    .filter((item): item is State.HistoryItem => !!item);

  if (State.currentSong.value?.path) {
    State.currentSong.value = lookup.get(State.currentSong.value.path) ?? State.currentSong.value;
  }
};

const cancelScheduledLibraryRefresh = () => {
  if (libraryRefreshTimer) {
    clearTimeout(libraryRefreshTimer);
    libraryRefreshTimer = null;
  }
  if (libraryRefreshIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(libraryRefreshIdleId);
    libraryRefreshIdleId = null;
  }
};



export function usePlayer() {



  const { loadLyrics } = useLyrics();
  const { settings: appSettings } = useAppSettings();



  // ... (格式化函数保持不变) ...

  function formatDuration(seconds: number) { if (!seconds) return "00:00"; const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; }

  function formatTimeAgo(timestamp: number) { const now = Date.now(); const diff = now - timestamp; const oneHour = 60 * 60 * 1000; if (diff < oneHour) return `${Math.max(1, Math.floor(diff / 60000))}分钟前`; if (diff < 24 * oneHour) return `${Math.floor(diff / oneHour)}小时前`; return `${Math.floor(diff / (24 * oneHour))}天前`; }



  // ... (计算属性保持不变) ...

  const isLocalMusic = computed(() => State.currentViewMode.value === 'all' || State.currentViewMode.value === 'artist' || State.currentViewMode.value === 'album');

  const isFolderMode = computed(() => State.currentViewMode.value === 'folder');




  // 🟢 核心：定义“库内歌曲”
  // 使用新的 librarySongs 状态 (由 scanLibrary populates)
  const librarySongs = computed(() => {
    return State.librarySongs.value;
  });

  onMounted(async () => {
    if (hasBootstrappedLibrary) return;
    hasBootstrappedLibrary = true;

    if (!libraryBootstrapPromise) {
      libraryBootstrapPromise = (async () => {
        await Promise.all([
          loadLibrarySongsFromCache(),
          fetchLibraryFolders(),
        ]);
        scheduleLibraryRefresh();
      })();
    }

    await libraryBootstrapPromise;
  });

  // --- Library Management ---
  async function fetchLibraryFolders() {
    try {
      const folders = await invoke<State.LibraryFolder[]>('get_library_folders');
      State.libraryFolders.value = folders;
    } catch (e) {
      console.error("Failed to fetch library folders:", e);
    }
  }

  async function loadLibrarySongsFromCache() {
    try {
      flushBufferedLibraryScanBatch();
      const songs = await invoke<State.Song[]>('get_library_songs_cached');
      State.librarySongs.value = songs;
      refreshStateSongReferences(songs);
    } catch (e) {
      console.error("Failed to load cached library songs:", e);
    }
  }

  function scheduleLibraryRefresh() {
    if (libraryRefreshPromise || libraryRefreshIdleId !== null || libraryRefreshTimer) {
      return;
    }

    if (State.libraryFolders.value.length === 0) {
      return;
    }

    const scheduledSession = startLibraryScanSession({
      trigger: 'bootstrap',
      visibility: 'silent',
      sourcePath: '',
    });
    beginLibraryScanProgress(scheduledSession);

    const runRefresh = () => {
      libraryRefreshIdleId = null;
      libraryRefreshTimer = null;
      void scanLibrary({ trigger: 'bootstrap', visibility: 'silent' });
    };

    if ('requestIdleCallback' in window) {
      libraryRefreshIdleId = window.requestIdleCallback(runRefresh, { timeout: 400 });
      return;
    }

    libraryRefreshTimer = setTimeout(runRefresh, 220);
  }

  async function addLibraryFolderRecord(path: string, scanOptions?: ScanLibraryOptions) {
    await invoke('add_library_folder', { path });
    await fetchLibraryFolders();
    await scanLibrary(scanOptions ?? getLibraryAddScanOptions(path));
  }

  async function addSidebarFolderRecord(path: string) {
    await invoke('add_sidebar_folder', { path });
    await invoke('scan_music_folder', { folderPath: path });
    await fetchSidebarTree();
  }

  async function removeLibraryFolderRecord(path: string) {
    await invoke('remove_library_folder', { path });
    await fetchLibraryFolders();
    await scanLibrary({ trigger: 'manual-rescan', visibility: 'inline' });
  }

  async function removeSidebarFolderRecord(path: string) {
    await invoke('remove_sidebar_folder', { path });
    await fetchSidebarTree();
  }

  async function addLibraryFolderLinked(
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean; scanOptions?: ScanLibraryOptions } = {}
  ) {
    const { syncLinked = true, showToast = false, scanOptions } = options;
    const resolvedScanOptions = resolveScanLibraryOptions(scanOptions ?? getLibraryAddScanOptions(path));

    await addLibraryFolderRecord(path, resolvedScanOptions);

    if (syncLinked && appSettings.value.linkFoldersToLibrary) {
      await addSidebarFolderRecord(path);
    }

    if (showToast) {
      const toastText = resolvedScanOptions.visibility === 'silent'
        ? "已添加文件夹，正在后台扫描"
        : syncLinked && appSettings.value.linkFoldersToLibrary
          ? "已将文件夹同时添加到本地音乐库和侧边栏"
          : "已添加文件夹到音乐库";
      useToast().showToast(toastText, "success");
      return;
      useToast().showToast(
        syncLinked && appSettings.value.linkFoldersToLibrary
          ? "已将文件夹同时添加到本地音乐库和侧边栏"
          : "已添加文件夹到音乐库",
        "success"
      );
    }
  }

  async function playExternalSongs(songs: State.Song[]) {
    const queue = dedupeSongs(songs);
    if (queue.length === 0) return;

    State.playQueue.value = [...queue];
    State.tempQueue.value = [];
    shuffleHistory.length = 0;
    shuffleFuture.length = 0;

    await playSong(queue[0], { preserveQueue: true });
  }

  async function handleExternalPaths(
    paths: string[],
    options: HandleExternalPathsOptions = {}
  ) {
    const source = options.source ?? 'drop';
    const uniquePaths = dedupePaths(paths);
    if (uniquePaths.length === 0) return;

    const pathKinds = await Promise.all(uniquePaths.map(async (path) => ({
      path,
      isDirectory: await invoke<boolean>('is_directory', { path }).catch(() => false)
    })));

    const directoryPaths = pathKinds.filter(item => item.isDirectory).map(item => item.path);
    const filePaths = pathKinds.filter(item => !item.isDirectory).map(item => item.path);

    const existingLibraryPaths = new Set(State.libraryFolders.value.map(folder => folder.path));
    let importedFolderCount = 0;
    let skippedFolderCount = 0;
    for (const directoryPath of directoryPaths) {
      if (existingLibraryPaths.has(directoryPath)) {
        skippedFolderCount += 1;
        continue;
      }

      try {
        await addLibraryFolderLinked(directoryPath);
        importedFolderCount += 1;
      } catch (error) {
        console.error('Failed to import external folder:', directoryPath, error);
      }
    }

    const parsedSongs = filePaths.length > 0
      ? await invoke<State.Song[]>('parse_audio_files', { paths: filePaths }).catch((error) => {
        console.error('Failed to parse external audio files:', error);
        return [];
      })
      : [];

    const playableSongs = dedupeSongs(parsedSongs);
    if (playableSongs.length > 0) {
      await playExternalSongs(playableSongs);
    }

    const ignoredFileCount = Math.max(0, filePaths.length - playableSongs.length);

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
        ? '未找到可播放的音频文件或可导入的文件夹'
        : '拖入内容中没有可播放的音频文件或可导入的文件夹',
      'error'
    );
  }

  async function removeLibraryFolderLinked(
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean } = {}
  ) {
    const { syncLinked = true, showToast = true } = options;

    await removeLibraryFolderRecord(path);

    if (syncLinked && appSettings.value.linkFoldersToLibrary) {
      await removeSidebarFolderRecord(path);
    }

    if (showToast) {
      useToast().showToast(
        syncLinked && appSettings.value.linkFoldersToLibrary
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
    const { syncLinked = true, showToast = true } = options;

    await addSidebarFolderRecord(path);

    if (syncLinked && appSettings.value.linkFoldersToLibrary) {
      await addLibraryFolderRecord(path);
    }

    if (showToast) {
      useToast().showToast(
        syncLinked && appSettings.value.linkFoldersToLibrary
          ? "已将文件夹同时添加到侧边栏和本地音乐库"
          : "已添加文件夹到侧边栏",
        "success"
      );
    }
  }

  async function removeSidebarFolderLinked(
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean } = {}
  ) {
    const { syncLinked = true, showToast = true } = options;

    await removeSidebarFolderRecord(path);

    if (syncLinked && appSettings.value.linkFoldersToLibrary) {
      await removeLibraryFolderRecord(path);
    }

    if (showToast) {
      useToast().showToast(
        syncLinked && appSettings.value.linkFoldersToLibrary
          ? "已从侧边栏和本地音乐库同步移除文件夹"
          : "已从侧边栏移除文件夹",
        "success"
      );
    }
  }

  async function addLibraryFolder() {
    try {
      const selected = await open({ directory: true, multiple: false, title: '选择音乐文件夹' });
      if (selected && typeof selected === 'string') {
        const scanOptions = getLibraryAddScanOptions(selected);
        await addLibraryFolderLinked(selected, {
          showToast: scanOptions.visibility === 'silent',
          scanOptions,
        });
      }
    } catch (e) {
      console.error("Failed to add library folder:", e);
      useToast().showToast("添加文件夹失败: " + e, "error");
    }
  }

  async function addLibraryFolderPath(path: string) {
    try {
      await invoke('add_library_folder', { path });
      await fetchLibraryFolders();
      await scanLibrary(getLibraryAddScanOptions(path));
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
  const removeNodeFromTree = (nodes: State.FolderNode[], targetPath: string): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].path === targetPath) {
        nodes.splice(i, 1);
        return true;
      }
      if (nodes[i].children && nodes[i].children.length > 0) {
        if (removeNodeFromTree(nodes[i].children, targetPath)) {
          return true;
        }
      }
    }
    return false;
  };

  // 🟢 Physical Folder Deletion (Management Mode)
  async function deleteFolder(path: string) {
    try {
      await invoke('delete_folder', { path });

      // Check if it's a root folder
      const isRoot = State.folderTree.value.some(n => n.path === path);

      if (isRoot) {
        // If it's a root, we should remove it from the sidebar list entirely
        await removeSidebarFolderLinked(path, { showToast: false });
      } else {
        // If it's a subfolder, just remove it from the tree view optimistically
        removeNodeFromTree(State.folderTree.value, path);
      }

    } catch (e) {
      throw e; // Let caller handle error toast
    }
  }

  // 🟢 Helper: Recursively increment song count for a folder
  const incrementNodeCount = (nodes: State.FolderNode[], targetPath: string): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].path === targetPath) {
        nodes[i].song_count++;
        return true;
      }
      if (nodes[i].children && nodes[i].children.length > 0) {
        if (incrementNodeCount(nodes[i].children, targetPath)) {
          return true;
        }
      }
    }
    return false;
  };

  // 🟢 Helper: Recursively decrement song count for a folder
  const decrementNodeCount = (nodes: State.FolderNode[], targetPath: string): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].path === targetPath) {
        if (nodes[i].song_count > 0) nodes[i].song_count--;
        return true;
      }
      if (nodes[i].children && nodes[i].children.length > 0) {
        if (decrementNodeCount(nodes[i].children, targetPath)) {
          return true;
        }
      }
    }
    return false;
  };

  // 🟢 Helper: Update folder cover when first song changes
  const updateFolderCover = (nodes: State.FolderNode[], folderPath: string, newCoverSongPath: string | null): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].path === folderPath) {
        nodes[i].cover_song_path = newCoverSongPath;
        return true;
      }
      if (nodes[i].children && nodes[i].children.length > 0) {
        if (updateFolderCover(nodes[i].children, folderPath, newCoverSongPath)) {
          return true;
        }
      }
    }
    return false;
  };

  // 🟢 Helper: Get parent folder path from file path
  const getParentFolder = (filePath: string): string => {
    const sep = filePath.includes('\\') ? '\\' : '/';
    const parts = filePath.split(sep);
    parts.pop(); // Remove filename
    return parts.join(sep);
  };

  // 🟢 Physical File Move (Management Mode)
  async function moveFilePhysical(sourcePath: string, targetFolderPath: string) {
    try {
      // Get source folder path before moving
      const sourceFolderPath = getParentFolder(sourcePath);

      // Check if this song is the cover of source folder
      const sourceNode = findNode(State.folderTree.value, sourceFolderPath);
      const wasSourceCover = sourceNode?.cover_song_path === sourcePath;

      // 1. Backend Move
      await invoke('move_file_to_folder', { sourcePath, targetFolder: targetFolderPath });

      // 2. Optimistic UI Update

      // Remove from current song list if it matches (visual removal)
      const index = State.songList.value.findIndex(s => s.path === sourcePath);
      if (index !== -1) {
        State.songList.value.splice(index, 1);
      }

      // Update Source Folder Count (decrement)
      decrementNodeCount(State.folderTree.value, sourceFolderPath);

      // Update Source Folder Cover if needed - use backend query
      if (wasSourceCover) {
        try {
          const newCoverPath = await invoke<string | null>('get_folder_first_song', {
            folderPath: sourceFolderPath
          });
          updateFolderCover(State.folderTree.value, sourceFolderPath, newCoverPath);
        } catch {
          // If query fails, just clear the cover
          updateFolderCover(State.folderTree.value, sourceFolderPath, null);
        }
      }

      // Update Target Folder Count (increment)
      incrementNodeCount(State.folderTree.value, targetFolderPath);

      try {
        const targetCoverPath = await invoke<string | null>('get_folder_first_song', {
          folderPath: targetFolderPath
        });
        updateFolderCover(State.folderTree.value, targetFolderPath, targetCoverPath);
      } catch {
        updateFolderCover(State.folderTree.value, targetFolderPath, null);
      }

    } catch (e) {
      throw e;
    }
  }

  // 🟢 Helper: Find a node in the tree
  const findNode = (nodes: State.FolderNode[], targetPath: string): State.FolderNode | null => {
    for (const node of nodes) {
      if (node.path === targetPath) return node;
      if (node.children && node.children.length > 0) {
        const found = findNode(node.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  async function scanLibrary(options: ScanLibraryOptions = {}) {
    const resolvedOptions = resolveScanLibraryOptions(options);

    if (libraryRefreshPromise) {
      startLibraryScanSession(resolvedOptions);
      return libraryRefreshPromise;
    }

    cancelScheduledLibraryRefresh();

    if (State.libraryFolders.value.length === 0) {
      State.libraryScanSession.value = null;
      State.libraryScanProgress.value = null;
      State.lastLibraryScanError.value = null;
      return Promise.resolve();
    }

    const session = startLibraryScanSession(resolvedOptions);
    beginLibraryScanProgress(session);
    State.lastLibraryScanError.value = null;

    libraryRefreshPromise = (async () => {
      try {
        flushBufferedLibraryScanBatch();
        const songs = await invoke<State.Song[]>('scan_library');
        State.librarySongs.value = songs;
        refreshStateSongReferences(songs);
        await fetchLibraryFolders();

        if (!State.libraryScanProgress.value?.done) {
          finalizeLibraryScanProgress(songs);
        }
      } catch (e) {
        console.error("Library scan failed:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        State.lastLibraryScanError.value = errorMessage;
        finalizeLibraryScanProgress([], true, errorMessage || '扫描音乐库时出现问题');
        if (session.visibility === 'silent') {
          useToast().showToast("后台扫描失败，请在音乐库设置中重试", "error");
        }
      } finally {
        libraryRefreshPromise = null;
      }
    })();

    return libraryRefreshPromise;
  }

  // --- Sidebar Folder Management (New) ---

  const collectExpandedPaths = (nodes: State.FolderNode[], expanded = new Set<string>()) => {
    for (const node of nodes) {
      if (node.is_expanded) {
        expanded.add(node.path);
      }
      if (node.children.length > 0) {
        collectExpandedPaths(node.children, expanded);
      }
    }
    return expanded;
  };

  const applyExpandedPaths = (nodes: State.FolderNode[], expandedPaths: Set<string>) => {
    for (const node of nodes) {
      node.is_expanded = expandedPaths.has(node.path);
      if (node.children.length > 0) {
        applyExpandedPaths(node.children, expandedPaths);
      }
    }
  };

  const expandTreeToPath = (nodes: State.FolderNode[], targetPath: string): boolean => {
    for (const node of nodes) {
      if (node.path === targetPath) {
        return true;
      }
      if (node.children.length > 0 && expandTreeToPath(node.children, targetPath)) {
        node.is_expanded = true;
        return true;
      }
    }
    return false;
  };

  async function fetchSidebarTree() {
    try {
      const expandedPaths = collectExpandedPaths(State.folderTree.value);
      // Use NEW command for independent sidebar
      const tree = await invoke<State.FolderNode[]>('get_sidebar_hierarchy');
      applyExpandedPaths(tree, expandedPaths);
      State.folderTree.value = tree;
    } catch (e) {
      console.error("Failed to fetch sidebar tree:", e);
    }
  }

  async function createFolder(parentPath: string, folderName: string) {
    return invoke<string>('create_folder', { parentPath, folderName });
  }

  async function addSidebarFolder() {
    try {
      const selected = await open({ directory: true, multiple: false, title: '添加文件夹到侧边栏' });
      if (selected && typeof selected === 'string') {
        const shouldLinkToLibrary = appSettings.value.linkFoldersToLibrary;
        await invoke('add_sidebar_folder', { path: selected });
        // 🟢 扫描歌曲到数据库，确保封面可被查询到
        await invoke('scan_music_folder', { folderPath: selected });
        await fetchSidebarTree();
        if (shouldLinkToLibrary) {
          await addLibraryFolderPath(selected);
          useToast().showToast("已添加文件夹到侧边栏，并关联到本地音乐库", "success");
          return;
        }
        useToast().showToast("已添加文件夹到侧边栏", "success");
      }
    } catch (e) {
      console.error("Failed to add sidebar folder:", e);
      useToast().showToast("添加失败: " + e, "error");
    }
  }

  async function removeSidebarFolder(path: string) {
    try {
      await invoke('remove_sidebar_folder', { path });
      await fetchSidebarTree();
      useToast().showToast("已移除侧边栏文件夹", "success");
    } catch (e) {
      console.error("Failed to remove sidebar folder:", e);
    }
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



    // folderList 顺序直接由 watchedFolders 数组顺序决定，因此支持手动排序



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

    // 🟢 关键修改:文件夹视图只显示直属子歌曲,不递归,并支持排序
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
          // 自定义排序(拖拽后的顺序)
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

      // 🟢 应用排序 (与本地音乐共享模式)
      if (State.localSortMode.value === 'title') {
        songs.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'name') {
        songs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'artist') {
        songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
      } else if (State.localSortMode.value === 'added_at') {
        // 最近播放本身就是按时间排的,但如果用户选了添加时间,则按扫描入库时间排
        songs.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
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
      // 'custom' 模式不需要排序,因为它已经通过 map(path => ...) 维持了 songPaths 的顺序

      return songs;
    }

    return librarySongs.value.filter(s =>
      songHasArtist(s, State.filterCondition.value) ||
      matchesAlbumKey(s, State.filterCondition.value) ||
      (s.genre || 'Unknown') === State.filterCondition.value ||
      ((s.year?.substring(0, 4)) || 'Unknown') === State.filterCondition.value
    );

  });



  watch(displaySongList, async (newList) => {

    if (State.currentViewMode.value === 'favorites' && (State.favTab.value === 'artists' || State.favTab.value === 'albums') && !State.favDetailFilter.value) return;

    if (newList.length > 0) { try { const cover = await invoke<string>('get_song_cover', { path: newList[0].path }); State.playlistCover.value = cover; } catch { State.playlistCover.value = ''; } } else { State.playlistCover.value = ''; }

  }, { immediate: true });



  async function addFoldersFromStructure() {



    try {



      const selectedPath = await open({ directory: true, multiple: false, title: '选择要扫描的根目录' });



      if (!selectedPath || typeof selectedPath !== 'string') return;



      const newFolders = await invoke<GeneratedFolder[]>('scan_folder_as_playlists', { rootPath: selectedPath });



      if (newFolders.length === 0) { useToast().showToast("未在该目录下找到包含音乐文件的文件夹", "error"); return; }



      let addedCount = 0;



      let allNewSongs: State.Song[] = [];



      newFolders.forEach(folder => {



        if (!State.watchedFolders.value.includes(folder.path)) { State.watchedFolders.value.push(folder.path); addedCount++; }



        allNewSongs.push(...folder.songs);



      });



      const existingPaths = new Set(State.songList.value.map(s => s.path));



      const uniqueNewSongs = allNewSongs.filter(s => !existingPaths.has(s.path));



      State.songList.value = [...State.songList.value, ...uniqueNewSongs];



      useToast().showToast(`已添加 ${addedCount} 个文件夹到侧边栏`, "success");



    } catch (e) { console.error("添加文件夹失败:", e); useToast().showToast("添加文件夹失败: " + e, "error"); }



  }







  function getSongsInFolder(folderPath: string) { return State.songList.value.filter(s => isDirectParent(folderPath, s.path)); }







  // 🟢 重点：创建歌单时，记录当前日期

  function createPlaylist(n: string, initialSongs: string[] = []) {

    if (n.trim()) {

      const now = new Date();

      const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;



      State.playlists.value.push({

        id: Date.now().toString() + Math.random().toString().slice(2),

        name: n,

        songPaths: [...initialSongs],

        createdAt: dateStr // 新增字段

      });

    }

  }



  async function moveFilesToFolder(paths: string[], targetFolder: string) {
    try {
      // Track source folders for count/cover updates
      const sourceFolderMap = new Map<string, { count: number; coverPaths: string[] }>();

      paths.forEach(oldPath => {
        const sourceFolder = getParentFolder(oldPath);
        if (!sourceFolderMap.has(sourceFolder)) {
          const node = findNode(State.folderTree.value, sourceFolder);
          sourceFolderMap.set(sourceFolder, {
            count: 0,
            coverPaths: node?.cover_song_path === oldPath ? [oldPath] : []
          });
        }
        const entry = sourceFolderMap.get(sourceFolder)!;
        entry.count++;

        // Check if this file is the cover of source folder
        const node = findNode(State.folderTree.value, sourceFolder);
        if (node?.cover_song_path === oldPath && !entry.coverPaths.includes(oldPath)) {
          entry.coverPaths.push(oldPath);
        }
      });

      const count = await invoke<number>('batch_move_music_files', { paths, targetFolder });

      // Remove songs from songList and update paths
      paths.forEach(oldPath => {
        const idx = State.songList.value.findIndex(s => s.path === oldPath);
        if (idx !== -1) {
          State.songList.value.splice(idx, 1);
        }
      });

      // Update Source Folder Counts and Covers
      for (const [sourceFolder, entry] of sourceFolderMap) {
        // Decrement count
        for (let i = 0; i < entry.count; i++) {
          decrementNodeCount(State.folderTree.value, sourceFolder);
        }

        // Update cover if needed - use backend query
        if (entry.coverPaths.length > 0) {
          try {
            const newCoverPath = await invoke<string | null>('get_folder_first_song', {
              folderPath: sourceFolder
            });
            updateFolderCover(State.folderTree.value, sourceFolder, newCoverPath);
          } catch {
            updateFolderCover(State.folderTree.value, sourceFolder, null);
          }
        }
      }

      // Update Target Folder Count
      for (let i = 0; i < count; i++) {
        incrementNodeCount(State.folderTree.value, targetFolder);
      }

      try {
        const targetCoverPath = await invoke<string | null>('get_folder_first_song', {
          folderPath: targetFolder
        });
        updateFolderCover(State.folderTree.value, targetFolder, targetCoverPath);
      } catch {
        updateFolderCover(State.folderTree.value, targetFolder, null);
      }

      return count;
    } catch (e) {
      throw e;
    }
  }



  async function refreshFolder(folderPath: string) {

    try {

      const newSongs = await invoke<State.Song[]>('scan_music_folder', { folderPath });

      const otherSongs = State.songList.value.filter(s => !s.path.startsWith(folderPath));

      State.songList.value = [...otherSongs, ...newSongs];

    } catch (e) {

      console.error("刷新失败:", e);

      throw e;

    }

  }



  // ... (其他函数保持不变) ...

  function deletePlaylist(id: string) { State.playlists.value = State.playlists.value.filter(p => p.id !== id); if (State.currentViewMode.value === 'playlist' && State.filterCondition.value === id) switchViewToAll(); }

  function addToPlaylist(pid: string, path: string) { const pl = State.playlists.value.find(p => p.id === pid); if (pl && !pl.songPaths.includes(path)) pl.songPaths.push(path); }

  function removeFromPlaylist(pid: string, path: string) { const pl = State.playlists.value.find(p => p.id === pid); if (pl) pl.songPaths = pl.songPaths.filter(p => p !== path); }

  function addSongsToPlaylist(playlistId: string, songPaths: string[]): number { const pl = State.playlists.value.find(p => p.id === playlistId); if (!pl) return 0; let addedCount = 0; songPaths.forEach(path => { if (!pl.songPaths.includes(path)) { pl.songPaths.push(path); addedCount++; } }); return addedCount; }

  function viewPlaylist(id: string) { State.currentViewMode.value = 'playlist'; State.filterCondition.value = id; State.searchQuery.value = ''; }

  function switchToFolderView() { State.currentViewMode.value = 'folder'; State.searchQuery.value = ''; if (!State.currentFolderFilter.value && State.watchedFolders.value.length > 0) State.currentFolderFilter.value = State.watchedFolders.value[0]; }

  function removeFolder(folderPath: string) {

    State.watchedFolders.value = State.watchedFolders.value.filter(p => p !== folderPath);

    // 🟢 关键：移除文件夹不再从全局 songList 中删除歌曲数据

    // 这样已生成的歌单依然可以正常引用这些歌曲路径

    if (State.currentFolderFilter.value === folderPath) State.currentFolderFilter.value = State.watchedFolders.value.length > 0 ? State.watchedFolders.value[0] : '';

  }

  function viewArtist(n: string) { State.currentViewMode.value = 'artist'; State.filterCondition.value = n; State.searchQuery.value = ''; }

  function viewAlbum(n: string) { State.currentViewMode.value = 'album'; State.filterCondition.value = n; State.searchQuery.value = ''; }

  function viewGenre(n: string) { State.currentViewMode.value = 'genre'; State.filterCondition.value = n; State.searchQuery.value = ''; }

  function viewYear(n: string) { State.currentViewMode.value = 'year'; State.filterCondition.value = n; State.searchQuery.value = ''; }

  function switchViewToAll() { State.currentViewMode.value = 'all'; State.filterCondition.value = ''; State.searchQuery.value = ''; }

  function switchViewToFolder(p: string) { State.currentViewMode.value = 'folder'; State.filterCondition.value = p; State.searchQuery.value = ''; }

  function switchToRecent() { State.currentViewMode.value = 'recent'; State.searchQuery.value = ''; }

  function switchToFavorites() { State.currentViewMode.value = 'favorites'; State.searchQuery.value = ''; }

  function switchToStatistics() { State.currentViewMode.value = 'statistics'; State.searchQuery.value = ''; }

  function setSearch(q: string) { State.searchQuery.value = q; }

  function switchLocalTab(tab: 'default' | 'artist' | 'album') { State.localMusicTab.value = tab; State.currentArtistFilter.value = ''; State.currentAlbumFilter.value = ''; if (tab === 'artist' && artistList.value.length > 0) State.currentArtistFilter.value = artistList.value[0].name; if (tab === 'album' && albumList.value.length > 0) State.currentAlbumFilter.value = albumList.value[0].key; }

  function switchFavTab(tab: 'songs' | 'artists' | 'albums') { State.favTab.value = tab; }

  function isFavorite(s: State.Song | null) { if (!s) return false; return State.favoritePaths.value.includes(s.path); }

  function toggleFavorite(s: State.Song) { if (isFavorite(s)) State.favoritePaths.value = State.favoritePaths.value.filter(p => p !== s.path); else State.favoritePaths.value.push(s.path); }

  async function addToHistory(song: State.Song) {
    State.recentSongs.value = State.recentSongs.value.filter(item => item.song.path !== song.path);
    State.recentSongs.value.unshift({ song, playedAt: Date.now() });
    if (State.recentSongs.value.length > 1000) {
      State.recentSongs.value = State.recentSongs.value.slice(0, 1000);
    }
    localStorage.removeItem(LEGACY_PLAYER_HISTORY_KEY);

    invoke('add_to_history', { songPath: song.path }).catch(e => {
      console.warn('add_to_history failed:', e);
    });
  }

  async function removeFromHistory(songPaths: string[]) {
    if (songPaths.length === 0) return;

    const pathSet = new Set(songPaths);
    State.recentSongs.value = State.recentSongs.value.filter(item => !pathSet.has(item.song.path));
    localStorage.removeItem(LEGACY_PLAYER_HISTORY_KEY);

    try {
      await invoke('remove_from_recent_history', { songPaths });
    } catch (e) {
      console.warn('remove_from_recent_history failed:', e);
    }
  }

  async function clearHistory() {
    State.recentSongs.value = [];
    localStorage.removeItem(LEGACY_PLAYER_HISTORY_KEY);

    try {
      await invoke('clear_recent_history');
    } catch (e) {
      console.warn('clear_recent_history failed:', e);
    }
  }

  function clearLocalMusic() { State.songList.value = []; State.watchedFolders.value = []; }

  function clearFavorites() { State.favoritePaths.value = []; }

  async function addFolder() {

    try {

      const sel = await open({ directory: true, multiple: false });

      if (sel && typeof sel === 'string') {

        // 🟢 修改点：手动添加也使用“拆分”逻辑，将子目录识别为独立实体

        const newFolders = await invoke<GeneratedFolder[]>('scan_folder_as_playlists', { rootPath: sel });

        if (newFolders.length === 0) {

          // 如果没有子目录有歌，或者就是单层目录，尝试作为单层目录添加

          if (!State.watchedFolders.value.includes(sel)) State.watchedFolders.value.push(sel);

          const newS = await invoke<State.Song[]>('scan_music_folder', { folderPath: sel });

          const exist = new Set(State.songList.value.map(s => s.path));

          const uniq = newS.filter(s => !exist.has(s.path));

          State.songList.value = [...State.songList.value, ...uniq];

        } else {

          // 使用拆分后的文件夹

          newFolders.forEach(folder => {

            if (!State.watchedFolders.value.includes(folder.path)) State.watchedFolders.value.push(folder.path);

          });

          const allNewSongs = newFolders.flatMap(f => f.songs);

          const existingPaths = new Set(State.songList.value.map(s => s.path));

          const uniqueNewSongs = allNewSongs.filter(s => !existingPaths.has(s.path));

          State.songList.value = [...State.songList.value, ...uniqueNewSongs];

        }

      }

    } catch (e) { console.error(e); }

  }
  function generateOrganizedPath(song: State.Song): string { const root = State.settings.value.organizeRoot || 'D:\\Music'; const sep = root.includes('/') ? '/' : '\\'; if (!State.settings.value.enableAutoOrganize) return ""; const clean = (s: string) => s.replace(/[<>:"/\\|?*]/g, '_').trim(); const artist = clean(song.artist && song.artist !== 'Unknown' ? song.artist : 'Unknown Artist'); const album = clean(song.album && song.album !== 'Unknown' ? song.album : 'Unknown Album'); const title = clean(song.title || song.name); const year = clean(song.year ? song.year.substring(0, 4) : '0000'); let relativePath = State.settings.value.organizeRule.replace('{Artist}', artist).replace('{Album}', album).replace('{Title}', title).replace('{Year}', year); relativePath = relativePath.replace(/\/\//g, '/').replace(/\\\\/g, '\\'); return `${root}${sep}${relativePath}`; }
  async function moveFile(song: State.Song, newPath: string) { try { await invoke('move_music_file', { oldPath: song.path, newPath }); const oldPath = song.path; const target = State.songList.value.find(s => s.path === oldPath); if (target) target.path = newPath; if (State.currentSong.value && State.currentSong.value.path === oldPath) State.currentSong.value.path = newPath; State.playlists.value.forEach(pl => { const i = pl.songPaths.indexOf(oldPath); if (i !== -1) pl.songPaths[i] = newPath; }); const fi = State.favoritePaths.value.indexOf(oldPath); if (fi !== -1) State.favoritePaths.value[fi] = newPath; return true; } catch (e) { useToast().showToast(`整理失败: ${e}`, "error"); return false; } }
  function handleAutoNext() { if (State.playMode.value === 1 && State.currentSong.value) { playSong(State.currentSong.value); } else { nextSong(); } }
  async function handleVolume(e: Event) { const v = parseInt((e.target as HTMLInputElement).value); State.volume.value = v; await invoke('set_volume', { volume: v / 100.0 }); }
  async function toggleMute() { if (State.volume.value > 0) { State.volume.value = 0; await invoke('set_volume', { volume: 0.0 }); } else { State.volume.value = 100; await invoke('set_volume', { volume: 1.0 }); } }
  function toggleMode() {
    State.playMode.value = (State.playMode.value + 1) % 3;
    shuffleHistory.length = 0;
    shuffleFuture.length = 0;
  }
  function togglePlaylist() { State.showPlaylist.value = !State.showPlaylist.value; }
  function toggleMiniPlaylist() { State.showMiniPlaylist.value = !State.showMiniPlaylist.value; }
  function closeMiniPlaylist() { State.showMiniPlaylist.value = false; }
  async function handleScan() { addFolder(); }
  function playNext(song: State.Song) { State.tempQueue.value.unshift(song); }
  async function removeSongFromList(song: State.Song) {
    if (State.currentViewMode.value === 'all') {
      State.songList.value = State.songList.value.filter(s => s.path !== song.path);
    } else if (State.currentViewMode.value === 'favorites') {
      State.favoritePaths.value = State.favoritePaths.value.filter(p => p !== song.path);
    } else if (State.currentViewMode.value === 'recent') {
      await removeFromHistory([song.path]);
    }
  }
  async function openInFinder(path: string) { await invoke('show_in_folder', { path }); }
  async function deleteFromDisk(song: State.Song) {
    try {
      await invoke('delete_music_file', { path: song.path });
      State.songList.value = State.songList.value.filter(s => s.path !== song.path);
      State.favoritePaths.value = State.favoritePaths.value.filter(p => p !== song.path);
      await removeFromHistory([song.path]);
      State.playlists.value.forEach(pl => { pl.songPaths = pl.songPaths.filter(p => p !== song.path); });
    } catch (e) {
      useToast().showToast("删除失败: " + e, "error");
    }
  }

  function stopTimer() {
    if (progressFrameId !== null) { cancelAnimationFrame(progressFrameId); progressFrameId = null; }
    if (syncIntervalId !== null) { clearInterval(syncIntervalId); syncIntervalId = null; }
  }

  function reanchorPlaybackClock(time: number) {
    playbackAnchorTime = performance.now();
    playbackStartOffset = time;
    State.currentTime.value = time;
  }

  function startTimer() {
    stopTimer();
    reanchorPlaybackClock(State.currentTime.value);
    const update = () => {
      if (!State.currentSong.value || !State.isPlaying.value) return;
      const now = performance.now();
      const delta = (now - playbackAnchorTime) / 1000.0;
      State.currentTime.value = playbackStartOffset + delta;
      if (State.currentTime.value >= State.currentSong.value.duration) { handleAutoNext(); return; }
      progressFrameId = requestAnimationFrame(update);
    };
    progressFrameId = requestAnimationFrame(update);
    syncIntervalId = setInterval(async () => {
      if (!State.isPlaying.value) return;
      if (isSeeking) return; // 🟢 正在 seek 时跳过同步，避免回滚 UI
      try {
        const realTime = await invoke<number>('get_playback_progress');
        const uiTime = State.currentTime.value;
        if (Math.abs(realTime - uiTime) > 0.05) {
          reanchorPlaybackClock(realTime);
        }
      } catch (e) { }
    }, 1000);
  }


  // 🟢 播放时长统计状态（已移到模块顶层）

  // 🟢 辅助：结算并记录播放时长
  const flushPlaySession = () => {
    const song = State.currentSong.value;
    if (!song) return;

    let currentSession = 0;
    // 如果正在播放，加上当前这段时间
    if (State.isPlaying.value && sessionStartTime) {
      currentSession = (Date.now() - sessionStartTime) / 1000;
    }

    const totalDuration = accumulatedTime + currentSession;

    // Anti-cheat: 只有超过 10 秒才记录
    if (totalDuration >= 10) {
      invoke('record_play', {
        songPath: song.path,
        duration: Math.floor(totalDuration)
      }).catch(e => console.warn('record_play failed:', e));
    }

    // Reset
    accumulatedTime = 0;
    sessionStartTime = null;
  };

  function getNavigationList() {
    return State.playQueue.value.length ? State.playQueue.value : State.songList.value;
  }

  function findSongByPath(path: string | undefined, primaryList: State.Song[] = []) {
    if (!path) return null;

    const candidateLists = [
      primaryList,
      State.playQueue.value,
      State.tempQueue.value,
      State.songList.value,
      State.librarySongs.value,
      State.currentSong.value ? [State.currentSong.value] : []
    ];

    for (const list of candidateLists) {
      const song = list.find(item => item.path === path);
      if (song) return song;
    }

    return null;
  }

  function pickRandomSong(list: State.Song[]) {
    if (list.length === 0) return null;
    if (list.length === 1) return list[0];

    const currentPath = State.currentSong.value?.path;
    const candidates = currentPath
      ? list.filter(song => song.path !== currentPath)
      : list;

    if (candidates.length === 0) return list[0];
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  async function playSong(song: State.Song, options: PlaySongOptions = {}) {
    const requestId = ++playRequestId;
    // 🟢 切歌前：结算上一首
    flushPlaySession();

    const shouldUpdateShuffleHistory = options.updateShuffleHistory ?? true;
    const shouldClearShuffleFuture = options.clearShuffleFuture ?? true;
    const preserveQueue = options.preserveQueue ?? false;
    const previousSong = State.currentSong.value;

    if (
      State.playMode.value === 2 &&
      shouldUpdateShuffleHistory &&
      previousSong &&
      previousSong.path !== song.path
    ) {
      shuffleHistory.push(previousSong.path);
      if (shouldClearShuffleFuture) shuffleFuture.length = 0;
    }

    State.currentSong.value = song;

    // 🟢 核心逻辑：播放时更新播放队列
    // 如果当前展示的列表包含这首歌，则把播放队列设置为当前展示列表
    // 这样保证了 "接着放下一首" 的逻辑是正确的
    if (!preserveQueue && displaySongList.value.some(s => s.path === song.path)) {
      State.playQueue.value = [...displaySongList.value];
    } else if (!preserveQueue) {
      // 如果不在当前列表（比如来自搜索结果，或者历史记录），
      // 且队列里也没有这首歌，则把它加入队列（或者重置队列？）
      // 策略：如果队列里没有，就把它加进去；如果队列为空，就只放它
      if (!State.playQueue.value.some(s => s.path === song.path)) {
        if (State.playQueue.value.length === 0) State.playQueue.value = [song];
        else State.playQueue.value.push(song);
      }
    }

    State.isPlaying.value = true;
    State.isSongLoaded.value = false;
    stopTimer();
    reanchorPlaybackClock(0);
    // Keep previous cover until the next one is ready to avoid visual flash.

    // 🟢 开始新会话计时
    accumulatedTime = 0;
    sessionStartTime = null;

    addToHistory(song);

    // 🟢 移除旧的 record_play (改为在结束/切歌时记录)
    // invoke('record_play', { songPath: song.path }).catch(e => console.warn('record_play failed:', e));

    try {
      // 先尝试获取封面，为了 metadata 完整
      const cover = await invoke<string>('get_song_cover', { path: song.path }).catch(() => "");
      if (requestId !== playRequestId || State.currentSong.value?.path !== song.path) return;
      State.currentCover.value = cover;

      await invoke('play_audio', {
        path: song.path,
        title: song.name,
        artist: song.artist || "Unknown Artist",
        album: song.album || "Unknown Album",
        cover: cover,
        duration: Math.floor(song.duration)
      });
      if (requestId !== playRequestId || State.currentSong.value?.path !== song.path) return;

      State.isSongLoaded.value = true;
      sessionStartTime = Date.now();
      loadLyrics();
      startTimer();
    } catch (e) {
      if (requestId !== playRequestId || State.currentSong.value?.path !== song.path) return;
      State.isPlaying.value = false;
      State.isSongLoaded.value = false;
      sessionStartTime = null;
      stopTimer();
    }
  }

  async function pauseSong() {
    // 🟢 暂停：累计时间，清除 sessionStart
    if (State.isPlaying.value && sessionStartTime) {
      accumulatedTime += (Date.now() - sessionStartTime) / 1000;
      sessionStartTime = null;
    }

    State.isPlaying.value = false;
    await invoke('pause_audio');
    stopTimer();
  }

  async function togglePlay() {
    if (!State.currentSong.value) return;

    if (State.isPlaying.value) {
      // Pausing
      if (sessionStartTime) {
        accumulatedTime += (Date.now() - sessionStartTime) / 1000;
        sessionStartTime = null;
      }

      await invoke('pause_audio');
      State.isPlaying.value = false;
      stopTimer();
    } else {
      // Playing
      if (!State.isSongLoaded.value) {
        await playSong(State.currentSong.value);
      } else {
        await invoke('resume_audio');
        // Resuming: start session
        sessionStartTime = Date.now();
      }
      State.isPlaying.value = true;
      startTimer();
    }
  }

  function nextSong() {
    if (State.tempQueue.value.length > 0) { const next = State.tempQueue.value.shift(); if (next) { playSong(next); return; } }

    // 🟢 核心逻辑：使用 playQueue
    const l = getNavigationList();
    if (!l.length) return;

    if (State.playMode.value === 2) {
      const futureSong = findSongByPath(shuffleFuture.pop(), l);
      if (futureSong) {
        playSong(futureSong, { updateShuffleHistory: false, clearShuffleFuture: false });
        return;
      }

      const randomSong = pickRandomSong(l);
      if (randomSong) playSong(randomSong);
      return;
    }

    let i = l.findIndex(s => s.path === State.currentSong.value?.path);
    i = (i + 1) % l.length;
    playSong(l[i]);
  }

  function prevSong() {
    // 🟢 核心逻辑：使用 playQueue
    const l = getNavigationList();
    if (!l.length) return;

    if (State.playMode.value === 2) {
      const previousPath = shuffleHistory.pop();
      const previousSong = findSongByPath(previousPath, l);

      if (previousSong) {
        if (State.currentSong.value) {
          shuffleFuture.push(State.currentSong.value.path);
        }
        playSong(previousSong, { updateShuffleHistory: false, clearShuffleFuture: false });
        return;
      }

      const randomSong = pickRandomSong(l);
      if (randomSong) playSong(randomSong);
      return;
    }

    let i = l.findIndex(s => s.path === State.currentSong.value?.path);
    i = (i - 1 + l.length) % l.length;
    playSong(l[i]);
  }

  // 🟢 新增：清空播放队列 (仅内存)
  async function clearQueue() {
    State.playQueue.value = [];
    shuffleHistory.length = 0;
    shuffleFuture.length = 0;
    State.tempQueue.value = []; // 也清空插队队列
    if (State.isPlaying.value) {
      await invoke('pause_audio');
      State.isPlaying.value = false;
    }
    stopTimer();
    State.currentSong.value = null; // 可选：是否清空当前歌曲？通常清空列表也会停止当前播放
  }

  // 🟢 新增：从队列移除歌曲
  function removeSongFromQueue(song: State.Song) {
    State.playQueue.value = State.playQueue.value.filter(s => s.path !== song.path);
    State.tempQueue.value = State.tempQueue.value.filter(s => s.path !== song.path);
  }

  // 🟢 新增：添加到队列末尾
  function addSongToQueue(song: State.Song) {
    State.playQueue.value.push(song);
    useToast().showToast('已添加到队列', 'success');
  }

  // 🟢 批量添加
  function addSongsToQueue(songs: State.Song[]) {
    if (songs.length === 0) return;
    State.playQueue.value.push(...songs);
    useToast().showToast(`已添加 ${songs.length} 首歌曲到队列`, 'success');
  }

  function getSongsFromPlaylist(playlistId: string): State.Song[] {
    const pl = State.playlists.value.find(p => p.id === playlistId);
    if (!pl) return [];
    const songMap = new Map(State.songList.value.map(s => [s.path, s]));
    return pl.songPaths.map(path => songMap.get(path)).filter((s): s is State.Song => !!s);
  }
  async function seekTo(newTime: number) {
    if (!State.currentSong.value) return;

    if (State.isPlaying.value && sessionStartTime) {
      accumulatedTime += (Date.now() - sessionStartTime) / 1000;
      sessionStartTime = Date.now();
    }

    isSeeking = true;
    stopTimer();
    const targetTime = Math.max(0, Math.min(newTime, State.currentSong.value.duration));
    const requestId = ++latestSeekRequestId;
    reanchorPlaybackClock(targetTime);

    try {
      await invoke('seek_audio', {
        time: targetTime,
        isPlaying: State.isPlaying.value,
        requestId
      });
      reanchorPlaybackClock(targetTime);
      if (State.isPlaying.value) {
        startTimer();
      }
    } catch (error) {
      isSeeking = false;
      if (State.isPlaying.value) {
        startTimer();
      }
      throw error;
    }
  }
  async function playAt(time: number) { await seekTo(time); if (!State.isPlaying.value) { setTimeout(async () => { if (!State.isPlaying.value) await togglePlay(); }, 150); } }
  async function handleSeek(e: MouseEvent) { if (!State.currentSong.value) return; const t = e.currentTarget as HTMLElement; const r = t.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); const tm = p * State.currentSong.value.duration; await seekTo(tm); }
  async function stepSeek(step: number) { if (!State.currentSong.value) return; await seekTo(State.currentTime.value + step); }
  async function toggleAlwaysOnTop(enable: boolean) { try { await getCurrentWindow().setAlwaysOnTop(enable); } catch (e) { console.error('Failed to set always on top:', e); } }
  function togglePlayerDetail() { State.showPlayerDetail.value = !State.showPlayerDetail.value; }
  function toggleQueue() { State.showQueue.value = !State.showQueue.value; }
  function openAddToPlaylistDialog(songPath: string) { State.playlistAddTargetSongs.value = [songPath]; State.showAddToPlaylistModal.value = true; }

  function init() {
    if (playerInitDone) {
      return;
    }
    playerInitDone = true;

    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;
    let restoreIdleId: number | null = null;

    const flushPersistedState = () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }

      localStorage.setItem(PLAYER_PLAYLIST_PATHS_KEY, JSON.stringify(State.songList.value.map(song => song.path)));
      localStorage.setItem('player_watched_folders', JSON.stringify(State.watchedFolders.value));
      localStorage.setItem('player_favorites', JSON.stringify(State.favoritePaths.value));
      localStorage.setItem('player_custom_playlists', JSON.stringify(State.playlists.value));
      localStorage.setItem('player_settings', JSON.stringify(State.settings.value));
      localStorage.setItem(PLAYER_QUEUE_PATHS_KEY, JSON.stringify(State.playQueue.value.map(song => song.path)));
      localStorage.setItem('player_artist_custom_order', JSON.stringify(State.artistCustomOrder.value));
      localStorage.setItem('player_album_custom_order', JSON.stringify(State.albumCustomOrder.value));
      localStorage.setItem('player_folder_custom_order', JSON.stringify(State.folderCustomOrder.value));
      localStorage.setItem('player_local_custom_order', JSON.stringify(State.localCustomOrder.value));
      localStorage.removeItem(LEGACY_PLAYER_PLAYLIST_KEY);
      localStorage.removeItem(LEGACY_PLAYER_QUEUE_KEY);
    };

    const schedulePersistedState = () => {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        flushPersistedState();
      }, 200);
    };

    const cancelRestoreState = () => {
      if (restoreTimer) {
        clearTimeout(restoreTimer);
        restoreTimer = null;
      }
      if (restoreIdleId !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(restoreIdleId);
        restoreIdleId = null;
      }
    };
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

    // 🟢 监听 seek_completed 事件，恢复同步
    listen<SeekCompletedPayload>('seek_completed', (e) => {
      if (e.payload.request_id !== latestSeekRequestId) return;
      isSeeking = false;
      reanchorPlaybackClock(e.payload.time);
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

    // 🟢 持久化排序状态
    watch(State.artistSortMode, (v) => localStorage.setItem('player_artist_sort_mode', v));
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

    const restoreRecentHistory = async () => {
      const legacyHistory = readStoredHistory(LEGACY_PLAYER_HISTORY_KEY);
      const legacyHistorySongs = legacyHistory.map(item => item.song);

      try {
        const records = await invoke<RecentHistoryRecord[]>('get_recent_history', { limit: 1000 });
        if (records.length > 0) {
          const lookup = createSongLookup(legacyHistorySongs);
          State.recentSongs.value = records
            .map(record => {
              const song = lookup.get(record.songPath);
              return song ? { song, playedAt: record.playedAt } : null;
            })
            .filter((item): item is State.HistoryItem => !!item);

          if (State.recentSongs.value.length > 0) {
            localStorage.removeItem(LEGACY_PLAYER_HISTORY_KEY);
            return;
          }
        }
      } catch (e) {
        console.warn('get_recent_history failed:', e);
      }

      if (legacyHistory.length === 0) {
        State.recentSongs.value = [];
        return;
      }

      const lookup = createSongLookup(legacyHistorySongs);
      State.recentSongs.value = legacyHistory.map(item => ({
        song: lookup.get(item.song.path) ?? item.song,
        playedAt: item.playedAt,
      }));

      const importedEntries: RecentHistoryImportRecord[] = legacyHistory.map(item => ({
        songPath: item.song.path,
        playedAt: Math.floor(item.playedAt / 1000),
      }));

      try {
        await invoke('import_recent_history', { entries: importedEntries });
        localStorage.removeItem(LEGACY_PLAYER_HISTORY_KEY);
      } catch (e) {
        console.warn('import_recent_history failed:', e);
      }
    };

    const restorePathBackedState = async () => {
      const legacySongList = readStoredSongArray(LEGACY_PLAYER_PLAYLIST_KEY);
      const legacyQueue = readStoredSongArray(LEGACY_PLAYER_QUEUE_KEY);
      const legacyLastSong = readStoredSong(LEGACY_PLAYER_LAST_SONG_KEY);
      const fallbackSongs = [
        ...legacySongList,
        ...legacyQueue,
        ...(legacyLastSong ? [legacyLastSong] : []),
      ];

      if (State.librarySongs.value.length === 0) {
        await loadLibrarySongsFromCache();
      }

      const storedSongListPaths = readStoredStringArray(PLAYER_PLAYLIST_PATHS_KEY)
        ?? legacySongList.map(song => song.path);
      const storedQueuePaths = readStoredStringArray(PLAYER_QUEUE_PATHS_KEY)
        ?? legacyQueue.map(song => song.path);
      const storedLastSongPath = localStorage.getItem(PLAYER_LAST_SONG_PATH_KEY)
        ?? legacyLastSong?.path
        ?? null;

      State.songList.value = resolveSongsFromPaths(storedSongListPaths, fallbackSongs);
      State.playQueue.value = resolveSongsFromPaths(storedQueuePaths, fallbackSongs);

      if (storedLastSongPath) {
        State.currentSong.value = createSongLookup(fallbackSongs).get(storedLastSongPath) ?? legacyLastSong;
      }

      if (State.currentSong.value?.path) {
        invoke<string>('get_song_cover', { path: State.currentSong.value.path })
          .then(cover => State.currentCover.value = cover)
          .catch(() => { });
        State.isSongLoaded.value = false;
      }
    };

    onMounted(async () => {
      // 🟢 性能优化：同步恢复持久化数据，避免空状态渲染后再次闪烁
      const restoreState = async () => {
        const sVol = localStorage.getItem('player_volume'); if (sVol) { State.volume.value = parseInt(sVol); await invoke('set_volume', { volume: State.volume.value / 100.0 }); }
        const sFolders = localStorage.getItem('player_watched_folders'); if (sFolders) try { State.watchedFolders.value = JSON.parse(sFolders); } catch (e) { }
        const sFavs = localStorage.getItem('player_favorites'); if (sFavs) try { State.favoritePaths.value = JSON.parse(sFavs); } catch (e) { }
        const sPlaylists = localStorage.getItem('player_custom_playlists'); if (sPlaylists) try { State.playlists.value = JSON.parse(sPlaylists); } catch (e) { }

        // 🟢 读取排序状态
        const sArtistSort = localStorage.getItem('player_artist_sort_mode'); if (sArtistSort) State.artistSortMode.value = sArtistSort as any;
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

              // 迁移逻辑：将旧的 enableDynamicBg 转换为新的 dynamicBgType
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
      cancelRestoreState();
      if (persistTimer) clearTimeout(persistTimer);
      if (libraryScanBatchFlushTimer) {
        clearTimeout(libraryScanBatchFlushTimer);
        libraryScanBatchFlushTimer = null;
      }
      pendingLibraryScanSongs.clear();
      pendingLibraryScanDeletedPaths.clear();
      pendingLibraryScanFallbackSongs.clear();
    });
  }

  async function refreshAllFolders() {
    try {
      // 🟢 自动恢复逻辑：如果监控列表为空但有歌曲，尝试从现有歌曲中重建文件夹列表
      if (State.watchedFolders.value.length === 0 && State.songList.value.length > 0) {
        const potentialFolders = new Set<string>();
        State.songList.value.forEach(s => {
          // 简易逻辑：取父目录 (支持 Windows/Unix 分隔符)
          const parent = s.path.replace(/[/\\][^/\\]+$/, '');
          if (parent) potentialFolders.add(parent);
        });

        if (potentialFolders.size > 0) {
          State.watchedFolders.value = Array.from(potentialFolders);
          useToast().showToast(`已自动识别 ${potentialFolders.size} 个文件夹`, "success");
        }
      }

      if (State.watchedFolders.value.length === 0) {
        useToast().showToast("没有可刷新的文件夹", "info");
        return;
      }

      let allNewSongs: State.Song[] = [];
      for (const folder of State.watchedFolders.value) {
        const songs = await invoke<State.Song[]>('scan_music_folder', { folderPath: folder });
        allNewSongs.push(...songs);
      }

      const keptSongs = State.songList.value.filter(s => {
        return !State.watchedFolders.value.some(f => s.path.startsWith(f));
      });

      // 保持引用更新，Vue 的 computed 会自动重新计算排序
      State.songList.value = [...keptSongs, ...allNewSongs];
      useToast().showToast("所有歌曲已刷新", "success");
    } catch (e) {
      console.error("刷新失败:", e);
      useToast().showToast("刷新失败: " + e, "error");
    }
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
    // 🟢 导出新函数
    clearQueue, removeSongFromQueue, addSongToQueue, toggleQueue,
    addSongsToQueue, getSongsFromPlaylist,
    // Mini 模式
    isMiniMode: State.isMiniMode,
    showVolumePopover: State.showVolumePopover,
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
    }, // 🟢 comma added
    // 🟢 文件夹排序相关
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
    moveFilePhysical, // 🟢 Export
    fetchFolderTree: fetchSidebarTree,
    addSidebarFolder,
    addSidebarFolderLinked,
    removeSidebarFolder,
    removeSidebarFolderLinked,
    createFolder,
    expandFolderPath: (targetPath: string) => {
      expandTreeToPath(State.folderTree.value, targetPath);
    },

    // 🟢 导出排序状态
    folderSortMode: computed(() => State.folderSortMode.value),
    folderCustomOrder: computed(() => State.folderCustomOrder.value),
    localSortMode: computed(() => State.localSortMode.value),
    playlistSortMode: computed(() => State.playlistSortMode.value),
  };
}
