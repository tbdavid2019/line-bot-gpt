/**
 * test/llm_helper.test.js - LLM Orchestrator & Circuit Breaker Automated Tests
 */

require('dotenv').config();
const assert = require('assert');
const llmHelper = require('../llm_helper');

async function runTests() {
  console.log('🧪 Starting LLM Helper & Circuit Breaker Automated Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function it(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  async function itAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  console.log('--- 1. Fatal Error Detection (Fast-Fail Isolation) ---');
  it('should identify quota exhaustion as fatal error', () => {
    assert.strictEqual(llmHelper.isFatalError('用户额度不足, 剩余额度: ＄-0.003394'), true);
    assert.strictEqual(llmHelper.isFatalError('insufficient_user_quota'), true);
    assert.strictEqual(llmHelper.isFatalError('quota_exceeded for current tier'), true);
  });

  it('should identify invalid API key as fatal error', () => {
    assert.strictEqual(llmHelper.isFatalError('API key not valid. Please pass a valid API key.'), true);
    assert.strictEqual(llmHelper.isFatalError('Invalid API_KEY_INVALID'), true);
  });

  it('should treat transient network errors as non-fatal', () => {
    assert.strictEqual(llmHelper.isFatalError('ETIMEDOUT connection timed out'), false);
    assert.strictEqual(llmHelper.isFatalError('503 Service Temporarily Unavailable'), false);
    assert.strictEqual(llmHelper.isFatalError('500 Internal Server Error'), false);
  });

  console.log('\n--- 2. Jitter & Anti-Thundering Herd Mechanism ---');
  await itAsync('should generate jitter sleep within reasonable bounds', async () => {
    const start = Date.now();
    await llmHelper.jitterSleep(50, 100);
    const duration = Date.now() - start;
    assert.ok(duration >= 40 && duration <= 250, `Duration ${duration}ms out of expected jitter bounds`);
  });

  console.log('\n--- 3. Circuit Breaker State & Bypass Logic ---');
  it('should report circuit status for configured tiers', () => {
    const status = llmHelper.getCircuitStatus();
    assert.ok(status.tier1_primary, 'Tier 1 should exist');
    assert.ok(status.tier2_gemini, 'Tier 2 should exist');
    assert.ok(status.tier3_groq, 'Tier 3 should exist');
    assert.ok(status.tier1_primary.configured, 'Tier 1 Primary should be configured');
    assert.ok(status.tier2_gemini.configured, 'Tier 2 Gemini should be configured');
  });

  it('should reset circuit state cleanly', () => {
    llmHelper.resetCircuit();
    const status = llmHelper.getCircuitStatus();
    assert.strictEqual(status.tier1_primary.failures, 0);
    assert.strictEqual(status.tier1_primary.status, 'CLOSED');
  });

  console.log('\n--- 4. Real-World Live Execution & Failover Verification ---');
  await itAsync('should successfully complete chat completion via primary tier (llm.aiurl.tw / group/talk)', async () => {
    const start = Date.now();
    const res = await llmHelper.createChatCompletion({
      messages: [{ role: 'user', content: 'Say "HELLO"' }],
      max_tokens: 15
    });
    const elapsed = Date.now() - start;

    assert.ok(res, 'Response should not be null');
    assert.ok(res.choices && res.choices.length > 0, 'Should have choices');
    console.log(`     (Primary tier served model [${res.model}] in ${elapsed}ms)`);
  });

  console.log('\n========================================');
  console.log(`📊 LLM Helper Test Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
