const { contextBridge, ipcRenderer } = require("electron");
const invoke =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("quill", {
  boot: invoke("boot"),
  resume: invoke("resume"),
  saveWorkspace: invoke("save-workspace"),
  create: invoke("create"),
  open: invoke("open"),
  save: invoke("save"),
  saveAs: invoke("save-as"),
  backups: invoke("backups"),
  checkpoint: invoke("checkpoint"),
  restore: invoke("restore"),
  importFiles: invoke("import"),
  exportProject: invoke("export"),
  reveal: invoke("reveal"),
  spellCheck: invoke("spell-check"),
  spellSuggest: invoke("spell-suggest"),
  backupStatus: invoke("backup-status"),
  backupFolder: invoke("backup-folder"),
  backupNow: invoke("backup-now"),
  backupDisable: invoke("backup-disable"),
  backupReveal: invoke("backup-reveal"),
  onBackupStatus: (handler) => {
    const listener = (_, status) => handler(status);
    ipcRenderer.on("backup-status", listener);
    return () => ipcRenderer.removeListener("backup-status", listener);
  },
  closeReady: invoke("close-ready"),
  closeFailed: invoke("close-failed"),
  onClose: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("request-close", listener);
    return () => ipcRenderer.removeListener("request-close", listener);
  },
  onMenu: (handler) => {
    const listener = (_, action) => handler(action);
    ipcRenderer.on("menu", listener);
    return () => ipcRenderer.removeListener("menu", listener);
  },
});
