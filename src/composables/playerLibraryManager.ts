import { invoke } from '@tauri-apps/api/core';
import * as State from './playerState';
import { getLibraryAddScanOptions, resolveScanLibraryOptions } from './playerLibraryScan';
import type { ScanLibraryOptions } from './playerLibraryScan';

interface AppSettingsRef {
  value: {
    linkFoldersToLibrary: boolean;
  };
}

interface ProcessExternalPathsOptions {
  source?: 'drop' | 'open';
}

interface PlaySongOptions {
  preserveQueue?: boolean;
}

interface CreatePlayerLibraryManagerDeps {
  appSettings: AppSettingsRef;
  fetchSidebarTree: () => Promise<void>;
  scanLibrary: (options?: ScanLibraryOptions) => Promise<void>;
  playSong: (song: State.Song, options?: PlaySongOptions) => Promise<void>;
  dedupePaths: (paths: string[]) => string[];
  dedupeSongs: (songs: State.Song[]) => State.Song[];
  resetShuffleState: () => void;
}

export interface LinkLibraryFolderOptions {
  syncLinked?: boolean;
  scanOptions?: ScanLibraryOptions;
}

export interface LinkLibraryFolderResult {
  linkedSidebar: boolean;
  resolvedScanOptions: Required<ScanLibraryOptions>;
}

export interface UnlinkLibraryFolderOptions {
  syncLinked?: boolean;
}

export interface UnlinkLibraryFolderResult {
  removedSidebar: boolean;
}

export interface LinkSidebarFolderOptions {
  syncLinked?: boolean;
}

export interface LinkSidebarFolderResult {
  linkedLibrary: boolean;
}

export interface UnlinkSidebarFolderOptions {
  syncLinked?: boolean;
}

export interface UnlinkSidebarFolderResult {
  removedLibrary: boolean;
}

export interface ProcessExternalPathsResult {
  source: 'drop' | 'open';
  importedFolderCount: number;
  skippedFolderCount: number;
  playableSongs: State.Song[];
  ignoredFileCount: number;
}

export const createPlayerLibraryManager = ({
  appSettings,
  fetchSidebarTree,
  scanLibrary,
  playSong,
  dedupePaths,
  dedupeSongs,
  resetShuffleState,
}: CreatePlayerLibraryManagerDeps) => {
  const fetchLibraryFolders = async () => {
    try {
      const folders = await invoke<State.LibraryFolder[]>('get_library_folders');
      State.libraryFolders.value = folders;
    } catch (error) {
      console.error('Failed to fetch library folders:', error);
    }
  };

  const addLibraryFolderRecord = async (path: string, scanOptions?: ScanLibraryOptions) => {
    await invoke('add_library_folder', { path });
    await fetchLibraryFolders();
    await scanLibrary(scanOptions ?? getLibraryAddScanOptions(path));
  };

  const addSidebarFolderRecord = async (path: string) => {
    await invoke('add_sidebar_folder', { path });
    await invoke('scan_music_folder', { folderPath: path });
    await fetchSidebarTree();
  };

  const removeLibraryFolderRecord = async (path: string) => {
    await invoke('remove_library_folder', { path });
    await fetchLibraryFolders();
    await scanLibrary({ trigger: 'manual-rescan', visibility: 'inline' });
  };

  const removeSidebarFolderRecord = async (path: string) => {
    await invoke('remove_sidebar_folder', { path });
    await fetchSidebarTree();
  };

  const linkLibraryFolder = async (
    path: string,
    options: LinkLibraryFolderOptions = {},
  ): Promise<LinkLibraryFolderResult> => {
    const { syncLinked = true, scanOptions } = options;
    const resolvedScanOptions = resolveScanLibraryOptions(scanOptions ?? getLibraryAddScanOptions(path));

    await addLibraryFolderRecord(path, resolvedScanOptions);

    const linkedSidebar = syncLinked && appSettings.value.linkFoldersToLibrary;
    if (linkedSidebar) {
      await addSidebarFolderRecord(path);
    }

    return {
      linkedSidebar,
      resolvedScanOptions,
    };
  };

  const unlinkLibraryFolder = async (
    path: string,
    options: UnlinkLibraryFolderOptions = {},
  ): Promise<UnlinkLibraryFolderResult> => {
    const { syncLinked = true } = options;

    await removeLibraryFolderRecord(path);

    const removedSidebar = syncLinked && appSettings.value.linkFoldersToLibrary;
    if (removedSidebar) {
      await removeSidebarFolderRecord(path);
    }

    return { removedSidebar };
  };

  const linkSidebarFolder = async (
    path: string,
    options: LinkSidebarFolderOptions = {},
  ): Promise<LinkSidebarFolderResult> => {
    const { syncLinked = true } = options;

    await addSidebarFolderRecord(path);

    const linkedLibrary = syncLinked && appSettings.value.linkFoldersToLibrary;
    if (linkedLibrary) {
      await addLibraryFolderRecord(path);
    }

    return { linkedLibrary };
  };

  const unlinkSidebarFolder = async (
    path: string,
    options: UnlinkSidebarFolderOptions = {},
  ): Promise<UnlinkSidebarFolderResult> => {
    const { syncLinked = true } = options;

    await removeSidebarFolderRecord(path);

    const removedLibrary = syncLinked && appSettings.value.linkFoldersToLibrary;
    if (removedLibrary) {
      await removeLibraryFolderRecord(path);
    }

    return { removedLibrary };
  };

  const playExternalSongs = async (songs: State.Song[]) => {
    const queue = dedupeSongs(songs);
    if (queue.length === 0) return;

    State.playQueue.value = [...queue];
    State.tempQueue.value = [];
    resetShuffleState();

    await playSong(queue[0], { preserveQueue: true });
  };

  const processExternalPaths = async (
    paths: string[],
    options: ProcessExternalPathsOptions = {},
  ): Promise<ProcessExternalPathsResult> => {
    const source = options.source ?? 'drop';
    const uniquePaths = dedupePaths(paths);
    if (uniquePaths.length === 0) {
      return {
        source,
        importedFolderCount: 0,
        skippedFolderCount: 0,
        playableSongs: [],
        ignoredFileCount: 0,
      };
    }

    const pathKinds = await Promise.all(
      uniquePaths.map(async path => ({
        path,
        isDirectory: await invoke<boolean>('is_directory', { path }).catch(() => false),
      })),
    );

    const directoryPaths = pathKinds.filter(item => item.isDirectory).map(item => item.path);
    const filePaths = pathKinds.filter(item => !item.isDirectory).map(item => item.path);

    const existingLibraryPaths = new Set(State.libraryFolders.value.map(folder => folder.path));
    let importedFolderCount = 0;
    let skippedFolderCount = 0;

    for (const directoryPath of directoryPaths) {
      if (existingLibraryPaths.has(directoryPath)) {
        skippedFolderCount += 1;
        continue;
      }

      try {
        await linkLibraryFolder(directoryPath);
        importedFolderCount += 1;
      } catch (error) {
        console.error('Failed to import external folder:', directoryPath, error);
      }
    }

    const parsedSongs = filePaths.length > 0
      ? await invoke<State.Song[]>('parse_audio_files', { paths: filePaths }).catch(error => {
        console.error('Failed to parse external audio files:', error);
        return [];
      })
      : [];

    const playableSongs = dedupeSongs(parsedSongs);
    if (playableSongs.length > 0) {
      await playExternalSongs(playableSongs);
    }

    return {
      source,
      importedFolderCount,
      skippedFolderCount,
      playableSongs,
      ignoredFileCount: Math.max(0, filePaths.length - playableSongs.length),
    };
  };

  return {
    fetchLibraryFolders,
    addLibraryFolderRecord,
    addSidebarFolderRecord,
    removeLibraryFolderRecord,
    removeSidebarFolderRecord,
    linkLibraryFolder,
    unlinkLibraryFolder,
    linkSidebarFolder,
    unlinkSidebarFolder,
    processExternalPaths,
  };
};
