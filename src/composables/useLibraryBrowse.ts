import { computed } from 'vue';
import * as State from './playerState';
import type { Song, Playlist } from './playerState';
import { compareByAlphabetIndex } from '../utils/alphabetIndex';

export interface ArtistListItem {
  name: string;
  count: number;
  firstSongPath: string;
}

export interface AlbumListItem {
  key: string;
  name: string;
  count: number;
  artist: string;
  firstSongPath: string;
}

const isDirectParent = (parentPath: string, childPath: string) => {
  if (!parentPath || !childPath) {
    return false;
  }

  const normalizedParent = parentPath.replace(/\\/g, '/').replace(/\/$/, '');
  const normalizedChild = childPath.replace(/\\/g, '/');
  const lastSlash = normalizedChild.lastIndexOf('/');

  return lastSlash !== -1 && normalizedChild.substring(0, lastSlash) === normalizedParent;
};

const getSongArtistNames = (song: Song) => {
  if (Array.isArray(song.effective_artist_names) && song.effective_artist_names.length > 0) {
    return song.effective_artist_names;
  }

  if (Array.isArray(song.artist_names) && song.artist_names.length > 0) {
    return song.artist_names;
  }

  return [song.artist || 'Unknown'];
};

const getSongAlbumKey = (song: Song) =>
  song.album_key || `${song.album || 'Unknown'}::${song.album_artist || song.artist || 'Unknown'}`;

export function useLibraryBrowse() {
  const artistList = computed<ArtistListItem[]>(() => {
    const map = new Map<string, { count: number; firstSongPath: string }>();

    State.librarySongs.value.forEach(song => {
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

    if (State.artistSortMode.value === 'name') {
      list.sort((a, b) => compareByAlphabetIndex(a.name, b.name));
    } else if (State.artistSortMode.value === 'custom') {
      const orderMap = new Map(State.artistCustomOrder.value.map((name, index) => [name, index]));
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

    State.librarySongs.value.forEach(song => {
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

    if (State.albumSortMode.value === 'name') {
      list.sort((a, b) => compareByAlphabetIndex(a.name, b.name));
    } else if (State.albumSortMode.value === 'custom') {
      const orderMap = new Map(State.albumCustomOrder.value.map((key, index) => [key, index]));
      list.sort((a, b) => {
        const left = orderMap.has(a.key) ? orderMap.get(a.key)! : Number.MAX_SAFE_INTEGER;
        const right = orderMap.has(b.key) ? orderMap.get(b.key)! : Number.MAX_SAFE_INTEGER;
        return left - right;
      });
    } else if (State.albumSortMode.value === 'count') {
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
    const query = State.searchQuery.value.trim().toLowerCase();
    if (!query) {
      return artistList.value;
    }

    return artistList.value.filter(artist => (artist.name || '').toLowerCase().includes(query));
  });

  const filteredAlbumList = computed(() => {
    const query = State.searchQuery.value.trim().toLowerCase();
    if (!query) {
      return albumList.value;
    }

    return albumList.value.filter(album =>
      (album.name || '').toLowerCase().includes(query) ||
      (album.artist || '').toLowerCase().includes(query),
    );
  });

  const folderList = computed(() =>
    State.watchedFolders.value.map(folderPath => {
      const songsInFolder = State.songList.value.filter(song => isDirectParent(folderPath, song.path));

      return {
        path: folderPath,
        name: folderPath.split(/[/\\]/).pop() || folderPath,
        count: songsInFolder.length,
        firstSongPath: songsInFolder.length > 0 ? songsInFolder[0].path : '',
      };
    }),
  );

  const favoriteSongList = computed(() =>
    State.librarySongs.value.filter(song => State.favoritePaths.value.includes(song.path)),
  );

  const favArtistList = computed(() => {
    const map = new Map<string, { count: number; firstSongPath: string }>();

    favoriteSongList.value.forEach(song => {
      getSongArtistNames(song).forEach(name => {
        const existing = map.get(name);
        if (existing) {
          existing.count += 1;
          return;
        }

        map.set(name, { count: 1, firstSongPath: song.path });
      });
    });

    return Array.from(map, ([name, value]) => ({
      name,
      count: value.count,
      firstSongPath: value.firstSongPath,
    })).sort((a, b) => b.count - a.count || compareByAlphabetIndex(a.name, b.name));
  });

  const favAlbumList = computed(() => {
    const map = new Map<string, { key: string; name: string; count: number; artist: string; firstSongPath: string }>();

    favoriteSongList.value.forEach(song => {
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

    return Array.from(map.values()).sort((a, b) => b.count - a.count || compareByAlphabetIndex(a.artist, b.artist));
  });

  const recentPlaylistList = computed(() => {
    const result: { id: string; name: string; count: number; playedAt: number; firstSongPath: string }[] = [];

    State.playlists.value.forEach((playlist: Playlist) => {
      let lastPlayedTime = 0;
      let hasPlayed = false;
      const playlistSongPaths = new Set(playlist.songPaths);

      for (const historyItem of State.recentSongs.value) {
        if (!playlistSongPaths.has(historyItem.song.path)) {
          continue;
        }

        if (historyItem.playedAt > lastPlayedTime) {
          lastPlayedTime = historyItem.playedAt;
          hasPlayed = true;
        }
      }

      if (hasPlayed) {
        result.push({
          id: playlist.id,
          name: playlist.name,
          count: playlist.songPaths.length,
          playedAt: lastPlayedTime,
          firstSongPath: playlist.songPaths.length > 0 ? playlist.songPaths[0] : '',
        });
      }
    });

    return result.sort((a, b) => b.playedAt - a.playedAt);
  });

  const updateArtistOrder = (newOrder: string[]) => {
    State.artistCustomOrder.value = newOrder;
    if (State.artistSortMode.value !== 'custom') {
      State.artistSortMode.value = 'custom';
    }
  };

  const updateAlbumOrder = (newOrder: string[]) => {
    State.albumCustomOrder.value = newOrder;
    if (State.albumSortMode.value !== 'custom') {
      State.albumSortMode.value = 'custom';
    }
  };

  const reorderWatchedFolders = (from: number, to: number) => {
    const list = [...State.watchedFolders.value];
    const [removed] = list.splice(from, 1);
    if (!removed) {
      return;
    }

    list.splice(to, 0, removed);
    State.watchedFolders.value = list;
  };

  return {
    searchQuery: State.searchQuery,
    localMusicTab: State.localMusicTab,
    currentViewMode: State.currentViewMode,
    currentFolderFilter: State.currentFolderFilter,
    activeRootPath: State.activeRootPath,
    folderTree: State.folderTree,
    libraryFolders: State.libraryFolders,
    librarySongs: State.librarySongs,
    artistSortMode: State.artistSortMode,
    albumSortMode: State.albumSortMode,
    artistList,
    albumList,
    filteredArtistList,
    filteredAlbumList,
    folderList,
    favoriteSongList,
    favArtistList,
    favAlbumList,
    recentPlaylistList,
    updateArtistOrder,
    updateAlbumOrder,
    reorderWatchedFolders,
  };
}
