// The update window's only bridge to the app: its buttons send an action
// name ("update-now", "later", "retry", "hide", "quit", "escape").
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hgvUpdate", {
  send: (action) => ipcRenderer.send("hgv-update", String(action)),
});
