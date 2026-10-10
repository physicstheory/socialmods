# Other browsers

- **Microsoft Edge**: same `extension/` folder loads via `edge://extensions` → Developer mode → Load unpacked. Use the same policy keys as `chrome-managed-policy.json` under Edge's policy path; Microsoft Family Safety can block other browsers.
- **Firefox**: MV3 is supported; load via `about:debugging` → This Firefox → Load Temporary Add-on → `manifest.json`. For permanent install, sign it on addons.mozilla.org and force-install with Firefox's `policies.json` (`ExtensionSettings`, `DisablePrivateBrowsing`, `DisableDeveloperTools`).
- **Safari**: convert with `xcrun safari-web-extension-converter extension/` and lock with Screen Time.
