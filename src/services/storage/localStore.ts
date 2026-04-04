export const localStore = {
  getString(key: string) {
    return localStorage.getItem(key);
  },

  setString(key: string, value: string) {
    localStorage.setItem(key, value);
  },

  remove(key: string) {
    localStorage.removeItem(key);
  },

  clear() {
    localStorage.clear();
  },

  getJson<T>(key: string): T | null {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  setJson(key: string, value: unknown) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};
