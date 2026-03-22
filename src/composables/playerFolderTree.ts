import { open } from '@tauri-apps/plugin-dialog';
import { storeToRefs } from 'pinia';

import type { FolderNode } from '../types';
import { libraryApi } from '../services/tauri/libraryApi';
import { useLibraryStore } from '../stores/library';

interface CreatePlayerFolderTreeDeps {
  addLibraryFolderPath: (path: string) => Promise<void>;
  removeLibraryFolderPath: (path: string) => Promise<void>;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

const collectExpandedPaths = (nodes: FolderNode[], expanded = new Set<string>()) => {
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

const applyExpandedPaths = (nodes: FolderNode[], expandedPaths: Set<string>) => {
  for (const node of nodes) {
    node.is_expanded = expandedPaths.has(node.path);
    if (node.children.length > 0) {
      applyExpandedPaths(node.children, expandedPaths);
    }
  }
};

const expandTreeToPath = (nodes: FolderNode[], targetPath: string): boolean => {
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
  addLibraryFolderPath,
  removeLibraryFolderPath,
  showToast,
}: CreatePlayerFolderTreeDeps) => {
  const libraryStore = useLibraryStore();
  const { folderTree } = storeToRefs(libraryStore);

  const fetchFolderTree = async () => {
    try {
      const expandedPaths = collectExpandedPaths(folderTree.value);
      const tree = await libraryApi.getLibraryHierarchy();
      applyExpandedPaths(tree, expandedPaths);
      folderTree.value = tree;
    } catch (error) {
      console.error('Failed to fetch library folder tree:', error);
    }
  };

  const createFolder = async (parentPath: string, folderName: string) => {
    return libraryApi.createFolder(parentPath, folderName);
  };

  const addFolderTreeFolderLinked = async (
    path: string,
    options: { showToast?: boolean } = {},
  ) => {
    const { showToast: shouldShowToast = true } = options;
    await addLibraryFolderPath(path);

    if (shouldShowToast) {
      showToast('已将文件夹添加到音乐库', 'success');
    }
  };

  const removeFolderTreeFolderLinked = async (
    path: string,
    options: { showToast?: boolean } = {},
  ) => {
    const { showToast: shouldShowToast = true } = options;
    await removeLibraryFolderPath(path);

    if (shouldShowToast) {
      showToast('已从音乐库移除文件夹', 'success');
    }
  };

  const addFolderTreeFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择要添加到音乐库的目录',
      });

      if (!selected || typeof selected !== 'string') {
        return;
      }

      await addLibraryFolderPath(selected);
      showToast('已将文件夹添加到音乐库', 'success');
    } catch (error) {
      console.error('Failed to add library folder from folder tree:', error);
      showToast(`添加失败: ${error}`, 'error');
    }
  };

  const removeFolderTreeFolder = async (path: string) => {
    try {
      await removeLibraryFolderPath(path);
      showToast('已从音乐库移除文件夹', 'success');
    } catch (error) {
      console.error('Failed to remove library folder from folder tree:', error);
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
