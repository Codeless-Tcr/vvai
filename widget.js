(function() {
    console.log('[WIDGET] Initializing Voice Agent Widget with OpenAI TTS');
    
    const WIDGET_API_URL = window.VOICE_AGENT_API_URL || 'http://localhost:8000/api';
    const TENANT_ID = window.VOICE_AGENT_TENANT_ID;
    const SIGNATURE = window.VOICE_AGENT_SIGNATURE;
    
    console.log('[WIDGET] Config:', { WIDGET_API_URL, TENANT_ID });
    
    if (!TENANT_ID || !SIGNATURE) {
        console.error('[WIDGET] Missing tenant credentials');
        return;
    }
    
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.error('[WIDGET] Browser does not support Speech Recognition');
        return;
    }
    
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'voice-agent-root';
    document.body.appendChild(widgetContainer);
    
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
    
    widgetContainer.innerHTML = `
        <div id="voice-agent-avatar">
            <span class="va-icon">🤖</span>
            <div class="va-status"></div>
        </div>
    `;
    
    let isActive = false, isListening = false, isSpeaking = false;
    let recognition = null, sessionId = null, config = null, currentAudio = null;
    
    const avatar = document.getElementById('voice-agent-avatar');
    let statusIndicator = avatar.querySelector('.va-status');
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
        console.log('[WIDGET] Speech recognition started');
        isListening = true;
        avatar.classList.add('listening');
        statusIndicator.classList.add('listening');
    };
    
    recognition.onend = () => {
        console.log('[WIDGET] Speech recognition ended');
        isListening = false;
        avatar.classList.remove('listening');
        statusIndicator.classList.remove('listening');
    };
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('[WIDGET] Speech recognized:', transcript);
        processVoiceQuery(transcript);
    };
    
    recognition.onerror = (event) => {
        console.error('[WIDGET] Speech recognition error:', event.error);
        isListening = false;
        avatar.classList.remove('listening');
        statusIndicator.classList.remove('listening');
    };
    
    async function loadConfig() {
        try {
            const res = await fetch(`${WIDGET_API_URL}/config`, {
                headers: {
                    'X-Tenant-ID': TENANT_ID,
                    'X-Signature': SIGNATURE
                }
            });
            
            if (!res.ok) throw new Error('Config load failed');
            
            config = await res.json();
            console.log('[WIDGET] Config loaded:', config);
            
            if (config.avatar_url) {
                avatar.innerHTML = `<img src="${config.avatar_url}" alt="AI"><div class="va-status"></div>`;
                statusIndicator = avatar.querySelector('.va-status');
            }
            if (config.brand_colors?.primary) avatar.style.background = config.brand_colors.primary;
        } catch (e) {
            console.error('[WIDGET] Config load failed:', e);
        }
    }
    
    async function playIntroduction() {
        try {
            console.log('[WIDGET] Fetching introduction audio from Google Cloud TTS');
            
            const res = await fetch(`${WIDGET_API_URL}/introduction`, {
                headers: {
                    'X-Tenant-ID': TENANT_ID,
                    'X-Signature': SIGNATURE
                }
            });
            
            const contentType = res.headers.get('content-type');
            
            if (contentType && contentType.includes('audio')) {
                const blob = await res.blob();
                if (blob.size > 0) {
                    playAudio(blob, () => startListening());
                    return;
                }
            }
            
            // Fallback to browser TTS
            const data = await res.json();
            if (data.text && config?.browser_voice_name) {
                playBrowserTTS(data.text, () => startListening());
                return;
            }
            
            startListening();
        } catch (e) {
            console.error('[WIDGET] Introduction failed:', e);
            startListening();
        }
    }
    
    function playAudio(blob, onComplete) {
        const audioUrl = URL.createObjectURL(blob);
        currentAudio = new Audio(audioUrl);
        
        currentAudio.onplay = () => {
            isSpeaking = true;
            avatar.classList.add('speaking');
        };
        
        currentAudio.onended = () => {
            isSpeaking = false;
            avatar.classList.remove('speaking');
            URL.revokeObjectURL(audioUrl);
            if (onComplete) onComplete();
        };
        
        currentAudio.onerror = () => {
            console.error('[WIDGET] Audio playback error');
            isSpeaking = false;
            avatar.classList.remove('speaking');
            URL.revokeObjectURL(audioUrl);
            if (onComplete) onComplete();
        };
        
        currentAudio.play();
    }
    
    function startListening() {
        if (isListening || !isActive) return;
        
        try {
            console.log('[WIDGET] Starting speech recognition');
            recognition.start();
        } catch (e) {
            console.error('[WIDGET] Speech recognition start failed:', e);
        }
    }
    
    async function processVoiceQuery(transcript) {
        try {
            console.log('[WIDGET] Processing voice query:', transcript);
            
            const formData = new FormData();
            formData.append('transcript', transcript);
            if (sessionId) formData.append('session_id', sessionId);
            
            const res = await fetch(`${WIDGET_API_URL}/voice-query`, {
                method: 'POST',
                headers: {
                    'X-Tenant-ID': TENANT_ID,
                    'X-Signature': SIGNATURE
                },
                body: formData
            });
            
            if (!res.ok) throw new Error('Voice query failed');
            
            sessionId = res.headers.get('X-Session-ID') || sessionId;
            
            const contentType = res.headers.get('content-type');
            
            if (contentType && contentType.includes('audio')) {
                const blob = await res.blob();
                if (blob.size > 0) {
                    playAudio(blob, () => {
                        if (isActive) setTimeout(startListening, 1000);
                    });
                    return;
                }
            }
            
            // Fallback to browser TTS
            const data = await res.json();
            console.log('[WIDGET] Text response:', data.response);
            
            if (data.response && config?.browser_voice_name) {
                playBrowserTTS(data.response, () => {
                    if (isActive) setTimeout(startListening, 1000);
                });
                return;
            }
            
            if (isActive) setTimeout(startListening, 1000);
            
        } catch (e) {
            console.error('[WIDGET] Voice query failed:', e);
            if (isActive) setTimeout(startListening, 1000);
        }
    }
    
    function playBrowserTTS(text, onComplete) {
        if (!('speechSynthesis' in window)) {
            console.warn('[WIDGET] Browser TTS not supported');
            if (onComplete) onComplete();
            return;
        }
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        if (config?.browser_voice_name) {
            const voices = speechSynthesis.getVoices();
            const voice = voices.find(v => v.name === config.browser_voice_name);
            if (voice) utterance.voice = voice;
        }
        
        utterance.onstart = () => {
            isSpeaking = true;
            avatar.classList.add('speaking');
        };
        
        utterance.onend = () => {
            isSpeaking = false;
            avatar.classList.remove('speaking');
            if (onComplete) onComplete();
        };
        
        utterance.onerror = () => {
            isSpeaking = false;
            avatar.classList.remove('speaking');
            if (onComplete) onComplete();
        };
        
        speechSynthesis.speak(utterance);
    }
    
    avatar.addEventListener('click', () => {
        if (isActive) {
            console.log('[WIDGET] Deactivating voice assistant');
            isActive = false;
            if (isListening) recognition.stop();
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
            }
            isSpeaking = false;
            avatar.classList.remove('listening', 'speaking');
            statusIndicator.classList.remove('listening');
        } else {
            console.log('[WIDGET] Activating voice assistant');
            isActive = true;
            sessionId = null;
            playIntroduction();
        }
    });
    
    loadConfig();
})();
