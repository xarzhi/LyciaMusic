<template>
  <div class="settings-content">
    
    <div class="setting-item-group">

      <!-- 拖拽区域 -->
      <div 
        class="drop-zone" 
        :class="{ 'drop-zone--active': isDragging }"
      >
        <div class="drop-zone-inner">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="drop-zone-icon">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          <line x1="12" y1="11" x2="12" y2="17"/>
          <polyline points="9 14 12 11 15 14"/>
        </svg>
        <template v-if="isDragging">
          <p class="drop-zone-text highlight">松开鼠标以添加文件夹</p>
        </template>
        <template v-else-if="libraryFolders.length === 0">
          <p class="drop-zone-text highlight">暂无文件夹，点击添加文件夹开始添加本地音乐</p>
          <p class="drop-zone-hint">或将文件夹拖拽至此区域</p>
        </template>
        <template v-else>
          <p class="drop-zone-text">拖拽文件夹至此区域导入至本地音乐库</p>
        </template>
        </div>
      </div>

      <!-- 全宽添加文件夹按钮 -->
      <button class="add-folder-btn" @click="handleAddLibraryFolder">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        导入文件夹
      </button>

      <!-- 已添加的文件夹列表 -->
      <div v-if="libraryFolders.length > 0" class="library-list">
        <div v-for="folder in libraryFolders" :key="folder.path" class="library-item">
          <div class="folder-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="folder-info">
            <div class="folder-path" :title="folder.path">{{ folder.path }}</div>
            <div class="folder-stats">{{ folder.song_count }} 首歌曲</div>
          </div>
          <button class="remove-btn" @click="requestRemove(folder.path)" title="移除文件夹">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 重新扫描按钮 -->
      <button v-if="libraryFolders.length > 0" class="rescan-btn" @click="handleRescan" :disabled="isScanning">
        <svg :class="{ spinning: isScanning }" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
        </svg>
        {{ isScanning ? '扫描中...' : '重新扫描' }}
      </button>
    </div>

    <!-- 删除确认弹窗 -->
    <ConfirmModal
      :visible="showConfirm"
      title="移除文件夹"
      :content="confirmContent"
      @confirm="confirmRemove"
      @cancel="showConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { usePlayer } from '../../composables/player';
import { libraryFolders } from '../../composables/playerState';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useToast } from '../../composables/toast';
import ConfirmModal from '../overlays/ConfirmModal.vue';

const { addLibraryFolderLinked, removeLibraryFolderLinked, scanLibrary } = usePlayer();
const isScanning = ref(false);
const isDragging = ref(false);

// --- ConfirmModal 状态 ---
const showConfirm = ref(false);
const folderToRemove = ref('');
const confirmContent = ref('');

const handleAddLibraryFolder = async () => {
  const selected = await open({ directory: true, multiple: false, title: '选择音乐文件夹' });
  if (selected && typeof selected === 'string') {
    await addLibraryFolderLinked(selected, { showToast: true });
  }
};

const requestRemove = (path: string) => {
  folderToRemove.value = path;
  confirmContent.value = `确定要从音乐库中移除 "${path}" 吗？\n歌曲将从"本地音乐"视图中消失。`;
  showConfirm.value = true;
};

const confirmRemove = async () => {
  showConfirm.value = false;
  if (folderToRemove.value) {
    await removeLibraryFolderLinked(folderToRemove.value);
    folderToRemove.value = '';
  }
};

const handleRescan = async () => {
  if (isScanning.value) return;
  isScanning.value = true;
  await scanLibrary();
  isScanning.value = false;
};

// --- Tauri 拖放支持 ---
let unlistenDrop: (() => void) | null = null;
let unlistenDragOver: (() => void) | null = null;
let unlistenDragLeave: (() => void) | null = null;

onMounted(async () => {
  // 监听文件 drop 事件
  unlistenDrop = await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
    isDragging.value = false;
    const paths = event.payload.paths || [];
    let added = 0;
    for (const p of paths) {
      try {
        // 检查是否为文件夹
        const isDir = await invoke<boolean>('is_directory', { path: p });
        if (isDir) {
          await addLibraryFolderLinked(p);
          added++;
        }
      } catch (e) {
        console.error('Failed to add dropped folder:', e);
      }
    }
    if (added > 0) {
      // 刷新文件夹列表 & 扫描
      useToast().showToast(`已导入 ${added} 个文件夹`, 'success');
    } else if (paths.length > 0) {
      useToast().showToast('拖入的不是文件夹，请拖入包含音乐的文件夹', 'error');
    }
  });

  unlistenDragOver = await listen('tauri://drag-over', () => {
    isDragging.value = true;
  });

  unlistenDragLeave = await listen('tauri://drag-leave', () => {
    isDragging.value = false;
  });
});

onUnmounted(() => {
  unlistenDrop?.();
  unlistenDragOver?.();
  unlistenDragLeave?.();
});
</script>

<style scoped>
.settings-content {
  padding: 0 10px;
}

/* 已移除 .section-title */

.setting-item-group {
  border-radius: 12px;
  /* 去除外层的一些冗余背景，让内部的拖拽区凸显 */
}

.group-desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 0;
  line-height: 1.5;
  width: 100%;
  text-align: center;
}

/* --- 拖拽区域 --- */
.drop-zone {
  display: flex;
  flex-direction: column;
  padding: 20px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.04);
  margin-bottom: 16px;
  transition: all 0.25s ease;
  cursor: default;
}

.drop-zone-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 0 20px;
}

.drop-zone--active {
  border-color: var(--primary-color, #4cc9f0);
  background: rgba(76, 201, 240, 0.08);
}

.drop-zone-icon {
  color: var(--text-secondary);
  opacity: 0.5;
  margin-bottom: 12px;
  transition: all 0.25s;
}

.drop-zone--active .drop-zone-icon {
  color: var(--primary-color, #4cc9f0);
  opacity: 1;
}

.drop-zone-text {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin: 0;
  text-align: center;
}

.drop-zone-text.highlight {
  color: #EC4141;
  font-weight: 600;
  font-size: 1rem;
}

.drop-zone--active .drop-zone-text {
  color: var(--primary-color, #4cc9f0);
  font-weight: 600;
}

.drop-zone-hint {
  font-size: 0.82rem;
  color: var(--text-secondary);
  opacity: 0.6;
  margin: 6px 0 0;
}

/* --- 全宽添加文件夹按钮 --- */
.add-folder-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 0;
  border-radius: 10px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  background: rgba(128, 128, 128, 0.08); /* 使用中灰透明，在任何背景都可见 */
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 16px;
}

.add-folder-btn:hover {
  background: rgba(128, 128, 128, 0.18);
  border-color: rgba(128, 128, 128, 0.4);
  transform: translateY(-1px);
}

.add-folder-btn:active {
  transform: translateY(0);
}

/* --- 已添加文件夹列表 --- */
.library-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.library-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.2s;
}

.library-item:hover {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.12);
}

.folder-icon {
  color: var(--text-secondary);
  opacity: 0.6;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.folder-info {
  flex: 1;
  min-width: 0;
}

.folder-path {
  font-size: 0.95rem;
  color: var(--text-primary);
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-stats {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.remove-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.remove-btn:hover {
  background: rgba(255, 0, 0, 0.12);
  color: #ff4d4f;
}

/* --- 重新扫描按钮 --- */
.rescan-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 0;
  border-radius: 10px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  background: rgba(128, 128, 128, 0.08);
  color: var(--text-primary);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.rescan-btn:hover:not(:disabled) {
  background: rgba(128, 128, 128, 0.18);
  border-color: rgba(128, 128, 128, 0.4);
}

.rescan-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
