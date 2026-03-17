import * as State from './playerState';

const LIBRARY_SCAN_BATCH_FLUSH_MS = 120;

interface CreatePlayerLibraryBatchDeps {
  createSongLookup: (fallbackSongs?: State.Song[]) => Map<string, State.Song>;
}

export const createPlayerLibraryBatch = ({
  createSongLookup,
}: CreatePlayerLibraryBatchDeps) => {
  let libraryScanBatchFlushTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingLibraryScanSongs = new Map<string, State.Song>();
  const pendingLibraryScanDeletedPaths = new Set<string>();
  const pendingLibraryScanFallbackSongs = new Map<string, State.Song>();

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

  const applyLibraryScanBatch = (payload: {
    songs: State.Song[];
    deleted_paths: string[];
  }) => {
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

  const dispose = () => {
    if (libraryScanBatchFlushTimer) {
      clearTimeout(libraryScanBatchFlushTimer);
      libraryScanBatchFlushTimer = null;
    }
    pendingLibraryScanSongs.clear();
    pendingLibraryScanDeletedPaths.clear();
    pendingLibraryScanFallbackSongs.clear();
  };

  return {
    applyLibraryScanBatch,
    flushBufferedLibraryScanBatch,
    refreshStateSongReferences,
    dispose,
  };
};
