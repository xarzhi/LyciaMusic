import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import type { Song } from '../types';
import { useCollectionsStore } from '../stores/collections';
import { useLibraryStore } from '../stores/library';
import { useNavigationStore } from '../stores/navigation';
import * as PlayerState from './playerState';
import { usePlayerLibraryView } from './usePlayerLibraryView';

const makeSong = (overrides: Partial<Song> = {}): Song => ({
  path: '/music/demo.flac',
  name: 'demo.flac',
  title: 'Demo',
  artist: 'Artist',
  artist_names: ['Artist'],
  effective_artist_names: ['Artist'],
  album: 'Album',
  album_artist: 'Artist',
  album_key: 'album::artist',
  is_various_artists_album: false,
  collapse_artist_credits: false,
  duration: 180,
  added_at: 1,
  ...overrides,
});

describe('player library view', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    PlayerState.artistSortMode.value = 'count';
    PlayerState.albumSortMode.value = 'artist';
    PlayerState.artistCustomOrder.value = [];
    PlayerState.albumCustomOrder.value = [];
    PlayerState.folderSortMode.value = 'title';
    PlayerState.folderCustomOrder.value = {};
    PlayerState.localSortMode.value = 'default';
    PlayerState.localCustomOrder.value = [];
    PlayerState.playlistSortMode.value = 'custom';
  });

  it('filters folder songs to direct children and keeps custom folder order', () => {
    const libraryStore = useLibraryStore();
    const navigationStore = useNavigationStore();
    const firstSong = makeSong({ path: '/music/root/alpha.flac', title: 'Alpha', artist: 'A' });
    const secondSong = makeSong({ path: '/music/root/beta.flac', title: 'Beta', artist: 'B' });
    const nestedSong = makeSong({ path: '/music/root/live/gamma.flac', title: 'Gamma', artist: 'C' });

    libraryStore.songList = [firstSong, secondSong, nestedSong];
    navigationStore.currentViewMode = 'folder';
    navigationStore.currentFolderFilter = '/music/root';
    PlayerState.folderSortMode.value = 'custom';
    PlayerState.folderCustomOrder.value = {
      '/music/root': [secondSong.path, firstSong.path],
    };

    const { displaySongList } = usePlayerLibraryView();

    expect(displaySongList.value.map(song => song.path)).toEqual([
      secondSong.path,
      firstSong.path,
    ]);
  });

  it('applies favorites detail filters and local sorting rules', () => {
    const libraryStore = useLibraryStore();
    const collectionsStore = useCollectionsStore();
    const navigationStore = useNavigationStore();
    const zebra = makeSong({
      path: '/music/zebra.flac',
      title: 'Zebra',
      name: 'zebra.flac',
      artist: 'Target Artist',
      artist_names: ['Target Artist'],
      effective_artist_names: ['Target Artist'],
      added_at: 2,
    });
    const alpha = makeSong({
      path: '/music/alpha.flac',
      title: 'Alpha',
      name: 'alpha.flac',
      artist: 'Target Artist',
      artist_names: ['Target Artist'],
      effective_artist_names: ['Target Artist'],
      added_at: 3,
    });
    const outsider = makeSong({
      path: '/music/other.flac',
      title: 'Other',
      artist: 'Other Artist',
      artist_names: ['Other Artist'],
      effective_artist_names: ['Other Artist'],
      added_at: 1,
    });

    libraryStore.librarySongs = [zebra, alpha, outsider];
    collectionsStore.favoritePaths = [zebra.path, alpha.path, outsider.path];
    navigationStore.currentViewMode = 'favorites';
    navigationStore.favTab = 'artists';
    navigationStore.favDetailFilter = { type: 'artist', name: 'Target Artist' };
    PlayerState.localSortMode.value = 'title';

    const { displaySongList, favArtistList } = usePlayerLibraryView();

    expect(displaySongList.value.map(song => song.title)).toEqual(['Alpha', 'Zebra']);
    expect(favArtistList.value.map(item => item.name)).toContain('Target Artist');
    expect(favArtistList.value.find(item => item.name === 'Target Artist')?.count).toBe(2);
  });
});
