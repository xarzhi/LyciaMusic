import * as State from './playerState';

export interface ScanLibraryOptions {
  trigger?: State.LibraryScanTrigger;
  visibility?: State.LibraryScanVisibility;
  sourcePath?: string;
}

const LIBRARY_SCAN_VISIBILITY_PRIORITY: Record<State.LibraryScanVisibility, number> = {
  silent: 1,
  inline: 2,
  hero: 3,
};

export const resolveScanLibraryOptions = (
  options: ScanLibraryOptions = {},
): Required<ScanLibraryOptions> => ({
  trigger: options.trigger ?? 'manual-rescan',
  visibility: options.visibility ?? 'inline',
  sourcePath: options.sourcePath ?? '',
});

export const isLibraryScanActive = () =>
  !!State.libraryScanProgress.value
  && !State.libraryScanProgress.value.done
  && !State.libraryScanProgress.value.failed;

const shouldReplaceLibraryScanSession = (nextVisibility: State.LibraryScanVisibility) => {
  if (!State.libraryScanSession.value) {
    return true;
  }

  if (!isLibraryScanActive()) {
    return true;
  }

  const currentPriority = LIBRARY_SCAN_VISIBILITY_PRIORITY[State.libraryScanSession.value.visibility];
  const nextPriority = LIBRARY_SCAN_VISIBILITY_PRIORITY[nextVisibility];
  return nextPriority > currentPriority;
};

export const startLibraryScanSession = (options: Required<ScanLibraryOptions>) => {
  const nextSession: State.LibraryScanSession = {
    trigger: options.trigger,
    visibility: options.visibility,
    startedAt: Date.now(),
    hadLibraryFoldersAtStart: State.libraryFolders.value.length > 0,
    hadSongsAtStart: State.librarySongs.value.length > 0,
    sourcePath: options.sourcePath || undefined,
  };

  if (shouldReplaceLibraryScanSession(options.visibility)) {
    State.libraryScanSession.value = nextSession;
    return nextSession;
  }

  if (
    State.libraryScanSession.value
    && !State.libraryScanSession.value.sourcePath
    && nextSession.sourcePath
  ) {
    State.libraryScanSession.value = {
      ...State.libraryScanSession.value,
      sourcePath: nextSession.sourcePath,
    };
  }

  return State.libraryScanSession.value!;
};

export const beginLibraryScanProgress = (session: State.LibraryScanSession) => {
  State.libraryScanProgress.value = {
    phase: 'collecting',
    current: 0,
    total: 0,
    folder_path: session.sourcePath ?? '',
    folder_index: session.sourcePath ? 1 : 0,
    folder_total: Math.max(1, State.libraryFolders.value.length),
    message: null,
    done: false,
    failed: false,
  };
};

export const getLibraryAddScanOptions = (path: string): Required<ScanLibraryOptions> => {
  const isFirstImport = State.libraryFolders.value.length === 0 && State.librarySongs.value.length === 0;
  return {
    trigger: isFirstImport ? 'first-import' : 'folder-add',
    visibility: isFirstImport ? 'hero' : 'silent',
    sourcePath: path,
  };
};

export const finalizeLibraryScanProgress = (
  songs: State.Song[],
  failed = false,
  message?: string,
) => {
  const existing = State.libraryScanProgress.value;
  State.libraryScanProgress.value = {
    phase: failed ? 'error' : 'complete',
    current: songs.length,
    total: songs.length,
    folder_path: existing?.folder_path ?? State.libraryScanSession.value?.sourcePath ?? '',
    folder_index: existing?.folder_index ?? 0,
    folder_total: existing?.folder_total ?? Math.max(1, State.libraryFolders.value.length),
    message: message ?? (failed ? '扫描音乐库时出现问题' : `已完成扫描，共 ${songs.length} 首歌曲`),
    done: true,
    failed,
  };
};
