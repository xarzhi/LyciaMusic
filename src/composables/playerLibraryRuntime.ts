import { invoke } from '@tauri-apps/api/core';
import * as State from './playerState';
import {
  beginLibraryScanProgress,
  resolveScanLibraryOptions,
  startLibraryScanSession,
} from './playerLibraryScan';
import type { ScanLibraryOptions } from './playerLibraryScan';
import { useLibraryStore } from '../stores/library';

let hasBootstrappedLibrary = false;
let libraryBootstrapPromise: Promise<void> | null = null;
let libraryRefreshPromise: Promise<void> | null = null;
let libraryRefreshIdleId: number | null = null;
let libraryRefreshTimer: ReturnType<typeof setTimeout> | null = null;

interface CreatePlayerLibraryRuntimeDeps {
  fetchLibraryFolders: () => Promise<void>;
  flushBufferedLibraryScanBatch: () => void;
  refreshStateSongReferences: (fallbackSongs?: State.Song[]) => void;
  finalizeLibraryScanProgress: (
    songs: State.Song[],
    failed?: boolean,
    message?: string,
  ) => void;
  onSilentScanError: (message: string) => void;
}

export const createPlayerLibraryRuntime = ({
  fetchLibraryFolders,
  flushBufferedLibraryScanBatch,
  refreshStateSongReferences,
  finalizeLibraryScanProgress,
  onSilentScanError,
}: CreatePlayerLibraryRuntimeDeps) => {
  const libraryStore = useLibraryStore();

  const cancelScheduledLibraryRefresh = () => {
    if (libraryRefreshTimer) {
      clearTimeout(libraryRefreshTimer);
      libraryRefreshTimer = null;
    }
    if (libraryRefreshIdleId !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(libraryRefreshIdleId);
      libraryRefreshIdleId = null;
    }
  };

  const loadLibrarySongsFromCache = async () => {
    try {
      flushBufferedLibraryScanBatch();
      const songs = await invoke<State.Song[]>('get_library_songs_cached');
      libraryStore.setLibrarySongs(songs);
      refreshStateSongReferences(songs);
    } catch (error) {
      console.error('Failed to load cached library songs:', error);
    }
  };

  const scanLibrary = async (options: ScanLibraryOptions = {}) => {
    const resolvedOptions = resolveScanLibraryOptions(options);

    if (libraryRefreshPromise) {
      startLibraryScanSession(resolvedOptions);
      return libraryRefreshPromise;
    }

    cancelScheduledLibraryRefresh();

    if (libraryStore.libraryFolders.length === 0) {
      libraryStore.setLibraryScanSession(null);
      libraryStore.setLibraryScanProgress(null);
      libraryStore.setLastLibraryScanError(null);
      return Promise.resolve();
    }

    const session = startLibraryScanSession(resolvedOptions);
    beginLibraryScanProgress(session);
    libraryStore.setLastLibraryScanError(null);

    libraryRefreshPromise = (async () => {
      try {
        flushBufferedLibraryScanBatch();
        const songs = await invoke<State.Song[]>('scan_library');
        libraryStore.setLibrarySongs(songs);
        refreshStateSongReferences(songs);
        await fetchLibraryFolders();

        if (!libraryStore.libraryScanProgress?.done) {
          finalizeLibraryScanProgress(songs);
        }
      } catch (error) {
        console.error('Library scan failed:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        libraryStore.setLastLibraryScanError(errorMessage);
        finalizeLibraryScanProgress([], true, errorMessage || '扫描音乐库时出现问题');
        if (session.visibility === 'silent') {
          onSilentScanError(errorMessage);
        }
      } finally {
        libraryRefreshPromise = null;
      }
    })();

    return libraryRefreshPromise;
  };

  const scheduleLibraryRefresh = () => {
    if (libraryRefreshPromise || libraryRefreshIdleId !== null || libraryRefreshTimer) {
      return;
    }

    if (libraryStore.libraryFolders.length === 0) {
      return;
    }

    const scheduledSession = startLibraryScanSession({
      trigger: 'bootstrap',
      visibility: 'silent',
      sourcePath: '',
    });
    beginLibraryScanProgress(scheduledSession);

    const runRefresh = () => {
      libraryRefreshIdleId = null;
      libraryRefreshTimer = null;
      void scanLibrary({ trigger: 'bootstrap', visibility: 'silent' });
    };

    if ('requestIdleCallback' in window) {
      libraryRefreshIdleId = window.requestIdleCallback(runRefresh, { timeout: 400 });
      return;
    }

    libraryRefreshTimer = setTimeout(runRefresh, 220);
  };

  const bootstrapLibrary = async () => {
    if (hasBootstrappedLibrary) return;
    hasBootstrappedLibrary = true;

    if (!libraryBootstrapPromise) {
      libraryBootstrapPromise = (async () => {
        await Promise.all([
          loadLibrarySongsFromCache(),
          fetchLibraryFolders(),
        ]);
        scheduleLibraryRefresh();
      })();
    }

    await libraryBootstrapPromise;
  };

  return {
    bootstrapLibrary,
    loadLibrarySongsFromCache,
    scanLibrary,
    dispose: cancelScheduledLibraryRefresh,
  };
};
