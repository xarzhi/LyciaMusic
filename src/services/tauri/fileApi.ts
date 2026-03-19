import type { Song } from '../../types';
import { tauriInvoke } from './invoke';

export const fileApi = {
  deleteFolder: (path: string) => tauriInvoke<void>('delete_folder', { path }),
  moveFileToFolder: (sourcePath: string, targetFolder: string) =>
    tauriInvoke<void>('move_file_to_folder', { sourcePath, targetFolder }),
  batchMoveMusicFiles: (paths: string[], targetFolder: string) =>
    tauriInvoke<number>('batch_move_music_files', { paths, targetFolder }),
  getFolderFirstSong: (folderPath: string) =>
    tauriInvoke<string | null>('get_folder_first_song', { folderPath }),
  scanMusicFolder: (folderPath: string) =>
    tauriInvoke<Song[]>('scan_music_folder', { folderPath }),
  moveMusicFile: (oldPath: string, newPath: string) =>
    tauriInvoke<void>('move_music_file', { oldPath, newPath }),
  showInFolder: (path: string) => tauriInvoke<void>('show_in_folder', { path }),
  deleteMusicFile: (path: string) => tauriInvoke<void>('delete_music_file', { path }),
  isDirectory: (path: string) => tauriInvoke<boolean>('is_directory', { path }),
  parseAudioFiles: (paths: string[]) => tauriInvoke<Song[]>('parse_audio_files', { paths }),
};
