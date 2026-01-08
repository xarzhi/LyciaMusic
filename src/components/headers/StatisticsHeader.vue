<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { usePlayer } from '../../composables/player';

// Scope/TimeRange 类型定义
type ScopeType = 'All' | 'Playlist' | 'Folder' | 'Artist';
type TimeRangeType = 'All' | 'Days7' | 'Days30' | 'ThisYear';

const emit = defineEmits<{
  refresh: [];
  scopeChange: [scope: ScopeType, scopeValue: string];
  timeRangeChange: [timeRange: TimeRangeType];
}>();

const props = defineProps<{
  currentScope: ScopeType;
  currentScopeValue: string;
  currentTimeRange: TimeRangeType;
}>();

const { playlists, folderTree, songList } = usePlayer();

const loading = ref(false);
const lastUpdated = ref<Date | null>(null);
const showScopeDropdown = ref(false);
const showTimeDropdown = ref(false);

// 获取唯一歌手列表
const artistList = computed(() => {
  const artists = new Set<string>();
  songList.value.forEach(song => {
    if (song.artist && song.artist.trim()) {
      artists.add(song.artist);
    }
  });
  return Array.from(artists).sort();
});

// 获取文件夹列表（扁平化）
const folderList = computed(() => {
  const folders: { name: string; path: string }[] = [];
  const flatten = (nodes: typeof folderTree.value) => {
    for (const node of nodes) {
      folders.push({ name: node.name, path: node.path });
      if (node.children) {
        flatten(node.children);
      }
    }
  };
  flatten(folderTree.value);
  return folders;
});

const scopeLabel = computed(() => {
  switch (props.currentScope) {
    case 'All': return '全库';
    case 'Playlist': return `歌单: ${props.currentScopeValue}`;
    case 'Folder': return `文件夹: ${props.currentScopeValue.split(/[\\/]/).pop()}`;
    case 'Artist': return `歌手: ${props.currentScopeValue}`;
    default: return '全库';
  }
});

const timeRangeLabel = computed(() => {
  switch (props.currentTimeRange) {
    case 'All': return '全部时间';
    case 'Days7': return '最近7天';
    case 'Days30': return '最近30天';
    case 'ThisYear': return '今年入库';
    default: return '全部时间';
  }
});

const handleRefresh = async () => {
  loading.value = true;
  emit('refresh');
  lastUpdated.value = new Date();
  setTimeout(() => {
    loading.value = false;
  }, 500);
};

const selectScope = (scope: ScopeType, value: string = '') => {
  emit('scopeChange', scope, value);
  showScopeDropdown.value = false;
};

const selectTimeRange = (range: TimeRangeType) => {
  emit('timeRangeChange', range);
  showTimeDropdown.value = false;
};

onMounted(() => {
  lastUpdated.value = new Date();
});

// 点击外部关闭下拉菜单
const closeDropdowns = () => {
  showScopeDropdown.value = false;
  showTimeDropdown.value = false;
};
</script>

<template>
  <div class="px-6 shrink-0 select-none flex flex-col pt-2 pb-3 h-auto justify-center" @click.self="closeDropdowns">
    <div class="flex items-center justify-between">
      <!-- 左侧标题 -->
      <div class="flex items-center gap-3 relative pb-1">
        <span class="text-gray-900 dark:text-white font-bold text-xl">
          曲库统计
        </span>
        
        <!-- Scope 选择器 -->
        <div class="relative">
          <button 
            @click.stop="showScopeDropdown = !showScopeDropdown; showTimeDropdown = false"
            class="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-300 transition flex items-center gap-1.5"
          >
            <span>{{ scopeLabel }}</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          <!-- Scope 下拉菜单 -->
          <div 
            v-if="showScopeDropdown"
            class="absolute top-full left-0 mt-1 w-56 max-h-80 overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50"
          >
            <!-- 全库 -->
            <div 
              @click="selectScope('All')"
              class="px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2"
              :class="{ 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400': currentScope === 'All' }"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              全库统计
            </div>
            
            <!-- 歌单分组 -->
            <div v-if="playlists.length > 0" class="border-t border-gray-100 dark:border-gray-700">
              <div class="px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500 font-medium">歌单</div>
              <div 
                v-for="pl in playlists" 
                :key="pl.id"
                @click="selectScope('Playlist', pl.name)"
                class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 pl-8"
                :class="{ 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400': currentScope === 'Playlist' && currentScopeValue === pl.name }"
              >
                {{ pl.name }} ({{ pl.songPaths.length }})
              </div>
            </div>
            
            <!-- 文件夹分组 -->
            <div v-if="folderList.length > 0" class="border-t border-gray-100 dark:border-gray-700">
              <div class="px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500 font-medium">文件夹</div>
              <div 
                v-for="folder in folderList.slice(0, 10)" 
                :key="folder.path"
                @click="selectScope('Folder', folder.path)"
                class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 pl-8 truncate"
                :class="{ 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400': currentScope === 'Folder' && currentScopeValue === folder.path }"
                :title="folder.path"
              >
                {{ folder.name }}
              </div>
            </div>
            
            <!-- 歌手分组 -->
            <div v-if="artistList.length > 0" class="border-t border-gray-100 dark:border-gray-700">
              <div class="px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500 font-medium">歌手</div>
              <div 
                v-for="artist in artistList.slice(0, 10)" 
                :key="artist"
                @click="selectScope('Artist', artist)"
                class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 pl-8 truncate"
                :class="{ 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400': currentScope === 'Artist' && currentScopeValue === artist }"
              >
                {{ artist }}
              </div>
            </div>
          </div>
        </div>
        
        <!-- TimeRange 选择器 -->
        <div class="relative">
          <button 
            @click.stop="showTimeDropdown = !showTimeDropdown; showScopeDropdown = false"
            class="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-300 transition flex items-center gap-1.5"
          >
            <span>{{ timeRangeLabel }}</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          <!-- TimeRange 下拉菜单 -->
          <div 
            v-if="showTimeDropdown"
            class="absolute top-full left-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50"
          >
            <div 
              v-for="option in [
                { value: 'All' as TimeRangeType, label: '全部时间' },
                { value: 'Days7' as TimeRangeType, label: '最近7天入库' },
                { value: 'Days30' as TimeRangeType, label: '最近30天入库' },
                { value: 'ThisYear' as TimeRangeType, label: '今年入库' },
              ]"
              :key="option.value"
              @click="selectTimeRange(option.value)"
              class="px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 first:rounded-t-xl last:rounded-b-xl"
              :class="{ 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400': currentTimeRange === option.value }"
            >
              {{ option.label }}
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧操作按钮 -->
      <div class="flex items-center gap-2">
        <!-- 更新时间 -->
        <span v-if="lastUpdated" class="text-xs text-gray-400 dark:text-gray-500 mr-2">
          更新于 {{ lastUpdated.toLocaleTimeString() }}
        </span>

        <!-- 刷新按钮 -->
        <button 
          @click="handleRefresh" 
          class="bg-white/1 hover:bg-white/10 border border-white/1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-full transition active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20"
          :class="{ 'animate-spin': loading }"
          :disabled="loading"
          title="刷新统计数据"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
