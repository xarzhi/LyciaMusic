import type { LibraryFolder } from '../../composables/playerState';
import { tauriInvoke } from './invoke';

export const libraryApi = {
  getLibraryFolders: () => tauriInvoke<LibraryFolder[]>('get_library_folders'),
  addLibraryFolder: (path: string) => tauriInvoke<void>('add_library_folder', { path }),
  addSidebarFolder: (path: string) => tauriInvoke<void>('add_sidebar_folder', { path }),
  removeLibraryFolder: (path: string) => tauriInvoke<void>('remove_library_folder', { path }),
  removeSidebarFolder: (path: string) => tauriInvoke<void>('remove_sidebar_folder', { path }),
};
