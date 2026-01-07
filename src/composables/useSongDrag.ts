import { ref, onMounted, onUnmounted, Ref } from 'vue';
import { usePlayer, Song, dragSession } from './player';
import { useToast } from './toast';

export function useSongDrag(
    displaySongList: Ref<Song[]>,
    isBatchMode: Ref<boolean>,
    selectedPaths: Ref<Set<string>>,
    songTableRef: Ref<{ containerRef: HTMLElement | null } | null>
) {
    const {
        songList, currentViewMode, addSongsToPlaylist,
        currentFolderFilter, updateFolderOrder // 🟢 导入文件夹排序函数
    } = usePlayer();


    let isMouseDown = false;
    let startX = 0;
    let startY = 0;
    const ROW_HEIGHT = 60;

    // 自动滚动
    let autoScrollTimer: number | null = null;
    const startAutoScroll = (direction: 'up' | 'down') => {
        if (autoScrollTimer) return;
        const container = songTableRef.value?.containerRef;
        if (!container) return;

        const scroll = () => {
            if (!isMouseDown) { stopAutoScroll(); return; }
            const speed = 15;
            if (direction === 'up') container.scrollTop -= speed;
            else container.scrollTop += speed;
            autoScrollTimer = requestAnimationFrame(scroll);
        };
        autoScrollTimer = requestAnimationFrame(scroll);
    };

    const stopAutoScroll = () => {
        if (autoScrollTimer) { cancelAnimationFrame(autoScrollTimer); autoScrollTimer = null; }
    };

    const lastSelectedIndex = ref<number>(-1);
    const isSelectionDragging = ref(false);
    const dragSelectAction = ref<'select' | 'deselect' | null>(null);

    // 1. MouseDown 处理项
    const handleTableDragStart = ({ event, song, index }: { event: MouseEvent; song: Song; index: number }) => {
        isMouseDown = true;
        startX = event.clientX;
        startY = event.clientY;

        // --- 分支 A: 批量多选模式 ---
        if (isBatchMode.value) {
            const tr = event.currentTarget as HTMLElement;
            const rect = tr.getBoundingClientRect();

            // 判断点击位置：如果点击在左侧 60% 区域，视为“选择操作”
            if ((event.clientX - rect.left) / rect.width < 0.6) {
                isSelectionDragging.value = true;

                // Shift 连选逻辑
                if (event.shiftKey && lastSelectedIndex.value !== -1) {
                    const start = Math.min(lastSelectedIndex.value, index);
                    const end = Math.max(lastSelectedIndex.value, index);
                    for (let i = start; i <= end; i++) {
                        if (displaySongList.value[i]) selectedPaths.value.add(displaySongList.value[i].path);
                    }
                } else {
                    // 普通点击：单选/反选
                    if (selectedPaths.value.has(song.path)) {
                        selectedPaths.value.delete(song.path);
                    } else {
                        selectedPaths.value.add(song.path);
                    }
                    lastSelectedIndex.value = index;
                }

                dragSelectAction.value = selectedPaths.value.has(song.path) ? 'select' : 'deselect';
            } else {
                // 点击右侧区域，视为“拖拽已选歌曲”
                isSelectionDragging.value = false;
                if (!selectedPaths.value.has(song.path)) selectedPaths.value.add(song.path);
                dragSession.songs = displaySongList.value.filter(s => selectedPaths.value.has(s.path));
                dragSession.insertIndex = index;
            }
        }
        // --- 分支 B: 普通模式 ---
        else {
            if (['folder', 'playlist', 'all'].includes(currentViewMode.value)) {
                dragSession.type = 'song';
                dragSession.songs = [song];
                dragSession.insertIndex = index;
            }
        }
    };

    // 2. MouseMove
    const onGlobalMouseMove = (e: MouseEvent) => {
        if (!isMouseDown) return;

        // 滑动框选逻辑
        if (isBatchMode.value && isSelectionDragging.value) {
            const container = songTableRef.value?.containerRef;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                const header = container.querySelector('thead') as HTMLElement | null;
                const headerHeight = header ? header.offsetHeight : 0;

                const relativeY = e.clientY - rect.top + container.scrollTop;
                let currentIndex = Math.floor((relativeY - headerHeight) / ROW_HEIGHT);
                currentIndex = Math.max(0, Math.min(displaySongList.value.length - 1, currentIndex));

                if (currentIndex !== lastSelectedIndex.value) {
                    const start = Math.min(lastSelectedIndex.value, currentIndex);
                    const end = Math.max(lastSelectedIndex.value, currentIndex);

                    for (let i = start; i <= end; i++) {
                        const s = displaySongList.value[i];
                        if (s) {
                            if (dragSelectAction.value === 'select') {
                                selectedPaths.value.add(s.path);
                            } else if (dragSelectAction.value === 'deselect') {
                                selectedPaths.value.delete(s.path);
                            }
                        }
                    }
                    lastSelectedIndex.value = currentIndex;
                }

                const threshold = 60;
                if (e.clientY < rect.top + threshold) startAutoScroll('up');
                else if (e.clientY > rect.bottom - threshold) startAutoScroll('down');
                else stopAutoScroll();
            }
            return;
        }

        // 拖拽激活判断
        if (!dragSession.active) {
            const dist = Math.sqrt(Math.pow(e.clientX - startX, 2) + Math.pow(e.clientY - startY, 2));
            if (dist > 5) {
                dragSession.active = true;
                dragSession.showGhost = true;
            }
        }

        if (dragSession.active) {
            dragSession.mouseX = e.clientX;
            dragSession.mouseY = e.clientY;

            const container = songTableRef.value?.containerRef;
            if (container) {
                const rect = container.getBoundingClientRect();
                const threshold = 60;
                if (e.clientY < rect.top + threshold) startAutoScroll('up');
                else if (e.clientY > rect.bottom - threshold) startAutoScroll('down');
                else stopAutoScroll();
            }

            const target = document.elementFromPoint(e.clientX, e.clientY);
            const folderEl = target?.closest('.folder-drop-target');
            if (folderEl) {
                dragSession.targetFolder = {
                    path: folderEl.getAttribute('data-folder-path')!,
                    name: folderEl.getAttribute('data-folder-name')!
                };
                dragSession.targetPlaylist = null;
                dragSession.insertIndex = -1;
                return;
            } else {
                dragSession.targetFolder = null;
            }

            const playlistEl = target?.closest('.playlist-drop-target');
            if (playlistEl) {
                dragSession.targetPlaylist = {
                    id: playlistEl.getAttribute('data-playlist-id')!,
                    name: playlistEl.getAttribute('data-playlist-name')!
                };
                dragSession.targetFolder = null;
                dragSession.insertIndex = -1;
                return;
            } else {
                dragSession.targetPlaylist = null;
            }

            if (!isBatchMode.value && !dragSession.targetFolder && !dragSession.targetPlaylist && container) {
                const containerRect = container.getBoundingClientRect();
                if (
                    e.clientX >= containerRect.left && e.clientX <= containerRect.right &&
                    e.clientY >= containerRect.top && e.clientY <= containerRect.bottom
                ) {
                    const offsetY = e.clientY - containerRect.top + container.scrollTop;
                    let currentGapIndex = dragSession.insertIndex;
                    if (currentGapIndex === -1) currentGapIndex = 0;

                    const upTriggerLimit = (currentGapIndex - 0.5) * ROW_HEIGHT;
                    const downTriggerLimit = (currentGapIndex + 1.5) * ROW_HEIGHT;
                    const maxIndex = displaySongList.value.length - 1;

                    if (offsetY < upTriggerLimit) {
                        const newIndex = Math.floor(offsetY / ROW_HEIGHT);
                        dragSession.insertIndex = Math.max(0, newIndex);
                    } else if (offsetY > downTriggerLimit) {
                        const newIndex = Math.floor(offsetY / ROW_HEIGHT);
                        dragSession.insertIndex = Math.min(maxIndex, newIndex);
                    }
                } else {
                    dragSession.insertIndex = -1;
                }
            }
        }
    };

    // 3. MouseUp
    const onGlobalMouseUp = () => {
        isMouseDown = false;
        stopAutoScroll();
        isSelectionDragging.value = false;
        dragSelectAction.value = null;

        if (dragSession.active) {
            if (dragSession.targetFolder) {
                dragSession.showGhost = false;
                return;
            }

            if (dragSession.targetPlaylist) {
                const paths = dragSession.songs.map(s => s.path);
                const count = addSongsToPlaylist(dragSession.targetPlaylist.id, paths);
                const msg = count > 0 ? `已添加 ${count} 首歌曲到 ${dragSession.targetPlaylist.name}` : '歌曲已存在于歌单';
                useToast().showToast(msg, count > 0 ? 'success' : 'info');
                dragSession.showGhost = false;
                dragSession.active = false;
            } else if (dragSession.insertIndex > -1) {
                const movingSongs = dragSession.songs;
                if (movingSongs.length > 0) {
                    // 处理歌单内排序
                    if (currentViewMode.value === 'playlist') {
                        const plId = usePlayer().filterCondition.value;
                        const pl = usePlayer().playlists.value.find(p => p.id === plId);
                        if (pl) {
                            const sourcePath = movingSongs[0].path;
                            const sourceIndex = pl.songPaths.indexOf(sourcePath);
                            const targetVisualSong = displaySongList.value[dragSession.insertIndex];

                            if (sourceIndex !== -1) {
                                pl.songPaths.splice(sourceIndex, 1);
                                if (targetVisualSong) {
                                    let targetIndex = pl.songPaths.indexOf(targetVisualSong.path);
                                    if (targetIndex >= sourceIndex) {
                                        pl.songPaths.splice(targetIndex + 1, 0, sourcePath);
                                    } else {
                                        pl.songPaths.splice(targetIndex, 0, sourcePath);
                                    }
                                } else {
                                    pl.songPaths.push(sourcePath);
                                }
                            }
                        }
                    }
                    // 处理全局排序
                    else {
                        const sourcePath = movingSongs[0].path;
                        const fullList = [...songList.value];
                        const sourceRealIndex = fullList.findIndex(s => s.path === sourcePath);
                        const targetVisualSong = displaySongList.value[dragSession.insertIndex];

                        if (sourceRealIndex !== -1 && targetVisualSong) {
                            const [item] = fullList.splice(sourceRealIndex, 1);
                            let newTargetIndex = fullList.findIndex(s => s.path === targetVisualSong.path);
                            if (newTargetIndex >= sourceRealIndex) {
                                fullList.splice(newTargetIndex + 1, 0, item);
                            } else {
                                fullList.splice(newTargetIndex, 0, item);
                            }
                            songList.value = fullList;

                            // 🟢 文件夹视图:保存自定义排序顺序
                            if (currentViewMode.value === 'folder' && currentFolderFilter.value) {
                                const newOrder = displaySongList.value.map(s => s.path);
                                updateFolderOrder(currentFolderFilter.value, newOrder);
                            }
                        } else if (sourceRealIndex !== -1) {
                            const [item] = fullList.splice(sourceRealIndex, 1);
                            fullList.push(item);
                            songList.value = fullList;

                            // 🟢 文件夹视图:保存自定义排序顺序
                            if (currentViewMode.value === 'folder' && currentFolderFilter.value) {
                                const newOrder = displaySongList.value.map(s => s.path);
                                updateFolderOrder(currentFolderFilter.value, newOrder);
                            }
                        }
                    }
                }
                dragSession.showGhost = false;
                dragSession.active = false;
            } else {
                dragSession.showGhost = false;
                dragSession.active = false;
            }
            dragSession.insertIndex = -1;
            setTimeout(() => { dragSession.targetPlaylist = null; }, 100);
        }
    };

    onMounted(() => {
        window.addEventListener('mousemove', onGlobalMouseMove);
        window.addEventListener('mouseup', onGlobalMouseUp);
    });

    onUnmounted(() => {
        stopAutoScroll();
        window.removeEventListener('mousemove', onGlobalMouseMove);
        window.removeEventListener('mouseup', onGlobalMouseUp);
    });

    return {
        handleTableDragStart
    };
}
