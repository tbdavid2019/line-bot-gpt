require('dotenv').config()

const express = require('express')
const line = require('@line/bot-sdk')
const { Configuration, OpenAIApi } = require('openai')
const axios = require('axios')

// 初始化 OpenAI 客戶端
const configuration = new Configuration({
  apiKey: process.env.OPEN_AI_LINE_SECRET,
  basePath: process.env.OPEN_AI_BASE_PATH || 'https://api.openai.com/v1', // 默認的 OpenAI API endpoint
});
const openai = new OpenAIApi(configuration);

// create LINE SDK config from env variables
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
}

// create LINE SDK client
const client = new line.Client(config)

// 用戶狀態管理（簡單的記憶體存儲）
const userStates = new Map()

// create Express app
const app = express()

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
      
      // 如果沒有 mention 或者沒有 @ 到機器人，則不回應
      if (mentions.length === 0 || !mentions.some(mention => mention.userId === botUserId)) {
        return Promise.resolve(null)
      }
    }

    let userInput = event.message.text.trim()
    
    // 如果是群組訊息且有 mention，移除 @機器人 的部分
    if ((event.source.type === 'group' || event.source.type === 'room') && event.message.mention) {
      // 移除所有 @mention 的文字，只保留實際的訊息內容
      const mentions = event.message.mention.mentionees || []
      mentions.forEach(mention => {
        // 移除 @顯示名稱 的部分
        userInput = userInput.replace(new RegExp(`@[^\\s]+\\s*`, 'g'), '').trim()
      })
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
      return client.replyMessage(event.replyToken, buttons)
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

    if (userInput === '奇門遁甲') {
      // 設定用戶狀態為等待奇門遁甲問題
      const userId = event.source.userId || event.source.groupId || event.source.roomId
      userStates.set(userId, { state: 'waiting_qimen_question' })
      
      const echo = { type: 'text', text: '請問您想要占卜什麼問題？\n例如：今天適合投資嗎？、這個工作機會好嗎？、感情狀況如何？' }
      return client.replyMessage(event.replyToken, [echo])
    }

    // 檢查用戶是否正在進行奇門遁甲占卜
    const userId = event.source.userId || event.source.groupId || event.source.roomId
    const userState = userStates.get(userId)
    
    if (userState && userState.state === 'waiting_qimen_question') {
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
