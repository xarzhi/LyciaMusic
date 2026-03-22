<template>
  <div class="settings-content">
    <div class="setting-item-group">
      <div class="drop-zone">
        <div class="drop-zone-inner">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="drop-zone-icon">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <polyline points="9 14 12 11 15 14"/>
          </svg>

          <template v-if="libraryFolders.length === 0">
            <p class="drop-zone-text highlight">当前还没有音乐文件夹，点击下方按钮开始导入</p>
            <p class="drop-zone-hint">也可以直接把音频文件或文件夹拖入主窗口</p>
          </template>

          <template v-else>
            <p class="drop-zone-text">支持把音频文件或文件夹直接拖入主窗口进行播放或导入</p>
          </template>
        </div>
      </div>

      <button class="add-folder-btn" :disabled="isScanning" @click="handleAddLibraryFolder">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        导入文件夹
      </button>

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
          <button class="remove-btn" title="移除文件夹" @click="requestRemove(folder.path)">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
        </div>
      </div>

      <button v-if="libraryFolders.length > 0" class="rescan-btn" :disabled="isScanning" @click="handleRescan">
        <svg :class="{ spinning: isScanning }" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
        </svg>
        {{ isScanning ? '扫描中...' : '重新扫描' }}
      </button>
      <div v-if="isScanning && libraryScanProgress" class="scan-status-card">
        <div class="scan-status-header">
          <div class="scan-status-title">{{ scanStatusLabel }}</div>
          <div class="scan-status-count" v-if="libraryScanProgress.total > 0">
            {{ libraryScanProgress.current }}/{{ libraryScanProgress.total }}
          </div>
        </div>
        <div class="scan-status-bar">
          <div
            class="scan-status-bar-fill"
            :class="{ indeterminate: libraryScanProgress.total <= 0 }"
            :style="{ width: `${libraryScanProgress.total > 0 ? Math.min(100, Math.max(8, (libraryScanProgress.current / libraryScanProgress.total) * 100)) : 24}%` }"
          ></div>
        </div>
        <div v-if="libraryScanProgress.folder_path" class="scan-status-path" :title="libraryScanProgress.folder_path">
          {{ libraryScanProgress.folder_path }}
        </div>
      </div>

      <div v-else-if="lastLibraryScanError" class="scan-error-card">
        <div class="scan-error-title">上次扫描失败</div>
        <div class="scan-error-text">{{ lastLibraryScanError }}</div>
        <button class="scan-error-action" @click="handleRescan">重新扫描</button>
      </div>
    </div>

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
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { open } from '@tauri-apps/plugin-dialog';
import { usePlayer } from '../../composables/player';
import { useLibraryStore } from '../../features/library/store';
import ConfirmModal from '../overlays/ConfirmModal.vue';

const { addLibraryFolderLinked, removeLibraryFolderLinked, scanLibrary } = usePlayer();
const libraryStore = useLibraryStore();
const { libraryFolders, libraryScanProgress, lastLibraryScanError } = storeToRefs(libraryStore);
const isScanning = computed(() =>
  !!libraryScanProgress.value && !libraryScanProgress.value.done && !libraryScanProgress.value.failed
);
const scanStatusLabel = computed(() => {
  switch (libraryScanProgress.value?.phase) {
    case 'collecting':
      return '正在扫描文件';
    case 'parsing':
      return '正在解析歌曲信息';
    case 'writing':
      return '正在写入音乐库';
    case 'complete':
      return '扫描完成';
    case 'error':
      return '扫描失败';
    default:
      return '等待扫描';
  }
});
const showConfirm = ref(false);
const folderToRemove = ref('');
const confirmContent = ref('');

const handleAddLibraryFolder = async () => {
  const selected = await open({ directory: true, multiple: false, title: '选择音乐文件夹' });
  if (selected && typeof selected === 'string') {
    const isFirstImport = libraryFolders.value.length === 0;
    await addLibraryFolderLinked(selected, {
      showToast: !isFirstImport,
      scanOptions: {
        trigger: isFirstImport ? 'first-import' : 'folder-add',
        visibility: isFirstImport ? 'hero' : 'silent',
        sourcePath: selected,
      },
    });
  }
};

const requestRemove = (path: string) => {
  folderToRemove.value = path;
  confirmContent.value = `确定要从音乐库中移除 "${path}" 吗？\n歌曲会从“本地音乐”视图中消失。`;
  showConfirm.value = true;
};

const confirmRemove = async () => {
  showConfirm.value = false;
  if (!folderToRemove.value) return;

  await removeLibraryFolderLinked(folderToRemove.value);
  folderToRemove.value = '';
};

const handleRescan = async () => {
  if (isScanning.value) return;
  await scanLibrary({ trigger: 'manual-rescan', visibility: 'inline' });
};
</script>

<style scoped>
.settings-content {
  padding: 0 10px;
}

.setting-item-group {
  border-radius: 12px;
}

.drop-zone {
  display: flex;
  flex-direction: column;
  padding: 20px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.04);
  margin-bottom: 16px;
}

.drop-zone-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 0 20px;
}

.drop-zone-icon {
  color: var(--text-secondary);
  opacity: 0.5;
  margin-bottom: 12px;
}

.drop-zone-text {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin: 0;
  text-align: center;
}

.drop-zone-text.highlight {
  color: #ec4141;
  font-weight: 600;
  font-size: 1rem;
}

.drop-zone-hint {
  font-size: 0.82rem;
  color: var(--text-secondary);
  opacity: 0.6;
  margin: 6px 0 0;
}

.add-folder-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 0;
  border-radius: 10px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  background: rgba(128, 128, 128, 0.08);
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

.add-folder-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.add-folder-btn:active {
  transform: translateY(0);
}

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

.scan-status-card,
.scan-error-card {
  margin-top: 14px;
  border-radius: 12px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.scan-status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.scan-status-title,
.scan-error-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.scan-status-count {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.scan-status-bar {
  margin-top: 10px;
  height: 8px;
  overflow: hidden;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
}

.scan-status-bar-fill {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, #ec4141, #ff7b63, #f7b267);
  transition: width 0.25s ease;
}

.scan-status-bar-fill.indeterminate {
  min-width: 24%;
  animation: scan-status-indeterminate 1.1s ease-in-out infinite alternate;
}

.scan-status-path,
.scan-error-text {
  margin-top: 10px;
  font-size: 0.82rem;
  color: var(--text-secondary);
  opacity: 0.82;
  word-break: break-all;
}

.scan-error-card {
  border-color: rgba(236, 65, 65, 0.22);
  background: rgba(236, 65, 65, 0.08);
}

.scan-error-action {
  margin-top: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 9999px;
  padding: 9px 14px;
  background: #ec4141;
  color: white;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.scan-error-action:hover {
  background: #d73a3a;
  transform: translateY(-1px);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes scan-status-indeterminate {
  from {
    transform: translateX(-16%);
  }

  to {
    transform: translateX(16%);
  }
}
</style>
