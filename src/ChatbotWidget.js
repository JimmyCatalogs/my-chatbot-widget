class ChatbotWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.messages = [];
    this.isOpen = false;
    
    this.API_URL = window.location.hostname === 'localhost'
      ? 'http://localhost:3001'
      : 'https://twprrdsgsk.execute-api.us-east-1.amazonaws.com/dev';
    
    this.aiModel = this.getAttribute('ai-model') || 'claude-default';
    this.agentName = this.getAttribute('agent-name') || '';
    this.documentCount = parseInt(this.getAttribute('document-count')) || 0;
    this.theme = {
      primaryColor: this.getAttribute('primary-color') || '#3B82F6',
      fontFamily: this.getAttribute('font-family') || 'system-ui, -apple-system, sans-serif'
    };

    this.bottom = this.getAttribute('bottom') || '20px';
    this.right = this.getAttribute('right') || '20px';

    // Initialize after all properties are set
    this.initialize();
  }

  initialize() {
    this.render();
    this.setupEventListeners();
    if (this.agentName) {
      this.showWelcomeMessage();
    }
    this.debugLog('ChatbotWidget initialized with API URL: ' + this.API_URL);
  }

  debugLog(message) {
    if (window.logDebug) {
      window.logDebug(message);
    } else {
      console.log('[ChatbotWidget]', message);
    }
  }

  isBase64(str) {
    try {
      return btoa(atob(str)) === str;
    } catch (err) {
      return false;
    }
  }

  async parseResponseData(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      if (this.isBase64(text)) {
        try {
          const decoded = atob(text);
          return JSON.parse(decoded);
        } catch (e2) {
          throw new Error('Failed to parse response data');
        }
      }
      throw e;
    }
  }

  logBackendLogs(logs) {
    if (Array.isArray(logs)) {
      if (window.logBackendLogs) {
        window.logBackendLogs(logs);
      } else {
        logs.forEach(log => {
          console.log('[ChatbotWidget Backend]', log);
        });
      }
    }
  }

  showWelcomeMessage() {
    if (this.agentName) {
      this.addMessage({
        role: 'assistant',
        content: 'Hello! How can I help you today?'
      });
    }
  }

  async sendMessage(content) {
    this.addMessage({ role: 'user', content });
    this.setTypingIndicator(true);
    this.clearError();

    try {
      const payload = {
        message: content,
        agentName: this.agentName,
        agentId: this.aiModel
      };

      this.debugLog('Sending message to backend...');
      this.debugLog(`Using AI model: ${this.aiModel}, agentName: ${this.agentName}`);

      const response = await fetch(`${this.API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const data = await this.parseResponseData(response);

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to get response');
      }

      if (data.logs) {
        this.logBackendLogs(data.logs);
      }

      if (data.progress) {
        data.progress.forEach(message => {
          this.debugLog(message);
        });
      }

      if (data.message) {
        this.addMessage({ 
          role: 'assistant', 
          content: data.message
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.debugLog(`Error: ${error.message}`);
      this.showError(error.message || 'An unexpected error occurred');
    } finally {
      this.setTypingIndicator(false);
    }
  }

  static get observedAttributes() {
    return ['agent-name', 'ai-model', 'document-count'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    const wasOpen = this.isOpen;
    
    if (name === 'agent-name') {
      this.agentName = newValue;
      this.resetChat();
      this.render();
      this.setupEventListeners();
      if (this.agentName) {
        this.showWelcomeMessage();
      }
    } else if (name === 'ai-model') {
      this.aiModel = newValue || 'claude-default';
      this.debugLog(`AI model updated to: ${this.aiModel}`);
    } else if (name === 'document-count') {
      this.documentCount = parseInt(newValue) || 0;
      this.render();
      this.setupEventListeners();
    }

    // Restore chat window state if it was open
    if (wasOpen) {
      const chatWindow = this.shadowRoot.querySelector('.chat-window');
      const toggleButton = this.shadowRoot.querySelector('.toggle-button');
      if (chatWindow && toggleButton) {
        this.isOpen = true;
        chatWindow.classList.add('open');
        toggleButton.innerHTML = '&times;';
      }
    }
  }

  resetChat() {
    this.messages = [];
    const messagesContainer = this.shadowRoot.querySelector('.chat-messages');
    if (messagesContainer) {
      messagesContainer.innerHTML = '';
    }
  }

  adjustColor(color, amount) {
    return color; // Simplified version for now
  }

  render() {
    const style = document.createElement('style');
    style.textContent = `
      .widget-container {
        position: fixed;
        bottom: ${this.bottom};
        right: ${this.right};
        z-index: 10000;
        font-family: ${this.theme.fontFamily};
      }

      .toggle-button {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: ${this.theme.primaryColor};
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        transition: background-color 0.2s;
      }

      .toggle-button:hover {
        background: ${this.theme.primaryColor};
      }

      .chat-window {
        position: absolute;
        bottom: 60px;
        right: 0;
        width: 350px;
        height: 500px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        display: none;
        flex-direction: column;
        overflow: hidden;
      }

      .chat-window.open {
        display: flex;
      }

      .chat-header {
        padding: 15px;
        background: #f8f9fa;
        border-bottom: 1px solid #eee;
        display: flex;
        align-items: center;
        gap: 8px;
        position: relative;
      }

      .chat-header h3 {
        margin: 0;
        font-size: 16px;
        color: #1f2937;
      }

      .agent-indicator {
        display: ${this.agentName ? 'inline-flex' : 'none'};
        align-items: center;
        padding: 4px 10px;
        background: ${this.theme.primaryColor}20;
        color: ${this.theme.primaryColor};
        border-radius: 12px;
        font-size: 12px;
        white-space: nowrap;
        gap: 4px;
        margin-left: 8px;
        cursor: pointer;
        transition: background-color 0.2s;
        position: relative;
      }

      .agent-indicator:hover {
        background: ${this.theme.primaryColor}30;
      }

      .agent-indicator svg {
        width: 14px;
        height: 14px;
      }

      .agent-popup {
        position: absolute;
        top: calc(100% + 5px);
        left: 50%;
        transform: translateX(-50%);
        background: white;
        padding: 8px 12px;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        font-size: 12px;
        color: #1f2937;
        display: none;
        white-space: nowrap;
        z-index: 2;
      }

      .agent-popup::before {
        content: '';
        position: absolute;
        top: -4px;
        left: 50%;
        transform: translateX(-50%) rotate(45deg);
        width: 8px;
        height: 8px;
        background: white;
      }

      .agent-popup.visible {
        display: block;
      }

      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 15px;
        scroll-behavior: smooth;
      }

      .message {
        margin-bottom: 10px;
        max-width: 80%;
        clear: both;
      }

      .message-content {
        padding: 8px 12px;
        border-radius: 15px;
        display: inline-block;
        word-break: break-word;
      }

      .user-message {
        float: right;
      }

      .user-message .message-content {
        background: ${this.theme.primaryColor};
        color: white;
      }

      .assistant-message {
        float: left;
      }

      .assistant-message .message-content {
        background: #f1f3f5;
        color: #1f2937;
      }

      .input-container {
        padding: 15px;
        border-top: 1px solid #eee;
        display: flex;
        gap: 8px;
      }

      .message-input {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #e5e7eb;
        border-radius: 20px;
        outline: none;
        font-family: inherit;
      }

      .message-input:focus {
        border-color: ${this.theme.primaryColor};
        box-shadow: 0 0 0 2px ${this.theme.primaryColor}33;
      }

      .send-button {
        padding: 8px 16px;
        background: ${this.theme.primaryColor};
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
        font-family: inherit;
        transition: background-color 0.2s;
      }

      .send-button:hover {
        background: ${this.theme.primaryColor};
      }

      .send-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .typing-indicator {
        color: #6b7280;
        font-size: 14px;
        text-align: center;
        padding: 8px;
        display: none;
      }

      .typing-indicator.visible {
        display: block;
      }

      .error-message {
        color: #ef4444;
        font-size: 14px;
        text-align: center;
        padding: 8px;
        display: none;
      }

      .error-message.visible {
        display: block;
      }
    `;

    const robotSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>`;

    const container = document.createElement('div');
    container.className = 'widget-container';
    container.innerHTML = `
      <button class="toggle-button">&#128172;</button>
      <div class="chat-window">
        <div class="chat-header">
          <h3>Chat Assistant</h3>
          <div class="agent-indicator">${robotSvg} ${this.agentName || 'No Agent'}
            <div class="agent-popup">
              ${this.documentCount} document${this.documentCount !== 1 ? 's' : ''} loaded for context
            </div>
          </div>
        </div>
        <div class="chat-messages"></div>
        <div class="typing-indicator">Typing...</div>
        <div class="error-message"></div>
        <form class="input-container">
          <input type="text" class="message-input" placeholder="Type your message...">
          <button type="submit" class="send-button">Send</button>
        </form>
      </div>
    `;

    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(container);

    // Restore messages after re-render
    this.messages.forEach(message => {
      const messagesContainer = this.shadowRoot.querySelector('.chat-messages');
      const messageElement = document.createElement('div');
      messageElement.className = `message ${message.role}-message`;
      messageElement.innerHTML = `<div class="message-content">${message.content}</div>`;
      messagesContainer.appendChild(messageElement);
    });
  }

  setupEventListeners() {
    const toggleButton = this.shadowRoot.querySelector('.toggle-button');
    const chatWindow = this.shadowRoot.querySelector('.chat-window');
    const form = this.shadowRoot.querySelector('form');
    const input = this.shadowRoot.querySelector('.message-input');
    const agentIndicator = this.shadowRoot.querySelector('.agent-indicator');
    const agentPopup = this.shadowRoot.querySelector('.agent-popup');

    toggleButton.addEventListener('click', () => {
      this.isOpen = !this.isOpen;
      toggleButton.innerHTML = this.isOpen ? '&times;' : '&#128172;';
      chatWindow.classList.toggle('open');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = input.value.trim();
      if (!message) return;

      await this.sendMessage(message);
      input.value = '';
    });

    // Toggle popup on agent indicator click
    agentIndicator.addEventListener('click', (e) => {
      e.stopPropagation();
      agentPopup.classList.toggle('visible');
    });

    // Close popup when clicking anywhere in the chat window
    chatWindow.addEventListener('click', (e) => {
      if (!agentIndicator.contains(e.target)) {
        agentPopup.classList.remove('visible');
      }
    });
  }

  addMessage(message) {
    this.messages.push(message);
    const messagesContainer = this.shadowRoot.querySelector('.chat-messages');
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.role}-message`;
    messageElement.innerHTML = `<div class="message-content">${message.content}</div>`;
    messagesContainer.appendChild(messageElement);
    this.scrollToBottom();
  }

  scrollToBottom() {
    const messagesContainer = this.shadowRoot.querySelector('.chat-messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  setTypingIndicator(visible) {
    const indicator = this.shadowRoot.querySelector('.typing-indicator');
    indicator.classList.toggle('visible', visible);
  }

  showError(message) {
    const errorElement = this.shadowRoot.querySelector('.error-message');
    errorElement.textContent = message;
    errorElement.classList.add('visible');
  }

  clearError() {
    const errorElement = this.shadowRoot.querySelector('.error-message');
    errorElement.classList.remove('visible');
  }
}

// Only define the custom element if it hasn't been defined yet
if (!customElements.get('chatbot-widget')) {
  customElements.define('chatbot-widget', ChatbotWidget);
}

// Initialize widgets if we're in the admin interface
window.addEventListener('load', () => {
  const docWidget = document.getElementById('doc-widget');
  const demoWidget = document.getElementById('demo-widget');
  
  if (docWidget && demoWidget && window.logDebug) {
    window.logDebug('Agent-enabled widgets loaded');
    window.logDebug(`Admin Widget AI Model: ${docWidget.getAttribute('ai-model')}`);
    window.logDebug(`Demo Widget AI Model: ${demoWidget.getAttribute('ai-model')}`);
    window.logDebug(`Position: bottom=${docWidget.getAttribute('bottom')}, right=${docWidget.getAttribute('right')}`);
    window.logDebug(`API URL: ${docWidget.API_URL}`);
  }
});
