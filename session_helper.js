/**
 * session_helper.js - 現代化 Session 多輪對話記憶與長效持久化引擎
 * 
 * 特色：
 * 1. 支援 /new 或 !new 隨時手動建立獨立 Session
 * 2. 支援 7 天長效記憶 (若 7 天內無新對話，背景自動開立全新 Session)
 * 3. 本地檔案持久化存儲 (./data/sessions.json)，重啟伺服器或容器不丟失記憶
 * 4. 支援 /sessions 查看話題清單、/session <id> 切換話題、/clear 清除記憶
 * 5. 智慧上下文壓縮 (Token Compaction)，自動保持最佳 LLM Prompt 長度
 */

const fs = require('fs');
const path = require('path');
const securityHelper = require('./security_helper');

const DATA_DIR = path.resolve(__dirname, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const DEFAULT_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || '7', 10);
const SESSION_TTL_MS = DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000;
const MAX_PROMPT_MESSAGES = 16; // 傳給 LLM 的最佳滾動上下文輪數

// 記憶體快取結構：Map<userId, UserData>
// UserData: { currentSessionId, sessions: { [id]: SessionData } }
// SessionData: { id, title, createdAt, updatedAt, messages: [{ role, content, timestamp }] }
const memoryCache = new Map();
let saveTimeout = null;

// 初始化資料目錄與讀取歷史檔案
function initStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        for (const [uid, uData] of Object.entries(parsed)) {
          memoryCache.set(uid, uData);
        }
        console.log(`✅ [SessionHelper] 成功載入 ${memoryCache.size} 位用戶的歷史 Session 記憶檔`);
      }
    }
  } catch (err) {
    console.error('❌ [SessionHelper] 載入 Session 檔案失敗:', err.message);
  }
}

// 異步防抖持久化寫入 (Atomic File Write)
function persistToDisk() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const dataObj = {};
      for (const [uid, uData] of memoryCache.entries()) {
        dataObj[uid] = uData;
      }
      const tempFile = `${SESSIONS_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(dataObj, null, 2), 'utf-8');
      fs.renameSync(tempFile, SESSIONS_FILE);
    } catch (err) {
      console.error('❌ [SessionHelper] 寫入 Session 檔案失敗:', err.message);
    }
  }, 1000);
}

// 取得或建立用戶 Session
function getOrCreateActiveSession(userId) {
  if (!userId) return null;
  const now = Date.now();

  let uData = memoryCache.get(userId);
  if (!uData) {
    uData = {
      currentSessionId: '',
      sessions: {}
    };
    memoryCache.set(userId, uData);
  }

  let currentSess = uData.currentSessionId ? uData.sessions[uData.currentSessionId] : null;

  // 若目前無 Session 或已超過 7 天無互動，自動開立全新 Session
  if (!currentSess || (now - currentSess.updatedAt > SESSION_TTL_MS)) {
    const isTimeout = currentSess && (now - currentSess.updatedAt > SESSION_TTL_MS);
    const newId = `sess_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const newTitle = isTimeout ? `話題 (間隔超過 ${DEFAULT_TTL_DAYS} 天自動建立)` : '新話題';

    currentSess = {
      id: newId,
      title: newTitle,
      createdAt: now,
      updatedAt: now,
      messages: []
    };

    uData.sessions[newId] = currentSess;
    uData.currentSessionId = newId;
    persistToDisk();

    if (isTimeout) {
      console.log(`⏱️ [SessionHelper] 用戶 ${userId} 超過 ${DEFAULT_TTL_DAYS} 天未對話，自動啟動新 Session [${newId}]`);
    } else {
      console.log(`✨ [SessionHelper] 為用戶 ${userId} 建立新 Session [${newId}]`);
    }
  }

  return currentSess;
}

// 主動開立全新 Session (手動 /new)
function startNewSession(userId, initialTitle = '') {
  if (!userId) return null;
  const now = Date.now();

  let uData = memoryCache.get(userId);
  if (!uData) {
    uData = {
      currentSessionId: '',
      sessions: {}
    };
    memoryCache.set(userId, uData);
  }

  const newId = `sess_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const sessTitle = initialTitle || `話題 (${new Date(now).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })})`;

  const newSess = {
    id: newId,
    title: sessTitle,
    createdAt: now,
    updatedAt: now,
    messages: []
  };

  uData.sessions[newId] = newSess;
  uData.currentSessionId = newId;
  persistToDisk();

  console.log(`🆕 [SessionHelper] 用戶 ${userId} 手動開啟新 Session: [${newId}] ${sessTitle}`);
  return newSess;
}

// 切換至指定 Session (/session <id>)
function switchSession(userId, targetSessionId) {
  if (!userId || !targetSessionId) return { success: false, message: '請提供話題 ID' };
  
  // 驗證 Session ID 格式 (英數字元、減號、底線)，防範路徑遍歷與 Prototype 污染
  if (!securityHelper.isValidId(targetSessionId)) {
    return { success: false, message: '無效的話題 ID 格式' };
  }

  const uData = memoryCache.get(userId);
  if (!uData || !uData.sessions || !Object.prototype.hasOwnProperty.call(uData.sessions, targetSessionId)) {
    return { success: false, message: `找不到話題 ID「${targetSessionId}」` };
  }

  uData.currentSessionId = targetSessionId;
  uData.sessions[targetSessionId].updatedAt = Date.now();
  persistToDisk();

  return {
    success: true,
    session: uData.sessions[targetSessionId],
    message: `已切換至話題：「${uData.sessions[targetSessionId].title}」`
  };
}

// 清除當前 Session 內容
function clearCurrentSession(userId) {
  if (!userId) return null;
  const uData = memoryCache.get(userId);
  if (!uData || !uData.currentSessionId || !uData.sessions[uData.currentSessionId]) {
    return startNewSession(userId, '新話題');
  }

  const currentSess = uData.sessions[uData.currentSessionId];
  currentSess.messages = [];
  currentSess.updatedAt = Date.now();
  persistToDisk();
  return currentSess;
}

// 取得用戶近期 Session 清單
function listUserSessions(userId) {
  if (!userId) return [];
  const uData = memoryCache.get(userId);
  if (!uData || !uData.sessions) return [];

  return Object.values(uData.sessions)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8); // 回傳最近 8 個話題
}

// 寫入訊息至當前 Session
function appendMessageToSession(userId, role, content) {
  if (!userId || !role || !content) return;
  const sess = getOrCreateActiveSession(userId);
  if (!sess) return;

  sess.messages.push({
    role: role,
    content: content,
    timestamp: Date.now()
  });

  // 自動根據首則使用者訊息更新話題標題
  if (role === 'user' && (!sess.title || sess.title.startsWith('新話題') || sess.title.startsWith('話題 ('))) {
    const cleanTitle = content.replace(/https?:\/\/[^\s]+/g, '').trim();
    if (cleanTitle.length > 0) {
      sess.title = cleanTitle.slice(0, 24);
    }
  }

  sess.updatedAt = Date.now();
  persistToDisk();
}

// 構建傳給 LLM 的上下文訊息陣列
function buildPromptMessages(userId, systemPrompt, currentTurnUserContent) {
  const sess = getOrCreateActiveSession(userId);
  const messages = [{ role: 'system', content: systemPrompt }];

  if (sess && sess.messages && sess.messages.length > 0) {
    // 取得最近 6 則訊息以節省 Token，並限制每則歷史文字上限
    const recentHistory = sess.messages.slice(-6);
    for (const msg of recentHistory) {
      const trimmedContent = (msg.content && msg.content.length > 500)
        ? msg.content.slice(0, 500) + '...'
        : (msg.content || '');
      messages.push({
        role: msg.role,
        content: trimmedContent
      });
    }
  }

  messages.push({
    role: 'user',
    content: currentTurnUserContent
  });

  return messages;
}

// 格式化「開啟新話題 (/new)」的 LINE Flex 卡片
function formatNewSessionFlex(session) {
  return {
    type: 'flex',
    altText: `✨ 已開啟全新話題：${session.title}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: '✨ 全新對話 Session 已開啟',
            weight: 'bold',
            size: 'md',
            color: '#38BDF8'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: `話題名稱：${session.title}`,
            weight: 'bold',
            size: 'sm',
            color: '#1E293B',
            wrap: true
          },
          {
            type: 'text',
            text: `話題 ID：${session.id}`,
            size: 'xs',
            color: '#64748B'
          },
          {
            type: 'separator'
          },
          {
            type: 'text',
            text: `💡 系統將持續記憶此話題（${DEFAULT_TTL_DAYS}天內自動延續）。\n隨時發送 !new 或「開啟新對話」可開啟下一個話題，發送 !sessions 可切換歷史話題。`,
            size: 'xs',
            color: '#475569',
            wrap: true
          }
        ]
      }
    }
  };
}

// 格式化「歷史話題列表 (!sessions)」的 LINE Flex 卡片
function formatSessionsListFlex(userId, sessions, currentSessionId) {
  const sessionBoxes = sessions.map((s, idx) => {
    const isCurrent = s.id === currentSessionId;
    const timeStr = new Date(s.updatedAt).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return {
      type: 'box',
      layout: 'vertical',
      backgroundColor: isCurrent ? '#F0FDF4' : '#F8FAFC',
      cornerRadius: 'md',
      paddingAll: 'md',
      margin: 'sm',
      borderColor: isCurrent ? '#22C55E' : '#E2E8F0',
      borderWidth: '1px',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: `${isCurrent ? '🟢 [進行中] ' : '💬 '}${s.title}`,
              weight: 'bold',
              size: 'xs',
              color: isCurrent ? '#15803D' : '#1E293B',
              flex: 8,
              wrap: true
            },
            {
              type: 'text',
              text: `${s.messages?.length || 0}則`,
              size: 'xxs',
              color: '#94A3B8',
              flex: 2,
              align: 'end'
            }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'xs',
          contents: [
            {
              type: 'text',
              text: `ID: ${s.id} · ${timeStr}`,
              size: 'xxs',
              color: '#64748B',
              flex: 7
            },
            {
              type: 'text',
              text: isCurrent ? '當前話題' : `切換話題`,
              size: 'xxs',
              color: isCurrent ? '#16A34A' : '#0284C7',
              align: 'end',
              flex: 3,
              action: {
                type: 'message',
                label: '切換',
                text: `!session ${s.id}`
              }
            }
          ]
        }
      ]
    };
  });

  return {
    type: 'flex',
    altText: '📚 您的對話話題 (Sessions) 清單',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: '📚 您的歷史話題 (Sessions)',
            weight: 'bold',
            size: 'md',
            color: '#38BDF8'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'none',
        contents: [
          {
            type: 'text',
            text: `點擊下方話題可切換上下文，或輸入 !new 開啟新話題：`,
            size: 'xs',
            color: '#64748B',
            margin: 'none'
          },
          ...sessionBoxes
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#0284C7',
            height: 'sm',
            action: {
              type: 'message',
              label: '✨ 開啟新話題 (!new)',
              text: '!new'
            }
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'message',
              label: '🧹 清除記憶 (!clear)',
              text: '!clear'
            }
          }
        ]
      }
    }
  };
}

// 格式化全域功能說明與互動指令選單 (!help / 說明)
function formatGlobalHelpFlex() {
  return {
    type: 'flex',
    altText: '📖 機器人完整功能與指令說明',
    contents: {
      type: 'carousel',
      contents: [
        // Slide 1: 記憶與對話話題管理 (Session)
        {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#0F172A',
            paddingAll: 'lg',
            contents: [
              { type: 'text', text: '💬 話題記憶與管理 (Session)', weight: 'bold', size: 'md', color: '#38BDF8' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '🤖 7 天長效記憶 & 多話題切換', weight: 'bold', size: 'xs', color: '#1E293B' },
              { type: 'text', text: '• !new 或 開啟新對話：建立全新話題\n• !sessions 或 查看話題：列出歷史話題並切換\n• !clear 或 清除記憶：清空當前話題訊息\n• 7 天內無發言將自動開立新話題', size: 'xs', color: '#64748B', wrap: true }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#0284C7',
                height: 'sm',
                action: { type: 'message', label: '✨ 開啟新話題 (!new)', text: '!new' }
              },
              {
                type: 'button',
                style: 'secondary',
                height: 'sm',
                action: { type: 'message', label: '📚 查看歷史話題 (!sessions)', text: '!sessions' }
              }
            ]
          }
        },
        // Slide 2: AI 繪圖與視覺
        {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#1E1B4B',
            paddingAll: 'lg',
            contents: [
              { type: 'text', text: '🎨 AI 繪圖創作與修圖', weight: 'bold', size: 'md', color: '#A855F7' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '🖼️ Gemini AI 繪圖與 888box CDN', weight: 'bold', size: 'xs', color: '#1E293B' },
              { type: 'text', text: '• 產圖 <描述>：直接繪製全新圖片\n• 生圖 <描述> 或 幫我畫 <描述>\n• 直接傳送圖片：AI 看圖說話與圖片分析\n• 圖片編輯：對圖片進行修改修圖', size: 'xs', color: '#64748B', wrap: true }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#7C3AED',
                height: 'sm',
                action: { type: 'message', label: '🎨 繪製小貓 (!產圖)', text: '產圖 一隻可愛的小貓在花園裡玩耍' }
              },
              {
                type: 'button',
                style: 'secondary',
                height: 'sm',
                action: { type: 'message', label: '🖼️ 進入畫圖模式', text: '畫圖' }
              }
            ]
          }
        },
        // Slide 3: 2MD 即時聯網搜尋與網頁解析
        {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#064E3B',
            paddingAll: 'lg',
            contents: [
              { type: 'text', text: '🌐 即時聯網搜尋與網頁解析', weight: 'bold', size: 'md', color: '#34D399' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '🔍 零幻覺實時資訊檢索', weight: 'bold', size: 'xs', color: '#1E293B' },
              { type: 'text', text: '• 直接詢問即時天氣、今日即時股價、即時新聞\n• !search <關鍵字>：即時搜尋網路\n• !read <網址>：解析網頁轉為純 Markdown\n• 傳送任何網址自動預讀分析', size: 'xs', color: '#64748B', wrap: true }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#059669',
                height: 'sm',
                action: { type: 'message', label: '📰 即時頭條新聞', text: '!search 今日即時頭條新聞' }
              },
              {
                type: 'button',
                style: 'secondary',
                height: 'sm',
                action: { type: 'message', label: '🌤️ 台北即時天氣', text: '!search 台北今日即時天氣與降雨' }
              }
            ]
          }
        },
        // Slide 4: David888 Wiki 知識庫 & 888box 雲端
        {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#4C1D95',
            paddingAll: 'lg',
            contents: [
              { type: 'text', text: '📖 Wiki 知識庫 & 更多服務', weight: 'bold', size: 'md', color: '#F472B6' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '📚 3合1閱讀 (網頁/簡報/電子書)', weight: 'bold', size: 'xs', color: '#1E293B' },
              { type: 'text', text: '• 要求長篇分析時，自動發布至 Wiki 並回傳摘要\n• !wiki：知識庫功能\n• !box：888box 雲端轉存與 Podcast\n• 選擇服務：占卜、食譜、周邊設施、線上工具', size: 'xs', color: '#64748B', wrap: true }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#9333EA',
                height: 'sm',
                action: { type: 'message', label: '📖 David888 Wiki', text: '!wiki' }
              },
              {
                type: 'button',
                style: 'secondary',
                height: 'sm',
                action: { type: 'message', label: '🔮 選擇生活服務', text: '選擇服務' }
              }
            ]
          }
        }
      ]
    }
  };
}

// 初始化
initStorage();

module.exports = {
  DEFAULT_TTL_DAYS,
  SESSION_TTL_MS,
  getOrCreateActiveSession,
  startNewSession,
  switchSession,
  clearCurrentSession,
  listUserSessions,
  appendMessageToSession,
  buildPromptMessages,
  formatNewSessionFlex,
  formatSessionsListFlex,
  formatGlobalHelpFlex
};
