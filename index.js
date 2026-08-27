require('dotenv').config()

const express = require('express')
const line = require('@line/bot-sdk')
const OpenAI = require('openai')
const axios = require('axios')
const { GoogleGenAI } = require('@google/genai')
const { Storage } = require('@google-cloud/storage')
const mime = require('mime')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { searchNearbyPlaces, formatPlacesMessage } = require('./maps_helper')
const { v4: uuidv4 } = require('uuid')
const Groq = require('groq-sdk')
const boxHelper = require('./box_helper')
const wikiHelper = require('./wiki_helper')


// 輔助函數：從 MIME 類型取得檔案副檔名
function getFileExtensionFromMimeType(mimeType) {
  // 直接使用 MIME 類型對照表，不依賴 mime 套件
  const mimeToExt = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'image/tiff': 'tiff',
    'image/avif': 'avif'
  };

  return mimeToExt[mimeType] || 'jpg';
}

// 初始化 OpenAI 客戶端
const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_LINE_SECRET,
  baseURL: process.env.OPEN_AI_BASE_PATH || 'https://api.openai.com/v1', // 默認的 OpenAI API endpoint
});

// 初始化 Google GenAI 客戶端
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// 初始化 Google Cloud Storage 客戶端
let storage = null;
let bucket = null;

if (process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GOOGLE_CLOUD_BUCKET_NAME) {
  try {
    storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE, // 可選，如果使用 service account JSON 檔案
    });
    bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME);
    console.log('✅ Google Cloud Storage 已初始化');
  } catch (error) {
    console.error('❌ Google Cloud Storage 初始化失敗:', error.message);
  }
}

// 初始化 Groq 客戶端 (用於 ASR)
let groq = null;
if (process.env.ASR_API_GROQ_KEY) {
  try {
    groq = new Groq({
      apiKey: process.env.ASR_API_GROQ_KEY,
    });
    console.log('✅ Groq Whisper ASR 已初始化');
  } catch (error) {
    console.error('❌ Groq 初始化失敗:', error.message);
  }
}

// create LINE SDK config from env variables
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
}

// create LINE SDK client
const client = new line.Client(config)

// 用戶狀態管理（簡單的記憶體存儲）
const userStates = new Map()

// 顯示 Loading Indicator 的輔助函數
async function showLoadingAnimation(chatId, seconds = 20) {
  try {
    await axios.post(
      'https://api.line.me/v2/bot/chat/loading/start',
      {
        chatId: chatId,
        loadingSeconds: seconds
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
        }
      }
    )
    console.log(`✅ Loading indicator 已啟動 (${seconds}秒), chatId: ${chatId}`)
  } catch (error) {
    console.error('❌ Loading indicator 啟動失敗:', error.response?.data || error.message)
  }
}

// 從 LINE 下載多媒體內容 (圖片/音訊/影片/檔案)
async function downloadMediaFromLine(messageId, mediaType = 'media') {
  try {
    const stream = await client.getMessageContent(messageId);
    const chunks = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    console.log(`✅ 成功下載 ${mediaType}，大小: ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.error(`❌ 下載 ${mediaType} 失敗:`, error);
    return null;
  }
}

// 相容舊有別名
const downloadImageFromLine = (messageId) => downloadMediaFromLine(messageId, '圖片');
const downloadAudioFromLine = (messageId) => downloadMediaFromLine(messageId, '音訊');

// 使用 Groq Whisper 轉錄音訊
async function transcribeAudioWithGroq(audioBuffer) {
  try {
    if (!groq) {
      console.log('⚠️ Groq 客戶端未初始化');
      return null;
    }

    // 將 buffer 寫入臨時檔案（Groq SDK 需要檔案路徑）
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `audio_${Date.now()}.m4a`);
    fs.writeFileSync(tempFilePath, audioBuffer);

    console.log('🎤 使用 Groq Whisper 轉錄音訊...');
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-large-v3",
      temperature: 0,
      response_format: "verbose_json"
    });

    // 刪除臨時檔案
    fs.unlinkSync(tempFilePath);

    console.log(`✅ Groq 轉錄成功: ${transcription.text}`);
    return transcription.text;
  } catch (error) {
    console.error('❌ Groq 轉錄失敗:', error);
    return null;
  }
}

// 使用 Gemini 轉錄音訊
async function transcribeAudioWithGemini(audioBuffer) {
  try {
    if (!genAI) {
      console.log('⚠️ Gemini 客戶端未初始化');
      return null;
    }

    console.log('🎤 使用 Gemini ASR 轉錄音訊...');
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: {
        parts: [
          {
            inlineData: {
              data: audioBuffer.toString('base64'),
              mimeType: 'audio/m4a'
            }
          },
          {
            text: "請將這段音訊的內容轉錄成文字。只需要輸出轉錄的文字內容，不需要其他說明。"
          }
        ]
      }
    });

    const transcription = response.text || '';
    console.log(`✅ Gemini 轉錄成功: ${transcription}`);
    return transcription;
  } catch (error) {
    console.error('❌ Gemini 轉錄失敗:', error);
    return null;
  }
}

// 自動選擇可用的 ASR 服務並轉錄
async function transcribeAudio(audioBuffer) {
  // 優先使用 Groq (免費)
  if (process.env.ASR_API_GROQ_KEY && groq) {
    const result = await transcribeAudioWithGroq(audioBuffer);
    if (result) return result;
  }

  // 備選：使用 Gemini
  if (process.env.GEMINI_API_KEY || process.env.ASR_API_GEMINI_KEY) {
    const result = await transcribeAudioWithGemini(audioBuffer);
    if (result) return result;
  }

  console.error('❌ 沒有可用的 ASR 服務');
  return null;
}

// 判斷用戶意圖（分析圖片 vs 編輯圖片）
function detectImageIntent(text) {
  if (!text || text.trim() === '') {
    return 'select_mode'; // 沒有文字，顯示選擇按鈕
  }

  const lowerText = text.toLowerCase();

  // 編輯關鍵字（優先級較高，因為更具體）
  const editKeywords = [
    '編輯', '修改', '改成', '變成', '改圖', '調整',
    '把', '讓', '加上', '移除', '替換', '改變',
    'edit', 'modify', 'change', 'transform',
    '背景', '風格', '顏色', '特效', '濾鏡'
  ];

  // 分析關鍵字
  const analyzeKeywords = [
    '這是什麼', '是什麼', '分析', '看圖', '描述',
    '說明', '辨識', '識別', '解釋', '圖片內容',
    'what is', 'describe', 'analyze', 'explain',
    '有什麼', '裡面有', '看到什麼', '告訴我',
    '幫我看', '請問'
  ];

  // 檢查編輯關鍵字
  for (const keyword of editKeywords) {
    if (lowerText.includes(keyword)) {
      return 'edit_image';
    }
  }

  // 檢查分析關鍵字
  for (const keyword of analyzeKeywords) {
    if (lowerText.includes(keyword)) {
      return 'analyze_image';
    }
  }

  // 預設為分析（較安全）
  return 'analyze_image';
}


// 圖片分析功能（使用 Gemini Vision，純文字輸出）
async function analyzeImageWithGemini(imageBuffer, prompt, userId) {
  try {
    const model = process.env.GEMINI_VISION_MODEL || 'gemini-flash-latest';
    const userPrompt = prompt || '請詳細描述這張圖片的內容，包括主要物體、場景、顏色、氛圍等';

    console.log(`🔍 使用 ${model} 分析圖片...`);

    const response = await genAI.models.generateContent({
      model: model,
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              data: imageBuffer.toString('base64'),
              mimeType: 'image/jpeg'
            }
          },
          { text: userPrompt }
        ]
      }]
    });

    const analysisText = response.response.text();
    console.log('✅ 圖片分析完成');
    return analysisText;

  } catch (error) {
    console.error('❌ 圖片分析錯誤:', error);
    throw error;
  }
}

// 圖片編輯功能（使用 Gemini Image，圖片輸出）
async function editImageWithGemini(imageBuffer, editPrompt, userId) {
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-image-preview';
    const config = {
      responseModalities: ['IMAGE', 'TEXT'],
    };

    console.log(`✏️ 使用 ${model} 編輯圖片...`);
    console.log(`編輯指令: ${editPrompt}`);

    const contents = [{
      role: 'user',
      parts: [
        {
          inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType: 'image/jpeg'
          }
        },
        { text: `Edit this image: ${editPrompt}. Keep the main subject but ${editPrompt}` }
      ]
    }];

    const response = await genAI.models.generateContentStream({
      model,
      config,
      contents,
    });

    let imageGenerated = false;
    let textResponse = '';

    for await (const chunk of response) {
      // 檢查用戶是否已取消
      const currentState = userStates.get(userId);
      if (!currentState || currentState.state !== 'editing_image') {
        console.log('圖片編輯已被用戶取消');
        return { success: false, cancelled: true };
      }

      if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
        continue;
      }

      // 處理圖片數據
      if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        const inlineData = chunk.candidates[0].content.parts[0].inlineData;
        const buffer = Buffer.from(inlineData.data || '', 'base64');

        // 統一上傳圖片到 888box / GCS / 本地
        const uploadResult = await uploadImageAsset(buffer, inlineData.mimeType, `edited_${editPrompt}`);

        if (uploadResult.url) {
          console.log(`✅ 圖片編輯完成並上傳 (${uploadResult.storageType})`);
          return {
            success: true,
            imageUrl: uploadResult.url,
            shareUrl: uploadResult.shareUrl,
            buffer: buffer,
            mimeType: inlineData.mimeType
          };
        } else {
          return {
            success: true,
            localPath: uploadResult.localPath,
            buffer: buffer,
            mimeType: inlineData.mimeType
          };
        }
      }
      // 處理文字回應
      else if (chunk.text) {
        textResponse += chunk.text;
      }
    }

    // 如果沒有生成圖片
    if (!imageGenerated && textResponse) {
      return { success: false, error: 'No image generated', textResponse };
    }

    return { success: false, error: 'Image generation failed' };

  } catch (error) {
    console.error('❌ 圖片編輯錯誤:', error);
    return { success: false, error: error.message };
  }
}

// 圖片生成輔助函數（使用 Push Message）
async function generateImageWithGeminiPush(prompt, source, userId) {
  try {
    const config = {
      responseModalities: ['IMAGE', 'TEXT'],
    };
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-image-preview';
    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: `Generate an image: ${prompt}`,
          },
        ],
      },
    ];

    const response = await genAI.models.generateContentStream({
      model,
      config,
      contents,
    });

    let imageGenerated = false;
    let textResponse = '';

    for await (const chunk of response) {
      // 檢查用戶是否已取消
      const currentState = userStates.get(userId);
      if (!currentState || currentState.state !== 'generating_image') {
        console.log('圖片生成已被用戶取消');
        return; // 已被取消
      }

      if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
        continue;
      }

      // 處理圖片數據
      if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        const inlineData = chunk.candidates[0].content.parts[0].inlineData;
        const buffer = Buffer.from(inlineData.data || '', 'base64');

        // 統一上傳圖片到 888box / GCS / 本地
        const uploadResult = await uploadImageAsset(buffer, inlineData.mimeType, prompt);

        if (uploadResult.url) {
          const footerContents = [
            {
              type: 'button',
              action: { type: 'message', label: '🎨 再畫一張', text: '畫圖' },
              style: 'primary',
              color: '#1DB446',
              height: 'sm'
            }
          ];

          if (uploadResult.shareUrl) {
            footerContents.push({
              type: 'button',
              action: { type: 'uri', label: '🌐 在 888box 檢視', uri: uploadResult.shareUrl },
              style: 'secondary',
              color: '#2F80ED',
              height: 'sm'
            });
          }

          footerContents.push({
            type: 'button',
            action: { type: 'message', label: '✖️ 退出', text: '取消' },
            style: 'secondary',
            color: '#AAAAAA',
            height: 'sm'
          });

          const successFlexMessage = {
            type: 'flex',
            altText: '✅ 圖片生成成功',
            contents: {
              type: 'bubble',
              hero: {
                type: 'image',
                url: uploadResult.url,
                size: 'full',
                aspectRatio: '1:1',
                aspectMode: 'cover',
                action: {
                  type: 'uri',
                  uri: uploadResult.shareUrl || uploadResult.url
                }
              },
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'text', text: '✅ 圖片生成成功', weight: 'bold', size: 'xl', color: '#FFFFFF' }],
                backgroundColor: '#1DB446',
                paddingAll: 'lg'
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: '🎨 主題', weight: 'bold', size: 'sm', color: '#999999' },
                  { type: 'text', text: prompt, wrap: true, size: 'md', color: '#333333', margin: 'sm' },
                  { type: 'separator', margin: 'md' },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    margin: 'sm',
                    contents: [
                      { type: 'text', text: '儲存空間', size: 'xs', color: '#999999', flex: 3 },
                      { type: 'text', text: uploadResult.storageType === '888box' ? '888box CloudFront CDN' : 'Google Cloud Storage', size: 'xs', color: '#666666', flex: 7 }
                    ]
                  }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: footerContents
              }
            }
          };

          await client.pushMessage(userId, successFlexMessage);
          imageGenerated = true;
        } else if (uploadResult.localPath) {
          const successFlexMessage = {
            type: 'flex',
            altText: '✅ 圖片生成成功',
            contents: {
              type: 'bubble',
              header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '✅ 圖片生成成功', weight: 'bold', size: 'xl', color: '#FFFFFF' }], backgroundColor: '#1DB446', paddingAll: 'lg' },
              body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🎨 主題', weight: 'bold', size: 'sm', color: '#999999' }, { type: 'text', text: prompt, wrap: true, size: 'md', color: '#333333', margin: 'sm' }, { type: 'separator', margin: 'md' }, { type: 'text', text: '📋 儲存位置', weight: 'bold', size: 'sm', color: '#999999', margin: 'md' }, { type: 'text', text: '已保存至伺服器本地', size: 'sm', color: '#666666', margin: 'sm' }, { type: 'text', text: '⚠️ 圖片已保存在 images 資料夾', size: 'xs', color: '#999999', wrap: true, margin: 'sm' }] },
              footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', action: { type: 'message', label: '🎨 再畫一張', text: '畫圖' }, style: 'primary', color: '#1DB446', height: 'sm' }, { type: 'button', action: { type: 'message', label: '✖️ 退出', text: '取消' }, style: 'secondary', color: '#AAAAAA', height: 'sm' }] }
            }
          };

          await client.pushMessage(userId, [successFlexMessage]);
          imageGenerated = true;
        }
      }
      // 處理文字回應
      else if (chunk.text) {
        textResponse += chunk.text;
      }
    }

    // 如果沒有生成圖片但有文字回應，發送文字
    if (!imageGenerated && textResponse) {
      const textMessage = { type: 'text', text: `🤖 Gemini 回應：\n${textResponse}` };
      await client.pushMessage(userId, [textMessage]);
    } else if (!imageGenerated) {
      const errorMessage = { type: 'text', text: '❌ 抱歉，圖片生成失敗，請稍後再試。' };
      await client.pushMessage(userId, [errorMessage]);
    }

  } catch (error) {
    console.error('Gemini 圖片生成錯誤:', error);
    const errorMessage = { type: 'text', text: '❌ 抱歉，圖片生成服務目前無法使用。請檢查 GEMINI_API_KEY 是否正確設定。' };
    await client.pushMessage(userId, [errorMessage]);
  }
}

// 統一上傳圖片資產（優先 888box 多端點 CloudFront CDN，次選 Google Cloud Storage，再次本地）
async function uploadImageAsset(buffer, mimeType, prompt) {
  const fileExtension = getFileExtensionFromMimeType(mimeType) || 'png';
  const filename = `gemini_${Date.now()}_${uuidv4().slice(0, 8)}.${fileExtension}`;

  // 1. 優先上傳至 888box (具備 CDN 加速與 WebP 自動最佳化)
  try {
    const boxResult = await boxHelper.uploadBuffer(buffer, filename, mimeType, {
      title: prompt ? prompt.slice(0, 100) : 'Gemini Generated Image'
    });
    if (boxResult && boxResult.url) {
      console.log(`✅ 圖片已成功上傳至 888box (${boxResult.endpoint}): ${boxResult.url}`);
      return {
        url: boxResult.url,
        shareUrl: boxResult.shareUrl,
        storageType: '888box',
        endpoint: boxResult.endpoint
      };
    }
  } catch (boxErr) {
    console.warn('⚠️ 888box 上傳未成功，切換至 Google Cloud Storage:', boxErr.message);
  }

  // 2. 備用：Google Cloud Storage
  try {
    const gcsUrl = await uploadImageToGCS(buffer, mimeType, prompt);
    if (gcsUrl) {
      return {
        url: gcsUrl,
        shareUrl: gcsUrl,
        storageType: 'gcs'
      };
    }
  } catch (gcsErr) {
    console.warn('⚠️ GCS 上傳失敗:', gcsErr.message);
  }

  // 3. 備用：本地儲存
  const localPath = await saveImageLocally(buffer, mimeType, prompt);
  return {
    localPath: localPath,
    storageType: 'local'
  };
}

// 上傳圖片到 Google Cloud Storage
async function uploadImageToGCS(buffer, mimeType, prompt) {
  try {
    if (!storage || !bucket) {
      console.log('⚠️ Google Cloud Storage 未正確配置，將使用本地存儲');
      return null;
    }

    // 生成檔案名（使用 UUID 避免檔名過長）
    const fileExtension = getFileExtensionFromMimeType(mimeType);
    const uniqueFilename = `linebot_images/${uuidv4()}.${fileExtension}`;

    console.log(`Generated unique filename: ${uniqueFilename}`);

    // 上傳到 Google Cloud Storage
    const file = bucket.file(uniqueFilename);

    console.log(`Creating blob in bucket: ${bucket.name}`);
    console.log('Starting upload to GCS...');

    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
        metadata: {
          prompt: prompt,
          generatedAt: new Date().toISOString(),
          source: process.env.GEMINI_MODEL || 'gemini-2.5-flash-image-preview'
        }
      }
    });

    console.log(`Upload completed successfully with content_type: ${mimeType}`);

    // 對於啟用了 uniform bucket-level access 的 bucket，
    // 我們不需要呼叫 makePublic()，而是直接使用公開 URL
    console.log('Generating public URL (uniform bucket-level access enabled)...');

    // 直接構建公開 URL，確保正確編碼（如 Python 版本）
    const encodedFilename = encodeURIComponent(uniqueFilename).replace(/%2F/g, '/');
    const publicUrl = `https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_BUCKET_NAME}/${encodedFilename}`;

    // 檢查檔案是否存在（如 Python 版本）
    const exists = await file.exists();
    console.log(`✅ 圖片已上傳至 Google Cloud Storage: ${publicUrl}`);
    console.log(`Blob exists: ${exists[0]}`);

    return publicUrl;

  } catch (error) {
    console.error('上傳至 Google Cloud Storage 失敗:', error);
    console.error(`Exception type: ${error.constructor.name}`);
    console.error(`Traceback: ${error.stack}`);
    return null;
  }
}

// 保存圖片到本地的函數
async function saveImageLocally(buffer, mimeType, prompt) {
  try {
    // 建立 images 目錄
    const imagesDir = path.join(__dirname, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // 生成檔案名（使用 UUID 避免檔名過長）
    const fileExtension = getFileExtensionFromMimeType(mimeType);
    const fileName = `${uuidv4()}.${fileExtension}`;
    const filePath = path.join(imagesDir, fileName);

    // 將 buffer 寫入檔案
    fs.writeFileSync(filePath, buffer);

    console.log(`✅ 圖片已保存至: ${filePath}`);
    return filePath;

  } catch (error) {
    console.error('保存圖片錯誤:', error);
    return null;
  }
}

// 圖片生成輔助函數
async function generateImageWithGemini(prompt, replyToken) {
  try {
    const config = {
      responseModalities: ['IMAGE', 'TEXT'],
    };
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-image-preview';
    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: `Generate an image: ${prompt}`,
          },
        ],
      },
    ];

    const response = await genAI.models.generateContentStream({
      model,
      config,
      contents,
    });

    let imageGenerated = false;
    let textResponse = '';

    for await (const chunk of response) {
      if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
        continue;
      }

      // 處理圖片數據
      if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        const inlineData = chunk.candidates[0].content.parts[0].inlineData;
        const buffer = Buffer.from(inlineData.data || '', 'base64');

        // 上傳圖片到 LINE 伺服器並取得 URL
        const imageUrl = await uploadImageToLine(buffer, inlineData.mimeType);

        if (imageUrl) {
          const imageMessage = {
            type: 'image',
            originalContentUrl: imageUrl,
            previewImageUrl: imageUrl
          };

          await client.replyMessage(replyToken, [imageMessage]);
          imageGenerated = true;
        }
      }
      // 處理文字回應
      else if (chunk.text) {
        textResponse += chunk.text;
      }
    }

    // 如果沒有生成圖片但有文字回應，發送文字
    if (!imageGenerated && textResponse) {
      const textMessage = { type: 'text', text: textResponse };
      await client.replyMessage(replyToken, [textMessage]);
    } else if (!imageGenerated) {
      const errorMessage = { type: 'text', text: '抱歉，圖片生成失敗，請稍後再試。' };
      await client.replyMessage(replyToken, [errorMessage]);
    }

  } catch (error) {
    console.error('Gemini 圖片生成錯誤:', error);
    const errorMessage = { type: 'text', text: '抱歉，圖片生成服務目前無法使用。' };
    await client.replyMessage(replyToken, [errorMessage]);
  }
}

// 上傳圖片到 LINE 的輔助函數（使用臨時檔案方式）
async function uploadImageToLine(buffer, mimeType) {
  try {
    // 建立臨時目錄
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 生成臨時檔案名
    const fileExtension = getFileExtensionFromMimeType(mimeType);
    const fileName = `generated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExtension}`;
    const tempFilePath = path.join(tempDir, fileName);

    // 將 buffer 寫入臨時檔案
    fs.writeFileSync(tempFilePath, buffer);

    // 這裡需要一個公開的檔案伺服器來提供圖片 URL
    // 暫時返回一個示例 URL，實際使用時需要配置檔案伺服器
    // 或使用雲端存儲服務如 AWS S3, Google Cloud Storage 等

    // 清理臨時檔案（延遲刪除）
    setTimeout(() => {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }, 30000); // 30秒後刪除

    // 暫時返回 null，需要實際的檔案伺服器配置
    console.log(`圖片已生成並保存至: ${tempFilePath}`);
    return null;

  } catch (error) {
    console.error('上傳圖片錯誤:', error);
    return null;
  }
}

// 檢查是否為圖片生成指令
function isImageGenerationCommand(text) {
  const imageCommands = ['!image', '!畫圖', '!img', '!圖片', '!產圖'];
  const imageKeywords = ['畫圖', 'image', '幫我產生圖', '生成圖片', '產生圖片', '畫一張', '畫一個', '生成一張'];

  // 檢查指令驅動
  const hasCommand = imageCommands.some(cmd => text.toLowerCase().startsWith(cmd.toLowerCase()));

  // 檢查自然語言驅動
  const hasKeyword = imageKeywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()));

  return hasCommand || hasKeyword;
}

// 提取圖片生成提示詞
function extractImagePrompt(text) {
  const imageCommands = ['!image', '!畫圖', '!img', '!圖片', '!產圖'];

  // 如果是指令驅動，移除指令部分
  for (const cmd of imageCommands) {
    if (text.toLowerCase().startsWith(cmd.toLowerCase())) {
      return text.substring(cmd.length).trim();
    }
  }

  // 如果是自然語言驅動，提取相關內容
  const imageKeywords = ['畫圖', 'image', '幫我產生圖', '生成圖片', '產生圖片', '畫一張', '畫一個', '生成一張'];

  for (const keyword of imageKeywords) {
    const index = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (index !== -1) {
      // 提取關鍵字後面的內容作為提示詞
      const afterKeyword = text.substring(index + keyword.length).trim();
      if (afterKeyword) {
        return afterKeyword;
      } else {
        // 如果關鍵字後面沒有內容，提取關鍵字前面的內容
        const beforeKeyword = text.substring(0, index).trim();
        return beforeKeyword || text;
      }
    }
  }

  return text;
}

// create Express app
const app = express()

// 健康檢查端點
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.2.0'
  })
})

// register a webhook handler with middleware
app.post('/callback', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err)
      res.status(500).end()
    })
})

// event handler
async function handleEvent(event) {
  try {
    // 處理 postback 事件（用於地點類型選擇）
    if (event.type === 'postback') {
      const userId = event.source.userId || event.source.groupId || event.source.roomId;
      const data = event.postback.data;

      console.log(`📲 收到 postback: ${data}`);

      // 處理地點類型選擇
      if (data.startsWith('place_type=')) {
        const placeType = data.replace('place_type=', '');
        const userState = userStates.get(userId);

        // 檢查狀態是否存在和過期（30 分鐘）
        const LOCATION_EXPIRE_TIME = 30 * 60 * 1000; // 30 分鐘
        if (!userState || userState.state !== 'waiting_place_type') {
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '⚠️ 位置資訊已過期，請重新分享位置。'
          });
        }

        // 檢查是否超過 30 分鐘
        if (Date.now() - userState.timestamp > LOCATION_EXPIRE_TIME) {
          userStates.delete(userId);
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '⚠️ 位置資訊已過期（超過30分鐘），請重新分享位置。'
          });
        }

        const { latitude, longitude } = userState;

        // 根據類型顯示不同的訊息
        const typeNames = {
          'gas_station': '⛽ 加油站',
          'parking': '🅿️ 停車場',
          'convenience_store': '🏪 超商',
          'cafe': '☕ 咖啡廳',
          'restaurant': '🍴 餐廳',
          'atm': '🏧 ATM'
        };

        console.log(`🔍 搜尋附近的${typeNames[placeType]}...`);

        // 搜尋指定類型的地點
        const places = await searchNearbyPlaces(latitude, longitude, placeType);

        if (places.length === 0) {
          // 不刪除狀態，讓用戶可以嘗試其他類型
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `附近沒有找到${typeNames[placeType]} 😢\n\n💡 您可以再次分享位置並嘗試其他類型。`
          });
        }

        const flexMessage = formatPlacesMessage(places);

        // 保留位置資訊，讓用戶可以繼續查詢其他類型
        // 不刪除 userState，讓位置資訊可以重複使用直到過期

        // 添加提示訊息
        const tipMessage = {
          type: 'text',
          text: '💡 您可以再次分享位置並選擇其他類型，或在30分鐘內位置資訊會保持有效。'
        };

        return client.replyMessage(event.replyToken, [flexMessage, tipMessage]);
      }
    }

    // 處理地理位置訊息
    if (event.type === 'message' && event.message.type === 'location') {
      const { latitude, longitude } = event.message;
      const userId = event.source.userId || event.source.groupId || event.source.roomId;
      console.log(`📍 收到位置: ${latitude}, ${longitude}`);

      // 儲存位置資訊
      userStates.set(userId, {
        state: 'waiting_place_type',
        latitude: latitude,
        longitude: longitude,
        timestamp: Date.now()
      });

      // 發送地點類型選擇按鈕
      const selectPlaceTypeMessage = {
        type: 'flex',
        altText: '📍 請選擇您想找的地點類型',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '請選擇您想找的地點類型',
                weight: 'bold',
                size: 'lg',
                color: '#1DB446'
              },
              {
                type: 'text',
                text: '收到您的位置！請問您想找什麼呢？',
                size: 'sm',
                color: '#999999',
                margin: 'md'
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
                action: {
                  type: 'postback',
                  label: '⛽ 加油站',
                  data: 'place_type=gas_station'
                },
                style: 'primary',
                color: '#17c1e8'
              },
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '🅿️ 停車場',
                  data: 'place_type=parking'
                },
                style: 'primary',
                color: '#17c1e8'
              },
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '🏪 超商',
                  data: 'place_type=convenience_store'
                },
                style: 'primary',
                color: '#17c1e8'
              },
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '☕ 咖啡廳',
                  data: 'place_type=cafe'
                },
                style: 'primary',
                color: '#17c1e8'
              },
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '🍴 餐廳',
                  data: 'place_type=restaurant'
                },
                style: 'primary',
                color: '#17c1e8'
              },
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '🏧 ATM',
                  data: 'place_type=atm'
                },
                style: 'primary',
                color: '#17c1e8'
              }
            ]
          }
        }
      };

      return client.replyMessage(event.replyToken, [selectPlaceTypeMessage]);
    }

    // 處理圖片訊息
    if (event.type === 'message' && event.message.type === 'image') {
      const userId = event.source.userId || event.source.groupId || event.source.roomId;
      const messageId = event.message.id;

      console.log('📸 收到圖片訊息:', { userId, messageId });

      // 儲存圖片訊息 ID，等待用戶指令
      userStates.set(userId, {
        state: 'waiting_image_action',
        messageId: messageId,
        timestamp: Date.now()
      });

      // 發送選擇按鈕
      const selectMessage = {
        type: 'template',
        altText: '📸 請選擇功能',
        template: {
          type: 'buttons',
          title: '📸 收到圖片',
          text: '請選擇要如何處理這張圖片',
          actions: [
            {
              type: 'message',
              label: '🔍 分析圖片',
              text: '分析'
            },
            {
              type: 'message',
              label: '✏️ 編輯圖片',
              text: '編輯'
            },
            {
              type: 'message',
              label: '☁️ 存入 888box',
              text: '存入 888box'
            },
            {
              type: 'message',
              label: '❌ 取消',
              text: '取消'
            }
          ]
        }
      };

      return client.replyMessage(event.replyToken, [selectMessage]);
    }

    // 處理影片訊息
    if (event.type === 'message' && event.message.type === 'video') {
      const userId = event.source.userId || event.source.groupId || event.source.roomId;
      const messageId = event.message.id;

      console.log('🎬 收到影片訊息:', { userId, messageId });
      await showLoadingAnimation(userId, 30);

      try {
        const videoBuffer = await downloadMediaFromLine(messageId, '影片');
        if (!videoBuffer) {
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ 抱歉，無法下載影片檔案。'
          });
        }

        const filename = `line_video_${Date.now()}.mp4`;
        const result = await boxHelper.uploadBuffer(videoBuffer, filename, 'video/mp4', {
          title: `LINE 影片 (${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })})`
        });

        const flexMessage = boxHelper.formatAssetFlexMessage(result);
        return client.replyMessage(event.replyToken, [flexMessage]);
      } catch (error) {
        console.error('❌ 上傳影片至 888box 失敗:', error);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: `❌ 影片儲存至 888box 失敗：${error.message}`
        });
      }
    }

    // 處理檔案訊息 (文件、壓縮檔等)
    if (event.type === 'message' && event.message.type === 'file') {
      const userId = event.source.userId || event.source.groupId || event.source.roomId;
      const messageId = event.message.id;
      const fileName = event.message.fileName || `file_${Date.now()}.bin`;

      console.log('📄 收到檔案訊息:', { userId, messageId, fileName });
      await showLoadingAnimation(userId, 30);

      try {
        const fileBuffer = await downloadMediaFromLine(messageId, '檔案');
        if (!fileBuffer) {
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ 抱歉，無法下載檔案。'
          });
        }

        const result = await boxHelper.uploadBuffer(fileBuffer, fileName, 'application/octet-stream', {
          title: fileName
        });

        const flexMessage = boxHelper.formatAssetFlexMessage(result);
        return client.replyMessage(event.replyToken, [flexMessage]);
      } catch (error) {
        console.error('❌ 上傳檔案至 888box 失敗:', error);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: `❌ 檔案儲存至 888box 失敗：${error.message}`
        });
      }
    }

    // 處理音訊訊息
    if (event.type === 'message' && event.message.type === 'audio') {
      const userId = event.source.userId || event.source.groupId || event.source.roomId;
      const messageId = event.message.id;

      console.log('🎤 收到音訊訊息:', { userId, messageId });

      // 顯示 Loading
      await showLoadingAnimation(userId, 20);

      try {
        // 下載音訊
        const audioBuffer = await downloadAudioFromLine(messageId);
        if (!audioBuffer) {
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ 抱歉，無法下載音訊檔案。'
          });
        }

        // 轉錄音訊
        const transcription = await transcribeAudio(audioBuffer);
        if (!transcription) {
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ 抱歉，無法辨識音訊內容。請確認 ASR 服務已正確設定。'
          });
        }

        console.log(`✅ 音訊轉錄成功: "${transcription}"`);

        // 將轉錄文字送給 GPT 處理
        const messages = [
          { role: 'system', content: '你是一個有幫助的助手。' },
          { role: 'user', content: transcription }
        ];

        const completion = await openai.chat.completions.create({
          model: process.env.OPEN_AI_MODEL || 'gpt-4o',
          messages: messages,
        });

        const gptResponse = completion.choices[0].message.content;

        // 回覆 GPT 的回應
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🎤 您說：「${transcription}」\n\n${gptResponse}`
        });

      } catch (error) {
        console.error('❌ 處理音訊訊息錯誤:', error);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 抱歉，處理音訊時發生錯誤。'
        });
      }
    }

    // 處理文字訊息
    if (event.type !== 'message' || event.message.type !== 'text') {
      return Promise.resolve(null)
    }

    // 檢查是否為群組訊息，如果是群組訊息且沒有被 @，則不回應
    if (event.source.type === 'group' || event.source.type === 'room') {
      // 檢查訊息中是否包含 mention（@機器人）
      const mentions = event.message.mention?.mentionees || []
      const botUserId = process.env.LINE_BOT_USER_ID // 需要在 .env 中設定機器人的 User ID

      console.log('群組訊息 debug:', {
        sourceType: event.source.type,
        hasMention: mentions.length > 0,
        mentionees: mentions,
        botUserId: botUserId,
        messageText: event.message.text
      })

      // 如果沒有設定 LINE_BOT_USER_ID，則檢查訊息是否以機器人名稱開頭
      if (!botUserId || !botUserId.startsWith('U')) {
        // 備用方案：檢查訊息是否包含常見的機器人呼叫方式或 @ 符號
        const botTriggers = ['bot', '機器人', '@728wsrjq', '@', '選擇服務', '解答之書', '唐詩', '淺草籤', '奇門遁甲', '天氣特報', '!box', '888box', 'box', '轉存', '下載', '雲端空間', '播客', '!wiki', 'wiki', '知識庫', '筆記']
        const hasValidTrigger = botTriggers.some(trigger =>
          event.message.text.toLowerCase().includes(trigger.toLowerCase())
        )

        console.log('使用備用觸發機制:', {
          messageText: event.message.text,
          hasValidTrigger: hasValidTrigger,
          triggers: botTriggers
        })

        if (!hasValidTrigger) {
          return Promise.resolve(null)
        }
      } else {
        // 如果沒有 mention 或者沒有 @ 到機器人，則不回應
        // 檢查是否有任何 mention 是指向機器人的（包括 isSelf: true）
        const botMentioned = mentions.some(mention =>
          mention.userId === botUserId || mention.isSelf === true
        )

        console.log('檢查機器人 mention:', {
          botUserId: botUserId,
          botMentioned: botMentioned,
          mentions: mentions.map(m => ({ userId: m.userId, isSelf: m.isSelf }))
        })

        if (!botMentioned) {
          return Promise.resolve(null)
        }
      }
    }

    let userInput = event.message.text.trim()

    // 如果是群組訊息且有 mention，移除 @機器人 的部分
    if ((event.source.type === 'group' || event.source.type === 'room') && event.message.mention) {
      // 移除所有 @mention 的文字，只保留實際的訊息內容
      const mentions = event.message.mention.mentionees || []

      // 使用更精確的方式清理 mention 文字
      mentions.forEach(mention => {
        // 取得 mention 的起始位置和長度
        if (mention.index !== undefined && mention.length !== undefined) {
          // 從原始訊息中移除 mention 部分
          const beforeMention = event.message.text.substring(0, mention.index)
          const afterMention = event.message.text.substring(mention.index + mention.length)
          userInput = (beforeMention + afterMention).trim()
        } else {
          // 備用方法：使用正則表達式移除
          userInput = userInput.replace(new RegExp(`@[^\\s]+`, 'g'), '').trim()
        }
      })

      // 額外清理可能殘留的特殊字符和多餘空格
      userInput = userInput.replace(/^[-\s]+|[-\s]+$/g, '').trim()
      userInput = userInput.replace(/\s+/g, ' ').trim() // 合併多個空格為一個

      console.log('群組訊息文字清理:', {
        原始訊息: event.message.text,
        清理後: userInput,
        mentions: mentions.map(m => ({ index: m.index, length: m.length, userId: m.userId }))
      })
    }

    console.log('處理的用戶輸入:', userInput)

    // 取得用戶 ID（統一在此處宣告）
    const userId = event.source.userId || event.source.groupId || event.source.roomId;
    let userState = userStates.get(userId);

    // 進入大同食譜模式
    if (userInput === '大同食譜') {
      userStates.set(userId, { state: 'tatung_recipe_mode' });
      const welcomeMessage = {
        type: 'flex',
        altText: '🍲 大同電鍋食譜小幫手',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '🍲 大同電鍋食譜',
                weight: 'bold',
                size: 'xl',
                color: '#FF6B35'
              }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '歡迎來到大同電鍋食譜小幫手！',
                weight: 'bold',
                size: 'md',
                margin: 'md'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'text',
                text: '請直接輸入您想做的料理名稱：',
                size: 'sm',
                margin: 'md',
                color: '#555555'
              },
              {
                type: 'text',
                text: '• 滷肉\n• 蒸蛋\n• 排骨湯\n• 紅燒肉',
                size: 'sm',
                color: '#999999',
                margin: 'sm'
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'message',
                  label: '🚪 退出食譜模式',
                  text: '退出'
                },
                style: 'secondary',
                height: 'sm'
              }
            ]
          }
        }
      };
      return client.replyMessage(event.replyToken, welcomeMessage);
    }

    // 處理大同食譜模式下的輸入
    if (userState && userState.state === 'tatung_recipe_mode') {
      if (userInput === '退出') {
        userStates.delete(userId);
        return client.replyMessage(event.replyToken, { type: 'text', text: '已退出食譜模式，回到一般聊天。' });
      }

      const query = userInput.trim();
      await showLoadingAnimation(userId, 20); // 顯示 loading

      // Call Python script for RAG
      return new Promise((resolve, reject) => {
        const pythonPath = process.env.PYTHON_PATH || './venv/bin/python';
        const ragScriptPath = process.env.RAG_SCRIPT_PATH || 'rag_service.py';

        console.log(`🔍 大同食譜查詢: "${query}"`);
        console.log(`📂 Python 路徑: ${pythonPath}`);
        console.log(`📂 RAG 腳本路徑: ${ragScriptPath}`);

        const pythonProcess = spawn(pythonPath, [ragScriptPath, query], {
          encoding: 'utf-8',
          cwd: process.cwd() // 確保工作目錄正確
        });

        let dataString = '';
        let errorString = '';

        pythonProcess.stdout.setEncoding('utf8');
        pythonProcess.stdout.on('data', (data) => {
          console.log(`📤 Python stdout: ${data}`);
          dataString += data.toString();
        });

        pythonProcess.stderr.setEncoding('utf8');
        pythonProcess.stderr.on('data', (data) => {
          console.error(`⚠️ Python stderr: ${data}`);
          errorString += data.toString();
        });

        pythonProcess.on('close', async (code) => {
          console.log(`🔚 Python process 結束，exit code: ${code}`);
          console.log(`📊 收到的資料長度: ${dataString.length} bytes`);

          try {
            if (code !== 0) {
              console.error(`❌ Python 執行失敗，exit code: ${code}`);
              console.error(`❌ Error output: ${errorString}`);
              await client.replyMessage(event.replyToken, {
                type: 'text',
                text: `查詢食譜時發生錯誤。\n\n錯誤詳情：\n${errorString.substring(0, 200)}`
              });
              return resolve(null);
            }

            if (!dataString.trim()) {
              console.error('❌ Python 沒有返回任何資料');
              await client.replyMessage(event.replyToken, {
                type: 'text',
                text: '查詢食譜時沒有收到回應，請稍後再試。'
              });
              return resolve(null);
            }

            console.log(`📝 準備解析 JSON: ${dataString.substring(0, 200)}...`);
            const result = JSON.parse(dataString);

            if (result.error) {
              console.error('RAG Error:', result.error);
              await client.replyMessage(event.replyToken, {
                type: 'text',
                text: `查詢數據庫時發生錯誤：${result.error}`
              });
              return resolve(null);
            }

            const documents = result.documents || [];
            const distances = result.distances || [];
            const searchMethod = result.method || 'unknown';
            console.log(`✅ 找到 ${documents.length} 筆食譜資料 (搜尋方式: ${searchMethod})`);
            if (documents.length > 0) {
              console.log(`📋 第一筆資料預覽: ${documents[0].substring(0, 150)}...`);
              if (distances.length > 0 && searchMethod === 'vector_search') {
                console.log(`📊 相似度分數 (越小越相似): ${distances.slice(0, 3).map((d, i) => `[${i + 1}] ${d.toFixed(4)}`).join(', ')}`);
              }
            }

            if (documents.length === 0) {
              await client.replyMessage(event.replyToken, {
                type: 'text',
                text: '抱歉，食譜資料庫中找不到相關食譜，請換個關鍵字試試。'
              });
              return resolve(null);
            }

            // Generate answer with GPT-4
            const context = documents.join('\n\n');
            console.log(`📄 Context 長度: ${context.length} 字元`);

            const systemPrompt = `你是一個專業的大同電鍋食譜助手。

重要規則：
1. 優先使用下方「參考資料」中的食譜內容來回答
2. 如果參考資料中有任何相關或相似的食譜（即使不完全一致），請盡量提供並說明
3. 對於相似或相關的食譜，可以建議使用者參考
4. 在參考資料完全無法回答問題時，不要告知「資料庫中沒有相關食譜」，而是你根據返回資料和已知知識庫去回答

參考資料：
${context}`;

            const userPrompt = `請根據上述參考資料，回答以下問題：${query}`;

            console.log(`🤖 準備呼叫 GPT，query: "${query}"`);

            const completion = await openai.chat.completions.create({
              model: process.env.OPEN_AI_MODEL || 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              max_tokens: 1000,
              temperature: 0.3 // 降低溫度，減少創造性
            });

            const replyText = completion.choices[0].message.content;
            console.log(`✅ GPT 回應長度: ${replyText.length} 字元`);
            console.log(`📝 GPT 回應預覽: ${replyText.substring(0, 100)}...`);

            // 使用 Flex Message 回覆，包含退出按鈕
            const replyMessage = {
              type: 'flex',
              altText: '🍲 大同電鍋食譜',
              contents: {
                type: 'bubble',
                header: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: '🍲 大同電鍋食譜',
                      weight: 'bold',
                      size: 'md',
                      color: '#FF6B35'
                    }
                  ],
                  paddingAll: 'sm'
                },
                body: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: replyText,
                      wrap: true,
                      size: 'sm'
                    }
                  ]
                },
                footer: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'box',
                      layout: 'horizontal',
                      contents: [
                        {
                          type: 'text',
                          text: '💡 繼續輸入料理名稱查詢',
                          size: 'xs',
                          color: '#999999',
                          flex: 1
                        }
                      ],
                      margin: 'sm'
                    },
                    {
                      type: 'button',
                      action: {
                        type: 'message',
                        label: '🚪 退出食譜模式',
                        text: '退出'
                      },
                      style: 'secondary',
                      height: 'sm',
                      margin: 'md'
                    }
                  ]
                }
              }
            };

            await client.replyMessage(event.replyToken, replyMessage);
            resolve(null);

          } catch (error) {
            console.error('Processing RAG result error:', error);
            await client.replyMessage(event.replyToken, { type: 'text', text: '處理食譜回應時發生錯誤。' });
            resolve(null);
          }
        });
      });
    }

    // 處理圖片相關狀態
    if (userState && userState.state === 'waiting_image_action') {
      const cancelKeywords = ['取消', '退出', 'cancel', '算了'];
      const isCancelCommand = cancelKeywords.some(keyword =>
        userInput.toLowerCase().includes(keyword.toLowerCase())
      );

      if (isCancelCommand) {
        userStates.delete(userId);
        const echo = { type: 'text', text: '❌ 已取消圖片處理。' };
        return client.replyMessage(event.replyToken, [echo]);
      }

      // 判斷用戶意圖
      const intent = detectImageIntent(userInput);

      if (intent === 'analyze_image' || userInput === '分析') {
        // 圖片分析模式
        try {
          // 顯示 Loading Indicator
          await showLoadingAnimation(userId, 30);

          // 下載圖片
          const imageBuffer = await downloadImageFromLine(userState.messageId);
          if (!imageBuffer) {
            userStates.delete(userId);
            const errorMsg = { type: 'text', text: '❌ 抱歉，無法下載圖片。請重新傳送圖片。' };
            return client.replyMessage(event.replyToken, [errorMsg]);
          }

          // 分析圖片
          const processingMessage = { type: 'text', text: '🔍 正在分析圖片...\n⏳ 請稍等片刻...' };
          await client.replyMessage(event.replyToken, [processingMessage]);

          const analysis = await analyzeImageWithGemini(imageBuffer, userInput === '分析' ? null : userInput, userId);

          // 清除狀態
          userStates.delete(userId);

          // 發送分析結果
          const resultMessage = {
            type: 'text',
            text: `🔍 圖片分析結果：\n\n${analysis}`
          };
          await client.pushMessage(userId, [resultMessage]);

        } catch (error) {
          console.error('圖片分析錯誤:', error);
          userStates.delete(userId);
          const errorMsg = { type: 'text', text: '❌ 抱歉，圖片分析失敗。請稍後再試。' };
          await client.pushMessage(userId, [errorMsg]);
        }

        return Promise.resolve(null);

      } else if (intent === 'edit_image' || userInput === '編輯') {
        // 切換到等待編輯指令狀態
        userStates.set(userId, {
          state: 'waiting_edit_prompt',
          messageId: userState.messageId,
          timestamp: Date.now()
        });

        const promptMessage = {
          type: 'text',
          text: '✏️ 請描述如何編輯這張圖片？\n\n範例：\n• 把背景改成海邊\n• 改成卡通風格\n• 加上彩虹和雲朵\n• 讓顏色更鮮豔\n\n如要取消，請輸入「取消」'
        };
        return client.replyMessage(event.replyToken, [promptMessage]);

      } else if (intent === 'save_box' || userInput === '存入 888box' || userInput === '存入' || userInput === '轉存' || userInput === '保存' || userInput.toLowerCase().includes('box')) {
        // 儲存至 888box
        try {
          await showLoadingAnimation(userId, 30);

          const imageBuffer = await downloadImageFromLine(userState.messageId);
          if (!imageBuffer) {
            userStates.delete(userId);
            const errorMsg = { type: 'text', text: '❌ 抱歉，無法下載圖片。請重新傳送圖片。' };
            return client.replyMessage(event.replyToken, [errorMsg]);
          }

          const filename = `line_img_${Date.now()}.jpg`;
          const result = await boxHelper.uploadBuffer(imageBuffer, filename, 'image/jpeg', {
            title: `LINE 圖片 (${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })})`
          });

          userStates.delete(userId);

          const flexMessage = boxHelper.formatAssetFlexMessage(result);
          return client.replyMessage(event.replyToken, [flexMessage]);
        } catch (error) {
          console.error('❌ 上傳圖片至 888box 失敗:', error);
          userStates.delete(userId);
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `❌ 圖片儲存至 888box 失敗：${error.message}`
          });
        }
      }
    }

    // 處理等待編輯指令狀態
    if (userState && userState.state === 'waiting_edit_prompt') {
      const cancelKeywords = ['取消', '退出', 'cancel', '算了'];
      const isCancelCommand = cancelKeywords.some(keyword =>
        userInput.toLowerCase().includes(keyword.toLowerCase())
      );

      if (isCancelCommand) {
        userStates.delete(userId);
        const echo = { type: 'text', text: '❌ 已取消圖片編輯。' };
        return client.replyMessage(event.replyToken, [echo]);
      }

      // 開始編輯圖片
      try {
        // 更新狀態為編輯中
        userStates.set(userId, {
          state: 'editing_image',
          messageId: userState.messageId,
          prompt: userInput,
          timestamp: Date.now()
        });

        // 顯示 Loading Indicator
        await showLoadingAnimation(userId, 60);

        // 下載圖片
        const imageBuffer = await downloadImageFromLine(userState.messageId);
        if (!imageBuffer) {
          userStates.delete(userId);
          const errorMsg = { type: 'text', text: '❌ 抱歉，無法下載圖片。請重新傳送圖片。' };
          return client.replyMessage(event.replyToken, [errorMsg]);
        }

        // 發送處理中訊息
        const processingMessage = {
          type: 'text',
          text: `🎨 正在編輯圖片：「${userInput}」\n⏳ 請稍等片刻，這可能需要 30-60 秒...\n\n💡 如要取消，請輸入「取消」`
        };
        await client.replyMessage(event.replyToken, [processingMessage]);

        // 編輯圖片
        const result = await editImageWithGemini(imageBuffer, userInput, userId);

        // 清除狀態
        userStates.delete(userId);

        if (result.success && result.imageUrl) {
          // 成功編輯並上傳到雲端
          const imageMessage = {
            type: 'image',
            originalContentUrl: result.imageUrl,
            previewImageUrl: result.imageUrl
          };

          const successMessage = {
            type: 'text',
            text: `✅ 圖片編輯完成！\n\n✏️ 編輯指令：${userInput}\n🔗 圖片連結：${result.imageUrl}`
          };

          await client.pushMessage(userId, [imageMessage, successMessage]);

        } else if (result.success && result.localPath) {
          // 保存到本地
          const successMessage = {
            type: 'text',
            text: `✅ 圖片編輯完成！\n\n✏️ 編輯指令：${userInput}\n📁 已保存至伺服器本地\n\n⚠️ 注意：由於雲端存儲配置問題，圖片已保存在伺服器的 images 資料夾中。`
          };

          await client.pushMessage(userId, [successMessage]);

        } else if (result.cancelled) {
          // 用戶取消
          const cancelMessage = { type: 'text', text: '❌ 圖片編輯已取消。' };
          await client.pushMessage(userId, [cancelMessage]);

        } else {
          // 編輯失敗
          const errorMessage = {
            type: 'text',
            text: `❌ 抱歉，圖片編輯失敗。\n\n錯誤訊息：${result.error || '未知錯誤'}\n\n請稍後再試。`
          };
          await client.pushMessage(userId, [errorMessage]);
        }

      } catch (error) {
        console.error('圖片編輯處理錯誤:', error);
        userStates.delete(userId);
        const errorMsg = { type: 'text', text: '❌ 抱歉，圖片編輯過程中發生錯誤。請稍後再試。' };
        await client.pushMessage(userId, [errorMsg]);
      }

      return Promise.resolve(null);
    }

    // 檢查用戶是否正在生成圖片並想要取消
    if (userState && userState.state === 'generating_image') {
      const cancelKeywords = ['取消', '退出', '停止', 'cancel', 'stop', 'exit', '不要了', '算了'];
      const isCancelCommand = cancelKeywords.some(keyword =>
        userInput.toLowerCase().includes(keyword.toLowerCase())
      );

      if (isCancelCommand) {
        userStates.delete(userId);
        const cancelMessage = {
          type: 'text',
          text: '❌ 已取消圖片生成。\n\n如需重新生成圖片，請再次輸入圖片生成指令。'
        };
        return client.replyMessage(event.replyToken, [cancelMessage]);
      } else {
        // 如果用戶在生成過程中發送了其他訊息，提醒他們可以取消
        const reminderMessage = {
          type: 'text',
          text: `🎨 圖片「${userState.prompt}」正在生成中...\n\n如要取消，請輸入「取消」。`
        };
        return client.replyMessage(event.replyToken, [reminderMessage]);
      }
    }

    // 對話式圖片生成 - 進入模式
    if (userInput === '畫圖' || userInput === '!畫圖' || userInput === '圖片生成') {
      userStates.set(userId, { state: 'waiting_image_prompt' });
      const promptMessage = {
        type: 'flex', altText: '🎨 圖片生成',
        contents: {
          type: 'bubble',
          header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🎨 圖片生成', weight: 'bold', size: 'xl', color: '#FFFFFF' }], backgroundColor: '#1DB446', paddingAll: 'lg' },
          body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '請描述您想生成的圖片：', weight: 'bold', size: 'md', margin: 'md' }, { type: 'separator', margin: 'md' }, { type: 'text', text: '範例：', size: 'sm', color: '#999999', margin: 'md' }, { type: 'text', text: '• 一隻可愛的小貓在花園裡玩耍\n• 未來主義的城市景觀\n• 美麗的夕陽海景', size: 'sm', color: '#666666', wrap: true, margin: 'sm' }] },
          footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', action: { type: 'message', label: '✖️ 退出', text: '取消' }, style: 'secondary', color: '#AAAAAA', height: 'sm' }] }
        }
      };
      return client.replyMessage(event.replyToken, [promptMessage]);
    }

    // 處理等待圖片提示詞的狀態
    if (userState && userState.state === 'waiting_image_prompt') {
      if (userInput === '取消' || userInput === '退出' || userInput === '停止') {
        userStates.delete(userId);
        return client.replyMessage(event.replyToken, { type: 'text', text: '已取消圖片生成。' });
      }

      const imagePrompt = userInput.trim();
      if (!imagePrompt || imagePrompt.length < 2) {
        return client.replyMessage(event.replyToken, { type: 'text', text: '請提供有效的圖片描述。' });
      }

      // 更新狀態為生成中（保留狀態）
      userStates.set(userId, { state: 'generating_image', prompt: imagePrompt });

      await showLoadingAnimation(userId, 60);
      await client.replyMessage(event.replyToken, { type: 'text', text: `✨ 即將為您生成圖片：\n「${imagePrompt}」\n\n⏳ 請稍等片刻...` });

      setTimeout(async () => {
        try {
          await generateImageWithGeminiPush(imagePrompt, event.source, userId);
        } catch (error) {
          console.error('圖片生成錯誤:', error);
          await client.pushMessage(userId, { type: 'text', text: '抱歉，圖片生成過程中發生錯誤。' });
        } finally {
          // 生成完成後清除狀態
          userStates.delete(userId);
        }
      }, 1000);

      return Promise.resolve(null);
    }

    // 檢查是否為圖片生成指令
    if (isImageGenerationCommand(userInput)) {
      const imagePrompt = extractImagePrompt(userInput);

      if (!imagePrompt || imagePrompt.length < 2) {
        const echo = { type: 'text', text: '請提供要生成的圖片描述。\n例如：!畫圖 一隻可愛的小貓\n或：幫我畫一張美麗的風景圖' };
        return client.replyMessage(event.replyToken, [echo]);
      }

      // 設定用戶狀態為圖片生成中
      userStates.set(userId, {
        state: 'generating_image',
        prompt: imagePrompt,
        startTime: Date.now()
      });

      // 顯示 Loading Indicator (最長 60 秒)
      await showLoadingAnimation(userId, 60);

      // 發送處理中訊息和取消說明
      const processingMessage = {
        type: 'text',
        text: `🎨 正在為您生成圖片：「${imagePrompt}」\n⏳ 請稍等片刻...\n\n💡 如要取消，請輸入「取消」、「退出」或「停止」`
      };
      await client.replyMessage(event.replyToken, [processingMessage]);

      // 呼叫圖片生成函數（使用 push message 發送結果）
      setTimeout(async () => {
        try {
          // 檢查用戶是否已取消
          const currentState = userStates.get(userId);
          if (!currentState || currentState.state !== 'generating_image') {
            return; // 已被取消
          }

          await generateImageWithGeminiPush(imagePrompt, event.source, userId);
        } catch (error) {
          console.error('圖片生成處理錯誤:', error);
          const errorMsg = { type: 'text', text: '抱歉，圖片生成過程中發生錯誤。' };
          await client.pushMessage(userId, [errorMsg]);
        } finally {
          // 清除用戶狀態
          userStates.delete(userId);
        }
      }, 1000);

      return Promise.resolve(null);
    }

    // 888box 資產轉存 / 統計 / 查詢 / 播客指令
    const isBoxCommand = userInput.startsWith('!box') || 
                         userInput.startsWith('!888box') || 
                         userInput.startsWith('!save') || 
                         userInput.startsWith('!轉存') || 
                         userInput.startsWith('!下載') || 
                         userInput === '888box' || 
                         userInput === '雲端空間' || 
                         userInput === 'box';

    if (isBoxCommand) {
      // 1. 播客資訊
      if (userInput === '!box podcast' || userInput === 'podcast' || userInput === '播客') {
        try {
          const podcastInfo = await boxHelper.getPodcastInfo();
          const podcastMessage = {
            type: 'flex',
            altText: '🎙️ 888box Podcast 播客訂閱',
            contents: {
              type: 'bubble',
              header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#9B51E0',
                paddingAll: 'lg',
                contents: [{ type: 'text', text: '🎙️ 888box Podcast 訂閱源', weight: 'bold', size: 'lg', color: '#FFFFFF' }]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  { type: 'text', text: '已自動將上傳的音訊與影片生成 Podcast RSS 訂閱源，可直接加入 Apple Podcasts, Spotify 等播放器：', size: 'sm', wrap: true, color: '#666666' },
                  { type: 'separator' },
                  { type: 'text', text: '🎬 影片 Podcast RSS', size: 'xs', weight: 'bold', color: '#999999' },
                  { type: 'text', text: podcastInfo.videoRss, size: 'xs', color: '#2F80ED', wrap: true },
                  { type: 'text', text: '🎵 音訊 Podcast RSS', size: 'xs', weight: 'bold', color: '#999999', margin: 'md' },
                  { type: 'text', text: podcastInfo.audioRss, size: 'xs', color: '#2F80ED', wrap: true }
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
                    color: '#9B51E0',
                    height: 'sm',
                    action: { type: 'uri', label: '🌐 開啟 888box', uri: podcastInfo.endpoint || 'https://box.david888.com' }
                  }
                ]
              }
            }
          };
          return client.replyMessage(event.replyToken, [podcastMessage]);
        } catch (err) {
          console.error('獲取 Podcast 資訊錯誤:', err);
          return client.replyMessage(event.replyToken, { type: 'text', text: `❌ 獲取播客資訊失敗：${err.message}` });
        }
      }

      // 2. 統計資訊
      if (userInput === '!box' || userInput === '!888box' || userInput === '!box stats' || userInput === '888box' || userInput === '雲端空間' || userInput === 'box') {
        try {
          await showLoadingAnimation(userId, 10);
          const stats = await boxHelper.getStats();
          const statsFlex = boxHelper.formatStatsFlexMessage(stats);
          return client.replyMessage(event.replyToken, [statsFlex]);
        } catch (err) {
          console.error('獲取 888box 統計錯誤:', err);
          return client.replyMessage(event.replyToken, { type: 'text', text: `❌ 獲取 888box 統計失敗：${err.message}` });
        }
      }

      // 3. 遠端 URL 轉存 / 下載
      let targetUrl = '';
      const prefixMatch = userInput.match(/^(!box|!888box|!save|!轉存|!下載)\s+(.+)$/i);
      if (prefixMatch) {
        targetUrl = prefixMatch[2].trim();
      }

      if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
        await showLoadingAnimation(userId, 45);
        await client.replyMessage(event.replyToken, { type: 'text', text: `📥 正在將遠端資產轉存至 888box...\n🔗 來源：${targetUrl}\n⏳ 請稍候...` });

        setTimeout(async () => {
          try {
            const result = await boxHelper.uploadFromUrl(targetUrl, {
              title: `轉存資產 (${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })})`
            });
            const flexMsg = boxHelper.formatAssetFlexMessage(result);
            await client.pushMessage(userId, [flexMsg]);
          } catch (err) {
            console.error('888box 轉存失敗:', err);
            await client.pushMessage(userId, { type: 'text', text: `❌ 轉存失敗：${err.message}` });
          }
        }, 500);

        return Promise.resolve(null);
      } else if (prefixMatch) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '💡 請輸入完整的網址，例如：\n!box https://example.com/video.mp4\n!轉存 https://example.com/image.jpg'
        });
      }
    }

    // David888 Wiki 筆記發布 / 閱讀 / 網頁轉文章指令
    const isWikiCommand = userInput.startsWith('!wiki') || 
                          userInput === 'wiki' || 
                          userInput === '知識庫' || 
                          userInput === 'david888 wiki';

    if (isWikiCommand) {
      // 1. Wiki 說明與選單
      if (userInput === '!wiki' || userInput === '!wiki help' || userInput === 'wiki' || userInput === '知識庫') {
        const wikiHelpFlex = {
          type: 'flex',
          altText: '📖 David888 Wiki 知識庫功能',
          contents: {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#1E293B',
              paddingAll: 'lg',
              contents: [
                { type: 'text', text: '📖 David888 Wiki 知識庫', weight: 'bold', size: 'lg', color: '#38BDF8' }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'md',
              contents: [
                { type: 'text', text: '支援直接將文字/筆記發布為 Markdown 文章，並提供 2D 簡報模式與電子書模式：', size: 'sm', wrap: true, color: '#333333' },
                { type: 'separator' },
                {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'xs',
                  contents: [
                    { type: 'text', text: '📝 發布文章：', size: 'xs', weight: 'bold', color: '#38BDF8' },
                    { type: 'text', text: '!wiki <路徑> <Markdown內容>', size: 'xs', color: '#666666' },
                    { type: 'text', text: '例：!wiki my-note # 標題\\n內文...', size: 'xs', color: '#888888' },
                    { type: 'text', text: '📥 轉存網頁成 Wiki 文章：', size: 'xs', weight: 'bold', color: '#38BDF8', margin: 'sm' },
                    { type: 'text', text: '!wiki parse <網址>', size: 'xs', color: '#666666' },
                    { type: 'text', text: '📖 讀取文章：', size: 'xs', weight: 'bold', color: '#38BDF8', margin: 'sm' },
                    { type: 'text', text: '!wiki read <路徑>', size: 'xs', color: '#666666' }
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
                  color: '#38BDF8',
                  height: 'sm',
                  action: { type: 'uri', label: '🌐 開啟 David888 Wiki', uri: 'https://wiki.david888.com' }
                }
              ]
            }
          }
        };
        return client.replyMessage(event.replyToken, [wikiHelpFlex]);
      }

      // 2. 轉存外部網頁成 Wiki 文章
      const parseMatch = userInput.match(/^!wiki\s+(?:parse|轉文章|轉存)\s+(https?:\/\/[^\s]+)$/i);
      if (parseMatch) {
        const sourceUrl = parseMatch[1];
        await showLoadingAnimation(userId, 45);
        await client.replyMessage(event.replyToken, { type: 'text', text: `📥 正在將網頁解析為 Markdown 並發布至 Wiki...\n🔗 網址：${sourceUrl}\n⏳ 請稍候...` });

        setTimeout(async () => {
          try {
            const parsed = await wikiHelper.parseUrlToMarkdown(sourceUrl);
            const pathSlug = `article-${Date.now()}`;
            const publishRes = await wikiHelper.publishNote(pathSlug, `# ${parsed.title}\n\n> 來源：[${sourceUrl}](${sourceUrl})\n\n${parsed.markdown}`);
            const flexMsg = wikiHelper.formatWikiFlexMessage(publishRes, parsed.title, parsed.markdown.slice(0, 150));
            await client.pushMessage(userId, [flexMsg]);
          } catch (err) {
            console.error('Wiki 網頁轉文章錯誤:', err);
            await client.pushMessage(userId, { type: 'text', text: `❌ 網頁轉存至 Wiki 失敗：${err.message}` });
          }
        }, 500);

        return Promise.resolve(null);
      }

      // 3. 讀取 Wiki 筆記
      const readMatch = userInput.match(/^!wiki\s+(?:read|get|讀取)\s+([^\s]+)(?:\s+(.+))?$/i);
      if (readMatch) {
        const targetPath = readMatch[1];
        const password = readMatch[2] || '';
        try {
          await showLoadingAnimation(userId, 15);
          const readRes = await wikiHelper.readNote(targetPath, password);
          const snippet = readRes.markdown.length > 800 ? readRes.markdown.slice(0, 790) + '\n\n...(內容過長，請點擊連結查看完整筆記)' : readRes.markdown;
          const textMessage = {
            type: 'text',
            text: `📖 Wiki 筆記「${targetPath}」：\n\n${snippet}\n\n🌐 線上閱讀：https://wiki.david888.com/${targetPath}`
          };
          return client.replyMessage(event.replyToken, [textMessage]);
        } catch (err) {
          console.error('Wiki 讀取錯誤:', err);
          return client.replyMessage(event.replyToken, { type: 'text', text: `❌ 讀取 Wiki 失敗：${err.message}` });
        }
      }

      // 4. 追加內容至現有 Wiki 筆記
      const appendMatch = userInput.match(/^!wiki\s+(?:append|追加)\s+([^\s]+)\s+([\s\S]+)$/i);
      if (appendMatch) {
        const targetPath = appendMatch[1];
        const appendText = appendMatch[2];
        try {
          await showLoadingAnimation(userId, 20);
          const publishRes = await wikiHelper.publishNote(targetPath, `\n\n${appendText}`, { append: true });
          const flexMsg = wikiHelper.formatWikiFlexMessage(publishRes, `已追加筆記至 ${targetPath}`);
          return client.replyMessage(event.replyToken, [flexMsg]);
        } catch (err) {
          console.error('Wiki 追加錯誤:', err);
          return client.replyMessage(event.replyToken, { type: 'text', text: `❌ 追加 Wiki 內容失敗：${err.message}` });
        }
      }

      // 5. 直接發布 Wiki 筆記：!wiki <path> <markdown> 或 !wiki <markdown>
      const publishMatch = userInput.match(/^!wiki\s+(?:post\s+)?([^\s\n]+)?\s*([\s\S]*)$/i);
      if (publishMatch) {
        let notePath = publishMatch[1];
        let content = publishMatch[2];

        // 若第一個參數其實是標題或內容開頭 (如 # 標題 或長文)
        if (notePath && (notePath.startsWith('#') || notePath.length > 40 || !content)) {
          content = userInput.replace(/^!wiki\s+/i, '');
          notePath = `note-${Date.now()}`;
        }

        if (!content || content.trim().length === 0) {
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '💡 請輸入要發布的內容，例如：\n!wiki my-path # 我的筆記標題\n這是筆記內容...'
          });
        }

        try {
          await showLoadingAnimation(userId, 20);
          const publishRes = await wikiHelper.publishNote(notePath, content.trim());
          const firstLine = content.trim().split('\n')[0].replace(/^#+\s*/, '');
          const flexMsg = wikiHelper.formatWikiFlexMessage(publishRes, firstLine || notePath, content.trim().slice(0, 150));
          return client.replyMessage(event.replyToken, [flexMsg]);
        } catch (err) {
          console.error('Wiki 發布錯誤:', err);
          return client.replyMessage(event.replyToken, { type: 'text', text: `❌ 發布 Wiki 筆記失敗：${err.message}` });
        }
      }
    }

    if (userInput === '選擇服務') {
      const buttons = {
        type: 'template',
        altText: '選擇服務',
        template: {
          type: 'buttons',
          title: '請選擇服務',
          text: '選擇您想要的服務',
          actions: [
            { label: '解答之書', type: 'message', text: '解答之書' },
            { label: '唐詩', type: 'message', text: '唐詩' },
            { label: '淺草籤', type: 'message', text: '淺草籤' },
            { label: '奇門遁甲', type: 'message', text: '奇門遁甲' }
          ],
        },
      }

      // 第二個按鈕組 - 天氣、圖片與工具
      const buttons2 = {
        type: 'template',
        altText: '更多服務',
        template: {
          type: 'buttons',
          title: '更多服務',
          text: '天氣、圖片生成與實用工具',
          actions: [
            { label: '📍 找附近設施', type: 'message', text: '找附近設施' },
            { label: '🌤️ 天氣特報', type: 'message', text: '天氣特報' },
            { label: '🎨 AI 畫圖', type: 'message', text: '畫圖' },
            { label: '🛠️ 線上工具', type: 'message', text: '工具' }
          ],
        },
      }

      // 第三個按鈕組 - 大同電鍋食譜、888box 與 David888 Wiki
      const buttons3 = {
        type: 'template',
        altText: '知識與雲端工具',
        template: {
          type: 'buttons',
          title: '知識與雲端工具',
          text: '食譜、888box 雲端與 Wiki 知識庫',
          actions: [
            { label: '🍲 大同食譜', type: 'message', text: '大同食譜' },
            { label: '📦 888box 雲端', type: 'message', text: '!box' },
            { label: '📖 David888 Wiki', type: 'message', text: '!wiki' },
            { label: '⚖️ 法律諮詢', type: 'message', text: '法律諮詢' }
          ],
        },
      }

      return client.replyMessage(event.replyToken, [buttons, buttons2, buttons3])
    }

    // const hintMessage = {
    //   type: 'text',
    //   text: '💡 貼心小提示：\n\n📍 點選「找附近設施」或直接傳送位置資訊，我可以幫您搜尋附近的加油站、超商、餐廳等設施喔！'
    // }

    // 找附近設施功能
    if (userInput === '找附近設施' || userInput === '附近設施' || userInput === '找設施') {
      const locationRequestMessage = {
        type: 'text',
        text: '📍 請分享您的位置\n\n點擊下方按鈕即可快速分享您的所在位置，我會幫您搜尋附近的加油站、超商、餐廳、咖啡廳、停車場和 ATM 等設施！',
        quickReply: {
          items: [
            {
              type: 'action',
              action: {
                type: 'location',
                label: '📍 分享我的位置'
              }
            }
          ]
        }
      };

      return client.replyMessage(event.replyToken, [locationRequestMessage]);
    }

    // Debug 指令
    if (userInput === '機器人狀態' || userInput === 'bot status') {
      const botUserId = process.env.LINE_BOT_USER_ID
      const debugInfo = `機器人狀態資訊：
- 來源類型：${event.source.type}
- 機器人 User ID：${botUserId ? '已設定' : '未設定'}
- 群組 ID：${event.source.groupId || '非群組'}
- 用戶 ID：${event.source.userId || '群組訊息'}
- 是否有 mention：${event.message.mention ? '是' : '否'}
- 原始訊息：${event.message.text}`

      const echo = { type: 'text', text: debugInfo }
      return client.replyMessage(event.replyToken, [echo])
    }

    // 處理工具網站請求
    if (userInput === '工具' || userInput === 'tools' || userInput === '線上工具' || userInput.includes('tool.david888')) {
      const toolMessage = {
        type: 'flex',
        altText: '🛠️ 線上工具集',
        contents: {
          type: 'bubble',
          hero: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '🛠️ 線上工具集',
                weight: 'bold',
                size: 'xxl',
                color: '#1DB446',
                align: 'center'
              }
            ],
            paddingAll: 'xl',
            backgroundColor: '#F0F8FF'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '精選實用工具',
                weight: 'bold',
                size: 'lg',
                margin: 'md'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'box',
                layout: 'vertical',
                margin: 'lg',
                spacing: 'sm',
                contents: [
                  {
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'sm',
                    contents: [
                      { type: 'text', text: '🕐', size: 'sm', flex: 0 },
                      { type: 'text', text: '線上時鐘', size: 'sm', color: '#555555', flex: 0 }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'sm',
                    contents: [
                      { type: 'text', text: '🔑', size: 'sm', flex: 0 },
                      { type: 'text', text: 'UUID 產生器', size: 'sm', color: '#555555', flex: 0 }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'sm',
                    contents: [
                      { type: 'text', text: '🔐', size: 'sm', flex: 0 },
                      { type: 'text', text: 'Hash 加密工具', size: 'sm', color: '#555555', flex: 0 }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'sm',
                    contents: [
                      { type: 'text', text: '📝', size: 'sm', flex: 0 },
                      { type: 'text', text: 'Base64 轉換', size: 'sm', color: '#555555', flex: 0 }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'sm',
                    contents: [
                      { type: 'text', text: '🎨', size: 'sm', flex: 0 },
                      { type: 'text', text: '顏色選擇器', size: 'sm', color: '#555555', flex: 0 }
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
            contents: [
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: '開啟工具網站',
                  uri: 'https://tool.david888.com'
                },
                style: 'primary',
                color: '#1DB446'
              }
            ]
          }
        }
      };
      return client.replyMessage(event.replyToken, [toolMessage]);
    }

    if (userInput === '解答之書') {
      // 呼叫 解答之書 API
      const response = await axios.get('https://answerbook.david888.com/answersOriginal')
      if (response.status === 200 && response.data && response.data.answer) {
        const answer = response.data.answer || '無法取得解答'
        const flexMessage = {
          type: 'flex', altText: '🔮 解答之書',
          contents: {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🔮 解答之書', weight: 'bold', size: 'xl', color: '#FFFFFF' }], backgroundColor: '#9B59B6', paddingAll: 'lg' },
            body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '神秘的解答', weight: 'bold', size: 'md', color: '#9B59B6', margin: 'md' }, { type: 'separator', margin: 'md' }, { type: 'text', text: answer, wrap: true, size: 'lg', margin: 'lg', color: '#333333' }] },
            footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '✨ 願這個解答為你指引方向', size: 'xs', color: '#999999', align: 'center' }] }
          }
        };
        return client.replyMessage(event.replyToken, [flexMessage])
      } else {
        const echo = { type: 'text', text: '抱歉，目前無法取得解答。' }
        return client.replyMessage(event.replyToken, [echo])
      }
    }

    if (userInput === '唐詩') {
      // 呼叫 唐詩 API
      const response = await axios.get('http://answerbook.david888.com/TangPoetry')
      if (response.status === 200 && response.data && response.data.poem) {
        const { author, title, text } = response.data.poem
        const flexMessage = {
          type: 'flex', altText: '📜 唐詩',
          contents: {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '📜 唐詩', weight: 'bold', size: 'xl', color: '#FFFFFF' }], backgroundColor: '#F39C12', paddingAll: 'lg' },
            body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: title, weight: 'bold', size: 'lg', color: '#F39C12' }, { type: 'text', text: `作者：${author}`, size: 'sm', color: '#999999', margin: 'sm' }, { type: 'separator', margin: 'md' }, { type: 'text', text: text, wrap: true, size: 'md', margin: 'lg', color: '#333333' }] },
            footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '✨ 品味古典詩詞之美', size: 'xs', color: '#999999', align: 'center' }] }
          }
        };
        return client.replyMessage(event.replyToken, [flexMessage])
      } else {
        const echo = { type: 'text', text: '抱歉，目前無法取得唐詩。' }
        return client.replyMessage(event.replyToken, [echo])
      }
    }

    if (userInput === '淺草籤') {
      // 呼叫 淺草籤 API
      const response = await axios.get('http://answerbook.david888.com/TempleOracleJP')
      if (response.status === 200 && response.data && response.data.oracle) {
        const { type, poem, explain, result } = response.data.oracle
        const flexMessage = {
          type: 'flex', altText: '🏮 淺草籤',
          contents: {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🏮 淺草籤', weight: 'bold', size: 'xl', color: '#FFFFFF' }], backgroundColor: '#E74C3C', paddingAll: 'lg' },
            body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `${type}`, weight: 'bold', size: 'lg', color: '#E74C3C' }, { type: 'separator', margin: 'md' }, { type: 'text', text: '籤詩', weight: 'bold', size: 'sm', color: '#999999', margin: 'md' }, { type: 'text', text: poem, wrap: true, size: 'md', color: '#333333' }, { type: 'text', text: '解釋', weight: 'bold', size: 'sm', color: '#999999', margin: 'md' }, { type: 'text', text: explain, wrap: true, size: 'md', color: '#333333' }] },
            footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🏯 願神明保佑', size: 'xs', color: '#999999', align: 'center' }] }
          }
        };
        return client.replyMessage(event.replyToken, [flexMessage])
      } else {
        const echo = { type: 'text', text: '抱歉，目前無法取得淺草籤。' }
        return client.replyMessage(event.replyToken, [echo])
      }
    }

    if (userInput === '天氣特報') {
      // 呼叫 台灣氣象署天氣特報 API
      const url = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0033-001?Authorization=CWA-AFB7BD45-6D32-4CA4-B619-D8BBC81B1ABA&format=JSON'

      try {
        const response = await axios.get(url)

        if (response.status === 200 && response.data && response.data.records) {
          const locations = response.data.records.location || []

          // 收集有特報的縣市
          const alertLocations = []
          locations.forEach(location => {
            if (location.hazardConditions &&
              location.hazardConditions.hazards &&
              location.hazardConditions.hazards.length > 0) {
              alertLocations.push(location)
            }
          })

          if (alertLocations.length === 0) {
            const echo = {
              type: 'text',
              text: '🌤️ 目前沒有天氣特報\n\n台灣地區天氣狀況良好，請安心出行！'
            }
            return client.replyMessage(event.replyToken, [echo])
          }

          // 如果特報太多，使用簡化的文字格式顯示所有特報
          if (alertLocations.length > 10) {
            let weatherReport = '⚠️ 天氣特報\n\n'

            alertLocations.forEach((location, index) => {
              const hazard = location.hazardConditions.hazards[0]
              const info = hazard.info
              const startTime = new Date(hazard.validTime.startTime).toLocaleString('zh-TW', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
              const endTime = new Date(hazard.validTime.endTime).toLocaleString('zh-TW', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })

              // 選擇圖示
              let emoji = '⚠️'
              if (info.phenomena.includes('大雨')) emoji = '🌧️'
              else if (info.phenomena.includes('強風')) emoji = '💨'
              else if (info.phenomena.includes('高溫')) emoji = '🔥'

              weatherReport += `${emoji} ${location.locationName}：${info.phenomena}\n`
              weatherReport += `📅 ${startTime} ~ ${endTime}\n\n`
            })

            weatherReport += `📊 總計：${alertLocations.length} 個縣市有特報`

            const echo = { type: 'text', text: weatherReport }
            return client.replyMessage(event.replyToken, [echo])
          }

          // 創建 Flex Message（限制卡片數量）
          const flexMessage = {
            type: 'flex',
            altText: '天氣特報',
            contents: {
              type: 'carousel',
              contents: []
            }
          }

          // 最多顯示前 10 個特報（避免訊息過大）
          const limitedLocations = alertLocations.slice(0, 10)

          limitedLocations.forEach(location => {
            const hazard = location.hazardConditions.hazards[0]
            const info = hazard.info
            const validTime = hazard.validTime

            // 創建時間格式
            const startTime = new Date(validTime.startTime).toLocaleString('zh-TW', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
            const endTime = new Date(validTime.endTime).toLocaleString('zh-TW', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })

            // 根據特報類型選擇顏色和圖示
            let color = '#FF5733'
            let emoji = '⚠️'

            if (info.phenomena.includes('大雨')) {
              color = '#3498DB'
              emoji = '🌧️'
            } else if (info.phenomena.includes('強風')) {
              color = '#9B59B6'
              emoji = '💨'
            } else if (info.phenomena.includes('高溫')) {
              color = '#E67E22'
              emoji = '🔥'
            }

            // 簡化 bubble 內容以減少大小
            const bubble = {
              type: 'bubble',
              styles: {
                header: {
                  backgroundColor: color
                }
              },
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: `${emoji} ${location.locationName}`,
                    color: '#FFFFFF',
                    weight: 'bold',
                    size: 'lg'
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
                    text: info.phenomena,
                    weight: 'bold',
                    size: 'lg',
                    color: color
                  },
                  {
                    type: 'text',
                    text: `開始：${startTime}`,
                    wrap: true,
                    color: '#666666',
                    size: 'sm'
                  },
                  {
                    type: 'text',
                    text: `結束：${endTime}`,
                    wrap: true,
                    color: '#666666',
                    size: 'sm'
                  }
                ]
              }
            }

            flexMessage.contents.contents.push(bubble)
          })

          return client.replyMessage(event.replyToken, [flexMessage])

        } else {
          const echo = { type: 'text', text: '抱歉，無法取得天氣特報資訊。' }
          return client.replyMessage(event.replyToken, [echo])
        }
      } catch (error) {
        console.error('天氣特報 API 錯誤:', error)
        const echo = { type: 'text', text: '抱歉，天氣特報服務目前無法使用。' }
        return client.replyMessage(event.replyToken, [echo])
      }
    }

    if (userInput === '法律諮詢') {
      // 設定用戶狀態為等待法律問題
      userStates.set(userId, { state: 'waiting_legal_question' })

      const echo = {
        type: 'text',
        text: '⚖️ 台灣法律諮詢服務\n\n請問您有什麼法律問題？\n例如：\n• AI產生的不實訊息，散播者會構成加重誹謗罪嗎？\n• 房屋買賣契約的注意事項\n• 勞動權益相關問題\n\n📝 請詳細描述您的問題，我會為您提供專業的法律分析。\n\n如要取消，請輸入「取消」或「退出」'
      }
      return client.replyMessage(event.replyToken, [echo])
    }

    if (userInput === '奇門遁甲') {
      // 設定用戶狀態為等待奇門遁甲問題
      userStates.set(userId, { state: 'waiting_qimen_question' })

      const qimenPrompt = {
        type: 'flex',
        altText: '☯️ 奇門遁甲',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '☯️ 奇門遁甲',
                weight: 'bold',
                size: 'xl',
                color: '#FFFFFF'
              }
            ],
            backgroundColor: '#34495E',
            paddingAll: 'lg'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '請問您想要占卜什麼問題？',
                weight: 'bold',
                size: 'md',
                margin: 'md'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'text',
                text: '範例：',
                size: 'sm',
                color: '#999999',
                margin: 'md'
              },
              {
                type: 'text',
                text: '• 今天適合投資嗎？\n• 這個工作機會好嗎？\n• 感情狀況如何？',
                size: 'sm',
                color: '#666666',
                wrap: true,
                margin: 'sm'
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
                action: {
                  type: 'message',
                  label: '✖️ 退出',
                  text: '取消'
                },
                style: 'secondary',
                color: '#AAAAAA',
                height: 'sm'
              }
            ]
          }
        }
      };
      return client.replyMessage(event.replyToken, [qimenPrompt])
    }

    // 檢查用戶是否正在進行奇門遁甲占卜
    if (userState && userState.state === 'waiting_qimen_question') {
      // 檢查是否要取消奇門遁甲
      if (userInput === '取消' || userInput === '退出') {
        userStates.delete(userId)
        const echo = { type: 'text', text: '已取消奇門遁甲占卜。' }
        return client.replyMessage(event.replyToken, [echo])
      }

      // 清除用戶狀態
      userStates.delete(userId)

      // 顯示 Loading Indicator (最長 20 秒)
      await showLoadingAnimation(userId, 20);

      try {
        // 呼叫奇門遁甲 API
        const qimenResponse = await axios.post('https://qi.david888.com/api/qimen-question', {
          question: userInput,
          mode: 'advanced',
          purpose: '綜合'
        }, {
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (qimenResponse.status === 200 && qimenResponse.data && qimenResponse.data.success) {
          const answer = qimenResponse.data.answer || '無法取得占卜結果'
          const question = qimenResponse.data.question || userInput
          const flexMessage = {
            type: 'flex', altText: '☯️ 奇門遁甲',
            contents: {
              type: 'bubble',
              header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '☯️ 奇門遁甲', weight: 'bold', size: 'xl', color: '#FFFFFF' }], backgroundColor: '#34495E', paddingAll: 'lg' },
              body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '占卜問題', weight: 'bold', size: 'md', color: '#34495E', margin: 'md' }, { type: 'text', text: question, wrap: true, size: 'sm', color: '#666666', margin: 'sm' }, { type: 'separator', margin: 'md' }, { type: 'text', text: '占卜結果', weight: 'bold', size: 'md', color: '#34495E', margin: 'md' }, { type: 'text', text: answer, wrap: true, size: 'md', margin: 'sm', color: '#333333' }] },
              footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', action: { type: 'message', label: '✖️ 退出', text: '取消' }, style: 'secondary', color: '#AAAAAA', height: 'sm' }, { type: 'text', text: '☯️ 天機玄妙，僅供參考', size: 'xs', color: '#999999', align: 'center', margin: 'sm' }] }
            }
          };
          return client.replyMessage(event.replyToken, [flexMessage])
        } else {
          const echo = { type: 'text', text: '抱歉，目前無法取得奇門遁甲占卜結果。' }
          return client.replyMessage(event.replyToken, [echo])
        }
      } catch (error) {
        console.error('奇門遁甲 API 錯誤:', error)
        const echo = { type: 'text', text: '抱歉，奇門遁甲服務目前無法使用。' }
        return client.replyMessage(event.replyToken, [echo])
      }
    }

    // 檢查用戶是否正在進行法律諮詢
    if (userState && userState.state === 'waiting_legal_question') {
      // 檢查是否要取消法律諮詢
      if (userInput === '取消' || userInput === '退出') {
        userStates.delete(userId)
        const echo = { type: 'text', text: '已取消法律諮詢。' }
        return client.replyMessage(event.replyToken, [echo])
      }

      // 清除用戶狀態
      userStates.delete(userId)

      try {
        // 顯示 Loading Indicator (最長 60 秒)
        await showLoadingAnimation(userId, 60);

        // 發送處理中訊息
        const processingMessage = {
          type: 'text',
          text: '⚖️ 正在分析您的法律問題...\n⏳ 請稍等片刻，台灣法律專家正在為您提供專業解答...'
        }
        await client.replyMessage(event.replyToken, [processingMessage])

        // 呼叫台灣法律 LLM API
        const legalResponse = await axios.post('https://taiwan-law-bot-dev.onrender.com/chat', {
          messages: [
            {
              role: 'user',
              content: userInput
            }
          ],
          stream: false, // LINE bot 使用非串流模式比較簡單
          is_paid_user: true,
          is_thinking_mode: true,
          general_public_mode: false,
          writing_mode: true,
          ai_high_court_only: false,
          model: 'gpt-4o'
        }, {
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (legalResponse.status === 200 && legalResponse.data) {
          let legalAnswer = ''

          // 處理不同格式的回應
          if (typeof legalResponse.data === 'string') {
            // 處理 SSE 格式的串流資料
            if (legalResponse.data.includes('data: {')) {
              const lines = legalResponse.data.split('\n')
              let content = ''

              for (const line of lines) {
                if (line.startsWith('data: {')) {
                  try {
                    const jsonStr = line.substring(6) // 移除 "data: " 前綴
                    const jsonData = JSON.parse(jsonStr)
                    if (jsonData.content) {
                      // 解碼 Unicode 編碼的內容
                      const decodedContent = jsonData.content.replace(/\\u[\dA-F]{4}/gi, (match) => {
                        return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16))
                      })
                      content += decodedContent
                    }
                  } catch (e) {
                    console.log('解析 SSE 資料錯誤:', e)
                  }
                }
              }
              legalAnswer = content || legalResponse.data
            } else {
              legalAnswer = legalResponse.data
            }
          } else if (legalResponse.data.choices && legalResponse.data.choices[0]) {
            legalAnswer = legalResponse.data.choices[0].message?.content || JSON.stringify(legalResponse.data)
          } else if (legalResponse.data.content) {
            legalAnswer = legalResponse.data.content
          } else {
            legalAnswer = JSON.stringify(legalResponse.data)
          }

          // LINE 訊息長度限制，如果超過 4500 字元就截斷
          if (legalAnswer.length > 4500) {
            legalAnswer = legalAnswer.substring(0, 4400) + '\n\n...(回應內容過長，已截取部分內容)'
          }

          const legalText = `⚖️ 台灣法律專業解答\n\n📋 問題：${userInput}\n\n📖 法律分析：\n${legalAnswer}\n\n⚠️ 免責聲明：本回應僅供參考，實際法律問題請諮詢專業律師。`

          // 如果回應還是太長，分段發送
          if (legalText.length > 4500) {
            const part1 = `⚖️ 台灣法律專業解答\n\n📋 問題：${userInput}\n\n📖 法律分析：\n${legalAnswer.substring(0, 3500)}`
            const part2 = `${legalAnswer.substring(3500)}\n\n⚠️ 免責聲明：本回應僅供參考，實際法律問題請諮詢專業律師。`

            const message1 = { type: 'text', text: part1 }
            const message2 = { type: 'text', text: part2 }

            await client.pushMessage(userId, [message1])
            await client.pushMessage(userId, [message2])
          } else {
            const echo = { type: 'text', text: legalText }
            await client.pushMessage(userId, [echo])
          }

        } else {
          const echo = { type: 'text', text: '❌ 抱歉，目前無法取得法律諮詢回應。請稍後再試。' }
          await client.pushMessage(userId, [echo])
        }

      } catch (error) {
        console.error('台灣法律 LLM API 錯誤:', error)
        let errorMessage = '❌ 抱歉，法律諮詢服務目前無法使用。'

        if (error.response) {
          console.error('API 回應錯誤:', error.response.status, error.response.data)
          errorMessage += `\n錯誤代碼：${error.response.status}`
        }

        const echo = { type: 'text', text: errorMessage }
        await client.pushMessage(userId, [echo])
      }

      return Promise.resolve(null)
    }

    // 顯示 Loading Indicator (最長 20 秒)
    await showLoadingAnimation(userId, 20);

    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant. 回覆請用繁體中文語言為主',
      },
      {
        role: 'user',
        content: userInput,
      },
    ]

    const completion = await openai.chat.completions.create({
      model: process.env.OPEN_AI_MODEL || 'gpt-4o-mini', // 默認使用 'gpt-4o-mini'，如果 .env 中未指定
      temperature: 1,
      messages: messages,
      max_tokens: 1000,
    })

    const echo = { type: 'text', text: completion.choices[0].message.content || '抱歉，我沒有話可說了。' }

    return client.replyMessage(event.replyToken, [echo])
  } catch (err) {
    console.log(err)
  }
}

// listen on port
const port = process.env.PORT || 8111
app.listen(port, () => {
  console.log(`listening on ${port}`)
})
