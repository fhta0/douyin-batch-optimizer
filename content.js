// 抖店批量属性优化助手 - Content Script
(function () {
  "use strict";

  const CONFIG = {
    interval: 3000,
    maxRetries: 3,
    batchTargetCount: 50,
    listUrl: "https://fxg.jinritemai.com/ffa/g/list",
    recordWaitTimeoutMs: 8 * 60 * 1000,
    recordPollIntervalMs: 4000,
    fallbackRecordWaitMs: 90 * 1000
  };

  const STORAGE_KEY = "douyin_optimizer_runtime";

  const state = {
    isRunning: false,
    stopRequested: false,
    batchCount: 0,
    totalOptimized: 0,
    startTime: null,
    elapsedMs: 0,
    lastKnownPending: null,
    lastListUrl: CONFIG.listUrl,
    lastListPage: null,
    lastDialogPage: 1,
    logs: [],
    panelPosition: null
  };

  let loopPromise = null;
  let hasRestoredRuntime = false;
  let panelInitialized = false;
  let panelDragState = null;
  let pendingSyncTimer = null;
  let elapsedTimer = null;

  function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const text = "[" + timestamp + "] " + message;
    state.logs.unshift(text);
    if (state.logs.length > 20) {
      state.logs.length = 20;
    }
    console.log("[抖店优化助手] " + text);
    renderFloatingPanel();
    try {
      chrome.runtime.sendMessage({ type: "log", message: text }).catch(function () {});
    } catch (e) {}
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function getStorageArea() {
    return chrome.storage && chrome.storage.local ? chrome.storage.local : null;
  }

  function readRuntime() {
    return new Promise(function (resolve) {
      const storage = getStorageArea();
      if (!storage) {
        resolve(null);
        return;
      }
      storage.get([STORAGE_KEY], function (result) {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(result && result[STORAGE_KEY] ? result[STORAGE_KEY] : null);
      });
    });
  }

  function writeRuntime() {
    return new Promise(function (resolve) {
      const storage = getStorageArea();
      if (!storage) {
        resolve(false);
        return;
      }
      storage.set(
        {
          [STORAGE_KEY]: {
            isRunning: state.isRunning,
            stopRequested: state.stopRequested,
            batchCount: state.batchCount,
            totalOptimized: state.totalOptimized,
            startTime: state.startTime,
            elapsedMs: state.elapsedMs,
            lastKnownPending: state.lastKnownPending,
            lastListUrl: state.lastListUrl,
            lastListPage: state.lastListPage,
            lastDialogPage: state.lastDialogPage,
            logs: state.logs.slice(0, 20),
            panelPosition: state.panelPosition
          }
        },
        function () {
          resolve(!chrome.runtime.lastError);
        }
      );
    });
  }

  async function restoreRuntime() {
    if (hasRestoredRuntime) {
      return;
    }
    hasRestoredRuntime = true;
    const saved = await readRuntime();
    if (!saved) {
      return;
    }
    state.isRunning = !!saved.isRunning;
    state.stopRequested = !!saved.stopRequested;
    state.batchCount = saved.batchCount || 0;
    state.totalOptimized = saved.totalOptimized || 0;
    state.startTime = saved.startTime || null;
    state.elapsedMs = saved.elapsedMs || 0;
    state.lastKnownPending = saved.lastKnownPending || null;
    state.lastListUrl = saved.lastListUrl || CONFIG.listUrl;
    state.lastListPage = saved.lastListPage || null;
    state.lastDialogPage = saved.lastDialogPage || 1;
    state.logs = Array.isArray(saved.logs) ? saved.logs.slice(0, 20) : [];
    state.panelPosition = saved.panelPosition || null;
    renderFloatingPanel();
  }

  async function syncRuntime(patch) {
    if (patch && typeof patch === "object") {
      Object.assign(state, patch);
    }
    renderFloatingPanel();
    await writeRuntime();
  }

  function ensureFloatingPanel() {
    if (panelInitialized && document.getElementById("douyin-optimizer-panel")) {
      return;
    }

    if (!document.body) {
      return;
    }

    if (!document.getElementById("douyin-optimizer-style")) {
      const style = document.createElement("style");
      style.id = "douyin-optimizer-style";
      style.textContent = [
        "#douyin-optimizer-panel{position:fixed;right:20px;bottom:20px;width:320px;z-index:2147483647;background:rgba(16,24,40,.58);color:#f8fafc;border-radius:14px;box-shadow:0 18px 48px rgba(15,23,42,.18);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;border:1px solid rgba(148,163,184,.16);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:.72;transition:opacity .18s ease,box-shadow .18s ease,background .18s ease}",
        "#douyin-optimizer-panel:hover{opacity:.96;background:rgba(16,24,40,.82);box-shadow:0 18px 52px rgba(15,23,42,.28)}",
        "#douyin-optimizer-panel[data-collapsed='true'] .dbop-body{display:none}",
        "#douyin-optimizer-panel .dbop-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:linear-gradient(135deg,#0f766e,#155eef);cursor:move;user-select:none}",
        "#douyin-optimizer-panel .dbop-title{display:flex;align-items:center;gap:8px;min-width:0}",
        "#douyin-optimizer-panel .dbop-title-main{font-size:13px;font-weight:700}",
        "#douyin-optimizer-panel .dbop-elapsed{font-size:11px;color:rgba(255,255,255,.78);font-weight:600;background:rgba(255,255,255,.12);padding:2px 6px;border-radius:999px;line-height:1.2;white-space:nowrap}",
        "#douyin-optimizer-panel .dbop-actions{display:flex;gap:6px;flex-shrink:0}",
        "#douyin-optimizer-panel .dbop-btn{border:none;border-radius:8px;padding:5px 8px;font-size:12px;cursor:pointer}",
        "#douyin-optimizer-panel .dbop-btn[disabled]{opacity:.45;cursor:not-allowed}",
        "#douyin-optimizer-panel .dbop-toggle-run{background:#ecfdf3;color:#047857}",
        "#douyin-optimizer-panel .dbop-toggle-run.is-running{background:#fff1f2;color:#be123c}",
        "#douyin-optimizer-panel .dbop-toggle{background:rgba(255,255,255,.18);color:#fff}",
        "#douyin-optimizer-panel .dbop-body{padding:12px 14px;background:rgba(15,23,42,.68)}",
        "#douyin-optimizer-panel .dbop-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}",
        "#douyin-optimizer-panel .dbop-item{background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.14);border-radius:10px;padding:8px 10px}",
        "#douyin-optimizer-panel .dbop-label{font-size:11px;color:#94a3b8;margin-bottom:4px}",
        "#douyin-optimizer-panel .dbop-value{font-size:16px;font-weight:700}",
        "#douyin-optimizer-panel .dbop-status-running{color:#86efac}",
        "#douyin-optimizer-panel .dbop-status-stopped{color:#fda4af}",
        "#douyin-optimizer-panel .dbop-log-title{font-size:11px;color:#94a3b8;margin-bottom:6px}",
        "#douyin-optimizer-panel .dbop-logs{max-height:160px;overflow:auto;background:rgba(255,255,255,.035);border-radius:10px;padding:8px}",
        "#douyin-optimizer-panel .dbop-log{font-size:11px;line-height:1.45;padding:4px 0;border-bottom:1px solid rgba(148,163,184,.12);word-break:break-all}",
        "#douyin-optimizer-panel .dbop-log:last-child{border-bottom:none}",
        "#douyin-optimizer-panel .dbop-empty{font-size:11px;color:#94a3b8;padding:8px 0}"
      ].join("");
      document.documentElement.appendChild(style);
    }

    let panel = document.getElementById("douyin-optimizer-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "douyin-optimizer-panel";
      panel.setAttribute("data-collapsed", "false");
        panel.innerHTML =
        '<div class="dbop-header">' +
        '<div class="dbop-title"><span class="dbop-title-main">抖店优化助手</span><span class="dbop-elapsed" data-field="elapsed">00:00:00</span></div>' +
        '<div class="dbop-actions">' +
        '<button class="dbop-btn dbop-toggle-run" type="button">开始</button>' +
        '<button class="dbop-btn dbop-toggle" type="button">收起</button>' +
        "</div>" +
        "</div>" +
        '<div class="dbop-body">' +
        '<div class="dbop-grid">' +
        '<div class="dbop-item"><div class="dbop-label">运行状态</div><div class="dbop-value" data-field="status">已停止</div></div>' +
        '<div class="dbop-item"><div class="dbop-label">待优化商品</div><div class="dbop-value" data-field="pending">-</div></div>' +
        '<div class="dbop-item"><div class="dbop-label">已处理批次</div><div class="dbop-value" data-field="batch">0</div></div>' +
        '<div class="dbop-item"><div class="dbop-label">已优化商品</div><div class="dbop-value" data-field="total">0</div></div>' +
        "</div>" +
        '<div class="dbop-log-title">运行日志</div>' +
        '<div class="dbop-logs" data-field="logs"></div>' +
        "</div>";
      document.body.appendChild(panel);

      const runBtn = panel.querySelector(".dbop-toggle-run");
      const toggleBtn = panel.querySelector(".dbop-toggle");
      const header = panel.querySelector(".dbop-header");
      runBtn.addEventListener("click", function () {
        toggleRunFromFloatingPanel();
      });
      toggleBtn.addEventListener("click", function () {
        const collapsed = panel.getAttribute("data-collapsed") === "true";
        panel.setAttribute("data-collapsed", collapsed ? "false" : "true");
        toggleBtn.textContent = collapsed ? "收起" : "展开";
      });
      header.addEventListener("mousedown", startPanelDrag);
      header.addEventListener("touchstart", startPanelDrag, { passive: false });
    }

    panelInitialized = true;
  }

  function getPointFromEvent(event) {
    if (event.touches && event.touches[0]) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    if (event.changedTouches && event.changedTouches[0]) {
      return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }
    return { x: event.clientX, y: event.clientY };
  }

  function clampPanelPosition(left, top, panel) {
    const maxLeft = Math.max(window.innerWidth - panel.offsetWidth - 8, 0);
    const maxTop = Math.max(window.innerHeight - panel.offsetHeight - 8, 0);
    return {
      left: Math.min(Math.max(left, 8), maxLeft),
      top: Math.min(Math.max(top, 8), maxTop)
    };
  }

  function applyPanelPosition(panel) {
    if (!panel || !state.panelPosition) {
      return;
    }
    panel.style.left = state.panelPosition.left + "px";
    panel.style.top = state.panelPosition.top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function startPanelDrag(event) {
    const panel = document.getElementById("douyin-optimizer-panel");
    if (!panel) {
      return;
    }
    if (event.target && event.target.closest(".dbop-actions")) {
      return;
    }
    const point = getPointFromEvent(event);
    const rect = panel.getBoundingClientRect();
    panelDragState = {
      offsetX: point.x - rect.left,
      offsetY: point.y - rect.top
    };
    panel.style.left = rect.left + "px";
    panel.style.top = rect.top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    document.addEventListener("mousemove", onPanelDrag);
    document.addEventListener("mouseup", endPanelDrag);
    document.addEventListener("touchmove", onPanelDrag, { passive: false });
    document.addEventListener("touchend", endPanelDrag);
    event.preventDefault();
  }

  function onPanelDrag(event) {
    const panel = document.getElementById("douyin-optimizer-panel");
    if (!panel || !panelDragState) {
      return;
    }
    const point = getPointFromEvent(event);
    const next = clampPanelPosition(point.x - panelDragState.offsetX, point.y - panelDragState.offsetY, panel);
    panel.style.left = next.left + "px";
    panel.style.top = next.top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function endPanelDrag() {
    const panel = document.getElementById("douyin-optimizer-panel");
    if (panel && panelDragState) {
      const rect = panel.getBoundingClientRect();
      const next = clampPanelPosition(rect.left, rect.top, panel);
      state.panelPosition = next;
      writeRuntime();
    }
    panelDragState = null;
    document.removeEventListener("mousemove", onPanelDrag);
    document.removeEventListener("mouseup", endPanelDrag);
    document.removeEventListener("touchmove", onPanelDrag);
    document.removeEventListener("touchend", endPanelDrag);
  }

  function renderFloatingPanel() {
    ensureFloatingPanel();
    const panel = document.getElementById("douyin-optimizer-panel");
    if (!panel) {
      return;
    }
    applyPanelPosition(panel);

    const statusEl = panel.querySelector('[data-field="status"]');
    const pendingEl = panel.querySelector('[data-field="pending"]');
    const batchEl = panel.querySelector('[data-field="batch"]');
    const totalEl = panel.querySelector('[data-field="total"]');
    const elapsedEl = panel.querySelector('[data-field="elapsed"]');
    const logsEl = panel.querySelector('[data-field="logs"]');
    const runBtn = panel.querySelector(".dbop-toggle-run");

    const actionText = state.isRunning ? (state.stopRequested ? "停止中" : "运行中") : "已停止";

    if (statusEl) {
      statusEl.textContent = actionText;
      statusEl.className = "dbop-value " + (state.isRunning ? "dbop-status-running" : "dbop-status-stopped");
    }
    if (pendingEl) {
      pendingEl.textContent = state.lastKnownPending === null ? "-" : String(state.lastKnownPending);
    }
    if (batchEl) {
      batchEl.textContent = String(state.batchCount || 0);
    }
    if (totalEl) {
      totalEl.textContent = String(state.totalOptimized || 0);
    }
    if (elapsedEl) {
      elapsedEl.textContent = formatElapsedDuration();
    }
    if (logsEl) {
      logsEl.innerHTML = state.logs && state.logs.length
        ? state.logs
            .map(function (item) {
              return '<div class="dbop-log">' + item.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</div>";
            })
            .join("")
        : '<div class="dbop-empty">等待任务开始...</div>';
    }
    if (runBtn) {
      runBtn.textContent = state.isRunning ? (state.stopRequested ? "停止中" : "停止") : "开始";
      runBtn.disabled = !!state.stopRequested;
      runBtn.className = "dbop-btn dbop-toggle-run" + (state.isRunning ? " is-running" : "");
    }
  }

  function formatElapsedDuration() {
    let elapsedMs = state.elapsedMs || 0;
    if (state.isRunning && state.startTime) {
      elapsedMs += Math.max(Date.now() - state.startTime, 0);
    }
    if (!elapsedMs) {
      return "00:00:00";
    }
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    function pad(value) {
      return String(value).padStart(2, "0");
    }
    return pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
  }

  function startElapsedTimer() {
    if (elapsedTimer) {
      return;
    }
    elapsedTimer = setInterval(function () {
      renderFloatingPanel();
    }, 1000);
  }

  function startFromFloatingPanel() {
    if (state.isRunning) {
      log("优化已在运行中");
      return;
    }
    if (!isOnListPage()) {
      state.lastListUrl = CONFIG.listUrl;
      state.lastListPage = null;
      state.lastDialogPage = 1;
      syncRuntime();
      log("当前不在商品管理页，准备返回商品管理页后启动");
      location.href = state.lastListUrl || CONFIG.listUrl;
      return;
    }
    state.stopRequested = false;
    state.batchCount = 0;
    state.totalOptimized = 0;
    state.startTime = null;
    state.elapsedMs = 0;
    state.lastKnownPending = null;
    state.lastListUrl = location.href;
    state.lastListPage = getCurrentListPageNumber();
    state.lastDialogPage = 1;
    state.logs = state.logs.slice(0, 20);
    startMainLoop();
  }

  function toggleRunFromFloatingPanel() {
    if (state.isRunning) {
      stop();
      return;
    }
    startFromFloatingPanel();
  }

  function getText(el) {
    return (el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim();
  }

  function findButtonByText(texts) {
    const targets = Array.isArray(texts) ? texts : [texts];
    const buttons = document.querySelectorAll("button");
    for (let i = 0; i < buttons.length; i++) {
      const btnText = getText(buttons[i]);
      for (let j = 0; j < targets.length; j++) {
        if (btnText.indexOf(targets[j]) !== -1) {
          return buttons[i];
        }
      }
    }
    return null;
  }

  function findElementByText(text) {
    const elements = document.querySelectorAll("*");
    for (let i = 0; i < elements.length; i++) {
      const t = getText(elements[i]);
      if (t.indexOf(text) !== -1) {
        return elements[i];
      }
    }
    return null;
  }

  function extractFirstNumberByPatterns(text, patterns) {
    for (let i = 0; i < patterns.length; i++) {
      const match = text.match(patterns[i]);
      if (match && match[1]) {
        const value = parseInt(match[1], 10);
        if (!Number.isNaN(value)) {
          return value;
        }
      }
    }
    return null;
  }

  function getPendingCount() {
    const bodyText = getText(document.body);
    const pendingPatterns = [
      /你有\s*(\d+)\s*个商品属性待优化/,
      /共\s*(\d+)\s*个商品属性待优化/,
      /(\d+)\s*个商品属性待优化/,
      /待优化(?:商品|属性)?\s*[：:]\s*(\d+)/,
      /待优化(?:商品|属性)?\s*(\d+)/
    ];

    const value = extractFirstNumberByPatterns(bodyText, pendingPatterns);
    if (value !== null) {
      state.lastKnownPending = value;
      renderFloatingPanel();
      return value;
    }
    return null;
  }

  function startPendingSync() {
    if (pendingSyncTimer) {
      return;
    }
    pendingSyncTimer = setInterval(function () {
      if (!document.body || !isOnListPage()) {
        return;
      }
      getPendingCount();
    }, 1500);
  }

  function getBatchSelectedCount() {
    const bodyText = getText(document.body);
    const selectedPatterns = [
      /已选\s*(\d+)\s*个(?:商品)?/,
      /本次(?:将)?优化\s*(\d+)\s*个(?:商品)?/,
      /确认(?:提交)?\s*(\d+)\s*个(?:商品)?/
    ];
    return extractFirstNumberByPatterns(bodyText, selectedPatterns);
  }

  function getOptimizeDialogRoot() {
    const candidates = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="dialog"], [class*="drawer"]');
    for (let i = 0; i < candidates.length; i++) {
      const text = getText(candidates[i]);
      if (text.indexOf("属性待优化") !== -1) {
        return candidates[i];
      }
    }
    return null;
  }

  function getSelectedCountInDialog() {
    const text = getText(getOptimizeDialogRoot() || document.body);
    const match = text.match(/已选\s*(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  function getDialogPendingCount() {
    const text = getText(getOptimizeDialogRoot() || document.body);
    const match = text.match(/(\d+)\s*个商品属性(?:未填写|待优化|未填写\/可能填写错误)/);
    return match ? parseInt(match[1], 10) : null;
  }

  function findClickableByText(text, root) {
    const scope = root || document;
    const elements = scope.querySelectorAll("*");
    for (let i = 0; i < elements.length; i++) {
      const t = getText(elements[i]);
      if (t.indexOf(text) === -1) {
        continue;
      }
      let node = elements[i];
      for (let depth = 0; depth < 4 && node; depth++) {
        if (node.tagName === "BUTTON" || node.tagName === "A" || node.getAttribute("role") === "button" || node.onclick) {
          return node;
        }
        node = node.parentElement;
      }
    }
    return null;
  }

  function getPageNumberFromUrl(url) {
    if (!url) {
      return null;
    }
    try {
      const parsed = new URL(url, location.origin);
      const keys = ["page", "pageNo", "pageNum", "current", "currentPage", "p", "pn"];
      for (let i = 0; i < keys.length; i++) {
        const value = parsed.searchParams.get(keys[i]);
        if (value && /^\d+$/.test(value)) {
          return parseInt(value, 10);
        }
      }
    } catch (e) {}
    return null;
  }

  function getCurrentListPageNumber() {
    const fromUrl = getPageNumberFromUrl(location.href);
    if (fromUrl !== null) {
      return fromUrl;
    }

    const activeSelectors = [
      '[class*="pagination"] [class*="active"]',
      '[class*="pagination"] [class*="current"]',
      '[class*="pager"] [class*="active"]',
      '[class*="pager"] [class*="current"]',
      'li[aria-current="page"]',
      '[aria-current="page"]'
    ];
    for (let i = 0; i < activeSelectors.length; i++) {
      const node = document.querySelector(activeSelectors[i]);
      const text = getText(node);
      if (/^\d+$/.test(text)) {
        return parseInt(text, 10);
      }
    }

    return null;
  }

  function getCurrentDialogPageNumber() {
    const scopes = getDialogSearchScopes();
    const activeSelectors = [
      '[class*="pagination"] [class*="active"]',
      '[class*="pagination"] [class*="current"]',
      '[class*="pager"] [class*="active"]',
      '[class*="pager"] [class*="current"]',
      'li[aria-current="page"]',
      '[aria-current="page"]'
    ];

    for (let i = 0; i < scopes.length; i++) {
      const scope = scopes[i];
      for (let j = 0; j < activeSelectors.length; j++) {
        const node = scope.querySelector(activeSelectors[j]);
        const text = getText(node);
        if (/^\d+$/.test(text)) {
          return parseInt(text, 10);
        }
      }
    }

    return null;
  }

  async function rememberListPosition() {
    if (!isOnListPage()) {
      return;
    }
    const currentUrl = location.href || CONFIG.listUrl;
    const currentPage = getCurrentListPageNumber();
    await syncRuntime({
      lastListUrl: currentUrl,
      lastListPage: currentPage
    });
  }

  function findListPageButton(pageNumber) {
    if (!pageNumber) {
      return null;
    }
    const candidates = document.querySelectorAll("button, a, li, [role='button']");
    for (let i = 0; i < candidates.length; i++) {
      const node = candidates[i];
      const text = getText(node);
      if (text !== String(pageNumber)) {
        continue;
      }
      const classText = (node.getAttribute("class") || "") + " " + (node.parentElement ? node.parentElement.getAttribute("class") || "" : "");
      const titleText = (node.getAttribute("title") || "") + " " + (node.parentElement ? node.parentElement.getAttribute("title") || "" : "");
      if (!/(page|pager|pagination|页)/i.test(classText + " " + titleText)) {
        continue;
      }
      if (isElementVisible(node) && !isElementDisabled(node)) {
        return node;
      }
    }
    return null;
  }

  function findDialogPageButton(pageNumber) {
    if (!pageNumber || pageNumber <= 0) {
      return null;
    }

    const scopes = getDialogSearchScopes();
    for (let s = 0; s < scopes.length; s++) {
      const candidates = scopes[s].querySelectorAll("button, a, li, [role='button']");
      for (let i = 0; i < candidates.length; i++) {
        const node = candidates[i];
        const text = getText(node);
        if (text !== String(pageNumber)) {
          continue;
        }
        const classText =
          (node.getAttribute("class") || "") +
          " " +
          (node.parentElement ? node.parentElement.getAttribute("class") || "" : "");
        const titleText =
          (node.getAttribute("title") || "") +
          " " +
          (node.parentElement ? node.parentElement.getAttribute("title") || "" : "");
        if (!/(page|pager|pagination|页)/i.test(classText + " " + titleText)) {
          continue;
        }
        if (isElementVisible(node) && !isElementDisabled(node)) {
          return node;
        }
      }
    }

    return null;
  }

  async function restoreDialogPosition() {
    const targetPage = state.lastDialogPage;
    if (!targetPage || targetPage <= 1) {
      return;
    }

    let currentPage = getCurrentDialogPageNumber();
    if (currentPage === targetPage) {
      log("弹窗已在目标页：" + targetPage);
      return;
    }

    const directBtn = findDialogPageButton(targetPage);
    if (directBtn) {
      log("恢复到上次弹窗页码：第 " + targetPage + " 页");
      directBtn.click();
      const directStart = Date.now();
      while (Date.now() - directStart < 10000) {
        currentPage = getCurrentDialogPageNumber();
        if (currentPage === targetPage) {
          await sleep(800);
          return;
        }
        await sleep(250);
      }
    }

    let guard = 0;
    log("准备按游标恢复弹窗页码，目标页：" + targetPage);
    while (guard < targetPage + 2) {
      currentPage = getCurrentDialogPageNumber();
      if (currentPage !== null && currentPage >= targetPage) {
        log("弹窗页码恢复完成，当前页：" + currentPage);
        return;
      }
      const nextPageBtn = findDialogNextPageButton();
      if (!nextPageBtn) {
        log("恢复弹窗页码时未找到下一页按钮，继续按当前页执行");
        return;
      }
      nextPageBtn.click();
      await sleep(1200);
      guard += 1;
    }
    log("弹窗页码恢复结束，已尝试翻页 " + guard + " 次");
  }

  async function restoreListPosition() {
    if (!isOnListPage()) {
      return;
    }

    const targetPage = state.lastListPage;
    if (!targetPage || targetPage <= 1) {
      return;
    }

    const currentPage = getCurrentListPageNumber();
    if (currentPage === targetPage) {
      return;
    }

    const targetBtn = findListPageButton(targetPage);
    if (!targetBtn) {
      log("未找到列表页第 " + targetPage + " 页按钮，继续按当前页执行");
      return;
    }

    log("恢复到上次处理页码：第 " + targetPage + " 页");
    targetBtn.click();

    const start = Date.now();
    while (Date.now() - start < 12000) {
      const pageNow = getCurrentListPageNumber();
      if (pageNow === targetPage) {
        await sleep(1200);
        return;
      }
      await sleep(300);
    }

    log("页码恢复等待超时，继续按当前页执行");
  }

  function isElementVisible(el) {
    if (!el) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function isElementDisabled(el) {
    if (!el) {
      return true;
    }
    const ariaDisabled = el.getAttribute("aria-disabled");
    const className = typeof el.className === "string" ? el.className : "";
    return !!(
      el.disabled ||
      ariaDisabled === "true" ||
      className.indexOf("disabled") !== -1 ||
      className.indexOf("pagination-disabled") !== -1
    );
  }

  function getDialogSearchScopes() {
    const root = getOptimizeDialogRoot();
    if (!root) {
      return [];
    }

    const scopes = [root];
    const parent = root.parentElement;
    const grandParent = parent && parent.parentElement;
    if (parent) {
      scopes.push(parent);
    }
    if (grandParent) {
      scopes.push(grandParent);
    }
    scopes.push(document);

    return scopes.filter(function (scope, index) {
      return scope && scopes.indexOf(scope) === index;
    });
  }

  function findNextPageElementInScope(scope) {
    if (!scope) {
      return null;
    }

    const selectors = [
      '[title*="下一页"]',
      '[aria-label*="下一页"]',
      '[aria-label*="next"]',
      '[aria-label*="right"]',
      '[class*="pagination-next"]',
      '[class*="pager-next"]',
      '[class*="next-page"]'
    ];

    for (let i = 0; i < selectors.length; i++) {
      const nodes = scope.querySelectorAll(selectors[i]);
      for (let j = 0; j < nodes.length; j++) {
        let node = nodes[j];
        if (node.tagName !== "BUTTON" && node.tagName !== "A" && node.getAttribute("role") !== "button") {
          node = node.querySelector('button, a, [role="button"]') || node;
        }
        if (isElementVisible(node) && !isElementDisabled(node)) {
          return node;
        }
      }
    }

    const byText = findClickableByText("下一页", scope);
    if (byText && isElementVisible(byText) && !isElementDisabled(byText)) {
      return byText;
    }

    const clickableNodes = scope.querySelectorAll('button, a, [role="button"], li');
    for (let i = 0; i < clickableNodes.length; i++) {
      const node = clickableNodes[i];
      const label = [
        getText(node),
        node.getAttribute("aria-label") || "",
        node.getAttribute("title") || "",
        node.getAttribute("class") || ""
      ].join(" ");
      if (!/(下一页|next|right|chevron-right|arrow-right)/i.test(label)) {
        continue;
      }
      if (isElementVisible(node) && !isElementDisabled(node)) {
        return node;
      }
    }

    return null;
  }

  function findDialogNextPageButton() {
    const scopes = getDialogSearchScopes();
    for (let i = 0; i < scopes.length; i++) {
      const next = findNextPageElementInScope(scopes[i]);
      if (next) {
        return next;
      }
    }
    return null;
  }

  function isDialogNextPageDisabled() {
    return !findDialogNextPageButton();
  }

  async function waitDialogSelectionReady() {
    const start = Date.now();
    while (Date.now() - start < 12000) {
      const selected = getSelectedCountInDialog();
      if (selected !== null && selected > 0) {
        return selected;
      }
      if (hasText("暂无可优化属性的商品")) {
        return 0;
      }
      await sleep(400);
    }
    return getSelectedCountInDialog();
  }

  async function selectVisibleRowsInDialog(limit) {
    const root = getOptimizeDialogRoot();
    if (!root) {
      return 0;
    }
    let clicked = 0;
    const rows = root.querySelectorAll("tr");
    for (let i = 0; i < rows.length; i++) {
      const rowText = getText(rows[i]);
      if (!rowText || rowText.indexOf("商品信息") !== -1 || rowText.indexOf("当前属性值") !== -1) {
        continue;
      }
      const cb = rows[i].querySelector('input[type="checkbox"]');
      if (cb && !cb.checked && !cb.disabled) {
        cb.click();
        clicked += 1;
        if (typeof limit === "number" && limit > 0 && clicked >= limit) {
          break;
        }
      }
    }
    await sleep(300);
    return clicked;
  }

  async function ensureBatchSelectionTarget() {
    const pendingInDialog = getDialogPendingCount();
    const target = pendingInDialog === null ? CONFIG.batchTargetCount : Math.min(CONFIG.batchTargetCount, pendingInDialog);
    log("本批目标选择数量：" + target);

    await restoreDialogPosition();
    const dialogPage = getCurrentDialogPageNumber();
    if (dialogPage !== null) {
      await syncRuntime({ lastDialogPage: dialogPage });
      log("当前弹窗页码：" + dialogPage);
    } else {
      log("当前弹窗页码未识别，按已记录游标继续：" + (state.lastDialogPage || 1));
    }

    let selected = await waitDialogSelectionReady();
    if (selected !== null) {
      log("当前已选：" + selected);
    }

    const firstRemaining = selected === null ? target : Math.max(target - selected, 0);
    const firstSelectCount = await selectVisibleRowsInDialog(firstRemaining);
    if (firstSelectCount > 0) {
      selected = getSelectedCountInDialog();
      log("当前页补选 " + firstSelectCount + " 项后，已选：" + (selected === null ? "未知" : selected));
    }

    let guard = 0;
    while ((selected === null || selected < target) && guard < 200) {
      const nextPageBtn = findDialogNextPageButton();
      if (!nextPageBtn) {
        log("未找到弹窗内下一页按钮，停止翻页");
        break;
      }
      if (isDialogNextPageDisabled()) {
        log("弹窗已到最后一页，停止翻页");
        break;
      }

      const oldSelected = selected;
      nextPageBtn.click();
      await sleep(1800);
      const currentDialogPage = getCurrentDialogPageNumber();
      if (currentDialogPage !== null) {
        await syncRuntime({ lastDialogPage: currentDialogPage });
      } else {
        await syncRuntime({ lastDialogPage: (state.lastDialogPage || 1) + 1 });
      }
      const remaining = oldSelected === null ? target : Math.max(target - oldSelected, 0);
      const selectedThisPage = await selectVisibleRowsInDialog(remaining);
      if (selectedThisPage > 0) {
        await sleep(300);
      }
      selected = getSelectedCountInDialog();
      if (selected !== null) {
        log(
          "翻页后补选 " +
            selectedThisPage +
            " 项，已选：" +
            selected +
            "，游标页：" +
            (state.lastDialogPage || "未知")
        );
      }

      // selected 不增长时避免死循环
      if (oldSelected !== null && selected !== null && selected <= oldSelected) {
        guard += 2;
      } else {
        guard += 1;
      }
    }

    return {
      selectedCount: selected,
      targetCount: target,
      dialogPendingCount: pendingInDialog
    };
  }

  function hasText(text) {
    return getText(document.body).indexOf(text) !== -1;
  }

  function isOnListPage() {
    return location.href.indexOf("/ffa/g/list") !== -1;
  }

  function isOnRecordPage() {
    const url = location.href;
    return url.indexOf("batch") !== -1 || url.indexOf("record") !== -1 || hasText("批量操作记录");
  }

  async function waitForUrlOrTextChange(timeoutMs) {
    const start = Date.now();
    const initialUrl = location.href;
    while (Date.now() - start < timeoutMs) {
      if (location.href !== initialUrl || isOnRecordPage()) {
        return true;
      }
      await sleep(300);
    }
    return false;
  }

  function getLatestRecordRowText() {
    const rows = document.querySelectorAll("tr");
    for (let i = 0; i < rows.length; i++) {
      const text = getText(rows[i]);
      if (text.indexOf("批量属性优化") !== -1) {
        return text;
      }
    }
    return "";
  }

  function isLatestBatchCompleted() {
    const rowText = getLatestRecordRowText();
    if (!rowText) {
      return false;
    }
    if (rowText.indexOf("已完成") !== -1) {
      return true;
    }
    if (
      rowText.indexOf("下载") !== -1 &&
      rowText.indexOf("处理中") === -1 &&
      rowText.indexOf("执行中") === -1 &&
      rowText.indexOf("排队") === -1 &&
      rowText.indexOf("等待") === -1
    ) {
      return true;
    }
    const successFailMatch = rowText.match(/成功数量\s*[:：]?\s*(\d+).{0,20}失败数量\s*[:：]?\s*(\d+)/);
    if (successFailMatch) {
      return parseInt(successFailMatch[2], 10) === 0 && parseInt(successFailMatch[1], 10) > 0;
    }
    return false;
  }

  async function waitForBatchCompletionInRecords() {
    const jumped = await waitForUrlOrTextChange(15000);
    if (!jumped) {
      log("提交后未检测到页面跳转，按兜底等待处理");
      await sleep(CONFIG.fallbackRecordWaitMs);
      return;
    }

    if (!isOnRecordPage()) {
      log("已跳转但非记录页，按兜底等待处理");
      await sleep(CONFIG.fallbackRecordWaitMs);
      return;
    }

    log("已进入批量操作记录页，开始轮询本批结果");
    const start = Date.now();
    while (Date.now() - start < CONFIG.recordWaitTimeoutMs) {
      if (isLatestBatchCompleted()) {
        log("检测到最新批量属性优化记录已完成");
        return;
      }
      const rowText = getLatestRecordRowText();
      if (rowText) {
        log("记录页状态中：" + rowText.slice(0, 80));
      } else {
        log("记录页暂未发现批量属性优化记录，继续等待");
      }
      await sleep(CONFIG.recordPollIntervalMs);
    }
    log("记录页轮询超时，继续后续流程");
  }

  async function returnToListPage() {
    if (isOnListPage()) {
      return true;
    }
    log("返回商品管理页继续下一批");
    location.href = state.lastListUrl || CONFIG.listUrl;
    const start = Date.now();
    while (Date.now() - start < 20000) {
      if (isOnListPage()) {
        await sleep(2000);
        return true;
      }
      await sleep(500);
    }
    return false;
  }

  async function waitForDialog(timeout) {
    const maxWait = timeout || 5000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      if (findElementByText("属性待优化")) {
        await sleep(600);
        return true;
      }
      await sleep(250);
    }
    throw new Error("属性待优化弹窗超时");
  }

  async function clickBatchOptimize() {
    const btn = findButtonByText(["批量优化属性", "优化属性"]);
    if (!btn) {
      throw new Error("未找到批量优化属性按钮");
    }
    btn.click();
    log("已点击批量优化属性");
    await waitForDialog();
  }

  async function checkAgreement() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    let agreementCheckbox = null;

    for (let i = 0; i < checkboxes.length; i++) {
      const cb = checkboxes[i];
      const nearText = getText(cb.parentElement) + " " + getText(cb.parentElement && cb.parentElement.parentElement);
      if (nearText.indexOf("承诺函") !== -1) {
        agreementCheckbox = cb;
        break;
      }
    }

    if (!agreementCheckbox) {
      for (let i = 0; i < checkboxes.length; i++) {
        if (!checkboxes[i].checked) {
          agreementCheckbox = checkboxes[i];
          break;
        }
      }
    }

    if (!agreementCheckbox) {
      log("未找到承诺函勾选框");
      return false;
    }

    if (!agreementCheckbox.checked) {
      agreementCheckbox.click();
      log("已勾选承诺函");
      await sleep(600);
    }

    for (let i = 0; i < 20; i++) {
      const btn = findButtonByText("一键优化属性");
      if (btn && !btn.disabled) {
        return true;
      }
      await sleep(300);
    }

    log("一键优化属性按钮未激活");
    return false;
  }

  async function clickOneClickOptimize() {
    for (let i = 0; i < 20; i++) {
      const btn = findButtonByText("一键优化属性");
      if (btn && !btn.disabled) {
        btn.click();
        log("已点击一键优化属性");
        await sleep(800);
        return true;
      }
      await sleep(400);
    }
    throw new Error("一键优化属性按钮不可用");
  }

  async function confirmSubmit() {
    await sleep(600);
    for (let i = 0; i < 10; i++) {
      if (findElementByText("此操作不可撤回")) {
        break;
      }
      await sleep(300);
    }

    const confirmBtn = findButtonByText(["确定", "确认提交"]);
    if (confirmBtn && !confirmBtn.disabled) {
      confirmBtn.click();
      log("已确认提交");
      await sleep(1800);
      return true;
    }

    log("未找到确认按钮");
    return false;
  }

  async function closeDialog() {
    const closeBtn =
      findButtonByText(["取消", "关闭"]) ||
      document.querySelector('[aria-label*="关闭"]') ||
      document.querySelector('[class*="close"]');

    if (closeBtn) {
      closeBtn.click();
      await sleep(600);
    }
  }

  async function processBatch() {
    const pendingBefore = getPendingCount();
    log("开始处理第 " + (state.batchCount + 1) + " 批");
    await rememberListPosition();
    await clickBatchOptimize();
    const selection = await ensureBatchSelectionTarget();
    if (selection.selectedCount === null || selection.selectedCount <= 0) {
      throw new Error("弹窗中未选中可优化商品，取消本批提交");
    }
    const canSubmitSmallBatch =
      selection.dialogPendingCount !== null && selection.dialogPendingCount <= selection.targetCount;
    if (selection.selectedCount < selection.targetCount && !canSubmitSmallBatch) {
      throw new Error(
        "本批未达到目标数量（目标 " +
          selection.targetCount +
          "，实际 " +
          selection.selectedCount +
          "），为避免低效提交已中止本批"
      );
    }
    if (selection.selectedCount < selection.targetCount) {
      log("提示：本批未达到目标数量，目标 " + selection.targetCount + "，实际 " + selection.selectedCount);
    }
    await checkAgreement();
    const selectedCount = getBatchSelectedCount();
    if (selectedCount !== null) {
      log("本批识别到待提交商品数：" + selectedCount);
    }
    await clickOneClickOptimize();
    await confirmSubmit();
    await waitForBatchCompletionInRecords();
    state.batchCount += 1;
    const pendingAfter = null;

    let optimizedThisBatch = selectedCount || selection.selectedCount || 0;
    if (optimizedThisBatch <= 0 && pendingBefore !== null && pendingAfter !== null && pendingBefore >= pendingAfter) {
      optimizedThisBatch = pendingBefore - pendingAfter;
    }
    if (optimizedThisBatch <= 0) {
      optimizedThisBatch = 1;
    }
    state.totalOptimized += optimizedThisBatch;
    await syncRuntime();

    const pendingText = pendingAfter === null ? "未知" : String(pendingAfter);
    log("第 " + state.batchCount + " 批完成，本批约 " + optimizedThisBatch + "，累计优化 " + state.totalOptimized + "，剩余 " + pendingText);
    try {
      chrome.runtime.sendMessage({
        type: "progress",
        batchCount: state.batchCount,
        totalOptimized: state.totalOptimized,
        pendingCount: pendingAfter === null ? state.lastKnownPending : pendingAfter
      }).catch(function () {});
    } catch (e) {}

    if (state.stopRequested) {
      log("当前批次已完成，停止请求生效，不再继续下一批");
      return;
    }

    await returnToListPage();
    await sleep(2000);
  }

  async function processBatchWithRetry() {
    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
      try {
        await processBatch();
        return true;
      } catch (error) {
        log("批处理失败（第 " + attempt + "/" + CONFIG.maxRetries + " 次）: " + error.message);
        await closeDialog();
        if (attempt < CONFIG.maxRetries) {
          await sleep(1500 * attempt);
        }
      }
    }
    return false;
  }

  async function mainLoop() {
    state.isRunning = true;
    state.stopRequested = false;
    if (!state.startTime) {
      state.startTime = Date.now();
    }
    await syncRuntime();
    log("自动优化已启动");

    while (state.isRunning) {
      if (!isOnListPage()) {
        await returnToListPage();
      }

      await restoreListPosition();
      await rememberListPosition();

      const pending = getPendingCount();
      if (pending === 0) {
        log("未检测到待优化商品，流程结束");
        break;
      }
      if (pending === null) {
        log("未能识别剩余数量，继续执行下一批");
      } else {
        log("当前待优化数量：" + pending);
      }

      const ok = await processBatchWithRetry();
      if (!ok) {
        log("连续重试失败，已停止本次任务");
        break;
      }

      if (state.stopRequested) {
        log("已按请求停止任务");
        break;
      }

      if (!state.isRunning) {
        break;
      }
      await sleep(CONFIG.interval);
    }

    if (state.startTime) {
      state.elapsedMs += Math.max(Date.now() - state.startTime, 0);
      state.startTime = null;
    }
    state.stopRequested = false;
    const duration = Math.round((state.elapsedMs || 0) / 1000);
    state.isRunning = false;
    await syncRuntime();
    log("优化完成：共 " + state.batchCount + " 批，" + state.totalOptimized + " 个商品，耗时 " + duration + " 秒");

    try {
      chrome.runtime.sendMessage({
        type: "complete",
        batchCount: state.batchCount,
        totalOptimized: state.totalOptimized
      }).catch(function () {});
    } catch (e) {}
  }

  function stop() {
    if (!state.isRunning) {
      log("当前未在运行");
      return;
    }
    state.stopRequested = true;
    syncRuntime();
    log("已请求停止，将在当前批次完成后结束");
  }

  function startMainLoop() {
    if (loopPromise) {
      return loopPromise;
    }
    loopPromise = mainLoop().finally(function () {
      loopPromise = null;
    });
    return loopPromise;
  }

  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (!request || !request.action) {
      sendResponse({ status: "ignored" });
      return true;
    }

    if (request.action === "start") {
      if (!state.isRunning) {
        state.batchCount = 0;
        state.totalOptimized = 0;
        state.startTime = null;
        state.lastKnownPending = null;
        state.lastListUrl = isOnListPage() ? location.href : CONFIG.listUrl;
        state.lastListPage = isOnListPage() ? getCurrentListPageNumber() : null;
        state.lastDialogPage = 1;
        startMainLoop();
        sendResponse({ status: "started" });
      } else {
        sendResponse({ status: "already_running" });
      }
    } else if (request.action === "stop") {
      stop();
      sendResponse({ status: "stopped" });
    } else if (request.action === "getStatus") {
      const pending = getPendingCount();
      sendResponse({
        isRunning: state.isRunning,
        batchCount: state.batchCount,
        totalOptimized: state.totalOptimized,
        pendingCount: pending === null ? state.lastKnownPending : pending,
        lastListPage: state.lastListPage
      });
    } else {
      sendResponse({ status: "unknown_action" });
    }

    return true;
  });

  restoreRuntime()
    .then(async function () {
      renderFloatingPanel();
      startPendingSync();
      startElapsedTimer();
      log("content script 已加载");
      setTimeout(function () {
        getPendingCount();
      }, 1200);
      if (state.isRunning && !state.stopRequested) {
        log("检测到上次任务仍在运行，正在尝试自动恢复");
        startMainLoop();
      } else if (state.isRunning && state.stopRequested) {
        log("检测到任务处于停止收尾状态，本页不再自动续跑");
      }
    })
    .catch(function () {
      renderFloatingPanel();
      startPendingSync();
      startElapsedTimer();
      log("content script 已加载");
      setTimeout(function () {
        getPendingCount();
      }, 1200);
    });
})();
