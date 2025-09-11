# n8n-autosave-userscript

Adds autosave functionality selfhosted n8n in Safari
n8n v1.111.0

1. Install [Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887) Safari extension
2. Add this script
3. Configure

## Configure

```
// @match        https://your-doamin.com/*
// @match        http://your-doamin.com/*
// @match        https://*.your-doamin.com/*
// @match        http://*.your-doamin.com/*

INTERVAL_SEC = 180; // 3 min
```