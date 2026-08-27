/**
 * search_helper.js - 2MD Fast Reader & Real-Time Web Search (SERP) Engine
 * 支援多端點高可用容錯（Primary: 2md.aiurl.tw / Fallback 1: 2md.glsoft.ai / Fallback 2: create360.ai）
 */

const ENDPOINTS = [
  process.env.SERP_PRIMARY_URL || 'https://2md.aiurl.tw',
  process.env.SERP_FALLBACK_1_URL || 'https://2md.glsoft.ai',
  process.env.SERP_FALLBACK_2_URL || 'https://create360.ai'
];

/**
 * 執行即時網路搜尋 (SERP)
 * @param {string} query - 搜尋關鍵字或問題
 * @param {Object} options - 選項 (limit, timeout)
 */
async function searchWeb(query, options = {}) {
  if (!query || typeof query !== 'string') {
    return { success: false, error: 'Query is required' };
  }

  const cleanQuery = query.trim();
  const timeoutMs = options.timeout || 12000;
  let lastError = null;

  for (const baseUrl of ENDPOINTS) {
    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/s/${encodeURIComponent(cleanQuery)}`;
      const res = await fetch(url, {
        headers: { 'Accept': 'text/plain' },
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 0) {
          return {
            success: true,
            endpoint: baseUrl,
            query: cleanQuery,
            content: text.trim()
          };
        }
      }
    } catch (err) {
      console.warn(`[search_helper] Endpoint ${baseUrl} search failed: ${err.message}`);
      lastError = err;
    }
  }

  return {
    success: false,
    query: cleanQuery,
    error: lastError ? lastError.message : 'All search endpoints failed'
  };
}

/**
 * 讀取並解析網頁或線上文件為 Markdown
 * @param {string} targetUrl - 目標網址
 * @param {Object} options - 選項
 */
async function readWebPage(targetUrl, options = {}) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { success: false, error: 'URL is required' };
  }

  const cleanUrl = targetUrl.trim();
  const timeoutMs = options.timeout || 20000;
  let lastError = null;

  for (const baseUrl of ENDPOINTS) {
    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 0) {
          return {
            success: true,
            endpoint: baseUrl,
            url: cleanUrl,
            content: text.trim().slice(0, 15000) // 限制最大長度以節省上下文
          };
        }
      }
    } catch (err) {
      console.warn(`[search_helper] Endpoint ${baseUrl} read URL failed: ${err.message}`);
      lastError = err;
    }
  }

  return {
    success: false,
    url: cleanUrl,
    error: lastError ? lastError.message : 'All read URL endpoints failed'
  };
}

/**
 * 格式化搜尋結果為 LINE Flex Message 卡片
 * @param {string} query - 搜尋關鍵字
 * @param {string} content - 搜尋摘要內容
 */
function formatSearchFlexMessage(query, content) {
  const preview = content ? content.slice(0, 500) : '無搜尋結果';

  return {
    type: 'flex',
    altText: `🔍 網路搜尋結果：${query}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0284C7',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: '🌐 即時網路搜尋結果',
            weight: 'bold',
            size: 'md',
            color: '#FFFFFF'
          },
          {
            type: 'text',
            text: `關鍵字：${query}`,
            size: 'xs',
            color: '#E0F2FE',
            margin: 'xs'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: preview,
            wrap: true,
            size: 'sm',
            color: '#333333'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '🌐 在 2MD 瀏覽更多',
              uri: `https://2md.aiurl.tw/s/${encodeURIComponent(query)}`
            },
            style: 'primary',
            color: '#0284C7',
            height: 'sm'
          }
        ]
      }
    }
  };
}

// OpenAI Tool 定義
const searchTools = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: '執行即時網路搜尋 (SERP)，取得最新即時新聞、天氣預報、即時股價、匯率、體育賽事比分、最新事件或即時百科資訊。當使用者詢問即時性問題、今日資訊、實時狀況或你內部知識庫未包含的最新事實時，必須呼叫此工具。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜尋關鍵字或查詢語句 (例如：「高雄市鼓山區今日天氣」、「台積電 今日即時股價」、「2026 最新新聞」)'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_web_page',
      description: '讀取並提取指定網址 (URL) 或線上文件 (PDF, Word, PPT, 網頁) 的完整內文轉換為 Markdown。當需要深入閱讀特定網站文章或連結內容時呼叫。',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要抓取並閱讀的完整網址 URL (包含 https://)'
          }
        },
        required: ['url']
      }
    }
  }
];

module.exports = {
  ENDPOINTS,
  searchWeb,
  readWebPage,
  formatSearchFlexMessage,
  searchTools
};
