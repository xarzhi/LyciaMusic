import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, type Ref } from 'vue';

const listScrollMemory = new Map<string, number>();

export function useListScrollMemory(key: string, containerRef: Ref<HTMLElement | null>) {
  const saveScrollPosition = () => {
    if (!containerRef.value) {
      return;
    }

    listScrollMemory.set(key, containerRef.value.scrollTop);
  };

  const restoreScrollPosition = async () => {
    await nextTick();

    if (!containerRef.value) {
      return;
    }

    const savedTop = listScrollMemory.get(key);
    if (savedTop === undefined) {
      return;
    }

    requestAnimationFrame(() => {
      if (containerRef.value) {
        containerRef.value.scrollTop = savedTop;
      }
    });
  };

  onMounted(() => {
    void restoreScrollPosition();
  });

  onActivated(() => {
    void restoreScrollPosition();
  });

  onDeactivated(() => {
    saveScrollPosition();
  });

  onBeforeUnmount(() => {
    saveScrollPosition();
  });

  return {
    saveScrollPosition,
    restoreScrollPosition,
  };
}
