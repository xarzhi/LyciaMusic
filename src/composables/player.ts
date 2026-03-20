import { usePlayerService } from './playerService';

export * from './playerState';

export function usePlayer() {
  return usePlayerService();
}
