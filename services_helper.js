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

// 5. 即時天氣預報查詢 (全台各縣市與鄉鎮區高精準即時天氣)
const TAIWAN_GEO_MAP = {
  '高雄鼓山': { lat: 22.64, lng: 120.27, name: '高雄市鼓山區' },
  '高雄鼓山區': { lat: 22.64, lng: 120.27, name: '高雄市鼓山區' },
  '鼓山': { lat: 22.64, lng: 120.27, name: '高雄市鼓山區' },
  '鼓山區': { lat: 22.64, lng: 120.27, name: '高雄市鼓山區' },
  '高雄左營': { lat: 22.69, lng: 120.29, name: '高雄市左營區' },
  '左營': { lat: 22.69, lng: 120.29, name: '高雄市左營區' },
  '高雄': { lat: 22.62, lng: 120.30, name: '高雄市' },
  '高雄市': { lat: 22.62, lng: 120.30, name: '高雄市' },
  '台北': { lat: 25.04, lng: 121.56, name: '台北市' },
  '台北市': { lat: 25.04, lng: 121.56, name: '台北市' },
  '台北南港': { lat: 25.05, lng: 121.61, name: '台北市南港區' },
  '南港': { lat: 25.05, lng: 121.61, name: '台北市南港區' },
  '台北信義': { lat: 25.03, lng: 121.56, name: '台北市信義區' },
  '新北': { lat: 25.01, lng: 121.46, name: '新北市' },
  '新北市': { lat: 25.01, lng: 121.46, name: '新北市' },
  '板橋': { lat: 25.01, lng: 121.46, name: '新北市板橋區' },
  '台中': { lat: 24.15, lng: 120.67, name: '台中市' },
  '台中市': { lat: 24.15, lng: 120.67, name: '台中市' },
  '台南': { lat: 22.99, lng: 120.21, name: '台南市' },
  '台南市': { lat: 22.99, lng: 120.21, name: '台南市' },
  '桃園': { lat: 24.99, lng: 121.30, name: '桃園市' },
  '桃園市': { lat: 24.99, lng: 121.30, name: '桃園市' },
  '新竹': { lat: 24.81, lng: 120.96, name: '新竹市' },
  '新竹市': { lat: 24.81, lng: 120.96, name: '新竹市' },
  '基隆': { lat: 25.13, lng: 121.74, name: '基隆市' },
  '宜蘭': { lat: 24.75, lng: 121.75, name: '宜蘭縣' },
  '花蓮': { lat: 23.99, lng: 121.60, name: '花蓮縣' },
  '台東': { lat: 22.75, lng: 121.15, name: '台東縣' },
  '屏東': { lat: 22.67, lng: 120.49, name: '屏東縣' },
  '澎湖': { lat: 23.57, lng: 119.57, name: '澎湖縣' }
};

function getWeatherDesc(code) {
  if (code === 0) return '晴朗 ☀️';
  if (code === 1 || code === 2) return '晴時多雲 🌤️';
  if (code === 3) return '多雲陰天 ☁️';
  if (code >= 45 && code <= 48) return '有霧 🌫️';
  if (code >= 51 && code <= 55) return '毛毛雨 🌦️';
  if (code >= 61 && code <= 65) return '下雨 🌧️';
  if (code >= 80 && code <= 82) return '短暫陣雨 🌧️';
  if (code >= 95) return '雷陣雨 ⛈️';
  return '局部短暫雨 🌦️';
}

async function getRealtimeWeather(locQuery) {
  let lat = 25.04;
  let lng = 121.56;
  let resolvedName = locQuery || '台灣';

  const cleanKey = (locQuery || '').replace(/[市區縣鄉鎮]/g, '').trim();
  for (const [k, v] of Object.entries(TAIWAN_GEO_MAP)) {
    if ((locQuery && locQuery.includes(k)) || k.includes(cleanKey)) {
      lat = v.lat;
      lng = v.lng;
      resolvedName = v.name;
      break;
    }
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTaipei`;
    const res = await axios.get(url, { timeout: 4000 });
    const curr = res.data.current;
    const daily = res.data.daily;

    const desc = getWeatherDesc(curr.weather_code);
    const maxTemp = daily?.temperature_2m_max?.[0] ?? curr.temperature_2m;
    const minTemp = daily?.temperature_2m_min?.[0] ?? curr.temperature_2m;
    const rainProb = daily?.precipitation_probability_max?.[0] ?? 0;

    const summary = `📍 【${resolvedName} 即時天氣預報】\n` +
      `• 當前天氣：${desc}\n` +
      `• 當前氣溫：${curr.temperature_2m}°C（體感約 ${curr.apparent_temperature}°C）\n` +
      `• 今日氣溫範圍：${minTemp}°C ~ ${maxTemp}°C\n` +
      `• 相對濕度：${curr.relative_humidity_2m}%\n` +
      `• 降雨機率：${rainProb}%\n` +
      `• 風速：${curr.wind_speed_10m} km/h\n` +
      `${rainProb > 40 || curr.rain > 0 ? '💡 降雨機率偏高，外出請務必攜帶雨具！' : '💡 天氣舒適，適合外出！'}`;

    return {
      success: true,
      location: resolvedName,
      summary: summary
    };
  } catch (err) {
    console.error('即時天氣查詢失敗:', err.message);
    return { success: false, error: '即時天氣查詢失敗' };
  }
}

module.exports = {
  getAnswerBook,
  getTangPoetry,
  getTempleOracle,
  getWeatherAlerts,
  getRealtimeWeather
};
