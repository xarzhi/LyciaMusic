import { onMounted, onUnmounted, ref, type Ref } from 'vue';

import type { Playlist } from '../types';

interface DragSessionState {
  active: boolean;
  type: 'song' | 'playlist' | 'folder' | 'artist' | 'album';
  data: any;
}

interface UseSidebarPlaylistDragDropOptions {
  playlists: Ref<Playlist[]>;
  dragSession: DragSessionState;
  reorderPlaylists: (from: number, to: number) => void;
}

export function useSidebarPlaylistDragDrop({
  playlists,
  dragSession,
  reorderPlaylists,
}: UseSidebarPlaylistDragDropOptions) {
  const dragOverId = ref<string | null>(null);
  const dragPosition = ref<'top' | 'bottom' | null>(null);
  let mouseDownInfo: { x: number; y: number; index: number; playlist: Playlist } | null = null;

  const handleMouseDown = (event: MouseEvent, index: number, playlist: Playlist) => {
    if (event.button !== 0) return;
    mouseDownInfo = { x: event.clientX, y: event.clientY, index, playlist };
  };

  const handleGlobalMouseMove = (event: MouseEvent) => {
    if (!mouseDownInfo || dragSession.active) {
      return;
    }

    const dist = Math.sqrt(
      Math.pow(event.clientX - mouseDownInfo.x, 2) +
      Math.pow(event.clientY - mouseDownInfo.y, 2),
    );
    if (dist <= 5) {
      return;
    }

    dragSession.active = true;
    dragSession.type = 'playlist';
    dragSession.data = {
      index: mouseDownInfo.index,
      id: mouseDownInfo.playlist.id,
      name: mouseDownInfo.playlist.name,
    };
  };

  const handleGlobalMouseUp = () => {
    if (dragSession.active && dragSession.type === 'playlist' && dragOverId.value && mouseDownInfo) {
      const fromIndex = mouseDownInfo.index;
      const targetIndex = playlists.value.findIndex(playlist => playlist.id === dragOverId.value);

      if (targetIndex !== -1) {
        let toIndex = targetIndex;
        if (dragPosition.value === 'bottom') {
          toIndex += 1;
        }
        if (fromIndex < toIndex) {
          toIndex -= 1;
        }
        if (fromIndex !== toIndex) {
          reorderPlaylists(fromIndex, toIndex);
        }
      }
    }

    mouseDownInfo = null;
    if (dragSession.type === 'playlist') {
      dragSession.active = false;
      dragSession.type = 'song';
      dragSession.data = null;
      dragOverId.value = null;
      dragPosition.value = null;
    }
  };

  const handleItemMouseMove = (event: MouseEvent, playlistId: string) => {
    if (!(dragSession.active && dragSession.type === 'playlist')) {
      return;
    }

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    dragOverId.value = playlistId;
    dragPosition.value = event.clientY < midpoint ? 'top' : 'bottom';
  };

  onMounted(() => {
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
  });

  onUnmounted(() => {
    window.removeEventListener('mousemove', handleGlobalMouseMove);
    window.removeEventListener('mouseup', handleGlobalMouseUp);
  });

  return {
    dragOverId,
    dragPosition,
    handleMouseDown,
    handleItemMouseMove,
  };
}
