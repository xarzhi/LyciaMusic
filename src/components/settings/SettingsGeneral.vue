<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useSettings } from '../../composables/settings';
import { usePlayer } from '../../composables/player';
import { invoke } from '@tauri-apps/api/core';

const { settings } = useSettings();
const { settings: playerSettings } = usePlayer();

// Placeholder states for demonstration
const launchOnStartup = ref(false);
const gpuAcceleration = ref(true);
const autoPlay = ref(true);

interface AudioDevice {
  id: string;
  name: string;
}

const outputDevices = ref<AudioDevice[]>([]);
const currentDeviceId = ref('');
const showDeviceMenu = ref(false);
const triggerButtonRef = ref<HTMLElement | null>(null);
const dropdownStyle = ref({});
const showLyricsSyncOffsetPanel = ref(false);

const lyricsSyncOffsetMs = computed({
  get: () => Math.round(settings.value.lyricsSyncOffset * 1000),
  set: (value: number | string) => {
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    const next = Number.isFinite(numericValue) ? Math.max(-1000, Math.min(1000, numericValue)) : 0;
    settings.value.lyricsSyncOffset = next / 1000;
  }
});

const lyricsSyncOffsetLabel = computed(() => {
  const offset = lyricsSyncOffsetMs.value;
  if (offset === 0) return '0 ms';
  return `${offset > 0 ? '+' : ''}${offset} ms`;
});

const resetLyricsSyncOffset = () => {
  lyricsSyncOffsetMs.value = 0;
};

const fetchDevices = async () => {
  try {
    const devices = await invoke<AudioDevice[]>('get_output_devices');
    outputDevices.value = devices;
  } catch (e) {
    console.error("Failed to get devices:", e);
  }
};

const selectDevice = async (device: AudioDevice) => {
  try {
    await invoke('set_output_device', { deviceId: device.id });
    currentDeviceId.value = device.id;
    localStorage.setItem('player_output_device', device.id);
    showDeviceMenu.value = false;
  } catch (e) {
    console.error("Failed to set device:", e);
  }
};

const toggleDeviceMenu = () => {
  if (showDeviceMenu.value) {
    showDeviceMenu.value = false;
  } else {
    if (triggerButtonRef.value) {
      const rect = triggerButtonRef.value.getBoundingClientRect();
      // Calculate position: align right edge of dropdown with right edge of button
      // Dropdown width is w-48 (12rem = 192px)
      dropdownStyle.value = {
        top: `${rect.bottom + 8}px`,
        left: `${rect.right - 192}px`,
        position: 'fixed',
        zIndex: 9999
      };
    }
    showDeviceMenu.value = true;
  }
};

onMounted(async () => {
  await fetchDevices();
  const savedId = localStorage.getItem('player_output_device');
  if (savedId) {
    currentDeviceId.value = savedId;
  }
});
</script>

<template>
  <div class="max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
    
    <!-- Startup & Behavior -->
    <section class="space-y-3">
      <h2 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
        <span class="w-1 h-4 bg-[#EC4141] rounded-full"></span>
        常规与启动
      </h2>
      <div class="bg-white/50 dark:bg-black/40 backdrop-blur-sm rounded-xl border border-gray-100/50 dark:border-white/5 overflow-hidden">
        <div class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
          <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">开机自动运行</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">系统启动时自动打开应用</div>
          </div>
          <button @click="launchOnStartup = !launchOnStartup" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="launchOnStartup ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="launchOnStartup ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>

        <div class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
          <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">GPU 加速</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">使用显卡硬件加速界面渲染 (需要重启)</div>
          </div>
          <button @click="gpuAcceleration = !gpuAcceleration" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="gpuAcceleration ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="gpuAcceleration ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>

        <div class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
          <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">最小化到系统托盘</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">点击最小化按钮时隐藏到托盘</div>
          </div>
          <button @click="settings.minimizeToTray = !settings.minimizeToTray" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="settings.minimizeToTray ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="settings.minimizeToTray ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>

        <div class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
          <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">关闭主面板时最小化到托盘</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">点击关闭按钮时隐藏到托盘，不退出程序</div>
          </div>
          <button @click="settings.closeToTray = !settings.closeToTray" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="settings.closeToTray ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="settings.closeToTray ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>

        <div class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
          <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">显示音质标识</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">在歌曲标题旁显示 Hi-Res / SQ / HQ 标签</div>
          </div>
          <button @click="settings.showQualityBadges = !settings.showQualityBadges" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="settings.showQualityBadges ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="settings.showQualityBadges ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>
        <div class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
          <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">关联文件夹与音乐库</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">文件夹视图与本地音乐库相互耦合，同时移除时也双向同步。</div>
          </div>
          <button @click="settings.linkFoldersToLibrary = !settings.linkFoldersToLibrary" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="settings.linkFoldersToLibrary ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="settings.linkFoldersToLibrary ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>
      </div>
    </section>

    <!-- Playback -->
    <section class="space-y-3">
      <h2 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
        <span class="w-1 h-4 bg-[#EC4141] rounded-full"></span>
        播放设置
      </h2>
      <div class="bg-white/50 dark:bg-black/40 backdrop-blur-sm rounded-xl border border-gray-100/50 dark:border-white/5 overflow-hidden">
        <div class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
          <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">自动播放</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">程序启动后自动恢复上次播放</div>
          </div>
           <button @click="autoPlay = !autoPlay" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="autoPlay ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="autoPlay ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>
        
        <div class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors relative">
           <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">输出设备</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {{ outputDevices.find(d => d.id === currentDeviceId)?.name || '默认系统设备' }}
            </div>
          </div>
          
          <div class="relative">
            <button 
              ref="triggerButtonRef"
              @click="toggleDeviceMenu"
              class="text-xs px-3 py-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded text-gray-600 dark:text-gray-300 hover:text-[#EC4141] hover:border-[#EC4141] transition flex items-center gap-1"
            >
              管理设备
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>

            <!-- Dropdown Teleport -->
            <Teleport to="body">
              <div v-if="showDeviceMenu">
                <!-- Overlay -->
                <div class="fixed inset-0 z-[9998]" @click="showDeviceMenu = false"></div>
                
                <!-- Menu -->
                <div 
                  class="fixed w-48 bg-white dark:bg-[#2b2b2b] rounded-xl shadow-xl border border-gray-100 dark:border-white/10 py-1 z-[9999] animate-in fade-in zoom-in-95 duration-100"
                  :style="dropdownStyle"
                >
                  <div v-if="outputDevices.length === 0" class="px-4 py-2 text-xs text-gray-400">未找到设备</div>
                  <button 
                    v-for="device in outputDevices" 
                    :key="device.id"
                    @click="selectDevice(device)"
                    class="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 dark:hover:bg-white/5 transition-colors flex items-center justify-between group"
                    :class="currentDeviceId === device.id ? 'text-[#EC4141] font-medium' : 'text-gray-600 dark:text-gray-300'"
                  >
                    <span class="truncate">{{ device.name }}</span>
                    <span v-if="currentDeviceId === device.id" class="text-[#EC4141]">✓</span>
                  </button>
                </div>
              </div>
            </Teleport>
          </div>
        </div>

        <div class="border-t border-gray-100/50 dark:border-white/5">
          <button
            type="button"
            @click="showLyricsSyncOffsetPanel = !showLyricsSyncOffsetPanel"
            class="w-full p-4 flex items-center justify-between gap-4 hover:bg-white/40 dark:hover:bg-white/5 transition-colors text-left"
          >
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-800 dark:text-gray-200">歌词同步补偿</div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                当前值 {{ lyricsSyncOffsetLabel }}，点击展开调节
              </div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <div class="text-xs font-medium text-gray-600 dark:text-gray-300 tabular-nums">
                {{ lyricsSyncOffsetLabel }}
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 text-gray-400 transition-transform duration-200"
                :class="showLyricsSyncOffsetPanel ? 'rotate-180' : ''"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
              </svg>
            </div>
          </button>
          <div v-if="showLyricsSyncOffsetPanel" class="px-4 pb-4">
            <div class="pt-1 border-t border-gray-100/50 dark:border-white/5">
        <div class="p-4 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
          <div class="flex items-start justify-between gap-6">
            <div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                正值让歌词更晚显示，负值让歌词更早显示。用于修正不同输出设备的播放缓冲差异，默认值为 0 ms。
              </div>
            </div>
          </div>

          <div class="mt-4 flex items-center gap-4">
            <input
              v-model="lyricsSyncOffsetMs"
              type="range"
              min="-1000"
              max="1000"
              step="10"
              class="flex-1 h-1.5 accent-[#EC4141] cursor-pointer"
            />
            <input
              v-model="lyricsSyncOffsetMs"
              type="number"
              min="-1000"
              max="1000"
              step="10"
              class="w-24 px-3 py-1.5 text-xs rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-700 dark:text-gray-200"
            />
            <button
              @click="resetLyricsSyncOffset"
              class="shrink-0 text-xs px-3 py-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded text-gray-600 dark:text-gray-300 hover:text-[#EC4141] hover:border-[#EC4141] transition ml-auto"
            >
              恢复默认
            </button>
          </div>
        </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Interface Layout (Sidebar Visibility) -->
    <section v-if="playerSettings.sidebar" class="space-y-3">
      <h2 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
        <span class="w-1 h-4 bg-[#EC4141] rounded-full"></span>
        界面布局
      </h2>
      <div class="bg-white/50 dark:bg-black/40 backdrop-blur-sm rounded-xl border border-gray-100/50 dark:border-white/5 overflow-hidden">
        
        <!-- Local Music (Locked/Checked) -->
        <div class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 opacity-70 cursor-not-allowed">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-500 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
            </div>
            <div>
              <div class="text-sm font-medium text-gray-800 dark:text-gray-200">本地音乐</div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">核心功能 (不可隐藏)</div>
            </div>
          </div>
          <div class="relative inline-flex h-6 w-11 items-center rounded-full bg-[#EC4141] opacity-50">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white translate-x-6 shadow-sm" />
          </div>
        </div>

        <!-- Artists -->
        <div 
          @click="playerSettings.sidebar.showArtists = !playerSettings.sidebar.showArtists" 
          class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0" :class="playerSettings.sidebar.showArtists ? 'text-[#EC4141] bg-red-100/50' : 'text-gray-500'">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">歌手</div>
          </div>
          <button class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="playerSettings.sidebar.showArtists ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="playerSettings.sidebar.showArtists ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>

        <!-- Albums -->
        <div 
          @click="playerSettings.sidebar.showAlbums = !playerSettings.sidebar.showAlbums" 
          class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0" :class="playerSettings.sidebar.showAlbums ? 'text-[#EC4141] bg-red-100/50' : 'text-gray-500'">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="2" /><circle cx="12" cy="12" r="3" stroke-width="2" /></svg>
            </div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">专辑</div>
          </div>
          <button class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="playerSettings.sidebar.showAlbums ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="playerSettings.sidebar.showAlbums ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>

        <!-- Favorites -->
        <div 
          @click="playerSettings.sidebar.showFavorites = !playerSettings.sidebar.showFavorites" 
          class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0" :class="playerSettings.sidebar.showFavorites ? 'text-[#EC4141] bg-red-100/50' : 'text-gray-500'">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            </div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">我的收藏</div>
          </div>
          <button class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="playerSettings.sidebar.showFavorites ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="playerSettings.sidebar.showFavorites ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>

        <!-- Recent -->
        <div 
          @click="playerSettings.sidebar.showRecent = !playerSettings.sidebar.showRecent" 
          class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0" :class="playerSettings.sidebar.showRecent ? 'text-[#EC4141] bg-red-100/50' : 'text-gray-500'">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">最近播放</div>
          </div>
          <button class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="playerSettings.sidebar.showRecent ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="playerSettings.sidebar.showRecent ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>

        <!-- Folders -->
        <div 
          @click="playerSettings.sidebar.showFolders = !playerSettings.sidebar.showFolders" 
          class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0" :class="playerSettings.sidebar.showFolders ? 'text-[#EC4141] bg-red-100/50' : 'text-gray-500'">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
            </div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">文件夹</div>
          </div>
          <button class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="playerSettings.sidebar.showFolders ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="playerSettings.sidebar.showFolders ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>

        <!-- Statistics -->
        <div 
          @click="playerSettings.sidebar.showStatistics = !playerSettings.sidebar.showStatistics" 
          class="p-4 flex items-center justify-between border-b border-gray-100/50 dark:border-white/5 last:border-0 hover:bg-white/40 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0" :class="playerSettings.sidebar.showStatistics ? 'text-[#EC4141] bg-red-100/50' : 'text-gray-500'">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            </div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">统计</div>
          </div>
          <button class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="playerSettings.sidebar.showStatistics ? 'bg-[#EC4141]' : 'bg-gray-300 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm" :class="playerSettings.sidebar.showStatistics ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>

      </div>
    </section>

    <!-- Storage -->
    <section class="space-y-3">
      <h2 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
        <span class="w-1 h-4 bg-[#EC4141] rounded-full"></span>
        存储空间
      </h2>
      <div class="bg-white/50 dark:bg-black/40 backdrop-blur-sm rounded-xl border border-gray-100/50 dark:border-white/5 overflow-hidden">
         <div class="p-4 flex items-center justify-between hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
          <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">清除缓存</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">释放封面与歌词缓存</div>
          </div>
          <button class="text-xs px-3 py-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded text-gray-600 dark:text-gray-300 hover:text-red-500 hover:border-red-500 transition">立即清除</button>
        </div>
      </div>
    </section>

  </div>
</template>
