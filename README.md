# n8n-autosave-userscript

Adds autosave functionality to n8n in Safari

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
// @match        https://your-doamin.com/*
// @match        http://your-doamin.com/*
// @match        https://*.your-doamin.com/*
// @match        http://*.your-doamin.com/*

INTERVAL_SEC = 180; // 3 min
```
