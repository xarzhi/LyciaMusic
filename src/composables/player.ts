import { computed, watch, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import * as State from './playerState';
export * from './playerState';
import { useLyrics } from './lyrics';
import { useSettings as useAppSettings } from './settings';
import { useToast } from './toast';
import { extractDominantColors } from './colorExtraction';
import { convertFileSrc } from '@tauri-apps/api/core';

// 动画帧 ID

let progressFrameId: number | null = null;
// 校准定时器 ID
let syncIntervalId: any = null;
let seekTimeout: any = null;
let dominantColorTaskId = 0;
let playRequestId = 0;

// 插值锚点

let playbackAnchorTime = 0;

let playbackStartOffset = 0;

// 播放时长统计状态（模块顶层，确保跨调用共享）
let sessionStartTime: number | null = null;
let accumulatedTime = 0;

// 🟢 Seek 状态标志位（用于禁止同步期间回滚 UI）
let isSeeking = false;



// 🟢 辅助函数：判断是否为直属父目录 (非递归)

const isDirectParent = (parentPath: string, childPath: string) => {

  if (!parentPath || !childPath) return false;

  const p = parentPath.replace(/\\/g, '/').replace(/\/$/, '');

  const c = childPath.replace(/\\/g, '/');

  const lastSlash = c.lastIndexOf('/');

  return lastSlash !== -1 && c.substring(0, lastSlash) === p;

};



// 定义后端返回的结构

interface GeneratedFolder {

  name: string;

  path: string;

  songs: State.Song[];

}



export function usePlayer() {



  const { loadLyrics } = useLyrics();
  const { settings: appSettings } = useAppSettings();



  // ... (格式化函数保持不变) ...

  function formatDuration(seconds: number) { if (!seconds) return "00:00"; const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; }

  function formatTimeAgo(timestamp: number) { const now = Date.now(); const diff = now - timestamp; const oneHour = 60 * 60 * 1000; if (diff < oneHour) return `${Math.max(1, Math.floor(diff / 60000))}分钟前`; if (diff < 24 * oneHour) return `${Math.floor(diff / oneHour)}小时前`; return `${Math.floor(diff / (24 * oneHour))}天前`; }



  // ... (计算属性保持不变) ...

  const isLocalMusic = computed(() => State.currentViewMode.value === 'all' || State.currentViewMode.value === 'artist' || State.currentViewMode.value === 'album');

  const isFolderMode = computed(() => State.currentViewMode.value === 'folder');




  // 🟢 核心：定义“库内歌曲”
  // 使用新的 librarySongs 状态 (由 scanLibrary populates)
  const librarySongs = computed(() => {
    return State.librarySongs.value;
  });

  let isInitialized = false;
  onMounted(async () => {
    if (isInitialized) return;
    isInitialized = true;

    // Initialize Library
    await fetchLibraryFolders();
    scanLibrary(); // Run in background

    // startTimer(); // This function is not defined in the provided context, commenting out to avoid errors.

    // Listen for window resize to update layout if needed
    // ...
  });

  // --- Library Management ---
  async function fetchLibraryFolders() {
    try {
      const folders = await invoke<State.LibraryFolder[]>('get_library_folders');
      State.libraryFolders.value = folders;
    } catch (e) {
      console.error("Failed to fetch library folders:", e);
    }
  }

  async function addLibraryFolderRecord(path: string) {
    await invoke('add_library_folder', { path });
    await fetchLibraryFolders();
    await scanLibrary();
  }

  async function addSidebarFolderRecord(path: string) {
    await invoke('add_sidebar_folder', { path });
    await invoke('scan_music_folder', { folderPath: path });
    await fetchSidebarTree();
  }

  async function removeLibraryFolderRecord(path: string) {
    await invoke('remove_library_folder', { path });
    await fetchLibraryFolders();
    await scanLibrary();
  }

  async function removeSidebarFolderRecord(path: string) {
    await invoke('remove_sidebar_folder', { path });
    await fetchSidebarTree();
  }

  async function addLibraryFolderLinked(
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean } = {}
  ) {
    const { syncLinked = true, showToast = false } = options;

    await addLibraryFolderRecord(path);

    if (syncLinked && appSettings.value.linkFoldersToLibrary) {
      await addSidebarFolderRecord(path);
    }

    if (showToast) {
      useToast().showToast(
        syncLinked && appSettings.value.linkFoldersToLibrary
          ? "已将文件夹同时添加到本地音乐库和侧边栏"
          : "已添加文件夹到音乐库",
        "success"
      );
    }
  }

  async function removeLibraryFolderLinked(
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean } = {}
  ) {
    const { syncLinked = true, showToast = true } = options;

    await removeLibraryFolderRecord(path);

    if (syncLinked && appSettings.value.linkFoldersToLibrary) {
      await removeSidebarFolderRecord(path);
    }

    if (showToast) {
      useToast().showToast(
        syncLinked && appSettings.value.linkFoldersToLibrary
          ? "已从本地音乐库和侧边栏同步移除文件夹"
          : "已从音乐库移除文件夹",
        "success"
      );
    }
  }

  async function addSidebarFolderLinked(
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean } = {}
  ) {
    const { syncLinked = true, showToast = true } = options;

    await addSidebarFolderRecord(path);

    if (syncLinked && appSettings.value.linkFoldersToLibrary) {
      await addLibraryFolderRecord(path);
    }

    if (showToast) {
      useToast().showToast(
        syncLinked && appSettings.value.linkFoldersToLibrary
          ? "已将文件夹同时添加到侧边栏和本地音乐库"
          : "已添加文件夹到侧边栏",
        "success"
      );
    }
  }

  async function removeSidebarFolderLinked(
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean } = {}
  ) {
    const { syncLinked = true, showToast = true } = options;

    await removeSidebarFolderRecord(path);

    if (syncLinked && appSettings.value.linkFoldersToLibrary) {
      await removeLibraryFolderRecord(path);
    }

    if (showToast) {
      useToast().showToast(
        syncLinked && appSettings.value.linkFoldersToLibrary
          ? "已从侧边栏和本地音乐库同步移除文件夹"
          : "已从侧边栏移除文件夹",
        "success"
      );
    }
  }

  async function addLibraryFolder() {
    try {
      const selected = await open({ directory: true, multiple: false, title: '选择音乐文件夹' });
      if (selected && typeof selected === 'string') {
        await addLibraryFolderLinked(selected, { showToast: true });
      }
    } catch (e) {
      console.error("Failed to add library folder:", e);
      useToast().showToast("添加文件夹失败: " + e, "error");
    }
  }

  async function addLibraryFolderPath(path: string) {
    try {
      await invoke('add_library_folder', { path });
      await fetchLibraryFolders();
      await scanLibrary();
    } catch (e) {
      console.error("Failed to add library folder path:", e);
    }
  }

  async function removeLibraryFolder(path: string) {
    try {
      await removeLibraryFolderLinked(path);
    } catch (e) {
      console.error("Failed to remove library folder:", e);
    }
  }

  // 🟢 Helper: Recursively remove node from tree for Optimistic UI
  const removeNodeFromTree = (nodes: State.FolderNode[], targetPath: string): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].path === targetPath) {
        nodes.splice(i, 1);
        return true;
      }
      if (nodes[i].children && nodes[i].children.length > 0) {
        if (removeNodeFromTree(nodes[i].children, targetPath)) {
          return true;
        }
      }
    }
    return false;
  };

  // 🟢 Physical Folder Deletion (Management Mode)
  async function deleteFolder(path: string) {
    try {
      await invoke('delete_folder', { path });

      // Check if it's a root folder
      const isRoot = State.folderTree.value.some(n => n.path === path);

      if (isRoot) {
        // If it's a root, we should remove it from the sidebar list entirely
        await removeSidebarFolderLinked(path, { showToast: false });
      } else {
        // If it's a subfolder, just remove it from the tree view optimistically
        removeNodeFromTree(State.folderTree.value, path);
      }

    } catch (e) {
      throw e; // Let caller handle error toast
    }
  }

  // 🟢 Helper: Recursively increment song count for a folder
  const incrementNodeCount = (nodes: State.FolderNode[], targetPath: string): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].path === targetPath) {
        nodes[i].song_count++;
        return true;
      }
      if (nodes[i].children && nodes[i].children.length > 0) {
        if (incrementNodeCount(nodes[i].children, targetPath)) {
          return true;
        }
      }
    }
    return false;
  };

  // 🟢 Helper: Recursively decrement song count for a folder
  const decrementNodeCount = (nodes: State.FolderNode[], targetPath: string): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].path === targetPath) {
        if (nodes[i].song_count > 0) nodes[i].song_count--;
        return true;
      }
      if (nodes[i].children && nodes[i].children.length > 0) {
        if (decrementNodeCount(nodes[i].children, targetPath)) {
          return true;
        }
      }
    }
    return false;
  };

  // 🟢 Helper: Update folder cover when first song changes
  const updateFolderCover = (nodes: State.FolderNode[], folderPath: string, newCoverSongPath: string | null): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].path === folderPath) {
        nodes[i].cover_song_path = newCoverSongPath;
        return true;
      }
      if (nodes[i].children && nodes[i].children.length > 0) {
        if (updateFolderCover(nodes[i].children, folderPath, newCoverSongPath)) {
          return true;
        }
      }
    }
    return false;
  };

  // 🟢 Helper: Get parent folder path from file path
  const getParentFolder = (filePath: string): string => {
    const sep = filePath.includes('\\') ? '\\' : '/';
    const parts = filePath.split(sep);
    parts.pop(); // Remove filename
    return parts.join(sep);
  };

  // 🟢 Physical File Move (Management Mode)
  async function moveFilePhysical(sourcePath: string, targetFolderPath: string) {
    try {
      // Get source folder path before moving
      const sourceFolderPath = getParentFolder(sourcePath);

      // Check if this song is the cover of source folder
      const sourceNode = findNode(State.folderTree.value, sourceFolderPath);
      const wasSourceCover = sourceNode?.cover_song_path === sourcePath;

      // 1. Backend Move
      await invoke('move_file_to_folder', { sourcePath, targetFolder: targetFolderPath });

      // 2. Optimistic UI Update

      // Remove from current song list if it matches (visual removal)
      const index = State.songList.value.findIndex(s => s.path === sourcePath);
      if (index !== -1) {
        State.songList.value.splice(index, 1);
      }

      // Update Source Folder Count (decrement)
      decrementNodeCount(State.folderTree.value, sourceFolderPath);

      // Update Source Folder Cover if needed - use backend query
      if (wasSourceCover) {
        try {
          const newCoverPath = await invoke<string | null>('get_folder_first_song', {
            folderPath: sourceFolderPath
          });
          updateFolderCover(State.folderTree.value, sourceFolderPath, newCoverPath);
        } catch {
          // If query fails, just clear the cover
          updateFolderCover(State.folderTree.value, sourceFolderPath, null);
        }
      }

      // Update Target Folder Count (increment)
      incrementNodeCount(State.folderTree.value, targetFolderPath);

    } catch (e) {
      throw e;
    }
  }

  // 🟢 Helper: Find a node in the tree
  const findNode = (nodes: State.FolderNode[], targetPath: string): State.FolderNode | null => {
    for (const node of nodes) {
      if (node.path === targetPath) return node;
      if (node.children && node.children.length > 0) {
        const found = findNode(node.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  async function scanLibrary() {
    try {
      const songs = await invoke<State.Song[]>('scan_library');
      State.librarySongs.value = songs;
      // Optional: Update folder counts? fetchLibraryFolders handles it if we call it again, 
      // but scan_library returns songs. We might want to refresh folder counts too.
      await fetchLibraryFolders();
      // NOTE: We do NOT refresh folderTree here anymore. Sidebar is independent.
    } catch (e) {
      console.error("Library scan failed:", e);
    }
  }

  // --- Sidebar Folder Management (New) ---

  async function fetchSidebarTree() {
    try {
      // Use NEW command for independent sidebar
      const tree = await invoke<State.FolderNode[]>('get_sidebar_hierarchy');
      State.folderTree.value = tree;
    } catch (e) {
      console.error("Failed to fetch sidebar tree:", e);
    }
  }

  async function addSidebarFolder() {
    try {
      const selected = await open({ directory: true, multiple: false, title: '添加文件夹到侧边栏' });
      if (selected && typeof selected === 'string') {
        const shouldLinkToLibrary = appSettings.value.linkFoldersToLibrary;
        await invoke('add_sidebar_folder', { path: selected });
        // 🟢 扫描歌曲到数据库，确保封面可被查询到
        await invoke('scan_music_folder', { folderPath: selected });
        await fetchSidebarTree();
        if (shouldLinkToLibrary) {
          await addLibraryFolderPath(selected);
          useToast().showToast("已添加文件夹到侧边栏，并关联到本地音乐库", "success");
          return;
        }
        useToast().showToast("已添加文件夹到侧边栏", "success");
      }
    } catch (e) {
      console.error("Failed to add sidebar folder:", e);
      useToast().showToast("添加失败: " + e, "error");
    }
  }

  async function removeSidebarFolder(path: string) {
    try {
      await invoke('remove_sidebar_folder', { path });
      await fetchSidebarTree();
      useToast().showToast("已移除侧边栏文件夹", "success");
    } catch (e) {
      console.error("Failed to remove sidebar folder:", e);
    }
  }



  const artistList = computed(() => {



    const map = new Map<string, { count: number, firstSongPath: string }>();



    librarySongs.value.forEach(s => {



      const k = s.artist || 'Unknown';



      const existing = map.get(k);



      if (existing) { existing.count++; }



      else { map.set(k, { count: 1, firstSongPath: s.path }); }



    });







    let list = Array.from(map).map(([n, v]) => ({ name: n, count: v.count, firstSongPath: v.firstSongPath }));







    // 🟢 排序逻辑



    if (State.artistSortMode.value === 'name') {



      list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));



    } else if (State.artistSortMode.value === 'custom') {



      const orderMap = new Map(State.artistCustomOrder.value.map((n, i) => [n, i]));



      list.sort((a, b) => {



        const ia = orderMap.has(a.name) ? orderMap.get(a.name)! : 999999;



        const ib = orderMap.has(b.name) ? orderMap.get(b.name)! : 999999;



        return ia - ib;



      });



    } else {



      // Default: count



      list.sort((a, b) => b.count - a.count);



    }



    return list;



  });







  const albumList = computed(() => {



    const map = new Map<string, { count: number, artist: string, firstSongPath: string }>();



    librarySongs.value.forEach(s => {



      const k = s.album || 'Unknown';



      const existing = map.get(k);



      if (existing) { existing.count++; }



      else { map.set(k, { count: 1, artist: s.artist, firstSongPath: s.path }); }



    });







    let list = Array.from(map).map(([n, v]) => ({ name: n, count: v.count, artist: v.artist, firstSongPath: v.firstSongPath }));







    // 🟢 排序逻辑



    if (State.albumSortMode.value === 'name') {



      list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));



    } else if (State.albumSortMode.value === 'custom') {



      const orderMap = new Map(State.albumCustomOrder.value.map((n, i) => [n, i]));



      list.sort((a, b) => {



        const ia = orderMap.has(a.name) ? orderMap.get(a.name)! : 999999;



        const ib = orderMap.has(b.name) ? orderMap.get(b.name)! : 999999;



        return ia - ib;



      });



    } else {



      // Default: count



      list.sort((a, b) => b.count - a.count);



    }



    return list;



  });

  const filteredArtistList = computed(() => {
    const query = State.searchQuery.value.trim().toLowerCase();
    if (!query) return artistList.value;
    return artistList.value.filter(artist => (artist.name || '').toLowerCase().includes(query));
  });

  const filteredAlbumList = computed(() => {
    const query = State.searchQuery.value.trim().toLowerCase();
    if (!query) return albumList.value;
    return albumList.value.filter(album =>
      (album.name || '').toLowerCase().includes(query) ||
      (album.artist || '').toLowerCase().includes(query)
    );
  });







  const folderList = computed(() => {



    // folderList 顺序直接由 watchedFolders 数组顺序决定，因此支持手动排序



    return State.watchedFolders.value.map(folderPath => {



      // 🟢 关键修改：仅统计直属该目录的歌曲 (非递归)



      const songsInFolder = State.songList.value.filter(s => isDirectParent(folderPath, s.path));



      return {



        path: folderPath,



        name: folderPath.split(/[/\\]/).pop() || folderPath,



        count: songsInFolder.length,



        firstSongPath: songsInFolder.length > 0 ? songsInFolder[0].path : ''



      };



    });



  });

  const favoriteSongList = computed(() => { return librarySongs.value.filter(s => State.favoritePaths.value.includes(s.path)); });

  const favArtistList = computed(() => { const map = new Map<string, { count: number, firstSongPath: string }>(); favoriteSongList.value.forEach(s => { const k = s.artist || 'Unknown'; const existing = map.get(k); if (existing) { existing.count++; } else { map.set(k, { count: 1, firstSongPath: s.path }); } }); return Array.from(map).map(([name, val]) => ({ name, count: val.count, firstSongPath: val.firstSongPath })).sort((a, b) => b.count - a.count); });

  const favAlbumList = computed(() => { const map = new Map<string, { count: number, artist: string, firstSongPath: string }>(); favoriteSongList.value.forEach(s => { const k = s.album || 'Unknown'; const existing = map.get(k); if (existing) { existing.count++; } else { map.set(k, { count: 1, artist: s.artist, firstSongPath: s.path }); } }); return Array.from(map).map(([name, val]) => ({ name, count: val.count, artist: val.artist, firstSongPath: val.firstSongPath })).sort((a, b) => b.count - a.count); });

  const recentAlbumList = computed(() => { const map = new Map<string, { artist: string, playedAt: number, firstSongPath: string }>(); State.recentSongs.value.forEach(item => { const k = item.song.album || 'Unknown'; if (!map.has(k) || item.playedAt > map.get(k)!.playedAt) { map.set(k, { artist: item.song.artist, playedAt: item.playedAt, firstSongPath: item.song.path }); } }); return Array.from(map).map(([name, val]) => ({ name, artist: val.artist, playedAt: val.playedAt, firstSongPath: val.firstSongPath })).sort((a, b) => b.playedAt - a.playedAt); });

  const recentPlaylistList = computed(() => { const result: { id: string, name: string, count: number, playedAt: number, firstSongPath: string }[] = []; State.playlists.value.forEach(pl => { let lastPlayedTime = 0; let hasPlayed = false; const plSongPaths = new Set(pl.songPaths); for (const historyItem of State.recentSongs.value) { if (plSongPaths.has(historyItem.song.path)) { if (historyItem.playedAt > lastPlayedTime) { lastPlayedTime = historyItem.playedAt; hasPlayed = true; } } } if (hasPlayed) { result.push({ id: pl.id, name: pl.name, count: pl.songPaths.length, playedAt: lastPlayedTime, firstSongPath: pl.songPaths.length > 0 ? pl.songPaths[0] : '' }); } }); return result.sort((a, b) => b.playedAt - a.playedAt); });



  const genreList = computed(() => {

    const map = new Map();

    librarySongs.value.forEach(s => {

      const k = s.genre || 'Unknown';

      map.set(k, (map.get(k) || 0) + 1);

    });

    return Array.from(map).map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count);

  });



  const yearList = computed(() => {

    const map = new Map();

    librarySongs.value.forEach(s => {

      const k = (s.year && s.year.length >= 4) ? s.year.substring(0, 4) : 'Unknown';

      map.set(k, (map.get(k) || 0) + 1);

    });

    return Array.from(map).map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.name.localeCompare(a.name));

  });



  const displaySongList = computed(() => {

    if (State.searchQuery.value.trim()) {

      const q = State.searchQuery.value.toLowerCase();

      if (State.currentViewMode.value === 'favorites') return favoriteSongList.value.filter(s => s.name.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));

      if (State.currentViewMode.value === 'recent') return State.recentSongs.value.map(h => h.song).filter(s => s.name.toLowerCase().includes(q));

      // 🟢 搜索逻辑：优先搜库，也可以搜当前文件夹的
      return librarySongs.value.filter(s => s.name.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || s.album.toLowerCase().includes(q));

    }

    if (State.currentViewMode.value === 'all') {
      let base = [...librarySongs.value];
      if (State.localMusicTab.value === 'artist' && State.currentArtistFilter.value) {
        base = base.filter(s => s.artist === State.currentArtistFilter.value);
      } else if (State.localMusicTab.value === 'album' && State.currentAlbumFilter.value) {
        base = base.filter(s => s.album === State.currentAlbumFilter.value);
      }

      // 🟢 应用本地音乐排序
      if (State.localSortMode.value === 'title') {
        base.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'name') {
        base.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'artist') {
        base.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
      } else if (State.localSortMode.value === 'added_at') {
        base.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
      } else if (State.localSortMode.value === 'custom') {
        const orderMap = new Map(State.localCustomOrder.value.map((path, i) => [path, i]));
        base.sort((a, b) => {
          const ia = orderMap.has(a.path) ? orderMap.get(a.path)! : 999999;
          const ib = orderMap.has(b.path) ? orderMap.get(b.path)! : 999999;
          return ia - ib;
        });
      }

      return base;
    }

    // 🟢 关键修改:文件夹视图只显示直属子歌曲,不递归,并支持排序
    if (State.currentViewMode.value === 'folder') {
      if (State.currentFolderFilter.value) {
        let songs = State.songList.value.filter(s => isDirectParent(State.currentFolderFilter.value, s.path));

        // 🟢 添加排序逻辑
        if (State.folderSortMode.value === 'title') {
          // 按歌曲名(title优先,否则用文件名)排序
          songs.sort((a, b) => {
            const titleA = a.title || a.name;
            const titleB = b.title || b.name;
            return titleA.localeCompare(titleB, 'zh-CN');
          });
        } else if (State.folderSortMode.value === 'name') {
          // 按文件名排序
          songs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        } else if (State.folderSortMode.value === 'artist') {
          // 按歌手名排序
          songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
        } else if (State.folderSortMode.value === 'added_at') {
          // 🟢 添加时间排序 (降序)
          songs.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
        } else if (State.folderSortMode.value === 'custom') {
          // 自定义排序(拖拽后的顺序)
          const customOrder = State.folderCustomOrder.value[State.currentFolderFilter.value] || [];
          if (customOrder.length > 0) {
            const orderMap = new Map(customOrder.map((path, i) => [path, i]));
            songs.sort((a, b) => {
              const ia = orderMap.has(a.path) ? orderMap.get(a.path)! : 999999;
              const ib = orderMap.has(b.path) ? orderMap.get(b.path)! : 999999;
              return ia - ib;
            });
          }
        }

        return songs;
      } else {
        return []; // 🟢 No folder selected = empty list
      }
    }



    if (State.currentViewMode.value === 'recent') {
      let songs = State.recentSongs.value.map(h => h.song);

      // 🟢 应用排序 (与本地音乐共享模式)
      if (State.localSortMode.value === 'title') {
        songs.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'name') {
        songs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'artist') {
        songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
      } else if (State.localSortMode.value === 'added_at') {
        // 最近播放本身就是按时间排的,但如果用户选了添加时间,则按扫描入库时间排
        songs.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
      }

      return songs;
    }

    if (State.currentViewMode.value === 'favorites') {
      let songs = [];
      if (State.favTab.value === 'songs') {
        songs = [...favoriteSongList.value];
      } else if (State.favTab.value === 'artists') {
        songs = State.favDetailFilter.value?.type === 'artist' ? favoriteSongList.value.filter(s => s.artist === State.favDetailFilter.value!.name) : [];
      } else if (State.favTab.value === 'albums') {
        songs = State.favDetailFilter.value?.type === 'album' ? favoriteSongList.value.filter(s => s.album === State.favDetailFilter.value!.name) : [];
      } else {
        songs = [...favoriteSongList.value];
      }

      // 🟢 应用排序
      if (State.localSortMode.value === 'title') {
        songs.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'name') {
        songs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      } else if (State.localSortMode.value === 'artist') {
        songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
      } else if (State.localSortMode.value === 'added_at') {
        songs.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
      }

      return songs;
    }

    if (State.currentViewMode.value === 'playlist') {
      const pl = State.playlists.value.find(p => p.id === State.filterCondition.value);
      if (!pl) return [];

      const songMap = new Map();
      State.librarySongs.value.forEach(s => songMap.set(s.path, s));
      State.songList.value.forEach(s => {
        if (!songMap.has(s.path)) songMap.set(s.path, s);
      });

      let songs = pl.songPaths
        .map(path => songMap.get(path))
        .filter((s): s is State.Song => !!s);

      // 🟢 应用歌单排序
      if (State.playlistSortMode.value === 'title') {
        songs.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'zh-CN'));
      } else if (State.playlistSortMode.value === 'name') {
        songs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      } else if (State.playlistSortMode.value === 'artist') {
        songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
      } else if (State.playlistSortMode.value === 'added_at') {
        songs.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
      }
      // 'custom' 模式不需要排序,因为它已经通过 map(path => ...) 维持了 songPaths 的顺序

      return songs;
    }

    return librarySongs.value.filter(s => (s.artist || 'Unknown') === State.filterCondition.value || (s.album || 'Unknown') === State.filterCondition.value || (s.genre || 'Unknown') === State.filterCondition.value || ((s.year?.substring(0, 4)) || 'Unknown') === State.filterCondition.value);

  });



  watch(displaySongList, async (newList) => {

    if (State.currentViewMode.value === 'favorites' && (State.favTab.value === 'artists' || State.favTab.value === 'albums') && !State.favDetailFilter.value) return;

    if (newList.length > 0) { try { const cover = await invoke<string>('get_song_cover', { path: newList[0].path }); State.playlistCover.value = cover; } catch { State.playlistCover.value = ''; } } else { State.playlistCover.value = ''; }

  }, { immediate: true });



  async function addFoldersFromStructure() {



    try {



      const selectedPath = await open({ directory: true, multiple: false, title: '选择要扫描的根目录' });



      if (!selectedPath || typeof selectedPath !== 'string') return;



      const newFolders = await invoke<GeneratedFolder[]>('scan_folder_as_playlists', { rootPath: selectedPath });



      if (newFolders.length === 0) { useToast().showToast("未在该目录下找到包含音乐文件的文件夹", "error"); return; }



      let addedCount = 0;



      let allNewSongs: State.Song[] = [];



      newFolders.forEach(folder => {



        if (!State.watchedFolders.value.includes(folder.path)) { State.watchedFolders.value.push(folder.path); addedCount++; }



        allNewSongs.push(...folder.songs);



      });



      const existingPaths = new Set(State.songList.value.map(s => s.path));



      const uniqueNewSongs = allNewSongs.filter(s => !existingPaths.has(s.path));



      State.songList.value = [...State.songList.value, ...uniqueNewSongs];



      useToast().showToast(`已添加 ${addedCount} 个文件夹到侧边栏`, "success");



    } catch (e) { console.error("添加文件夹失败:", e); useToast().showToast("添加文件夹失败: " + e, "error"); }



  }







  function getSongsInFolder(folderPath: string) { return State.songList.value.filter(s => isDirectParent(folderPath, s.path)); }







  // 🟢 重点：创建歌单时，记录当前日期

  function createPlaylist(n: string, initialSongs: string[] = []) {

    if (n.trim()) {

      const now = new Date();

      const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;



      State.playlists.value.push({

        id: Date.now().toString() + Math.random().toString().slice(2),

        name: n,

        songPaths: [...initialSongs],

        createdAt: dateStr // 新增字段

      });

    }

  }



  async function moveFilesToFolder(paths: string[], targetFolder: string) {
    try {
      // Track source folders for count/cover updates
      const sourceFolderMap = new Map<string, { count: number; coverPaths: string[] }>();

      paths.forEach(oldPath => {
        const sourceFolder = getParentFolder(oldPath);
        if (!sourceFolderMap.has(sourceFolder)) {
          const node = findNode(State.folderTree.value, sourceFolder);
          sourceFolderMap.set(sourceFolder, {
            count: 0,
            coverPaths: node?.cover_song_path === oldPath ? [oldPath] : []
          });
        }
        const entry = sourceFolderMap.get(sourceFolder)!;
        entry.count++;

        // Check if this file is the cover of source folder
        const node = findNode(State.folderTree.value, sourceFolder);
        if (node?.cover_song_path === oldPath && !entry.coverPaths.includes(oldPath)) {
          entry.coverPaths.push(oldPath);
        }
      });

      const count = await invoke<number>('batch_move_music_files', { paths, targetFolder });

      // Remove songs from songList and update paths
      paths.forEach(oldPath => {
        const idx = State.songList.value.findIndex(s => s.path === oldPath);
        if (idx !== -1) {
          State.songList.value.splice(idx, 1);
        }
      });

      // Update Source Folder Counts and Covers
      for (const [sourceFolder, entry] of sourceFolderMap) {
        // Decrement count
        for (let i = 0; i < entry.count; i++) {
          decrementNodeCount(State.folderTree.value, sourceFolder);
        }

        // Update cover if needed - use backend query
        if (entry.coverPaths.length > 0) {
          try {
            const newCoverPath = await invoke<string | null>('get_folder_first_song', {
              folderPath: sourceFolder
            });
            updateFolderCover(State.folderTree.value, sourceFolder, newCoverPath);
          } catch {
            updateFolderCover(State.folderTree.value, sourceFolder, null);
          }
        }
      }

      // Update Target Folder Count
      for (let i = 0; i < count; i++) {
        incrementNodeCount(State.folderTree.value, targetFolder);
      }

      return count;
    } catch (e) {
      throw e;
    }
  }



  async function refreshFolder(folderPath: string) {

    try {

      const newSongs = await invoke<State.Song[]>('scan_music_folder', { folderPath });

      const otherSongs = State.songList.value.filter(s => !s.path.startsWith(folderPath));

      State.songList.value = [...otherSongs, ...newSongs];

    } catch (e) {

      console.error("刷新失败:", e);

      throw e;

    }

  }



  // ... (其他函数保持不变) ...

  function deletePlaylist(id: string) { State.playlists.value = State.playlists.value.filter(p => p.id !== id); if (State.currentViewMode.value === 'playlist' && State.filterCondition.value === id) switchViewToAll(); }

  function addToPlaylist(pid: string, path: string) { const pl = State.playlists.value.find(p => p.id === pid); if (pl && !pl.songPaths.includes(path)) pl.songPaths.push(path); }

  function removeFromPlaylist(pid: string, path: string) { const pl = State.playlists.value.find(p => p.id === pid); if (pl) pl.songPaths = pl.songPaths.filter(p => p !== path); }

  function addSongsToPlaylist(playlistId: string, songPaths: string[]): number { const pl = State.playlists.value.find(p => p.id === playlistId); if (!pl) return 0; let addedCount = 0; songPaths.forEach(path => { if (!pl.songPaths.includes(path)) { pl.songPaths.push(path); addedCount++; } }); return addedCount; }

  function viewPlaylist(id: string) { State.currentViewMode.value = 'playlist'; State.filterCondition.value = id; State.searchQuery.value = ''; }

  function switchToFolderView() { State.currentViewMode.value = 'folder'; State.searchQuery.value = ''; if (!State.currentFolderFilter.value && State.watchedFolders.value.length > 0) State.currentFolderFilter.value = State.watchedFolders.value[0]; }

  function removeFolder(folderPath: string) {

    State.watchedFolders.value = State.watchedFolders.value.filter(p => p !== folderPath);

    // 🟢 关键：移除文件夹不再从全局 songList 中删除歌曲数据

    // 这样已生成的歌单依然可以正常引用这些歌曲路径

    if (State.currentFolderFilter.value === folderPath) State.currentFolderFilter.value = State.watchedFolders.value.length > 0 ? State.watchedFolders.value[0] : '';

  }

  function viewArtist(n: string) { State.currentViewMode.value = 'artist'; State.filterCondition.value = n; State.searchQuery.value = ''; }

  function viewAlbum(n: string) { State.currentViewMode.value = 'album'; State.filterCondition.value = n; State.searchQuery.value = ''; }

  function viewGenre(n: string) { State.currentViewMode.value = 'genre'; State.filterCondition.value = n; State.searchQuery.value = ''; }

  function viewYear(n: string) { State.currentViewMode.value = 'year'; State.filterCondition.value = n; State.searchQuery.value = ''; }

  function switchViewToAll() { State.currentViewMode.value = 'all'; State.filterCondition.value = ''; State.searchQuery.value = ''; }

  function switchViewToFolder(p: string) { State.currentViewMode.value = 'folder'; State.filterCondition.value = p; State.searchQuery.value = ''; }

  function switchToRecent() { State.currentViewMode.value = 'recent'; State.searchQuery.value = ''; }

  function switchToFavorites() { State.currentViewMode.value = 'favorites'; State.searchQuery.value = ''; }

  function switchToStatistics() { State.currentViewMode.value = 'statistics'; State.searchQuery.value = ''; }

  function setSearch(q: string) { State.searchQuery.value = q; }

  function switchLocalTab(tab: 'default' | 'artist' | 'album') { State.localMusicTab.value = tab; State.currentArtistFilter.value = ''; State.currentAlbumFilter.value = ''; if (tab === 'artist' && artistList.value.length > 0) State.currentArtistFilter.value = artistList.value[0].name; if (tab === 'album' && albumList.value.length > 0) State.currentAlbumFilter.value = albumList.value[0].name; }

  function switchFavTab(tab: 'songs' | 'artists' | 'albums') { State.favTab.value = tab; }

  function isFavorite(s: State.Song | null) { if (!s) return false; return State.favoritePaths.value.includes(s.path); }

  function toggleFavorite(s: State.Song) { if (isFavorite(s)) State.favoritePaths.value = State.favoritePaths.value.filter(p => p !== s.path); else State.favoritePaths.value.push(s.path); }

  function addToHistory(song: State.Song) { State.recentSongs.value = State.recentSongs.value.filter(item => item.song.path !== song.path); State.recentSongs.value.unshift({ song, playedAt: Date.now() }); if (State.recentSongs.value.length > 1000) State.recentSongs.value = State.recentSongs.value.slice(0, 1000); }

  function clearHistory() { State.recentSongs.value = []; }

  function clearLocalMusic() { State.songList.value = []; State.watchedFolders.value = []; }

  function clearFavorites() { State.favoritePaths.value = []; }

  async function addFolder() {

    try {

      const sel = await open({ directory: true, multiple: false });

      if (sel && typeof sel === 'string') {

        // 🟢 修改点：手动添加也使用“拆分”逻辑，将子目录识别为独立实体

        const newFolders = await invoke<GeneratedFolder[]>('scan_folder_as_playlists', { rootPath: sel });

        if (newFolders.length === 0) {

          // 如果没有子目录有歌，或者就是单层目录，尝试作为单层目录添加

          if (!State.watchedFolders.value.includes(sel)) State.watchedFolders.value.push(sel);

          const newS = await invoke<State.Song[]>('scan_music_folder', { folderPath: sel });

          const exist = new Set(State.songList.value.map(s => s.path));

          const uniq = newS.filter(s => !exist.has(s.path));

          State.songList.value = [...State.songList.value, ...uniq];

        } else {

          // 使用拆分后的文件夹

          newFolders.forEach(folder => {

            if (!State.watchedFolders.value.includes(folder.path)) State.watchedFolders.value.push(folder.path);

          });

          const allNewSongs = newFolders.flatMap(f => f.songs);

          const existingPaths = new Set(State.songList.value.map(s => s.path));

          const uniqueNewSongs = allNewSongs.filter(s => !existingPaths.has(s.path));

          State.songList.value = [...State.songList.value, ...uniqueNewSongs];

        }

      }

    } catch (e) { console.error(e); }

  }
  function generateOrganizedPath(song: State.Song): string { const root = State.settings.value.organizeRoot || 'D:\\Music'; const sep = root.includes('/') ? '/' : '\\'; if (!State.settings.value.enableAutoOrganize) return ""; const clean = (s: string) => s.replace(/[<>:"/\\|?*]/g, '_').trim(); const artist = clean(song.artist && song.artist !== 'Unknown' ? song.artist : 'Unknown Artist'); const album = clean(song.album && song.album !== 'Unknown' ? song.album : 'Unknown Album'); const title = clean(song.title || song.name); const year = clean(song.year ? song.year.substring(0, 4) : '0000'); let relativePath = State.settings.value.organizeRule.replace('{Artist}', artist).replace('{Album}', album).replace('{Title}', title).replace('{Year}', year); relativePath = relativePath.replace(/\/\//g, '/').replace(/\\\\/g, '\\'); return `${root}${sep}${relativePath}`; }
  async function moveFile(song: State.Song, newPath: string) { try { await invoke('move_music_file', { oldPath: song.path, newPath }); const oldPath = song.path; const target = State.songList.value.find(s => s.path === oldPath); if (target) target.path = newPath; if (State.currentSong.value && State.currentSong.value.path === oldPath) State.currentSong.value.path = newPath; State.playlists.value.forEach(pl => { const i = pl.songPaths.indexOf(oldPath); if (i !== -1) pl.songPaths[i] = newPath; }); const fi = State.favoritePaths.value.indexOf(oldPath); if (fi !== -1) State.favoritePaths.value[fi] = newPath; return true; } catch (e) { useToast().showToast(`整理失败: ${e}`, "error"); return false; } }
  function handleAutoNext() { if (State.playMode.value === 1 && State.currentSong.value) { playSong(State.currentSong.value); } else { nextSong(); } }
  async function handleVolume(e: Event) { const v = parseInt((e.target as HTMLInputElement).value); State.volume.value = v; await invoke('set_volume', { volume: v / 100.0 }); }
  async function toggleMute() { if (State.volume.value > 0) { State.volume.value = 0; await invoke('set_volume', { volume: 0.0 }); } else { State.volume.value = 100; await invoke('set_volume', { volume: 1.0 }); } }
  function toggleMode() { State.playMode.value = (State.playMode.value + 1) % 3; }
  function togglePlaylist() { State.showPlaylist.value = !State.showPlaylist.value; }
  function toggleMiniPlaylist() { State.showMiniPlaylist.value = !State.showMiniPlaylist.value; }
  function closeMiniPlaylist() { State.showMiniPlaylist.value = false; }
  async function handleScan() { addFolder(); }
  function playNext(song: State.Song) { State.tempQueue.value.unshift(song); }
  function removeSongFromList(song: State.Song) { if (State.currentViewMode.value === 'all') { State.songList.value = State.songList.value.filter(s => s.path !== song.path); } else if (State.currentViewMode.value === 'favorites') { State.favoritePaths.value = State.favoritePaths.value.filter(p => p !== song.path); } else if (State.currentViewMode.value === 'recent') { State.recentSongs.value = State.recentSongs.value.filter(i => i.song.path !== song.path); } }
  async function openInFinder(path: string) { await invoke('show_in_folder', { path }); }
  async function deleteFromDisk(song: State.Song) { try { await invoke('delete_music_file', { path: song.path }); State.songList.value = State.songList.value.filter(s => s.path !== song.path); State.favoritePaths.value = State.favoritePaths.value.filter(p => p !== song.path); State.recentSongs.value = State.recentSongs.value.filter(i => i.song.path !== song.path); State.playlists.value.forEach(pl => { pl.songPaths = pl.songPaths.filter(p => p !== song.path); }); } catch (e) { useToast().showToast("删除失败: " + e, "error"); } }

  function stopTimer() {
    if (progressFrameId !== null) { cancelAnimationFrame(progressFrameId); progressFrameId = null; }
    if (syncIntervalId !== null) { clearInterval(syncIntervalId); syncIntervalId = null; }
  }

  function reanchorPlaybackClock(time: number) {
    playbackAnchorTime = performance.now();
    playbackStartOffset = time;
    State.currentTime.value = time;
  }

  function startTimer() {
    stopTimer();
    reanchorPlaybackClock(State.currentTime.value);
    const update = () => {
      if (!State.currentSong.value || !State.isPlaying.value) return;
      const now = performance.now();
      const delta = (now - playbackAnchorTime) / 1000.0;
      State.currentTime.value = playbackStartOffset + delta;
      if (State.currentTime.value >= State.currentSong.value.duration) { handleAutoNext(); return; }
      progressFrameId = requestAnimationFrame(update);
    };
    progressFrameId = requestAnimationFrame(update);
    syncIntervalId = setInterval(async () => {
      if (!State.isPlaying.value) return;
      if (isSeeking) return; // 🟢 正在 seek 时跳过同步，避免回滚 UI
      try {
        const realTime = await invoke<number>('get_playback_progress');
        const uiTime = State.currentTime.value;
        if (Math.abs(realTime - uiTime) > 0.05) {
          reanchorPlaybackClock(realTime);
        }
      } catch (e) { }
    }, 1000);
  }


  // 🟢 播放时长统计状态（已移到模块顶层）

  // 🟢 辅助：结算并记录播放时长
  const flushPlaySession = () => {
    const song = State.currentSong.value;
    if (!song) return;

    let currentSession = 0;
    // 如果正在播放，加上当前这段时间
    if (State.isPlaying.value && sessionStartTime) {
      currentSession = (Date.now() - sessionStartTime) / 1000;
    }

    const totalDuration = accumulatedTime + currentSession;

    // Anti-cheat: 只有超过 10 秒才记录
    if (totalDuration >= 10) {
      invoke('record_play', {
        songPath: song.path,
        duration: Math.floor(totalDuration)
      }).catch(e => console.warn('record_play failed:', e));
    }

    // Reset
    accumulatedTime = 0;
    sessionStartTime = null;
  };

  async function playSong(song: State.Song) {
    const requestId = ++playRequestId;
    // 🟢 切歌前：结算上一首
    flushPlaySession();

    State.currentSong.value = song;

    // 🟢 核心逻辑：播放时更新播放队列
    // 如果当前展示的列表包含这首歌，则把播放队列设置为当前展示列表
    // 这样保证了 "接着放下一首" 的逻辑是正确的
    if (displaySongList.value.some(s => s.path === song.path)) {
      State.playQueue.value = [...displaySongList.value];
    } else {
      // 如果不在当前列表（比如来自搜索结果，或者历史记录），
      // 且队列里也没有这首歌，则把它加入队列（或者重置队列？）
      // 策略：如果队列里没有，就把它加进去；如果队列为空，就只放它
      if (!State.playQueue.value.some(s => s.path === song.path)) {
        if (State.playQueue.value.length === 0) State.playQueue.value = [song];
        else State.playQueue.value.push(song);
      }
    }

    State.isPlaying.value = true;
    State.isSongLoaded.value = false;
    stopTimer();
    reanchorPlaybackClock(0);
    // Keep previous cover until the next one is ready to avoid visual flash.

    // 🟢 开始新会话计时
    accumulatedTime = 0;
    sessionStartTime = null;

    addToHistory(song);

    // 🟢 移除旧的 record_play (改为在结束/切歌时记录)
    // invoke('record_play', { songPath: song.path }).catch(e => console.warn('record_play failed:', e));

    try {
      // 先尝试获取封面，为了 metadata 完整
      const cover = await invoke<string>('get_song_cover', { path: song.path }).catch(() => "");
      if (requestId !== playRequestId || State.currentSong.value?.path !== song.path) return;
      State.currentCover.value = cover;

      await invoke('play_audio', {
        path: song.path,
        title: song.name,
        artist: song.artist || "Unknown Artist",
        album: song.album || "Unknown Album",
        cover: cover,
        duration: Math.floor(song.duration)
      });
      if (requestId !== playRequestId || State.currentSong.value?.path !== song.path) return;

      State.isSongLoaded.value = true;
      sessionStartTime = Date.now();
      loadLyrics();
      startTimer();
    } catch (e) {
      if (requestId !== playRequestId || State.currentSong.value?.path !== song.path) return;
      State.isPlaying.value = false;
      State.isSongLoaded.value = false;
      sessionStartTime = null;
      stopTimer();
    }
  }

  async function pauseSong() {
    // 🟢 暂停：累计时间，清除 sessionStart
    if (State.isPlaying.value && sessionStartTime) {
      accumulatedTime += (Date.now() - sessionStartTime) / 1000;
      sessionStartTime = null;
    }

    State.isPlaying.value = false;
    await invoke('pause_audio');
    stopTimer();
  }

  async function togglePlay() {
    if (!State.currentSong.value) return;

    if (State.isPlaying.value) {
      // Pausing
      if (sessionStartTime) {
        accumulatedTime += (Date.now() - sessionStartTime) / 1000;
        sessionStartTime = null;
      }

      await invoke('pause_audio');
      State.isPlaying.value = false;
      stopTimer();
    } else {
      // Playing
      if (!State.isSongLoaded.value) {
        await playSong(State.currentSong.value);
      } else {
        await invoke('resume_audio');
        // Resuming: start session
        sessionStartTime = Date.now();
      }
      State.isPlaying.value = true;
      startTimer();
    }
  }

  function nextSong() {
    if (State.tempQueue.value.length > 0) { const next = State.tempQueue.value.shift(); if (next) { playSong(next); return; } }

    // 🟢 核心逻辑：使用 playQueue
    const l = State.playQueue.value.length ? State.playQueue.value : State.songList.value;
    if (!l.length) return;

    let i = l.findIndex(s => s.path === State.currentSong.value?.path);
    i = (i + 1) % l.length;
    playSong(l[i]);
  }

  function prevSong() {
    // 🟢 核心逻辑：使用 playQueue
    const l = State.playQueue.value.length ? State.playQueue.value : State.songList.value;
    if (!l.length) return;

    let i = l.findIndex(s => s.path === State.currentSong.value?.path);
    i = (i - 1 + l.length) % l.length;
    playSong(l[i]);
  }

  // 🟢 新增：清空播放队列 (仅内存)
  async function clearQueue() {
    State.playQueue.value = [];
    State.tempQueue.value = []; // 也清空插队队列
    if (State.isPlaying.value) {
      await invoke('pause_audio');
      State.isPlaying.value = false;
    }
    stopTimer();
    State.currentSong.value = null; // 可选：是否清空当前歌曲？通常清空列表也会停止当前播放
  }

  // 🟢 新增：从队列移除歌曲
  function removeSongFromQueue(song: State.Song) {
    State.playQueue.value = State.playQueue.value.filter(s => s.path !== song.path);
    State.tempQueue.value = State.tempQueue.value.filter(s => s.path !== song.path);
  }

  // 🟢 新增：添加到队列末尾
  function addSongToQueue(song: State.Song) {
    State.playQueue.value.push(song);
    useToast().showToast('已添加到队列', 'success');
  }

  // 🟢 批量添加
  function addSongsToQueue(songs: State.Song[]) {
    if (songs.length === 0) return;
    State.playQueue.value.push(...songs);
    useToast().showToast(`已添加 ${songs.length} 首歌曲到队列`, 'success');
  }

  function getSongsFromPlaylist(playlistId: string): State.Song[] {
    const pl = State.playlists.value.find(p => p.id === playlistId);
    if (!pl) return [];
    const songMap = new Map(State.songList.value.map(s => [s.path, s]));
    return pl.songPaths.map(path => songMap.get(path)).filter((s): s is State.Song => !!s);
  }
  async function seekTo(newTime: number) {
    if (!State.currentSong.value) return;

    // 🟢 Seek 前：累计已播放时间并重置会话起点，避免 Seek 等待时间被计入
    if (State.isPlaying.value && sessionStartTime) {
      accumulatedTime += (Date.now() - sessionStartTime) / 1000;
      sessionStartTime = Date.now();
    }

    if (seekTimeout) clearTimeout(seekTimeout);
    isSeeking = true;
    stopTimer();
    let targetTime = Math.max(0, Math.min(newTime, State.currentSong.value.duration));
    reanchorPlaybackClock(targetTime);

    seekTimeout = setTimeout(async () => {
      const originalVolume = State.volume.value / 100.0;
      // 快速静音（避免 seek 时的爆音）
      await invoke('set_volume', { volume: 0.0 });
      await invoke('seek_audio', { time: Math.floor(targetTime), isPlaying: State.isPlaying.value });
      reanchorPlaybackClock(targetTime);
      // 🎵 简单的淡入效果（3 步，共 60ms）
      for (let i = 1; i <= 3; i++) {
        await new Promise(r => setTimeout(r, 20));
        await invoke('set_volume', { volume: (originalVolume * i) / 3 });
      }
      if (State.isPlaying.value) {
        startTimer();
      }
    }, 50); // 减少去抖动延迟
  }
  async function playAt(time: number) { await seekTo(time); if (!State.isPlaying.value) { setTimeout(async () => { if (!State.isPlaying.value) await togglePlay(); }, 150); } }
  async function handleSeek(e: MouseEvent) { if (!State.currentSong.value) return; const t = e.currentTarget as HTMLElement; const r = t.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); const tm = p * State.currentSong.value.duration; await seekTo(tm); }
  async function stepSeek(step: number) { if (!State.currentSong.value) return; await seekTo(State.currentTime.value + step); }
  async function toggleAlwaysOnTop(enable: boolean) { try { await getCurrentWindow().setAlwaysOnTop(enable); } catch (e) { console.error('Failed to set always on top:', e); } }
  function togglePlayerDetail() { State.showPlayerDetail.value = !State.showPlayerDetail.value; }
  function toggleQueue() { State.showQueue.value = !State.showQueue.value; }
  function openAddToPlaylistDialog(songPath: string) { State.playlistAddTargetSongs.value = [songPath]; State.showAddToPlaylistModal.value = true; }

  function init() {
    // 注册系统媒体控制事件监听
    listen('player:play', () => { if (!State.isPlaying.value) togglePlay(); });
    listen('player:pause', () => { if (State.isPlaying.value) togglePlay(); });
    listen('player:next', () => { nextSong(); });
    listen('player:prev', () => { prevSong(); });

    // 🟢 监听 seek_completed 事件，恢复同步
    listen<number>('seek_completed', (e) => {
      isSeeking = false;
      reanchorPlaybackClock(e.payload);
    });

    watch(State.volume, (v) => localStorage.setItem('player_volume', v.toString()));
    watch(State.playMode, (v) => localStorage.setItem('player_mode', v.toString()));
    watch(State.songList, (v) => localStorage.setItem('player_playlist', JSON.stringify(v)), { deep: true });
    watch(State.watchedFolders, (v) => localStorage.setItem('player_watched_folders', JSON.stringify(v)), { deep: true });
    watch(State.favoritePaths, (v) => localStorage.setItem('player_favorites', JSON.stringify(v)), { deep: true });
    watch(State.playlists, (v) => localStorage.setItem('player_custom_playlists', JSON.stringify(v)), { deep: true });
    watch(State.settings, (v) => localStorage.setItem('player_settings', JSON.stringify(v)), { deep: true });
    watch(State.recentSongs, (v) => localStorage.setItem('player_history', JSON.stringify(v)), { deep: true });

    // 🟢 持久化 playQueue
    watch(State.playQueue, (v) => localStorage.setItem('player_queue', JSON.stringify(v)), { deep: true });

    // 🟢 持久化排序状态
    watch(State.artistSortMode, (v) => localStorage.setItem('player_artist_sort_mode', v));
    watch(State.albumSortMode, (v) => localStorage.setItem('player_album_sort_mode', v));
    watch(State.artistCustomOrder, (v) => localStorage.setItem('player_artist_custom_order', JSON.stringify(v)), { deep: true });
    watch(State.albumCustomOrder, (v) => localStorage.setItem('player_album_custom_order', JSON.stringify(v)), { deep: true });
    watch(State.folderSortMode, (v) => localStorage.setItem('player_folder_sort_mode', v));
    watch(State.localSortMode, (v) => localStorage.setItem('player_local_sort_mode', v));
    watch(State.playlistSortMode, (v) => localStorage.setItem('player_playlist_sort_mode', v));
    watch(State.folderCustomOrder, (v) => localStorage.setItem('player_folder_custom_order', JSON.stringify(v)), { deep: true });
    watch(State.localCustomOrder, (v) => localStorage.setItem('player_local_custom_order', JSON.stringify(v)), { deep: true });

    watch(State.currentSong, (newSong) => {
      if (newSong) {
        localStorage.setItem('player_last_song', JSON.stringify(newSong));
      } else {
        localStorage.removeItem('player_last_song');
      }
    }, { deep: true });

    watch(State.currentCover, async (newCover) => {
      if (!newCover) return;

      const taskId = ++dominantColorTaskId;
      let url = newCover;
      if (!newCover.startsWith('http') && !newCover.startsWith('data:')) {
        url = convertFileSrc(newCover);
      }

      const colors = await extractDominantColors(url, 4);
      if (taskId !== dominantColorTaskId) return;
      State.dominantColors.value = colors;
    });

    watch(State.isPlaying, (playing) => {
      if (!playing) {
        localStorage.setItem('player_last_time', State.currentTime.value.toString());
      }
    });

    onMounted(async () => {
      // 🟢 性能优化：将持久化数据的读取放入 setTimeout，确保首屏 Skeleton 优先渲染
      setTimeout(async () => {
        const sVol = localStorage.getItem('player_volume'); if (sVol) { State.volume.value = parseInt(sVol); await invoke('set_volume', { volume: State.volume.value / 100.0 }); }
        const sFolders = localStorage.getItem('player_watched_folders'); if (sFolders) try { State.watchedFolders.value = JSON.parse(sFolders); } catch (e) { }
        const sList = localStorage.getItem('player_playlist'); if (sList) try { State.songList.value = JSON.parse(sList); } catch (e) { }
        const sFavs = localStorage.getItem('player_favorites'); if (sFavs) try { State.favoritePaths.value = JSON.parse(sFavs); } catch (e) { }
        const sPlaylists = localStorage.getItem('player_custom_playlists'); if (sPlaylists) try { State.playlists.value = JSON.parse(sPlaylists); } catch (e) { }

        // 🟢 读取排序状态
        const sArtistSort = localStorage.getItem('player_artist_sort_mode'); if (sArtistSort) State.artistSortMode.value = sArtistSort as any;
        const sAlbumSort = localStorage.getItem('player_album_sort_mode'); if (sAlbumSort) State.albumSortMode.value = sAlbumSort as any;
        const sArtistOrder = localStorage.getItem('player_artist_custom_order'); if (sArtistOrder) try { State.artistCustomOrder.value = JSON.parse(sArtistOrder); } catch (e) { }
        const sAlbumOrder = localStorage.getItem('player_album_custom_order'); if (sAlbumOrder) try { State.albumCustomOrder.value = JSON.parse(sAlbumOrder); } catch (e) { }
        const sFolderSort = localStorage.getItem('player_folder_sort_mode');
        if (sFolderSort && ['title', 'name', 'artist', 'added_at', 'custom'].includes(sFolderSort)) {
          State.folderSortMode.value = sFolderSort as any;
        }
        const sLocalSort = localStorage.getItem('player_local_sort_mode');
        if (sLocalSort && ['title', 'name', 'artist', 'added_at', 'custom', 'default'].includes(sLocalSort)) {
          State.localSortMode.value = sLocalSort as any;
        }
        const sPlaylistSort = localStorage.getItem('player_playlist_sort_mode');
        if (sPlaylistSort && ['title', 'name', 'artist', 'added_at', 'custom'].includes(sPlaylistSort)) {
          State.playlistSortMode.value = sPlaylistSort as any;
        }
        const sFolderOrder = localStorage.getItem('player_folder_custom_order');
        if (sFolderOrder) {
          try {
            const parsedOrder = JSON.parse(sFolderOrder);
            if (parsedOrder && typeof parsedOrder === 'object' && !Array.isArray(parsedOrder)) {
              State.folderCustomOrder.value = parsedOrder;
            }
          } catch (e) { }
        }
        const sLocalOrder = localStorage.getItem('player_local_custom_order');
        if (sLocalOrder) {
          try {
            const parsedOrder = JSON.parse(sLocalOrder);
            if (Array.isArray(parsedOrder)) {
              State.localCustomOrder.value = parsedOrder;
            }
          } catch (e) { }
        }

        const sSettings = localStorage.getItem('player_settings');
        if (sSettings) {
          try {
            const saved = JSON.parse(sSettings);
            // 确保 saved 是真实存在的对象 (排除 null)
            if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
              const savedTheme = (saved.theme && typeof saved.theme === 'object') ? saved.theme : {};
              const savedSidebar = (saved.sidebar && typeof saved.sidebar === 'object') ? saved.sidebar : {};
              const savedCustomBg = (savedTheme.customBackground && typeof savedTheme.customBackground === 'object') ? savedTheme.customBackground : {};

              // 迁移逻辑：将旧的 enableDynamicBg 转换为新的 dynamicBgType
              let dynamicBgType = savedTheme.dynamicBgType;
              if (dynamicBgType === undefined && savedTheme.enableDynamicBg !== undefined) {
                dynamicBgType = savedTheme.enableDynamicBg ? 'flow' : 'none';
              }

              const merged = {
                ...State.settings.value,
                ...saved,
                theme: {
                  ...State.settings.value.theme,
                  ...savedTheme,
                  dynamicBgType: dynamicBgType || State.settings.value.theme.dynamicBgType,
                  customBackground: {
                    ...State.settings.value.theme.customBackground,
                    ...savedCustomBg
                  }
                },
                sidebar: {
                  ...State.settings.value.sidebar,
                  ...savedSidebar
                }
              };
              State.settings.value = merged;
            }
          } catch (e) {
            console.error("Failed to parse settings:", e);
          }
        }

        const sHistory = localStorage.getItem('player_history'); if (sHistory) try { State.recentSongs.value = JSON.parse(sHistory); } catch (e) { }

        // 🟢 读取 playQueue
        const sQueue = localStorage.getItem('player_queue'); if (sQueue) try { State.playQueue.value = JSON.parse(sQueue); } catch (e) { }

        const lastSong = localStorage.getItem('player_last_song');
        if (lastSong) {
          try {
            const parsedSong = JSON.parse(lastSong);
            State.currentSong.value = parsedSong;
            if (parsedSong.path) {
              invoke<string>('get_song_cover', { path: parsedSong.path }).then(cover => State.currentCover.value = cover).catch(() => { });
            }
            State.isSongLoaded.value = false;
          } catch (e) { }
        }

        const lastTime = localStorage.getItem('player_last_time');
        if (lastTime) {
          State.currentTime.value = parseFloat(lastTime);
        }
      }, 50);

      window.addEventListener('beforeunload', () => {
        localStorage.setItem('player_last_time', State.currentTime.value.toString());
      });
    });
  }

  async function refreshAllFolders() {
    try {
      // 🟢 自动恢复逻辑：如果监控列表为空但有歌曲，尝试从现有歌曲中重建文件夹列表
      if (State.watchedFolders.value.length === 0 && State.songList.value.length > 0) {
        const potentialFolders = new Set<string>();
        State.songList.value.forEach(s => {
          // 简易逻辑：取父目录 (支持 Windows/Unix 分隔符)
          const parent = s.path.replace(/[/\\][^/\\]+$/, '');
          if (parent) potentialFolders.add(parent);
        });

        if (potentialFolders.size > 0) {
          State.watchedFolders.value = Array.from(potentialFolders);
          useToast().showToast(`已自动识别 ${potentialFolders.size} 个文件夹`, "success");
        }
      }

      if (State.watchedFolders.value.length === 0) {
        useToast().showToast("没有可刷新的文件夹", "info");
        return;
      }

      let allNewSongs: State.Song[] = [];
      for (const folder of State.watchedFolders.value) {
        const songs = await invoke<State.Song[]>('scan_music_folder', { folderPath: folder });
        allNewSongs.push(...songs);
      }

      const keptSongs = State.songList.value.filter(s => {
        return !State.watchedFolders.value.some(f => s.path.startsWith(f));
      });

      // 保持引用更新，Vue 的 computed 会自动重新计算排序
      State.songList.value = [...keptSongs, ...allNewSongs];
      useToast().showToast("所有歌曲已刷新", "success");
    } catch (e) {
      console.error("刷新失败:", e);
      useToast().showToast("刷新失败: " + e, "error");
    }
  }

  return {
    ...State,
    artistList, albumList, filteredArtistList, filteredAlbumList, genreList, yearList, folderList, favoriteSongList, favArtistList, favAlbumList, recentAlbumList, recentPlaylistList, displaySongList, isLocalMusic, isFolderMode,
    init, formatDuration, formatTimeAgo,
    // Library
    fetchLibraryFolders,
    addLibraryFolder,
    addLibraryFolderLinked,
    removeLibraryFolder,
    removeLibraryFolderLinked,
    scanLibrary,
    // Existing
    playSong,
    pauseSong,
    togglePlay, nextSong, prevSong, handleSeek, handleVolume, toggleMute, handleScan, toggleMode, togglePlaylist, toggleMiniPlaylist, closeMiniPlaylist,
    addFolder, addLibraryFolderPath, switchViewToAll, switchViewToFolder, switchToFolderView, switchToRecent, switchToFavorites, switchToStatistics, switchLocalTab, switchFavTab,
    removeFolder, addToHistory, clearHistory, clearLocalMusic, clearFavorites, addSongsToPlaylist, isFavorite, toggleFavorite,
    viewArtist, viewAlbum, viewGenre, viewYear, setSearch, createPlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, viewPlaylist,
    moveFile, generateOrganizedPath, playNext, removeSongFromList, openInFinder, deleteFromDisk,
    stepSeek, toggleAlwaysOnTop, togglePlayerDetail, seekTo, openAddToPlaylistDialog, playAt,
    addFoldersFromStructure, getSongsInFolder,
    moveFilesToFolder,
    refreshFolder,
    refreshAllFolders,
    // 🟢 导出新函数
    clearQueue, removeSongFromQueue, addSongToQueue, toggleQueue,
    addSongsToQueue, getSongsFromPlaylist,
    // Mini 模式
    isMiniMode: State.isMiniMode,
    showVolumePopover: State.showVolumePopover,
    reorderWatchedFolders: (from: number, to: number) => {
      const list = [...State.watchedFolders.value];
      const [removed] = list.splice(from, 1);
      list.splice(to, 0, removed);
      State.watchedFolders.value = list;
    },
    reorderPlaylists: (from: number, to: number) => {
      const list = [...State.playlists.value];
      const [removed] = list.splice(from, 1);
      list.splice(to, 0, removed);
      State.playlists.value = list;
    },
    updateArtistOrder: (newOrder: string[]) => {
      State.artistCustomOrder.value = newOrder;
      if (State.artistSortMode.value !== 'custom') State.artistSortMode.value = 'custom';
    },
    updateAlbumOrder: (newOrder: string[]) => {
      State.albumCustomOrder.value = newOrder;
      if (State.albumSortMode.value !== 'custom') State.albumSortMode.value = 'custom';
    }, // 🟢 comma added
    // 🟢 文件夹排序相关
    updateFolderOrder: (folderPath: string, newOrder: string[]) => {
      State.folderCustomOrder.value[folderPath] = newOrder;
      if (State.folderSortMode.value !== 'custom') State.folderSortMode.value = 'custom';
    },
    updateLocalOrder: (newOrder: string[]) => {
      State.localCustomOrder.value = newOrder;
      if (State.localSortMode.value !== 'custom') State.localSortMode.value = 'custom';
    },
    setFolderSortMode: (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom') => {
      State.folderSortMode.value = mode;
    },
    setLocalSortMode: (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom' | 'default') => {
      State.localSortMode.value = mode;
    },
    setPlaylistSortMode: (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom') => {
      State.playlistSortMode.value = mode;
    },

    // Sidebar (Decoupled)
    folderTree: State.folderTree,
    activeRootPath: State.activeRootPath,
    deleteFolder,
    moveFilePhysical, // 🟢 Export
    fetchFolderTree: fetchSidebarTree,
    addSidebarFolder,
    addSidebarFolderLinked,
    removeSidebarFolder,
    removeSidebarFolderLinked,

    // 🟢 导出排序状态
    folderSortMode: computed(() => State.folderSortMode.value),
    folderCustomOrder: computed(() => State.folderCustomOrder.value),
    localSortMode: computed(() => State.localSortMode.value),
    playlistSortMode: computed(() => State.playlistSortMode.value),
  };
}
