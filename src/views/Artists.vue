<script setup lang="ts">
import { dragSession } from '../composables/dragState';
import { useLibraryBrowse } from '../features/library/useLibraryBrowse';
import { useRouter } from 'vue-router';
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useCoverCache } from '../composables/useCoverCache';
import { useHomeNavigation } from '../composables/useHomeNavigation';

const { filteredArtistList, artistSortMode, updateArtistOrder, searchQuery } = useLibraryBrowse();
const router = useRouter();
const { openHomeArtist } = useHomeNavigation(router);
const isSearchActive = computed(() => searchQuery.value.trim().length > 0);

const showSortMenu = ref(false);
const dragOverName = ref<string | null>(null);

const handleArtistClick = (artistName: string) => {
  void openHomeArtist(artistName);
};

const handleSortChange = (mode: 'count' | 'name' | 'custom') => {
  artistSortMode.value = mode;
  showSortMenu.value = false;
};

// --- Cover Cache ---
const { coverCache, loadingSet, preloadCovers } = useCoverCache();

watch(() => filteredArtistList.value, (newList) => {
  const paths = newList.map((a: any) => a.firstSongPath).filter(Boolean);
  preloadCovers(paths);
}, { immediate: true });

// --- Dynamic Gradient Generator ---
const gradients = [
  'from-pink-500 to-rose-500',
  'from-purple-500 to-indigo-500',
  'from-cyan-500 to-blue-500',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-fuchsia-500 to-pink-500',
  'from-blue-400 to-indigo-500',
  'from-violet-500 to-purple-500',
];

const getGradientForArtist = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
};

// --- Custom Drag & Drop for Artists ---
let mouseDownInfo: { x: number, y: number, index: number, artist: any } | null = null;

const handleMouseDown = (e: MouseEvent, index: number, artist: any) => {
  if (isSearchActive.value) return;
  if (e.button !== 0) return;
  mouseDownInfo = { x: e.clientX, y: e.clientY, index, artist };
};

const handleGlobalMouseMove = (e: MouseEvent) => {
  if (mouseDownInfo && !dragSession.active) {
    const dist = Math.sqrt(Math.pow(e.clientX - mouseDownInfo.x, 2) + Math.pow(e.clientY - mouseDownInfo.y, 2));
    if (dist > 5) {
      dragSession.active = true;
      dragSession.type = 'artist';
      dragSession.data = { index: mouseDownInfo.index, name: mouseDownInfo.artist.name };
    }
  }
};

const handleGlobalMouseUp = () => {
  if (dragSession.active && dragSession.type === 'artist') {
    if (dragOverName.value && mouseDownInfo) {
      const fromIndex = mouseDownInfo.index;
      const toIndex = filteredArtistList.value.findIndex(a => a.name === dragOverName.value);
      
      if (toIndex !== -1 && fromIndex !== toIndex) {
        const list = [...filteredArtistList.value];
        const [removed] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, removed);
        
        const newOrder = list.map(a => a.name);
        updateArtistOrder(newOrder);
      }
    }
  }
  
  // Reset
  mouseDownInfo = null;
  if (dragSession.type === 'artist') {
     dragSession.active = false;
     dragSession.type = 'song';
     dragSession.data = null;
     dragOverName.value = null;
  }
};

const handleItemMouseMove = (_e: MouseEvent, artistName: string) => {
  if (dragSession.active && dragSession.type === 'artist') {
    dragOverName.value = artistName;
  }
};

// Global click to close menu
const closeMenu = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.relative.z-50')) {
    showSortMenu.value = false;
  }
};

onMounted(() => {
  window.addEventListener('mousemove', handleGlobalMouseMove);
  window.addEventListener('mouseup', handleGlobalMouseUp);
  window.addEventListener('click', closeMenu);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleGlobalMouseMove);
  window.removeEventListener('mouseup', handleGlobalMouseUp);
  window.removeEventListener('click', closeMenu);
});
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden bg-transparent h-full min-h-0" @click="showSortMenu = false">
    <header class="h-auto px-6 pt-2 pb-3 shrink-0 select-none flex flex-col justify-center z-10 relative">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 pb-1">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">歌手列表</h2>
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
            <button @click="handleSortChange('name')" class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-between" :class="artistSortMode === 'name' ? 'text-[#EC4141] font-medium' : 'text-gray-700 dark:text-gray-200'">
              <span>按名称排序 (A-Z)</span>
              <svg v-if="artistSortMode === 'name'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
            </button>
            <button @click="handleSortChange('count')" class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-between" :class="artistSortMode === 'count' ? 'text-[#EC4141] font-medium' : 'text-gray-700 dark:text-gray-200'">
              <span>按数量排序 (多->少)</span>
              <svg v-if="artistSortMode === 'count'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
            </button>
            <button class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-between cursor-default" :class="artistSortMode === 'custom' ? 'text-[#EC4141] font-medium' : 'text-gray-700 dark:text-gray-200'">
              <span>自定义排序 (拖拽触发)</span>
              <svg v-if="artistSortMode === 'custom'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
            </button>
          </div>
        </div>
      </div>
      </div>
    </header>

    <section class="flex-1 overflow-y-auto p-8 custom-scrollbar relative z-0">
      <!-- Grid 布局 -->
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-6 gap-y-4">
        <div 
          v-for="(artist, index) in filteredArtistList" 
          :key="artist.name"
          @mousedown="handleMouseDown($event, index, artist)"
          @mousemove="handleItemMouseMove($event, artist.name)"
          @click="handleArtistClick(artist.name)"
          class="group cursor-pointer flex items-center gap-4 hover:bg-black/5 dark:hover:bg-white/5 p-2 rounded-lg transition-colors relative select-none"
          :class="[
            (dragSession.active && dragSession.type === 'artist' && dragSession.data?.name === artist.name) ? 'opacity-50' : ''
          ]"
        >
          <!-- 小圆头像容器 -->
          <div class="relative w-12 h-12 md:w-14 md:h-14 shrink-0"
               :class="{ 'ring-2 ring-[#EC4141] ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#222222] rounded-full': dragSession.active && dragSession.type === 'artist' && dragOverName === artist.name && dragSession.data?.name !== artist.name }"
          >
            <!-- 头像图片或骨架屏/首字母区域 -->
            <div class="w-full h-full rounded-full overflow-hidden shadow-sm group-hover:shadow transition-shadow duration-300 relative bg-gray-100 dark:bg-white/5 flex items-center justify-center">
               
               <!-- 骨架屏 (Loading State) -->
               <div v-if="loadingSet.has(artist.firstSongPath)" class="w-full h-full bg-gray-200 dark:bg-white/10 animate-pulse"></div>

               <!-- 真实封面图 -->
               <img v-else-if="coverCache.get(artist.firstSongPath)" :src="coverCache.get(artist.firstSongPath)" class="w-full h-full object-cover select-none animate-in fade-in duration-300" draggable="false" :alt="artist.name"/>
               
               <!-- 渐变首字母 (Fallback) -->
               <div v-else class="w-full h-full flex items-center justify-center text-lg md:text-xl font-bold text-white bg-gradient-to-br animate-in fade-in duration-300" :class="getGradientForArtist(artist.name)">
                 {{ artist.name.charAt(0).toUpperCase() }}
               </div>
               
               <!-- 悬浮高亮变亮遮罩层 -->
               <div class="absolute inset-0 bg-white/0 group-hover:bg-white/10 dark:bg-black/5 dark:group-hover:bg-transparent transition-colors duration-300"></div>
            </div>
          </div>
          
          <div class="flex-1 min-w-0">
             <h3 class="font-medium text-sm md:text-base text-gray-800 dark:text-gray-200 truncate w-full group-hover:text-[#EC4141] transition-colors leading-snug">
               {{ artist.name }}
             </h3>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
