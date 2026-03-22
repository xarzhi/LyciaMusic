import { usePlayerCore } from './playerCore';

export function usePlayerService() {
  return usePlayerCore().legacyApi;
}
