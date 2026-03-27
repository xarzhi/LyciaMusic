<script setup lang="ts">
import { ref } from 'vue';
import ToolboxStepIndicator from './ToolboxStepIndicator.vue';
import ToolboxStep1 from './ToolboxStep1.vue';
import ToolboxStep2 from './ToolboxStep2.vue';
import ToolboxStep3 from './ToolboxStep3.vue';
import ToolboxStep4 from './ToolboxStep4.vue';

const currentStep = ref(1);
const targetPath = ref('');

const steps = [
  { id: 1, name: '预处理', icon: '🧹' },
  { id: 2, name: '标签编辑', icon: '🏷️' },
  { id: 3, name: '重命名', icon: '📝' },
  { id: 4, name: '刷新', icon: '🔄' },
];

const nextStep = () => {
  if (currentStep.value < 4) {
    currentStep.value++;
  }
};

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--;
  }
};

const restart = () => {
  currentStep.value = 1;
  targetPath.value = '';
};
</script>

<template>
  <div class="max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10">
    
    <!-- 头部说明 -->
    <div class="mb-8">
      <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-2">音乐工具箱</h2>
      <p class="text-gray-500 dark:text-gray-400 text-sm">按照向导完成歌曲文件的批量整理工作</p>
    </div>

    <!-- 步骤指示器 -->
    <ToolboxStepIndicator :current-step="currentStep" :steps="steps" />

    <!-- 步骤内容区域 -->
    <div class="bg-white/30 dark:bg-black/20 backdrop-blur-md rounded-2xl border border-white/40 dark:border-white/10 p-6 shadow-sm">
      <!-- Step 1: 预处理 -->
      <ToolboxStep1 
        v-if="currentStep === 1"
        v-model:target-path="targetPath"
        @next="nextStep"
        @skip="nextStep"
      />

      <!-- Step 2: 标签编辑 -->
      <ToolboxStep2 
        v-if="currentStep === 2"
        :target-path="targetPath"
        @next="nextStep"
        @back="prevStep"
      />

      <!-- Step 3: 标准化重命名 -->
      <ToolboxStep3 
        v-if="currentStep === 3"
        :target-path="targetPath"
        @next="nextStep"
        @back="prevStep"
      />

      <!-- Step 4: 刷新信息 -->
      <ToolboxStep4 
        v-if="currentStep === 4"
        :target-path="targetPath"
        @back="prevStep"
        @restart="restart"
        @close="restart"
      />
    </div>

  </div>
</template>