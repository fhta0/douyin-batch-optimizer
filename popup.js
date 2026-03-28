// 抖店批量属性优化助手 - Popup Script
console.log('[Popup] 脚本已加载');

document.addEventListener('DOMContentLoaded', function() {
  console.log('[Popup] DOM已加载');
  
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusBadge = document.getElementById('statusBadge');
  const batchCountEl = document.getElementById('batchCount');
  const totalOptimizedEl = document.getElementById('totalOptimized');
  const pendingCountEl = document.getElementById('pendingCount');
  const logList = document.getElementById('logList');
  
  let logs = [];
  let isConnected = false;
  
  // 更新状态显示
  function updateStatus(status) {
    console.log('[Popup] 更新状态:', status);
    
    if (status.isRunning) {
      statusBadge.textContent = '运行中';
      statusBadge.className = 'status-badge running';
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      statusBadge.textContent = '已停止';
      statusBadge.className = 'status-badge stopped';
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
    
    batchCountEl.textContent = status.batchCount || 0;
    totalOptimizedEl.textContent = status.totalOptimized || 0;
    pendingCountEl.textContent = status.pendingCount !== undefined ? status.pendingCount : '-';
  }
  
  // 添加日志
  function addLog(message) {
    console.log('[Popup] 日志:', message);
    logs.unshift(message);
    if (logs.length > 20) {
      logs.pop();
    }
    renderLogs();
  }
  
  // 渲染日志
  function renderLogs() {
    if (logList) {
      logList.innerHTML = logs.map(log => 
        `<div class="log-item">${log}</div>`
      ).join('');
    }
  }
  
  // 获取当前标签页
  async function getCurrentTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0];
    } catch (error) {
      console.error('[Popup] 获取标签页失败:', error);
      return null;
    }
  }
  
  // 检查是否在正确的页面
  async function checkPage() {
    const tab = await getCurrentTab();
    if (!tab) {
      addLog('❌ 无法获取当前页面');
      return false;
    }
    
    console.log('[Popup] 当前页面:', tab.url);
    
    if (!tab.url || !tab.url.includes('fxg.jinritemai.com')) {
      addLog('❌ 请在抖店商品管理页面使用本插件');
      addLog('当前页面: ' + (tab.url || '未知'));
      return false;
    }
    
    return tab;
  }
  
  // 开始优化
  startBtn.addEventListener('click', async function() {
    console.log('[Popup] 点击开始按钮');
    
    const tab = await checkPage();
    if (!tab) {
      alert('请先在浏览器中打开抖店商品管理页面！\n\nURL: https://fxg.jinritemai.com/ffa/g/list');
      return;
    }
    
    try {
      addLog('🚀 正在发送开始指令...');
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'start' });
      console.log('[Popup] 收到响应:', response);
      
      if (response && response.status === 'started') {
        addLog('✅ 已开始优化');
        updateStatus({ isRunning: true, batchCount: 0, totalOptimized: 0 });
      } else if (response && response.status === 'already_running') {
        addLog('⚠️ 优化已在运行中');
      } else {
        addLog('❌ 启动失败: ' + (response ? JSON.stringify(response) : '无响应'));
      }
    } catch (error) {
      console.error('[Popup] 启动失败:', error);
      addLog('❌ 启动失败: ' + error.message);
      addLog('💡 提示: 请刷新页面后重试');
    }
  });
  
  // 停止优化
  stopBtn.addEventListener('click', async function() {
    console.log('[Popup] 点击停止按钮');
    
    const tab = await checkPage();
    if (!tab) return;
    
    try {
      addLog('🛑 正在发送停止指令...');
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'stop' });
      console.log('[Popup] 收到响应:', response);
      
      if (response && response.status === 'stopped') {
        addLog('🛑 已停止优化');
        updateStatus({ isRunning: false, batchCount: 0, totalOptimized: 0 });
      }
    } catch (error) {
      console.error('[Popup] 停止失败:', error);
      addLog('❌ 停止失败: ' + error.message);
    }
  });
  
  // 监听来自content script的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Popup] 收到消息:', request);
    
    if (request.type === 'log') {
      addLog(request.message);
    } else if (request.type === 'progress') {
      updateStatus({
        isRunning: true,
        batchCount: request.batchCount,
        totalOptimized: request.totalOptimized,
        pendingCount: request.pendingCount
      });
    } else if (request.type === 'complete') {
      addLog(`🎉 优化完成！共处理 ${request.batchCount} 批`);
      updateStatus({ 
        isRunning: false, 
        batchCount: request.batchCount, 
        totalOptimized: request.totalOptimized 
      });
    }
    
    sendResponse({ received: true });
    return true;
  });
  
  // 定期获取状态
  async function pollStatus() {
    const tab = await checkPage();
    if (!tab) {
      updateStatus({ isRunning: false, batchCount: 0, totalOptimized: 0, pendingCount: '-' });
      return;
    }
    
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
      console.log('[Popup] 状态轮询:', response);
      if (response) {
        updateStatus(response);
      }
    } catch (error) {
      // 忽略错误，content script 可能还没加载
      console.log('[Popup] 状态轮询失败:', error.message);
    }
  }
  
  // 初始化
  addLog('🚀 抖店批量属性优化助手已就绪');
  addLog('请打开抖店商品管理页面');
  addLog('然后点击"开始优化"按钮');
  
  // 立即检查一次状态
  pollStatus();
  
  // 定期轮询状态
  setInterval(pollStatus, 2000);
});
