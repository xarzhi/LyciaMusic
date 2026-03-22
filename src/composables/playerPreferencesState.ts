import { ref } from 'vue';

export type { HistoryItem, Playlist, Song } from '../types';

export const artistSortMode = ref<'count' | 'name' | 'custom'>('count');
export const albumSortMode = ref<'count' | 'name' | 'artist' | 'custom'>('artist');
export const artistCustomOrder = ref<string[]>([]);
export const albumCustomOrder = ref<string[]>([]);
export const folderSortMode = ref<'title' | 'name' | 'artist' | 'added_at' | 'custom'>('title');
export const folderCustomOrder = ref<Record<string, string[]>>({});
export const localSortMode = ref<'title' | 'name' | 'artist' | 'added_at' | 'custom' | 'default'>('default');
export const localCustomOrder = ref<string[]>([]);
export const playlistSortMode = ref<'title' | 'name' | 'artist' | 'added_at' | 'custom'>('custom');
