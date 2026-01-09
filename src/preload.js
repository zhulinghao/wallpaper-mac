const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // For Dashboard
    getDisplays: () => ipcRenderer.invoke('get-displays'),
    selectMedia: (type) => ipcRenderer.invoke('select-media', type),
    setWallpaper: (displayId, filePath, type) => ipcRenderer.send('set-wallpaper', displayId, filePath, type),
    getHistory: () => ipcRenderer.invoke('get-history'),
    clearHistory: () => ipcRenderer.invoke('clear-history'),
    deleteHistoryItem: (filePath) => ipcRenderer.invoke('delete-history-item', filePath),
    getCurrentWallpapers: () => ipcRenderer.invoke('get-current-wallpapers'),
    
    // Online Gallery
    getOnlineWallpapers: () => ipcRenderer.invoke('get-online-wallpapers'),
    downloadWallpaper: (url) => ipcRenderer.invoke('download-wallpaper', url),

    // For Wallpaper Window
    onWallpaperUpdate: (callback) => ipcRenderer.on('update-wallpaper', (_event, source, type) => callback(source, type))
});