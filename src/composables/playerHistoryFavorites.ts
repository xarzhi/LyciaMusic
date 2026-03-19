import * as State from './playerState';
import { useLibraryCollections } from './useLibraryCollections';

interface CreatePlayerHistoryFavoritesDeps {
  legacyPlayerHistoryKey: string;
}

export const createPlayerHistoryFavorites = ({
  legacyPlayerHistoryKey: _legacyPlayerHistoryKey,
}: CreatePlayerHistoryFavoritesDeps) => {
  const libraryCollections = useLibraryCollections();

  const isFavorite = (song: State.Song | null) => {
    if (!song) return false;
    return libraryCollections.isFavorite(song.path);
  };

  const toggleFavorite = (song: State.Song) => {
    libraryCollections.toggleFavorite(song.path);
  };

  const addToHistory = async (song: State.Song) => {
    await libraryCollections.addToHistory(song);
  };

  const removeFromHistory = async (songPaths: string[]) => {
    await libraryCollections.removeFromHistory(songPaths);
  };

  const clearHistory = async () => {
    await libraryCollections.clearHistory();
  };

  const clearFavorites = () => {
    libraryCollections.clearFavorites();
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
