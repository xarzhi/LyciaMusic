import { storeToRefs } from 'pinia';
import * as State from './playerState';
import type { Song } from './playerState';
import { playerStorage } from '../services/storage/playerStorage';
import { historyApi } from '../services/tauri/historyApi';
import { useLibraryStore } from '../stores/library';
import { useNavigationStore } from '../stores/navigation';

const LEGACY_PLAYER_HISTORY_KEY = 'player_history';

export function useLibraryCollections() {
  const libraryStore = useLibraryStore();
  const navigationStore = useNavigationStore();
  const libraryRefs = storeToRefs(libraryStore);

  const createPlaylist = (name: string, initialSongs: string[] = []) =>
    libraryStore.createPlaylist(name, initialSongs);

  const deletePlaylist = (id: string) => {
    const deleted = libraryStore.deletePlaylist(id);

    if (deleted && navigationStore.currentViewMode === 'playlist' && navigationStore.filterCondition === id) {
      navigationStore.switchViewToAll();
    }

    return deleted;
  };

  const addToPlaylist = (playlistId: string, path: string) =>
    libraryStore.addToPlaylist(playlistId, path);

  const removeFromPlaylist = (playlistId: string, path: string) =>
    libraryStore.removeFromPlaylist(playlistId, path);

  const addSongsToPlaylist = (playlistId: string, songPaths: string[]) =>
    libraryStore.addSongsToPlaylist(playlistId, songPaths);

  const reorderPlaylists = (from: number, to: number) =>
    libraryStore.reorderPlaylists(from, to);

  const getSongsFromPlaylist = (playlistId: string) =>
    libraryStore.getSongsFromPlaylist(playlistId);

  const viewPlaylist = (playlistId: string) => {
    navigationStore.viewPlaylist(playlistId);
  };

  const resolveSongPath = (target: Song | string | null | undefined) => {
    if (!target) {
      return null;
    }

    return typeof target === 'string' ? target : target.path;
  };

  const isFavorite = (target: Song | string | null | undefined) =>
    libraryStore.isFavoritePath(resolveSongPath(target));

  const toggleFavorite = (target: Song | string) => {
    const path = resolveSongPath(target);
    if (!path) {
      return false;
    }

    return libraryStore.toggleFavoritePath(path);
  };

  const removeFavoritePaths = (paths: string[]) => {
    libraryStore.removeFavoritePaths(paths);
  };

  const clearFavorites = () => {
    libraryStore.clearFavorites();
  };

  const addToHistory = async (song: Song) => {
    libraryStore.addRecentSong(song);
    playerStorage.remove(LEGACY_PLAYER_HISTORY_KEY);

    historyApi.addToHistory(song.path).catch(error => {
      console.warn('add_to_history failed:', error);
    });
  };

  const removeFromHistory = async (songPaths: string[]) => {
    if (songPaths.length === 0) {
      return;
    }

    libraryStore.removeRecentSongs(songPaths);
    playerStorage.remove(LEGACY_PLAYER_HISTORY_KEY);

    try {
      await historyApi.removeFromRecentHistory(songPaths);
    } catch (error) {
      console.warn('remove_from_recent_history failed:', error);
    }
  };

  const clearHistory = async () => {
    libraryStore.clearRecentSongs();
    playerStorage.remove(LEGACY_PLAYER_HISTORY_KEY);

    try {
      await historyApi.clearRecentHistory();
    } catch (error) {
      console.warn('clear_recent_history failed:', error);
    }
  };

  const openAddToPlaylistDialog = (songPath: string) => {
    State.playlistAddTargetSongs.value = [songPath];
    State.showAddToPlaylistModal.value = true;
  };

  return {
    ...libraryRefs,
    showAddToPlaylistModal: State.showAddToPlaylistModal,
    playlistAddTargetSongs: State.playlistAddTargetSongs,
    createPlaylist,
    deletePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    addSongsToPlaylist,
    reorderPlaylists,
    getSongsFromPlaylist,
    viewPlaylist,
    isFavorite,
    toggleFavorite,
    removeFavoritePaths,
    clearFavorites,
    addToHistory,
    removeFromHistory,
    clearHistory,
    openAddToPlaylistDialog,
  };
}
