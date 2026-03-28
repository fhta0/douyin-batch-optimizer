# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

抖店批量属性优化助手 - A Chrome extension for automatically batch optimizing product attributes on the Douyin/TikTok shop platform (抖店). It automates clicking through the optimization workflow to save manual effort when processing thousands of products.

## Architecture

Chrome Extension using Manifest V3 with three main components:

1. **content.js** - Core automation logic injected into `fxg.jinritemai.com` pages. Handles:
   - Finding and clicking UI elements (batch optimize button, checkbox, submit)
   - State management with `chrome.storage.local` for runtime persistence
   - Floating panel UI injected directly into the page
   - Retry logic and error handling

2. **popup.html/popup.js** - Extension popup control panel. Communicates with content script via `chrome.tabs.sendMessage`. Shows status, progress, and logs.

3. **manifest.json** - Extension configuration with permissions for `activeTab`, `scripting`, `storage`, and host access to `fxg.jinritemai.com`.

## Key Configuration (content.js)

```javascript
const CONFIG = {
  interval: 3000,              // Batch processing interval (ms)
  maxRetries: 3,               // Max retry attempts
  batchTargetCount: 50,        // Target items per batch
  listUrl: "https://fxg.jinritemai.com/ffa/g/list",
  recordWaitTimeoutMs: 480000, // 8 min timeout for record wait
  recordPollIntervalMs: 4000,  // Poll interval for pending count
  fallbackRecordWaitMs: 90000  // 90 sec fallback wait
};
```

## Installation & Testing

1. Load as unpacked extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" → select this folder

2. Test on the target page:
   - Navigate to `https://fxg.jinritemai.com/ffa/g/list`
   - Click extension icon or use the floating panel on the page
   - Click "开始优化" to start automation

3. Generate icons (optional):
   - Open `generate-icons.html` in browser
   - Save generated PNGs as `icon16.png`, `icon48.png`, `icon128.png`

## Debugging

- Open DevTools (F12) on the抖店 page to see content.js logs with prefix `[抖店优化助手]`
- Check popup console via right-click on extension icon → "Inspect popup"
- Use `TROUBLESHOOTING.md` for common issues like connection errors

## Important Notes

- The extension only works on `fxg.jinritemai.com` URLs (defined in manifest)
- State persists in `chrome.storage.local` under key `douyin_optimizer_runtime`
- A separate progress file `doudian_attr_opt_progress.json` tracks batch progress