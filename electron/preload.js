const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('freeeApp', {
  // --- PTY (Claude Code メインターミナル) ---
  sendInput: (data) => ipcRenderer.send('pty-input', data),
  resizePty: (cols, rows) => ipcRenderer.send('pty-resize', { cols, rows }),
  onPtyData: (callback) => {
    ipcRenderer.on('pty-data', (_event, data) => callback(data));
  },

  // --- コマンド実行 (ボトムパネル用) ---
  runCommand: (command, args, profile) => ipcRenderer.invoke('run-command', { command, args: args || [], profile }),
  killProcess: () => ipcRenderer.invoke('kill-process'),
  onTerminalData: (callback) => {
    ipcRenderer.on('terminal-data', (_event, data) => callback(data));
  },
  onCommandDone: (callback) => {
    ipcRenderer.on('command-done', (_event, code) => callback(code));
  },

  // --- 書類作成 ---
  fetchPartners: (profile) => ipcRenderer.invoke('fetch-partners', { profile }),
  fetchQuotations: (profile) => ipcRenderer.invoke('fetch-quotations', { profile }),
  fetchQuotationDetail: (id, profile) => ipcRenderer.invoke('fetch-quotation-detail', { id, profile }),
  fetchInvoices: (profile) => ipcRenderer.invoke('fetch-invoices', { profile }),
  createDocument: (type, data, profile) => ipcRenderer.invoke('create-document', { type, data, profile }),

  // --- レシートアップロード ---
  uploadReceipt: (filePath, fileName, mimeType, profile) =>
    ipcRenderer.invoke('upload-receipt', { filePath, fileName, mimeType, profile }),

  // --- ユーティリティ ---
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  getEnvValue: (profile, key) => ipcRenderer.invoke('get-env-value', { profile, key }),
  readFile: (filePath) => ipcRenderer.invoke('read-file', { filePath }),
});
