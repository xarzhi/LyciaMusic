import { usePlayerService } from '../../composables/playerService';

export function useLibraryRuntimeActions() {
  const playerService = usePlayerService();

  return {
    addLibraryFolder: playerService.addLibraryFolder,
    addLibraryFolderLinked: playerService.addLibraryFolderLinked,
    addLibraryFolderPath: playerService.addLibraryFolderPath,
    removeLibraryFolder: playerService.removeLibraryFolder,
    removeLibraryFolderLinked: playerService.removeLibraryFolderLinked,
    removeLibraryFolderPath: playerService.removeLibraryFolderPath,
    scanLibrary: playerService.scanLibrary,
    refreshFolder: playerService.refreshFolder,
    refreshAllFolders: playerService.refreshAllFolders,
    fetchFolderTree: playerService.fetchFolderTree,
    createFolder: playerService.createFolder,
    deleteFolder: playerService.deleteFolder,
    expandFolderPath: playerService.expandFolderPath,
    moveFilesToFolder: playerService.moveFilesToFolder,
    deleteFromDisk: playerService.deleteFromDisk,
    openInFinder: playerService.openInFinder,
    getSongsInFolder: playerService.getSongsInFolder,
  };
}
