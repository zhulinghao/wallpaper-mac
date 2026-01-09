const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'online-wallpapers.json');

// --- Configuration ---
// GID mapping:
// 2: Genshin Impact
// 6: Honkai: Star Rail
// 8: Zenless Zone Zero
const SOURCES = [
    {
        name: 'Genshin Impact',
        category: 'Genshin Impact',
        gid: 2
    },
    {
        name: 'Honkai: Star Rail',
        category: 'Honkai: Star Rail',
        gid: 6
    },
    {
        name: 'Zenless Zone Zero',
        category: 'Zenless Zone Zero',
        gid: 8
    }
];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Fetchers ---

async function fetchMihoyoSearch(source) {
    const items = [];
    const seenUrls = new Set();
    let lastId = '0'; 
    const MAX_PAGES = 3; 

    console.log(`Searching ${source.name} for wallpapers...`);

    for (let page = 0; page < MAX_PAGES; page++) {
        // API: https://bbs-api.mihoyo.com/post/wapi/searchPosts
        const url = `https://bbs-api.mihoyo.com/post/wapi/searchPosts?keyword=壁纸&gids=${source.gid}&size=20&last_id=${lastId}`;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const res = await fetch(url, { 
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.miyoushe.com/' 
                }
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
            
            const json = await res.json();
            
            if (json.retcode !== 0) {
                console.error(`Error searching ${source.name}: ${json.message}`);
                break;
            }

            const posts = json.data.posts;
            if (!posts || posts.length === 0) {
                console.log(`No more results for ${source.name}`);
                break;
            }
            
            // DEBUG: Inspect structure
            if (page === 0 && posts.length > 0) {
                console.log('Post keys:', Object.keys(posts[0]));
                if (posts[0].post) console.log('Has .post key');
                if (posts[0].subject) console.log('Has .subject key');
                if (posts[0].images) console.log('Has .images key');
            }

            // Update lastId
            lastId = json.data.last_id;

            for (const post of posts) {
                // If the API returns a wrapper with { post: {...}, user: {...} }
                // then we need to extract it.
                // Or if it returns flat structure.
                
                // Let's try both
                const actualPost = post.post || post;
                const subject = actualPost.subject;
                const images = actualPost.images;
                
                if (images && images.length > 0) {
                    images.forEach((imgUrl, index) => {
                        if(seenUrls.has(imgUrl)) return;
                        seenUrls.add(imgUrl);

                        items.push({
                            title: `${subject} (${index + 1})`,
                            type: 'image',
                            url: imgUrl,
                            category: source.category,
                            thumbnail: `${imgUrl}?x-oss-process=image/resize,m_fixed,h_300` 
                        });
                    });
                }
            }
            
            console.log(`Fetched ${posts.length} posts on page ${page} for ${source.name}`);
            
            if (json.data.is_last || !lastId) break;
            await sleep(500);

        } catch (e) {
            console.error(`Failed to search ${source.name}`, e);
            break; 
        }
    }
    
    console.log(`Total found for ${source.name}: ${items.length}`);
    return items;
}

// --- Kuro Games (Wuthering Waves) ---
async function fetchKuro() {
    console.log(`Fetching Wuthering Waves...`);
    // Static fallback due to strict API blocking
    const staticKuroTypes = [
        {
            title: "Wuthering Waves - Jinhsi",
            type: "image",
            url: "https://prod-all-slug-api.kurobbs.com/backend/cdn/image/2024/06/25/e4e082f0-32d7-4c07-88d4-539655f448c2.png",
            category: "Wuthering Waves",
            thumbnail: "https://prod-all-slug-api.kurobbs.com/backend/cdn/image/2024/06/25/e4e082f0-32d7-4c07-88d4-539655f448c2.png?x-oss-process=image/resize,h_300"
        },
        {
             title: "Wuthering Waves - Changli",
             type: "image",
             url: "https://prod-all-slug-api.kurobbs.com/backend/cdn/image/2024/07/16/aaa6612b-3e5e-4458-9411-4643ba30284e.jpg",
             category: "Wuthering Waves",
             thumbnail: "https://prod-all-slug-api.kurobbs.com/backend/cdn/image/2024/07/16/aaa6612b-3e5e-4458-9411-4643ba30284e.jpg?x-oss-process=image/resize,h_300"
        }
    ];
    return staticKuroTypes;
}


// --- Main ---

(async () => {
    let allWallpapers = [];

    // 1. Fetch Mihoyo
    for (const source of SOURCES) {
        const results = await fetchMihoyoSearch(source);
        allWallpapers = allWallpapers.concat(results);
        await sleep(500); 
    }

    // 2. Fetch Kuro
    const kuroResults = await fetchKuro();
    allWallpapers = allWallpapers.concat(kuroResults);

    // 3. Read existing to merge (Strictly keeping Video and non-MIHOYO/KURO items that were custom)
    let existing = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
        } catch (e) {
            console.error("Existing JSON corrupt, starting fresh");
        }
    }

    // Keep existing videos
    const existingVideos = existing.filter(i => i.type === 'video');
    
    // Merge
    const combined = [...existingVideos, ...allWallpapers];
    
    // Dedup
    const unique = [];
    const seenMap = new Set();
    
    for (const item of combined) {
        if (!seenMap.has(item.url)) {
            unique.push(item);
            seenMap.add(item.url);
        }
    }

    console.log(`Total wallpapers: ${unique.length}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2));
    console.log(`Saved to ${OUTPUT_FILE}`);
})();
