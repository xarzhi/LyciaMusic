# Refactor Step 03: Entry Boundaries

## Goal

Freeze the legacy entrypoints so the current refactor can converge instead of drifting back toward mixed import styles.

This step does not remove compatibility files yet. It makes the new source of truth explicit and blocks new code from adding more legacy imports.

## Source of truth

- Shared stores:
  - `src/shared/stores/navigation.ts`
  - `src/shared/stores/ui.ts`
- Feature stores:
  - `src/features/library/store.ts`
  - `src/features/playback/store.ts`
  - `src/features/collections/store.ts`
  - `src/features/settings/store.ts`
- Feature APIs:
  - `src/features/library/*`
  - `src/features/playback/*`
  - `src/features/collections/*`
  - `src/features/settings/*`

## Compatibility-only entrypoints

The following paths stay in the repo only to avoid a hard cut during migration:

- `src/stores/*`
- `src/composables/settings.ts`
- `src/composables/useCollectionsActions.ts`
- `src/composables/useLibraryBrowse.ts`
- `src/composables/useLibraryCollections.ts`
- `src/composables/useLibraryRuntimeActions.ts`
- `src/composables/useLibrarySync.ts`
- `src/composables/usePlaybackActions.ts`
- `src/composables/usePlaybackController.ts`
- `src/composables/usePlayerLibraryView.ts`
- `src/composables/useSongTableLibraryState.ts`

These files are compatibility facades only. New feature work should not import through them.

## Import rules

- Use `src/shared/stores/*` for shared app state.
- Use `src/features/*/store` for feature-owned state.
- Use `src/features/*` APIs directly instead of the matching `src/composables/*` wrapper.
- Treat `src/stores/*` as deprecated.

## Naming rules for library data

Use the semantic names below in new code:

- `canonicalSongs`: indexed library catalog data
- `sourceSongs`: file-system-backed source snapshot
- `currentViewSongs`: final songs rendered for the active view

Avoid introducing new aliases like `songList`, `librarySongs`, or `displaySongList` in new code. Existing aliases remain temporarily for migration only.

## Enforcement

`eslint.config.js` now rejects new imports from the frozen legacy entrypoints above. If a file still needs one of those imports, treat it as migration work and move it toward the canonical source instead of adding another exception.

## Step 04 follow-up

`playerService` is now compatibility-only as well. The active composition root lives in `src/composables/playerCore.ts`.

- Feature modules should depend on domain slices from `usePlayerCore()`
- App shell code should depend on `usePlayerCore().appShellDomain` through `usePlayer()`
- `usePlayerService()` remains only as a compatibility facade for any leftover migration edges

## Step 05 follow-up

`src/features/library/usePlayerLibraryView.ts` is now a thin aggregation layer.

- Catalog selectors live in `useLibraryCatalogSelectors.ts`
- Folder selectors live in `useLibraryFolderSelectors.ts`
- Collection selectors live in `useLibraryCollectionSelectors.ts`
- Final song resolution lives in `useLibraryCurrentViewSongs.ts`

Add new library-derived state to the selector layer first, not back into the aggregate hook.

## Step 06 follow-up

Page files should stay as assembly-only entrypoints.

- `src/views/Home.vue` now delegates page setup to `src/composables/useHomePageModel.ts`
- `src/App.vue` now delegates root shell setup to `src/composables/useAppShell.ts`

When page logic grows, add or split page-level composables instead of expanding the `.vue` script blocks.
