import { computed, type Ref } from 'vue';

import type { Song } from '../../types';
import { compareByAlphabetIndex } from '../../utils/alphabetIndex';
import type { AlbumSortMode, ArtistSortMode } from '../../services/storage/playerStorage';
import {
  getSongAlbumKey,
  getSongArtistNames,
  type AlbumListItem,
  type ArtistListItem,
} from './playerLibraryViewShared';

interface UseLibraryCatalogSelectorsOptions {
  canonicalSongs: Ref<Song[]>;
  searchQuery: Ref<string>;
  artistSortMode: Ref<ArtistSortMode>;
  albumSortMode: Ref<AlbumSortMode>;
  artistCustomOrder: Ref<string[]>;
  albumCustomOrder: Ref<string[]>;
}

export function useLibraryCatalogSelectors({
  canonicalSongs,
  searchQuery,
  artistSortMode,
  albumSortMode,
  artistCustomOrder,
  albumCustomOrder,
}: UseLibraryCatalogSelectorsOptions) {
  const artistList = computed<ArtistListItem[]>(() => {
    const map = new Map<string, { count: number; firstSongPath: string }>();

    canonicalSongs.value.forEach(song => {
      getSongArtistNames(song).forEach(artistName => {
        const key = artistName || 'Unknown';
        const existing = map.get(key);

        if (existing) {
          existing.count += 1;
          return;
        }

        map.set(key, { count: 1, firstSongPath: song.path });
      });
    });

    const list = Array.from(map, ([name, value]) => ({
      name,
      count: value.count,
      firstSongPath: value.firstSongPath,
    }));

    if (artistSortMode.value === 'name') {
      list.sort((a, b) => compareByAlphabetIndex(a.name, b.name));
    } else if (artistSortMode.value === 'custom') {
      const orderMap = new Map(artistCustomOrder.value.map((name, index) => [name, index]));
      list.sort((a, b) => {
        const left = orderMap.has(a.name) ? orderMap.get(a.name)! : Number.MAX_SAFE_INTEGER;
        const right = orderMap.has(b.name) ? orderMap.get(b.name)! : Number.MAX_SAFE_INTEGER;
        return left - right;
      });
    } else {
      list.sort((a, b) => b.count - a.count || compareByAlphabetIndex(a.name, b.name));
    }

    return list;
  });

  const albumList = computed<AlbumListItem[]>(() => {
    const map = new Map<string, AlbumListItem>();

    canonicalSongs.value.forEach(song => {
      const key = getSongAlbumKey(song);
      const existing = map.get(key);

      if (existing) {
        existing.count += 1;
        return;
      }

      map.set(key, {
        key,
        name: song.album || 'Unknown',
        count: 1,
        artist: song.album_artist || song.artist || 'Unknown',
        firstSongPath: song.path,
      });
    });

    const list = Array.from(map.values());

    if (albumSortMode.value === 'name') {
      list.sort((a, b) => compareByAlphabetIndex(a.name, b.name));
    } else if (albumSortMode.value === 'custom') {
      const orderMap = new Map(albumCustomOrder.value.map((key, index) => [key, index]));
      list.sort((a, b) => {
        const left = orderMap.has(a.key) ? orderMap.get(a.key)! : Number.MAX_SAFE_INTEGER;
        const right = orderMap.has(b.key) ? orderMap.get(b.key)! : Number.MAX_SAFE_INTEGER;
        return left - right;
      });
    } else if (albumSortMode.value === 'count') {
      list.sort((a, b) => b.count - a.count || compareByAlphabetIndex(a.artist, b.artist));
    } else {
      list.sort((a, b) => {
        const artistDiff = compareByAlphabetIndex(a.artist, b.artist);
        return artistDiff !== 0 ? artistDiff : compareByAlphabetIndex(a.name, b.name);
      });
    }

    return list;
  });

  const filteredArtistList = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) {
      return artistList.value;
    }

    return artistList.value.filter(artist => (artist.name || '').toLowerCase().includes(query));
  });

  const filteredAlbumList = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) {
      return albumList.value;
    }

    return albumList.value.filter(album =>
      (album.name || '').toLowerCase().includes(query) ||
      (album.artist || '').toLowerCase().includes(query),
    );
  });

  return {
    artistList,
    albumList,
    filteredArtistList,
    filteredAlbumList,
  };
}
