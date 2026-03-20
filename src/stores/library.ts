import { ref } from 'vue';
import { defineStore } from 'pinia';

import type { Song, LibraryFolder, FolderNode, LibraryScanProgress, LibraryScanSession } from '../composables/playerState';

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

  const reorderWatchedFolders = (from: number, to: number) => {
    const list = [...watchedFolders.value];
    const [removed] = list.splice(from, 1);
    if (!removed) {
      return;
    }

    list.splice(to, 0, removed);
    watchedFolders.value = list;
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
    setSongList,
    setLibrarySongs,
    setLibraryFolders,
    setFolderTree,
    setOriginalSongList,
    setLibraryScanProgress,
    setLibraryScanSession,
    setLastLibraryScanError,
    setWatchedFolders,
    reorderWatchedFolders,
  };
});
