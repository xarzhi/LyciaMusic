<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayer } from '../../composables/player';
import CustomSkinModal from './CustomSkinModal.vue';
import { convertFileSrc } from '@tauri-apps/api/core';

const { settings } = usePlayer();
const showCustomModal = ref(false);

// 配色方案类型: dark, light, custom
const colorScheme = computed({
  get: () => settings.value.theme.mode,
  set: (val: 'light' | 'dark' | 'custom') => {
    settings.value.theme.mode = val;
  }
});

// 动态背景是否禁用（自定义皮肤模式下禁用）
const isDynamicBgDisabled = computed(() => colorScheme.value === 'custom');

const setColorScheme = (mode: 'light' | 'dark' | 'custom') => {
  colorScheme.value = mode;
  if (mode === 'custom') {
    // 自定义皮肤模式下，动态背景自动设为 none
    settings.value.theme.dynamicBgType = 'none';
  }
};

const setDynamicType = (type: 'none' | 'flow' | 'blur') => {
  if (isDynamicBgDisabled.value) return;
  settings.value.theme.dynamicBgType = type;
};

const openCustomModal = () => {
  showCustomModal.value = true;
};
</script>

<template>
  <div class="max-w-4xl animate-in fade-in slide-in-from-bottom-2 duration-300">
    
    <div class="space-y-8">
      
      <!-- 配色方案区块 -->
      <section class="space-y-3">
        <h2 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <span class="w-1 h-4 bg-[#EC4141] rounded-full"></span>
          配色方案
        </h2>
        <div class="bg-white/50 dark:bg-black/40 backdrop-blur-sm rounded-xl border border-gray-100/50 dark:border-white/5 p-4">
          <div class="grid grid-cols-3 gap-4">
            
            <!-- 酷炫黑 -->
            <button 
              @click="setColorScheme('dark')" 
              class="relative group cursor-pointer transition-all outline-none focus:ring-2 focus:ring-[#EC4141] rounded-xl"
            >
              <div class="aspect-[4/3] rounded-xl bg-[#2b2b2b] border-2 relative overflow-hidden shadow-sm transition-all" 
                :class="colorScheme === 'dark' ? 'border-[#EC4141] ring-1 ring-[#EC4141]/20' : 'border-transparent group-hover:border-gray-300 dark:group-hover:border-white/20'"
              >
                <div class="absolute inset-0 flex flex-col items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                   <span class="text-3xl filter drop-shadow-lg">🌑</span>
                   <span class="text-xs text-gray-400 mt-2 font-medium">酷炫黑</span>
                </div>
                
                <!-- Active Indicator -->
                <div v-if="colorScheme === 'dark'" class="absolute top-2 right-2 bg-[#EC4141] text-white rounded-full p-0.5 shadow-md">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                </div>
              </div>
            </button>

            <!-- 官方白 -->
             <button 
              @click="setColorScheme('light')" 
              class="relative group cursor-pointer transition-all outline-none focus:ring-2 focus:ring-[#EC4141] rounded-xl"
            >
              <div class="aspect-[4/3] rounded-xl bg-white border-2 relative overflow-hidden shadow-sm transition-all" 
                :class="colorScheme === 'light' ? 'border-[#EC4141] ring-1 ring-[#EC4141]/20' : 'border-transparent group-hover:border-gray-300 dark:group-hover:border-white/20'"
              >
                <div class="absolute top-0 left-0 right-0 h-1.5 bg-[#EC4141]"></div>
                <div class="absolute inset-0 flex flex-col items-center justify-center pt-2 opacity-80 group-hover:opacity-100 transition-opacity">
                   <span class="text-3xl filter drop-shadow-sm">⚪</span>
                   <span class="text-xs text-gray-500 mt-2 font-medium">官方白</span>
                </div>

                 <!-- Active Indicator -->
                <div v-if="colorScheme === 'light'" class="absolute top-2 right-2 bg-[#EC4141] text-white rounded-full p-0.5 shadow-md">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                </div>
              </div>
            </button>

            <!-- 自定义皮肤 -->
            <button 
              @click="setColorScheme('custom'); openCustomModal()" 
              class="relative group cursor-pointer transition-all outline-none focus:ring-2 focus:ring-[#EC4141] rounded-xl"
            >
              <div class="aspect-[4/3] rounded-xl bg-gradient-to-br from-pink-100 to-purple-100 dark:from-pink-900/30 dark:to-purple-900/30 border-2 relative overflow-hidden shadow-sm transition-all" 
                :class="colorScheme === 'custom' ? 'border-[#EC4141] ring-1 ring-[#EC4141]/20' : 'border-transparent group-hover:border-gray-300 dark:group-hover:border-white/20'"
              >
                <!-- 预览自定义背景图 -->
                <img 
                  v-if="settings.theme.customBackground?.imagePath" 
                  :src="convertFileSrc(settings.theme.customBackground.imagePath)" 
                  class="absolute inset-0 w-full h-full object-cover opacity-60"
                />
                <div class="absolute inset-0 flex flex-col items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                   <span class="text-3xl filter drop-shadow-lg">🖼️</span>
                   <span class="text-xs text-gray-500 dark:text-gray-400 mt-2 font-medium">自定义皮肤</span>
                </div>
                
                <!-- 设置按钮 -->
                <div class="absolute bottom-2 right-2">
                  <span class="text-[10px] bg-white/80 dark:bg-black/50 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded shadow-sm">设置</span>
                </div>

                <!-- Active Indicator -->
                <div v-if="colorScheme === 'custom'" class="absolute top-2 right-2 bg-[#EC4141] text-white rounded-full p-0.5 shadow-md">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                </div>
              </div>
            </button>

          </div>
        </div>
      </section>

      <!-- 动态背景区块 -->
      <section class="space-y-3">
        <h2 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <span class="w-1 h-4 bg-[#EC4141] rounded-full"></span>
          动态背景
        </h2>
        <div 
          class="bg-white/50 dark:bg-black/40 backdrop-blur-sm rounded-xl border border-gray-100/50 dark:border-white/5 p-4 space-y-3"
          :class="isDynamicBgDisabled ? 'opacity-50 pointer-events-none' : ''"
        >
          <div class="flex items-center gap-2 mb-2">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-[#EC4141] to-pink-500 flex items-center justify-center text-white shadow-sm shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>
            </div>
            <div>
              <span class="text-sm font-bold text-gray-800 dark:text-gray-200">背景跟随封面变化</span>
              <p class="text-[10px] text-gray-400">背景颜色或图像随当前播放内容自动变化</p>
            </div>
          </div>
          
          <div class="flex p-1 bg-gray-100 dark:bg-white/5 rounded-lg">
            <button 
              v-for="opt in [{id:'none', name:'无'}, {id:'flow', name:'灵动流光'}, {id:'blur', name:'静态模糊'}]" 
              :key="opt.id"
              @click="setDynamicType(opt.id as any)"
              class="flex-1 py-2 text-xs font-medium rounded-md transition-all"
              :class="settings.theme.dynamicBgType === opt.id ? 'bg-white dark:bg-white/10 text-[#EC4141] shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'"
            >
              {{ opt.name }}
            </button>
          </div>
          
          <p v-if="isDynamicBgDisabled" class="text-[10px] text-amber-500 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
            仅在非自定义皮肤模式下生效
          </p>
        </div>
      </section>

    </div>

    <CustomSkinModal v-if="showCustomModal" @close="showCustomModal = false" />
  </div>
</template>