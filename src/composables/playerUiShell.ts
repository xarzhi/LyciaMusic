import { getCurrentWindow } from '@tauri-apps/api/window';
import * as State from './playerState';
import { playbackApi } from '../services/tauri/playbackApi';

interface CreatePlayerUiShellDeps {
  addFolder: () => void | Promise<void>;
  removeFromHistory: (songPaths: string[]) => Promise<void>;
}

export const createPlayerUiShell = ({
  addFolder,
  removeFromHistory,
}: CreatePlayerUiShellDeps) => {
  const handleVolume = async (event: Event) => {
    const volume = parseInt((event.target as HTMLInputElement).value, 10);
    State.volume.value = volume;
    await playbackApi.setVolume(volume / 100);
  };

  const toggleMute = async () => {
    if (State.volume.value > 0) {
      State.volume.value = 0;
      await playbackApi.setVolume(0);
      return;
    }

    State.volume.value = 100;
    await playbackApi.setVolume(1);
  };

  const togglePlaylist = () => {
    State.showPlaylist.value = !State.showPlaylist.value;
  };

  const toggleMiniPlaylist = () => {
    State.showMiniPlaylist.value = !State.showMiniPlaylist.value;
  };

  const closeMiniPlaylist = () => {
    State.showMiniPlaylist.value = false;
  };

  const handleScan = async () => {
    await addFolder();
  };

  const removeSongFromList = async (song: State.Song) => {
    if (State.currentViewMode.value === 'all') {
      State.songList.value = State.songList.value.filter(item => item.path !== song.path);
      return;
    }

    if (State.currentViewMode.value === 'favorites') {
      State.favoritePaths.value = State.favoritePaths.value.filter(path => path !== song.path);
      return;
    }

    if (State.currentViewMode.value === 'recent') {
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
    State.showPlayerDetail.value = !State.showPlayerDetail.value;
  };

  const toggleQueue = () => {
    State.showQueue.value = !State.showQueue.value;
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
