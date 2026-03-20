import { ref, reactive } from 'vue';
import type { Ref } from 'vue';

import { Song, Playlist, HistoryItem } from '../types';
import { useLibraryStore } from '../stores/library';
import { usePlaybackStore } from '../stores/playback';
import { useUiStore } from '../stores/ui';

export type { Song, Playlist, HistoryItem };

export interface LibraryFolder {
  path: string;
  song_count: number;
}

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  song_count: number;
  cover_song_path: string | null;
  is_expanded: boolean;
}

export type LibraryScanPhase = 'collecting' | 'parsing' | 'writing' | 'complete' | 'error';
export type LibraryScanTrigger = 'bootstrap' | 'first-import' | 'manual-rescan' | 'folder-add';
export type LibraryScanVisibility = 'silent' | 'hero' | 'inline';

export interface LibraryScanProgress {
  phase: LibraryScanPhase;
  current: number;
  total: number;
  folder_path: string;
  folder_index: number;
  folder_total: number;
  message: string | null;
  done: boolean;
  failed: boolean;
}

export interface LibraryScanSession {
  trigger: LibraryScanTrigger;
  visibility: LibraryScanVisibility;
  startedAt: number;
  hadLibraryFoldersAtStart: boolean;
  hadSongsAtStart: boolean;
  sourcePath?: string;
}

export const AUDIO_DELAY = ref(0.45);

export const footerCoverEl = ref<HTMLElement | null>(null);

export const dragSession = reactive({
  active: false,
  showGhost: false,
  type: 'song' as 'song' | 'playlist' | 'folder' | 'artist' | 'album',
  songs: [] as Song[],
  data: null as any,
  mouseX: 0,
  mouseY: 0,
  targetFolder: null as { name: string; path: string } | null,
  targetPlaylist: null as { id: string; name: string } | null,
  insertIndex: -1,
  sortLineTop: -1,
});

const createStoreBridgeRef = <T>(getter: () => T, setter: (value: T) => void): Ref<T> =>
  ({
    __v_isRef: true,
    get value() {
      return getter();
    },
    set value(nextValue: T) {
      setter(nextValue);
    },
  }) as unknown as Ref<T>;

export const isPlaying = createStoreBridgeRef(
  () => usePlaybackStore().isPlaying,
  value => {
    usePlaybackStore().isPlaying = value;
  },
);

export const volume = createStoreBridgeRef(
  () => usePlaybackStore().volume,
  value => {
    usePlaybackStore().volume = value;
  },
);

export const currentTime = createStoreBridgeRef(
  () => usePlaybackStore().currentTime,
  value => {
    usePlaybackStore().currentTime = value;
  },
);

export const playMode = createStoreBridgeRef(
  () => usePlaybackStore().playMode,
  value => {
    usePlaybackStore().playMode = value;
  },
);

export const isSongLoaded = createStoreBridgeRef(
  () => usePlaybackStore().isSongLoaded,
  value => {
    usePlaybackStore().isSongLoaded = value;
  },
);

export const playQueue = createStoreBridgeRef(
  () => usePlaybackStore().playQueue,
  value => {
    usePlaybackStore().playQueue = value;
  },
);

export const tempQueue = createStoreBridgeRef(
  () => usePlaybackStore().tempQueue,
  value => {
    usePlaybackStore().tempQueue = value;
  },
);

export const currentSong = createStoreBridgeRef(
  () => usePlaybackStore().currentSong,
  value => {
    usePlaybackStore().currentSong = value;
  },
);

export const currentCover = createStoreBridgeRef(
  () => usePlaybackStore().currentCover,
  value => {
    usePlaybackStore().currentCover = value;
  },
);

export const showPlaylist = createStoreBridgeRef(
  () => useUiStore().showPlaylist,
  value => {
    useUiStore().showPlaylist = value;
  },
);

export const showMiniPlaylist = createStoreBridgeRef(
  () => useUiStore().showMiniPlaylist,
  value => {
    useUiStore().showMiniPlaylist = value;
  },
);

export const showPlayerDetail = createStoreBridgeRef(
  () => useUiStore().showPlayerDetail,
  value => {
    useUiStore().showPlayerDetail = value;
  },
);

export const showQueue = createStoreBridgeRef(
  () => useUiStore().showQueue,
  value => {
    useUiStore().showQueue = value;
  },
);

export const isMiniMode = createStoreBridgeRef(
  () => useUiStore().isMiniMode,
  value => {
    useUiStore().isMiniMode = value;
  },
);

export const showVolumePopover = createStoreBridgeRef(
  () => useUiStore().showVolumePopover,
  value => {
    useUiStore().showVolumePopover = value;
  },
);

export const showAddToPlaylistModal = createStoreBridgeRef(
  () => useUiStore().showAddToPlaylistModal,
  value => {
    useUiStore().showAddToPlaylistModal = value;
  },
);

export const playlistAddTargetSongs = createStoreBridgeRef(
  () => useUiStore().playlistAddTargetSongs,
  value => {
    useUiStore().playlistAddTargetSongs = value;
  },
);

export const dominantColors = createStoreBridgeRef(
  () => useUiStore().dominantColors,
  value => {
    useUiStore().dominantColors = value;
  },
);

export const playlistCover = createStoreBridgeRef(
  () => useUiStore().playlistCover,
  value => {
    useUiStore().playlistCover = value;
  },
);

export const lastLibraryScanError = createStoreBridgeRef(
  () => useLibraryStore().lastLibraryScanError,
  value => useLibraryStore().setLastLibraryScanError(value),
);

export const artistSortMode = ref<'count' | 'name' | 'custom'>('count');
export const albumSortMode = ref<'count' | 'name' | 'artist' | 'custom'>('artist');
export const artistCustomOrder = ref<string[]>([]);
export const albumCustomOrder = ref<string[]>([]);
export const folderSortMode = ref<'title' | 'name' | 'artist' | 'added_at' | 'custom'>('title');
export const folderCustomOrder = ref<Record<string, string[]>>({});
export const localSortMode = ref<'title' | 'name' | 'artist' | 'added_at' | 'custom' | 'default'>('default');
export const localCustomOrder = ref<string[]>([]);
export const playlistSortMode = ref<'title' | 'name' | 'artist' | 'added_at' | 'custom'>('custom');
