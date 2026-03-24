import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  effectScope,
  nextTick,
  reactive,
  ref,
} from 'vue';
import type {
  LocationQuery,
  RouteLocationNormalizedLoaded,
  Router,
} from 'vue-router';

import type { FolderNode } from '../types';
import { useHomeRouteSync } from './useHomeRouteSync';
import { useHomeViewState } from './useHomeViewState';

const makeFolderNode = (
  path: string,
  overrides: Partial<FolderNode> = {},
): FolderNode => ({
  name: path.split('/').pop() || path,
  path,
  children: [],
  song_count: 0,
  cover_song_path: null,
  is_expanded: false,
  ...overrides,
});

const createRoute = (
  path: string,
  query: LocationQuery = {},
) => reactive({
  path,
  query,
}) as RouteLocationNormalizedLoaded;

describe('useHomeRouteSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates global folder state before a kept-alive home scope resumes', async () => {
    const route = createRoute('/artists');
    const router = {
      replace: vi.fn().mockResolvedValue(undefined),
    } as unknown as Router;

    const currentViewMode = ref('artist');
    const filterCondition = ref('Existing Artist');
    const currentFolderFilter = ref('');
    const activeRootPath = ref<string | null>(null);
    const folderTree = ref([
      makeFolderNode('/music/library'),
    ]);
    const searchQuery = ref('stale query');
    const isManagementMode = ref(false);

    const appShellScope = effectScope();
    appShellScope.run(() => {
      useHomeRouteSync({
        route,
        router,
        currentViewMode,
        filterCondition,
        currentFolderFilter,
        activeRootPath,
        folderTree,
        searchQuery,
      });
    });

    let homeState!: ReturnType<typeof useHomeViewState>;
    const homeScope = effectScope();
    homeScope.run(() => {
      homeState = useHomeViewState({
        currentViewMode,
        filterCondition,
        isManagementMode,
      });
    });

    expect(homeState.localViewMode.value).toBe('artist');

    homeScope.pause();
    Object.assign(route, {
      path: '/',
      query: {
        view: 'folder',
        folder: '/music/library/live',
      },
    });

    await nextTick();

    expect(currentViewMode.value).toBe('folder');
    expect(filterCondition.value).toBe('');
    expect(currentFolderFilter.value).toBe('/music/library/live');
    expect(activeRootPath.value).toBe('/music/library');
    expect(searchQuery.value).toBe('');
    expect(homeState.localViewMode.value).toBe('artist');
    expect(router.replace).not.toHaveBeenCalled();

    homeScope.resume();
    await nextTick();

    expect(homeState.localViewMode.value).toBe('folder');

    homeScope.stop();
    appShellScope.stop();
  });

  it('fills in the first root folder when folder view query omits the folder path', async () => {
    const route = createRoute('/', { view: 'folder' });
    const router = {
      replace: vi.fn().mockResolvedValue(undefined),
    } as unknown as Router;

    const currentViewMode = ref('all');
    const filterCondition = ref('');
    const currentFolderFilter = ref('');
    const activeRootPath = ref<string | null>(null);
    const folderTree = ref([
      makeFolderNode('/music/root-a'),
      makeFolderNode('/music/root-b'),
    ]);
    const searchQuery = ref('should clear');

    const scope = effectScope();
    scope.run(() => {
      useHomeRouteSync({
        route,
        router,
        currentViewMode,
        filterCondition,
        currentFolderFilter,
        activeRootPath,
        folderTree,
        searchQuery,
      });
    });

    await nextTick();

    expect(currentViewMode.value).toBe('folder');
    expect(currentFolderFilter.value).toBe('/music/root-a');
    expect(activeRootPath.value).toBe('/music/root-a');
    expect(searchQuery.value).toBe('');
    expect(router.replace).toHaveBeenCalledWith({
      path: '/',
      query: {
        view: 'folder',
        folder: '/music/root-a',
      },
    });

    scope.stop();
  });
});
