export interface SessionStore {
  getToken(): string | null;
  setToken(token: string): void;
  clearToken(): void;
}

const tokenStorageKey = "couple-pet-platform-token";

export const browserSessionStore: SessionStore = {
  getToken() {
    return window.localStorage.getItem(tokenStorageKey);
  },
  setToken(token) {
    window.localStorage.setItem(tokenStorageKey, token);
  },
  clearToken() {
    window.localStorage.removeItem(tokenStorageKey);
  },
};
