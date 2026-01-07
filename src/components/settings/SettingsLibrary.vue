<template>
  <div class="settings-content">
    <div class="section-title">音乐库管理</div>
    
    <div class="setting-item-group">
      <div class="group-desc">
        管理 LyciaMusic 扫描音乐文件的文件夹。
        “本地音乐”视图将仅显示这些文件夹中的歌曲。
      </div>

      <div class="library-list">
        <div v-for="folder in libraryFolders" :key="folder.path" class="library-item">
          <div class="folder-info">
            <div class="folder-path" :title="folder.path">{{ folder.path }}</div>
            <div class="folder-stats">{{ folder.song_count }} 首歌曲</div>
          </div>
          <button class="remove-btn" @click="handleRemove(folder.path)" title="移除文件夹">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div v-if="libraryFolders.length === 0" class="empty-state">
           暂无文件夹。点击“添加文件夹”开始扫描。
        </div>
      </div>

      <div class="actions">
        <button class="action-btn primary" @click="addLibraryFolder">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          添加文件夹
        </button>
        <button class="action-btn secondary" @click="handleRescan" :disabled="isScanning">
          <svg :class="{ spinning: isScanning }" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
          {{ isScanning ? '扫描中...' : '重新扫描' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { usePlayer } from '../../composables/player';
import { libraryFolders } from '../../composables/playerState';
// Note: libraryFolders is imported from playerState, but actions from player.ts

const { addLibraryFolder, removeLibraryFolder, scanLibrary } = usePlayer();
const isScanning = ref(false);

const handleRemove = async (path: string) => {
  if (confirm(`确定要从音乐库中移除 "${path}" 吗？(歌曲将从“本地音乐”视图中消失)`)) {
    await removeLibraryFolder(path);
  }
};

const handleRescan = async () => {
  if (isScanning.value) return;
  isScanning.value = true;
  await scanLibrary();
  isScanning.value = false;
};
</script>

<style scoped>
.settings-content {
  padding: 0 10px;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 20px;
  color: var(--text-primary);
}

.setting-item-group {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.group-desc {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 20px;
  line-height: 1.5;
}

.library-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.library-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.2s;
}

.library-item:hover {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.15);
}

.folder-info {
  flex: 1;
  min-width: 0;
  margin-right: 15px;
}

.folder-path {
  font-size: 0.95rem;
  color: var(--text-primary);
  margin-bottom: 4px;
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
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-btn:hover {
  background: rgba(255, 0, 0, 0.15);
  color: #ff4d4f;
}

.empty-state {
  text-align: center;
  padding: 30px;
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  border: 1px dashed rgba(255, 255, 255, 0.2);
}

.actions {
  display: flex;
  gap: 12px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.primary {
  background: var(--primary-color, #4cc9f0);
  color: #000;
}

.action-btn.primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.action-btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.action-btn.secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.action-btn:disabled {
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
