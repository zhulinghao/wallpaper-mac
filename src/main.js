const { app, BrowserWindow, screen, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

// --- Persistence Logic ---
const configPath = path.join(app.getPath('userData'), 'wallpaper-config.json');
const wallpaperCacheDir = path.join(app.getPath('userData'), 'wallpaper_cache');

if (!fs.existsSync(wallpaperCacheDir)) {
    try {
        fs.mkdirSync(wallpaperCacheDir, { recursive: true });
    } catch (e) {
        console.error("Failed to create cache directory", e);
    }
}

function cacheResource(sourcePath) {
    if (!sourcePath) return sourcePath;

    const normalizedSource = path.normalize(sourcePath);
    const normalizedCacheDir = path.normalize(wallpaperCacheDir);

    // If already in cache, return as is
    if (normalizedSource.startsWith(normalizedCacheDir)) {
        return normalizedSource;
    }

    try {
        if (!fs.existsSync(sourcePath)) return sourcePath;

        const safeBasename = path.basename(sourcePath).replace(/[^a-zA-Z0-9.-]/g, '_');
        const buffer = fs.readFileSync(sourcePath);
        // We'll use timestamp + safeBasename to encourage uniqueness
        const filename = `${Date.now()}_${safeBasename}`;
        const destPath = path.join(wallpaperCacheDir, filename);

        // Copy
        fs.copyFileSync(sourcePath, destPath);
        return destPath;
    } catch (e) {
        console.error("Failed to cache resource", e);
        return sourcePath;
    }
}

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
    } catch (e) {
        console.error("Failed to load config", e);
    }
    return { current: {}, history: [] };
}

function saveConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error("Failed to save config", e);
    }
}

let appConfig = loadConfig();
// -------------------------

// Keep global references
let wallpaperWindows = new Map(); // displayId -> BrowserWindow
let dashboardWindow = null;
let tray = null; // Tray instance

function createWallpaperWindows() {
    const displays = screen.getAllDisplays();

    displays.forEach((display) => {
        // If window already exists for this display, update bounds
        if (wallpaperWindows.has(display.id)) {
            const win = wallpaperWindows.get(display.id);
            win.setBounds(display.bounds);
            return;
        }

        const { x, y, width, height } = display.bounds;

        const win = new BrowserWindow({
            x,
            y,
            width,
            height,
            frame: false,
            fullscreen: false,
            transparent: true,
            type: 'desktop', // Key for macOS wallpaper behavior
            hasShadow: false,
            enableLargerThanScreen: true,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        win.loadFile(path.join(__dirname, 'wallpaper.html'));
        
        // Restore wallpaper if exists in config
        win.webContents.once('did-finish-load', () => {
            const saved = appConfig.current[display.id];
            if (saved && saved.path) {
                win.webContents.send('update-wallpaper', `file://${saved.path}`, saved.type);
            }
        });

        // Prevent the window from being closed by accident, keep it alive
        win.on('closed', () => {
             wallpaperWindows.delete(display.id);
        });

        wallpaperWindows.set(display.id, win);
    });
}

function createDashboardWindow() {
    if (dashboardWindow) {
        if (dashboardWindow.isMinimized()) {
            dashboardWindow.restore();
        }
        dashboardWindow.show();
        dashboardWindow.focus();
        
        // Also ensure all wallpaper windows are visible when dashboard is shown
        wallpaperWindows.forEach(win => {
            if (win && !win.isDestroyed()) {
                win.showInactive(); // Show without focusing
            }
        });
        return;
    }

    dashboardWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "Wallpaper Control Center",
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    dashboardWindow.loadFile(path.join(__dirname, 'dashboard.html'));

    // Changed: Don't destroy window on close, just hide it
    dashboardWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            dashboardWindow.hide();
        }
        return false;
    });
}

function createTray() {
    // Attempt to load 'tray-icon.png' from src directory or use empty
    // If you want a custom icon, place 'tray-icon.png' in the src folder.
    let icon = nativeImage.createEmpty();
    const customIconPath = path.join(__dirname, 'tray-icon.png');
    
    if (fs.existsSync(customIconPath)) {
        icon = nativeImage.createFromPath(customIconPath);
    } else {
        // Fallback: create an empty image needed for tray creation
        // We set a title so the user sees "WP" in the menu bar at least
        icon = nativeImage.createEmpty(); 
    }
    
    // Resize for macOS menu bar (usually 16x16 or 22x22)
    icon = icon.resize({ width: 16, height: 16 });

    tray = new Tray(icon);
    tray.setToolTip('Wallpaper Mac');
    
    // Set text label (Important if using empty icon)
    tray.setTitle('WP'); 

    const contextMenu = Menu.buildFromTemplate([
        { 
            label: '打开控制中心 (Open Control Center)', 
            click: () => {
                createDashboardWindow();
            } 
        },
        { type: 'separator' },
        { 
            label: '退出 (Quit)', 
            click: () => {
                app.isQuitting = true;
                app.quit();
            } 
        }
    ]);
    
    tray.setContextMenu(contextMenu);
    
    // Double click to open (mainly for Windows/Linux, macOS uses menu)
    tray.on('double-click', () => createDashboardWindow());
}

// --- IPC Handlers ---

ipcMain.handle('download-wallpaper', async (event, url) => {
    try {
        const controller = new AbortController();
        // Increase timeout to 30 seconds
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

        const buffer = await response.arrayBuffer();
        
        // Sanitize filename
        const urlObj = new URL(url);
        const basename = path.basename(urlObj.pathname);
        const safeBasename = basename.replace(/[^a-zA-Z0-9.-]/g, '_') || `download_${Date.now()}.jpg`;
        const filename = `${Date.now()}_${safeBasename}`;
        const destPath = path.join(wallpaperCacheDir, filename);

        fs.writeFileSync(destPath, Buffer.from(buffer));
        return destPath;
    } catch (error) {
        console.error('Download failed:', error);
        throw error;
    }
});


// Return list of connected displays to the dashboard
ipcMain.handle('get-displays', () => {
    return screen.getAllDisplays().map(d => ({
        id: d.id,
        label: d.label || `Display ${d.id}`, // label might be undefined on some OS permissions
        bounds: d.bounds
    }));
});

// Open File Dialog to pick image or video
ipcMain.handle('select-media', async (event, type) => {
    let filters = [];
    if (type === 'video') {
         filters = [{ name: 'Movies', extensions: ['mp4', 'webm', 'mkv', 'mov'] }];
    } else if (type === 'image') {
         filters = [{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'webp'] }];
    } else if (type === 'html') {
         filters = [{ name: 'HTML', extensions: ['html', 'htm'] }];
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: filters
    });

    if (canceled) {
        return null;
    } else {
        return filePaths[0];
    }
});

// Apply wallpaper to specific screen
ipcMain.on('set-wallpaper', (event, displayId, filePath, type) => {
    // Cache the resource (copy to userData)
    const cachedPath = cacheResource(filePath);

    // Save current
    appConfig.current[displayId] = { path: cachedPath, type };
    
    // Add to history (avoid duplicates at the top)
    const existingIndex = appConfig.history.findIndex(h => h.path === cachedPath);
    if (existingIndex > -1) {
        appConfig.history.splice(existingIndex, 1);
    }
    appConfig.history.unshift({ path: cachedPath, type, timestamp: Date.now() });
    // Limit history size
    if (appConfig.history.length > 50) appConfig.history.pop();
    
    saveConfig(appConfig);

    const win = wallpaperWindows.get(displayId);
    if (win) {
        win.webContents.send('update-wallpaper', `file://${cachedPath}`, type);
    }
});

ipcMain.handle('get-current-wallpapers', () => appConfig.current);
ipcMain.handle('get-history', () => appConfig.history);

ipcMain.handle('get-online-wallpapers', () => {
    try {
        const jsonPath = path.join(__dirname, 'online-wallpapers.json');
        if (fs.existsSync(jsonPath)) {
            return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        }
    } catch (e) {
        console.error("Failed to load online wallpapers", e);
    }
    return [];
});

ipcMain.handle('clear-history', () => {
    appConfig.history = [];
    saveConfig(appConfig);
    return true;
});

ipcMain.handle('delete-history-item', (event, filePath) => {
    appConfig.history = appConfig.history.filter(item => item.path !== filePath);
    saveConfig(appConfig);
    return appConfig.history;
});

app.whenReady().then(() => {
    createDashboardWindow();
    createWallpaperWindows();
    createTray(); // Initialize Tray Icon

    screen.on('display-added', createWallpaperWindows);
    screen.on('display-removed', createWallpaperWindows);
    screen.on('display-metrics-changed', createWallpaperWindows);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createDashboardWindow();
            createWallpaperWindows();
        } else if (!dashboardWindow) {
            createDashboardWindow();
        } else {
            dashboardWindow.show();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
}); 