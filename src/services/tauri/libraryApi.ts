import type { FolderNode, LibraryFolder } from '../../composables/playerState';
import { tauriInvoke } from './invoke';

export const libraryApi = {
  getLibraryFolders: (): Promise<LibraryFolder[]> => tauriInvoke('get_library_folders'),
  addLibraryFolder: (path: string): Promise<void> => tauriInvoke('add_library_folder', { path }),
  addSidebarFolder: (path: string): Promise<void> => tauriInvoke('add_sidebar_folder', { path }),
  removeLibraryFolder: (path: string): Promise<void> => tauriInvoke('remove_library_folder', { path }),
  removeSidebarFolder: (path: string): Promise<void> => tauriInvoke('remove_sidebar_folder', { path }),
  getSidebarHierarchy: (): Promise<FolderNode[]> => tauriInvoke('get_sidebar_hierarchy'),
  createFolder: (parentPath: string, folderName: string) =>
    tauriInvoke('create_folder', { parentPath, folderName }),
  refreshFolderSongs: (folderPath: string) =>
    tauriInvoke('refresh_folder_songs', { folderPath }),
};
