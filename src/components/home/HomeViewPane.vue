<script setup lang="ts">
import { computed } from 'vue';

import type { FolderNode } from '../../composables/playerState';
import type { Song } from '../../types';
import AlbumDetailHeader from '../headers/AlbumDetailHeader.vue';
import ArtistDetailHeader from '../headers/ArtistDetailHeader.vue';
import DetailHeader from '../headers/DetailHeader.vue';
import FoldersHeader from '../headers/FoldersHeader.vue';
import LocalMusicHeader from '../headers/LocalMusicHeader.vue';
import MasterPanel from '../song-list/MasterPanel.vue';
import SongTable from '../song-list/SongTable.vue';
import StatisticsPage from '../statistics/StatisticsPage.vue';

interface PlaylistDetail {
  name: string;
  date: string;
}

interface ArtistAlbumItem {
  key: string;
  name: string;
  count: number;
  artist: string;
  firstSongPath: string;
}

interface Props {
  viewTransitionKey: string;
  localViewMode: string;
  isBatchMode: boolean;
  isManagementMode: boolean;
  activeRootPath: string;
  selectedCount: number;
  folderTree: FolderNode[];
  currentFolderFilter: string;
  playlistDetail: PlaylistDetail | null;
  localSongList: Song[];
  artistActiveTab: 'songs' | 'albums' | 'details';
  localFilterCondition: string;
  selectedAlbumSong: Song | null;
  artistAlbumList: ArtistAlbumItem[];
  coverCache: Map<string, string>;
  loadingSet: Set<string>;
  selectedPaths: Set<string>;
  songTableRef: unknown;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (event: 'update:isBatchMode', value: boolean): void;
  (event: 'update:isManagementMode', value: boolean): void;
  (event: 'update:artistActiveTab', value: 'songs' | 'albums' | 'details'): void;
  (event: 'update:selectedPaths', value: Set<string>): void;
  (event: 'playAll'): void;
  (event: 'batchPlay'): void;
  (event: 'showAddToPlaylist'): void;
  (event: 'batchDelete'): void;
  (event: 'folderBatchDelete'): void;
  (event: 'batchMove'): void;
  (event: 'addFolder'): void;
  (event: 'refreshFolder'): void;
  (event: 'removeFolder'): void;
  (event: 'rootCreateFolder'): void;
  (event: 'rootDeleteFolder'): void;
  (event: 'activeRootChange', value: string): void;
  (event: 'renamePlaylist'): void;
  (event: 'refreshAll'): void;
  (event: 'playSong', song: Song): void;
  (event: 'contextMenuSong', nativeEvent: MouseEvent, song: Song): void;
  (event: 'tableDragStart', ...args: any[]): void;
  (event: 'artistAlbumClick', albumKey: string): void;
}>();

const isBatchModeModel = computed({
  get: () => props.isBatchMode,
  set: (value: boolean) => emit('update:isBatchMode', value),
});

const isManagementModeModel = computed({
  get: () => props.isManagementMode,
  set: (value: boolean) => emit('update:isManagementMode', value),
});

const artistActiveTabModel = computed({
  get: () => props.artistActiveTab,
  set: (value: 'songs' | 'albums' | 'details') => emit('update:artistActiveTab', value),
});
const songTableComponentRef = props.songTableRef as any;

const handleSongContextMenu = (...args: [MouseEvent, Song]) => {
  emit('contextMenuSong', args[0], args[1]);
};

const handleTableDragStart = (...args: any[]) => {
  emit('tableDragStart', ...args);
};
</script>

<template>
  <transition name="home-view-fade" mode="out-in">
    <div :key="viewTransitionKey" class="flex flex-1 flex-col min-h-0 min-w-0">
      <FoldersHeader
        v-if="localViewMode === 'folder'"
        v-model:isBatchMode="isBatchModeModel"
        :activeRootPath="activeRootPath"
        :selectedCount="selectedCount"
        :folderTree="folderTree"
        :currentFolderFilter="currentFolderFilter"
        @playAll="$emit('playAll')"
        @batchPlay="$emit('batchPlay')"
        @addToPlaylist="$emit('showAddToPlaylist')"
        @batchDelete="$emit('folderBatchDelete')"
        @batchMove="$emit('batchMove')"
        @addFolder="$emit('addFolder')"
        @refreshFolder="$emit('refreshFolder')"
        @removeFolder="$emit('removeFolder')"
        @newFolder="$emit('rootCreateFolder')"
        @deleteFolderDisk="$emit('rootDeleteFolder')"
        @update:activeRootPath="$emit('activeRootChange', $event)"
        v-model:isManagementMode="isManagementModeModel"
      />
      <DetailHeader
        v-else-if="localViewMode === 'playlist'"
        v-model:isBatchMode="isBatchModeModel"
        :title="playlistDetail?.name || ''"
        :subtitle="playlistDetail?.date ? `${playlistDetail.date} 鍒涘缓` : ''"
        :songs="localSongList"
        :selectedCount="selectedCount"
        :showRename="true"
        @playAll="$emit('playAll')"
        @batchPlay="$emit('batchPlay')"
        @addToPlaylist="$emit('showAddToPlaylist')"
        @batchDelete="$emit('batchDelete')"
        @rename="$emit('renamePlaylist')"
      />

      <LocalMusicHeader
        v-else-if="!['statistics', 'artist', 'album'].includes(localViewMode)"
        v-model:isBatchMode="isBatchModeModel"
        :selectedCount="selectedCount"
        @playAll="$emit('playAll')"
        @batchPlay="$emit('batchPlay')"
        @addToPlaylist="$emit('showAddToPlaylist')"
        @batchDelete="$emit('batchDelete')"
        @batchMove="$emit('batchMove')"
        @refreshAll="$emit('refreshAll')"
      />

      <div class="flex-1 flex overflow-hidden relative min-w-0">
        <MasterPanel
          v-if="localViewMode === 'folder'"
          :isManagementMode="isManagementMode"
        />

        <section class="flex-1 min-w-0 flex flex-col overflow-y-auto overflow-x-hidden custom-scrollbar relative">
          <ArtistDetailHeader
            v-if="localViewMode === 'artist'"
            v-model:isBatchMode="isBatchModeModel"
            v-model:activeTab="artistActiveTabModel"
            :artistName="localFilterCondition || '鏈煡姝屾墜'"
            :songs="localSongList"
            :selectedCount="selectedCount"
            @playAll="$emit('playAll')"
            @batchPlay="$emit('batchPlay')"
            @addToPlaylist="$emit('showAddToPlaylist')"
            @batchDelete="$emit('batchDelete')"
            @batchMove="$emit('batchMove')"
          />

          <AlbumDetailHeader
            v-else-if="localViewMode === 'album'"
            v-model:isBatchMode="isBatchModeModel"
            :albumName="selectedAlbumSong?.album || '鏈煡涓撹緫'"
            :albumArtist="selectedAlbumSong?.album_artist || selectedAlbumSong?.artist || '鏈煡姝屾墜'"
            :songs="localSongList"
            :selectedCount="selectedCount"
            @playAll="$emit('playAll')"
            @batchPlay="$emit('batchPlay')"
            @addToPlaylist="$emit('showAddToPlaylist')"
            @batchDelete="$emit('batchDelete')"
            @batchMove="$emit('batchMove')"
          />

          <StatisticsPage v-if="localViewMode === 'statistics'" />

          <section
            v-else-if="localViewMode === 'artist' && artistActiveTab === 'albums'"
            class="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 custom-scrollbar relative z-0"
          >
            <div
              v-if="artistAlbumList.length > 0"
              class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-6 gap-y-10"
            >
              <div
                v-for="album in artistAlbumList"
                :key="album.key"
                @click="$emit('artistAlbumClick', album.key)"
                class="group cursor-pointer rounded-xl p-2 md:p-3 transition-all duration-300 flex flex-col relative select-none hover:bg-white/40 dark:hover:bg-white/5"
              >
                <div class="relative w-full aspect-square mb-3 mt-4">
                  <div class="absolute inset-x-2 top-0 bottom-1/2 bg-[#1c1c1c] rounded-t-full shadow-inner origin-bottom translate-y-[-10%] group-hover:translate-y-[-24%] transition-transform duration-500 ease-out z-0 flex items-center justify-center overflow-hidden border border-[#333]">
                    <div class="absolute inset-0 rounded-t-full border border-white/5 scale-90"></div>
                    <div class="absolute inset-0 rounded-t-full border border-white/5 scale-75"></div>
                    <div class="absolute inset-0 rounded-t-full border border-white/5 scale-50"></div>
                  </div>

                  <div class="absolute inset-0 z-10 bg-white dark:bg-gray-800 rounded-md shadow-md border border-gray-100 dark:border-white/10 p-1 flex items-center justify-center overflow-hidden group-hover:shadow-xl transition-shadow duration-300">
                    <div
                      v-if="coverCache.get(album.firstSongPath)"
                      class="w-full h-full bg-cover bg-center rounded-sm"
                      :style="{ backgroundImage: `url(${coverCache.get(album.firstSongPath)})` }"
                    ></div>

                    <div
                      v-else
                      class="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-white/5 dark:to-white/10 rounded-sm flex items-center justify-center text-4xl font-bold text-gray-300 dark:text-gray-600 shadow-inner"
                      :class="{ 'animate-pulse': loadingSet.has(album.firstSongPath) }"
                    >
                      {{ album.name ? album.name.substring(0, 1).toUpperCase() : 'A' }}
                    </div>
                  </div>
                </div>

                <div class="flex flex-col items-start px-1 z-20">
                  <h3 class="font-bold text-sm md:text-base text-gray-800 dark:text-gray-200 truncate w-full group-hover:text-[#EC4141] transition-colors leading-tight">
                    {{ album.name }}
                  </h3>
                  <p class="text-xs text-gray-500 dark:text-gray-400 truncate w-full mt-1.5 flex items-center gap-1.5 opacity-80">
                    <span class="font-medium">{{ album.count }}棣?/span>
                    <span class="w-0.5 h-0.5 rounded-full bg-gray-400"></span>
                    <span>{{ album.artist }}</span>
                  </p>
                </div>
              </div>
            </div>

            <div v-else class="flex min-h-[400px] flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p class="text-sm">鏆傛棤涓撹緫鏁版嵁</p>
            </div>
          </section>

          <div v-else-if="localViewMode === 'artist' && artistActiveTab === 'details'" class="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 min-h-[400px]">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p class="text-sm">姝屾墜璇︽儏鏁鏈熷緟</p>
          </div>

          <SongTable
            v-else
            :ref="songTableComponentRef"
            :songs="localSongList"
            :isBatchMode="isBatchMode"
            :selectedPaths="selectedPaths"
            class="min-h-[500px]"
            @play="$emit('playSong', $event)"
            @contextmenu="handleSongContextMenu"
            @update:selectedPaths="$emit('update:selectedPaths', $event)"
            @drag-start="handleTableDragStart"
          />
        </section>
      </div>
    </div>
  </transition>
</template>
