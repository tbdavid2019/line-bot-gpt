/**
 * David888 Wiki Publisher Helper
 * 
 * 支援透過 REST API 發布、閱讀、追加 Markdown 內容至 wiki.david888.com
 * 提供網頁轉 Markdown、統計解析、簡報模式 (Slides) 與電子書模式 (Book) 連結
 */

const BASE_URL = process.env.WIKI_BASE_URL 
  ? process.env.WIKI_BASE_URL.replace(/\/+$/, '') 
  : 'https://wiki.david888.com';

const API_BASE_URL = `${BASE_URL}/api`;

/**
 * 輔助函數：將字串轉為安全的 path slug
 */
function sanitizePath(titleOrPath) {
  if (!titleOrPath) {
    return `note-${Date.now()}`;
  }
  // 移除特殊字元並轉換空格為連字號
  let slug = titleOrPath
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug) slug = `note-${Date.now()}`;
  return slug;
}

/**
 * 發布或更新 Wiki 筆記
 * @param {string} notePath - 筆記路徑 (如 tech-notes, report-2026)
 * @param {string} markdownText - Markdown 內容
 * @param {Object} options - { theme, isPublic, append, password, width }
 */
async function publishNote(notePath, markdownText, options = {}) {
  const {
    theme = 'claude-canvas',
    isPublic = true,
    append = false,
    password = '',
    width = '100%'
  } = options;

  const cleanPath = sanitizePath(notePath);
  const targetUrl = `${API_BASE_URL}/${cleanPath}${append ? '?append=true' : ''}`;

  const payload = {
    text: markdownText,
    public: isPublic,
    theme: theme,
    width: width
  };

  if (append) payload.append = true;
  if (password) payload.pw = password;

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });

  if (!res.ok) {
    throw new Error(`Wiki API error HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  if (json.err !== 0 && json.error) {
    throw new Error(json.msg || json.message || 'Failed to publish wiki note');
  }

  const data = json.data || {};
  // 關鍵規則：必須返回 public read-only shareUrl 給用戶
  const shareUrl = data.shareUrl || `${BASE_URL}/share/${cleanPath}`;
  const editUrl = data.url || `${BASE_URL}/${cleanPath}`;

  return {
    success: true,
    path: cleanPath,
    shareUrl: shareUrl,
    url: editUrl,
    presentUrl: `${shareUrl}/present`,
    bookUrl: `${shareUrl}/book`,
    theme: theme,
    message: data.msg || 'Saved successfully'
  };
}

/**
 * 讀取 Wiki 筆記 Markdown 原文
 * @param {string} notePath - 筆記路徑
 * @param {string} password - 存取密碼 (若有保護)
 */
async function readNote(notePath, password = '') {
  const cleanPath = sanitizePath(notePath);
  let targetUrl = `${API_BASE_URL}/${cleanPath}`;
  if (password) targetUrl += `?pw=${encodeURIComponent(password)}`;

  const res = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      'Accept': 'text/markdown, application/json'
    },
    signal: AbortSignal.timeout(20000)
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('此 Wiki 筆記已受密碼保護，請提供正確密碼。');
    }
    if (res.status === 404) {
      throw new Error(`找不到 Wiki 筆記「${notePath}」。`);
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const text = await res.text();
  return {
    success: true,
    path: cleanPath,
    markdown: text,
    shareUrl: `${BASE_URL}/${cleanPath}`
  };
}

/**
 * 讀取 Wiki 筆記或分享連結 Markdown 原文 (智慧解析任何 Wiki URL 或 Share Link)
 * @param {string} rawUrlOrSlug - 筆記路徑、分享連結或完整網址
 * @param {string} password - 存取密碼 (若有保護)
 */
async function readWikiUrl(rawUrlOrSlug, password = '') {
  if (!rawUrlOrSlug || typeof rawUrlOrSlug !== 'string') {
    return { success: false, error: 'URL or slug is required' };
  }

  let input = rawUrlOrSlug.trim();
  let targetUrl = input;

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `${BASE_URL}/${targetUrl.replace(/^\/+/, '')}`;
  }

  if (password) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + `pw=${encodeURIComponent(password)}`;
  }

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/markdown, text/plain, */*'
      },
      signal: AbortSignal.timeout(20000)
    });

    if (res.ok) {
      const text = await res.text();
      return {
        success: true,
        url: targetUrl,
        markdown: text.trim(),
        shareUrl: targetUrl
      };
    }

    // 若直接 GET 失敗，嘗試抽取 slug 後呼叫 /api/:slug
    const slug = input.replace(/^https?:\/\/[^/]+\//, '').replace(/^share\//, '').replace(/^\/+/, '').split('/')[0].split('?')[0];
    if (slug) {
      let apiUrl = `${API_BASE_URL}/${slug}`;
      if (password) apiUrl += `?pw=${encodeURIComponent(password)}`;
      const apiRes = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'text/markdown, application/json' },
        signal: AbortSignal.timeout(20000)
      });
      if (apiRes.ok) {
        const text = await apiRes.text();
        return {
          success: true,
          path: slug,
          url: `${BASE_URL}/${slug}`,
          markdown: text.trim(),
          shareUrl: `${BASE_URL}/${slug}`
        };
      }
    }

    return {
      success: false,
      url: targetUrl,
      error: `Wiki API returned HTTP ${res.status}: ${res.statusText}`
    };
  } catch (err) {
    return {
      success: false,
      url: targetUrl,
      error: err.message
    };
  }
}

/**
 * 將外部網頁 URL 轉換為 Markdown (使用 2md.aiurl.tw / wiki parse API)
 * @param {string} url - 外部文章網址
 */
async function parseUrlToMarkdown(url) {
  const targetUrl = `${API_BASE_URL}/markdown/parse`;
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url }),
    signal: AbortSignal.timeout(30000)
  });

  if (!res.ok) throw new Error(`Parse failed HTTP ${res.status}`);
  const json = await res.json();
  if (json.err === 0 && json.data) {
    return {
      success: true,
      title: json.data.title || 'Extracted Article',
      markdown: json.data.content || '',
      sourceUrl: json.data.sourceUrl || url
    };
  }
  throw new Error(json.msg || 'Failed to parse URL to markdown');
}

/**
 * 格式化 Wiki 發布成功的 LINE Flex Message
 * @param {Object} wikiResult - { path, shareUrl, presentUrl, bookUrl, theme }
 * @param {string} title - 文章標題
 * @param {string} summary - 簡短摘要
 */
function formatWikiFlexMessage(wikiResult, title = '', summary = '') {
  const displayTitle = title || wikiResult.path || 'David888 Wiki 筆記';

  const bodyContents = [
    {
      type: 'text',
      text: displayTitle,
      weight: 'bold',
      size: 'md',
      wrap: true,
      color: '#333333'
    },
    {
      type: 'separator',
      margin: 'md'
    }
  ];

  if (summary) {
    bodyContents.push({
      type: 'text',
      text: summary.length > 120 ? summary.slice(0, 117) + '...' : summary,
      size: 'xs',
      color: '#666666',
      wrap: true,
      margin: 'md'
    });
  }

  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    margin: 'md',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: '路徑', size: 'xs', color: '#999999', flex: 2 },
          { type: 'text', text: wikiResult.path, size: 'xs', color: '#333333', flex: 5, weight: 'bold' }
        ]
      },
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: '主題風格', size: 'xs', color: '#999999', flex: 2 },
          { type: 'text', text: wikiResult.theme || 'claude-canvas', size: 'xs', color: '#333333', flex: 5 }
        ]
      }
    ]
  });

  return {
    type: 'flex',
    altText: `📖 Wiki 文章已發布：${displayTitle}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1E293B',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: '📖 David888 Wiki 發布成功',
            weight: 'bold',
            size: 'lg',
            color: '#38BDF8'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: bodyContents
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#38BDF8',
            height: 'sm',
            action: {
              type: 'uri',
              label: '🌐 閱讀 Wiki 文章',
              uri: wikiResult.shareUrl
            }
          },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'secondary',
                height: 'sm',
                flex: 1,
                action: {
                  type: 'uri',
                  label: '📑 2D 簡報',
                  uri: wikiResult.presentUrl
                }
              },
              {
                type: 'button',
                style: 'secondary',
                height: 'sm',
                flex: 1,
                action: {
                  type: 'uri',
                  label: '📚 電子書',
                  uri: wikiResult.bookUrl
                }
              }
            ]
          }
        ]
      }
    }
  };
}

/**
 * 攔截並解析模型可能輸出的偽 Tool Call 文字 (如 [CALL:/wiki ...], [CALL:wiki ...], <tool_call> 等)
 * 防止未經執行的內部調用指令外洩給用戶，並自動提取參數完成 Wiki 發布
 * @param {string} text - 模型回應原始文字
 */
function extractPseudoWikiCall(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. 匹配 [CALL:/wiki ...] 或 [CALL:wiki ...] 或 [TOOL_CALL:publish_to_wiki ...]
  const pseudoMatch = text.match(/\[(?:CALL:\/?wiki|TOOL_CALL:publish_to_wiki|CALL:\/?publish)\s+([\s\S]+?)\](?:\s*$)?/i);
  if (pseudoMatch) {
    const rawJson = pseudoMatch[1].trim();
    try {
      const parsed = JSON.parse(rawJson);
      return {
        slug: parsed.slug || parsed.path_slug || `note-${Date.now()}`,
        title: parsed.title || 'David888 Wiki 筆記',
        content: parsed.content || parsed.markdown_content || parsed.text || '',
        summary: parsed.summary || parsed.description || '',
        theme: parsed.theme || 'claude-canvas'
      };
    } catch (e) {
      // 容錯解析：提取常見欄位
      const slugM = rawJson.match(/"(?:slug|path_slug)"\s*:\s*"([^"]+)"/i);
      const titleM = rawJson.match(/"title"\s*:\s*"([^"]+)"/i);
      let content = '';
      const contentIdx = rawJson.indexOf('"content":');
      if (contentIdx !== -1) {
        let afterContent = rawJson.slice(contentIdx + 10).trim();
        if (afterContent.startsWith('"')) afterContent = afterContent.slice(1);
        const lastQ = afterContent.lastIndexOf('"');
        if (lastQ !== -1) afterContent = afterContent.slice(0, lastQ);
        content = afterContent.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
      if (content) {
        return {
          slug: slugM ? slugM[1] : `note-${Date.now()}`,
          title: titleM ? titleM[1] : 'David888 Wiki 筆記',
          content: content,
          summary: '',
          theme: 'claude-canvas'
        };
      }
    }
  }

  // 2. 匹配 ```json { "name": "publish_to_wiki", ... } 或 { "action": "publish_to_wiki", ... }
  const jsonBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?"(?:publish_to_wiki|publishNote|wiki)"[\s\S]*?\})\s*```/i);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      const args = parsed.arguments || parsed.parameters || parsed;
      return {
        slug: args.slug || args.path_slug || `note-${Date.now()}`,
        title: args.title || 'David888 Wiki 筆記',
        content: args.content || args.markdown_content || args.text || '',
        summary: args.summary || '',
        theme: args.theme || 'claude-canvas'
      };
    } catch (e) {}
  }

  // 3. 匹配 <tool_call> 標籤
  const toolTagMatch = text.match(/<tool_call>\s*([\s\S]+?)\s*<\/tool_call>/i);
  if (toolTagMatch) {
    try {
      const parsed = JSON.parse(toolTagMatch[1]);
      const args = parsed.arguments || parsed.parameters || parsed;
      return {
        slug: args.slug || args.path_slug || `note-${Date.now()}`,
        title: args.title || 'David888 Wiki 筆記',
        content: args.content || args.markdown_content || args.text || '',
        summary: args.summary || '',
        theme: args.theme || 'claude-canvas'
      };
    } catch (e) {}
  }

  return null;
}

module.exports = {
  BASE_URL,
  API_BASE_URL,
  sanitizePath,
  publishNote,
  readNote,
  readWikiUrl,
  parseUrlToMarkdown,
  formatWikiFlexMessage,
  extractPseudoWikiCall
};
