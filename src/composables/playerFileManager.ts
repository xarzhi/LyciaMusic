import * as State from './playerState';
import { fileApi } from '../services/tauri/fileApi';

interface CreatePlayerFileManagerDeps {
  removeSidebarFolderLinked: (
    path: string,
    options?: { syncLinked?: boolean; showToast?: boolean }
  ) => Promise<void>;
  removeFromHistory: (songPaths: string[]) => Promise<void>;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

const removeNodeFromTree = (nodes: State.FolderNode[], targetPath: string): boolean => {
  for (let index = 0; index < nodes.length; index += 1) {
    if (nodes[index].path === targetPath) {
      nodes.splice(index, 1);
      return true;
    }

    if (nodes[index].children.length > 0 && removeNodeFromTree(nodes[index].children, targetPath)) {
      return true;
    }
  }

  return false;
};

const incrementNodeCount = (nodes: State.FolderNode[], targetPath: string): boolean => {
  for (let index = 0; index < nodes.length; index += 1) {
    if (nodes[index].path === targetPath) {
      nodes[index].song_count += 1;
      return true;
    }

    if (nodes[index].children.length > 0 && incrementNodeCount(nodes[index].children, targetPath)) {
      return true;
    }
  }

  return false;
};

const decrementNodeCount = (nodes: State.FolderNode[], targetPath: string): boolean => {
  for (let index = 0; index < nodes.length; index += 1) {
    if (nodes[index].path === targetPath) {
      if (nodes[index].song_count > 0) {
        nodes[index].song_count -= 1;
      }
      return true;
    }

    if (nodes[index].children.length > 0 && decrementNodeCount(nodes[index].children, targetPath)) {
      return true;
    }
  }

  return false;
};

const updateFolderCover = (
  nodes: State.FolderNode[],
  folderPath: string,
  newCoverSongPath: string | null
): boolean => {
  for (let index = 0; index < nodes.length; index += 1) {
    if (nodes[index].path === folderPath) {
      nodes[index].cover_song_path = newCoverSongPath;
      return true;
    }

    if (
      nodes[index].children.length > 0 &&
      updateFolderCover(nodes[index].children, folderPath, newCoverSongPath)
    ) {
      return true;
    }
  }

  return false;
};

const getParentFolder = (filePath: string): string => {
  const separator = filePath.includes('\\') ? '\\' : '/';
  const parts = filePath.split(separator);
  parts.pop();
  return parts.join(separator);
};

const findNode = (
  nodes: State.FolderNode[],
  targetPath: string
): State.FolderNode | null => {
  for (const node of nodes) {
    if (node.path === targetPath) return node;

    if (node.children.length > 0) {
      const found = findNode(node.children, targetPath);
      if (found) return found;
    }
  }

  return null;
};

const sanitizePathSegment = (value: string) => value.replace(/[<>:"/\\|?*]/g, '_').trim();

export const createPlayerFileManager = ({
  removeSidebarFolderLinked,
  removeFromHistory,
  showToast,
}: CreatePlayerFileManagerDeps) => {
  const deleteFolder = async (path: string) => {
    await fileApi.deleteFolder(path);

    const isRoot = State.folderTree.value.some(node => node.path === path);
    if (isRoot) {
      await removeSidebarFolderLinked(path, { showToast: false });
      return;
    }

    removeNodeFromTree(State.folderTree.value, path);
  };

  const moveFilePhysical = async (sourcePath: string, targetFolderPath: string) => {
    const sourceFolderPath = getParentFolder(sourcePath);
    const sourceNode = findNode(State.folderTree.value, sourceFolderPath);
    const wasSourceCover = sourceNode?.cover_song_path === sourcePath;

    await fileApi.moveFileToFolder(sourcePath, targetFolderPath);

    const songIndex = State.songList.value.findIndex(song => song.path === sourcePath);
    if (songIndex !== -1) {
      State.songList.value.splice(songIndex, 1);
    }

    decrementNodeCount(State.folderTree.value, sourceFolderPath);

    if (wasSourceCover) {
      try {
        const newCoverPath = await fileApi.getFolderFirstSong(sourceFolderPath);
        updateFolderCover(State.folderTree.value, sourceFolderPath, newCoverPath);
      } catch {
        updateFolderCover(State.folderTree.value, sourceFolderPath, null);
      }
    }

    incrementNodeCount(State.folderTree.value, targetFolderPath);

    try {
      const targetCoverPath = await fileApi.getFolderFirstSong(targetFolderPath);
      updateFolderCover(State.folderTree.value, targetFolderPath, targetCoverPath);
    } catch {
      updateFolderCover(State.folderTree.value, targetFolderPath, null);
    }
  };

  const moveFilesToFolder = async (paths: string[], targetFolder: string) => {
    const sourceFolderMap = new Map<string, { count: number; coverPaths: string[] }>();

    paths.forEach(oldPath => {
      const sourceFolder = getParentFolder(oldPath);
      if (!sourceFolderMap.has(sourceFolder)) {
        const node = findNode(State.folderTree.value, sourceFolder);
        sourceFolderMap.set(sourceFolder, {
          count: 0,
          coverPaths: node?.cover_song_path === oldPath ? [oldPath] : [],
        });
      }

      const entry = sourceFolderMap.get(sourceFolder)!;
      entry.count += 1;

      const node = findNode(State.folderTree.value, sourceFolder);
      if (node?.cover_song_path === oldPath && !entry.coverPaths.includes(oldPath)) {
        entry.coverPaths.push(oldPath);
      }
    });

    const movedCount = await fileApi.batchMoveMusicFiles(paths, targetFolder);

    paths.forEach(oldPath => {
      const songIndex = State.songList.value.findIndex(song => song.path === oldPath);
      if (songIndex !== -1) {
        State.songList.value.splice(songIndex, 1);
      }
    });

    for (const [sourceFolder, entry] of sourceFolderMap) {
      for (let index = 0; index < entry.count; index += 1) {
        decrementNodeCount(State.folderTree.value, sourceFolder);
      }

      if (entry.coverPaths.length > 0) {
        try {
          const newCoverPath = await fileApi.getFolderFirstSong(sourceFolder);
          updateFolderCover(State.folderTree.value, sourceFolder, newCoverPath);
        } catch {
          updateFolderCover(State.folderTree.value, sourceFolder, null);
        }
      }
    }

    for (let index = 0; index < movedCount; index += 1) {
      incrementNodeCount(State.folderTree.value, targetFolder);
    }

    try {
      const targetCoverPath = await fileApi.getFolderFirstSong(targetFolder);
      updateFolderCover(State.folderTree.value, targetFolder, targetCoverPath);
    } catch {
      updateFolderCover(State.folderTree.value, targetFolder, null);
    }

    return movedCount;
  };

  const refreshFolder = async (folderPath: string) => {
    const newSongs = await fileApi.scanMusicFolder(folderPath);
    const otherSongs = State.songList.value.filter(song => !song.path.startsWith(folderPath));
    State.songList.value = [...otherSongs, ...newSongs];
  };

  const removeFolder = (folderPath: string) => {
    State.watchedFolders.value = State.watchedFolders.value.filter(path => path !== folderPath);

    if (State.currentFolderFilter.value === folderPath) {
      State.currentFolderFilter.value =
        State.watchedFolders.value.length > 0 ? State.watchedFolders.value[0] : '';
    }
  };

  const generateOrganizedPath = (song: State.Song): string => {
    const root = State.settings.value.organizeRoot || 'D:\\Music';
    if (!State.settings.value.enableAutoOrganize) return '';

    const separator = root.includes('/') ? '/' : '\\';
    const artist = sanitizePathSegment(
      song.artist && song.artist !== 'Unknown' ? song.artist : 'Unknown Artist'
    );
    const album = sanitizePathSegment(
      song.album && song.album !== 'Unknown' ? song.album : 'Unknown Album'
    );
    const title = sanitizePathSegment(song.title || song.name);
    const year = sanitizePathSegment(song.year ? song.year.substring(0, 4) : '0000');

    let relativePath = State.settings.value.organizeRule
      .replace('{Artist}', artist)
      .replace('{Album}', album)
      .replace('{Title}', title)
      .replace('{Year}', year);

    relativePath = relativePath.replace(/\/\//g, '/').replace(/\\\\/g, '\\');
    return `${root}${separator}${relativePath}`;
  };

  const moveFile = async (song: State.Song, newPath: string) => {
    try {
      await fileApi.moveMusicFile(song.path, newPath);

      const oldPath = song.path;
      const targetSong = State.songList.value.find(item => item.path === oldPath);
      if (targetSong) {
        targetSong.path = newPath;
      }

      if (State.currentSong.value?.path === oldPath) {
        State.currentSong.value.path = newPath;
      }

      State.playlists.value.forEach(playlist => {
        const songIndex = playlist.songPaths.indexOf(oldPath);
        if (songIndex !== -1) {
          playlist.songPaths[songIndex] = newPath;
        }
      });

      const favoriteIndex = State.favoritePaths.value.indexOf(oldPath);
      if (favoriteIndex !== -1) {
        State.favoritePaths.value[favoriteIndex] = newPath;
      }

      return true;
    } catch (error) {
      showToast(`整理失败: ${error}`, 'error');
      return false;
    }
  };

  const openInFinder = async (path: string) => {
    await fileApi.showInFolder(path);
  };

  const deleteFromDisk = async (song: State.Song) => {
    try {
      await fileApi.deleteMusicFile(song.path);
      State.songList.value = State.songList.value.filter(item => item.path !== song.path);
      State.favoritePaths.value = State.favoritePaths.value.filter(path => path !== song.path);
      await removeFromHistory([song.path]);
      State.playlists.value.forEach(playlist => {
        playlist.songPaths = playlist.songPaths.filter(path => path !== song.path);
      });
    } catch (error) {
      showToast(`删除失败: ${error}`, 'error');
    }
  };

  const refreshAllFolders = async () => {
    try {
      if (State.watchedFolders.value.length === 0 && State.songList.value.length > 0) {
        const potentialFolders = new Set<string>();
        State.songList.value.forEach(song => {
          const parent = song.path.replace(/[/\\][^/\\]+$/, '');
          if (parent) {
            potentialFolders.add(parent);
          }
        });

        if (potentialFolders.size > 0) {
          State.watchedFolders.value = Array.from(potentialFolders);
          showToast(`已恢复 ${potentialFolders.size} 个文件夹`, 'success');
        }
      }

      if (State.watchedFolders.value.length === 0) {
        showToast('没有可刷新的文件夹', 'info');
        return;
      }

      let allNewSongs: State.Song[] = [];
      for (const folder of State.watchedFolders.value) {
        const songs = await fileApi.scanMusicFolder(folder);
        allNewSongs = allNewSongs.concat(songs);
      }

      const keptSongs = State.songList.value.filter(song => {
        return !State.watchedFolders.value.some(folder => song.path.startsWith(folder));
      });

      State.songList.value = [...keptSongs, ...allNewSongs];
      showToast('已刷新所有文件夹', 'success');
    } catch (error) {
      console.error('刷新文件夹失败:', error);
      showToast(`刷新失败: ${error}`, 'error');
    }
  };

  return {
    deleteFolder,
    moveFilePhysical,
    moveFilesToFolder,
    refreshFolder,
    removeFolder,
    generateOrganizedPath,
    moveFile,
    openInFinder,
    deleteFromDisk,
    refreshAllFolders,
  };
};
