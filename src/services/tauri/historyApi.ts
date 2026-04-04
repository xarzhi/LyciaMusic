import { tauriInvoke } from './invoke';
import type { RecentHistoryImportRecord, RecentHistoryRecord } from './contracts';

export const historyApi = {
  addToHistory: (songPath: string) =>
    tauriInvoke('add_to_history', { songPath }),
  removeFromRecentHistory: (songPaths: string[]) =>
    tauriInvoke('remove_from_recent_history', { songPaths }),
  clearRecentHistory: () =>
    tauriInvoke('clear_recent_history'),
  getRecentHistory: (limit: number) =>
    tauriInvoke('get_recent_history', { limit }) as Promise<RecentHistoryRecord[]>,
  importRecentHistory: (entries: RecentHistoryImportRecord[]) =>
    tauriInvoke('import_recent_history', { entries }),
};
