let currentHistoryTargetDisplayId = null;
let currentOnlineTargetDisplayId = null;
let onlineWallpapersCache = [];

async function init() {
    const listContainer = document.getElementById('display-list');
    const displays = await window.electronAPI.getDisplays();

    if (displays.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center;">未发现显示器.</p>';
        return;
    }

    displays.forEach(display => {
        const card = document.createElement('div');
        card.className = 'display-card';

        // Left section with Preview + Info
        const leftSec = document.createElement('div');
        leftSec.className = 'display-left';

        // Preview Box
        const previewBox = document.createElement('div');
        previewBox.className = 'preview-box';
        previewBox.id = `preview-${display.id}`;
        previewBox.innerText = '预览区';
        
        // Info
        const info = document.createElement('div');
        info.className = 'display-info';
        info.innerHTML = `
            <div>显示器 ID: ${display.id}</div>
            <div style="font-size:0.8em; color:#666; margin-top:4px;">
                分辨率: ${display.bounds.width} x ${display.bounds.height}
            </div>
        `;

        leftSec.appendChild(previewBox);
        leftSec.appendChild(info);

        const controls = document.createElement('div');
        controls.className = 'controls';

        const imgBtn = document.createElement('button');
        imgBtn.className = 'btn-img';
        imgBtn.innerText = '设置图片';
        imgBtn.onclick = () => selectAndSetMedia(display.id, 'image');

        const vidBtn = document.createElement('button');
        vidBtn.className = 'btn-vid';
        vidBtn.innerText = '设置视频';
        vidBtn.onclick = () => selectAndSetMedia(display.id, 'video');

        const htmlBtn = document.createElement('button');
        htmlBtn.className = 'btn-html';
        htmlBtn.innerText = '设置 HTML';
        htmlBtn.onclick = () => selectAndSetMedia(display.id, 'html');

        const histBtn = document.createElement('button');
        histBtn.className = 'btn-hist';
        histBtn.innerText = '历史记录';
        histBtn.onclick = () => openHistory(display.id);

        const onlineBtn = document.createElement('button');
        onlineBtn.className = 'btn-online';
        onlineBtn.innerText = '在线图库';
        onlineBtn.onclick = () => openOnline(display.id);

        controls.appendChild(imgBtn);
        controls.appendChild(vidBtn);
        controls.appendChild(htmlBtn);
        controls.appendChild(histBtn);
        controls.appendChild(onlineBtn);

        card.appendChild(leftSec);
        card.appendChild(controls);

        listContainer.appendChild(card);
    });

    // Load saved state
    loadCurrentWallpapers();
}


async function loadCurrentWallpapers() {
    try {
        const current = await window.electronAPI.getCurrentWallpapers();
        // current is an object: { displayId: { path, type } }
        for (const [displayId, data] of Object.entries(current)) {
            if (data && data.path) {
                updatePreview(displayId, data.path, data.type);
            }
        }
    } catch (error) {
        console.error('Failed to load current wallpapers:', error);
    }
}

async function selectAndSetMedia(displayId, type) {
    const filePath = await window.electronAPI.selectMedia(type);
    if (filePath) {
        window.electronAPI.setWallpaper(displayId, filePath, type);
        updatePreview(displayId, filePath, type);
    }
}

async function openHistory(displayId) {
    currentHistoryTargetDisplayId = displayId;
    const modal = document.getElementById('history-modal');
    const content = document.getElementById('history-content');
    content.innerHTML = '加载中...';
    modal.showModal();

    try {
        const history = await window.electronAPI.getHistory();
        content.innerHTML = '';
        
        if (!history || history.length === 0) {
            content.innerHTML = '<p>暂无历史记录</p>';
            return;
        }

        history.forEach(item => {
            const el = document.createElement('div');
            el.className = 'history-item';
            el.title = item.path;
            
            // Delete button
            const delBtn = document.createElement('button');
            delBtn.className = 'history-delete-btn';
            delBtn.innerHTML = '×';
            delBtn.onclick = (e) => {
                e.stopPropagation(); // Prevent triggering selection
                deleteHistoryItem(item.path);
            };
            el.appendChild(delBtn);

            const src = `file://${item.path}`;
            if (item.type === 'image') {
                const img = document.createElement('img');
                img.src = src;
                el.appendChild(img);
            } else if (item.type === 'video') {
                const vid = document.createElement('video');
                vid.src = src;
                vid.muted = true; // no autoplay in history list to save resources
                el.appendChild(vid);
            } else if (item.type === 'html') {
                const div = document.createElement('div');
                div.innerText = 'HTML';
                div.style.height = '80px';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.justifyContent = 'center';
                div.style.background = '#f0f0f0';
                div.style.color = '#ff9500';
                div.style.fontWeight = 'bold';
                el.appendChild(div);
            }

            el.onclick = () => {
                if (currentHistoryTargetDisplayId) {
                    window.electronAPI.setWallpaper(currentHistoryTargetDisplayId, item.path, item.type);
                    updatePreview(currentHistoryTargetDisplayId, item.path, item.type);
                    closeHistory();
                }
            };
            
            content.appendChild(el);
        });

    } catch (e) {
        content.innerText = '加载失败: ' + e.message;
    }
}

async function clearHistory() {
    if (!confirm('确定要清空所有历史记录吗？')) return;
    try {
        await window.electronAPI.clearHistory();
        // Refresh list (which is basically emptying it)
        const content = document.getElementById('history-content');
        if (content) content.innerHTML = '<p>暂无历史记录</p>';
    } catch (e) {
        console.error('Failed to clear history:', e);
    }
}

async function deleteHistoryItem(filePath) {
    if (!confirm('确定删除这条记录吗？')) return;
    try {
        const newHistory = await window.electronAPI.deleteHistoryItem(filePath);
        // We could just re-render, simpliest way
        // But re-rendering requires context of which display opened it? 
        // Actually openHistory handles render.
        // Let's just close and re-open or hackily re-call render if we extracted render logic.
        // For now, let's just re-call openHistory logic or manually remove element.
        // Re-calling openHistory is safest to sync state.
        if (currentHistoryTargetDisplayId) {
            openHistory(currentHistoryTargetDisplayId);
        }
    } catch (e) {
        console.error('Failed to delete item:', e);
    }
}

function closeHistory() {
    const modal = document.getElementById('history-modal');
    modal.close();
    currentHistoryTargetDisplayId = null;
}


function updatePreview(displayId, filePath, type) {
    const box = document.getElementById(`preview-${displayId}`);
    if (!box) return; // in case display id changed (rare) or not rendered yet

    box.innerHTML = ''; 
    box.innerText = ''; // clear text if any

    let el;
    const src = `file://${filePath}`;

    if (type === 'image') {
        el = document.createElement('img');
        el.src = src;
        el.className = 'preview-media';
    } else if (type === 'video') {
        el = document.createElement('video');
        el.src = src;
        el.muted = true;
        el.autoplay = true;
        el.loop = true;
        el.className = 'preview-media';
    } else if (type === 'html') {
        // Create a scaled Iframe container
        const wrapper = document.createElement('div');
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.overflow = 'hidden';
        wrapper.style.position = 'relative';

        el = document.createElement('iframe');
        el.src = src;
        el.style.border = 'none';
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
        
        // Scale Trick: 
        // 1. Set actual size to 1920x1080 (standard 16:9)
        // 2. Scale down to fit the 160x90 box (scale = 160/1920 = 0.08333)
        el.style.width = '1920px';
        el.style.height = '1080px';
        el.style.transform = 'scale(0.08333)'; 
        el.style.transformOrigin = '0 0';
        
        wrapper.appendChild(el);
        box.appendChild(wrapper);
        return; // Return early as we appended usage wrapper
    }

    if (el) {
        box.appendChild(el);
    }
}

init();

async function openOnline(displayId) {
    currentOnlineTargetDisplayId = displayId;
    const modal = document.getElementById('online-modal');
    modal.showModal();
    
    // Fetch if empty
    if (onlineWallpapersCache.length === 0) {
        try {
            onlineWallpapersCache = await window.electronAPI.getOnlineWallpapers();
        } catch (e) {
            console.error('Failed to load online wallpapers', e);
            document.getElementById('online-content').innerHTML = '<p>加载失败</p>';
            return;
        }
    }

    if (onlineWallpapersCache.length === 0) {
         document.getElementById('online-content').innerHTML = '<p>暂无在线壁纸</p>';
         return;
    }

    // Extract categories
    const categories = ['全部', ...new Set(onlineWallpapersCache.map(i => i.category))];
    renderOnlineTabs(categories, '全部');
    renderOnlineGrid(onlineWallpapersCache);
}

function closeOnline() {
    document.getElementById('online-modal').close();
    currentOnlineTargetDisplayId = null;
}

function renderOnlineTabs(categories, activeCat) {
    const container = document.getElementById('online-tabs');
    container.innerHTML = '';
    
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.innerText = cat;
        btn.className = 'tab-btn' + (cat === activeCat ? ' active' : '');
        btn.onclick = () => {
            renderOnlineTabs(categories, cat);
            const filtered = cat === '全部' 
                ? onlineWallpapersCache 
                : onlineWallpapersCache.filter(i => i.category === cat);
            renderOnlineGrid(filtered);
        };
        container.appendChild(btn);
    });
}

function renderOnlineGrid(items) {
    const container = document.getElementById('online-content');
    container.innerHTML = '';
    
    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'online-item';
        
        const img = document.createElement('img');
        img.src = item.thumbnail || item.url;
        img.loading = 'lazy';
        
        const info = document.createElement('div');
        info.className = 'online-info';
        info.innerText = item.title;
        
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerText = 'Downloading...';
        
        el.appendChild(img);
        el.appendChild(info);
        el.appendChild(loadingOverlay);
        
        el.onclick = () => handleOnlineDownload(item, el);
        
        container.appendChild(el);
    });
}

async function handleOnlineDownload(item, element) {
    if (element.classList.contains('loading')) return;
    if (!currentOnlineTargetDisplayId) return;

    element.classList.add('loading');
    
    try {
        const localPath = await window.electronAPI.downloadWallpaper(item.url);
        
        // Determine type based on extension if not provided, though our JSON has type
        let type = item.type || 'image';
        
        window.electronAPI.setWallpaper(currentOnlineTargetDisplayId, localPath, type);
        updatePreview(currentOnlineTargetDisplayId, localPath, type);
        
        closeOnline();
    } catch (e) {
        alert('下载失败: ' + e.message);
    } finally {
        element.classList.remove('loading');
    }
}
