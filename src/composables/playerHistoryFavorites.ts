import { invoke } from '@tauri-apps/api/core';
import * as State from './playerState';
import { playerStorage } from '../services/storage/playerStorage';
import { useLibraryStore } from '../stores/library';

interface CreatePlayerHistoryFavoritesDeps {
  legacyPlayerHistoryKey: string;
}

export const createPlayerHistoryFavorites = ({
  legacyPlayerHistoryKey,
}: CreatePlayerHistoryFavoritesDeps) => {
  const libraryStore = useLibraryStore();

  const isFavorite = (song: State.Song | null) => {
    if (!song) return false;
    return libraryStore.isFavoritePath(song.path);
  };

  const toggleFavorite = (song: State.Song) => {
    libraryStore.toggleFavoritePath(song.path);
  };

  const addToHistory = async (song: State.Song) => {
    libraryStore.addRecentSong(song);
    playerStorage.remove(legacyPlayerHistoryKey);

    invoke('add_to_history', { songPath: song.path }).catch(error => {
      console.warn('add_to_history failed:', error);
    });
  };

  const removeFromHistory = async (songPaths: string[]) => {
    if (songPaths.length === 0) return;

    libraryStore.removeRecentSongs(songPaths);
    playerStorage.remove(legacyPlayerHistoryKey);

    try {
      await invoke('remove_from_recent_history', { songPaths });
    } catch (error) {
      console.warn('remove_from_recent_history failed:', error);
    }
  };

  const clearHistory = async () => {
    libraryStore.clearRecentSongs();
    playerStorage.remove(legacyPlayerHistoryKey);

    try {
      await invoke('clear_recent_history');
    } catch (error) {
      console.warn('clear_recent_history failed:', error);
    }
  };

  const clearFavorites = () => {
    libraryStore.clearFavorites();
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
