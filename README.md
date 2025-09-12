# n8n-autosave-userscript

Adds autosave functionality to n8n in Safari & Chrome

Selfhosted n8n v1.111.0

![Demo Image](demo-img.png)

## Safari Userscripts

1. Install [Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887) Safari extension
2. Add [n8n-autosave-userscripts.js](n8n-autosave-userscripts.js) script
3. Configure
4. Restart & Enjoy

## Chrome Tampermonkey

1. Install [Tampermonkey](https://www.tampermonkey.net/) Chrome extension
2. Add [n8n-autosave-tampermonkey.js](n8n-autosave-tampermonkey.js) script
3. Configure
4. Restart & Enjoy


## Configure

```
// @match        https://your-n8n-domain.com/*
// @match        http://your-n8n-domain.com/*
// @match        https://*.your-n8n-domain.com/*
// @match        http://*.your-n8n-domain.com/*

INTERVAL_SEC = 180; // 3 min
```
