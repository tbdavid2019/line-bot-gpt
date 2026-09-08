const assert = require('assert');
const magikaHelper = require('../magika_helper');

console.log('🧪 Starting Google Magika AI File Type Detection Automated Tests...\n');

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
  console.log('--- 1. Magika CLI Availability & Status ---');
  await runAsyncTest('should check magika availability without throwing', async () => {
    const isAvail = await magikaHelper.isMagikaAvailable();
    assert.strictEqual(typeof isAvail, 'boolean');
    console.log(`     (Magika CLI available on current machine: ${isAvail})`);
  });

  console.log('\n--- 2. Buffer Content Type Identification ---');
  await runAsyncTest('should accurately identify JSON buffer content', async () => {
    const jsonBuf = Buffer.from(JSON.stringify({ name: 'line-bot-gpt', version: '1.9.0', items: [1, 2, 3] }));
    const result = await magikaHelper.identifyBuffer(jsonBuf, 'data.bin');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mimeType, 'application/json');
    assert.strictEqual(result.label, 'json');
    assert.strictEqual(result.isText, true);
    assert.strictEqual(typeof result.score, 'number');
    assert.strictEqual(result.score > 0, true);
  });

  await runAsyncTest('should accurately identify PNG image buffer', async () => {
    // 1x1 Transparent PNG Header
    const pngBuf = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
    const result = await magikaHelper.identifyBuffer(pngBuf, 'unknown_file');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mimeType, 'image/png');
    assert.strictEqual(result.label, 'png');
    assert.strictEqual(result.group, 'image');
  });

  await runAsyncTest('should accurately identify PDF document header', async () => {
    const pdfBuf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Test) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
    const result = await magikaHelper.identifyBuffer(pdfBuf, 'document.bin');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mimeType, 'application/pdf');
    assert.strictEqual(result.label, 'pdf');
    assert.strictEqual(result.group, 'document');
  });

  console.log('\n--- 3. Edge Cases & Fallback Resiliency ---');
  it('should gracefully handle empty or invalid buffers with fallback', () => {
    const emptyRes = magikaHelper.fallbackIdentify(Buffer.alloc(0), 'file.txt');
    assert.strictEqual(emptyRes.success, true);
    assert.strictEqual(emptyRes.mimeType, 'text/plain');
    assert.strictEqual(emptyRes.engine, 'fallback');

    const nullRes = magikaHelper.fallbackIdentify(null, 'photo.jpg');
    assert.strictEqual(nullRes.success, true);
    assert.strictEqual(nullRes.mimeType, 'image/jpeg');
  });

  await runAsyncTest('should handle identifyBuffer with null/empty without crash', async () => {
    const res = await magikaHelper.identifyBuffer(null, 'archive.zip');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.mimeType, 'application/zip');
  });

  console.log('\n========================================');
  console.log(`📊 Magika Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('========================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
