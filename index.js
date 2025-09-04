require('dotenv').config()

const express = require('express')
const line = require('@line/bot-sdk')
const { Configuration, OpenAIApi } = require('openai')
const axios = require('axios')
const { GoogleGenAI } = require('@google/genai')
const { Storage } = require('@google-cloud/storage')
const mime = require('mime')
const fs = require('fs')
const path = require('path')

// 初始化 OpenAI 客戶端
const configuration = new Configuration({
  apiKey: process.env.OPEN_AI_LINE_SECRET,
  basePath: process.env.OPEN_AI_BASE_PATH || 'https://api.openai.com/v1', // 默認的 OpenAI API endpoint
});
const openai = new OpenAIApi(configuration);

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

// create LINE SDK config from env variables
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
}

// create LINE SDK client
const client = new line.Client(config)

// 用戶狀態管理（簡單的記憶體存儲）
const userStates = new Map()

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
        
        // 上傳圖片到 Google Cloud Storage
        const imageUrl = await uploadImageToGCS(buffer, inlineData.mimeType, prompt);
        
        if (imageUrl) {
          const imageMessage = {
            type: 'image',
            originalContentUrl: imageUrl,
            previewImageUrl: imageUrl
          };
          
          const successTextMessage = {
            type: 'text',
            text: `✅ 圖片已成功生成！\n\n🎨 主題：${prompt}\n🔗 圖片連結：${imageUrl}`
          };
          
          await client.pushMessage(userId, [imageMessage, successTextMessage]);
          imageGenerated = true;
        } else {
          // 如果無法上傳到雲端，則保存到本地
          const savedPath = await saveImageLocally(buffer, inlineData.mimeType, prompt);
          
          if (savedPath) {
            const successMessage = {
              type: 'text',
              text: `✅ 圖片已成功生成！\n\n🎨 主題：${prompt}\n📁 已保存至伺服器本地\n\n⚠️ 注意：由於雲端存儲配置問題，圖片已保存在伺服器的 images 資料夾中。`
            };
            
            await client.pushMessage(userId, [successMessage]);
            imageGenerated = true;
          }
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

// 上傳圖片到 Google Cloud Storage
async function uploadImageToGCS(buffer, mimeType, prompt) {
  try {
    if (!storage || !bucket) {
      console.log('⚠️ Google Cloud Storage 未正確配置，將使用本地存儲');
      return null;
    }
    
    // 生成檔案名
    const fileExtension = mime.getExtension(mimeType) || 'jpg';
    const cleanPrompt = prompt.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 50);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `generated_images/${timestamp}_${cleanPrompt}.${fileExtension}`;
    
    // 上傳到 Google Cloud Storage
    const file = bucket.file(fileName);
    
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
    
    // 設定檔案為公開可讀
    await file.makePublic();
    
    // 返回公開 URL
    const publicUrl = `https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_BUCKET_NAME}/${fileName}`;
    
    console.log(`✅ 圖片已上傳至 Google Cloud Storage: ${publicUrl}`);
    return publicUrl;
    
  } catch (error) {
    console.error('上傳至 Google Cloud Storage 失敗:', error);
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
    
    // 生成檔案名（使用時間戳和清理過的提示詞）
    const fileExtension = mime.getExtension(mimeType) || 'jpg';
    const cleanPrompt = prompt.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 50);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${timestamp}_${cleanPrompt}.${fileExtension}`;
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
    const fileExtension = mime.getExtension(mimeType) || 'jpg';
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
        const botTriggers = ['bot', '機器人', '@728wsrjq', '@', '選擇服務', '解答之書', '唐詩', '淺草籤', '奇門遁甲', '天氣特報']
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
    const userState = userStates.get(userId);
    
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
      
      // 第二個按鈕組 - 天氣特報和圖片生成
      const buttons2 = {
        type: 'template',
        altText: '更多服務',
        template: {
          type: 'buttons',
          title: '更多服務',
          text: '天氣資訊與圖片生成',
          actions: [
            { label: '天氣特報', type: 'message', text: '天氣特報' },
            { label: 'AI 畫圖', type: 'message', text: '!畫圖 一隻可愛的小貓' }
          ],
        },
      }
      
      return client.replyMessage(event.replyToken, [buttons, buttons2])
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


    if (userInput === '解答之書') {
      // 呼叫 解答之書 API
      const response = await axios.get('https://answerbook.david888.com/')
      if (response.status === 200 && response.data && response.data.answer) {
        const answer = response.data.answer || '無法取得解答'
        const echo = { type: 'text', text: `解答之書說：${answer}` }
        return client.replyMessage(event.replyToken, [echo])
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
        const poemText = `${title} - ${author}\n${text}`
        const echo = { type: 'text', text: poemText }
        return client.replyMessage(event.replyToken, [echo])
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
        const oracleText = `籤詩類型：${type}\n籤詩：${poem}\n解釋：${explain}\n結果：${JSON.stringify(result, null, 2)}`
        const echo = { type: 'text', text: oracleText }
        return client.replyMessage(event.replyToken, [echo])
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

    if (userInput === '奇門遁甲') {
      // 設定用戶狀態為等待奇門遁甲問題
      userStates.set(userId, { state: 'waiting_qimen_question' })
      
      const echo = { type: 'text', text: '請問您想要占卜什麼問題？\n例如：今天適合投資嗎？、這個工作機會好嗎？、感情狀況如何？\n\n如要取消，請輸入「取消」或「退出」' }
      return client.replyMessage(event.replyToken, [echo])
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
          const qimenText = `奇門遁甲占卜如下：\n\n問題：${qimenResponse.data.question}\n\n${answer}`
          const echo = { type: 'text', text: qimenText }
          return client.replyMessage(event.replyToken, [echo])
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
    
    const completion = await openai.createChatCompletion({
      model: process.env.OPEN_AI_MODEL || 'gpt-4o-mini', // 默認使用 'gpt-4o-mini'，如果 .env 中未指定
      temperature: 1,
      messages: messages,
      max_tokens: 1000,
    })

    const echo = { type: 'text', text: completion.data.choices[0].message.content || '抱歉，我沒有話可說了。' }
  
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
