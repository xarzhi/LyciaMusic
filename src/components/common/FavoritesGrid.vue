<script setup lang="ts">
import { usePlayer } from '../../composables/player';
import { ref, watch, onUnmounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

// 接收父组件传来的“当前 Tab”状态
const { favTab, favArtistList, favAlbumList } = usePlayer();

const emit = defineEmits<{
  (e: 'enterDetail', type: 'artist' | 'album', name: string): void
}>();

// --- 🟢 图片加载逻辑 ---
const imageCache = ref<Map<string, string>>(new Map());

const loadCover = async (path: string) => {
  if (imageCache.value.has(path)) return; 
  try {
    const filePath = await invoke<string>('get_song_cover_thumbnail', { path });
    if (filePath) {
      imageCache.value.set(path, convertFileSrc(filePath));
    }
  } catch (e) {}
};

// --- 🚀 懒加载性能优化 (IntersectionObserver) ---
const itemRefs = ref<HTMLElement[]>([]);
let observer: IntersectionObserver | null = null;

const initObserver = () => {
  if (observer) observer.disconnect();
  
  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = entry.target as HTMLElement;
        const path = target.dataset.path;
        if (path) {
          loadCover(path);
          observer?.unobserve(target);
        }
      }
    });
  }, { rootMargin: '100px' }); // 提前 100px 加载

  itemRefs.value.forEach(el => {
    if (el) observer?.observe(el);
  });
};

// 当列表数据或 Tab 变化时，重置观察器
watch([favArtistList, favAlbumList, favTab], async () => {
  await nextTick();
  initObserver();
}, { immediate: true, deep: true });

onUnmounted(() => {
  if (observer) observer.disconnect();
});
</script>

<template>
  <div class="favorites-grid p-4">
          
    <!-- 歌手卡片 -->
    <template v-if="favTab === 'artists'">
      <div 
        v-for="artist in favArtistList" 
        :key="artist.name"
        @click="emit('enterDetail', 'artist', artist.name)"
        class="group cursor-pointer"
      >
        <div 
          ref="itemRefs"
          :data-path="artist.firstSongPath"
          class="relative aspect-square rounded-full overflow-hidden shadow-md 
                 group-hover:shadow-xl transition-all duration-300 ease-out group-hover:scale-[1.03]"
        >
          <!-- 图片 -->
          <img 
            v-if="imageCache.get(artist.firstSongPath)" 
            :src="imageCache.get(artist.firstSongPath)" 
            class="w-full h-full object-cover"
            alt="Artist"
          />
          
          <!-- 占位符 -->
          <div v-else class="w-full h-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
            <span class="text-4xl text-indigo-300">👤</span>
          </div>
          
          <!-- 渐变遮罩 -->
          <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          <!-- 悬停时显示的信息（居中） -->
          <div class="absolute inset-0 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all duration-300">
            <span class="font-bold text-sm truncate max-w-[80%] text-center drop-shadow-md">{{ artist.name }}</span>
            <span class="text-xs opacity-80 mt-1">{{ artist.count }} 首收藏</span>
          </div>
        </div>
        
        <!-- 底部文字（始终可见） -->
        <div class="mt-2 text-center">
          <span class="font-bold text-gray-800 dark:text-gray-200 text-sm truncate block group-hover:text-[#EC4141] transition-colors">{{ artist.name }}</span>
          <span class="text-xs text-gray-400">{{ artist.count }} 首收藏</span>
        </div>
      </div>
    </template>

    <!-- 专辑卡片 -->
    <template v-if="favTab === 'albums'">
      <div 
        v-for="album in favAlbumList" 
        :key="album.name"
        @click="emit('enterDetail', 'album', album.name)"
        class="group cursor-pointer"
      >
        <div 
          ref="itemRefs"
          :data-path="album.firstSongPath"
          class="relative aspect-square rounded-lg overflow-hidden shadow-md
                 group-hover:shadow-xl transition-all duration-300 ease-out group-hover:scale-[1.03]"
        >
          <!-- 图片 -->
          <img 
            v-if="imageCache.get(album.firstSongPath)" 
            :src="imageCache.get(album.firstSongPath)" 
            class="w-full h-full object-cover"
            alt="Album"
          />
          
          <!-- 占位符 -->
          <div v-else class="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <span class="text-4xl text-gray-300">💿</span>
          </div>
          
          <!-- 渐变遮罩 -->
          <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          
          <!-- 专辑信息 -->
          <div class="absolute inset-x-0 bottom-0 p-3 text-white">
            <span class="font-bold text-sm truncate block drop-shadow-md">{{ album.name }}</span>
            <span class="text-xs opacity-80 truncate block">{{ album.artist }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.favorites-grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(3, 1fr);
}

@media (min-width: 640px) {
  .favorites-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .favorites-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}

@media (min-width: 1280px) {
  .favorites-grid {
    grid-template-columns: repeat(6, 1fr);
  }
}
</style>