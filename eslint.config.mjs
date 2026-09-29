// Config do ESLint do projeto (usada pelo CI em .github/workflows/testes.yml).
// Só pega o que quebra de verdade num userscript de arquivo único: nome indefinido, redeclaração, código inalcançável.
export default [{ files: ['tibidle-helper.user.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: {
  window: 'readonly', document: 'readonly', localStorage: 'readonly', console: 'readonly', fetch: 'readonly', setTimeout: 'readonly', setInterval: 'readonly',
  clearTimeout: 'readonly', clearInterval: 'readonly', WebSocket: 'writable', MouseEvent: 'readonly', PointerEvent: 'readonly', KeyboardEvent: 'readonly', Event: 'readonly',
  crypto: 'readonly', navigator: 'readonly', location: 'readonly', Blob: 'readonly', URL: 'readonly', getComputedStyle: 'readonly', requestAnimationFrame: 'readonly',
  MutationObserver: 'readonly', HTMLElement: 'readonly', Node: 'readonly', performance: 'readonly', unsafeWindow: 'readonly', TextDecoder: 'readonly', ArrayBuffer: 'readonly',
  DataView: 'readonly', Uint8Array: 'readonly', history: 'readonly', alert: 'readonly', confirm: 'readonly', prompt: 'readonly', CSS: 'readonly', DOMParser: 'readonly', structuredClone: 'readonly', globalThis: 'readonly', Symbol: 'readonly', Proxy: 'readonly', Reflect: 'readonly' } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }], 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-const-assign': 'error' } }];
