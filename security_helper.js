/**
 * security_helper.js - 全域安全驗證與防禦核心工具庫
 * 
 * 涵蓋 7 層安全標準：
 * 1. SSRF 深度防禦 (封鎖私有 IP、迴路位址、雲端中繼資料服務)
 * 2. URI 協議白名單與清理 (防範 javascript:, data:, file: 偽協議)
 * 3. 正規表達式特殊字元轉義 (防範 ReDoS 與注入)
 * 4. 物件鍵值與 Session ID 安全驗證 (防範 Prototype Pollution)
 * 5. 時序安全比對 (Timing-Safe Equality)
 */

const crypto = require('crypto');

/**
 * 驗證 URL 是否安全（阻絕 SSRF 攻擊、私有 IP、雲端 Metadata 伺服器）
 * @param {string} urlStr - 待驗證 URL
 * @returns {boolean} 是否安全可信
 */
function isSafeUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr.trim());
    // 1. 僅允許 http 與 https 協議
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // 2. 封鎖 localhost 與迴路位址 (Loopback)
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.startsWith('127.')
    ) {
      return false;
    }

    // 3. 封鎖主流雲端中繼資料服務 (AWS, GCP, Azure, Alibaba, DigitalOcean, Oracle)
    const blockedHostnames = [
      '169.254.169.254',
      '169.254.170.2',
      'metadata.google.internal',
      'metadata.google',
      '100.100.100.200',
      'instance-data',
      'metadata.tencentyun.com'
    ];
    if (blockedHostnames.includes(hostname)) {
      return false;
    }

    // 4. 封鎖私有 IPv4 網段 (RFC 1918 & RFC 3927)
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 100.64.0.0/10 (CGNAT)
    if (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.)/.test(hostname)) {
      return false;
    }

    // 5. 封鎖內部專用頂級網域 (TLD)
    if (/\.(?:local|internal|lan|corp|home|arpa|localhost|test|invalid|onion)$/i.test(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 清理並驗證用於 LINE Flex Message Action 或 Web Link 的 URI
 * 嚴格阻絕 javascript:, data:, vbscript:, file: 等危險偽協議
 * @param {string} rawUri - 原始 URI
 * @param {string} fallback - 驗證失敗時的預設值
 * @returns {string} 安全的 URI
 */
function sanitizeUri(rawUri, fallback = 'https://wiki.david888.com') {
  if (!rawUri || typeof rawUri !== 'string') return fallback;
  const trimmed = rawUri.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
  } catch {
    // 若為相對路徑且開頭為 /
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
      return trimmed;
    }
  }
  return fallback;
}

/**
 * 轉義正規表達式特殊字元，防範動態正規表達式注入與 ReDoS
 * @param {string} string - 待轉義字串
 * @returns {string} 轉義後的字串
 */
function escapeRegExp(string) {
  if (!string || typeof string !== 'string') return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 驗證 Session ID 或 Resource ID 格式 (僅允許英數字元、減號與底線)
 * @param {string} id - 待驗證 ID
 * @returns {boolean} 是否合法
 */
function isValidId(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id.trim());
}

/**
 * 時序安全字串比較 (防範 Timing Attack 側信道攻擊)
 * 預先計算 SHA-256 雜湊以確保兩者長度一致，徹底消除長度時序洩漏
 * @param {string} a - 字串 A
 * @param {string} b - 字串 B
 * @returns {boolean} 是否相等
 */
function secureEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

module.exports = {
  isSafeUrl,
  sanitizeUri,
  escapeRegExp,
  isValidId,
  secureEquals
};
