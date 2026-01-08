<script setup lang="ts">
import { ref, onMounted } from 'vue';

const emit = defineEmits(['refresh']);
const loading = ref(false);
const lastUpdated = ref<Date | null>(null);

const handleRefresh = async () => {
  loading.value = true;
  emit('refresh');
  lastUpdated.value = new Date();
  // Loading 状态由父组件控制，这里只做 UI 反馈
  setTimeout(() => {
    loading.value = false;
  }, 500);
};

onMounted(() => {
  lastUpdated.value = new Date();
});
</script>

<template>
  <div class="px-6 shrink-0 select-none flex flex-col pt-2 pb-3 h-auto justify-center">
    <div class="flex items-center justify-between">
      <!-- 左侧标题 -->
      <div class="flex items-center gap-6 relative pb-1">
        <span class="text-gray-900 dark:text-white font-bold text-xl">
          曲库统计
        </span>
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
