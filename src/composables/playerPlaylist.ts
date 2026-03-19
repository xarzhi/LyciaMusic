import * as State from './playerState';
import { useLibraryStore } from '../stores/library';
import { useNavigationStore } from '../stores/navigation';

interface CreatePlayerPlaylistDeps {
  switchViewToAll: () => void;
}

export const createPlayerPlaylist = ({
  switchViewToAll,
}: CreatePlayerPlaylistDeps) => {
  const libraryStore = useLibraryStore();
  const navigationStore = useNavigationStore();

  const createPlaylist = (name: string, initialSongs: string[] = []) => {
    libraryStore.createPlaylist(name, initialSongs);
  };

  const deletePlaylist = (id: string) => {
    const deleted = libraryStore.deletePlaylist(id);

    if (deleted && navigationStore.currentViewMode === 'playlist' && navigationStore.filterCondition === id) {
      switchViewToAll();
    }
  };

  const addToPlaylist = (playlistId: string, path: string) => {
    libraryStore.addToPlaylist(playlistId, path);
  };

  const removeFromPlaylist = (playlistId: string, path: string) => {
    libraryStore.removeFromPlaylist(playlistId, path);
  };

  const addSongsToPlaylist = (playlistId: string, songPaths: string[]): number => {
    return libraryStore.addSongsToPlaylist(playlistId, songPaths);
  };

  const viewPlaylist = (id: string) => {
    navigationStore.viewPlaylist(id);
  };

  const getSongsFromPlaylist = (playlistId: string): State.Song[] => {
    return libraryStore.getSongsFromPlaylist(playlistId);
  };

  const openAddToPlaylistDialog = (songPath: string) => {
    State.playlistAddTargetSongs.value = [songPath];
    State.showAddToPlaylistModal.value = true;
  };

  return {
    createPlaylist,
    deletePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    addSongsToPlaylist,
    viewPlaylist,
    getSongsFromPlaylist,
    openAddToPlaylistDialog,
  };
};
