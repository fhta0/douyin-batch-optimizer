const SETTINGS_KEY = "douyin_optimizer_settings";

const DEFAULT_SETTINGS = {
  batchTargetCount: 500,
  intervalSeconds: 3,
  maxRetries: 3,
  recordWaitTimeoutSeconds: 480,
  showFloatingPanel: true,
  panelOpacity: 72,
  autoResumeTask: true,
  logRetentionCount: 20
};

document.addEventListener("DOMContentLoaded", function () {
  const els = {
    batchTargetCount: document.getElementById("batchTargetCount"),
    intervalSeconds: document.getElementById("intervalSeconds"),
    maxRetries: document.getElementById("maxRetries"),
    recordWaitTimeoutSeconds: document.getElementById("recordWaitTimeoutSeconds"),
    logRetentionCount: document.getElementById("logRetentionCount"),
    resetDefaults: document.getElementById("resetDefaults"),
    saveSettings: document.getElementById("saveSettings"),
    statusText: document.getElementById("statusText"),
    advancedToggle: document.getElementById("advancedToggle"),
    advancedBody: document.getElementById("advancedBody"),
    advancedArrow: document.getElementById("advancedArrow")
  };

  let currentSettings = Object.assign({}, DEFAULT_SETTINGS);

  function isDouyinListLikeUrl(url) {
    return typeof url === "string" && url.indexOf("https://fxg.jinritemai.com/") === 0;
  }

  function getActiveTab() {
    return new Promise(function (resolve) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        resolve(tabs && tabs.length ? tabs[0] : null);
      });
    });
  }

  function sendTabMessage(tabId, payload) {
    return new Promise(function (resolve, reject) {
      chrome.tabs.sendMessage(tabId, payload, function (response) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response);
      });
    });
  }

  function injectContentScript(tabId) {
    return new Promise(function (resolve, reject) {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          files: ["content.js"]
        },
        function () {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(true);
        }
      );
    });
  }

  async function ensureActiveTabPanelReady() {
    const tab = await getActiveTab();
    if (!tab || !tab.id || !isDouyinListLikeUrl(tab.url)) {
      return;
    }

    try {
      await sendTabMessage(tab.id, { action: "ensurePanel" });
    } catch (error) {
      await injectContentScript(tab.id);
      setTimeout(function () {
        sendTabMessage(tab.id, { action: "ensurePanel" }).catch(function () {});
      }, 250);
    }
  }

  function setStatus(text) {
    els.statusText.textContent = text || "";
  }

  function getMergedSettings(raw) {
    return sanitizeSettings(Object.assign({}, DEFAULT_SETTINGS, raw || {}));
  }

  function renderForm(settings) {
    els.batchTargetCount.value = settings.batchTargetCount;
    els.intervalSeconds.value = settings.intervalSeconds;
    els.maxRetries.value = settings.maxRetries;
    els.recordWaitTimeoutSeconds.value = settings.recordWaitTimeoutSeconds;
    els.logRetentionCount.value = settings.logRetentionCount;
  }

  function readForm() {
    return {
      batchTargetCount: clampInt(els.batchTargetCount.value, 1, 500, DEFAULT_SETTINGS.batchTargetCount),
      intervalSeconds: clampInt(els.intervalSeconds.value, 1, 20, DEFAULT_SETTINGS.intervalSeconds),
      maxRetries: clampInt(els.maxRetries.value, 0, 20, DEFAULT_SETTINGS.maxRetries),
      recordWaitTimeoutSeconds: clampInt(
        els.recordWaitTimeoutSeconds.value,
        30,
        3600,
        DEFAULT_SETTINGS.recordWaitTimeoutSeconds
      ),
      logRetentionCount: clampInt(els.logRetentionCount.value, 5, 200, DEFAULT_SETTINGS.logRetentionCount)
    };
  }

  function clampInt(value, min, max, fallback) {
    const num = parseInt(value, 10);
    if (Number.isNaN(num)) {
      return fallback;
    }
    return Math.min(Math.max(num, min), max);
  }

  function sanitizeSettings(raw) {
    return {
      batchTargetCount: clampInt(raw.batchTargetCount, 1, 500, DEFAULT_SETTINGS.batchTargetCount),
      intervalSeconds: clampInt(raw.intervalSeconds, 1, 20, DEFAULT_SETTINGS.intervalSeconds),
      maxRetries: clampInt(raw.maxRetries, 0, 20, DEFAULT_SETTINGS.maxRetries),
      recordWaitTimeoutSeconds: clampInt(
        raw.recordWaitTimeoutSeconds,
        30,
        3600,
        DEFAULT_SETTINGS.recordWaitTimeoutSeconds
      ),
      showFloatingPanel: typeof raw.showFloatingPanel === "boolean" ? raw.showFloatingPanel : DEFAULT_SETTINGS.showFloatingPanel,
      panelOpacity: clampInt(raw.panelOpacity, 40, 95, DEFAULT_SETTINGS.panelOpacity),
      autoResumeTask: typeof raw.autoResumeTask === "boolean" ? raw.autoResumeTask : DEFAULT_SETTINGS.autoResumeTask,
      logRetentionCount: clampInt(raw.logRetentionCount, 5, 200, DEFAULT_SETTINGS.logRetentionCount)
    };
  }

  function loadSettings() {
    chrome.storage.local.get([SETTINGS_KEY], function (result) {
      currentSettings = getMergedSettings(result && result[SETTINGS_KEY]);
      renderForm(currentSettings);
    });
  }

  function saveSettings(settings) {
    const sanitized = sanitizeSettings(settings);
    chrome.storage.local.set({ [SETTINGS_KEY]: sanitized }, function () {
      currentSettings = sanitized;
      renderForm(currentSettings);
      setStatus("设置已保存");
      setTimeout(function () {
        window.close();
      }, 120);
    });
  }

  els.advancedToggle.addEventListener("click", function () {
    const hidden = els.advancedBody.hasAttribute("hidden");
    if (hidden) {
      els.advancedBody.removeAttribute("hidden");
      els.advancedArrow.textContent = "∧";
    } else {
      els.advancedBody.setAttribute("hidden", "hidden");
      els.advancedArrow.textContent = "∨";
    }
  });

  els.resetDefaults.addEventListener("click", function () {
    currentSettings = Object.assign({}, DEFAULT_SETTINGS);
    renderForm(currentSettings);
    setStatus("已恢复默认值，点击保存后生效");
  });

  els.saveSettings.addEventListener("click", function () {
    const nextSettings = Object.assign({}, currentSettings, readForm());
    saveSettings(nextSettings);
  });

  loadSettings();
  ensureActiveTabPanelReady().catch(function () {});
});
