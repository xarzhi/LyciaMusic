import { storeToRefs } from 'pinia';
import * as State from './playerState';
import { useNavigationStore } from '../stores/navigation';

export function usePlayerViewState() {
  const navigationStore = useNavigationStore();
  const navigationRefs = storeToRefs(navigationStore);

  const setFolderSortMode = (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom') => {
    State.folderSortMode.value = mode;
  };

  const setLocalSortMode = (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom' | 'default') => {
    State.localSortMode.value = mode;
  };

  const setPlaylistSortMode = (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom') => {
    State.playlistSortMode.value = mode;
  };

  return {
    ...navigationRefs,
    isMiniMode: State.isMiniMode,
    folderSortMode: State.folderSortMode,
    localSortMode: State.localSortMode,
    playlistSortMode: State.playlistSortMode,
    setSearch: navigationStore.setSearch,
    setFolderSortMode,
    setLocalSortMode,
    setPlaylistSortMode,
  };
}
