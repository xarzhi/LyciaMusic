import { computed, type Ref } from 'vue';

import type { FolderSortMode } from '../../services/storage/playerStorage';
import type { Song } from '../../types';
import { sortItemsByAlphabetIndex } from '../../utils/alphabetIndex';
import {
  getSongFileNameLabel,
  getSongTitleLabel,
  isDirectParent,
} from './playerLibraryViewShared';

interface FolderListItem {
  path: string;
  name: string;
  count: number;
  firstSongPath: string;
}

interface UseLibraryFolderSelectorsOptions {
  watchedFolders: Ref<string[]>;
  sourceSongs: Ref<Song[]>;
  currentFolderFilter: Ref<string>;
  folderSortMode: Ref<FolderSortMode>;
  folderCustomOrder: Ref<Record<string, string[]>>;
}

export function useLibraryFolderSelectors({
  watchedFolders,
  sourceSongs,
  currentFolderFilter,
  folderSortMode,
  folderCustomOrder,
}: UseLibraryFolderSelectorsOptions) {
  const folderList = computed<FolderListItem[]>(() =>
    watchedFolders.value.map(folderPath => {
      const songsInFolder = sourceSongs.value.filter(song => isDirectParent(folderPath, song.path));

      return {
        path: folderPath,
        name: folderPath.split(/[/\\]/).pop() || folderPath,
        count: songsInFolder.length,
        firstSongPath: songsInFolder.length > 0 ? songsInFolder[0].path : '',
      };
    }),
  );

  const currentFolderSongs = computed(() => {
    if (!currentFolderFilter.value) {
      return [];
    }

    let songs = sourceSongs.value.filter(song => isDirectParent(currentFolderFilter.value, song.path));

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
  });

  return {
    folderList,
    currentFolderSongs,
  };
}
