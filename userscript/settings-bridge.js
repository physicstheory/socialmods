// Inside the settings frame: chrome.storage calls go to the userscript through postMessage.
(function () {
  let next = 0;
  const pending = new Map();
  const listeners = [];
  addEventListener("message", e => {
    if (e.source !== parent || !e.data) return;
    if (e.data.safescroll === "reply") {
      const done = pending.get(e.data.id);
      if (done) { pending.delete(e.data.id); done(e.data.result); }
    } else if (e.data.safescroll === "changed") {
      for (const fn of listeners) { try { fn(e.data.changes, "local"); } catch (err) { console.error(err); } }
    }
  });
  const call = (op, arg) => new Promise(resolve => {
    const id = ++next;
    pending.set(id, resolve);
    parent.postMessage({ safescroll: "call", id, op, arg }, "*");
  });
  window.chrome = {
    storage: {
      local: {
        get: keys => call("get", keys === undefined ? null : keys),
        set: items => call("set", JSON.parse(JSON.stringify(items))),
        remove: keys => call("remove", [].concat(keys))
      },
      onChanged: { addListener: fn => listeners.push(fn) }
    },
    runtime: { getURL: p => p, openOptionsPage() {} }
  };
})();
