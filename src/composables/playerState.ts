import { ref, reactive } from 'vue';
import { Song, Playlist, HistoryItem } from '../types';

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

export const isPlaying = ref(false);
export const volume = ref(100);
export const currentTime = ref(0);
export const playMode = ref(0);
export const showPlaylist = ref(false);
export const showMiniPlaylist = ref(false);
export const isSongLoaded = ref(false);
export const showPlayerDetail = ref(false);
export const showQueue = ref(false);
export const isMiniMode = ref(false);
export const showVolumePopover = ref(false);
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

export const showAddToPlaylistModal = ref(false);
export const playlistAddTargetSongs = ref<string[]>([]);

export const songList = ref<Song[]>([]);
export const librarySongs = ref<Song[]>([]);
export const libraryFolders = ref<LibraryFolder[]>([]);
export const folderTree = ref<FolderNode[]>([]);
export const originalSongList = ref<Song[]>([]);

export const playQueue = ref<Song[]>([]);
export const tempQueue = ref<Song[]>([]);
export const currentSong = ref<Song | null>(null);
export const currentCover = ref<string>('');
export const dominantColors = ref<string[]>(['transparent', 'transparent', 'transparent', 'transparent']);
export const playlistCover = ref<string>('');
export const libraryScanProgress = ref<LibraryScanProgress | null>(null);
export const libraryScanSession = ref<LibraryScanSession | null>(null);
export const lastLibraryScanError = ref<string | null>(null);
export const watchedFolders = ref<string[]>([]);
export const favoritePaths = ref<string[]>([]);
export const playlists = ref<Playlist[]>([]);
export const recentSongs = ref<HistoryItem[]>([]);

export const artistSortMode = ref<'count' | 'name' | 'custom'>('count');
export const albumSortMode = ref<'count' | 'name' | 'artist' | 'custom'>('artist');
export const artistCustomOrder = ref<string[]>([]);
export const albumCustomOrder = ref<string[]>([]);
export const folderSortMode = ref<'title' | 'name' | 'artist' | 'added_at' | 'custom'>('title');
export const folderCustomOrder = ref<Record<string, string[]>>({});
export const localSortMode = ref<'title' | 'name' | 'artist' | 'added_at' | 'custom' | 'default'>('default');
export const localCustomOrder = ref<string[]>([]);
export const playlistSortMode = ref<'title' | 'name' | 'artist' | 'added_at' | 'custom'>('custom');
