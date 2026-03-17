import * as State from './playerState';

interface CreatePlayerPlaylistDeps {
  switchViewToAll: () => void;
}

const formatPlaylistDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
};

export const createPlayerPlaylist = ({
  switchViewToAll,
}: CreatePlayerPlaylistDeps) => {
  const createPlaylist = (name: string, initialSongs: string[] = []) => {
    if (!name.trim()) return;

    State.playlists.value.push({
      id: Date.now().toString() + Math.random().toString().slice(2),
      name,
      songPaths: [...initialSongs],
      createdAt: formatPlaylistDate(),
    });
  };

  const deletePlaylist = (id: string) => {
    State.playlists.value = State.playlists.value.filter(playlist => playlist.id !== id);

    if (State.currentViewMode.value === 'playlist' && State.filterCondition.value === id) {
      switchViewToAll();
    }
  };

  const addToPlaylist = (playlistId: string, path: string) => {
    const playlist = State.playlists.value.find(item => item.id === playlistId);
    if (playlist && !playlist.songPaths.includes(path)) {
      playlist.songPaths.push(path);
    }
  };

  const removeFromPlaylist = (playlistId: string, path: string) => {
    const playlist = State.playlists.value.find(item => item.id === playlistId);
    if (playlist) {
      playlist.songPaths = playlist.songPaths.filter(songPath => songPath !== path);
    }
  };

  const addSongsToPlaylist = (playlistId: string, songPaths: string[]): number => {
    const playlist = State.playlists.value.find(item => item.id === playlistId);
    if (!playlist) return 0;

    let addedCount = 0;
    for (const path of songPaths) {
      if (!playlist.songPaths.includes(path)) {
        playlist.songPaths.push(path);
        addedCount += 1;
      }
    }

    return addedCount;
  };

  const viewPlaylist = (id: string) => {
    State.currentViewMode.value = 'playlist';
    State.filterCondition.value = id;
    State.searchQuery.value = '';
  };

  const getSongsFromPlaylist = (playlistId: string): State.Song[] => {
    const playlist = State.playlists.value.find(item => item.id === playlistId);
    if (!playlist) return [];

    const songMap = new Map(State.songList.value.map(song => [song.path, song]));
    return playlist.songPaths
      .map(path => songMap.get(path))
      .filter((song): song is State.Song => !!song);
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
