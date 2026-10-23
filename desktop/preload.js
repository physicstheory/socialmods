// Runs SafeScroll's Safari userscript on supported sites, with GM storage kept by the main process.
const { ipcRenderer } = require("electron");

const SITES = /(^|\.)(tiktok\.com|instagram\.com|facebook\.com|messenger\.com|threads\.(net|com)|snapchat\.com|whatsapp\.com|meta\.ai)$/;
if (window.top === window && SITES.test(location.hostname)) {
  window.GM = {
    getValue: (key, fallback) => ipcRenderer.invoke("gm-get", key, fallback),
    setValue: (key, value) => ipcRenderer.invoke("gm-set", key, value)
  };
  (0, eval)(ipcRenderer.sendSync("userscript-source"));
}
