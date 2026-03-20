import { invoke } from '@tauri-apps/api/core';
import * as State from './playerState';
import { playerStorage } from '../services/storage/playerStorage';
import { useCollectionsStore } from '../stores/collections';
import { useLibraryStore } from '../stores/library';

interface RecentHistoryRecord {
  songPath: string;
  playedAt: number;
}

interface RecentHistoryImportRecord {
  songPath: string;
  playedAt: number;
}

interface PlayerRestoreKeys {
  playerPlaylistPaths: string;
  playerQueuePaths: string;
  playerLastSongPath: string;
  legacyPlayerPlaylist: string;
  legacyPlayerQueue: string;
  legacyPlayerHistory: string;
  legacyPlayerLastSong: string;
}

interface CreatePlayerRestoreDeps {
  keys: PlayerRestoreKeys;
  createSongLookup: (fallbackSongs?: State.Song[]) => Map<string, State.Song>;
  resolveSongsFromPaths: (paths: string[], fallbackSongs?: State.Song[]) => State.Song[];
  readStoredHistory: (key: string) => State.HistoryItem[];
  readStoredSongArray: (key: string) => State.Song[];
  readStoredSong: (key: string) => State.Song | null;
  readStoredStringArray: (key: string) => string[] | null;
  loadLibrarySongsFromCache: () => Promise<void>;
}

export const createPlayerRestore = ({
  keys,
  createSongLookup,
  resolveSongsFromPaths,
  readStoredHistory,
  readStoredSongArray,
  readStoredSong,
  readStoredStringArray,
  loadLibrarySongsFromCache,
}: CreatePlayerRestoreDeps) => {
  const collectionsStore = useCollectionsStore();
  const libraryStore = useLibraryStore();

  const restoreRecentHistory = async () => {
    const legacyHistory = readStoredHistory(keys.legacyPlayerHistory);
    const legacyHistorySongs = legacyHistory.map(item => item.song);

    try {
      const records = await invoke<RecentHistoryRecord[]>('get_recent_history', { limit: 1000 });
      if (records.length > 0) {
        const lookup = createSongLookup(legacyHistorySongs);
        collectionsStore.setRecentSongs(records
          .map(record => {
            const song = lookup.get(record.songPath);
            return song ? { song, playedAt: record.playedAt } : null;
          })
          .filter((item): item is State.HistoryItem => !!item));

        if (collectionsStore.recentSongs.length > 0) {
          playerStorage.remove(keys.legacyPlayerHistory);
          return;
        }
      }
    } catch (error) {
      console.warn('get_recent_history failed:', error);
    }

    if (legacyHistory.length === 0) {
      collectionsStore.setRecentSongs([]);
      return;
    }

    const lookup = createSongLookup(legacyHistorySongs);
    collectionsStore.setRecentSongs(legacyHistory.map(item => ({
      song: lookup.get(item.song.path) ?? item.song,
      playedAt: item.playedAt,
    })));

    const importedEntries: RecentHistoryImportRecord[] = legacyHistory.map(item => ({
      songPath: item.song.path,
      playedAt: Math.floor(item.playedAt / 1000),
    }));

    try {
      await invoke('import_recent_history', { entries: importedEntries });
      playerStorage.remove(keys.legacyPlayerHistory);
    } catch (error) {
      console.warn('import_recent_history failed:', error);
    }
  };

  const restorePathBackedState = async () => {
    const legacySongList = readStoredSongArray(keys.legacyPlayerPlaylist);
    const legacyQueue = readStoredSongArray(keys.legacyPlayerQueue);
    const legacyLastSong = readStoredSong(keys.legacyPlayerLastSong);
    const fallbackSongs = [
      ...legacySongList,
      ...legacyQueue,
      ...(legacyLastSong ? [legacyLastSong] : []),
    ];

    if (libraryStore.librarySongs.length === 0) {
      await loadLibrarySongsFromCache();
    }

    const storedSongListPaths = readStoredStringArray(keys.playerPlaylistPaths)
      ?? legacySongList.map(song => song.path);
    const storedQueuePaths = readStoredStringArray(keys.playerQueuePaths)
      ?? legacyQueue.map(song => song.path);
    const storedLastSongPath = playerStorage.getString(keys.playerLastSongPath)
      ?? legacyLastSong?.path
      ?? null;

    libraryStore.setSongList(resolveSongsFromPaths(storedSongListPaths, fallbackSongs));
    State.playQueue.value = resolveSongsFromPaths(storedQueuePaths, fallbackSongs);

    if (storedLastSongPath) {
      State.currentSong.value = createSongLookup(fallbackSongs).get(storedLastSongPath) ?? legacyLastSong;
    }

    if (State.currentSong.value?.path) {
      invoke<string>('get_song_cover', { path: State.currentSong.value.path })
        .then(cover => {
          State.currentCover.value = cover;
        })
        .catch(() => {});
      State.isSongLoaded.value = false;
    }
  };

  return {
    restoreRecentHistory,
    restorePathBackedState,
  };
};
