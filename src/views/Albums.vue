<script setup lang="ts">
import { dragSession } from '../composables/dragState';
import { useLibraryBrowse } from '../features/library/useLibraryBrowse';
import { useRouter } from 'vue-router';
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useHomeNavigation } from '../composables/useHomeNavigation';

const { filteredAlbumList, albumSortMode, updateAlbumOrder, searchQuery } = useLibraryBrowse();
const router = useRouter();
const { openHomeAlbum } = useHomeNavigation(router);
const isSearchActive = computed(() => searchQuery.value.trim().length > 0);

import { useCoverCache } from '../composables/useCoverCache';

// 封面图片加载状态管理
const { coverCache, loadingSet, preloadCovers } = useCoverCache();

watch(() => filteredAlbumList.value, (newList) => {
  const paths = newList.map((a: any) => a.firstSongPath).filter(Boolean);
  preloadCovers(paths);
}, { immediate: true });

const showSortMenu = ref(false);
const dragOverKey = ref<string | null>(null);

const handleAlbumClick = (albumKey: string) => {
  void openHomeAlbum(albumKey);
};

const handleSortChange = (mode: 'count' | 'name' | 'artist' | 'custom') => {
  albumSortMode.value = mode;
  showSortMenu.value = false;
};

// --- Custom Drag & Drop for Albums ---
let mouseDownInfo: { x: number, y: number, index: number, album: any } | null = null;

const handleMouseDown = (e: MouseEvent, index: number, album: any) => {
  if (isSearchActive.value) return;
  if (e.button !== 0) return;
  mouseDownInfo = { x: e.clientX, y: e.clientY, index, album };
};

const handleGlobalMouseMove = (e: MouseEvent) => {
  if (mouseDownInfo && !dragSession.active) {
    const dist = Math.sqrt(Math.pow(e.clientX - mouseDownInfo.x, 2) + Math.pow(e.clientY - mouseDownInfo.y, 2));
    if (dist > 5) {
      dragSession.active = true;
      dragSession.type = 'album';
      dragSession.data = { index: mouseDownInfo.index, key: mouseDownInfo.album.key };
    }
  }
};

const handleGlobalMouseUp = () => {
  if (dragSession.active && dragSession.type === 'album') {
    if (dragOverKey.value && mouseDownInfo) {
      const fromIndex = mouseDownInfo.index;
      const toIndex = filteredAlbumList.value.findIndex(a => a.key === dragOverKey.value);
      
      if (toIndex !== -1 && fromIndex !== toIndex) {
        const list = [...filteredAlbumList.value];
        const [removed] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, removed);
        
        const newOrder = list.map(a => a.key);
        updateAlbumOrder(newOrder);
      }
    }
  }
  
  // Reset
  mouseDownInfo = null;
  if (dragSession.type === 'album') {
     dragSession.active = false;
     dragSession.type = 'song';
     dragSession.data = null;
     dragOverKey.value = null;
  }
};

const handleItemMouseMove = (_e: MouseEvent, albumKey: string) => {
  if (dragSession.active && dragSession.type === 'album') {
    dragOverKey.value = albumKey;
  }
};

onMounted(() => {
  window.addEventListener('mousemove', handleGlobalMouseMove);
  window.addEventListener('mouseup', handleGlobalMouseUp);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleGlobalMouseMove);
  window.removeEventListener('mouseup', handleGlobalMouseUp);
});
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden bg-transparent h-full min-h-0" @click="showSortMenu = false">
    <!-- Header: 像素级对齐 LocalMusicHeader -->
    <header class="h-auto px-6 pt-2 pb-3 shrink-0 select-none flex flex-col justify-center z-10 relative">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 pb-1">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">专辑列表</h2>
        </div>
        
        <!-- Sort Menu -->
        <div class="relative z-50 flex items-center gap-2">
          <button @click.stop="showSortMenu = !showSortMenu" 
            class="bg-white/1 hover:bg-white/10 border border-white/1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-full transition active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20" 
            title="排序方式">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
          </button>
        
        <div v-if="showSortMenu" class="absolute right-0 top-full mt-2 w-48 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-right">
          <div class="py-1">
            <button @click="handleSortChange('artist')" class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-between" :class="albumSortMode === 'artist' ? 'text-[#EC4141] font-medium' : 'text-gray-700 dark:text-gray-200'">
              <span>按专辑艺人排序</span>
              <svg v-if="albumSortMode === 'artist'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
            </button>
            <button @click="handleSortChange('name')" class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-between" :class="albumSortMode === 'name' ? 'text-[#EC4141] font-medium' : 'text-gray-700 dark:text-gray-200'">
              <span>按名称排序 (A-Z)</span>
              <svg v-if="albumSortMode === 'name'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
            </button>
            <button @click="handleSortChange('count')" class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-between" :class="albumSortMode === 'count' ? 'text-[#EC4141] font-medium' : 'text-gray-700 dark:text-gray-200'">
              <span>按数量排序 (多->少)</span>
              <svg v-if="albumSortMode === 'count'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
            </button>
            <button class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-between cursor-default" :class="albumSortMode === 'custom' ? 'text-[#EC4141] font-medium' : 'text-gray-700 dark:text-gray-200'">
              <span>自定义排序 (拖拽触发)</span>
              <svg v-if="albumSortMode === 'custom'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <section class="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 custom-scrollbar relative z-0">
      <!-- 增加响应式 breakpoint 控制每行显示个数，由 2 列扩增至 7 列 -->
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-6 gap-y-10">
        <div 
          v-for="(album, index) in filteredAlbumList" 
          :key="album.key"
          @mousedown="handleMouseDown($event, index, album)"
          @mousemove="handleItemMouseMove($event, album.key)"
          @click="handleAlbumClick(album.key)"
          class="group cursor-pointer rounded-xl p-2 md:p-3 transition-all duration-300 flex flex-col relative select-none hover:bg-white/40 dark:hover:bg-white/5"
          :class="[
            (dragSession.active && dragSession.type === 'album' && dragSession.data?.key === album.key) ? 'opacity-50' : '',
            {'ring-2 ring-[#EC4141] bg-red-50 dark:bg-red-900/20': dragSession.active && dragSession.type === 'album' && dragOverKey === album.key && dragSession.data?.key !== album.key}
          ]"
        >
          <!-- 专辑盒子 (Wrapper) 含有 CD 和封面 -->
          <div class="relative w-full aspect-square mb-3 mt-4">
             <!-- 黑胶光盘 (Vinyl Background) : Hover时向上层抽出 -->
             <div class="absolute inset-x-2 top-0 bottom-1/2 bg-[#1c1c1c] rounded-t-full shadow-inner origin-bottom translate-y-[-10%] group-hover:translate-y-[-24%] transition-transform duration-500 ease-out z-0 flex items-center justify-center overflow-hidden border border-[#333]">
                <!-- 模拟光盘纹理 -->
                <div class="absolute inset-0 rounded-t-full border border-white/5 scale-90"></div>
                <div class="absolute inset-0 rounded-t-full border border-white/5 scale-75"></div>
                <div class="absolute inset-0 rounded-t-full border border-white/5 scale-50"></div>
             </div>

             <!-- 专辑封套 Sleeve (带有阴影和白边) -->
             <div class="absolute inset-0 z-10 bg-white dark:bg-gray-800 rounded-md shadow-md border border-gray-100 dark:border-white/10 p-1 flex items-center justify-center overflow-hidden group-hover:shadow-xl transition-shadow duration-300">
                <!-- Cover Image -->
                <div v-if="coverCache.get(album.firstSongPath)" 
                     class="w-full h-full bg-cover bg-center rounded-sm"
                     :style="{ backgroundImage: `url(${coverCache.get(album.firstSongPath)})` }">
                </div>
                
                <!-- Loading Skeleton / Placeholder -->
                <div v-else class="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-white/5 dark:to-white/10 rounded-sm flex items-center justify-center text-4xl font-bold text-gray-300 dark:text-gray-600 shadow-inner"
                     :class="{'animate-pulse': loadingSet.has(album.firstSongPath)}">
                  {{ album.name ? album.name.substring(0, 1).toUpperCase() : 'A' }}
                </div>
             </div>
          </div>
          
          <!-- 专辑信息 -->
          <div class="flex flex-col items-start px-1 z-20">
            <h3 class="font-bold text-sm md:text-base text-gray-800 dark:text-gray-200 truncate w-full group-hover:text-[#EC4141] transition-colors leading-tight">
              {{ album.name }}
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 truncate w-full mt-1.5 flex items-center gap-1.5 opacity-80">
              <span class="font-medium">{{ album.count }}首</span>
              <span class="w-0.5 h-0.5 rounded-full bg-gray-400"></span>
              <span>{{ album.artist }}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
