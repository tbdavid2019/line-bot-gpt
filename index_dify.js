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

// create Express app
const app = express()

// 狀態變數，追蹤是否使用 TDARES API
let useTdaresApi = false;

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

    const userInput = event.message.text.trim()

    // 切換到使用 TDARES API
    if (userInput.toLowerCase() === 'tcdares') {
      useTdaresApi = true;
      const echo = { type: 'text', text: '已切換到 TDARES 應答模式。' }
      return client.replyMessage(event.replyToken, [echo])
    }

    // 中斷 TDARES API，恢復使用 OpenAI
    if (userInput.toLowerCase() === 'exit') {
      useTdaresApi = false;
      const echo = { type: 'text', text: '已切換回 OpenAI 應答模式。' }
      return client.replyMessage(event.replyToken, [echo])
    }

    // 如果使用 TDARES API
    if (useTdaresApi) {
      try {
        console.log('使用 TDARES API 處理用戶輸入:', userInput);
        const response = await axios.post('http://2.tcdares.david888.com/v1/chat-messages', {
          inputs: {},
          query: userInput,
          response_mode: 'blocking', // 使用 blocking 模式
          conversation_id: '',
          user: 'LINE-123',
          files: []
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.TCDARES_API_KEY || 'app-TkGDnffffffffffffff'}`,
            'Content-Type': 'application/json'
          }
        });
    
        console.log('TDARES API 回應:', response.data);
    
        // 確保回應中的 answer 被正確提取
        if (response.status === 200 && response.data && response.data.answer) {
          const answer = response.data.answer;
          const echo = { type: 'text', text: answer };
          return client.replyMessage(event.replyToken, [echo]);
        } else {
          console.log('TDARES API 無有效回應，回應資料:', response.data);
          const echo = { type: 'text', text: '抱歉，TDARES API 無法取得回應。' };
          return client.replyMessage(event.replyToken, [echo]);
        }
      } catch (err) {
        console.error('TDARES API Error:', err);
        const echo = { type: 'text', text: '抱歉，TDARES API 發生錯誤。' };
        return client.replyMessage(event.replyToken, [echo]);
      }
    }
    // 如果使用 OpenAI
    console.log('使用 OpenAI 處理用戶輸入:', userInput);
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

    console.log('OpenAI 回應:', completion.data);

    const echo = { type: 'text', text: completion.data.choices[0].message.content || '抱歉，我沒有話可說了。' }
  
    return client.replyMessage(event.replyToken, [echo])
  } catch (err) {
    console.error('處理事件時發生錯誤:', err);
  }
}

// listen on port
const port = process.env.PORT || 8111
app.listen(port, () => {
  console.log(`listening on ${port}`)
})
