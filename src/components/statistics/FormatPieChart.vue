<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';

const props = defineProps<{
  flac: number;
  mp3: number;
  alac: number;
  wav: number;
  aiff: number;
  aac: number;
  ogg: number;
  other: number;
}>();

// --- 动画数字工具 ---
const useAnimatedNumber = (target: number, duration = 1500) => {
  const current = ref(0);
  
  const animate = () => {
    const start = current.value;
    const startTime = performance.now();
    
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // EaseOutQuart
      const ease = 1 - Math.pow(1 - progress, 4);
      
      current.value = start + (target - start) * ease;
      
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };
    
    requestAnimationFrame(tick);
  };

  watch(() => target, () => {
    animate();
  });

  onMounted(() => {
    animate();
  });
  
  return current;
};

// --- 数据计算 ---
const total = computed(() => props.flac + props.mp3 + props.alac + props.wav + props.aiff + props.aac + props.ogg + props.other);

// 原始数据定义
const rawData = computed(() => [
  { 
    id: 'flac',
    name: 'FLAC', 
    label: '无损',
    value: props.flac, 
    startColor: '#f59e0b', // Amber 500
    endColor: '#fbbf24',   // Amber 400
    bgClass: 'bg-gradient-to-br from-amber-400 to-amber-600',
    shadowColor: 'rgba(245, 158, 11, 0.5)'
  },
  { 
    id: 'mp3',
    name: 'MP3', 
    label: '有损',
    value: props.mp3, 
    startColor: '#3b82f6', // Blue 500
    endColor: '#60a5fa',   // Blue 400
    bgClass: 'bg-gradient-to-br from-blue-400 to-blue-600',
    shadowColor: 'rgba(59, 130, 246, 0.5)'
  },
  { 
    id: 'alac',
    name: 'ALAC', 
    label: '无损',
    value: props.alac, 
    startColor: '#10b981', // Emerald 500
    endColor: '#34d399',   // Emerald 400
    bgClass: 'bg-gradient-to-br from-emerald-400 to-emerald-600',
    shadowColor: 'rgba(16, 185, 129, 0.5)'
  },
  { 
    id: 'wav',
    name: 'WAV', 
    label: '无损',
    value: props.wav, 
    startColor: '#8b5cf6', // Violet 500
    endColor: '#a78bfa',   // Violet 400
    bgClass: 'bg-gradient-to-br from-violet-400 to-violet-600',
    shadowColor: 'rgba(139, 92, 246, 0.5)'
  },
  {
    id: 'aiff',
    name: 'AIFF',
    label: '鏃犳崯',
    value: props.aiff,
    startColor: '#14b8a6',
    endColor: '#2dd4bf',
    bgClass: 'bg-gradient-to-br from-teal-400 to-teal-600',
    shadowColor: 'rgba(20, 184, 166, 0.5)'
  },
  {
    id: 'aac',
    name: 'AAC/MP4',
    label: '有损',
    value: props.aac, 
    startColor: '#ec4899', // Pink 500
    endColor: '#f472b6',   // Pink 400
    bgClass: 'bg-gradient-to-br from-pink-400 to-pink-600',
    shadowColor: 'rgba(236, 72, 153, 0.5)'
  },
  {
    id: 'ogg',
    name: 'OGG',
    label: '鏈夋崯',
    value: props.ogg,
    startColor: '#6366f1',
    endColor: '#818cf8',
    bgClass: 'bg-gradient-to-br from-indigo-400 to-indigo-600',
    shadowColor: 'rgba(99, 102, 241, 0.5)'
  },
  { 
    id: 'other',
    name: '其他', 
    label: 'Other',
    value: props.other, 
    startColor: '#6b7280', // Gray 500
    endColor: '#9ca3af',   // Gray 400
    bgClass: 'bg-gradient-to-br from-gray-400 to-gray-600',
    shadowColor: 'rgba(107, 114, 128, 0.5)'
  },
]);

// 交互状态
const hoveredSegmentId = ref<string | null>(null);

// 计算分段数据
const segments = computed(() => {
  if (total.value === 0) return [];
  
  let currentAngle = 0;
  const radius = 40; // SVG viewBox 0 0 100 100, center 50 50
  const circumference = 2 * Math.PI * radius;
  
  return rawData.value.map(item => {
    const percentage = (item.value / total.value) * 100;
    const dashArray = (percentage / 100) * circumference;
    
    const segmentObj = {
      ...item,
      percentage: percentage,
      displayPercentage: percentage.toFixed(1),
      strokeDasharray: `${dashArray} ${circumference - dashArray}`,
      strokeDashoffset: -currentAngle,
      angle: currentAngle,
    };
    
    currentAngle += (percentage / 100) * circumference;
    
    return segmentObj;
  }).filter(s => s.value > 0);
});

// 总数动画
const animatedTotal = useAnimatedNumber(total.value, 2000);

</script>

<template>
  <div class="flex flex-col md:flex-row items-center justify-center gap-12 p-8 w-full max-w-4xl mx-auto">
    
    <!-- 左侧：酷炫饼图 -->
    <div class="relative group cursor-default">
      <!-- Glow Effect Layer (Behind) -->
      <div class="absolute inset-0 bg-fuchsia-500/20 rounded-full blur-3xl transform scale-75 opacity-50 group-hover:opacity-80 transition-opacity duration-1000"></div>
      
      <div class="relative w-64 h-64 md:w-80 md:h-80 transition-transform duration-500 hover:scale-105">
        <svg class="w-full h-full transform -rotate-90 drop-shadow-2xl" viewBox="0 0 100 100">
          <!-- Definitions for Gradients and Filters -->
          <defs>
            <filter id="format-glow-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            
            <linearGradient v-for="seg in rawData" :key="`format-grad-${seg.id}`" :id="`format-grad-${seg.id}`" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" :stop-color="seg.startColor" />
              <stop offset="100%" :stop-color="seg.endColor" />
            </linearGradient>
          </defs>
          
          <!-- Background Track -->
          <circle
            cx="50" cy="50" r="40"
            fill="none"
            stroke="#e5e7eb"
            class="dark:stroke-white/5"
            stroke-width="8"
          />
          
          <!-- Segments -->
          <circle
            v-for="(seg, index) in segments"
            :key="seg.id"
            cx="50" cy="50" r="40"
            fill="none"
            :stroke="`url(#format-grad-${seg.id})`"
            :stroke-width="hoveredSegmentId === seg.id ? 10 : 8"
            stroke-linecap="round"
            :stroke-dasharray="seg.strokeDasharray"
            :stroke-dashoffset="seg.strokeDashoffset"
            class="transition-all duration-300 cursor-pointer"
            :class="{ 'opacity-30': hoveredSegmentId && hoveredSegmentId !== seg.id }"
            @mouseenter="hoveredSegmentId = seg.id"
            @mouseleave="hoveredSegmentId = null"
            style="transform-origin: 50px 50px;"
          >
            <!-- CSS Animation for initial draw -->
            <animate attributeName="stroke-dashoffset" 
              :from="seg.strokeDashoffset + 251.2" 
              :to="seg.strokeDashoffset" 
              dur="1s" 
              calcMode="spline" 
              keySplines="0.16 1 0.3 1"
              fill="freeze" 
              :begin="`${index * 0.1}s`"
            />
          </circle>
        </svg>

        <!-- Center Info -->
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div class="text-center">
            <span class="block text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tighter tabular-nums">
              {{ Math.round(animatedTotal) }}<span class="text-xl md:text-2xl text-fuchsia-500"> 首</span>
            </span>
            <span class="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">格式分布</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧：交互式图例 -->
    <div class="flex flex-col gap-4 min-w-[200px] w-full max-w-xs">
      <div 
        v-for="(seg, index) in segments" 
        :key="seg.id"
        class="group/item relative p-3 rounded-xl transition-all duration-300 cursor-pointer overflow-hidden border border-transparent animate-slide-in"
        :class="[
           hoveredSegmentId === seg.id ? 'bg-gray-100/80 dark:bg-white/10 border-gray-200 dark:border-white/10 scale-105' : 'hover:bg-gray-50 dark:hover:bg-white/5'
        ]"
        @mouseenter="hoveredSegmentId = seg.id"
        @mouseleave="hoveredSegmentId = null"
        :style="{ animationDelay: `${0.5 + index * 0.1}s` }"
      >
        <!-- Background Progress Bar (subtle) -->
        <div 
          class="absolute bottom-0 left-0 h-1 transition-all duration-1000 ease-out opacity-20 dark:opacity-40"
          :class="seg.bgClass"
          :style="{ width: hoveredSegmentId === seg.id ? '100%' : '0%' }"
        ></div>

        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-3">
             <!-- Icon / Dot -->
            <div class="w-3 h-3 rounded-full shadow-lg" :class="seg.bgClass" :style="{ boxShadow: `0 0 10px ${seg.shadowColor}` }"></div>
            <span class="font-bold text-gray-700 dark:text-gray-200">{{ seg.name }}</span>
            <span class="text-[10px] text-gray-400 border border-gray-200 dark:border-white/10 px-1 rounded">{{ seg.label }}</span>
          </div>
          <span class="font-mono font-medium text-gray-900 dark:text-white tabular-nums">
            {{ seg.value.toLocaleString() }}
          </span>
        </div>
        
        <!-- Progress Bar Visual inside legend -->
        <div class="w-full h-1.5 bg-gray-100 dark:bg-white/10 rounded-full mt-2 overflow-hidden">
          <div 
            class="h-full rounded-full transition-all duration-1000 ease-out"
            :class="seg.bgClass"
            :style="{ width: `${seg.percentage}%` }"
          ></div>
        </div>
        
        <div class="flex justify-end mt-1">
             <span class="text-xs text-gray-400 font-medium">{{ seg.displayPercentage }}%</span>
        </div>

      </div>
    </div>

  </div>
</template>

<style scoped>
.animate-slide-in {
  opacity: 0;
  animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
