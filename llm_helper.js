/**
 * llm_helper.js - High-Availability Multi-Tier LLM Orchestrator
 * 
 * 具備智慧熔斷器 (Circuit Breaker)、防驚群抖動退避 (Jittered Backoff)、
 * 快速致命錯誤隔離 (Fatal Fast-Circuit) 與多端點自動容錯降級 (Multi-Tier Failover)。
 */

const { OpenAI } = require('openai');

// 配置參數
const CIRCUIT_FAIL_THRESHOLD = parseInt(process.env.LLM_CIRCUIT_FAIL_THRESHOLD, 10) || 2;
const CIRCUIT_COOLDOWN_MS = parseInt(process.env.LLM_CIRCUIT_COOLDOWN_MS, 10) || 45000; // 一般錯誤冷卻 45 秒
const FATAL_COOLDOWN_MS = parseInt(process.env.LLM_FATAL_COOLDOWN_MS, 10) || (10 * 60 * 1000); // 致命錯誤 (如額度不足/無效Key) 冷卻 10 分鐘
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS, 10) || 15000; // 單次請求超時 15 秒

// 隨機延遲輔助函數 (Jittered Backoff 防驚群)
function jitterSleep(minMs = 100, maxMs = 300) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 致命錯誤檢測 (不可自動重試，需長時間隔離避免驚群衝擊)
function isFatalError(errMsg) {
  if (!errMsg) return false;
  const msg = String(errMsg).toLowerCase();
  return (
    msg.includes('insufficient_user_quota') ||
    msg.includes('用户额度不足') ||
    msg.includes('insufficient_quota') ||
    msg.includes('quota_exceeded') ||
    msg.includes('invalid_api_key') ||
    msg.includes('api_key_invalid') ||
    msg.includes('please pass a valid api key') ||
    msg.includes('account_deactivated') ||
    msg.includes('billing_not_active')
  );
}

// 端點熔斷狀態儲存
const tierStats = new Map();

function getTierStats(tierId) {
  if (!tierStats.has(tierId)) {
    tierStats.set(tierId, {
      failures: 0,
      lastFailureTime: 0,
      cooldownUntil: 0,
      isFatal: false,
      halfOpenInFlight: false,
      totalSuccess: 0,
      totalFailures: 0
    });
  }
  return tierStats.get(tierId);
}

function recordSuccess(tierId) {
  const stats = getTierStats(tierId);
  stats.failures = 0;
  stats.cooldownUntil = 0;
  stats.isFatal = false;
  stats.halfOpenInFlight = false;
  stats.totalSuccess++;
}

function recordFailure(tierId, err, tierName) {
  const stats = getTierStats(tierId);
  stats.failures++;
  stats.totalFailures++;
  stats.lastFailureTime = Date.now();
  stats.halfOpenInFlight = false;

  const errMsg = err?.message || String(err);

  if (isFatalError(errMsg)) {
    stats.isFatal = true;
    stats.cooldownUntil = Date.now() + FATAL_COOLDOWN_MS;
    console.error(`🚨 [llm_helper] 端點 [${tierName}] 發生致命配置或額度錯誤！已隔離熔斷 ${FATAL_COOLDOWN_MS / 60000} 分鐘。原因: ${errMsg}`);
    return;
  }

  if (stats.failures >= CIRCUIT_FAIL_THRESHOLD) {
    stats.cooldownUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    console.warn(`⚠️ [llm_helper] 端點 [${tierName}] 連續失敗 ${stats.failures} 次，已進入熔斷保護 (${CIRCUIT_COOLDOWN_MS / 1000}s)，原因: ${errMsg}`);
  }
}

/**
 * 檢查該 Tier 是否允許執行請求
 * - 若處於冷卻期：阻斷並直接跳過 (Bypass)
 * - 若冷卻期過後：放行單一探針 (Half-Open)，探針中其他請求繼續 bypass
 */
function shouldAllowRequest(tierId) {
  const stats = getTierStats(tierId);
  const now = Date.now();

  // 正常未熔斷
  if (stats.cooldownUntil <= now) {
    if (stats.failures > 0) {
      // 處於 Half-Open 階段：僅放行第一個探針
      if (stats.halfOpenInFlight) {
        return false;
      }
      stats.halfOpenInFlight = true;
      return true;
    }
    return true;
  }

  // 熔斷冷卻中
  return false;
}

// 建立多 Tier 客戶端
function initClients() {
  const primaryKey = process.env.OPEN_AI_LINE_SECRET || process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.FALLBACK_IMAGE_API_KEY;
  const fallbackKey = process.env.FALLBACK_LLM_KEY || process.env.ASR_API_GROQ_KEY;
  const customKey = process.env.FALLBACK_CUSTOM_KEY;

  const defaultHeaders = { 'Accept-Encoding': 'identity' };

  const primaryClient = primaryKey ? new OpenAI({
    apiKey: primaryKey,
    baseURL: process.env.OPEN_AI_BASE_PATH || 'https://llm.aiurl.tw/v1',
    timeout: LLM_TIMEOUT_MS,
    defaultHeaders
  }) : null;

  const geminiClient = geminiKey ? new OpenAI({
    apiKey: geminiKey,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    timeout: LLM_TIMEOUT_MS,
    defaultHeaders
  }) : null;

  const groqClient = fallbackKey ? new OpenAI({
    apiKey: fallbackKey,
    baseURL: process.env.FALLBACK_LLM_BASE_PATH || 'https://api.groq.com/openai/v1',
    timeout: LLM_TIMEOUT_MS,
    defaultHeaders
  }) : null;

  const customClient = customKey ? new OpenAI({
    apiKey: customKey,
    baseURL: process.env.FALLBACK_CUSTOM_BASE_PATH || 'https://api.openai.com/v1',
    timeout: LLM_TIMEOUT_MS,
    defaultHeaders
  }) : null;

  return { primaryClient, geminiClient, groqClient, customClient };
}

let clients = initClients();

// 重新載入客戶端 (方便動態更新 Key 或測試)
function reloadClients() {
  clients = initClients();
  return clients;
}

/**
 * 取得所有 Tier 設定定義
 */
function getTiers() {
  return [
    {
      id: 'tier1_primary',
      name: 'Tier 1 Primary (llm.aiurl.tw - group/talk)',
      client: clients.primaryClient,
      models: [
        process.env.OPEN_AI_MODEL || 'group/talk'
      ].filter(Boolean)
    },
    {
      id: 'tier2_gemini',
      name: 'Tier 2 Google Gemini (Official OpenAI Endpoint)',
      client: clients.geminiClient,
      models: [
        process.env.GEMINI_LLM_MODEL || 'gemini-2.5-flash',
        'gemini-2.5-flash-lite'
      ].filter(Boolean)
    },
    {
      id: 'tier3_groq',
      name: 'Tier 3 Groq (Ultra-Fast Inference)',
      client: clients.groqClient,
      models: [
        process.env.FALLBACK_LLM_MODEL || 'qwen/qwen3.8-27b',
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'openai/gpt-oss-20b'
      ].filter(Boolean)
    },
    {
      id: 'tier4_custom',
      name: 'Tier 4 Custom Fallback',
      client: clients.customClient,
      models: [
        process.env.FALLBACK_CUSTOM_MODEL || 'gpt-4o-mini'
      ].filter(Boolean)
    }
  ];
}

/**
 * 具備智慧超時控制的 Chat Completion 呼叫包裝
 */
async function callWithTimeout(client, requestParams, timeoutMs) {
  return await client.chat.completions.create(
    {
      ...requestParams
    },
    {
      timeout: timeoutMs
    }
  );
}

/**
 * 統一 LLM Chat Completion 呼叫核心函數
 * 整合 Circuit Breaker 熔斷分流、Jitter 抖動退避與多層降級
 */
async function createChatCompletion(params) {
  const tiers = getTiers();
  let lastError = null;
  let hasAvailableTier = false;

  for (const tier of tiers) {
    if (!tier.client) {
      continue;
    }
    hasAvailableTier = true;

    // 檢查熔斷狀態：若熔斷中則 0ms 略過 (Bypass)，防驚群
    if (!shouldAllowRequest(tier.id)) {
      const stats = getTierStats(tier.id);
      const remainingSec = Math.max(0, Math.ceil((stats.cooldownUntil - Date.now()) / 1000));
      console.log(`⚡ [llm_helper] 端點 [${tier.name}] 熔斷隔離中 (剩餘 ${remainingSec}s)，直接零延遲 Bypass 分流...`);
      continue;
    }

    // 依序嘗試該 Tier 支援的模型
    for (const model of tier.models) {
      try {
        console.log(`🤖 嘗試 LLM 端點 [${tier.name}] - 模型 [${model}]...`);
        
        const completion = await callWithTimeout(
          tier.client,
          {
            ...params,
            model: model
          },
          LLM_TIMEOUT_MS
        );

        // 成功！重設熔斷器指標
        recordSuccess(tier.id);
        return completion;
      } catch (err) {
        lastError = err;
        const errMsg = err?.message || String(err);
        console.warn(`⚠️ 端點 [${tier.name}] 模型 [${model}] 呼叫失敗: ${errMsg}`);

        // 記錄該端點的失敗與熔斷判斷
        recordFailure(tier.id, err, tier.name);

        // 若為致命錯誤（如額度用光），該端點後續模型也不可能成功，立即終止該 Tier
        if (isFatalError(errMsg)) {
          break;
        }

        // 防驚群：在嘗試下一個模型或下一個 Tier 之前加入微量隨機抖動延遲
        await jitterSleep(100, 300);
      }
    }

    // 當一個 Tier 所有模型都失敗後，切換到下一個 Tier 前再次 Jitter
    await jitterSleep(150, 350);
  }

  if (!hasAvailableTier) {
    throw new Error('未設定任何可用的 LLM API Key (OPEN_AI_LINE_SECRET / GEMINI_API_KEY / FALLBACK_LLM_KEY)');
  }

  throw lastError || new Error('所有 LLM 端點均無法回應，已觸發熔斷保護');
}

/**
 * 取得當前所有端點的熔斷健康狀態報告
 */
function getCircuitStatus() {
  const tiers = getTiers();
  const now = Date.now();
  const report = {};

  for (const tier of tiers) {
    const stats = getTierStats(tier.id);
    const isCooling = stats.cooldownUntil > now;
    report[tier.id] = {
      name: tier.name,
      configured: !!tier.client,
      status: isCooling ? (stats.isFatal ? 'FATAL_LOCKED' : 'OPEN') : (stats.failures > 0 ? 'HALF_OPEN' : 'CLOSED'),
      failures: stats.failures,
      cooldownRemainingSec: isCooling ? Math.ceil((stats.cooldownUntil - now) / 1000) : 0,
      totalSuccess: stats.totalSuccess,
      totalFailures: stats.totalFailures,
      models: tier.models
    };
  }

  return report;
}

/**
 * 手動重設指定或全部端點熔斷狀態
 */
function resetCircuit(tierId = null) {
  if (tierId && tierStats.has(tierId)) {
    recordSuccess(tierId);
  } else {
    tierStats.clear();
  }
}

module.exports = {
  createChatCompletion,
  getCircuitStatus,
  resetCircuit,
  reloadClients,
  isFatalError,
  jitterSleep,
  initClients
};
