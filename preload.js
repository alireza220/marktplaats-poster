const { contextBridge, ipcRenderer } = require('electron');

// Elke aanroep geeft de waarde terug of gooit een Error met een leesbare melding.
contextBridge.exposeInMainWorld('api', async (name, ...args) => {
  const res = await ipcRenderer.invoke(name, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.value;
});
