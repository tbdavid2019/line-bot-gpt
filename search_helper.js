/**
 * search_helper.js - 2MD Fast Reader & Real-Time Web Search (SERP) Engine
 * 支援多端點高可用容錯（Primary: 2md.aiurl.tw / Fallback 1: 2md.glsoft.ai / Fallback 2: create360.ai）
 * 內建智慧動態熔斷器 (Circuit Breaker)、In-Flight 併發請求去重 (Single-Flight) 與短期快取 (TTL Cache)
 */

const securityHelper = require('./security_helper');

const ENDPOINTS = [
  process.env.SERP_PRIMARY_URL || 'https://2md.aiurl.tw',
  process.env.SERP_FALLBACK_1_URL || 'https://2md.glsoft.ai',
  process.env.SERP_FALLBACK_2_URL || 'https://create360.ai'
];

// 預設參數與環境變數設定 (調整至 10.0s，避免誤殺正常爬蟲與即時搜尋)
const SERP_DEFAULT_TIMEOUT = parseInt(process.env.SERP_TIMEOUT_MS, 10) || 10000;
const READ_PAGE_DEFAULT_TIMEOUT = parseInt(process.env.READ_PAGE_TIMEOUT_MS, 10) || 10000;
const SERP_SIMPLIFIED_TIMEOUT = parseInt(process.env.SERP_SIMPLIFIED_TIMEOUT_MS, 10) || 6000;
const CIRCUIT_FAIL_THRESHOLD = parseInt(process.env.SERP_CIRCUIT_FAIL_THRESHOLD, 10) || 2;
const CIRCUIT_COOLDOWN_MS = parseInt(process.env.SERP_CIRCUIT_COOLDOWN_MS, 10) || 45000; // 45 秒熔斷冷卻
const CACHE_TTL_MS = parseInt(process.env.SERP_CACHE_TTL_MS, 10) || (3 * 60 * 1000); // 3 分鐘快取
const MAX_CACHE_ENTRIES = 200;

// 端點熔斷與健康狀態記憶
const endpointStats = new Map();

function getEndpointStats(url) {
  if (!endpointStats.has(url)) {
    endpointStats.set(url, {
      failures: 0,
      lastFailureTime: 0,
      cooldownUntil: 0
    });
  }
  return endpointStats.get(url);
}

function recordSuccess(url) {
  const stats = getEndpointStats(url);
  stats.failures = 0;
  stats.cooldownUntil = 0;
}

function recordFailure(url, err) {
  const stats = getEndpointStats(url);
  stats.failures++;
  stats.lastFailureTime = Date.now();
  if (stats.failures >= CIRCUIT_FAIL_THRESHOLD) {
    stats.cooldownUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    console.warn(`[search_helper] ⚠️ 端點 ${url} 連續失敗 ${stats.failures} 次，已進入熔斷冷卻 (${CIRCUIT_COOLDOWN_MS / 1000}s)，原因: ${err?.message || err}`);
  }
}

/**
 * 取得排序後的可用端點列表
 * 健康端點優先；熔斷冷卻中的端點移至末尾，避免無謂等待造成驚群連鎖
 */
function getPrioritizedEndpoints() {
  const now = Date.now();
  const healthy = [];
  const coolingDown = [];

  for (const url of ENDPOINTS) {
    const stats = getEndpointStats(url);
    if (stats.cooldownUntil > now) {
      coolingDown.push(url);
    } else {
      healthy.push(url);
    }
  }

  // 若所有端點皆在冷卻中，則全數嘗試以進行健康探測
  if (healthy.length === 0) {
    return [...ENDPOINTS];
  }

  return [...healthy, ...coolingDown];
}

// In-Flight 請求去重 (Single-Flight Pattern)，徹底杜絕並發驚群
const inFlightRequests = new Map();

function runSingleFlight(key, taskFn) {
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }
  const promise = (async () => {
    try {
      return await taskFn();
    } finally {
      inFlightRequests.delete(key);
    }
  })();
  inFlightRequests.set(key, promise);
  return promise;
}

// In-Memory 短期 TTL 快取 (防範短時間內重複提問擊穿後端)
const memoryCache = new Map();

function getCached(key) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return item.data;
}

function setCached(key, data) {
  if (!data || !data.success) return;
  if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, { timestamp: Date.now(), data });
}

/**
 * 執行即時網路搜尋 (SERP)
 * @param {string} query - 搜尋關鍵字或問題
 * @param {Object} options - 選項 (limit, timeout, skipCache)
 */
async function searchWeb(query, options = {}) {
  if (!query || typeof query !== 'string') {
    return { success: false, error: 'Query is required' };
  }

  const cleanQuery = query.trim();
  const cacheKey = `serp:${cleanQuery.toLowerCase()}`;

  if (!options.skipCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  return runSingleFlight(cacheKey, async () => {
    const timeoutMs = options.timeout || SERP_DEFAULT_TIMEOUT;
    let lastError = null;
    const candidateEndpoints = getPrioritizedEndpoints();

    for (const baseUrl of candidateEndpoints) {
      try {
        const url = `${baseUrl.replace(/\/+$/, '')}/s/${encodeURIComponent(cleanQuery)}`;
        const res = await fetch(url, {
          headers: { 'Accept': 'text/plain' },
          signal: AbortSignal.timeout(timeoutMs)
        });

        if (res.ok) {
          const text = await res.text();
          if (text && text.trim().length > 0) {
            recordSuccess(baseUrl);
            const result = {
              success: true,
              endpoint: baseUrl,
              query: cleanQuery,
              content: text.trim().slice(0, 1500)
            };
            setCached(cacheKey, result);
            return result;
          }
        }
        recordFailure(baseUrl, new Error(`HTTP ${res.status}`));
      } catch (err) {
        lastError = err;
        recordFailure(baseUrl, err);
      }
    }

    // 若完整長句搜尋無結果且包含多個詞彙，自動降級為核心關鍵詞再次搜尋
    const words = cleanQuery.split(/[\s,，]+/);
    if (words.length > 3) {
      const simplifiedQuery = words.slice(0, 3).join(' ');
      const simplifiedTimeout = options.simplifiedTimeout || SERP_SIMPLIFIED_TIMEOUT;
      const simplifiedCandidateEndpoints = getPrioritizedEndpoints();

      for (const baseUrl of simplifiedCandidateEndpoints) {
        try {
          const url = `${baseUrl.replace(/\/+$/, '')}/s/${encodeURIComponent(simplifiedQuery)}`;
          const res = await fetch(url, {
            headers: { 'Accept': 'text/plain' },
            signal: AbortSignal.timeout(simplifiedTimeout)
          });

          if (res.ok) {
            const text = await res.text();
            if (text && text.trim().length > 0) {
              recordSuccess(baseUrl);
              const result = {
                success: true,
                endpoint: baseUrl,
                query: simplifiedQuery,
                content: text.trim().slice(0, 1500)
              };
              setCached(cacheKey, result);
              return result;
            }
          }
          recordFailure(baseUrl, new Error(`HTTP ${res.status}`));
        } catch (err) {
          recordFailure(baseUrl, err);
        }
      }
    }

    return {
      success: false,
      query: cleanQuery,
      content: `即時搜尋查無關於「${cleanQuery}」的明確上線記錄。若該商品、功能或型號目前尚未在台發售或不存在，請明確如實向用戶說明，並提供目前最新款型號或替代方案的相關說明。`,
      error: lastError ? lastError.message : 'All search endpoints failed'
    };
  });
}

/**
 * 讀取並解析網頁或線上文件為 Markdown (支援 David888 Wiki 原生直讀與 2MD 高可用端點)
 * @param {string} targetUrl - 目標網址
 * @param {Object} options - 選項 (timeout, skipCache)
 */
async function readWebPage(targetUrl, options = {}) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { success: false, error: 'URL is required' };
  }

  const cleanUrl = targetUrl.trim();

  // SSRF 安全防禦檢驗 (封鎖私有 IP、雲端 Metadata、Loopback)
  if (!securityHelper.isSafeUrl(cleanUrl)) {
    return {
      success: false,
      url: cleanUrl,
      error: '拒絕存取：此 URL 屬於受保護的私有網路或雲端服務位址 (SSRF Protection)'
    };
  }

  const cacheKey = `read:${cleanUrl}`;

  if (!options.skipCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  return runSingleFlight(cacheKey, async () => {
    const timeoutMs = options.timeout || READ_PAGE_DEFAULT_TIMEOUT;

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
            const result = {
              success: true,
              endpoint: 'David888 Wiki Native Markdown Engine',
              url: cleanUrl,
              content: text.trim().slice(0, 8000)
            };
            setCached(cacheKey, result);
            return result;
          }
        }
      } catch (wikiErr) {
        console.warn(`[search_helper] David888 Wiki 原生讀取失敗: ${wikiErr.message}`);
      }
    }

    // 2. 一般網頁使用 2MD 多端點高可用解析
    let lastError = null;
    const candidateEndpoints = getPrioritizedEndpoints();

    for (const baseUrl of candidateEndpoints) {
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
            recordSuccess(baseUrl);
            const result = {
              success: true,
              endpoint: baseUrl,
              url: cleanUrl,
              content: text.trim().slice(0, 3000) // 限制長度以防 token 超限
            };
            setCached(cacheKey, result);
            return result;
          }
        }
        recordFailure(baseUrl, new Error(`HTTP ${res.status}`));
      } catch (err) {
        lastError = err;
        recordFailure(baseUrl, err);
      }
    }

    // 3. 備用：若 2MD 全數失敗，嘗試直接 GET 原始網址 (適用於 Markdown/純文字/API 內容)
    try {
      const directRes = await fetch(cleanUrl, {
        method: 'GET',
        headers: { 'Accept': 'text/markdown, text/plain, text/html, */*' },
        signal: AbortSignal.timeout(12000)
      });
      if (directRes.ok) {
        const text = await directRes.text();
        if (text && text.trim().length > 0) {
          const result = {
            success: true,
            endpoint: 'Direct HTTP Fallback',
            url: cleanUrl,
            content: text.trim().slice(0, 18000)
          };
          setCached(cacheKey, result);
          return result;
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
  });
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

/**
 * 取得所有端點的即時健康與熔斷狀態
 */
function getEndpointStatus() {
  const now = Date.now();
  return ENDPOINTS.map(url => {
    const stats = getEndpointStats(url);
    const inCooldown = stats.cooldownUntil > now;
    return {
      url,
      failures: stats.failures,
      inCooldown,
      cooldownRemainingMs: inCooldown ? Math.max(0, stats.cooldownUntil - now) : 0
    };
  });
}

function resetCircuitBreaker() {
  endpointStats.clear();
}

function clearCache() {
  memoryCache.clear();
}

module.exports = {
  ENDPOINTS,
  searchWeb,
  readWebPage,
  formatSearchFlexMessage,
  searchTools,
  getEndpointStatus,
  resetCircuitBreaker,
  clearCache,
  recordSuccess,
  recordFailure,
  SERP_DEFAULT_TIMEOUT,
  READ_PAGE_DEFAULT_TIMEOUT,
  CIRCUIT_FAIL_THRESHOLD,
  CIRCUIT_COOLDOWN_MS
};
