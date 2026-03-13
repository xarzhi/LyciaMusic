import { reactive } from 'vue';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

const coverCache = reactive(new Map<string, string>());
const loadingSet = reactive(new Set<string>());
const inFlightRequests = new Map<string, Promise<string>>();
const preloadQueue: string[] = [];
const queuedPaths = new Set<string>();

const PRELOAD_CONCURRENCY = 4;

const loadCoverInternal = (path: string): Promise<string> => {
  const existingRequest = inFlightRequests.get(path);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    loadingSet.add(path);
    try {
      const coverPath = await invoke<string>('get_song_cover_thumbnail', { path });
      const finalUrl = coverPath ? convertFileSrc(coverPath) : '';
      coverCache.set(path, finalUrl);
      return finalUrl;
    } catch {
      coverCache.set(path, '');
      return '';
    } finally {
      loadingSet.delete(path);
      inFlightRequests.delete(path);
    }
  })();

  inFlightRequests.set(path, request);
  return request;
};

const scheduleNextPreload = () => {
  while (loadingSet.size < PRELOAD_CONCURRENCY && preloadQueue.length > 0) {
    const path = preloadQueue.shift();
    if (!path) {
      continue;
    }

    queuedPaths.delete(path);

    if (coverCache.has(path) || loadingSet.has(path)) {
      continue;
    }

    void loadCoverInternal(path).finally(() => {
      scheduleNextPreload();
    });
  }
};

export function useCoverCache() {
  const loadCover = async (path: string | undefined): Promise<string | undefined> => {
    if (!path) {
      return undefined;
    }

    if (coverCache.has(path)) {
      return coverCache.get(path);
    }

    return loadCoverInternal(path);
  };

  const preloadCovers = (paths: string[]) => {
    for (const path of paths) {
      if (!path || coverCache.has(path) || loadingSet.has(path) || queuedPaths.has(path)) {
        continue;
      }

      queuedPaths.add(path);
      preloadQueue.push(path);
    }

    scheduleNextPreload();
  };

  return {
    coverCache,
    loadingSet,
    loadCover,
    preloadCovers,
  };
}
