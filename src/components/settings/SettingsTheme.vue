<script setup lang="ts">
import { convertFileSrc } from '@tauri-apps/api/core';
import CustomSkinModal from './CustomSkinModal.vue';
import { useSettingsThemeControls } from '../../composables/useSettingsThemeControls';

const {
  theme,
  showCustomModal,
  colorScheme,
  materialMode,
  isWindows11,
  isWindowMaterialDisabled,
  isDynamicBgDisabled,
  setColorScheme,
  setDynamicType,
  toggleWindowMaterial,
  openCustomModal,
} = useSettingsThemeControls();
</script>

<template>
  <div class="max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <section class="space-y-3">
      <h2 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
        <span class="w-1 h-4 bg-[#EC4141] rounded-full"></span>
        配色方案
      </h2>
      <div class="bg-white/50 dark:bg-black/40 backdrop-blur-sm rounded-xl border border-gray-100/50 dark:border-white/5 p-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            class="group text-left rounded-xl overflow-hidden border transition-all"
            :class="colorScheme === 'dark' ? 'border-[#EC4141] shadow-sm' : 'border-gray-200/70 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'"
            @click="setColorScheme('dark')"
          >
            <div class="aspect-[4/3] bg-[#18181b] p-3 flex gap-2">
              <div class="w-[28%] rounded-lg bg-[#26272b]"></div>
              <div class="flex-1 flex flex-col gap-2">
                <div class="h-8 rounded-lg bg-[#2d2e33]"></div>
                <div class="flex-1 rounded-lg bg-[#202127]"></div>
              </div>
            </div>
            <div class="px-4 py-3 bg-black/20">
              <div class="text-sm font-medium text-white">深色</div>
              <p class="text-xs text-white/70 mt-1">适合夜间和较亮封面的曲目。</p>
            </div>
          </button>

          <button
            type="button"
            class="group text-left rounded-xl overflow-hidden border transition-all"
            :class="colorScheme === 'light' ? 'border-[#EC4141] shadow-sm' : 'border-gray-200/70 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'"
            @click="setColorScheme('light')"
          >
            <div class="aspect-[4/3] bg-[#f8fafc] p-3 flex gap-2">
              <div class="w-[28%] rounded-lg bg-white border border-gray-200/70"></div>
              <div class="flex-1 flex flex-col gap-2">
                <div class="h-8 rounded-lg bg-white border border-gray-200/70"></div>
                <div class="flex-1 rounded-lg bg-white border border-gray-200/70"></div>
              </div>
            </div>
            <div class="px-4 py-3 bg-white">
              <div class="text-sm font-medium text-gray-800">浅色</div>
              <p class="text-xs text-gray-500 mt-1">更干净，适合白天和轻量化视觉。</p>
            </div>
          </button>

          <button
            type="button"
            class="group text-left rounded-xl overflow-hidden border transition-all"
            :class="colorScheme === 'custom' ? 'border-[#EC4141] shadow-sm' : 'border-gray-200/70 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'"
            @click="setColorScheme('custom'); openCustomModal()"
          >
            <div class="aspect-[4/3] relative bg-gradient-to-br from-rose-100 to-amber-100 dark:from-rose-900/30 dark:to-amber-900/30">
              <img
                v-if="theme.customBackground.imagePath"
                :src="convertFileSrc(theme.customBackground.imagePath)"
                class="absolute inset-0 w-full h-full object-cover opacity-65"
              />
              <div class="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                <div class="text-3xl">🖼️</div>
                <div class="mt-2 text-sm font-medium text-gray-700 dark:text-gray-100">自定义皮肤</div>
                <div class="text-xs text-gray-500 dark:text-gray-300 mt-1">使用图片、遮罩和前景样式。</div>
              </div>
            </div>
            <div class="px-4 py-3 bg-white/80 dark:bg-black/40">
              <div class="text-sm font-medium text-gray-800 dark:text-gray-200">自定义</div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">启用后会自动关闭动态背景。</p>
            </div>
          </button>
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
        <span class="w-1 h-4 bg-[#EC4141] rounded-full"></span>
        动态背景
      </h2>
      <div
        class="bg-white/50 dark:bg-black/40 backdrop-blur-sm rounded-xl border border-gray-100/50 dark:border-white/5 p-4 space-y-4"
        :class="isDynamicBgDisabled ? 'opacity-50 pointer-events-none' : ''"
      >
        <div>
          <div class="text-sm font-medium text-gray-800 dark:text-gray-200">跟随封面变化</div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            将当前封面的色彩和模糊图像映射到主界面背景。
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            class="rounded-xl border px-4 py-3 text-left transition-all"
            :class="theme.dynamicBgType === 'none'
              ? 'border-[#EC4141] bg-[#EC4141]/8 shadow-sm'
              : 'border-gray-200/70 dark:border-white/10 hover:border-[#EC4141]/40 hover:bg-white/40 dark:hover:bg-white/5'"
            @click="setDynamicType('none')"
          >
            <div class="text-sm font-semibold text-gray-800 dark:text-gray-200">关闭</div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">保留纯净底色，更能看出系统材质。</p>
          </button>

          <button
            type="button"
            class="rounded-xl border px-4 py-3 text-left transition-all"
            :class="theme.dynamicBgType === 'flow'
              ? 'border-[#EC4141] bg-[#EC4141]/8 shadow-sm'
              : 'border-gray-200/70 dark:border-white/10 hover:border-[#EC4141]/40 hover:bg-white/40 dark:hover:bg-white/5'"
            @click="setDynamicType('flow')"
          >
            <div class="text-sm font-semibold text-gray-800 dark:text-gray-200">流光</div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">使用颜色网格动态扩散，氛围更强。</p>
          </button>

          <button
            type="button"
            class="rounded-xl border px-4 py-3 text-left transition-all"
            :class="theme.dynamicBgType === 'blur'
              ? 'border-[#EC4141] bg-[#EC4141]/8 shadow-sm'
              : 'border-gray-200/70 dark:border-white/10 hover:border-[#EC4141]/40 hover:bg-white/40 dark:hover:bg-white/5'"
            @click="setDynamicType('blur')"
          >
            <div class="text-sm font-semibold text-gray-800 dark:text-gray-200">静态模糊</div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">直接使用封面模糊图，风格更稳定。</p>
          </button>
        </div>

        <p v-if="isDynamicBgDisabled" class="text-xs text-amber-600 dark:text-amber-400">
          自定义皮肤或窗口材质启用时，动态背景会自动停用。
        </p>
      </div>
    </section>

    <section v-if="isWindows11" class="space-y-3">
      <h2 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
        <span class="w-1 h-4 bg-[#EC4141] rounded-full"></span>
        窗口材质
      </h2>
      <div
        class="bg-white/50 dark:bg-black/40 backdrop-blur-sm rounded-xl border border-gray-100/50 dark:border-white/5 p-4"
        :class="isWindowMaterialDisabled ? 'opacity-50 pointer-events-none' : ''"
      >
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            class="text-left rounded-xl border px-4 py-3 transition-all"
            :class="!isWindowMaterialDisabled && materialMode === 'acrylic'
              ? 'border-[#EC4141] bg-[#EC4141]/8 shadow-sm'
              : 'border-gray-200/70 dark:border-white/10 hover:border-[#EC4141]/40 hover:bg-white/40 dark:hover:bg-white/5'"
            :disabled="isWindowMaterialDisabled"
            :aria-disabled="isWindowMaterialDisabled"
            @click="toggleWindowMaterial('acrylic')"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-semibold text-gray-800 dark:text-gray-200">Acrylic</span>
              <span
                v-if="materialMode === 'acrylic'"
                class="w-5 h-5 rounded-full bg-[#EC4141] text-white flex items-center justify-center text-[11px]"
              >
                ✓
              </span>
            </div>
          </button>

          <button
            type="button"
            class="text-left rounded-xl border px-4 py-3 transition-all"
            :class="!isWindowMaterialDisabled && materialMode === 'mica'
              ? 'border-[#EC4141] bg-[#EC4141]/8 shadow-sm'
              : 'border-gray-200/70 dark:border-white/10 hover:border-[#EC4141]/40 hover:bg-white/40 dark:hover:bg-white/5'"
            :disabled="isWindowMaterialDisabled"
            :aria-disabled="isWindowMaterialDisabled"
            @click="toggleWindowMaterial('mica')"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-semibold text-gray-800 dark:text-gray-200">Mica</span>
              <span
                v-if="materialMode === 'mica'"
                class="w-5 h-5 rounded-full bg-[#EC4141] text-white flex items-center justify-center text-[11px]"
              >
                ✓
              </span>
            </div>
          </button>
        </div>
      </div>
      <p v-if="isWindowMaterialDisabled" class="text-xs text-amber-600 dark:text-amber-400">
        自定义皮肤或动态背景启用时，窗口材质会自动停用
      </p>
    </section>

    <CustomSkinModal v-if="showCustomModal" @close="showCustomModal = false" />
  </div>
</template>
