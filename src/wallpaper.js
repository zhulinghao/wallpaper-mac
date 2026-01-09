const imgEl = document.getElementById('wallpaper-img');
const vidEl = document.getElementById('wallpaper-vid');
const frameEl = document.getElementById('wallpaper-frame');
const defaultEl = document.getElementById('default-content');

window.electronAPI.onWallpaperUpdate((source, type) => {
    // Hide default content
    defaultEl.style.display = 'none';

    // Reset all
    imgEl.style.display = 'none';
    vidEl.style.display = 'none';
    frameEl.style.display = 'none';
    vidEl.pause();
    vidEl.src = '';
    imgEl.src = '';
    frameEl.src = 'about:blank'; // Clear iframe

    if (type === 'image') {
        imgEl.src = source;
        imgEl.style.display = 'block';
    } else if (type === 'video') {
        vidEl.src = source;
        vidEl.style.display = 'block';
        vidEl.play().catch(e => console.error("Autoplay failed:", e));
    } else if (type === 'html') {
        frameEl.src = source;
        frameEl.style.display = 'block';
    }
});