import type { Song } from './playerState';

interface UseFileImportOptions {
  addFolder: () => Promise<unknown>;
  addFoldersFromStructure: () => Promise<unknown>;
  getSongsInFolder: (folderPath: string) => Song[];
  clearLocalMusic: () => void;
}

export function useFileImport({
  addFolder,
  addFoldersFromStructure,
  getSongsInFolder,
  clearLocalMusic,
}: UseFileImportOptions) {
  return {
    addFolder,
    addFoldersFromStructure,
    getSongsInFolder,
    clearLocalMusic,
  };
}
