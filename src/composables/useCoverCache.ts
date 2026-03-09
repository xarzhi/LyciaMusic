import { reactive } from 'vue';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

// 全局单例缓存，跨组件共享，提升页面切换时的体验
const coverCache = reactive(new Map<string, string>());
const loadingSet = new Set<string>();

export function useCoverCache() {
    const loadCover = async (path: string | undefined): Promise<string | undefined> => {
        if (!path) return undefined;

        if (coverCache.has(path)) {
            return coverCache.get(path);
        }

        if (loadingSet.has(path)) {
            return undefined;
        }

        loadingSet.add(path);
        try {
            const coverPath = await invoke<string>('get_song_cover_thumbnail', { path });
            let finalUrl = '';
            if (coverPath) {
                finalUrl = convertFileSrc(coverPath);
                coverCache.set(path, finalUrl);
            }
            return finalUrl;
        } catch (e) {
            return '';
        } finally {
            loadingSet.delete(path);
        }
    };

    // 预加载传入的资源列表，用于优化首次加载和体验
    const preloadCovers = (paths: string[]) => {
        // 使用 setTimeout 分批调度，防止一次性发起过多 Tauri 请求阻塞 IPC
        for (let i = 0; i < paths.length; i++) {
            setTimeout(() => {
                loadCover(paths[i]);
            }, i * 5); // 每 5ms 发起一个请求
        }
    };

    return {
        coverCache,
        loadingSet,
        loadCover,
        preloadCovers
    };
}
