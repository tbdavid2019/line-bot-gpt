const assert = require('assert');
const searchHelper = require('../search_helper');

console.log('🧪 Starting 2MD Search Helper & Circuit Breaker Unit Tests...\n');

let passedTests = 0;
let failedTests = 0;

function it(description, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

async function runAsyncTest(description, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('--- 1. Timeout Defaults & Configuration ---');
  it('should have updated resilient default timeouts', () => {
    assert.strictEqual(searchHelper.SERP_DEFAULT_TIMEOUT, 10000, 'SERP timeout should be 10000ms');
    assert.strictEqual(searchHelper.READ_PAGE_DEFAULT_TIMEOUT, 10000, 'Read page timeout should be 10000ms');
    assert.strictEqual(searchHelper.CIRCUIT_FAIL_THRESHOLD, 2);
  });

  console.log('\n--- 2. Circuit Breaker & Endpoint Prioritization ---');
  it('should track endpoint health and trigger cooldown after failure threshold', () => {
    searchHelper.resetCircuitBreaker();
    const primary = searchHelper.ENDPOINTS[0];

    let status = searchHelper.getEndpointStatus();
    const primaryStatus = status.find(s => s.url === primary);
    assert.strictEqual(primaryStatus.failures, 0);
    assert.strictEqual(primaryStatus.inCooldown, false);

    // Record 1 failure
    searchHelper.recordFailure(primary, new Error('Timeout 1'));
    status = searchHelper.getEndpointStatus();
    assert.strictEqual(status.find(s => s.url === primary).failures, 1);
    assert.strictEqual(status.find(s => s.url === primary).inCooldown, false);

    // Record 2nd failure -> should trigger cooldown
    searchHelper.recordFailure(primary, new Error('Timeout 2'));
    status = searchHelper.getEndpointStatus();
    assert.strictEqual(status.find(s => s.url === primary).failures, 2);
    assert.strictEqual(status.find(s => s.url === primary).inCooldown, true);
    assert.strictEqual(status.find(s => s.url === primary).cooldownRemainingMs > 0, true);

    // Reset on success
    searchHelper.recordSuccess(primary);
    status = searchHelper.getEndpointStatus();
    assert.strictEqual(status.find(s => s.url === primary).failures, 0);
    assert.strictEqual(status.find(s => s.url === primary).inCooldown, false);
  });

  console.log('\n--- 3. Single-Flight & In-Memory TTL Cache ---');
  await runAsyncTest('should maintain input validation and SSRF protection', async () => {
    searchHelper.clearCache();
    searchHelper.resetCircuitBreaker();

    // Test caching behavior with empty/invalid inputs first
    const resEmpty = await searchHelper.searchWeb('');
    assert.strictEqual(resEmpty.success, false);

    // Test SSRF protection is maintained
    const resSSRF = await searchHelper.readWebPage('http://169.254.169.254/latest/meta-data/');
    assert.strictEqual(resSSRF.success, false);
    assert.match(resSSRF.error, /SSRF Protection/);
  });

  console.log('\n========================================');
  console.log(`📊 2MD Helper Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('========================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
