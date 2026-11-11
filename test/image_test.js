/**
 * test/image_test.js - AI Image Generation & Vision Multi-Modal Integration Tests
 */

require('dotenv').config();
const assert = require('assert');

async function runImageTests() {
  console.log('🧪 Starting AI Image & Vision Multi-Modal Real-World Tests...\n');

  const key = process.env.IMAGE_API_KEY || process.env.OPEN_AI_LINE_SECRET;
  const baseUrl = (process.env.IMAGE_API_BASE_PATH || 'https://llm.aiurl.tw/v1').replace(/\/+$/, '');

  console.log(`📡 主要端點: ${baseUrl}`);
  console.log(`🔑 金鑰: ${key.substring(0, 15)}...`);

  // --- 1. 測試 AI 圖片生成 (Text-to-Image) ---
  console.log('\n--- 1. Testing AI Text-to-Image Generation (/v1/images/generations) ---');
  const t0 = Date.now();
  const genRes = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      prompt: 'A shiny red sports car on a highway, realistic',
      n: 1,
      size: '1024x1024'
    })
  });

  assert.strictEqual(genRes.status, 200, `Image generation HTTP status should be 200, got ${genRes.status}`);
  const genData = await genRes.json();
  const b64 = genData.data?.[0]?.b64_json;
  assert.ok(b64 && b64.length > 1000, 'Response should contain valid base64 image data');
  const imgBuffer = Buffer.from(b64, 'base64');
  console.log(`  ✅ PASS: 圖片生成成功！大小: ${imgBuffer.length} bytes, 模型: ${genData.model}, 耗時: ${Date.now() - t0}ms`);

  // --- 2. 測試主要端點 Vision 圖片辨識 (Primary Vision: group/talk) ---
  console.log('\n--- 2. Testing Primary Vision Analysis (group/talk @ llm.aiurl.tw) ---');
  const t1 = Date.now();
  // 使用標準圖標測試主要端點 Vision
  const testPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const visionRes = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: process.env.OPEN_AI_MODEL || 'group/talk',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '請問這張圖片是什麼顏色？請簡短回答。' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${testPng}` } }
          ]
        }
      ],
      max_tokens: 30
    })
  });

  assert.strictEqual(visionRes.status, 200, `Vision analysis HTTP status should be 200, got ${visionRes.status}`);
  const visionData = await visionRes.json();
  const visionText = visionData.choices?.[0]?.message?.content?.trim() || '';
  assert.ok(visionText.length > 0, 'Vision response text should not be empty');
  console.log(`  ✅ PASS: 主要端點視覺辨識成功！回答: "${visionText}", 耗時: ${Date.now() - t1}ms`);

  // --- 3. 測試備用端點 Vision 圖片辨識 (Google REST API gemini-2.5-flash) ---
  console.log('\n--- 3. Testing Fallback Vision Analysis (Google REST API gemini-2.5-flash) ---');
  const t2 = Date.now();
  const googleKey = process.env.GEMINI_API_KEY;
  const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleKey}`;
  const gRes = await fetch(googleUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { data: b64, mimeType: 'image/png' } },
          { text: '這張圖片裡是什麼車？請用繁體中文在 20 字內回答。' }
        ]
      }]
    })
  });

  assert.strictEqual(gRes.status, 200, `Google Vision HTTP status should be 200, got ${gRes.status}`);
  const gData = await gRes.json();
  const gText = gData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  assert.ok(gText.length > 0, 'Google Vision response should not be empty');
  console.log(`  ✅ PASS: 備用端點視覺辨識成功！回答: "${gText}", 耗時: ${Date.now() - t2}ms`);

  console.log('\n========================================');
  console.log('🎉 所有圖片生成 (Image Gen) 與視覺辨識 (Vision) 實測 100% 通過！');
  console.log('========================================\n');
}

runImageTests().catch((err) => {
  console.error('❌ Image Test Failed:', err);
  process.exit(1);
});
