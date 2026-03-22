import { getCurrentWindow } from '@tauri-apps/api/window';
import { storeToRefs } from 'pinia';

import * as State from './playerPreferencesState';
import { playbackApi } from '../services/tauri/playbackApi';
import { useCollectionsStore } from '../stores/collections';
import { useLibraryStore } from '../stores/library';
import { useNavigationStore } from '../stores/navigation';
import { usePlaybackStore } from '../stores/playback';
import { useUiStore } from '../stores/ui';

interface CreatePlayerUiShellDeps {
  addFolder: () => void | Promise<void>;
  removeFromHistory: (songPaths: string[]) => Promise<void>;
}

export const createPlayerUiShell = ({
  addFolder,
  removeFromHistory,
}: CreatePlayerUiShellDeps) => {
  const collectionsStore = useCollectionsStore();
  const libraryStore = useLibraryStore();
  const navigationStore = useNavigationStore();
  const playbackStore = usePlaybackStore();
  const uiStore = useUiStore();
  const { currentViewMode } = storeToRefs(navigationStore);
  const { songList } = storeToRefs(libraryStore);
  const { favoritePaths } = storeToRefs(collectionsStore);

  const handleVolume = async (event: Event) => {
    const volume = parseInt((event.target as HTMLInputElement).value, 10);
    playbackStore.volume = volume;
    await playbackApi.setVolume(volume / 100);
  };

  const toggleMute = async () => {
    if (playbackStore.volume > 0) {
      playbackStore.volume = 0;
      await playbackApi.setVolume(0);
      return;
    }

    playbackStore.volume = 100;
    await playbackApi.setVolume(1);
  };

  const togglePlaylist = () => {
    uiStore.showPlaylist = !uiStore.showPlaylist;
  };

  const toggleMiniPlaylist = () => {
    uiStore.showMiniPlaylist = !uiStore.showMiniPlaylist;
  };

  const closeMiniPlaylist = () => {
    uiStore.showMiniPlaylist = false;
  };

  const handleScan = async () => {
    await addFolder();
  };

  const removeSongFromList = async (song: State.Song) => {
    if (currentViewMode.value === 'all') {
      songList.value = songList.value.filter(item => item.path !== song.path);
      return;
    }

    if (currentViewMode.value === 'favorites') {
      favoritePaths.value = favoritePaths.value.filter(path => path !== song.path);
      return;
    }

    if (currentViewMode.value === 'recent') {
      await removeFromHistory([song.path]);
    }
  };

  const toggleAlwaysOnTop = async (enable: boolean) => {
    try {
      await getCurrentWindow().setAlwaysOnTop(enable);
    } catch (error) {
      console.error('Failed to set always on top:', error);
    }
  };

  const togglePlayerDetail = () => {
    uiStore.showPlayerDetail = !uiStore.showPlayerDetail;
  };

  const toggleQueue = () => {
    uiStore.showQueue = !uiStore.showQueue;
  };

  return {
    handleVolume,
    toggleMute,
    togglePlaylist,
    toggleMiniPlaylist,
    closeMiniPlaylist,
    handleScan,
    removeSongFromList,
    toggleAlwaysOnTop,
    togglePlayerDetail,
    toggleQueue,
  };
};
