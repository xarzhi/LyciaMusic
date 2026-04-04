import { onUnmounted, ref, watch, type Ref } from 'vue';

import type { Playlist } from '../types';

interface UseSidebarPlaylistCoversOptions {
  playlists: Ref<Playlist[]>;
  loadCover: (songPath: string) => Promise<string | null | undefined>;
}

export function useSidebarPlaylistCovers({
  playlists,
  loadCover,
}: UseSidebarPlaylistCoversOptions) {
  const playlistCoverCache = ref<Map<string, string>>(new Map());
  const playlistRealFirstSongMap = new Map<string, string>();
  let playlistCoverRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let playlistCoverRefreshIdleId: number | null = null;

  const updateCoverIfChanged = async (playlistId: string, firstSongPath: string) => {
    if (
      playlistRealFirstSongMap.get(playlistId) === firstSongPath &&
      playlistCoverCache.value.has(playlistId)
    ) {
      return;
    }

    playlistRealFirstSongMap.set(playlistId, firstSongPath);
    try {
      const assetUrl = await loadCover(firstSongPath);
      if (assetUrl) {
        playlistCoverCache.value.set(playlistId, assetUrl);
      } else {
        playlistCoverCache.value.delete(playlistId);
      }
    } catch {
      playlistCoverCache.value.delete(playlistId);
    }
  };

  const calculatePlaylistCovers = async () => {
    await Promise.all(
      playlists.value.map(async playlist => {
        if (playlist.songPaths.length > 0) {
          await updateCoverIfChanged(playlist.id, playlist.songPaths[0]);
          return;
        }

        if (playlistCoverCache.value.has(playlist.id)) {
          playlistCoverCache.value.delete(playlist.id);
          playlistRealFirstSongMap.delete(playlist.id);
        }
      }),
    );
  };

  const schedulePlaylistCoverRefresh = () => {
    if (playlistCoverRefreshTimer) {
      clearTimeout(playlistCoverRefreshTimer);
    }
    if (playlistCoverRefreshIdleId !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(playlistCoverRefreshIdleId);
      playlistCoverRefreshIdleId = null;
    }

    const runRefresh = () => {
      playlistCoverRefreshIdleId = null;
      playlistCoverRefreshTimer = null;
      void calculatePlaylistCovers();
    };

    if ('requestIdleCallback' in window) {
      playlistCoverRefreshIdleId = window.requestIdleCallback(runRefresh, { timeout: 500 });
      return;
    }

    playlistCoverRefreshTimer = setTimeout(runRefresh, 180);
  };

  watch(
    () =>
      playlists.value
        .map(playlist => `${playlist.id}:${playlist.songPaths[0] ?? ''}:${playlist.songPaths.length}`)
        .join('|'),
    () => {
      schedulePlaylistCoverRefresh();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    if (playlistCoverRefreshTimer) {
      clearTimeout(playlistCoverRefreshTimer);
    }
    if (playlistCoverRefreshIdleId !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(playlistCoverRefreshIdleId);
    }
  });

  return {
    playlistCoverCache,
  };
}
