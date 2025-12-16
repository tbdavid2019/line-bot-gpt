
const axios = require('axios');

// Google Maps Nearby Search Function
async function searchNearbyPlaces(latitude, longitude, radius = 1000) {
    try {
        if (!process.env.GOOGLE_MAPS_API_KEY) {
            console.error('❌ Missing GOOGLE_MAPS_API_KEY');
            return [];
        }

        const types = ['gas_station', 'convenience_store', 'restaurant', 'cafe', 'parking', 'atm'];
        // Note: 'bento' is not a standard type, we might need to search by keyword if needed, 
        // but for now we stick to standard types or add 'meal_takeaway'.
        // Let's iterate through types or make a single broad search if possible, 
        // but Places API nearby search usually takes one 'type' or 'keyword'.
        // To get a mix, we might need multiple calls or use a keyword search like "facilities".
        // Alternatively, we can search for the most important ones.
        // The user want: 加油站 , 超商, 餐廳 , 咖啡廳, 停車場 , ATM, 便當店.

        // Let's implement a "keyword" based search which is more flexible than strict types for "bento".
        // Or we loop through a simplified list to get a few of each? That might be too many API calls (quota).
        // Better strategy: Search for "point of interest" with ranking by distance, 
        // OR just search for one broad type like 'establishment' and filter? No, that's too much data.

        // Compromise: Search for "facilities" using keyword?
        // Let's try to search by accumulated keywords or just pick top relevant categories.
        // Actually, the user might want "Nearby" generally. 
        // Let's try to search for "food" (Restaurant/Cafe/Bento), "store" (Convenience), "finance" (ATM), "transport" (Gas/Parking).

        // Let's make it simple: Search for "prominent places" or just one generic call?
        // The prompt says: "加油站 , 超商, 餐廳 , 咖啡廳, 停車場 , ATM, 便當店"
        // We can do a `nearbysearch` with `keyword` = "加油站 OR 超商 OR 餐廳 OR 咖啡廳 OR 停車場 OR ATM OR 便當店" ??
        // Google Places API text search supports queries like this better than nearby search.
        // But `nearbysearch` with `keyword` is supported.

        const keyword = '加油站 OR 超商 OR 餐廳 OR 咖啡廳 OR 停車場 OR ATM OR 便當店';

        const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
            params: {
                location: `${latitude},${longitude}`,
                radius: radius,
                keyword: keyword,
                language: 'zh-TW',
                key: process.env.GOOGLE_MAPS_API_KEY
            },
            headers: {
                'Referer': 'https://tbdavid2019.github.io/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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
