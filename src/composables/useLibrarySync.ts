import type { ScanLibraryOptions } from './playerLibraryScan';

type ExternalPathSource = 'drop' | 'open';

interface HandleExternalPathsOptions {
  source?: ExternalPathSource;
}

interface UseLibrarySyncOptions {
  fetchLibraryFolders: () => Promise<unknown>;
  addLibraryFolder: () => Promise<unknown>;
  addLibraryFolderLinked: (
    path: string,
    options?: { syncLinked?: boolean; showToast?: boolean; scanOptions?: ScanLibraryOptions },
  ) => Promise<unknown>;
  removeLibraryFolder: (path: string) => Promise<unknown>;
  removeLibraryFolderLinked: (
    path: string,
    options?: { syncLinked?: boolean; showToast?: boolean },
  ) => Promise<unknown>;
  handleExternalPaths: (paths: string[], options?: HandleExternalPathsOptions) => Promise<void>;
  scanLibrary: (options?: ScanLibraryOptions) => Promise<unknown>;
  addLibraryFolderPath: (path: string) => Promise<unknown>;
  refreshFolder: (folderPath: string) => Promise<unknown>;
  refreshAllFolders: () => Promise<unknown>;
}

export function useLibrarySync({
  fetchLibraryFolders,
  addLibraryFolder,
  addLibraryFolderLinked,
  removeLibraryFolder,
  removeLibraryFolderLinked,
  handleExternalPaths,
  scanLibrary,
  addLibraryFolderPath,
  refreshFolder,
  refreshAllFolders,
}: UseLibrarySyncOptions) {
  return {
    fetchLibraryFolders,
    addLibraryFolder,
    addLibraryFolderLinked,
    removeLibraryFolder,
    removeLibraryFolderLinked,
    handleExternalPaths,
    scanLibrary,
    addLibraryFolderPath,
    refreshFolder,
    refreshAllFolders,
  };
}
