<template>
  <div class="select-none text-gray-800 dark:text-gray-200">
    <!-- Folder Row -->
    <div 
      class="flex items-center px-2 py-1.5 rounded-md cursor-pointer transition-colors group relative folder-drop-target"
      :data-folder-path="node.path"
      :data-folder-name="node.name"
      :class="[
        isSelected ? 'bg-blue-500/10 text-blue-500 dark:text-blue-400' : 'hover:bg-black/5 dark:hover:bg-white/5',
        isTarget ? 'ring-2 ring-blue-500 bg-blue-50/50 dark:bg-blue-900/20 z-10' : ''
      ]"
      @click.stop="handleSelectAndExpand"
      @mousemove="handleMouseMoveDrag"
      @mouseleave="handleMouseLeaveDrag"
      @contextmenu.prevent.stop="handleContextMenu"
    >
      <!-- Indentation -->
      <div :style="{ width: `${depth * 16}px` }" class="shrink-0 transition-all"></div>



      <!-- Icon/Cover -->
      <div class="w-9 h-9 rounded shrink-0 mr-2 overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center border border-black/5 dark:border-white/5 relative">
         <img v-if="coverUrl" :src="coverUrl" class="w-full h-full object-cover transition-opacity duration-300" />
         <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
      </div>

      <!-- Name & Count -->
      <div class="flex-1 min-w-0 flex flex-col justify-center">
        <div class="text-sm font-medium truncate leading-tight">{{ node.name }}</div>
        <div 
          class="text-[10px] truncate mt-0.5 flex items-center gap-1"
          :class="node.children.length > 0 
            ? 'text-blue-500 dark:text-blue-400' 
            : 'text-gray-500 dark:text-gray-400'"
        >
          <svg v-if="node.children.length > 0" xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <span>{{ node.children.length > 0 ? node.children.length + ' 文件夹' : node.song_count + ' 首' }}</span>
        </div>
      </div>
    </div>

    <!-- Children Transition -->
    <transition
      name="folder-expand"
      @before-enter="beforeEnter"
      @enter="enter"
      @enter-cancelled="afterEnter"
      @after-enter="afterEnter"
      @leave="leave"
      @after-leave="afterLeave"
    >
      <div v-show="node.is_expanded" class="overflow-hidden" ref="expandContainer">
        <FolderTreeItem 
          v-for="child in node.children" 
          :key="child.path" 
          :node="child" 
          :depth="depth + 1"
          :selectedPath="selectedPath"
          @select="(n) => $emit('select', n)"
          @contextmenu="(p) => $emit('contextmenu', p)"
        />
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { FolderNode, dragSession } from '../../composables/playerState'; // Note: dragSession is in playerState
import { computed, ref, onMounted, watch } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { invoke } from '@tauri-apps/api/core';

const props = defineProps<{
  node: FolderNode;
  depth: number;
  selectedPath: string;
}>();

const emit = defineEmits<{
  (e: 'select', node: FolderNode): void;
  (e: 'contextmenu', payload: { event: MouseEvent, node: FolderNode }): void;
}>();

const isSelected = computed(() => props.selectedPath === props.node.path);

// 🟢 Drag & Drop Logic
const isTarget = computed(() => {
  return dragSession.active && dragSession.type === 'song' && dragSession.targetFolder?.path === props.node.path;
});

const handleMouseMoveDrag = () => {
  if (dragSession.active && dragSession.type === 'song') {
      if (dragSession.targetFolder?.path !== props.node.path) {
          dragSession.targetFolder = { name: props.node.name, path: props.node.path };
      }
  }
};

const handleMouseLeaveDrag = () => {
    if (dragSession.active && dragSession.type === 'song' && dragSession.targetFolder?.path === props.node.path) {
        dragSession.targetFolder = null;
    }
};

const handleSelectAndExpand = () => {
  emit('select', props.node);
  // 切换展开/折叠状态
  props.node.is_expanded = !props.node.is_expanded;
};

const handleContextMenu = (e: MouseEvent) => {
  emit('contextmenu', { event: e, node: props.node });
};

const coverUrl = ref('');

const loadCover = async () => {
   if (!props.node.cover_song_path) {
       coverUrl.value = '';
       return;
   }

   try {
       const filePath = await invoke<string>('get_song_cover_thumbnail', { path: props.node.cover_song_path });
       coverUrl.value = filePath ? convertFileSrc(filePath) : '';
   } catch (e) {
       coverUrl.value = '';
       // console.error("Cover load failed", e);
   }
};

onMounted(loadCover);

watch(() => props.node.cover_song_path, loadCover);

// --- Animation Hooks ---
const beforeEnter = (el: Element) => {
  const element = el as HTMLElement;
  element.style.height = '0';
  element.style.opacity = '0';
};

const enter = (el: Element, done: () => void) => {
    const element = el as HTMLElement;
    element.offsetHeight; // Force reflow
    element.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)'; 
    element.style.height = element.scrollHeight + 'px';
    element.style.opacity = '1';
    
    const onTransitionEnd = (e: TransitionEvent) => {
        if (e.target === element && e.propertyName === 'height') {
             element.removeEventListener('transitionend', onTransitionEnd);
             done();
        }
    };
    element.addEventListener('transitionend', onTransitionEnd);
};

const afterEnter = (el: Element) => {
  const element = el as HTMLElement;
  element.style.height = 'auto'; // Release height
  element.style.opacity = '';
  element.style.transition = '';
};

const leave = (el: Element) => {
  const element = el as HTMLElement;
  // Lock height to pixel value before collapsing
  element.style.height = element.offsetHeight + 'px';
  element.offsetHeight; // Force reflow
  
  // Apply transition
  requestAnimationFrame(() => {
      element.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
      element.style.height = '0';
      element.style.opacity = '0';
  });
};

const afterLeave = (el: Element) => {
    const element = el as HTMLElement;
    element.style.transition = '';
    element.style.height = '';
    element.style.opacity = '';
};
</script>

<style scoped>
/* We handle transition in JS for dynamic height, but keep base styles if needed */
.folder-expand-move {
  transition: transform 0.3s ease;
}
</style>
