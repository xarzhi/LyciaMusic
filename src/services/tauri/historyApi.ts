import { tauriInvoke } from './invoke';

export const historyApi = {
  addToHistory: (songPath: string) =>
    tauriInvoke<void>('add_to_history', { songPath }),
  removeFromRecentHistory: (songPaths: string[]) =>
    tauriInvoke<void>('remove_from_recent_history', { songPaths }),
  clearRecentHistory: () =>
    tauriInvoke<void>('clear_recent_history'),
};
