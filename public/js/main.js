import { initializeUI } from './ui.js';

// Load widget script and initialize UI
const scriptUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:9000/widget.js' 
    : '/widget.js';

// Load widget script
const script = document.createElement('script');
script.type = 'text/javascript';
script.onload = function() {
    console.log('Widget script loaded successfully');
    initializeUI();
};
script.onerror = function() {
    console.error('Failed to load script:', scriptUrl);
    console.log('Trying fallback...');
    if (window.location.hostname === 'localhost') {
        loadFallbackScript('http://localhost:9000/widget.js');
    } else {
        loadFallbackScript('/widget.js');
    }
};
script.src = scriptUrl;
document.head.appendChild(script);

function loadFallbackScript(url) {
    const fallbackScript = document.createElement('script');
    fallbackScript.type = 'text/javascript';
    fallbackScript.onload = function() {
        console.log('Widget script loaded successfully from fallback');
        initializeUI();
    };
    fallbackScript.onerror = function() {
        console.error('Failed to load fallback script');
    };
    fallbackScript.src = url;
    document.head.appendChild(fallbackScript);
}

// Initialize widgets on page load
window.addEventListener('load', () => {
    const docWidget = document.getElementById('doc-widget');
    const demoWidget = document.getElementById('demo-widget');
    
    if (docWidget && demoWidget) {
        console.log('Agent-enabled widgets loaded');
    } else {
        console.log('Agent-enabled widgets failed to load');
    }
});
