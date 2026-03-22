import { storeToRefs } from 'pinia';

import { usePlayerService } from './playerService';
import { usePlaybackStore } from '../stores/playback';
import { useUiStore } from '../stores/ui';

export function usePlaybackController() {
  const playerService = usePlayerService();
  const playbackStore = usePlaybackStore();
  const uiStore = useUiStore();
  const playbackRefs = storeToRefs(playbackStore);
  const uiRefs = storeToRefs(uiStore);

  const closePlayerDetail = () => {
    uiRefs.showPlayerDetail.value = false;
  };

  return {
    currentSong: playbackRefs.currentSong,
    currentCover: playbackRefs.currentCover,
    isPlaying: playbackRefs.isPlaying,
    volume: playbackRefs.volume,
    currentTime: playbackRefs.currentTime,
    playMode: playbackRefs.playMode,
    playQueue: playbackRefs.playQueue,
    showPlaylist: uiRefs.showPlaylist,
    showPlayerDetail: uiRefs.showPlayerDetail,
    showQueue: uiRefs.showQueue,
    dominantColors: uiRefs.dominantColors,
    playSong: playerService.playSong,
    pauseSong: playerService.pauseSong,
    togglePlay: playerService.togglePlay,
    nextSong: playerService.nextSong,
    prevSong: playerService.prevSong,
    seekTo: playerService.seekTo,
    stepSeek: playerService.stepSeek,
    handleVolume: playerService.handleVolume,
    toggleMute: playerService.toggleMute,
    toggleMode: playerService.toggleMode,
    togglePlaylist: playerService.togglePlaylist,
    togglePlayerDetail: playerService.togglePlayerDetail,
    closePlayerDetail,
    toggleQueue: playerService.toggleQueue,
    toggleAlwaysOnTop: playerService.toggleAlwaysOnTop,
    clearQueue: playerService.clearQueue,
    addSongToQueue: playerService.addSongToQueue,
    addSongsToQueue: playerService.addSongsToQueue,
    removeSongFromQueue: playerService.removeSongFromQueue,
    playNext: playerService.playNext,
    formatDuration: playerService.formatDuration,
  };
}
