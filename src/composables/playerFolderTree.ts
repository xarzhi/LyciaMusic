import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { storeToRefs } from 'pinia';

import * as State from './playerState';
import { useLibraryStore } from '../stores/library';

interface FolderTreeSettings {
  value: {
    linkFoldersToLibrary: boolean;
  };
}

interface CreatePlayerFolderTreeDeps {
  appSettings: FolderTreeSettings;
  addLibraryFolderPath: (path: string) => Promise<void>;
  linkFolderTreeToLibrary: (
    path: string,
    options?: { syncLinked?: boolean }
  ) => Promise<{ linkedLibrary: boolean }>;
  unlinkFolderTreeFromLibrary: (
    path: string,
    options?: { syncLinked?: boolean }
  ) => Promise<{ removedLibrary: boolean }>;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

const collectExpandedPaths = (nodes: State.FolderNode[], expanded = new Set<string>()) => {
  for (const node of nodes) {
    if (node.is_expanded) {
      expanded.add(node.path);
    }

    if (node.children.length > 0) {
      collectExpandedPaths(node.children, expanded);
    }
  }

  return expanded;
};

const applyExpandedPaths = (nodes: State.FolderNode[], expandedPaths: Set<string>) => {
  for (const node of nodes) {
    node.is_expanded = expandedPaths.has(node.path);
    if (node.children.length > 0) {
      applyExpandedPaths(node.children, expandedPaths);
    }
  }
};

const expandTreeToPath = (nodes: State.FolderNode[], targetPath: string): boolean => {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return true;
    }

    if (node.children.length > 0 && expandTreeToPath(node.children, targetPath)) {
      node.is_expanded = true;
      return true;
    }
  }

  return false;
};

export const createPlayerFolderTree = ({
  appSettings,
  addLibraryFolderPath,
  linkFolderTreeToLibrary,
  unlinkFolderTreeFromLibrary,
  showToast,
}: CreatePlayerFolderTreeDeps) => {
  const libraryStore = useLibraryStore();
  const { folderTree } = storeToRefs(libraryStore);

  const fetchFolderTree = async () => {
    try {
      const expandedPaths = collectExpandedPaths(folderTree.value);
      const tree = await invoke<State.FolderNode[]>('get_sidebar_hierarchy');
      applyExpandedPaths(tree, expandedPaths);
      folderTree.value = tree;
    } catch (error) {
      console.error('Failed to fetch folder tree:', error);
    }
  };

  const createFolder = async (parentPath: string, folderName: string) => {
    return invoke<string>('create_folder', { parentPath, folderName });
  };

  const addFolderTreeFolderLinked = async (
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean } = {}
  ) => {
    const { syncLinked = true, showToast: shouldShowToast = true } = options;
    const { linkedLibrary } = await linkFolderTreeToLibrary(path, { syncLinked });

    if (shouldShowToast) {
      showToast(
        linkedLibrary
          ? '已将文件夹加入左侧文件夹树，并同步关联到本地音乐库'
          : '已将文件夹加入左侧文件夹树',
        'success'
      );
    }
  };

  const removeFolderTreeFolderLinked = async (
    path: string,
    options: { syncLinked?: boolean; showToast?: boolean } = {}
  ) => {
    const { syncLinked = true, showToast: shouldShowToast = true } = options;
    const { removedLibrary } = await unlinkFolderTreeFromLibrary(path, { syncLinked });

    if (shouldShowToast) {
      showToast(
        removedLibrary
          ? '已从左侧文件夹树和本地音乐库同步移除文件夹'
          : '已从左侧文件夹树移除文件夹',
        'success'
      );
    }
  };

  const addFolderTreeFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择要加入左侧文件夹树的目录',
      });

      if (!selected || typeof selected !== 'string') {
        return;
      }

      const shouldLinkToLibrary = appSettings.value.linkFoldersToLibrary;
      await invoke('add_sidebar_folder', { path: selected });
      await invoke('scan_music_folder', { folderPath: selected });
      await fetchFolderTree();

      if (shouldLinkToLibrary) {
        await addLibraryFolderPath(selected);
        showToast('已将文件夹加入左侧文件夹树，并关联到本地音乐库', 'success');
        return;
      }

      showToast('已将文件夹加入左侧文件夹树', 'success');
    } catch (error) {
      console.error('Failed to add folder tree folder:', error);
      showToast(`添加失败: ${error}`, 'error');
    }
  };

  const removeFolderTreeFolder = async (path: string) => {
    try {
      await invoke('remove_sidebar_folder', { path });
      await fetchFolderTree();
      showToast('已从左侧文件夹树移除文件夹', 'success');
    } catch (error) {
      console.error('Failed to remove folder tree folder:', error);
    }
  };

  const expandFolderPath = (targetPath: string) => {
    expandTreeToPath(folderTree.value, targetPath);
  };

  return {
    fetchFolderTree,
    createFolder,
    addFolderTreeFolder,
    removeFolderTreeFolder,
    addFolderTreeFolderLinked,
    removeFolderTreeFolderLinked,
    expandFolderPath,
  };
};
