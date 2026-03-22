import type { HistoryItem, Song } from '../types';
import { playerStorage } from '../services/storage/playerStorage';
import { historyApi } from '../services/tauri/historyApi';
import { playbackApi } from '../services/tauri/playbackApi';
import { useCollectionsStore } from '../stores/collections';
import { useLibraryStore } from '../stores/library';
import { usePlaybackStore } from '../stores/playback';

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
  createSongLookup: (fallbackSongs?: Song[]) => Map<string, Song>;
  resolveSongsFromPaths: (paths: string[], fallbackSongs?: Song[]) => Song[];
  readStoredHistory: (key: string) => HistoryItem[];
  readStoredSongArray: (key: string) => Song[];
  readStoredSong: (key: string) => Song | null;
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
  const playbackStore = usePlaybackStore();

  const restoreRecentHistory = async () => {
    const legacyHistory = readStoredHistory(keys.legacyPlayerHistory);
    const legacyHistorySongs = legacyHistory.map(item => item.song);

    try {
      const records = await historyApi.getRecentHistory(1000);
      if (records.length > 0) {
        const lookup = createSongLookup(legacyHistorySongs);
        collectionsStore.setRecentSongs(records
          .map(record => {
            const song = lookup.get(record.songPath);
            return song ? { song, playedAt: record.playedAt } : null;
          })
          .filter((item): item is HistoryItem => !!item));

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

    const importedEntries = legacyHistory.map(item => ({
      songPath: item.song.path,
      playedAt: Math.floor(item.playedAt / 1000),
    }));

    try {
      await historyApi.importRecentHistory(importedEntries);
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
    playbackStore.playQueue = resolveSongsFromPaths(storedQueuePaths, fallbackSongs);

    if (storedLastSongPath) {
      playbackStore.currentSong = createSongLookup(fallbackSongs).get(storedLastSongPath) ?? legacyLastSong;
    }

    if (playbackStore.currentSong?.path) {
      playbackApi.getSongCover(playbackStore.currentSong.path)
        .then(cover => {
          playbackStore.currentCover = cover;
        })
        .catch(() => {});
      playbackStore.isSongLoaded = false;
    }
  };

  return {
    restoreRecentHistory,
    restorePathBackedState,
  };
};
