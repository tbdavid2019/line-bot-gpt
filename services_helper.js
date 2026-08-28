/**
 * services_helper.js - 生活服務、占卜、天氣特報與食譜工具整合模組
 * 
 * 整合所有生活與占卜服務為標準化的 Agentic Tools：
 * 1. 解答之書 (AnswerBook)
 * 2. 唐詩推薦 (TangPoetry)
 * 3. 日本淺草籤 (TempleOracleJP)
 * 4. 奇門遁甲占卜 (QimenDunjia)
 * 5. 台灣中央氣象署天氣特報 (CWA Weather Alerts)
 * 6. 大同電鍋食譜 RAG 查詢
 */

const axios = require('axios');

// 1. 解答之書
async function getAnswerBook() {
  try {
    const res = await axios.get('https://answerbook.david888.com/answersOriginal', { timeout: 8000 });
    if (res.status === 200 && res.data && res.data.answer) {
      const answer = res.data.answer;
      const flexMessage = {
        type: 'flex',
        altText: '🔮 解答之書',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'text', text: '🔮 解答之書', weight: 'bold', size: 'xl', color: '#FFFFFF' }],
            backgroundColor: '#9B59B6',
            paddingAll: 'lg'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: '神秘的解答', weight: 'bold', size: 'md', color: '#9B59B6', margin: 'md' },
              { type: 'separator', margin: 'md' },
              { type: 'text', text: answer, wrap: true, size: 'lg', margin: 'lg', color: '#333333' }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'text', text: '✨ 願這個解答為你指引方向', size: 'xs', color: '#999999', align: 'center' }]
          }
        }
      };
      return { success: true, answer, flexMessage };
    }
  } catch (err) {
    console.error('解答之書 API 錯誤:', err.message);
  }
  return { success: false, error: '目前無法取得解答之書回應' };
}

// 2. 唐詩推薦
async function getTangPoetry() {
  try {
    const res = await axios.get('http://answerbook.david888.com/TangPoetry', { timeout: 8000 });
    if (res.status === 200 && res.data && res.data.poem) {
      const { author, title, text } = res.data.poem;
      const flexMessage = {
        type: 'flex',
        altText: '📜 唐詩推薦',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'text', text: '📜 唐詩推薦', weight: 'bold', size: 'xl', color: '#FFFFFF' }],
            backgroundColor: '#F39C12',
            paddingAll: 'lg'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: title, weight: 'bold', size: 'lg', color: '#F39C12' },
              { type: 'text', text: `作者：${author}`, size: 'sm', color: '#999999', margin: 'sm' },
              { type: 'separator', margin: 'md' },
              { type: 'text', text: text, wrap: true, size: 'md', margin: 'lg', color: '#333333' }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'text', text: '✨ 品味古典詩詞之美', size: 'xs', color: '#999999', align: 'center' }]
          }
        }
      };
      return { success: true, title, author, text, flexMessage };
    }
  } catch (err) {
    console.error('唐詩 API 錯誤:', err.message);
  }
  return { success: false, error: '目前無法取得唐詩' };
}

// 3. 日本淺草籤
async function getTempleOracle() {
  try {
    const res = await axios.get('http://answerbook.david888.com/TempleOracleJP', { timeout: 8000 });
    if (res.status === 200 && res.data && res.data.oracle) {
      const { type, poem, explain, result } = res.data.oracle;
      const flexMessage = {
        type: 'flex',
        altText: '🏮 日本淺草籤',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'text', text: '🏮 日本淺草籤', weight: 'bold', size: 'xl', color: '#FFFFFF' }],
            backgroundColor: '#E74C3C',
            paddingAll: 'lg'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: `${type}`, weight: 'bold', size: 'lg', color: '#E74C3C' },
              { type: 'separator', margin: 'md' },
              { type: 'text', text: '籤詩', weight: 'bold', size: 'sm', color: '#999999', margin: 'md' },
              { type: 'text', text: poem, wrap: true, size: 'md', color: '#333333' },
              { type: 'text', text: '解釋', weight: 'bold', size: 'sm', color: '#999999', margin: 'md' },
              { type: 'text', text: explain, wrap: true, size: 'md', color: '#333333' }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'text', text: '🏯 願神明保佑', size: 'xs', color: '#999999', align: 'center' }]
          }
        }
      };
      return { success: true, type, poem, explain, flexMessage };
    }
  } catch (err) {
    console.error('淺草籤 API 錯誤:', err.message);
  }
  return { success: false, error: '目前無法取得淺草籤' };
}

// 4. 氣象署天氣特報
async function getWeatherAlerts() {
  const url = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0033-001?Authorization=CWA-AFB7BD45-6D32-4CA4-B619-D8BBC81B1ABA&format=JSON';
  try {
    const res = await axios.get(url, { timeout: 8000 });
    if (res.status === 200 && res.data && res.data.records) {
      const locations = res.data.records.location || [];
      const alertLocations = locations.filter(l => l.hazardConditions?.hazards?.length > 0);

      if (alertLocations.length === 0) {
        return {
          success: true,
          hasAlerts: false,
          summary: '🌤️ 目前全台沒有天氣特報，天氣狀況良好！'
        };
      }

      let report = '⚠️ 台灣氣象署天氣特報：\n\n';
      for (const loc of alertLocations) {
        const hazard = loc.hazardConditions.hazards[0];
        const info = hazard.info;
        let emoji = '⚠️';
        if (info.phenomena.includes('大雨')) emoji = '🌧️';
        else if (info.phenomena.includes('強風')) emoji = '💨';
        else if (info.phenomena.includes('高溫')) emoji = '🔥';

        report += `${emoji} ${loc.locationName}：${info.phenomena}\n`;
      }
      report += `\n📊 總計：${alertLocations.length} 個縣市發布特報。`;

      return {
        success: true,
        hasAlerts: true,
        summary: report
      };
    }
  } catch (err) {
    console.error('天氣特報 API 錯誤:', err.message);
  }
  return { success: false, error: '無法取得氣象署特報資料' };
}

module.exports = {
  getAnswerBook,
  getTangPoetry,
  getTempleOracle,
  getWeatherAlerts
};
