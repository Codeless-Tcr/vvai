(function() {
    console.log('[WIDGET] Initializing Voice Agent Widget with Browser Speech API');
    
    // Configuration
    const WIDGET_API_URL = window.VOICE_AGENT_API_URL || 'http://localhost:8000/api';
    const TENANT_ID = window.VOICE_AGENT_TENANT_ID;
    const SIGNATURE = window.VOICE_AGENT_SIGNATURE;
    
    console.log('[WIDGET] Config:', { WIDGET_API_URL, TENANT_ID, SIGNATURE: SIGNATURE?.substring(0, 20) + '...' });
    
    if (!TENANT_ID || !SIGNATURE) {
        console.error('[WIDGET] Missing tenant credentials');
        return;
    }
    
    // Check browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.error('[WIDGET] Browser does not support Speech Recognition');
        return;
    }
    
    if (!('speechSynthesis' in window)) {
        console.error('[WIDGET] Browser does not support Speech Synthesis');
        return;
    }
    
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
    
    // Widget logic with browser speech APIs
    let isActive = false, isListening = false, isSpeaking = false;
    let recognition = null, sessionId = null, config = null;
    
    const avatar = document.getElementById('voice-agent-avatar');
    let statusIndicator = avatar.querySelector('.va-status');
    
    // Initialize Speech Recognition
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
        processTextQuery(transcript);
    };
    
    recognition.onerror = (event) => {
        console.error('[WIDGET] Speech recognition error:', event.error);
        isListening = false;
        avatar.classList.remove('listening');
        statusIndicator.classList.remove('listening');
    };
    
    async function loadConfig() {
        try {
            console.log('[WIDGET] Fetching config from:', `${WIDGET_API_URL}/config`);
            
            // Try with headers first
            let res = await fetch(`${WIDGET_API_URL}/config`, {
                headers: {
                    'X-Tenant-ID': TENANT_ID,
                    'X-Signature': SIGNATURE
                }
            });
            
            // If headers fail (CORS), try with query parameters
            if (!res.ok && res.status === 401) {
                console.log('[WIDGET] Headers failed, trying query parameters');
                res = await fetch(`${WIDGET_API_URL}/config?tenant_id=${TENANT_ID}&signature=${SIGNATURE}`);
            }
            
            console.log('[WIDGET] Config response status:', res.status);
            if (!res.ok) {
                const errorText = await res.text();
                console.error('[WIDGET] Config error:', errorText);
                return;
            }
            config = await res.json();
            console.log('[WIDGET] Config loaded:', config);
            if (config.avatar_url) {
                avatar.innerHTML = `<img src="${config.avatar_url}" alt="AI"><div class="va-status"></div>`;
                statusIndicator = avatar.querySelector('.va-status');
            }
            if (config.brand_colors?.primary) avatar.style.background = config.brand_colors.primary;
        } catch (e) { console.error('[WIDGET] Config load failed:', e); }
    }
    
    function playIntroduction() {
        if (!config?.introduction_script) {
            console.log('[WIDGET] No introduction script, starting listening');
            startListening();
            return;
        }
        
        console.log('[WIDGET] Playing introduction with browser TTS');
        const utterance = new SpeechSynthesisUtterance(config.introduction_script);
        
        // Set voice based on config
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
            const femaleVoices = voices.filter(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('hazel'));
            const maleVoices = voices.filter(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('mark'));
            
            if (config.voice_model === 'nova' || config.voice_model === 'shimmer') {
                utterance.voice = femaleVoices[0] || voices[0];
            } else {
                utterance.voice = maleVoices[0] || voices[1] || voices[0];
            }
        }
        
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        
        utterance.onstart = () => {
            console.log('[WIDGET] Introduction TTS started');
            isSpeaking = true;
            avatar.classList.add('speaking');
        };
        
        utterance.onend = () => {
            console.log('[WIDGET] Introduction TTS ended');
            isSpeaking = false;
            avatar.classList.remove('speaking');
            startListening();
        };
        
        utterance.onerror = (e) => {
            console.error('[WIDGET] Introduction TTS error:', e);
            isSpeaking = false;
            avatar.classList.remove('speaking');
            startListening();
        };
        
        speechSynthesis.speak(utterance);
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
    
    async function processTextQuery(transcript) {
        try {
            console.log('[WIDGET] Processing text query:', transcript);
            
            // Try with headers first
            let res = await fetch(`${WIDGET_API_URL}/text-query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-ID': TENANT_ID,
                    'X-Signature': SIGNATURE
                },
                body: JSON.stringify({
                    query: transcript,
                    session_id: sessionId
                })
            });
            
            // If headers fail (CORS), try with query parameters
            if (!res.ok && res.status === 401) {
                console.log('[WIDGET] Headers failed, trying query parameters');
                res = await fetch(`${WIDGET_API_URL}/text-query?tenant_id=${TENANT_ID}&signature=${SIGNATURE}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        query: transcript,
                        session_id: sessionId
                    })
                });
            }
            
            console.log('[WIDGET] Text query response status:', res.status);
            if (!res.ok) {
                const errorText = await res.text();
                console.error('[WIDGET] Text query error:', errorText);
                speakResponse('Sorry, I encountered an error. Please try again.');
                return;
            }
            
            const data = await res.json();
            console.log('[WIDGET] Response received:', data);
            
            sessionId = data.session_id;
            
            if (data.response) {
                speakResponse(data.response);
            }
            
        } catch (e) {
            console.error('[WIDGET] Text query failed:', e);
            speakResponse('Sorry, I encountered a connection error. Please try again.');
            if (isActive) {
                setTimeout(startListening, 1000);
            }
        }
    }
    
    function speakResponse(text) {
        console.log('[WIDGET] Speaking response with browser TTS:', text.substring(0, 100) + '...');
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Set voice based on config
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0 && config) {
            const femaleVoices = voices.filter(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('hazel'));
            const maleVoices = voices.filter(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('mark'));
            
            if (config.voice_model === 'nova' || config.voice_model === 'shimmer') {
                utterance.voice = femaleVoices[0] || voices[0];
            } else {
                utterance.voice = maleVoices[0] || voices[1] || voices[0];
            }
        }
        
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        
        utterance.onstart = () => {
            console.log('[WIDGET] Response TTS started');
            isSpeaking = true;
            avatar.classList.add('speaking');
        };
        
        utterance.onend = () => {
            console.log('[WIDGET] Response TTS ended');
            isSpeaking = false;
            avatar.classList.remove('speaking');
            if (isActive) {
                setTimeout(startListening, 1000);
            }
        };
        
        utterance.onerror = (e) => {
            console.error('[WIDGET] Response TTS error:', e);
            isSpeaking = false;
            avatar.classList.remove('speaking');
            if (isActive) {
                setTimeout(startListening, 1000);
            }
        };
        
        speechSynthesis.speak(utterance);
    }
    
    avatar.addEventListener('click', () => {
        if (isActive) {
            console.log('[WIDGET] Deactivating voice assistant');
            isActive = false;
            if (isListening) {
                recognition.stop();
            }
            if (isSpeaking) {
                speechSynthesis.cancel();
            }
            isSpeaking = false;
            avatar.classList.remove('listening', 'speaking');
            statusIndicator.classList.remove('listening');
        } else {
            console.log('[WIDGET] Activating voice assistant');
            isActive = true;
            sessionId = null;
            
            // Load voices if not loaded yet
            if (speechSynthesis.getVoices().length === 0) {
                speechSynthesis.addEventListener('voiceschanged', () => {
                    playIntroduction();
                }, { once: true });
            } else {
                playIntroduction();
            }
        }
    });
    
    loadConfig();
})();
