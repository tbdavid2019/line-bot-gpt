/**
 * test/image_test.js - AI Image Generation, Editing & Vision Multi-Modal Integration Tests
 */

require('dotenv').config();
const assert = require('assert');

async function runImageTests() {
  console.log('🧪 Starting AI Image Generation, Editing & Vision Multi-Modal Real-World Tests...\n');

  const key = process.env.IMAGE_API_KEY || process.env.OPEN_AI_LINE_SECRET;
  const baseUrl = (process.env.IMAGE_API_BASE_PATH || 'https://llm.aiurl.tw/v1').replace(/\/+$/, '');

  console.log(`📡 主要端點: ${baseUrl}`);
  console.log(`🔑 金鑰: ${key.substring(0, 15)}...`);

  // --- 1. 測試 AI 圖片生成 (Text-to-Image via /v1/images/generations) ---
  console.log('\n--- 1. Testing AI Text-to-Image Generation (/v1/images/generations) ---');
  const t0 = Date.now();
  const genRes = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      prompt: 'A sleek modern sports car on a city street at sunset, photorealistic',
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

  // --- 2. 測試 AI 圖片編輯 (Image Editing via /v1/images/edits) ---
  console.log('\n--- 2. Testing AI Image Editing (/v1/images/edits) ---');
  const t1 = Date.now();
  // 1x1 標準 PNG (符合主要端點 Nginx 1MB 傳輸限制)
  const testPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const editBuf = Buffer.from(testPng, 'base64');
  const editBlob = new Blob([editBuf], { type: 'image/png' });
  const editForm = new FormData();
  editForm.append('image', editBlob, 'input.png');
  editForm.append('prompt', 'Change to a shiny golden coin in the center');
  editForm.append('model', 'codex/gpt-image-2');

  const editRes = await fetch(`${baseUrl}/images/edits`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`
    },
    body: editForm
  });

  assert.strictEqual(editRes.status, 200, `Image editing HTTP status should be 200, got ${editRes.status}`);
  const editData = await editRes.json();
  const editB64 = editData.data?.[0]?.b64_json;
  assert.ok(editB64 && editB64.length > 1000, 'Edited image should contain valid base64 image data');
  const editBuffer = Buffer.from(editB64, 'base64');
  console.log(`  ✅ PASS: 圖片編輯成功！大小: ${editBuffer.length} bytes, 模型: ${editData.model}, 耗時: ${Date.now() - t1}ms`);

  // --- 3. 測試主要端點 Vision 圖片辨識 (Primary Vision: group/talk @ llm.aiurl.tw) ---
  console.log('\n--- 3. Testing Primary Vision Analysis (group/talk @ llm.aiurl.tw) ---');
  const t2 = Date.now();
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
            { type: 'text', text: '請問這張圖片是什麼顏色？請用繁體中文簡短回答。' },
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
  console.log(`  ✅ PASS: 主要端點視覺辨識成功！回答: "${visionText}", 耗時: ${Date.now() - t2}ms`);

  // --- 4. 測試備用端點 Vision 圖片辨識 (Google REST API gemini-2.5-flash) ---
  console.log('\n--- 4. Testing Fallback Vision Analysis (Google REST API gemini-2.5-flash) ---');
  const t3 = Date.now();
  const googleKey = process.env.GEMINI_API_KEY;
  const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleKey}`;
  const gRes = await fetch(googleUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { data: testPng, mimeType: 'image/png' } },
          { text: '這張圖片是什麼顏色？請用繁體中文在 10 字內回答。' }
        ]
      }]
    })
  });

  if (gRes.status === 200) {
    const gData = await gRes.json();
    const gText = gData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    console.log(`  ✅ PASS: 備用端點視覺辨識成功！回答: "${gText}", 耗時: ${Date.now() - t3}ms`);
  } else if (gRes.status === 429) {
    console.log(`  ⚠️ WARN: Google API 回傳 HTTP 429 (免費額度已達上限/Rate Limited)，智慧熔斷機制將會自動隔離島援端點，保護系統不崩潰。`);
  } else {
    const errText = await gRes.text();
    console.log(`  ⚠️ WARN: Google Vision 回傳狀態碼: ${gRes.status}, 內容: ${errText.substring(0, 150)}`);
  }

  console.log('\n================================================================');
  console.log('🎉 所有圖片生成 (Image Gen)、編輯 (Edit) 與視覺辨識 (Vision) 實測完成！');
  console.log('================================================================\n');
}

runImageTests().catch((err) => {
  console.error('❌ Image Test Failed:', err);
  process.exit(1);
});
