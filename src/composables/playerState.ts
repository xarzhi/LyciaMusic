import { ref, reactive } from 'vue';
import { Song, Playlist, HistoryItem, AppSettings } from '../types';
export type { Song, Playlist, HistoryItem, AppSettings };

// --- Interface Definitions ---
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

// --- 全局播放状态 ---
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

// --- 共享元素转场 ---
export const footerCoverEl = ref<HTMLElement | null>(null);

// --- 自定义拖拽状态 ---
export const dragSession = reactive({
  active: false,
  showGhost: false, // 🟢 独立控制 DragGhost 显示
  type: 'song' as 'song' | 'playlist' | 'folder' | 'artist' | 'album',
  songs: [] as Song[],
  data: null as any,
  mouseX: 0,
  mouseY: 0,
  targetFolder: null as { name: string, path: string } | null,
  targetPlaylist: null as { id: string, name: string } | null,
  insertIndex: -1,
  sortLineTop: -1,
});

// --- 弹窗状态 ---
export const showAddToPlaylistModal = ref(false);
export const playlistAddTargetSongs = ref<string[]>([]);

// --- 数据列表 ---
export const songList = ref<Song[]>([]);
export const librarySongs = ref<Song[]>([]); // 🟢 New: Library Songs (Exclusive for Local Music)
export const libraryFolders = ref<LibraryFolder[]>([]); // 🟢 New: Library Folders
export const folderTree = ref<FolderNode[]>([]); // 🟢 New: Folder Tree
export const originalSongList = ref<Song[]>([]); // Backup

export const playQueue = ref<Song[]>([]);
export const tempQueue = ref<Song[]>([]);
export const currentSong = ref<Song | null>(null);
export const currentCover = ref<string>('');
export const dominantColors = ref<string[]>(['transparent', 'transparent', 'transparent', 'transparent']);
export const playlistCover = ref<string>('');
export const libraryScanProgress = ref<LibraryScanProgress | null>(null);
export const libraryScanSession = ref<LibraryScanSession | null>(null);
export const lastLibraryScanError = ref<string | null>(null);
export const watchedFolders = ref<string[]>([]); // Legacy/Folder View
export const favoritePaths = ref<string[]>([]);
export const playlists = ref<Playlist[]>([]);
export const recentSongs = ref<HistoryItem[]>([]);

// --- 排序状态 ---
export const artistSortMode = ref<'count' | 'name' | 'custom'>('count');
export const albumSortMode = ref<'count' | 'name' | 'artist' | 'custom'>('artist');
export const artistCustomOrder = ref<string[]>([]);
export const albumCustomOrder = ref<string[]>([]);

// 🟢 文件夹排序状态
export const folderSortMode = ref<'title' | 'name' | 'artist' | 'added_at' | 'custom'>('title'); // title=歌曲名, name=文件名
export const folderCustomOrder = ref<Record<string, string[]>>({}); // 每个文件夹的自定义排序

// 🟢 本地音乐排序状态
export const localSortMode = ref<'title' | 'name' | 'artist' | 'added_at' | 'custom' | 'default'>('default');
export const localCustomOrder = ref<string[]>([]);

// 🟢 歌单排序状态
export const playlistSortMode = ref<'title' | 'name' | 'artist' | 'added_at' | 'custom'>('custom');


// --- 设置 ---
export const settings = ref<AppSettings>({
  organizeRoot: 'D:\\Music',
  enableAutoOrganize: true,
  organizeRule: '{Artist}/{Album}/{Title}',
  theme: {
    mode: 'light',
    dynamicBgType: 'flow',
    windowMaterial: 'none',
    customBgPath: '',
    opacity: 0.8,
    blur: 20,
    customBackground: {
      imagePath: '',
      blur: 20,
      opacity: 1.0,
      maskColor: '#000000',
      maskAlpha: 0.4,
      scale: 1.0,
      foregroundStyle: 'auto'
    }
  },
  sidebar: {
    showLocalMusic: true,
    showArtists: true,
    showAlbums: true,
    showFavorites: true,
    showRecent: true,
    showFolders: true,
    showStatistics: true
  }
});

// --- 视图状态 ---
export const currentViewMode = ref<'all' | 'folder' | 'artist' | 'album' | 'genre' | 'year' | 'playlist' | 'recent' | 'favorites' | 'statistics'>('all');
export const filterCondition = ref<string>('');
export const searchQuery = ref<string>('');
export const localMusicTab = ref<'default' | 'artist' | 'album'>('default');
export const currentArtistFilter = ref<string>('');
export const currentAlbumFilter = ref<string>('');
export const currentFolderFilter = ref<string>('');
export const favTab = ref<'songs' | 'artists' | 'albums'>('songs');
export const favDetailFilter = ref<{ type: 'artist' | 'album', name: string } | null>(null);
export const recentTab = ref<'songs' | 'playlists' | 'albums'>('songs');
export const activeRootPath = ref<string | null>(null); // 🟢 Sidebar Root Capsule State
