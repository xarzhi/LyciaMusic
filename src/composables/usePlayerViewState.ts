import { storeToRefs } from 'pinia';
import * as State from './playerPreferencesState';
import { useNavigationStore } from '../stores/navigation';
import { useUiStore } from '../stores/ui';

export function usePlayerViewState() {
  const navigationStore = useNavigationStore();
  const uiStore = useUiStore();
  const navigationRefs = storeToRefs(navigationStore);
  const uiRefs = storeToRefs(uiStore);

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
    isMiniMode: uiRefs.isMiniMode,
    folderSortMode: State.folderSortMode,
    localSortMode: State.localSortMode,
    playlistSortMode: State.playlistSortMode,
    setSearch: navigationStore.setSearch,
    setFolderSortMode,
    setLocalSortMode,
    setPlaylistSortMode,
  };
}
