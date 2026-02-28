<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../../composables/toast';

const toast = useToast();

const props = defineProps<{
  targetPath: string;
}>();

const emit = defineEmits<{
  (e: 'next'): void;
  (e: 'back'): void;
}>();

interface RenamePreview {
  original_path: string;
  original_name: string;
  new_name: string;
  status: string;
  error?: string;
}

const TOOLBOX_TEMPLATE_KEY = 'toolbox_default_template';
const customTemplate = ref('{title} - {artist}');
const isScanning = ref(false);
const isApplying = ref(false);
const previewItems = ref<RenamePreview[]>([]);
const hasScanned = ref(false);

const presets = [
  { label: '歌名 - 歌手', example: '七里香 - 周杰伦', value: '{title} - {artist}' },
  { label: '歌手 - 歌名', example: '周杰伦 - 七里香', value: '{artist} - {title}' },
  { label: '轨道. 歌名', example: '01. 七里香', value: '{track}. {title}' },
];

const variables = [
  { code: '{title}', name: '标题' },
  { code: '{artist}', name: '歌手' },
  { code: '{album}', name: '专辑' },
  { code: '{year}', name: '年份' },
  { code: '{track}', name: '轨道号' },
];

onMounted(() => {
  const saved = localStorage.getItem(TOOLBOX_TEMPLATE_KEY);
  if (saved) {
    customTemplate.value = saved;
  }
});

const setAsDefault = () => {
  localStorage.setItem(TOOLBOX_TEMPLATE_KEY, customTemplate.value);
  toast.showToast('已设为默认模板', 'success');
};

const insertVariable = (variable: string) => {
  customTemplate.value += variable;
};

const handleScan = async () => {
  if (!props.targetPath) return;
  isScanning.value = true;
  try {
    const config = {
      mode: 'tags',
      template: customTemplate.value,
      remove_track_prefix: false,
      remove_source_prefix: false,
    };
    const res = await invoke<RenamePreview[]>('preview_rename', {
      rootPath: props.targetPath,
      config,
    });
    previewItems.value = res;
    hasScanned.value = true;
  } catch (e) {
    console.error(e);
    toast.showToast(`扫描失败: ${e}`, 'error');
  } finally {
    isScanning.value = false;
  }
};

const validItems = computed(() => 
  previewItems.value.filter(i => i.status === 'tags' && !i.error)
);

const skippedItems = computed(() => 
  previewItems.value.filter(i => i.status === 'skipped')
);

const handleApply = async () => {
  if (validItems.value.length === 0) {
    emit('next');
    return;
  }
  
  isApplying.value = true;
  try {
    const operations = validItems.value.map(item => ({
      original_path: item.original_path,
      new_name: item.new_name
    }));
    
    const count = await invoke<number>('apply_rename', { operations });
    toast.showToast(`成功重命名 ${count} 个文件`, 'success');
    emit('next');
  } catch (e) {
    console.error(e);
    toast.showToast(`应用修改失败: ${e}`, 'error');
  } finally {
    isApplying.value = false;
  }
};
</script>

<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <!-- 步骤说明 -->
    <div class="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl p-4">
      <div class="flex items-start gap-3">
        <span class="text-2xl">📝</span>
        <div>
          <h4 class="font-bold text-green-800 dark:text-green-300">标准化重命名</h4>
          <p class="text-sm text-green-600 dark:text-green-400 mt-1">
            根据歌曲标签信息，按照指定模板批量重命名文件
          </p>
        </div>
      </div>
    </div>

    <!-- 命名模板配置 -->
    <section class="space-y-4">
      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">命名模板</label>
      
      <!-- 预设模板 -->
      <div class="flex flex-wrap gap-2">
        <button 
          v-for="preset in presets" 
          :key="preset.value"
          @click="customTemplate = preset.value"
          class="px-3 py-1.5 rounded-lg text-xs font-medium border transition"
          :class="customTemplate === preset.value ? 'bg-[#EC4141] text-white border-[#EC4141]' : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:border-gray-300'"
        >
          {{ preset.label }}
          <span class="opacity-60 ml-1">({{ preset.example }})</span>
        </button>
      </div>

      <!-- 自定义模板输入 -->
      <div class="flex gap-3">
        <input 
          type="text" 
          v-model="customTemplate" 
          placeholder="输入自定义模板..." 
          class="flex-1 pl-4 pr-4 py-3 rounded-lg bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#EC4141] focus:border-transparent text-gray-800 dark:text-gray-100 font-mono text-sm"
        />
        <button
          @click="setAsDefault"
          :disabled="!customTemplate"
          class="px-4 py-2 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-300 text-sm font-medium transition disabled:opacity-40"
        >
          设为默认
        </button>
      </div>

      <!-- 可用变量 -->
      <div class="space-y-2">
        <div class="text-xs font-medium text-gray-500 dark:text-gray-400">点击变量插入到末尾:</div>
        <div class="flex flex-wrap gap-2">
          <button 
            v-for="v in variables" 
            :key="v.code"
            @click="insertVariable(v.code)"
            class="px-3 py-1.5 rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-[#EC4141] transition text-xs"
          >
            <span class="font-mono font-bold text-gray-700 dark:text-gray-300">{{ v.code }}</span>
            <span class="text-gray-400 ml-1">{{ v.name }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- 扫描按钮 -->
    <button 
      @click="handleScan"
      :disabled="!props.targetPath || isScanning"
      class="w-full px-6 py-3 rounded-xl bg-gray-800 dark:bg-white/10 text-white font-medium hover:bg-gray-700 dark:hover:bg-white/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      <svg v-if="isScanning" class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      {{ isScanning ? '扫描中...' : (hasScanned ? '重新扫描' : '扫描并预览') }}
    </button>

    <!-- 预览结果 -->
    <div v-if="hasScanned" class="space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="font-bold text-gray-800 dark:text-gray-200">扫描结果</h4>
        <div class="text-sm space-x-3">
          <span class="text-green-600">✨ {{ validItems.length }} 个可重命名</span>
          <span v-if="skippedItems.length > 0" class="text-gray-400">⚠️ {{ skippedItems.length }} 个跳过</span>
        </div>
      </div>
      
      <div v-if="validItems.length === 0" class="text-center py-8 text-gray-500">
        <span class="text-4xl mb-2 block">📭</span>
        <p>没有找到可以重命名的文件</p>
        <p class="text-sm mt-1">请确保歌曲已写入标签信息</p>
      </div>
      
      <div v-else class="max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-white/10">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 dark:bg-white/5 sticky top-0">
            <tr>
              <th class="px-4 py-2 text-left text-gray-500 font-medium">原文件名</th>
              <th class="px-2 py-2 text-center text-gray-400 w-8">→</th>
              <th class="px-4 py-2 text-left text-gray-500 font-medium">新文件名</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-white/5">
            <tr v-for="item in validItems" :key="item.original_path" class="hover:bg-gray-50 dark:hover:bg-white/5">
              <td class="px-4 py-2 text-gray-600 dark:text-gray-400 truncate max-w-xs">{{ item.original_name }}</td>
              <td class="px-2 py-2 text-center text-green-500">→</td>
              <td class="px-4 py-2 text-gray-900 dark:text-white font-medium truncate max-w-xs">{{ item.new_name }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 底部按钮 -->
    <div class="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
      <button 
        @click="emit('back')"
        class="flex-1 px-6 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition"
      >
        返回上一步
      </button>
      <button 
        @click="handleApply"
        :disabled="isApplying || (!hasScanned)"
        class="flex-1 px-6 py-3 rounded-xl bg-[#EC4141] text-white font-bold hover:bg-[#d13a3a] transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <svg v-if="isApplying" class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {{ validItems.length > 0 ? `应用重命名 (${validItems.length})` : '继续下一步' }}
      </button>
    </div>
  </div>
</template>
