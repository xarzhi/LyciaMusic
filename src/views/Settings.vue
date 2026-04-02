<script setup lang="ts">
import { ref } from 'vue';
import SettingsGeneral from "../components/settings/SettingsGeneral.vue";
import SettingsTheme from "../components/settings/SettingsTheme.vue";
import SettingsSidebar from "../components/settings/SettingsSidebar.vue";
import SettingsToolbox from "../components/settings/SettingsToolbox.vue";
import SettingsAbout from "../components/settings/SettingsAbout.vue";
import SettingsLibrary from "../components/settings/SettingsLibrary.vue"; // Added import
import SettingsShortcuts from "../components/settings/SettingsShortcuts.vue";

// 定义 Tabs
const activeTab = ref<'general' | 'theme' | 'sidebar' | 'toolbox' | 'library' | 'shortcuts' | 'about'>('general'); // Updated type

const tabs = [
  { id: 'general', name: '常规' },
  { id: 'theme', name: '外观' },
  { id: 'sidebar', name: '侧边栏管理' },
  { id: 'toolbox', name: '工具箱' },
  { id: 'library', name: '音乐库' }, // Added tab
  { id: 'shortcuts', name: '快捷键' },
  { id: 'about', name: '关于' }
];
</script>

<template>
  <div class="flex-1 h-full flex overflow-hidden transition-colors duration-500">

    <!-- Secondary Sidebar -->
    <aside class="w-[220px] md:w-[240px] shrink-0 border-r border-white/20 dark:border-white/5 flex flex-col p-4 z-10">
      

      <nav class="flex-1 space-y-1.5 overflow-y-auto custom-scrollbar">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id as any"
          class="w-full text-left px-4 py-2.5 rounded-md text-sm transition-all duration-300 relative flex items-center cursor-pointer active:scale-[0.97]"
          :class="activeTab === tab.id ? 'bg-black/10 dark:bg-white/10 text-black dark:text-white font-semibold shadow-sm translate-x-1' : 'text-gray-800 dark:text-gray-200 font-medium hover:bg-black/5 dark:hover:bg-white/5 hover:text-black dark:hover:text-white hover:translate-x-1'"
        >
          <!-- Active Indicator -->
          <div
            v-if="activeTab === tab.id"
            class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-[18px] bg-[#EC4141] rounded-r-md"
          ></div>
          {{ tab.name }}
        </button>
      </nav>
    </aside>

    <!-- Content Pane -->
    <main class="flex-1 min-w-0 h-full overflow-y-auto px-10 py-10 xl:px-16 custom-scrollbar relative">
      <div class="w-full max-w-5xl mx-auto pb-16">
        <SettingsGeneral v-if="activeTab === 'general'" />
        <SettingsTheme v-else-if="activeTab === 'theme'" />
        <SettingsSidebar v-else-if="activeTab === 'sidebar'" />
        <SettingsToolbox v-else-if="activeTab === 'toolbox'" />
        <SettingsLibrary v-else-if="activeTab === 'library'" />
        <SettingsShortcuts v-else-if="activeTab === 'shortcuts'" />
        <SettingsAbout v-else-if="activeTab === 'about'" />

        <div v-else class="flex flex-col items-center justify-center h-[50vh] text-gray-400 space-y-4">
          <div class="text-4xl opacity-50">🚧</div>
          <div>{{ activeTab === 'shortcuts' ? '快捷键设置' : '关于信息' }} 模块正在施工中...</div>
        </div>
      </div>
    </main>

  </div>
</template>

<style scoped>
</style>
