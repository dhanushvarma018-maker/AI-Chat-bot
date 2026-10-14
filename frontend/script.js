/**
 * ==========================================================================
 * Gemini AI Chatbot - Frontend Logic & Streaming Controller
 * ==========================================================================
 */

// Configuration & Default State
const CONFIG = {
  DEFAULT_BACKEND_URL: (window.location.protocol.startsWith('http') && window.location.port === '3001')
    ? window.location.origin
    : 'http://localhost:3001',
  STORAGE_KEYS: {
    API_KEY: 'gemini_custom_api_key',
    BACKEND_URL: 'gemini_backend_url',
    SUPABASE_URL: 'gemini_supabase_url',
    SUPABASE_KEY: 'gemini_supabase_anon_key',
    CURRENT_CONVERSATION_ID: 'gemini_current_conv_id',
    SYSTEM_PROMPT: 'gemini_system_prompt',
    ACTIVE_MODEL: 'gemini_active_model',
    ACTIVE_PERSONA: 'gemini_active_persona',
    CHAT_HISTORY: 'gemini_chat_history'
  },
  PERSONAS: {
    default: 'You are a helpful, brilliant, and friendly AI assistant powered by Google Gemini. Use clear formatting, markdown, and code blocks where helpful.',
    coder: 'You are a world-class principal software engineer. Provide high-quality, production-ready, clean, and idiomatic code with clear explanations and best practices.',
    creative: 'You are an imaginative, creative writer and conceptual thinker. Use vivid imagery, engaging narrative voice, and innovative perspectives.',
    concise: 'You are an ultra-concise assistant. Give immediate, punchy, high-density answers without conversational filler or boilerplate.',
    academic: 'You are a patient, rigorous academic tutor. Explain concepts from first principles, illustrate with analogies, and break down complex problems step by step.'
  }
};

class GeminiChatApp {
  constructor() {
    this.messages = [];
    this.abortController = null;
    this.isStreaming = false;
    this.currentConversationId = null;
    this.supabaseClient = null;

    // Cache DOM Elements
    this.dom = {
      // Header & Status
      backendStatusPill: document.getElementById('backend-status-pill'),
      backendStatusText: document.getElementById('backend-status-text'),
      dbStatusPill: document.getElementById('db-status-pill'),
      dbStatusText: document.getElementById('db-status-text'),
      modelSelect: document.getElementById('model-select'),
      personaSelect: document.getElementById('persona-select'),
      versionBadge: document.getElementById('version-badge'),
      activeModelName: document.getElementById('active-model-name'),
      openSettingsBtn: document.getElementById('open-settings-btn'),
      clearChatBtn: document.getElementById('clear-chat-btn'),
      
      // Main Chat Body
      apiBanner: document.getElementById('api-banner'),
      bannerSettingsBtn: document.getElementById('banner-settings-btn'),
      welcomeHero: document.getElementById('welcome-hero'),
      promptGrid: document.getElementById('prompt-grid'),
      messagesContainer: document.getElementById('messages-container'),
      typingIndicator: document.getElementById('typing-indicator'),
      typingLabel: document.getElementById('typing-label'),
      chatMain: document.getElementById('chat-main'),

      // Footer Input Bar
      chatForm: document.getElementById('chat-form'),
      userInput: document.getElementById('user-input'),
      sendBtn: document.getElementById('send-btn'),
      stopGenerationBtn: document.getElementById('stop-generation-btn'),

      // Settings Modal
      modalBackdrop: document.getElementById('modal-backdrop'),
      closeModalBtn: document.getElementById('close-modal-btn'),
      cancelSettingsBtn: document.getElementById('cancel-settings-btn'),
      saveSettingsBtn: document.getElementById('save-settings-btn'),
      settingsApiKey: document.getElementById('settings-api-key'),
      settingsBackendUrl: document.getElementById('settings-backend-url'),
      settingsSupabaseUrl: document.getElementById('settings-supabase-url'),
      settingsSupabaseKey: document.getElementById('settings-supabase-key'),
      settingsSystemPrompt: document.getElementById('settings-system-prompt'),
      toggleKeyVisibility: document.getElementById('toggle-key-visibility')
    };

    this.init();
  }

  /**
   * Initialize state, settings, event listeners and check backend connection
   */
  async init() {
    this.loadSavedPreferences();
    this.bindEvents();
    this.renderSavedMessages();
    await this.fetchBackendConfig();
    await this.checkBackendStatus();
  }

  // ------------------------------------------------------------------------
  // State & Persistence
  // ------------------------------------------------------------------------

  loadSavedPreferences() {
    const savedBackendUrl = localStorage.getItem(CONFIG.STORAGE_KEYS.BACKEND_URL) || CONFIG.DEFAULT_BACKEND_URL;
    const savedApiKey = localStorage.getItem(CONFIG.STORAGE_KEYS.API_KEY) || '';
    const savedSupabaseUrl = localStorage.getItem(CONFIG.STORAGE_KEYS.SUPABASE_URL) || '';
    const savedSupabaseKey = localStorage.getItem(CONFIG.STORAGE_KEYS.SUPABASE_KEY) || '';
    const savedModel = localStorage.getItem(CONFIG.STORAGE_KEYS.ACTIVE_MODEL) || 'gemini-2.5-flash';
    const savedPersona = localStorage.getItem(CONFIG.STORAGE_KEYS.ACTIVE_PERSONA) || 'default';
    const savedSystemPrompt = localStorage.getItem(CONFIG.STORAGE_KEYS.SYSTEM_PROMPT) || '';
    const savedConvId = localStorage.getItem(CONFIG.STORAGE_KEYS.CURRENT_CONVERSATION_ID) || null;

    this.backendUrl = savedBackendUrl.replace(/\/+$/, '');
    this.apiKey = savedApiKey;
    this.supabaseUrl = savedSupabaseUrl;
    this.supabaseKey = savedSupabaseKey;
    this.currentConversationId = savedConvId;

    this.dom.settingsBackendUrl.value = this.backendUrl;
    this.dom.settingsApiKey.value = this.apiKey;
    if (this.dom.settingsSupabaseUrl) this.dom.settingsSupabaseUrl.value = this.supabaseUrl;
    if (this.dom.settingsSupabaseKey) this.dom.settingsSupabaseKey.value = this.supabaseKey;
    this.dom.settingsSystemPrompt.value = savedSystemPrompt;

    if (this.dom.modelSelect) {
      this.dom.modelSelect.value = savedModel;
      this.updateActiveModelBadge(savedModel);
    }
    if (this.dom.personaSelect) {
      this.dom.personaSelect.value = savedPersona;
    }

    try {
      const historyStr = localStorage.getItem(CONFIG.STORAGE_KEYS.CHAT_HISTORY);
      this.messages = historyStr ? JSON.parse(historyStr) : [];
    } catch (e) {
      this.messages = [];
    }
  }

  saveMessagesToStorage() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(this.messages));
    } catch (e) {
      console.warn('Unable to persist chat history to localStorage:', e);
    }
  }

  // ------------------------------------------------------------------------
  // Event Listeners
  // ------------------------------------------------------------------------

  bindEvents() {
    // Form submit & Enter handling
    this.dom.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleUserSubmit();
    });

    this.dom.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleUserSubmit();
      }
    });

    // Auto-expand textarea height
    this.dom.userInput.addEventListener('input', () => {
      this.adjustTextareaHeight();
    });

    // Stop generation
    this.dom.stopGenerationBtn.addEventListener('click', () => {
      this.stopGeneration();
    });

    // Quick starter prompt cards
    this.dom.promptGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.prompt-card');
      if (card && card.dataset.prompt) {
        this.dom.userInput.value = card.dataset.prompt;
        this.handleUserSubmit();
      }
    });

    // Clear chat
    this.dom.clearChatBtn.addEventListener('click', () => {
      if (this.messages.length === 0) return;
      if (confirm('Clear current conversation and start fresh?')) {
        this.clearChat();
      }
    });

    // Model select change
    this.dom.modelSelect.addEventListener('change', (e) => {
      const selectedModel = e.target.value;
      localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_MODEL, selectedModel);
      this.updateActiveModelBadge(selectedModel);
    });

    // Persona select change
    this.dom.personaSelect.addEventListener('change', (e) => {
      localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_PERSONA, e.target.value);
    });

    // Settings Modal
    this.dom.openSettingsBtn.addEventListener('click', () => this.openSettingsModal());
    this.dom.bannerSettingsBtn.addEventListener('click', () => this.openSettingsModal());
    this.dom.closeModalBtn.addEventListener('click', () => this.closeSettingsModal());
    this.dom.cancelSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
    this.dom.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.dom.modalBackdrop) this.closeSettingsModal();
    });
    this.dom.saveSettingsBtn.addEventListener('click', () => this.saveSettings());

    // Toggle API key visibility in settings
    this.dom.toggleKeyVisibility.addEventListener('click', () => {
      const type = this.dom.settingsApiKey.type === 'password' ? 'text' : 'password';
      this.dom.settingsApiKey.type = type;
      this.dom.toggleKeyVisibility.textContent = type === 'password' ? '👁️' : '🔒';
    });
  }

  adjustTextareaHeight() {
    const el = this.dom.userInput;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }

  updateActiveModelBadge(modelId) {
    const cleanName = modelId.replace('gemini-', '').replace('-', ' ').toUpperCase();
    if (this.dom.versionBadge) this.dom.versionBadge.textContent = cleanName;
    if (this.dom.activeModelName) this.dom.activeModelName.textContent = `Gemini ${cleanName}`;
  }

  // ------------------------------------------------------------------------
  // Backend & Supabase Status Check
  // ------------------------------------------------------------------------

  async fetchBackendConfig() {
    try {
      const res = await fetch(`${this.backendUrl}/api/config`);
      if (res.ok) {
        const config = await res.json();
        // If frontend doesn't have supabase credentials yet, adopt from backend
        if (!this.supabaseUrl && config.supabaseUrl) {
          this.supabaseUrl = config.supabaseUrl;
          if (this.dom.settingsSupabaseUrl) this.dom.settingsSupabaseUrl.value = this.supabaseUrl;
        }
        if (!this.supabaseKey && config.supabaseAnonKey) {
          this.supabaseKey = config.supabaseAnonKey;
          if (this.dom.settingsSupabaseKey) this.dom.settingsSupabaseKey.value = this.supabaseKey;
        }
        this.initSupabaseClient();
      }
    } catch (e) {
      // Backend might be offline during initial boot
    }
  }

  initSupabaseClient() {
    if (window.supabase && this.supabaseUrl && this.supabaseKey && !this.supabaseUrl.includes('placeholder')) {
      try {
        this.supabaseClient = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
        this.updateDbStatusPill('online', 'DB: Connected');
      } catch (err) {
        console.warn('Supabase client error:', err);
        this.updateDbStatusPill('warning', 'DB: Error');
      }
    } else {
      this.updateDbStatusPill('warning', 'DB: Not Set');
    }
  }

  async checkBackendStatus() {
    this.updateStatusPill('checking', 'Connecting...');
    try {
      const headers = {};
      if (this.apiKey) {
        headers['x-gemini-api-key'] = this.apiKey;
      }

      const res = await fetch(`${this.backendUrl}/api/status`, {
        method: 'GET',
        headers
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const hasKey = data.apiKeyConfigured || Boolean(this.apiKey);

      if (hasKey) {
        this.updateStatusPill('online', 'Connected');
        this.dom.apiBanner.classList.add('hidden');
      } else {
        this.updateStatusPill('warning', 'Missing API Key');
        this.dom.apiBanner.classList.remove('hidden');
      }

      // Update Supabase DB Pill
      if (data.supabaseConfigured || this.supabaseClient) {
        this.updateDbStatusPill('online', 'DB: Connected');
      } else {
        this.updateDbStatusPill('warning', 'DB: Not Set');
      }

      // Load models dynamically
      this.fetchModelsList();
    } catch (err) {
      console.warn('Failed to reach backend:', err);
      this.updateStatusPill('offline', 'Backend Offline');
      this.updateDbStatusPill('offline', 'DB: Offline');
    }
  }

  async fetchModelsList() {
    try {
      const res = await fetch(`${this.backendUrl}/api/models`);
      if (res.ok) {
        const data = await res.json();
        if (data.models && Array.isArray(data.models)) {
          const currentVal = this.dom.modelSelect.value;
          this.dom.modelSelect.innerHTML = '';
          data.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name + (m.recommended ? ' (Recommended)' : '');
            if (m.id === currentVal) opt.selected = true;
            this.dom.modelSelect.appendChild(opt);
          });
        }
      }
    } catch (e) {
      // Keep existing fallback models in html
    }
  }

  updateStatusPill(state, text) {
    const pill = this.dom.backendStatusPill;
    pill.className = `status-pill ${state}`;
    this.dom.backendStatusText.textContent = text;
  }

  updateDbStatusPill(state, text) {
    if (!this.dom.dbStatusPill) return;
    this.dom.dbStatusPill.className = `status-pill ${state}`;
    if (this.dom.dbStatusText) this.dom.dbStatusText.textContent = text;
  }

  // ------------------------------------------------------------------------
  // Chat Messaging & Streaming
  // ------------------------------------------------------------------------

  handleUserSubmit() {
    if (this.isStreaming) return;

    const messageText = this.dom.userInput.value.trim();
    if (!messageText) return;

    // Reset textarea
    this.dom.userInput.value = '';
    this.adjustTextareaHeight();

    // Hide welcome hero if visible
    this.dom.welcomeHero.classList.add('hidden');

    // Append user message
    this.appendMessage('user', messageText);

    // Call Gemini API
    this.sendToGemini(messageText);
  }

  appendMessage(role, content) {
    this.messages.push({ role, content });
    this.saveMessagesToStorage();
    this.renderMessageElement(role, content);
    this.scrollToBottom();
  }

  renderSavedMessages() {
    if (this.messages.length === 0) {
      this.dom.welcomeHero.classList.remove('hidden');
      return;
    }

    this.dom.welcomeHero.classList.add('hidden');
    this.messages.forEach(msg => {
      this.renderMessageElement(msg.role, msg.content);
    });
    this.scrollToBottom();
  }

  renderMessageElement(role, content) {
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    if (role === 'user') {
      row.innerHTML = `
        <div class="message-content-wrapper">
          <div class="message-bubble">${this.escapeHtml(content)}</div>
        </div>
        <div class="user-avatar-icon" title="You">You</div>
      `;
    } else {
      const formattedHtml = this.parseMarkdown(content);
      row.innerHTML = `
        <div class="message-avatar">
          <img src="assets/avatar.jpg" alt="Gemini">
        </div>
        <div class="message-content-wrapper">
          <div class="message-bubble">${formattedHtml}</div>
          <div class="message-toolbar">
            <button type="button" class="msg-action-btn copy-msg-btn" title="Copy response">
              📋 <span>Copy</span>
            </button>
          </div>
        </div>
      `;

      // Attach copy button action
      const copyBtn = row.querySelector('.copy-msg-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(content).then(() => {
            copyBtn.innerHTML = `✓ <span>Copied!</span>`;
            setTimeout(() => {
              copyBtn.innerHTML = `📋 <span>Copy</span>`;
            }, 2000);
          });
        });
      }

      this.bindCodeBlockCopyButtons(row);
    }

    this.dom.messagesContainer.appendChild(row);
    return row;
  }

  async sendToGemini(newMessage) {
    this.isStreaming = true;
    this.dom.sendBtn.disabled = true;
    this.dom.stopGenerationBtn.classList.remove('hidden');
    this.dom.typingIndicator.classList.remove('hidden');
    this.scrollToBottom();

    // Prepare payload
    const selectedModel = this.dom.modelSelect.value;
    const personaKey = this.dom.personaSelect.value;
    const customPrompt = localStorage.getItem(CONFIG.STORAGE_KEYS.SYSTEM_PROMPT);
    const systemInstruction = customPrompt || CONFIG.PERSONAS[personaKey] || CONFIG.PERSONAS.default;

    // Build history excluding current message
    const history = this.messages.slice(0, -1).map(m => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
      content: m.content
    }));

    this.abortController = new AbortController();

    // Create live bot bubble
    const botRow = document.createElement('div');
    botRow.className = 'message-row bot';
    botRow.innerHTML = `
      <div class="message-avatar">
        <img src="assets/avatar.jpg" alt="Gemini">
      </div>
      <div class="message-content-wrapper">
        <div class="message-bubble"></div>
        <div class="message-toolbar">
          <button type="button" class="msg-action-btn copy-msg-btn" title="Copy response">
            📋 <span>Copy</span>
          </button>
        </div>
      </div>
    `;
    this.dom.messagesContainer.appendChild(botRow);
    const bubble = botRow.querySelector('.message-bubble');

    let accumulatedText = '';

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      };

      if (this.apiKey) {
        headers['x-gemini-api-key'] = this.apiKey;
      }

      const response = await fetch(`${this.backendUrl}/api/chat`, {
        method: 'POST',
        headers,
        signal: this.abortController.signal,
        body: JSON.stringify({
          message: newMessage,
          history,
          model: selectedModel,
          systemInstruction,
          stream: true,
          conversationId: this.currentConversationId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned HTTP ${response.status}`);
      }

      this.dom.typingIndicator.classList.add('hidden');

      // Process Server-Sent Events (SSE)
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.replace(/^data:\s*/, '');
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.error) {
              throw new Error(data.error);
            }

            if (data.conversationId) {
              this.currentConversationId = data.conversationId;
              localStorage.setItem(CONFIG.STORAGE_KEYS.CURRENT_CONVERSATION_ID, data.conversationId);
            }

            if (data.text) {
              accumulatedText += data.text;
              bubble.innerHTML = this.parseMarkdown(accumulatedText);
              this.scrollToBottom();
            }

            if (data.done) {
              break;
            }
          } catch (jsonErr) {
            console.error('Error parsing SSE chunk:', jsonErr);
          }
        }
      }

      // Record final response in messages array
      this.messages.push({ role: 'model', content: accumulatedText });
      this.saveMessagesToStorage();

      // Setup copy button
      const copyBtn = botRow.querySelector('.copy-msg-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(accumulatedText).then(() => {
            copyBtn.innerHTML = `✓ <span>Copied!</span>`;
            setTimeout(() => {
              copyBtn.innerHTML = `📋 <span>Copy</span>`;
            }, 2000);
          });
        });
      }

      this.bindCodeBlockCopyButtons(botRow);

    } catch (err) {
      if (err.name === 'AbortError') {
        bubble.innerHTML += `<p class="aborted-note"><em>(Generation stopped by user)</em></p>`;
        if (accumulatedText) {
          this.messages.push({ role: 'model', content: accumulatedText });
          this.saveMessagesToStorage();
        }
      } else {
        bubble.innerHTML = `
          <div class="error-notice">
            <strong>⚠️ Error:</strong> ${this.escapeHtml(err.message)}
          </div>
        `;
        if (err.message.includes('API Key') || err.message.includes('GEMINI_API_KEY')) {
          this.dom.apiBanner.classList.remove('hidden');
          this.updateStatusPill('warning', 'Missing API Key');
        }
      }
    } finally {
      this.isStreaming = false;
      this.dom.sendBtn.disabled = false;
      this.dom.stopGenerationBtn.classList.add('hidden');
      this.dom.typingIndicator.classList.add('hidden');
      this.scrollToBottom();
    }
  }

  stopGeneration() {
    if (this.abortController && this.isStreaming) {
      this.abortController.abort();
    }
  }

  clearChat() {
    this.messages = [];
    this.currentConversationId = null;
    localStorage.removeItem(CONFIG.STORAGE_KEYS.CHAT_HISTORY);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.CURRENT_CONVERSATION_ID);
    this.dom.messagesContainer.innerHTML = '';
    this.dom.welcomeHero.classList.remove('hidden');
  }

  scrollToBottom() {
    const el = this.dom.chatMain;
    el.scrollTop = el.scrollHeight;
  }

  // ------------------------------------------------------------------------
  // Settings Modal Handlers
  // ------------------------------------------------------------------------

  openSettingsModal() {
    this.dom.settingsApiKey.value = this.apiKey;
    this.dom.settingsBackendUrl.value = this.backendUrl;
    if (this.dom.settingsSupabaseUrl) this.dom.settingsSupabaseUrl.value = this.supabaseUrl || '';
    if (this.dom.settingsSupabaseKey) this.dom.settingsSupabaseKey.value = this.supabaseKey || '';
    this.dom.settingsSystemPrompt.value = localStorage.getItem(CONFIG.STORAGE_KEYS.SYSTEM_PROMPT) || '';
    this.dom.modalBackdrop.classList.remove('hidden');
  }

  closeSettingsModal() {
    this.dom.modalBackdrop.classList.add('hidden');
  }

  saveSettings() {
    this.apiKey = this.dom.settingsApiKey.value.trim();
    this.backendUrl = (this.dom.settingsBackendUrl.value.trim() || CONFIG.DEFAULT_BACKEND_URL).replace(/\/+$/, '');
    this.supabaseUrl = this.dom.settingsSupabaseUrl ? this.dom.settingsSupabaseUrl.value.trim() : '';
    this.supabaseKey = this.dom.settingsSupabaseKey ? this.dom.settingsSupabaseKey.value.trim() : '';
    const systemPrompt = this.dom.settingsSystemPrompt.value.trim();

    localStorage.setItem(CONFIG.STORAGE_KEYS.API_KEY, this.apiKey);
    localStorage.setItem(CONFIG.STORAGE_KEYS.BACKEND_URL, this.backendUrl);
    localStorage.setItem(CONFIG.STORAGE_KEYS.SUPABASE_URL, this.supabaseUrl);
    localStorage.setItem(CONFIG.STORAGE_KEYS.SUPABASE_KEY, this.supabaseKey);
    localStorage.setItem(CONFIG.STORAGE_KEYS.SYSTEM_PROMPT, systemPrompt);

    this.closeSettingsModal();
    this.initSupabaseClient();
    this.checkBackendStatus();
  }

  // ------------------------------------------------------------------------
  // Lightweight Markdown & Code Parser
  // ------------------------------------------------------------------------

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  parseMarkdown(text) {
    if (!text) return '';

    let out = text;

    // 1. Extract and store Code Blocks
    const codeBlocks = [];
    out = out.replace(/```([a-zA-Z0-9_\-\+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const index = codeBlocks.length;
      const cleanLang = lang.trim() || 'code';
      const escapedCode = this.escapeHtml(code.trim());
      codeBlocks.push(`
        <div class="code-container">
          <div class="code-header">
            <span class="code-lang">${cleanLang}</span>
            <button type="button" class="btn-copy-code" data-code="${encodeURIComponent(code.trim())}">
              📋 <span>Copy</span>
            </button>
          </div>
          <pre><code>${escapedCode}</code></pre>
        </div>
      `);
      return `__CODE_BLOCK_${index}__`;
    });

    // 2. Escape remaining HTML
    out = this.escapeHtml(out);

    // 3. Headings
    out = out.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    out = out.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    out = out.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // 4. Bold & Italic
    out = out.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    out = out.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*(.*?)\*/g, '<em>$1</em>');
    out = out.replace(/~~(.*?)~~/g, '<del>$1</del>');

    // 5. Blockquotes
    out = out.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // 6. Inline code
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 7. Lists
    out = out.replace(/^\s*[\-\*]\s+(.*$)/gim, '<ul><li>$1</li></ul>');
    out = out.replace(/<\/ul>\s*<ul>/g, ''); // merge consecutive <ul> tags

    out = out.replace(/^\s*\d+\.\s+(.*$)/gim, '<ol><li>$1</li></ol>');
    out = out.replace(/<\/ol>\s*<ol>/g, ''); // merge consecutive <ol> tags

    // 8. Paragraphs & Line Breaks
    const paragraphs = out.split(/\n{2,}/);
    out = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || p.startsWith('<ul>') || p.startsWith('<ol>') || p.startsWith('<blockquote>') || p.startsWith('__CODE_BLOCK_')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    // 9. Re-insert Code Blocks
    codeBlocks.forEach((blockHtml, index) => {
      out = out.replace(`__CODE_BLOCK_${index}__`, blockHtml);
    });

    return out;
  }

  bindCodeBlockCopyButtons(container) {
    const copyBtns = container.querySelectorAll('.btn-copy-code');
    copyBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const rawCode = decodeURIComponent(btn.dataset.code || '');
        navigator.clipboard.writeText(rawCode).then(() => {
          btn.innerHTML = `✓ <span>Copied!</span>`;
          setTimeout(() => {
            btn.innerHTML = `📋 <span>Copy</span>`;
          }, 2000);
        });
      });
    });
  }
}

// Instantiate App on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.geminiApp = new GeminiChatApp();
});
