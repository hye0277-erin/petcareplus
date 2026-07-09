// Standalone dev shim for the `window.storage` API the app expects
// (matches the { get(key), set(key, value) } shape used by petcare-app.jsx)
window.storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    return value === null ? null : { value };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return true;
  },
};
