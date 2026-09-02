const assert = require('assert');
const securityHelper = require('../security_helper');
const wikiHelper = require('../wiki_helper');
const boxHelper = require('../box_helper');
const searchHelper = require('../search_helper');
const sessionHelper = require('../session_helper');

console.log('🧪 Starting 7-Layer Security Audit Automated Test Suite...\n');

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

async function runAllTests() {
  console.log('--- Layer 1 & 2: SSRF & Cloud Metadata Blocking ---');
  it('should block AWS/GCP/Alibaba cloud metadata IPs and hostnames', () => {
    assert.strictEqual(securityHelper.isSafeUrl('http://169.254.169.254/latest/meta-data/'), false);
    assert.strictEqual(securityHelper.isSafeUrl('http://169.254.170.2/v2/metadata'), false);
    assert.strictEqual(securityHelper.isSafeUrl('http://metadata.google.internal/computeMetadata/v1/'), false);
    assert.strictEqual(securityHelper.isSafeUrl('http://100.100.100.200/latest/meta-data/'), false);
  });

  it('should block localhost and IPv4/IPv6 loopback addresses', () => {
    assert.strictEqual(securityHelper.isSafeUrl('http://localhost:8111/'), false);
    assert.strictEqual(securityHelper.isSafeUrl('http://127.0.0.1:8080/'), false);
    assert.strictEqual(securityHelper.isSafeUrl('http://127.0.0.2/admin'), false);
    assert.strictEqual(securityHelper.isSafeUrl('http://0.0.0.0/'), false);
    assert.strictEqual(securityHelper.isSafeUrl('http://[::1]/'), false);
  });

  it('should block private RFC 1918 internal subnets', () => {
    assert.strictEqual(securityHelper.isSafeUrl('http://10.0.0.1/service'), false);
    assert.strictEqual(securityHelper.isSafeUrl('http://192.168.1.1/router'), false);
    assert.strictEqual(securityHelper.isSafeUrl('http://172.16.0.5/api'), false);
    assert.strictEqual(securityHelper.isSafeUrl('http://172.31.255.255/db'), false);
  });

  it('should block internal domain names and dangerous protocols', () => {
    assert.strictEqual(securityHelper.isSafeUrl('http://intranet.local/'), false);
    assert.strictEqual(securityHelper.isSafeUrl('http://backend.internal/'), false);
    assert.strictEqual(securityHelper.isSafeUrl('file:///etc/passwd'), false);
    assert.strictEqual(securityHelper.isSafeUrl('javascript:alert(1)'), false);
    assert.strictEqual(securityHelper.isSafeUrl('data:text/html,test'), false);
  });

  it('should allow legitimate public HTTPS URLs', () => {
    assert.strictEqual(securityHelper.isSafeUrl('https://wiki.david888.com/share/xwx4w7'), true);
    assert.strictEqual(securityHelper.isSafeUrl('https://box.david888.com/mcp.php'), true);
    assert.strictEqual(securityHelper.isSafeUrl('https://2md.aiurl.tw/s/test'), true);
    assert.strictEqual(securityHelper.isSafeUrl('https://api.openai.com/v1/chat/completions'), true);
  });

  console.log('\n--- Layer 4: Client-side URI Sanitization ---');
  it('should sanitize dangerous URI schemes to safe fallback', () => {
    assert.strictEqual(securityHelper.sanitizeUri('javascript:alert(1)'), 'https://wiki.david888.com');
    assert.strictEqual(securityHelper.sanitizeUri('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), 'https://wiki.david888.com');
    assert.strictEqual(securityHelper.sanitizeUri('file:///var/log/system.log'), 'https://wiki.david888.com');
  });

  it('should preserve legitimate HTTP/HTTPS and relative URIs', () => {
    assert.strictEqual(securityHelper.sanitizeUri('https://wiki.david888.com/share/abc123'), 'https://wiki.david888.com/share/abc123');
    assert.strictEqual(securityHelper.sanitizeUri('/share/abc123/book'), '/share/abc123/book');
  });

  console.log('\n--- Layer 3 & 7: ID Validation & Prototype Pollution Defense ---');
  it('should validate ID format and block malicious traversals', () => {
    assert.strictEqual(securityHelper.isValidId('sess_123_abc'), true);
    assert.strictEqual(securityHelper.isValidId('note-2026-report'), true);
    assert.strictEqual(securityHelper.isValidId('../../etc/passwd'), false);
    assert.strictEqual(securityHelper.isValidId('<script>alert(1)</script>'), false);
    assert.strictEqual(securityHelper.isValidId('sess; DROP TABLE sessions;--'), false);
  });

  it('should prevent prototype pollution in switchSession', () => {
    const res1 = sessionHelper.switchSession('test_user', '__proto__');
    assert.strictEqual(res1.success, false);
    const res2 = sessionHelper.switchSession('test_user', 'constructor');
    assert.strictEqual(res2.success, false);
  });

  console.log('\n--- Layer 7: RegExp Metacharacter Escaping & Timing Safety ---');
  it('should escape regular expression metacharacters', () => {
    const unescaped = '!image (v2) [test] *+?^$';
    const escaped = securityHelper.escapeRegExp(unescaped);
    assert.strictEqual(escaped, '!image \\(v2\\) \\[test\\] \\*\\+\\?\\^\\$');
    const reg = new RegExp('^' + escaped);
    assert.strictEqual(reg.test('!image (v2) [test] *+?^$ prompt'), true);
  });

  it('should perform timing-safe string comparison', () => {
    assert.strictEqual(securityHelper.secureEquals('super_secret_token_123', 'super_secret_token_123'), true);
    assert.strictEqual(securityHelper.secureEquals('super_secret_token_123', 'wrong_token'), false);
    assert.strictEqual(securityHelper.secureEquals('short', 'very_long_string_differing_in_length'), false);
  });

  console.log('\n--- Layer 2 Integration: searchHelper & boxHelper SSRF Interception ---');
  await runAsyncTest('searchHelper.readWebPage should block SSRF attempts', async () => {
    const res = await searchHelper.readWebPage('http://169.254.169.254/latest/meta-data/');
    assert.strictEqual(res.success, false);
    assert.match(res.error, /SSRF Protection/);
  });

  await runAsyncTest('boxHelper.uploadFromUrl should block SSRF attempts', async () => {
    let threw = false;
    try {
      await boxHelper.uploadFromUrl('http://127.0.0.1:8111/admin');
    } catch (err) {
      threw = true;
      assert.match(err.message, /SSRF Protection/);
    }
    assert.strictEqual(threw, true);
  });

  console.log('\n========================================');
  console.log(`📊 Security Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('========================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests();
