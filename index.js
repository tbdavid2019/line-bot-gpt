require('dotenv').config()

const express = require('express')
const line = require('@line/bot-sdk')
const { Configuration, OpenAIApi } = require('openai')

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
