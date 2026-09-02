/**
 * 888box Asset Management Helper
 * 
 * 支援多端點高可用容錯（Primary: box.david888.com, Fallback: box.glsoft.ai, box.aiurl.tw）
 * 提供圖片、影片、音訊、檔案的上傳、遠端 URL 轉存、統計查詢與 LINE Flex Message 格式化
 */

const fs = require('fs');
const path = require('path');
const securityHelper = require('./security_helper');

// 預設端點清單（依優先順序排序）
const DEFAULT_ENDPOINTS = [
  'https://box.david888.com',
  'https://box.glsoft.ai',
  'https://box.aiurl.tw'
];

/**
 * 取得設定的端點清單
 */
function getEndpoints() {
  const customPrimary = process.env.BOX_BASE_URL;
  const customFallbacks = process.env.BOX_FALLBACK_URLS 
    ? process.env.BOX_FALLBACK_URLS.split(',').map(u => u.trim()).filter(Boolean)
    : [];

  const list = [];
  if (customPrimary) list.push(customPrimary.replace(/\/+$/, ''));
  customFallbacks.forEach(u => {
    const cleaned = u.replace(/\/+$/, '');
    if (!list.includes(cleaned)) list.push(cleaned);
  });
  DEFAULT_ENDPOINTS.forEach(u => {
    const cleaned = u.replace(/\/+$/, '');
    if (!list.includes(cleaned)) list.push(cleaned);
  });

  return list;
}

/**
 * 容錯執行器：依序嘗試各端點直到成功
 */
async function executeWithFallback(taskFn, operationName = '888box operation') {
  const endpoints = getEndpoints();
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const result = await taskFn(endpoint);
      if (result) {
        return { ...result, endpoint };
      }
    } catch (err) {
      console.warn(`⚠️ [888box] ${operationName} 於端點 ${endpoint} 失敗: ${err.message}，嘗試下一個備用端點...`);
      lastError = err;
    }
  }

  console.error(`❌ [888box] ${operationName} 在所有端點皆失敗:`, lastError?.message);
  throw lastError || new Error(`${operationName} failed on all endpoints`);
}

/**
 * 上傳 Buffer (二進位資料) 到 888box (圖片/影片/音訊/檔案)
 * @param {Buffer} buffer - 二進位檔案內容
 * @param {string} filename - 檔案名稱 (例如 output.png, video.mp4)
 * @param {string} mimeType - MIME 類型 (例如 image/png, video/mp4)
 * @param {Object} options - { title, description, password, token }
 */
async function uploadBuffer(buffer, filename = 'file.bin', mimeType = 'application/octet-stream', options = {}) {
  const { title = '', description = '', password = '', token = process.env.BOX_API_TOKEN || '' } = options;

  return executeWithFallback(async (endpoint) => {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    formData.append('file', blob, filename);
    if (title) formData.append('title', title);
    if (description) formData.append('description', description);
    if (password) formData.append('password', password);
    if (token) formData.append('token', token);

    const uploadUrl = `${endpoint}/api.php?action=upload`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30000) // 30 秒超時
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.result === 'success' || data.success) {
      const itemData = data.data || {};
      const directUrl = data.url || itemData.url || '';
      const shareUrl = data.share_url || itemData.share_url || '';
      const id = itemData.id || data.id || '';

      // 判斷資產類型
      let assetType = 'file';
      if (mimeType.startsWith('image/') || filename.match(/\.(png|jpg|jpeg|webp|gif|svg)$/i)) assetType = 'image';
      else if (mimeType.startsWith('video/') || filename.match(/\.(mp4|mkv|mov|avi|webm)$/i)) assetType = 'video';
      else if (mimeType.startsWith('audio/') || filename.match(/\.(mp3|wav|m4a|aac|ogg)$/i)) assetType = 'audio';

      return {
        success: true,
        id,
        url: directUrl,
        shareUrl: shareUrl,
        type: assetType,
        title: title || filename,
        filename: filename,
        data: itemData
      };
    } else {
      throw new Error(data.message || '888box upload returned non-success');
    }
  }, `uploadBuffer (${filename})`);
}

/**
 * 透過遠端 URL 轉存資產到 888box (MCP / 下載轉傳)
 * @param {string} remoteUrl - 遠端檔案/影片/圖片 URL
 * @param {Object} options - { title, description, password, token }
 */
async function uploadFromUrl(remoteUrl, options = {}) {
  const { title = '', description = '', password = '', token = process.env.BOX_API_TOKEN || '' } = options;

  if (!remoteUrl || typeof remoteUrl !== 'string') {
    throw new Error('remoteUrl is required');
  }

  // SSRF 安全防禦檢驗 (封鎖私有 IP、雲端 Metadata、Loopback)
  if (!securityHelper.isSafeUrl(remoteUrl)) {
    throw new Error('拒絕存取：此 URL 屬於受保護的私有網路或雲端服務位址 (SSRF Protection)');
  }

  return executeWithFallback(async (endpoint) => {
    // 優先嘗試 MCP upload_asset_by_url
    try {
      const mcpRes = await fetch(`${endpoint}/mcp.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'upload_asset_by_url',
            arguments: {
              url: remoteUrl,
              title: title || undefined,
              description: description || undefined,
              password: password || undefined,
              token: token || undefined
            }
          }
        }),
        signal: AbortSignal.timeout(45000)
      });

      if (mcpRes.ok) {
        const json = await mcpRes.json();
        const text = json.result?.content?.[0]?.text || '';
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.success || parsed.url) {
              return {
                success: true,
                id: parsed.id || '',
                url: parsed.url,
                shareUrl: parsed.share_url || '',
                type: parsed.type || 'file',
                title: parsed.title || title || 'Remote Asset'
              };
            }
          } catch (e) {
            // JSON parse fallback
          }
        }
      }
    } catch (mcpErr) {
      console.warn(`[888box] MCP upload_asset_by_url failed on ${endpoint}, trying buffer stream download:`, mcpErr.message);
    }

    // 備用方案：由 Node.js 端下載 remoteUrl 二進位流後上傳至 endpoint
    const downloadRes = await fetch(remoteUrl, {
      signal: AbortSignal.timeout(30000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (!downloadRes.ok) {
      throw new Error(`Failed to download remote asset: HTTP ${downloadRes.status}`);
    }

    const contentType = downloadRes.headers.get('content-type') || 'application/octet-stream';
    let ext = 'bin';
    if (contentType.includes('image/png')) ext = 'png';
    else if (contentType.includes('image/jpeg')) ext = 'jpg';
    else if (contentType.includes('image/webp')) ext = 'webp';
    else if (contentType.includes('video/mp4')) ext = 'mp4';
    else if (contentType.includes('audio/mpeg') || contentType.includes('audio/mp3')) ext = 'mp3';
    else {
      const urlExtMatch = remoteUrl.split('?')[0].match(/\.([a-z0-9]{2,5})$/i);
      if (urlExtMatch) ext = urlExtMatch[1];
    }

    const generatedFilename = `ingest_${Date.now()}.${ext}`;
    const arrayBuf = await downloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // 上傳至目前 endpoint
    const formData = new FormData();
    const blob = new Blob([buffer], { type: contentType });
    formData.append('file', blob, generatedFilename);
    if (title) formData.append('title', title);
    if (description) formData.append('description', description);
    if (password) formData.append('password', password);
    if (token) formData.append('token', token);

    const uploadRes = await fetch(`${endpoint}/api.php?action=upload`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30000)
    });

    const uploadData = await uploadRes.json();
    if (uploadData.result === 'success' || uploadData.success) {
      const itemData = uploadData.data || {};
      return {
        success: true,
        id: itemData.id || uploadData.id || '',
        url: uploadData.url || itemData.url || '',
        shareUrl: uploadData.share_url || itemData.share_url || '',
        type: contentType.startsWith('image/') ? 'image' : (contentType.startsWith('video/') ? 'video' : (contentType.startsWith('audio/') ? 'audio' : 'file')),
        title: title || generatedFilename
      };
    }

    throw new Error('Fallback URL download-upload failed');
  }, `uploadFromUrl (${remoteUrl})`);
}

/**
 * 取得 888box 統計資料
 */
async function getStats() {
  return executeWithFallback(async (endpoint) => {
    const res = await fetch(`${endpoint}/api.php?action=stats`, {
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.result === 'success' && json.data) {
      return {
        success: true,
        total: json.data.total || 0,
        image: json.data.image || 0,
        video: json.data.video || 0,
        audio: json.data.audio || 0,
        file: json.data.file || 0
      };
    }
    throw new Error('Failed to retrieve stats');
  }, 'getStats');
}

/**
 * 取得 Podcast RSS 資訊
 */
async function getPodcastInfo() {
  return executeWithFallback(async (endpoint) => {
    const res = await fetch(`${endpoint}/mcp.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'get_podcast_info', arguments: {} }
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const text = json.result?.content?.[0]?.text || '';
    
    return {
      success: true,
      videoRss: `${endpoint}/storage/podcast.xml`,
      audioRss: `${endpoint}/storage/podcast_audio.xml`,
      raw: text
    };
  }, 'getPodcastInfo');
}

/**
 * 產生 888box 資產儲存成功的 LINE Flex Message
 * @param {Object} asset - { type, title, url, shareUrl, endpoint }
 */
function formatAssetFlexMessage(asset) {
  const typeIcons = {
    image: '🎨 圖片',
    video: '🎬 影片',
    audio: '🎵 音訊',
    file: '📄 檔案'
  };

  const typeHeaderColors = {
    image: '#1DB446',
    video: '#E50914',
    audio: '#9B51E0',
    file: '#2F80ED'
  };

  const typeName = typeIcons[asset.type] || '📦 資產';
  const headerColor = typeHeaderColors[asset.type] || '#1DB446';

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: headerColor,
      paddingAll: 'lg',
      contents: [
        {
          type: 'text',
          text: `✅ ${typeName}已存入 888box`,
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF'
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
          text: asset.title || '已成功儲存至 888box 雲端空間',
          weight: 'bold',
          size: 'md',
          wrap: true,
          color: '#333333'
        },
        {
          type: 'separator'
        },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '類別', size: 'xs', color: '#999999', flex: 2 },
                { type: 'text', text: typeName, size: 'xs', color: '#333333', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '伺服器', size: 'xs', color: '#999999', flex: 2 },
                { type: 'text', text: asset.endpoint ? asset.endpoint.replace('https://', '') : 'box.david888.com', size: 'xs', color: '#333333', flex: 5 }
              ]
            }
          ]
        }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: []
    }
  };

  // 若為圖片且有 direct URL，加上 hero 預覽
  if (asset.type === 'image' && asset.url) {
    bubble.hero = {
      type: 'image',
      url: securityHelper.sanitizeUri(asset.url, 'https://box.david888.com'),
      size: 'full',
      aspectRatio: '1:1',
      aspectMode: 'cover',
      action: {
        type: 'uri',
        uri: securityHelper.sanitizeUri(asset.shareUrl || asset.url, 'https://box.david888.com')
      }
    };
  }

  // 按鈕區
  if (asset.shareUrl) {
    bubble.footer.contents.push({
      type: 'button',
      style: 'primary',
      color: headerColor,
      height: 'sm',
      action: {
        type: 'uri',
        label: '🌐 在 888box 檢視',
        uri: securityHelper.sanitizeUri(asset.shareUrl, 'https://box.david888.com')
      }
    });
  }

  if (asset.url) {
    bubble.footer.contents.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: {
        type: 'uri',
        label: '📥 直接下載 / CDN 連結',
        uri: securityHelper.sanitizeUri(asset.url, 'https://box.david888.com')
      }
    });
  }

  return {
    type: 'flex',
    altText: `✅ ${typeName}已存入 888box`,
    contents: bubble
  };
}

/**
 * 產生 888box 統計資訊的 LINE Flex Message
 * @param {Object} stats - { total, image, video, audio, file, endpoint }
 */
function formatStatsFlexMessage(stats) {
  return {
    type: 'flex',
    altText: '📊 888box 雲端資產統計',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#2F80ED',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: '📊 888box 雲端資產統計',
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF'
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
            text: `伺服器：${stats.endpoint ? stats.endpoint.replace('https://', '') : 'box.david888.com'}`,
            size: 'xs',
            color: '#888888'
          },
          {
            type: 'separator'
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '📦 總資產數', size: 'sm', color: '#333333', weight: 'bold', flex: 4 },
              { type: 'text', text: `${stats.total.toLocaleString()} 個`, size: 'sm', color: '#2F80ED', weight: 'bold', align: 'end', flex: 3 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '🎨 圖片檔案', size: 'sm', color: '#666666', flex: 4 },
              { type: 'text', text: `${stats.image.toLocaleString()}`, size: 'sm', color: '#333333', align: 'end', flex: 3 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '🎬 影片檔案', size: 'sm', color: '#666666', flex: 4 },
              { type: 'text', text: `${stats.video.toLocaleString()}`, size: 'sm', color: '#333333', align: 'end', flex: 3 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '🎵 音訊檔案', size: 'sm', color: '#666666', flex: 4 },
              { type: 'text', text: `${stats.audio.toLocaleString()}`, size: 'sm', color: '#333333', align: 'end', flex: 3 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '📄 一般檔案', size: 'sm', color: '#666666', flex: 4 },
              { type: 'text', text: `${stats.file.toLocaleString()}`, size: 'sm', color: '#333333', align: 'end', flex: 3 }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#2F80ED',
            height: 'sm',
            action: {
              type: 'uri',
              label: '🌐 開啟 888box 首頁',
              uri: securityHelper.sanitizeUri(stats.endpoint || 'https://box.david888.com')
            }
          }
        ]
      }
    }
  };
}

module.exports = {
  getEndpoints,
  executeWithFallback,
  uploadBuffer,
  uploadFromUrl,
  getStats,
  getPodcastInfo,
  formatAssetFlexMessage,
  formatStatsFlexMessage
};
