import { ref } from 'vue';
import { defineStore } from 'pinia';

import * as State from '../composables/playerState';
import type {
  Song,
  Playlist,
  LibraryFolder,
  FolderNode,
  LibraryScanProgress,
  LibraryScanSession,
} from '../composables/playerState';

const formatPlaylistDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
};

export const useLibraryStore = defineStore('library', () => {
  const songList = ref<Song[]>([]);
  const librarySongs = ref<Song[]>([]);
  const libraryFolders = ref<LibraryFolder[]>([]);
  const folderTree = ref<FolderNode[]>([]);
  const originalSongList = ref<Song[]>([]);
  const libraryScanProgress = ref<LibraryScanProgress | null>(null);
  const libraryScanSession = ref<LibraryScanSession | null>(null);
  const lastLibraryScanError = ref<string | null>(null);
  const watchedFolders = ref<string[]>([]);

  const setSongList = (songs: Song[]) => {
    songList.value = songs;
  };

  const setLibrarySongs = (songs: Song[]) => {
    librarySongs.value = songs;
  };

  const setLibraryFolders = (folders: LibraryFolder[]) => {
    libraryFolders.value = folders;
  };

  const setFolderTree = (tree: FolderNode[]) => {
    folderTree.value = tree;
  };

  const setOriginalSongList = (songs: Song[]) => {
    originalSongList.value = songs;
  };

  const setLibraryScanProgress = (progress: LibraryScanProgress | null) => {
    libraryScanProgress.value = progress;
  };

  const setLibraryScanSession = (session: LibraryScanSession | null) => {
    libraryScanSession.value = session;
  };

  const setLastLibraryScanError = (message: string | null) => {
    lastLibraryScanError.value = message;
  };

  const setWatchedFolders = (paths: string[]) => {
    watchedFolders.value = paths;
  };

  const createPlaylist = (name: string, initialSongs: string[] = []) => {
    if (!name.trim()) {
      return null;
    }

    const playlist: Playlist = {
      id: Date.now().toString() + Math.random().toString().slice(2),
      name,
      songPaths: [...initialSongs],
      createdAt: formatPlaylistDate(),
    };

    State.playlists.value.push(playlist);
    return playlist.id;
  };

  const deletePlaylist = (id: string) => {
    const beforeLength = State.playlists.value.length;
    State.playlists.value = State.playlists.value.filter(playlist => playlist.id !== id);
    return beforeLength !== State.playlists.value.length;
  };

  const getPlaylistById = (playlistId: string) =>
    State.playlists.value.find(item => item.id === playlistId);

  const addToPlaylist = (playlistId: string, path: string) => {
    const playlist = getPlaylistById(playlistId);
    if (playlist && !playlist.songPaths.includes(path)) {
      playlist.songPaths.push(path);
      return true;
    }

    return false;
  };

  const removeFromPlaylist = (playlistId: string, path: string) => {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) {
      return false;
    }

    const beforeLength = playlist.songPaths.length;
    playlist.songPaths = playlist.songPaths.filter(songPath => songPath !== path);
    return beforeLength !== playlist.songPaths.length;
  };

  const addSongsToPlaylist = (playlistId: string, songPaths: string[]) => {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) {
      return 0;
    }

    let addedCount = 0;
    for (const path of songPaths) {
      if (!playlist.songPaths.includes(path)) {
        playlist.songPaths.push(path);
        addedCount += 1;
      }
    }

    return addedCount;
  };

  const isFavoritePath = (path: string | null | undefined) => {
    if (!path) {
      return false;
    }

    return State.favoritePaths.value.includes(path);
  };

  const toggleFavoritePath = (path: string) => {
    if (isFavoritePath(path)) {
      State.favoritePaths.value = State.favoritePaths.value.filter(item => item !== path);
      return false;
    }

    State.favoritePaths.value.push(path);
    return true;
  };

  const removeFavoritePaths = (paths: string[]) => {
    if (paths.length === 0) {
      return;
    }

    const blocked = new Set(paths);
    State.favoritePaths.value = State.favoritePaths.value.filter(path => !blocked.has(path));
  };

  const clearFavorites = () => {
    State.favoritePaths.value = [];
  };

  const addRecentSong = (song: Song) => {
    State.recentSongs.value = State.recentSongs.value.filter(item => item.song.path !== song.path);
    State.recentSongs.value.unshift({ song, playedAt: Date.now() });

    if (State.recentSongs.value.length > 1000) {
      State.recentSongs.value = State.recentSongs.value.slice(0, 1000);
    }
  };

  const removeRecentSongs = (songPaths: string[]) => {
    if (songPaths.length === 0) {
      return;
    }

    const blocked = new Set(songPaths);
    State.recentSongs.value = State.recentSongs.value.filter(item => !blocked.has(item.song.path));
  };

  const clearRecentSongs = () => {
    State.recentSongs.value = [];
  };

  const reorderWatchedFolders = (from: number, to: number) => {
    const list = [...watchedFolders.value];
    const [removed] = list.splice(from, 1);
    if (!removed) {
      return;
    }

    list.splice(to, 0, removed);
    watchedFolders.value = list;
  };

  const reorderPlaylists = (from: number, to: number) => {
    const list = [...State.playlists.value];
    const [removed] = list.splice(from, 1);
    if (!removed) {
      return;
    }

    list.splice(to, 0, removed);
    State.playlists.value = list;
  };

  const getSongsFromPlaylist = (playlistId: string): Song[] => {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) {
      return [];
    }

    const songMap = new Map<string, Song>();
    songList.value.forEach(song => {
      songMap.set(song.path, song);
    });

    return playlist.songPaths
      .map(path => songMap.get(path))
      .filter((song): song is Song => !!song);
  };

  return {
    songList,
    librarySongs,
    libraryFolders,
    folderTree,
    originalSongList,
    libraryScanProgress,
    libraryScanSession,
    lastLibraryScanError,
    watchedFolders,
    favoritePaths: State.favoritePaths,
    playlists: State.playlists,
    recentSongs: State.recentSongs,
    setSongList,
    setLibrarySongs,
    setLibraryFolders,
    setFolderTree,
    setOriginalSongList,
    setLibraryScanProgress,
    setLibraryScanSession,
    setLastLibraryScanError,
    setWatchedFolders,
    createPlaylist,
    deletePlaylist,
    getPlaylistById,
    addToPlaylist,
    removeFromPlaylist,
    addSongsToPlaylist,
    isFavoritePath,
    toggleFavoritePath,
    removeFavoritePaths,
    clearFavorites,
    addRecentSong,
    removeRecentSongs,
    clearRecentSongs,
    reorderWatchedFolders,
    reorderPlaylists,
    getSongsFromPlaylist,
  };
});
