import { computed } from 'vue';
import { storeToRefs } from 'pinia';

import type { Song } from '../types';
import { compareByAlphabetIndex, sortItemsByAlphabetIndex } from '../utils/alphabetIndex';
import { useCollectionsStore } from '../stores/collections';
import { useLibraryStore } from '../stores/library';
import { useNavigationStore } from '../stores/navigation';

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
  if (!parentPath || !childPath) return false;

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

const songHasArtist = (song: Song, artistName: string) =>
  getSongArtistNames(song).some(name => name === artistName);

const getSongAlbumKey = (song: Song) =>
  song.album_key || `${song.album || 'Unknown'}::${song.album_artist || song.artist || 'Unknown'}`;

const matchesAlbumKey = (song: Song, albumKey: string) => getSongAlbumKey(song) === albumKey;
const getSongArtistSearchText = (song: Song) =>
  [song.artist, song.album_artist, ...getSongArtistNames(song)].join(' ').toLowerCase();

const getSongTitleLabel = (song: Song) => song.title || song.name;
const getSongFileNameLabel = (song: Song) => song.name;

export function usePlayerLibraryView() {
  const collectionsStore = useCollectionsStore();
  const libraryStore = useLibraryStore();
  const navigationStore = useNavigationStore();
  const {
    activeRootPath,
    currentAlbumFilter,
    currentArtistFilter,
    currentFolderFilter,
    currentViewMode,
    favDetailFilter,
    favTab,
    filterCondition,
    localMusicTab,
    searchQuery,
  } = storeToRefs(navigationStore);
  const {
    folderTree,
    libraryFolders,
    librarySongs,
    songList,
    watchedFolders,
    artistSortMode,
    albumSortMode,
    artistCustomOrder,
    albumCustomOrder,
    folderSortMode,
    folderCustomOrder,
    localSortMode,
    localCustomOrder,
  } = storeToRefs(libraryStore);
  const { favoritePaths, playlists, recentSongs, playlistSortMode } = storeToRefs(collectionsStore);

  const isLocalMusic = computed(() =>
    currentViewMode.value === 'all' ||
    currentViewMode.value === 'artist' ||
    currentViewMode.value === 'album',
  );

  const isFolderMode = computed(() => currentViewMode.value === 'folder');

  const artistList = computed<ArtistListItem[]>(() => {
    const map = new Map<string, { count: number; firstSongPath: string }>();

    librarySongs.value.forEach(song => {
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

    librarySongs.value.forEach(song => {
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

  const folderList = computed(() =>
    watchedFolders.value.map(folderPath => {
      const songsInFolder = songList.value.filter(song => isDirectParent(folderPath, song.path));

      return {
        path: folderPath,
        name: folderPath.split(/[/\\]/).pop() || folderPath,
        count: songsInFolder.length,
        firstSongPath: songsInFolder.length > 0 ? songsInFolder[0].path : '',
      };
    }),
  );

  const favoriteSongList = computed(() =>
    librarySongs.value.filter(song => favoritePaths.value.includes(song.path)),
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

  const recentAlbumList = computed(() => {
    const map = new Map<string, { key: string; name: string; artist: string; playedAt: number; firstSongPath: string }>();

    recentSongs.value.forEach(item => {
      const key = getSongAlbumKey(item.song);
      if (!map.has(key) || item.playedAt > map.get(key)!.playedAt) {
        map.set(key, {
          key,
          name: item.song.album || 'Unknown',
          artist: item.song.album_artist || item.song.artist || 'Unknown',
          playedAt: item.playedAt,
          firstSongPath: item.song.path,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.playedAt - a.playedAt);
  });

  const recentPlaylistList = computed(() => {
    const result: { id: string; name: string; count: number; playedAt: number; firstSongPath: string }[] = [];

    playlists.value.forEach(playlist => {
      let lastPlayedTime = 0;
      let hasPlayed = false;
      const playlistSongPaths = new Set(playlist.songPaths);

      for (const historyItem of recentSongs.value) {
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

  const genreList = computed(() => {
    const map = new Map<string, number>();

    librarySongs.value.forEach(song => {
      const key = song.genre || 'Unknown';
      map.set(key, (map.get(key) || 0) + 1);
    });

    return Array.from(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  });

  const yearList = computed(() => {
    const map = new Map<string, number>();

    librarySongs.value.forEach(song => {
      const key = song.year && song.year.length >= 4 ? song.year.substring(0, 4) : 'Unknown';
      map.set(key, (map.get(key) || 0) + 1);
    });

    return Array.from(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.name.localeCompare(a.name));
  });

  const displaySongList = computed(() => {
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase();

      if (currentViewMode.value === 'favorites') {
        return favoriteSongList.value.filter(song =>
          song.name.toLowerCase().includes(query) ||
          getSongArtistSearchText(song).includes(query),
        );
      }

      if (currentViewMode.value === 'recent') {
        return recentSongs.value.map(item => item.song).filter(song => song.name.toLowerCase().includes(query));
      }

      if (currentViewMode.value === 'all') {
        return sortItemsByAlphabetIndex(
          librarySongs.value.filter(song =>
            song.name.toLowerCase().includes(query) ||
            getSongArtistSearchText(song).includes(query) ||
            song.album.toLowerCase().includes(query),
          ),
          getSongTitleLabel,
        );
      }

      if (currentViewMode.value === 'folder') {
        return sortItemsByAlphabetIndex(
          songList.value.filter(song =>
            song.name.toLowerCase().includes(query) ||
            getSongArtistSearchText(song).includes(query) ||
            song.album.toLowerCase().includes(query),
          ),
          getSongTitleLabel,
        );
      }

      return librarySongs.value.filter(song =>
        song.name.toLowerCase().includes(query) ||
        getSongArtistSearchText(song).includes(query) ||
        song.album.toLowerCase().includes(query),
      );
    }

    if (currentViewMode.value === 'all') {
      let base = [...librarySongs.value];
      if (localMusicTab.value === 'artist' && currentArtistFilter.value) {
        base = base.filter(song => songHasArtist(song, currentArtistFilter.value));
      } else if (localMusicTab.value === 'album' && currentAlbumFilter.value) {
        base = base.filter(song => matchesAlbumKey(song, currentAlbumFilter.value));
      }

      if (localSortMode.value === 'title') {
        base = sortItemsByAlphabetIndex(base, getSongTitleLabel);
      } else if (localSortMode.value === 'name') {
        base = sortItemsByAlphabetIndex(base, getSongFileNameLabel);
      } else if (localSortMode.value === 'artist') {
        base.sort((left, right) => (left.artist || '').localeCompare(right.artist || '', 'zh-CN'));
      } else if (localSortMode.value === 'added_at') {
        base.sort((left, right) => (right.added_at || 0) - (left.added_at || 0));
      } else if (localSortMode.value === 'custom') {
        const orderMap = new Map(localCustomOrder.value.map((path, index) => [path, index]));
        base.sort((left, right) => {
          const leftIndex = orderMap.has(left.path) ? orderMap.get(left.path)! : Number.MAX_SAFE_INTEGER;
          const rightIndex = orderMap.has(right.path) ? orderMap.get(right.path)! : Number.MAX_SAFE_INTEGER;
          return leftIndex - rightIndex;
        });
      } else {
        base = sortItemsByAlphabetIndex(base, getSongTitleLabel);
      }

      return base;
    }

    if (currentViewMode.value === 'folder') {
      if (!currentFolderFilter.value) {
        return [];
      }

      let songs = songList.value.filter(song => isDirectParent(currentFolderFilter.value, song.path));

      if (folderSortMode.value === 'title') {
        songs = sortItemsByAlphabetIndex(songs, getSongTitleLabel);
      } else if (folderSortMode.value === 'name') {
        songs = sortItemsByAlphabetIndex(songs, getSongFileNameLabel);
      } else if (folderSortMode.value === 'artist') {
        songs.sort((left, right) => (left.artist || '').localeCompare(right.artist || '', 'zh-CN'));
      } else if (folderSortMode.value === 'added_at') {
        songs.sort((left, right) => (right.added_at || 0) - (left.added_at || 0));
      } else if (folderSortMode.value === 'custom') {
        const customOrder = folderCustomOrder.value[currentFolderFilter.value] || [];
        if (customOrder.length > 0) {
          const orderMap = new Map(customOrder.map((path, index) => [path, index]));
          songs.sort((left, right) => {
            const leftIndex = orderMap.has(left.path) ? orderMap.get(left.path)! : Number.MAX_SAFE_INTEGER;
            const rightIndex = orderMap.has(right.path) ? orderMap.get(right.path)! : Number.MAX_SAFE_INTEGER;
            return leftIndex - rightIndex;
          });
        }
      }

      return songs;
    }

    if (currentViewMode.value === 'recent') {
      const songs = [...recentSongs.value.map(item => item.song)];

      if (localSortMode.value === 'title') {
        songs.sort((left, right) => (left.title || left.name).localeCompare(right.title || right.name, 'zh-CN'));
      } else if (localSortMode.value === 'name') {
        songs.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
      } else if (localSortMode.value === 'artist') {
        songs.sort((left, right) => (left.artist || '').localeCompare(right.artist || '', 'zh-CN'));
      } else if (localSortMode.value === 'added_at') {
        songs.sort((left, right) => (right.added_at || 0) - (left.added_at || 0));
      }

      return songs;
    }

    if (currentViewMode.value === 'favorites') {
      let songs: Song[] = [];
      if (favTab.value === 'songs') {
        songs = [...favoriteSongList.value];
      } else if (favTab.value === 'artists') {
        songs = favDetailFilter.value?.type === 'artist'
          ? favoriteSongList.value.filter(song => songHasArtist(song, favDetailFilter.value!.name))
          : [];
      } else if (favTab.value === 'albums') {
        songs = favDetailFilter.value?.type === 'album'
          ? favoriteSongList.value.filter(song => matchesAlbumKey(song, favDetailFilter.value!.name))
          : [];
      } else {
        songs = [...favoriteSongList.value];
      }

      if (localSortMode.value === 'title') {
        songs.sort((left, right) => (left.title || left.name).localeCompare(right.title || right.name, 'zh-CN'));
      } else if (localSortMode.value === 'name') {
        songs.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
      } else if (localSortMode.value === 'artist') {
        songs.sort((left, right) => (left.artist || '').localeCompare(right.artist || '', 'zh-CN'));
      } else if (localSortMode.value === 'added_at') {
        songs.sort((left, right) => (right.added_at || 0) - (left.added_at || 0));
      }

      return songs;
    }

    if (currentViewMode.value === 'playlist') {
      const playlist = playlists.value.find(item => item.id === filterCondition.value);
      if (!playlist) {
        return [];
      }

      const songMap = new Map<string, Song>();
      librarySongs.value.forEach(song => songMap.set(song.path, song));
      songList.value.forEach(song => {
        if (!songMap.has(song.path)) {
          songMap.set(song.path, song);
        }
      });

      const songs = playlist.songPaths
        .map(path => songMap.get(path))
        .filter((song): song is Song => !!song);

      if (playlistSortMode.value === 'title') {
        songs.sort((left, right) => (left.title || left.name).localeCompare(right.title || right.name, 'zh-CN'));
      } else if (playlistSortMode.value === 'name') {
        songs.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
      } else if (playlistSortMode.value === 'artist') {
        songs.sort((left, right) => (left.artist || '').localeCompare(right.artist || '', 'zh-CN'));
      } else if (playlistSortMode.value === 'added_at') {
        songs.sort((left, right) => (right.added_at || 0) - (left.added_at || 0));
      }

      return songs;
    }

    return librarySongs.value.filter(song =>
      songHasArtist(song, filterCondition.value) ||
      matchesAlbumKey(song, filterCondition.value) ||
      (song.genre || 'Unknown') === filterCondition.value ||
      ((song.year?.substring(0, 4)) || 'Unknown') === filterCondition.value,
    );
  });

  return {
    activeRootPath,
    albumList,
    artistList,
    favAlbumList,
    favArtistList,
    favoriteSongList,
    filteredAlbumList,
    filteredArtistList,
    folderList,
    folderTree,
    genreList,
    isFolderMode,
    isLocalMusic,
    libraryFolders,
    librarySongs,
    recentAlbumList,
    recentPlaylistList,
    searchQuery,
    displaySongList,
    yearList,
  };
}
