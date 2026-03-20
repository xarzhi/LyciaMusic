import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import * as State from '../composables/playerState';
import { usePlaybackStore } from './playback';
import { useUiStore } from './ui';

const demoSong = {
  path: '/music/demo.flac',
  name: 'demo.flac',
  title: 'Demo',
  artist: 'Artist',
  artist_names: ['Artist'],
  effective_artist_names: ['Artist'],
  album: 'Album',
  album_artist: 'Artist',
  album_key: 'Album::Artist',
  is_various_artists_album: false,
  collapse_artist_credits: false,
  duration: 120,
};

describe('playback and ui stores', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('keeps playback state in sync with playerState bridge refs', () => {
    const playbackStore = usePlaybackStore();

    State.isPlaying.value = true;
    State.volume.value = 72;
    State.currentSong.value = demoSong;
    State.playQueue.value = [demoSong];

    expect(playbackStore.isPlaying).toBe(true);
    expect(playbackStore.volume).toBe(72);
    expect(playbackStore.currentSong).toEqual(demoSong);
    expect(playbackStore.playQueue).toEqual([demoSong]);

    playbackStore.currentTime = 48;
    playbackStore.playMode = 2;

    expect(State.currentTime.value).toBe(48);
    expect(State.playMode.value).toBe(2);
  });

  it('keeps ui state in sync with playerState bridge refs', () => {
    const uiStore = useUiStore();

    State.showQueue.value = true;
    State.showAddToPlaylistModal.value = true;
    State.playlistAddTargetSongs.value = ['/music/demo.flac'];
    State.dominantColors.value = ['#111111', '#222222', '#333333', '#444444'];

    expect(uiStore.showQueue).toBe(true);
    expect(uiStore.showAddToPlaylistModal).toBe(true);
    expect(uiStore.playlistAddTargetSongs).toEqual(['/music/demo.flac']);
    expect(uiStore.dominantColors).toEqual(['#111111', '#222222', '#333333', '#444444']);

    uiStore.isMiniMode = true;
    uiStore.playlistCover = '/covers/demo.jpg';

    expect(State.isMiniMode.value).toBe(true);
    expect(State.playlistCover.value).toBe('/covers/demo.jpg');
  });
});
