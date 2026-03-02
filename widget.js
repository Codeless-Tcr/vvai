(function() {
    // Configuration
    const WIDGET_API_URL = window.VOICE_AGENT_API_URL || 'http://localhost:8001/api';
    
    // Create widget container
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'voice-agent-root';
    document.body.appendChild(widgetContainer);
    
    // Inject styles
    const styles = document.createElement('style');
    styles.textContent = `
        #voice-agent-root { position: fixed; bottom: 20px; right: 20px; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        #voice-agent-avatar { width: 70px; height: 70px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); cursor: pointer; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); display: flex; align-items: center; justify-content: center; transition: transform 0.3s ease; overflow: hidden; position: relative; }
        #voice-agent-avatar:hover { transform: scale(1.1); }
        #voice-agent-avatar.listening { animation: va-pulse 1.5s infinite; }
        #voice-agent-avatar.speaking { animation: va-speak 0.8s infinite; }
        #voice-agent-avatar img { width: 100%; height: 100%; object-fit: cover; }
        #voice-agent-avatar .va-icon { font-size: 35px; color: white; }
        .va-status { position: absolute; bottom: 5px; right: 5px; width: 15px; height: 15px; border-radius: 50%; background: #10b981; border: 2px solid white; }
        .va-status.listening { background: #ef4444; animation: va-blink 1s infinite; }
        @keyframes va-pulse { 0%, 100% { box-shadow: 0 4px 20px rgba(102, 126, 234, 0.5); } 50% { box-shadow: 0 4px 40px rgba(102, 126, 234, 0.9); } }
        @keyframes va-speak { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes va-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @media (max-width: 768px) { #voice-agent-root { bottom: 15px; right: 15px; } #voice-agent-avatar { width: 60px; height: 60px; } }
    `;
    document.head.appendChild(styles);
    
    // Create widget HTML
    widgetContainer.innerHTML = `
        <div id="voice-agent-avatar">
            <span class="va-icon">🤖</span>
            <div class="va-status"></div>
        </div>
    `;
    
    // Widget logic
    let isActive = false, isListening = false, isSpeaking = false;
    let mediaRecorder = null, audioChunks = [], sessionId = null, currentAudio = null;
    
    const avatar = document.getElementById('voice-agent-avatar');
    const statusIndicator = avatar.querySelector('.va-status');
    
    async function loadConfig() {
        try {
            const res = await fetch(`${WIDGET_API_URL}/config`);
            const config = await res.json();
            if (config.avatar_url) avatar.innerHTML = `<img src="${config.avatar_url}" alt="AI"><div class="va-status"></div>`;
            if (config.brand_colors?.primary) avatar.style.background = config.brand_colors.primary;
        } catch (e) { console.error('Config load failed:', e); }
    }
    
    async function playIntroduction() {
        try {
            const res = await fetch(`${WIDGET_API_URL}/introduction`);
            if (!res.ok) throw new Error('Failed to fetch intro');
            const blob = await res.blob();
            if (!blob || blob.size === 0) {
                console.warn('No audio available, skipping intro');
                startListening();
                return;
            }
            const audioUrl = URL.createObjectURL(blob);
            currentAudio = new Audio(audioUrl);
            currentAudio.onerror = () => { console.error('Audio playback error'); URL.revokeObjectURL(audioUrl); startListening(); };
            currentAudio.onended = () => { isSpeaking = false; avatar.classList.remove('speaking'); URL.revokeObjectURL(audioUrl); startListening(); };
            isSpeaking = true;
            avatar.classList.add('speaking');
            await currentAudio.play();
        } catch (e) { console.error('Intro failed:', e); startListening(); }
    }
    
    async function startListening() {
        if (isListening) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunks = [];
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                await processVoiceQuery(new Blob(audioChunks, { type: 'audio/webm' }));
                stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorder.start();
            isListening = true;
            avatar.classList.add('listening');
            statusIndicator.classList.add('listening');
            setTimeout(() => { if (isListening) stopListening(); }, 10000);
        } catch (e) { console.error('Mic access denied:', e); }
    }
    
    function stopListening() {
        if (mediaRecorder && isListening) {
            mediaRecorder.stop();
            isListening = false;
            avatar.classList.remove('listening');
            statusIndicator.classList.remove('listening');
        }
    }
    
    async function processVoiceQuery(blob) {
        try {
            const fd = new FormData();
            fd.append('audio', blob, 'query.webm');
            if (sessionId) fd.append('session_id', sessionId);
            const res = await fetch(`${WIDGET_API_URL}/voice-query`, { method: 'POST', body: fd });
            if (!res.ok) throw new Error('Query failed');
            sessionId = res.headers.get('X-Session-ID');
            const responseBlob = await res.blob();
            if (!responseBlob || responseBlob.size === 0) {
                console.warn('No audio response available');
                if (isActive) startListening();
                return;
            }
            const audioUrl = URL.createObjectURL(responseBlob);
            currentAudio = new Audio(audioUrl);
            currentAudio.onerror = () => { console.error('Audio playback error'); URL.revokeObjectURL(audioUrl); if (isActive) startListening(); };
            currentAudio.onended = () => { isSpeaking = false; avatar.classList.remove('speaking'); URL.revokeObjectURL(audioUrl); if (isActive) startListening(); };
            isSpeaking = true;
            avatar.classList.add('speaking');
            await currentAudio.play();
        } catch (e) { console.error('Query failed:', e); if (isActive) startListening(); }
    }
    
    avatar.addEventListener('click', () => {
        if (isActive) {
            isActive = false;
            if (isListening) stopListening();
            if (currentAudio) { currentAudio.pause(); currentAudio = null; }
            isSpeaking = false;
            avatar.classList.remove('listening', 'speaking');
            statusIndicator.classList.remove('listening');
        } else {
            isActive = true;
            sessionId = null;
            playIntroduction();
        }
    });
    
    loadConfig();
})();
