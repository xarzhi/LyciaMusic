import { storeToRefs } from 'pinia';
import { useCollectionsStore } from '../stores/collections';
import { useLibraryStore } from '../stores/library';
import { useNavigationStore } from '../stores/navigation';
import { useUiStore } from '../stores/ui';

export function usePlayerViewState() {
  const collectionsStore = useCollectionsStore();
  const libraryStore = useLibraryStore();
  const navigationStore = useNavigationStore();
  const uiStore = useUiStore();
  const collectionsRefs = storeToRefs(collectionsStore);
  const libraryRefs = storeToRefs(libraryStore);
  const navigationRefs = storeToRefs(navigationStore);
  const uiRefs = storeToRefs(uiStore);

  const setFolderSortMode = (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom') => {
    libraryRefs.folderSortMode.value = mode;
  };

  const setLocalSortMode = (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom' | 'default') => {
    libraryRefs.localSortMode.value = mode;
  };

  const setPlaylistSortMode = (mode: 'title' | 'name' | 'artist' | 'added_at' | 'custom') => {
    collectionsRefs.playlistSortMode.value = mode;
  };

  return {
    ...navigationRefs,
    isMiniMode: uiRefs.isMiniMode,
    folderSortMode: libraryRefs.folderSortMode,
    localSortMode: libraryRefs.localSortMode,
    playlistSortMode: collectionsRefs.playlistSortMode,
    setSearch: navigationStore.setSearch,
    setFolderSortMode,
    setLocalSortMode,
    setPlaylistSortMode,
  };
}
