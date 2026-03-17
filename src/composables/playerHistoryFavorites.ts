import { invoke } from '@tauri-apps/api/core';
import * as State from './playerState';

interface CreatePlayerHistoryFavoritesDeps {
  legacyPlayerHistoryKey: string;
}

export const createPlayerHistoryFavorites = ({
  legacyPlayerHistoryKey,
}: CreatePlayerHistoryFavoritesDeps) => {
  const isFavorite = (song: State.Song | null) => {
    if (!song) return false;
    return State.favoritePaths.value.includes(song.path);
  };

  const toggleFavorite = (song: State.Song) => {
    if (isFavorite(song)) {
      State.favoritePaths.value = State.favoritePaths.value.filter(path => path !== song.path);
      return;
    }

    State.favoritePaths.value.push(song.path);
  };

  const addToHistory = async (song: State.Song) => {
    State.recentSongs.value = State.recentSongs.value.filter(item => item.song.path !== song.path);
    State.recentSongs.value.unshift({ song, playedAt: Date.now() });

    if (State.recentSongs.value.length > 1000) {
      State.recentSongs.value = State.recentSongs.value.slice(0, 1000);
    }

    localStorage.removeItem(legacyPlayerHistoryKey);

    invoke('add_to_history', { songPath: song.path }).catch(error => {
      console.warn('add_to_history failed:', error);
    });
  };

  const removeFromHistory = async (songPaths: string[]) => {
    if (songPaths.length === 0) return;

    const pathSet = new Set(songPaths);
    State.recentSongs.value = State.recentSongs.value.filter(item => !pathSet.has(item.song.path));
    localStorage.removeItem(legacyPlayerHistoryKey);

    try {
      await invoke('remove_from_recent_history', { songPaths });
    } catch (error) {
      console.warn('remove_from_recent_history failed:', error);
    }
  };

  const clearHistory = async () => {
    State.recentSongs.value = [];
    localStorage.removeItem(legacyPlayerHistoryKey);

    try {
      await invoke('clear_recent_history');
    } catch (error) {
      console.warn('clear_recent_history failed:', error);
    }
  };

  const clearFavorites = () => {
    State.favoritePaths.value = [];
  };

  return {
    isFavorite,
    toggleFavorite,
    addToHistory,
    removeFromHistory,
    clearHistory,
    clearFavorites,
  };
};
