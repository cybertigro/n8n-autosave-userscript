# n8n-autosave-userscript

Adds autosave functionality selfhosted n8n in Safari
n8n v1.111.0

1. Install [Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887) Safari extension
2. Add [n8n-autoosave.js](https://github.com/cybertigro/n8n-autosave-userscript/blob/67179d896880944e11eba0a239d2564e8309047b/n8n-autosave.js) script
3. Configure
4. Restart & Enjoy

## Configure

```
// @match        https://your-doamin.com/*
// @match        http://your-doamin.com/*
// @match        https://*.your-doamin.com/*
// @match        http://*.your-doamin.com/*

INTERVAL_SEC = 180; // 3 min
```