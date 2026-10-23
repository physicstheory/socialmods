// Test only: answer tiktok.com with stand-in pages (this machine can't reach TikTok).
const { protocol, net } = require("electron");
module.exports = () => {
  protocol.handle("https", req => {
    const u = new URL(req.url);
    if (!u.hostname.endsWith("tiktok.com")) return net.fetch(req, { bypassCustomProtocolHandlers: true });
    const posts = ["@bakewithmia · 3 ingredient cookies 🍪 #baking", "@stuntkid · trying the #blackoutchallenge 😵", "@sciencesam · elephant toothpaste #stem"];
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${u.pathname}</title>
<style>body{margin:0;background:#111;color:#fff;font:15px system-ui,sans-serif}header{padding:14px;font-weight:700;text-align:center;border-bottom:1px solid #333}
[data-e2e="recommend-list-item-container"]{margin:12px;padding:16px;border-radius:12px;background:#222;min-height:120px}</style>
<header>Stand-in page (not real TikTok): ${u.pathname}</header>
<a data-e2e="top-login-button" href="/login" style="display:block;margin:12px;padding:10px;background:#fe2c55;color:#fff;text-align:center;border-radius:8px">Log in</a>
${posts.map(p => `<div data-e2e="recommend-list-item-container"><img alt="">${p}</div>`).join("")}`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  });
};
