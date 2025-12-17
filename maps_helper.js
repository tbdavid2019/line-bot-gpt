
const axios = require('axios');

// Google Maps Nearby Search Function
async function searchNearbyPlaces(latitude, longitude, placeType = null, radius = 1000) {
    try {
        if (!process.env.GOOGLE_MAPS_API_KEY) {
            console.error('❌ Missing GOOGLE_MAPS_API_KEY');
            return [];
        }

        let params = {
            location: `${latitude},${longitude}`,
            radius: radius,
            language: 'zh-TW',
            key: process.env.GOOGLE_MAPS_API_KEY
        };

        // 如果指定了地點類型，使用 type 參數
        if (placeType) {
            params.type = placeType;
        } else {
            // 否則使用關鍵字搜尋多種類型
            params.keyword = '加油站 OR 超商 OR 餐廳 OR 咖啡廳 OR 停車場 OR ATM OR 便當店';
        }

        const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
            params: params,
            headers: {
                'Accept': 'application/json',
                'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://tbdavid2019.github.io/',
                'Origin': 'https://tbdavid2019.github.io',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
            console.error('Google Maps API Error:', response.data.status, response.data.error_message);
            return [];
        }

        return response.data.results.slice(0, 10); // Return top 10

    } catch (error) {
        console.error('❌ Google Maps Search Failed:', error);
        return [];
    }
}

// Helper to format places into Flex Message or Text
function formatPlacesMessage(places) {
    if (places.length === 0) {
        return { type: 'text', text: '附近沒有發現指定的設施（加油站、超商、餐廳、ATM等）。' };
    }

    // Create a Flex Message Carousel
    const bubbles = places.map(place => {
        return {
            type: 'bubble',
            hero: {
                type: 'image',
                url: place.photos ?
                    `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${process.env.GOOGLE_MAPS_API_KEY}` :
                    'https://via.placeholder.com/400x300.png?text=No+Image', // Fallback image
                size: 'full',
                aspectRatio: '20:13',
                aspectMode: 'cover'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: place.name,
                        weight: 'bold',
                        size: 'xl'
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
                                    {
                                        type: 'text',
                                        text: '⭐',
                                        color: '#aaaaaa',
                                        size: 'sm',
                                        flex: 1
                                    },
                                    {
                                        type: 'text',
                                        text: `${place.rating || 'N/A'} (${place.user_ratings_total || 0})`,
                                        wrap: true,
                                        color: '#666666',
                                        size: 'sm',
                                        flex: 5
                                    }
                                ]
                            },
                            {
                                type: 'box',
                                layout: 'baseline',
                                spacing: 'sm',
                                contents: [
                                    {
                                        type: 'text',
                                        text: '📍',
                                        color: '#aaaaaa',
                                        size: 'sm',
                                        flex: 1
                                    },
                                    {
                                        type: 'text',
                                        text: place.vicinity || place.formatted_address,
                                        wrap: true,
                                        color: '#666666',
                                        size: 'sm',
                                        flex: 5
                                    }
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
                        style: 'link',
                        height: 'sm',
                        action: {
                            type: 'uri',
                            label: '開啟地圖',
                            uri: `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${place.place_id}`
                        }
                    }
                ],
                flex: 0
            }
        };
    });

    return {
        type: 'flex',
        altText: '附近景點推薦',
        contents: {
            type: 'carousel',
            contents: bubbles
        }
    };
}

module.exports = {
    searchNearbyPlaces,
    formatPlacesMessage
};
