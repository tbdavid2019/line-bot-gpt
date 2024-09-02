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
            { label: '淺草籤', type: 'message', text: '淺草籤' }
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
