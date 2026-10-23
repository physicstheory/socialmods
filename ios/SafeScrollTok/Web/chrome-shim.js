// Gives the extension's scripts the small part of the chrome.* API they use,
// backed by the iPhone app's storage through a WebKit message handler.
(function () {
  if (globalThis.chrome && globalThis.chrome.storage) return;
  const h = globalThis.webkit && webkit.messageHandlers && webkit.messageHandlers.safescroll;
  if (!h) return;
  const call = msg => h.postMessage(msg);
  const listeners = [];
  globalThis.__safescrollChanged = changes => {
    for (const fn of listeners) { try { fn(changes, "local"); } catch (e) { console.error(e); } }
  };
  globalThis.chrome = {
    storage: {
      local: {
        get: keys => call({ op: "get", keys: keys === undefined ? null : keys }),
        set: items => call({ op: "set", items: JSON.parse(JSON.stringify(items)) }),
        remove: keys => call({ op: "remove", keys: [].concat(keys) })
      },
      onChanged: { addListener: fn => listeners.push(fn) }
    },
    runtime: {
      getURL: p => "safescroll://app/" + String(p).replace(/^\//, ""),
      openOptionsPage: () => call({ op: "openSettings" }),
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} }
    }
  };
  globalThis.SafeScrollNative = {
    isApp: true,
    sha256: s => call({ op: "sha256", input: String(s) }),
    open: url => call({ op: "open", url: String(url) })
  };
})();
