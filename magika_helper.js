/**
 * magika_helper.js - Google Magika AI 深度學習檔案內容型態辨識模組
 * 支援以 Google Magika 原生二進位檔進行本機離線深度學習位元組分析 (~1MB 模型內建，~5ms 快速推理)
 * 具備 stdin 串流管線（零磁碟 I/O）與優雅降級回退機制 (Graceful Fallback)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const mime = require('mime');

let isMagikaAvailableCache = null;

/**
 * 檢查系統是否已安裝 Google Magika 執行檔
 * @returns {Promise<boolean>}
 */
async function isMagikaAvailable() {
  if (isMagikaAvailableCache !== null) {
    return isMagikaAvailableCache;
  }

  return new Promise((resolve) => {
    const child = spawn('magika', ['--version']);
    child.on('error', () => {
      isMagikaAvailableCache = false;
      resolve(false);
    });
    child.on('close', (code) => {
      isMagikaAvailableCache = (code === 0);
      resolve(isMagikaAvailableCache);
    });
  });
}

function getMimeTypeFromFilename(filename) {
  if (!filename) return null;
  try {
    if (typeof mime.getType === 'function') return mime.getType(filename);
    if (mime.default && typeof mime.default.getType === 'function') return mime.default.getType(filename);
  } catch (e) {}
  return null;
}

/**
 * 傳統特徵碼 (Magic Bytes) 與副檔名優雅回退檢驗
 * 當 Magika 未安裝或執行異常時使用
 * @param {Buffer} buffer 檔案二進位資料
 * @param {string} filename 備用檔案名稱
 */
function fallbackIdentify(buffer, filename = '') {
  let mimeType = 'application/octet-stream';
  let label = 'bin';
  let description = 'Binary data';
  let group = 'binary';

  // 嘗試副檔名猜測
  if (filename) {
    const guessed = getMimeTypeFromFilename(filename);
    if (guessed) {
      mimeType = guessed;
    }
  }

  // 檢查常見 Magic Bytes
  if (buffer && buffer.length >= 4) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      mimeType = 'image/png';
      label = 'png';
      description = 'PNG image';
      group = 'image';
    } else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      mimeType = 'image/jpeg';
      label = 'jpeg';
      description = 'JPEG image';
      group = 'image';
    } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      mimeType = 'image/gif';
      label = 'gif';
      description = 'GIF image';
      group = 'image';
    } else if (buffer.length >= 5 && buffer.toString('utf8', 0, 5) === '%PDF-') {
      mimeType = 'application/pdf';
      label = 'pdf';
      description = 'PDF document';
      group = 'document';
    } else if (buffer[0] === 0x50 && buffer[1] === 0x4B && (buffer[2] === 0x03 || buffer[2] === 0x05)) {
      mimeType = 'application/zip';
      label = 'zip';
      description = 'ZIP archive';
      group = 'archive';
    }
  }

  return {
    success: true,
    mimeType,
    label,
    description,
    group,
    extensions: filename ? [filename.split('.').pop().toLowerCase()] : [],
    score: 0.5,
    isText: mimeType.startsWith('text/'),
    engine: 'fallback'
  };
}

/**
 * 使用 Google Magika 本地 AI 模型辨識 Buffer 內容型態 (透過 stdin 串流，零磁碟 I/O)
 * @param {Buffer} buffer 檔案二進位資料
 * @param {string} filename 備用檔案名稱 (可選)
 * @param {Object} options 選項 (timeoutMs 等)
 * @returns {Promise<{ success: boolean, mimeType: string, label: string, description: string, group: string, extensions: string[], score: number, isText: boolean, engine: string }>}
 */
async function identifyBuffer(buffer, filename = '', options = {}) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return fallbackIdentify(buffer, filename);
  }

  const available = await isMagikaAvailable();
  if (!available) {
    return fallbackIdentify(buffer, filename);
  }

  const timeoutMs = options.timeoutMs || 5000;

  return new Promise((resolve) => {
    let child;
    let timer;

    try {
      child = spawn('magika', ['--json', '-']);
    } catch (err) {
      console.warn(`[magika_helper] 無法啟動 magika 程序: ${err.message}，使用 fallback`);
      return resolve(fallbackIdentify(buffer, filename));
    }

    let stdout = '';
    let stderr = '';

    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch (e) {}
      console.warn('[magika_helper] Magika 分析逾時 (5s)，使用 fallback');
      resolve(fallbackIdentify(buffer, filename));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      console.warn(`[magika_helper] Magika 程序錯誤: ${err.message}`);
      resolve(fallbackIdentify(buffer, filename));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.warn(`[magika_helper] Magika 退出碼非 0: ${code}, stderr: ${stderr.trim()}`);
        return resolve(fallbackIdentify(buffer, filename));
      }

      try {
        const json = JSON.parse(stdout);
        const resultItem = json[0]?.result;
        if (resultItem?.status === 'ok' && resultItem.value) {
          const val = resultItem.value;
          const output = val.output || val.dl || {};
          const score = typeof val.score === 'number' ? val.score : (output.score || 1.0);

          return resolve({
            success: true,
            mimeType: output.mime_type || 'application/octet-stream',
            label: output.label || 'unknown',
            description: output.description || 'Unknown binary',
            group: output.group || 'unknown',
            extensions: output.extensions || [],
            score: Math.round(score * 100) / 100,
            isText: !!output.is_text,
            engine: 'magika-ai'
          });
        }
      } catch (parseErr) {
        console.warn(`[magika_helper] 解析 Magika JSON 輸出失敗: ${parseErr.message}`);
      }

      resolve(fallbackIdentify(buffer, filename));
    });

    // 將二進位資料寫入 stdin
    try {
      child.stdin.end(buffer);
    } catch (writeErr) {
      clearTimeout(timer);
      resolve(fallbackIdentify(buffer, filename));
    }
  });
}

/**
 * 辨識實體路徑檔案
 * @param {string} filePath 檔案路徑
 * @returns {Promise<Object>}
 */
async function identifyFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const available = await isMagikaAvailable();
  if (!available) {
    const buffer = fs.readFileSync(filePath);
    return fallbackIdentify(buffer, filePath);
  }

  return new Promise((resolve) => {
    const child = spawn('magika', ['--json', filePath]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      const buffer = fs.readFileSync(filePath);
      resolve(fallbackIdentify(buffer, filePath));
    });

    child.on('close', (code) => {
      if (code === 0) {
        try {
          const json = JSON.parse(stdout);
          const val = json[0]?.result?.value;
          if (val) {
            const output = val.output || val.dl || {};
            const score = typeof val.score === 'number' ? val.score : (output.score || 1.0);
            return resolve({
              success: true,
              mimeType: output.mime_type || 'application/octet-stream',
              label: output.label || 'unknown',
              description: output.description || 'Unknown binary',
              group: output.group || 'unknown',
              extensions: output.extensions || [],
              score: Math.round(score * 100) / 100,
              isText: !!output.is_text,
              engine: 'magika-ai'
            });
          }
        } catch (e) {}
      }
      const buffer = fs.readFileSync(filePath);
      resolve(fallbackIdentify(buffer, filePath));
    });
  });
}

module.exports = {
  isMagikaAvailable,
  identifyBuffer,
  identifyFile,
  fallbackIdentify
};
