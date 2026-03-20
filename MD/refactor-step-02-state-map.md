# Step 02 - State Map for `playerState.ts`

## Goal

This document inventories every exported runtime state in `src/composables/playerState.ts`
and prepares the migration path for the upcoming Pinia extraction.

The current problem is not only "many states exist", but also:

- `playerState.ts` is the real source of truth.
- `src/stores/library.ts` and `src/stores/navigation.ts` mostly proxy that global state.
- `src/composables/player.ts` re-exports almost everything and widens the coupling surface.
- persistence, runtime behavior, navigation, and transient UI flags are mixed together.

## Direct dependency hotspots

These files currently carry the heaviest direct coupling to `playerState.ts`:

- `src/composables/player.ts`
- `src/composables/playerLifecycle.ts`
- `src/composables/playerPlayback.ts`
- `src/composables/playerQueue.ts`
- `src/composables/playerLibraryRuntime.ts`
- `src/composables/playerHistoryFavorites.ts`
- `src/composables/playerFileManager.ts`
- `src/composables/playerFolderTree.ts`
- `src/composables/useLibraryBrowse.ts`
- `src/composables/useLibraryCollections.ts`
- `src/stores/library.ts`
- `src/stores/navigation.ts`

These files should be considered the first migration surface in Step 03.

## Domain map

### 1. Playback runtime state

| State | Current role | Primary writers | Primary readers | Persisted | Suggested target |
| --- | --- | --- | --- | --- | --- |
| `isPlaying` | playback running flag | `playerPlayback.ts`, `playerQueue.ts` | footer, detail player, lifecycle listeners | no | `usePlaybackStore` |
| `volume` | output volume in UI scale | `playerUiShell.ts`, lifecycle restore | footer, mini player, output sync | yes (`player_volume`) | `usePlaybackStore` |
| `currentTime` | current playback time | `playerPlayback.ts`, lifecycle restore | lyrics, progress UI, persistence | yes (`player_last_time`) | `usePlaybackStore` |
| `playMode` | sequential / loop / shuffle mode | `playerQueue.ts`, lifecycle restore | queue navigation, footer mode button | yes (`player_mode`) | `usePlaybackStore` |
| `isSongLoaded` | audio asset load flag | `playerPlayback.ts`, `playerRestore.ts` | playback guards | no | `usePlaybackStore` |
| `currentSong` | active song object | `playerPlayback.ts`, `playerQueue.ts`, `playerRestore.ts` | lyrics, footer, detail player, persistence | indirect (`player_last_song_path`) | `usePlaybackStore` |
| `currentCover` | active cover path | `playerPlayback.ts`, `playerRestore.ts` | background and detail views | no | `usePlaybackStore` |
| `dominantColors` | extracted cover palette | `playerLifecycle.ts` watcher | background visuals | no | `usePlaybackStore` or derived visual state |
| `AUDIO_DELAY` | lyrics sync offset mirror | `settings.ts` | `lyrics.ts` | derived from settings | remove duplicate, derive from `useSettingsStore` |
| `footerCoverEl` | DOM ref for footer cover element | footer component | shared transition logic | no | keep outside Pinia; local composable or provide/inject |

Notes:

- `AUDIO_DELAY` duplicates `settings.lyricsSyncOffset`.
- `footerCoverEl` is not application state and should never be moved into Pinia.

### 2. Queue and playback list state

| State | Current role | Primary writers | Primary readers | Persisted | Suggested target |
| --- | --- | --- | --- | --- | --- |
| `playQueue` | user-visible queue | `playerQueue.ts`, restore | footer, queue sidebar, next/prev logic | yes (`player_queue_paths`) | `usePlaybackStore` |
| `tempQueue` | shuffle / play-next staging queue | `playerQueue.ts` | queue navigation logic | no | `usePlaybackStore` |
| `songList` | overloaded runtime list; used as active list in multiple contexts | library batch, restore, file manager, UI shell, store proxy | browse logic, folder logic, playlist lookup, persistence | yes (`player_playlist_paths`) | split into canonical store data vs derived selectors |
| `playlistCover` | cover for current list context | `player.ts` watcher | headers and list visuals | no | derived state in browse/playback layer |

Notes:

- `songList` is one of the highest risk states in the whole file.
- It currently acts as both "active list backing state" and "lookup cache".
- It should not remain a free-floating mutable array after the migration.

### 3. Library data and scan state

| State | Current role | Primary writers | Primary readers | Persisted | Suggested target |
| --- | --- | --- | --- | --- | --- |
| `librarySongs` | canonical library dataset | `playerLibraryRuntime.ts`, `library.ts` | browse logic, lookups, album/artist grouping | cache loaded at startup, not written by front-end storage | `useLibraryStore` |
| `libraryFolders` | watched library folder records | library manager, `library.ts` | settings, scan runtime, linked folder operations | no front-end persistence; backend-owned | `useLibraryStore` |
| `folderTree` | sidebar tree structure | folder tree manager, file manager, `library.ts` | sidebar, folder management, browse logic | no | `useLibraryStore` |
| `originalSongList` | legacy backup list | `library.ts` | very limited usage | yes through generic state flush | remove or justify before migration |
| `libraryScanProgress` | current scan progress payload | runtime events, `player.ts`, `library.ts` | app shell, settings, scan notifications | no | `useLibraryStore` |
| `libraryScanSession` | current scan session metadata | scan runtime, `library.ts` | scan UI, completion logic | no | `useLibraryStore` |
| `lastLibraryScanError` | latest scan failure message | runtime, `player.ts`, `library.ts` | settings and scan feedback | no | `useLibraryStore` |
| `watchedFolders` | local ordered folder list | lifecycle restore, browse reorder, `library.ts` | settings, folder mode bootstrap | yes (`player_watched_folders`) | `useLibraryStore` |

Notes:

- `librarySongs` is the strongest candidate for the canonical music dataset.
- `folderTree` and `libraryFolders` belong to the same domain and should move together.
- `originalSongList` currently looks like migration debt and should be reviewed before being carried forward.

### 4. Collections state

| State | Current role | Primary writers | Primary readers | Persisted | Suggested target |
| --- | --- | --- | --- | --- | --- |
| `favoritePaths` | favorite song ids | lifecycle restore, `library.ts`, UI shell | browse filters, headers, favorite toggles | yes (`player_favorites`) | `useCollectionsStore` |
| `playlists` | custom playlists | lifecycle restore, `library.ts` | playlist view, sidebar, add-to-playlist flow | yes (`player_custom_playlists`) | `useCollectionsStore` |
| `recentSongs` | local recent history snapshot | restore, `library.ts`, history sync | recent page, derived recent playlists/albums | backend + legacy local recovery | `useCollectionsStore` |

Notes:

- `recentSongs` is already partially synced with backend history APIs.
- Keep one collection store, but move backend sync into actions, not direct state mutation from UI.

### 5. Sorting and custom order state

| State | Current role | Primary writers | Primary readers | Persisted | Suggested target |
| --- | --- | --- | --- | --- | --- |
| `artistSortMode` | artist list sort mode | lifecycle restore, browse actions | artist grouping logic | yes (`player_artist_sort_mode`) | `useLibraryStore` |
| `albumSortMode` | album list sort mode | lifecycle restore, browse actions | album grouping logic | yes (`player_album_sort_mode`) | `useLibraryStore` |
| `folderSortMode` | folder view sort mode | lifecycle restore, player/view actions | folder view list building | yes (`player_folder_sort_mode`) | `useLibraryStore` or `useNavigationStore` |
| `localSortMode` | local library list sort mode | lifecycle restore, player/view actions | "all", favorites, recent views | yes (`player_local_sort_mode`) | `useLibraryStore` or `useNavigationStore` |
| `playlistSortMode` | playlist sort mode | lifecycle restore, player/view actions | playlist list building | yes (`player_playlist_sort_mode`) | `useCollectionsStore` |
| `artistCustomOrder` | manual artist order | lifecycle restore, browse actions | artist list sort logic | yes (`player_artist_custom_order`) | `useLibraryStore` |
| `albumCustomOrder` | manual album order | lifecycle restore, browse actions | album list sort logic | yes (`player_album_custom_order`) | `useLibraryStore` |
| `folderCustomOrder` | per-folder manual sort order | lifecycle restore, player/view actions | folder list sort logic | yes (`player_folder_custom_order`) | `useLibraryStore` |
| `localCustomOrder` | manual order for local list | lifecycle restore, player/view actions | local list sort logic | yes (`player_local_custom_order`) | `useLibraryStore` |

Notes:

- These states are persisted preferences, not transient UI flags.
- They should move with the domain they affect, not into a generic UI store.

### 6. Settings state

| State | Current role | Primary writers | Primary readers | Persisted | Suggested target |
| --- | --- | --- | --- | --- | --- |
| `settings` | application settings, theme, library linking, organize rules | lifecycle restore, `settings.ts`, settings UI | app shell, theme sync, file management, scan manager | yes (`player_settings`) | `useSettingsStore` |

Notes:

- `settings` is a real persisted domain store and should not live in a generic UI store.
- `settings.theme` and `settings.sidebar` can stay nested as long as writes are funneled through actions.

### 7. Navigation and filter state

| State | Current role | Primary writers | Primary readers | Persisted | Suggested target |
| --- | --- | --- | --- | --- | --- |
| `currentViewMode` | top-level page mode | `navigation.ts`, route sync | browse selectors, page containers | no | `useNavigationStore` |
| `filterCondition` | generic detail filter key | `navigation.ts`, route sync | album/artist/playlist detail selectors | no | `useNavigationStore` |
| `searchQuery` | active search text | `navigation.ts` | browse selectors | no | `useNavigationStore` |
| `localMusicTab` | local music grouping tab | `navigation.ts` | browse selectors | no | `useNavigationStore` |
| `currentArtistFilter` | active artist subgroup key | `navigation.ts` | browse selectors | no | `useNavigationStore` |
| `currentAlbumFilter` | active album subgroup key | `navigation.ts` | browse selectors | no | `useNavigationStore` |
| `currentFolderFilter` | active folder path | route sync, navigation actions | folder list building and folder header | no | `useNavigationStore` |
| `favTab` | favorites sub-tab | `navigation.ts` | favorites selectors | no | `useNavigationStore` |
| `favDetailFilter` | favorite detail selection | favorites page and related composables | favorites selectors | no | `useNavigationStore` |
| `recentTab` | recent page sub-tab | recent view logic | recent page | no | `useNavigationStore` |
| `activeRootPath` | active root folder in management mode | folder management, route sync | folder header and tree UI | no | `useNavigationStore` or `useUiStore` |

Notes:

- This whole group is runtime-only and should remain non-persisted unless a product decision changes that.
- `activeRootPath` sits between navigation and local UI; decide one owner and keep it there.

### 8. Transient UI state

| State | Current role | Primary writers | Primary readers | Persisted | Suggested target |
| --- | --- | --- | --- | --- | --- |
| `showPlaylist` | footer queue popover visibility | `playerUiShell.ts` | footer, queue panel | no | `useUiStore` |
| `showMiniPlaylist` | mini mode queue visibility | `playerUiShell.ts` | mini player | no | `useUiStore` |
| `showPlayerDetail` | detail panel visibility | `playerUiShell.ts` | app shell, detail panel | no | `useUiStore` |
| `showQueue` | queue sidebar visibility | `playerUiShell.ts` | queue sidebar | no | `useUiStore` |
| `isMiniMode` | mini mode window flag | window-specific composables | app shell and mini player | no | `useUiStore` or window store |
| `showVolumePopover` | volume popover visibility | footer interactions | app shell and footer | no | `useUiStore` |
| `dragSession` | cross-view drag/drop session state | drag composables and views | artists, albums, sidebar, song table | no | dedicated drag-drop composable or `useUiStore` |
| `showAddToPlaylistModal` | global add-to-playlist modal visibility | library collections and views | app shell, home, overlays | no | `useUiStore` |
| `playlistAddTargetSongs` | temporary target payload for add-to-playlist flow | library collections, views | add-to-playlist modal | no | `useUiStore` or local feature composable |

Notes:

- `dragSession` is feature-specific transient state. It should not stay in the global root store forever.
- `showAddToPlaylistModal` plus `playlistAddTargetSongs` can move together into a narrow feature store or composable.

## Migration classification

### Canonical domain state that should become Pinia-owned data

- playback runtime
- library data and scan state
- collections
- persisted sort preferences
- settings
- navigation runtime

### State that should stay outside Pinia

- `footerCoverEl`
- low-level DOM refs
- temporary async task ids
- one-off local component refs

### State that should be challenged before migration

- `songList`
- `originalSongList`
- `AUDIO_DELAY`
- `playlistCover`

These are either overloaded, duplicated, or derived.

## Proposed store split for Step 03

### `usePlaybackStore`

- `isPlaying`
- `volume`
- `currentTime`
- `playMode`
- `isSongLoaded`
- `currentSong`
- `currentCover`
- `dominantColors`
- `playQueue`
- `tempQueue`

### `useLibraryStore`

- `librarySongs`
- `libraryFolders`
- `folderTree`
- `libraryScanProgress`
- `libraryScanSession`
- `lastLibraryScanError`
- `watchedFolders`
- sort modes and custom orders tied to library/folder views

### `useCollectionsStore`

- `favoritePaths`
- `playlists`
- `recentSongs`
- `playlistSortMode`

### `useNavigationStore`

- `currentViewMode`
- `filterCondition`
- `searchQuery`
- `localMusicTab`
- `currentArtistFilter`
- `currentAlbumFilter`
- `currentFolderFilter`
- `favTab`
- `favDetailFilter`
- `recentTab`
- `activeRootPath`

### `useSettingsStore`

- `settings`
- derived lyrics offset selector replacing `AUDIO_DELAY`

### `useUiStore`

- `showPlaylist`
- `showMiniPlaylist`
- `showPlayerDetail`
- `showQueue`
- `isMiniMode`
- `showVolumePopover`
- `showAddToPlaylistModal`
- `playlistAddTargetSongs`

### Keep feature-local for now

- `dragSession`
- `footerCoverEl`
- other DOM refs

## Migration order inside Step 03

1. Move `settings` and navigation state first.
2. Move collections (`favoritePaths`, `playlists`, `recentSongs`).
3. Move library state (`librarySongs`, `folderTree`, scan status, watched folders).
4. Move playback runtime and queue state.
5. Replace UI flags with `useUiStore`.
6. Delete or redesign `songList`, `originalSongList`, and `AUDIO_DELAY`.

## Acceptance criteria for Step 02

- every exported state in `playerState.ts` has a domain owner
- every state is marked as persisted or runtime-only
- migration targets are defined before any Step 03 code changes start
- overloaded states are explicitly called out instead of being copied blindly
