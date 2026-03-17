import { invoke } from '@tauri-apps/api/core';
import * as State from './playerState';

interface QueuePlaySongOptions {
  updateShuffleHistory?: boolean;
  clearShuffleFuture?: boolean;
  preserveQueue?: boolean;
}

interface CreatePlayerQueueDeps {
  playSong: (song: State.Song, options?: QueuePlaySongOptions) => void | Promise<void>;
  stopPlaybackRuntime: () => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const createPlayerQueue = ({
  playSong,
  stopPlaybackRuntime,
  showToast,
}: CreatePlayerQueueDeps) => {
  const shuffleHistory: string[] = [];
  const shuffleFuture: string[] = [];

  const resetShuffleState = () => {
    shuffleHistory.length = 0;
    shuffleFuture.length = 0;
  };

  const handleBeforePlay = (song: State.Song, options: QueuePlaySongOptions = {}) => {
    const shouldUpdateShuffleHistory = options.updateShuffleHistory ?? true;
    const shouldClearShuffleFuture = options.clearShuffleFuture ?? true;
    const previousSong = State.currentSong.value;

    if (
      State.playMode.value === 2 &&
      shouldUpdateShuffleHistory &&
      previousSong &&
      previousSong.path !== song.path
    ) {
      shuffleHistory.push(previousSong.path);
      if (shouldClearShuffleFuture) {
        shuffleFuture.length = 0;
      }
    }
  };

  const getNavigationList = () =>
    State.playQueue.value.length ? State.playQueue.value : State.songList.value;

  const findSongByPath = (path: string | undefined, primaryList: State.Song[] = []) => {
    if (!path) return null;

    const candidateLists = [
      primaryList,
      State.playQueue.value,
      State.tempQueue.value,
      State.songList.value,
      State.librarySongs.value,
      State.currentSong.value ? [State.currentSong.value] : [],
    ];

    for (const list of candidateLists) {
      const song = list.find(item => item.path === path);
      if (song) return song;
    }

    return null;
  };

  const pickRandomSong = (list: State.Song[]) => {
    if (list.length === 0) return null;
    if (list.length === 1) return list[0];

    const currentPath = State.currentSong.value?.path;
    const candidates = currentPath ? list.filter(song => song.path !== currentPath) : list;
    if (candidates.length === 0) return list[0];
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const nextSong = () => {
    if (State.tempQueue.value.length > 0) {
      const next = State.tempQueue.value.shift();
      if (next) {
        playSong(next);
        return;
      }
    }

    const navigationList = getNavigationList();
    if (!navigationList.length) return;

    if (State.playMode.value === 2) {
      const futureSong = findSongByPath(shuffleFuture.pop(), navigationList);
      if (futureSong) {
        playSong(futureSong, { updateShuffleHistory: false, clearShuffleFuture: false });
        return;
      }

      const randomSong = pickRandomSong(navigationList);
      if (randomSong) {
        playSong(randomSong);
      }
      return;
    }

    let index = navigationList.findIndex(song => song.path === State.currentSong.value?.path);
    index = (index + 1) % navigationList.length;
    playSong(navigationList[index]);
  };

  const prevSong = () => {
    const navigationList = getNavigationList();
    if (!navigationList.length) return;

    if (State.playMode.value === 2) {
      const previousPath = shuffleHistory.pop();
      const previousSong = findSongByPath(previousPath, navigationList);
      if (previousSong) {
        if (State.currentSong.value) {
          shuffleFuture.push(State.currentSong.value.path);
        }
        playSong(previousSong, { updateShuffleHistory: false, clearShuffleFuture: false });
        return;
      }

      const randomSong = pickRandomSong(navigationList);
      if (randomSong) {
        playSong(randomSong);
      }
      return;
    }

    let index = navigationList.findIndex(song => song.path === State.currentSong.value?.path);
    index = (index - 1 + navigationList.length) % navigationList.length;
    playSong(navigationList[index]);
  };

  const clearQueue = async () => {
    State.playQueue.value = [];
    State.tempQueue.value = [];
    resetShuffleState();

    if (State.isPlaying.value) {
      await invoke('pause_audio');
      State.isPlaying.value = false;
    }

    stopPlaybackRuntime();
    State.currentSong.value = null;
  };

  const removeSongFromQueue = (song: State.Song) => {
    State.playQueue.value = State.playQueue.value.filter(item => item.path !== song.path);
    State.tempQueue.value = State.tempQueue.value.filter(item => item.path !== song.path);
  };

  const addSongToQueue = (song: State.Song) => {
    State.playQueue.value.push(song);
    showToast('已添加到队列', 'success');
  };

  const addSongsToQueue = (songs: State.Song[]) => {
    if (songs.length === 0) return;
    State.playQueue.value.push(...songs);
    showToast(`已添加 ${songs.length} 首歌曲到队列`, 'success');
  };

  const toggleMode = () => {
    State.playMode.value = (State.playMode.value + 1) % 3;
    resetShuffleState();
  };

  const playNext = (song: State.Song) => {
    State.tempQueue.value.unshift(song);
  };

  return {
    resetShuffleState,
    handleBeforePlay,
    nextSong,
    prevSong,
    clearQueue,
    removeSongFromQueue,
    addSongToQueue,
    addSongsToQueue,
    toggleMode,
    playNext,
  };
};
