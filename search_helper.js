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
  const timeoutMs = options.timeout || 3500;
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
            content: text.trim().slice(0, 1500)
          };
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  // 若完整長句搜尋無結果且包含多個詞彙，自動降級為核心關鍵詞再次搜尋
  const words = cleanQuery.split(/[\s,，]+/);
  if (words.length > 3) {
    const simplifiedQuery = words.slice(0, 3).join(' ');
    for (const baseUrl of ENDPOINTS) {
      try {
        const url = `${baseUrl.replace(/\/+$/, '')}/s/${encodeURIComponent(simplifiedQuery)}`;
        const res = await fetch(url, {
          headers: { 'Accept': 'text/plain' },
          signal: AbortSignal.timeout(2500)
        });

        if (res.ok) {
          const text = await res.text();
          if (text && text.trim().length > 0) {
            return {
              success: true,
              endpoint: baseUrl,
              query: simplifiedQuery,
              content: text.trim().slice(0, 1500)
            };
          }
        }
      } catch (err) {}
    }
  }

  return {
    success: false,
    query: cleanQuery,
    content: `即時搜尋查無關於「${cleanQuery}」的明確上線記錄。若該商品、功能或型號目前尚未在台發售或不存在，請明確如實向用戶說明，並提供目前最新款型號或替代方案的相關說明。`,
    error: lastError ? lastError.message : 'All search endpoints failed'
  };
}

/**
 * 讀取並解析網頁或線上文件為 Markdown (支援 David888 Wiki 原生直讀與 2MD 高可用端點)
 * @param {string} targetUrl - 目標網址
 * @param {Object} options - 選項
 */
async function readWebPage(targetUrl, options = {}) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { success: false, error: 'URL is required' };
  }

  const cleanUrl = targetUrl.trim();
  const timeoutMs = options.timeout || 4000;

  // 1. 若為 David888 Wiki 網址 (wiki.david888.com 或相關別名)，直接使用原生 Markdown 端點抓取完整原文
  const isWikiUrl = /wiki\.(?:david888\.com|glsoft\.ai|aiurl\.tw)/i.test(cleanUrl) || 
                    (process.env.WIKI_BASE_URL && cleanUrl.startsWith(process.env.WIKI_BASE_URL.replace(/\/+$/, '')));
  if (isWikiUrl) {
    try {
      const res = await fetch(cleanUrl, {
        method: 'GET',
        headers: { 'Accept': 'text/markdown, text/plain, */*' },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 0) {
          return {
            success: true,
            endpoint: 'David888 Wiki Native Markdown Engine',
            url: cleanUrl,
            content: text.trim().slice(0, 8000)
          };
        }
      }
    } catch (wikiErr) {
      console.warn(`[search_helper] David888 Wiki 原生讀取失敗: ${wikiErr.message}`);
    }
  }

  // 2. 一般網頁使用 2MD 多端點高可用解析
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
            content: text.trim().slice(0, 3000) // 限制長度以防 token 超限
          };
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  // 3. 備用：若 2MD 全數失敗，嘗試直接 GET 原始網址 (適用於 Markdown/純文字/API 內容)
  try {
    const directRes = await fetch(cleanUrl, {
      method: 'GET',
      headers: { 'Accept': 'text/markdown, text/plain, text/html, */*' },
      signal: AbortSignal.timeout(10000)
    });
    if (directRes.ok) {
      const text = await directRes.text();
      if (text && text.trim().length > 0) {
        return {
          success: true,
          endpoint: 'Direct HTTP Fallback',
          url: cleanUrl,
          content: text.trim().slice(0, 18000)
        };
      }
    }
  } catch (directErr) {
    console.warn(`[search_helper] Direct fetch fallback failed: ${directErr.message}`);
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
      name: 'get_current_weather',
      description: '查詢台灣各縣市鄉鎮區或全球城市的即時天氣、氣溫、體感溫度、濕度、降雨機率與天氣狀況。當使用者詢問天氣、氣溫、降雨、是否帶傘時呼叫此工具。',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: '查詢的地點名稱，例如：高雄鼓山區、台北南港、台中西屯、台南、東京'
          }
        },
        required: ['location']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_web_page',
      description: '讀取並提取指定網址 (URL) 或線上文件 (網頁、新聞、GitHub、PDF、David888 Wiki 筆記等) 的完整內文轉換為 Markdown。當需要深入閱讀特定網站文章或連結內容時呼叫。',
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
  },
  {
    type: 'function',
    function: {
      name: 'read_wiki_note',
      description: '讀取 David888 Wiki (wiki.david888.com) 筆記或分享連結的完整 Markdown 內文。當使用者提供 Wiki 網址 (如 https://wiki.david888.com/share/xxx 或 https://wiki.david888.com/xxx)、筆記路徑或要求分析 Wiki 文章內容時呼叫此工具。',
      parameters: {
        type: 'object',
        properties: {
          url_or_slug: {
            type: 'string',
            description: 'Wiki 筆記的完整網址 (如 https://wiki.david888.com/share/xxxx) 或路徑 slug (如 article-123)'
          },
          password: {
            type: 'string',
            description: '存取密碼 (若筆記有設定密碼保護時提供，平時留空)'
          }
        },
        required: ['url_or_slug']
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
