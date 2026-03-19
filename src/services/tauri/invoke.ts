import { invoke } from '@tauri-apps/api/core';

export const tauriInvoke = <T>(command: string, payload?: object) =>
  invoke<T>(command, payload as Record<string, unknown> | undefined);
