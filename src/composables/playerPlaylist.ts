import * as State from './playerState';
import { useLibraryCollections } from './useLibraryCollections';

interface CreatePlayerPlaylistDeps {
  switchViewToAll: () => void;
}

export const createPlayerPlaylist = ({
  switchViewToAll: _switchViewToAll,
}: CreatePlayerPlaylistDeps) => {
  const libraryCollections = useLibraryCollections();

  const createPlaylist = (name: string, initialSongs: string[] = []) => {
    libraryCollections.createPlaylist(name, initialSongs);
  };

  const deletePlaylist = (id: string) => {
    libraryCollections.deletePlaylist(id);
  };

  const addToPlaylist = (playlistId: string, path: string) => {
    libraryCollections.addToPlaylist(playlistId, path);
  };

  const removeFromPlaylist = (playlistId: string, path: string) => {
    libraryCollections.removeFromPlaylist(playlistId, path);
  };

  const addSongsToPlaylist = (playlistId: string, songPaths: string[]): number => {
    return libraryCollections.addSongsToPlaylist(playlistId, songPaths);
  };

  const viewPlaylist = (id: string) => {
    libraryCollections.viewPlaylist(id);
  };

  const getSongsFromPlaylist = (playlistId: string): State.Song[] => {
    return libraryCollections.getSongsFromPlaylist(playlistId);
  };

  const openAddToPlaylistDialog = (songPath: string) => {
    libraryCollections.openAddToPlaylistDialog(songPath);
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
