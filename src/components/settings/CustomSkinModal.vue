<script setup lang="ts">
import { convertFileSrc } from '@tauri-apps/api/core';
import { useCustomThemeModal } from '../../composables/useCustomThemeModal';

const emit = defineEmits(['close']);
const { preview, handleSelectImage, handleCancel: revertTheme } = useCustomThemeModal();

const handleCancel = () => {
  revertTheme();
  emit('close');
};

const handleSave = () => {
  emit('close');
};
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div class="bg-[#2b2b2b] w-full max-w-[500px] max-h-[calc(100vh-2rem)] rounded-2xl shadow-2xl overflow-hidden text-white border border-white/10 flex flex-col">
      
      <!-- 鏍囬鏍?-->
      <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <span class="font-bold text-base">鑷畾涔夌毊鑲?/span>
        <button @click="handleCancel" class="text-white/50 hover:text-white transition">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div class="flex flex-col p-6 gap-6">
        
        <!-- 棰勮鍖?-->
        <div class="relative w-full h-48 bg-[#1a1a1a] rounded-xl overflow-hidden border border-white/5 group">
          <div v-if="preview.imagePath" class="absolute inset-0">
             <!-- 棰勮钂欏眰 -->
             <div 
               class="absolute inset-0 z-10" 
               :style="{ backgroundColor: preview.maskColor, opacity: preview.maskAlpha }"
             ></div>
             <!-- 棰勮鍥剧墖 -->
             <img 
               :src="convertFileSrc(preview.imagePath)" 
               class="w-full h-full object-cover"
               :style="{ filter: `blur(${preview.blur}px) brightness(${preview.opacity ?? 1.0})`, transform: `scale(${preview.scale})` }"
             />
          </div>
          <div v-else class="absolute inset-0 flex flex-col items-center justify-center text-white/20">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span class="text-xs">鏈€夋嫨鍥剧墖</span>
          </div>

          <!-- 涓婁紶瑕嗙洊灞?-->
          <div 
            @click="handleSelectImage"
            class="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-20"
          >
            <div class="bg-white/20 p-2 rounded-full mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span class="text-sm font-medium">閫夋嫨鏈湴鍥剧墖</span>
          </div>
        </div>

        <!-- 璋冭妭鍖?-->
        <div class="space-y-5">
          <!-- 妯＄硦搴?-->
          <div class="space-y-2">
            <div class="flex justify-between items-center text-xs text-white/60">
              <span>妯＄硦搴?/span>
              <span>{{ preview.blur }}px</span>
            </div>
            <input 
              type="range" min="0" max="50" step="1"
              v-model.number="preview.blur"
              class="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#EC4141]"
            />
          </div>

          <!-- 钂欏眰閫忔槑搴?-->
          <div class="space-y-2">
            <div class="flex justify-between items-center text-xs text-white/60">
              <span>閬僵娴撳害</span>
              <span>{{ Math.round(preview.maskAlpha * 100) }}%</span>
            </div>
            <input 
              type="range" min="0" max="1" step="0.01"
              v-model.number="preview.maskAlpha"
              class="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#EC4141]"
            />
          </div>

          <!-- 鍥剧墖浜害 (Opacity) -->
          <div class="space-y-2">
            <div class="flex justify-between items-center text-xs text-white/60">
              <span>鑳屾櫙浜害</span>
              <span>{{ Math.round(preview.opacity * 100) }}%</span>
            </div>
            <input 
              type="range" min="0.1" max="1" step="0.01"
              v-model.number="preview.opacity"
              class="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#EC4141]"
            />
          </div>

          <!-- 缂╂斁 -->
          <div class="space-y-2">
            <div class="flex justify-between items-center text-xs text-white/60">
              <span>鐢婚潰缂╂斁</span>
              <span>{{ preview.scale.toFixed(2) }}x</span>
            </div>
            <input 
              type="range" min="1" max="1.5" step="0.01"
              v-model.number="preview.scale"
              class="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#EC4141]"
            />
          </div>

          <!-- 瀛椾綋閫傚簲 -->
          <div class="space-y-2">
            <div class="flex justify-between items-center text-xs text-white/60">
              <span>瀛椾綋閫傚簲</span>
            </div>
            <div class="flex bg-white/10 rounded-lg p-1 gap-1">
              <button 
                v-for="opt in ['auto', 'light', 'dark']" 
                :key="opt"
                @click="preview.foregroundStyle = opt as any"
                class="flex-1 py-1.5 text-xs rounded-md transition-all font-medium"
                :class="preview.foregroundStyle === opt ? 'bg-[#EC4141] text-white shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'"
              >
                {{ opt === 'auto' ? '鑷姩' : opt === 'light' ? '娴呰壊' : '娣辫壊' }}
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

      <!-- 搴曢儴鎸夐挳 -->
      <div class="px-6 py-4 flex gap-4 border-t border-white/10 bg-[#242424]">
        <button @click="handleCancel" class="flex-1 py-2.5 rounded-full border border-white/10 text-sm font-medium hover:bg-white/5 transition">鍙栨秷</button>
        <button 
          @click="handleSave" 
          :disabled="!preview.imagePath"
          class="flex-1 py-2.5 rounded-full bg-[#EC4141] text-white font-bold text-sm hover:bg-[#d13a3a] transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#EC4141]"
        >
          淇濆瓨骞朵娇鐢?        </button>
      </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: white;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(0,0,0,0.3);
}
</style>
