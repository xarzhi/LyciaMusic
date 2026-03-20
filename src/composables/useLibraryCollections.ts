import { storeToRefs } from 'pinia';
import * as State from './playerState';
import type { Song } from './playerState';
import { playerStorage } from '../services/storage/playerStorage';
import { historyApi } from '../services/tauri/historyApi';
import { useCollectionsStore } from '../stores/collections';
import { useNavigationStore } from '../stores/navigation';

const LEGACY_PLAYER_HISTORY_KEY = 'player_history';

export function useLibraryCollections() {
  const collectionsStore = useCollectionsStore();
  const navigationStore = useNavigationStore();
  const collectionsRefs = storeToRefs(collectionsStore);

  const createPlaylist = (name: string, initialSongs: string[] = []) =>
    collectionsStore.createPlaylist(name, initialSongs);

  const deletePlaylist = (id: string) => {
    const deleted = collectionsStore.deletePlaylist(id);

    if (deleted && navigationStore.currentViewMode === 'playlist' && navigationStore.filterCondition === id) {
      navigationStore.switchViewToAll();
    }

    return deleted;
  };

  const addToPlaylist = (playlistId: string, path: string) =>
    collectionsStore.addToPlaylist(playlistId, path);

  const removeFromPlaylist = (playlistId: string, path: string) =>
    collectionsStore.removeFromPlaylist(playlistId, path);

  const addSongsToPlaylist = (playlistId: string, songPaths: string[]) =>
    collectionsStore.addSongsToPlaylist(playlistId, songPaths);

  const reorderPlaylists = (from: number, to: number) =>
    collectionsStore.reorderPlaylists(from, to);

  const getSongsFromPlaylist = (playlistId: string) =>
    collectionsStore.getSongsFromPlaylist(playlistId);

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
    collectionsStore.isFavoritePath(resolveSongPath(target));

  const toggleFavorite = (target: Song | string) => {
    const path = resolveSongPath(target);
    if (!path) {
      return false;
    }

    return collectionsStore.toggleFavoritePath(path);
  };

  const removeFavoritePaths = (paths: string[]) => {
    collectionsStore.removeFavoritePaths(paths);
  };

  const clearFavorites = () => {
    collectionsStore.clearFavorites();
  };

  const addToHistory = async (song: Song) => {
    collectionsStore.addRecentSong(song);
    playerStorage.remove(LEGACY_PLAYER_HISTORY_KEY);

    historyApi.addToHistory(song.path).catch(error => {
      console.warn('add_to_history failed:', error);
    });
  };

  const removeFromHistory = async (songPaths: string[]) => {
    if (songPaths.length === 0) {
      return;
    }

    collectionsStore.removeRecentSongs(songPaths);
    playerStorage.remove(LEGACY_PLAYER_HISTORY_KEY);

    try {
      await historyApi.removeFromRecentHistory(songPaths);
    } catch (error) {
      console.warn('remove_from_recent_history failed:', error);
    }
  };

  const clearHistory = async () => {
    collectionsStore.clearRecentSongs();
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
    ...collectionsRefs,
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
