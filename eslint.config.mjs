// Config do ESLint do projeto (usada pelo CI em .github/workflows/testes.yml).
// Pega o que quebra de verdade (nome indefinido, redeclaração, código inalcançável) e, desde a 2.11.8, as 4 regras
// que o editor do Tampermonkey mostra com "!" na margem: o arquivo tem que abrir lá sem nenhum aviso.
export default [{ files: ['tibidle-helper.user.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: {
  window: 'readonly', document: 'readonly', localStorage: 'readonly', console: 'readonly', fetch: 'readonly', setTimeout: 'readonly', setInterval: 'readonly',
  clearTimeout: 'readonly', clearInterval: 'readonly', WebSocket: 'writable', MouseEvent: 'readonly', PointerEvent: 'readonly', KeyboardEvent: 'readonly', Event: 'readonly',
  crypto: 'readonly', navigator: 'readonly', location: 'readonly', Blob: 'readonly', URL: 'readonly', getComputedStyle: 'readonly', requestAnimationFrame: 'readonly',
  MutationObserver: 'readonly', HTMLElement: 'readonly', Node: 'readonly', performance: 'readonly', unsafeWindow: 'readonly', TextDecoder: 'readonly', ArrayBuffer: 'readonly',
  DataView: 'readonly', Uint8Array: 'readonly', history: 'readonly', alert: 'readonly', confirm: 'readonly', prompt: 'readonly', CSS: 'readonly', DOMParser: 'readonly', structuredClone: 'readonly', globalThis: 'readonly', Symbol: 'readonly', Proxy: 'readonly', Reflect: 'readonly' } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }], 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-const-assign': 'error',
    curly: ['error', 'multi-line'], 'no-multi-spaces': 'error', 'no-return-assign': 'error', 'no-loop-func': 'error' } }];
