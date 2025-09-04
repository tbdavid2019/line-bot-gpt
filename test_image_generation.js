// 測試圖片生成功能的簡單腳本
require('dotenv').config()

const { GoogleGenAI } = require('@google/genai')
const mime = require('mime')
const fs = require('fs')
const path = require('path')

// 初始化 Google GenAI 客戶端
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
})

// 保存圖片到本地的函數
async function saveImageLocally(buffer, mimeType, prompt) {
  try {
    // 建立 images 目錄
    const imagesDir = path.join(__dirname, 'test_images')
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true })
    }
    
    // 生成檔案名
    const fileExtension = mime.getExtension(mimeType) || 'jpg'
    const cleanPrompt = prompt.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 50)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `test_${timestamp}_${cleanPrompt}.${fileExtension}`
    const filePath = path.join(imagesDir, fileName)
    
    // 將 buffer 寫入檔案
    fs.writeFileSync(filePath, buffer)
    
    console.log(`✅ 測試圖片已保存至: ${filePath}`)
    return filePath
    
  } catch (error) {
    console.error('保存圖片錯誤:', error)
    return null
  }
}

// 測試圖片生成
async function testImageGeneration() {
  try {
    console.log('🎨 開始測試 Gemini 圖片生成功能...')
    
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ 錯誤：未找到 GEMINI_API_KEY 環境變數')
      console.log('請在 .env 檔案中設定 GEMINI_API_KEY=your_api_key')
      return
    }
    
    const config = {
      responseModalities: ['IMAGE', 'TEXT'],
    }
    const model = 'gemini-2.5-flash-image-preview'
    const prompt = '一隻可愛的小貓咪在花園裡玩耍'
    
    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: `Generate an image: ${prompt}`,
          },
        ],
      },
    ]

    console.log(`📝 測試提示詞: ${prompt}`)
    console.log('⏳ 正在生成圖片...')

    const response = await genAI.models.generateContentStream({
      model,
      config,
      contents,
    })

    let imageGenerated = false
    let textResponse = ''
    
    for await (const chunk of response) {
      if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
        continue
      }
      
      // 處理圖片數據
      if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        const inlineData = chunk.candidates[0].content.parts[0].inlineData
        const buffer = Buffer.from(inlineData.data || '', 'base64')
        
        console.log(`📊 接收到圖片數據: ${buffer.length} bytes, MIME type: ${inlineData.mimeType}`)
        
        const savedPath = await saveImageLocally(buffer, inlineData.mimeType, prompt)
        
        if (savedPath) {
          imageGenerated = true
          console.log('🎉 圖片生成測試成功！')
        }
      }
      // 處理文字回應
      else if (chunk.text) {
        textResponse += chunk.text
      }
    }
    
    if (textResponse) {
      console.log('💬 Gemini 文字回應:', textResponse)
    }
    
    if (!imageGenerated) {
      console.log('⚠️  未生成圖片，但測試完成')
    }
    
  } catch (error) {
    console.error('❌ 測試失敗:', error.message)
    if (error.message.includes('API_KEY_INVALID')) {
      console.log('💡 請檢查 GEMINI_API_KEY 是否正確')
    }
  }
}

// 執行測試
if (require.main === module) {
  testImageGeneration()
}

module.exports = { testImageGeneration }
