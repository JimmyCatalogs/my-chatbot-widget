// ChatbotWidget.js
class ChatbotWidget extends HTMLElement {
  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.messages = [];
    this.isOpen = false;
    this.API_URL = 'https://twprrdsgsk.execute-api.us-east-1.amazonaws.com/dev';
    
    // Get attributes or use defaults
    this.profileId = this.getAttribute('profile-id') || 'default';
    this.agentId = this.getAttribute('agent-id') || 'claude-default';  // Using consistent agent ID
    this.documentUrl = this.getAttribute('document-url') || '';
    this.theme = {
      primaryColor: this.getAttribute('primary-color') || '#3B82F6',
      fontFamily: this.getAttribute('font-family') || 'system-ui, -apple-system, sans-serif'
    };

    // Get positioning
    this.bottom = this.getAttribute('bottom') || '20px';
    this.right = this.getAttribute('right') || '20px';
  }

  static get observedAttributes() {
    return ['document-url'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'document-url' && oldValue !== newValue) {
      this.documentUrl = newValue;
      this.resetChat();
      if (this.documentUrl) {
        const filename = this.getFilenameFromUrl(this.documentUrl);
        this.addMessage({
          role: 'assistant',
          content: `Document loaded: "${filename}"\nYou can ask me questions about it. Try saying "Tell me about the document" for an overview, or ask specific questions about its content.`,
          isDocumentMode: true
        });
      }
    }
  }

  getFilenameFromUrl(url) {
    const urlParts = url.split('/');
    return decodeURIComponent(urlParts[urlParts.length - 1]);
  }

  resetChat() {
    this.messages = [];
    const messagesContainer = this.shadow.querySelector('.chat-messages');
    if (messagesContainer) {
      messagesContainer.innerHTML = '';
    }
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
    
    // If document URL is provided, show welcome message
    if (this.documentUrl) {
      const filename = this.getFilenameFromUrl(this.documentUrl);
      this.addMessage({
        role: 'assistant',
        content: `Document loaded: "${filename}"\nYou can ask me questions about it. Try saying "Tell me about the document" for an overview, or ask specific questions about its content.`,
        isDocumentMode: true
      });
    }
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
        background: ${this.adjustColor(this.theme.primaryColor, -20)};
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
        display: flex;
        flex-direction: column;
        overflow: hidden;
        display: none;
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
      }

      .chat-header h3 {
        margin: 0;
        font-size: 16px;
        color: #1f2937;
      }

      .document-indicator {
        display: ${this.documentUrl ? 'inline-flex' : 'none'};
        align-items: center;
        padding: 4px 10px;
        background: ${this.theme.primaryColor}20;
        color: ${this.theme.primaryColor};
        border-radius: 12px;
        font-size: 12px;
        white-space: nowrap;
        gap: 4px;
        margin-left: 8px;
        order: -1;
      }

      .document-indicator svg {
        width: 14px;
        height: 14px;
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

      .assistant-message.document-response .message-content {
        background: ${this.theme.primaryColor}15;
        border-left: 3px solid ${this.theme.primaryColor};
        border-radius: 0 15px 15px 0;
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
        background: ${this.adjustColor(this.theme.primaryColor, -20)};
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

    const documentSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;

    this.shadow.innerHTML = `
      <div class="widget-container">
        <button class="toggle-button">&#128172;</button>
        <div class="chat-window">
          <div class="chat-header">
            <span class="document-indicator">${documentSvg} Document Ready</span>
            <h3>Chat Assistant</h3>
          </div>
          <div class="chat-messages"></div>
          <div class="typing-indicator">Typing...</div>
          <div class="error-message"></div>
          <form class="input-container">
            <input type="text" class="message-input" placeholder="${this.documentUrl ? 'Ask about the document or type any question...' : 'Type your message...'}">
            <button type="submit" class="send-button">Send</button>
          </form>
        </div>
      </div>
    `;

    this.shadow.appendChild(style);
  }

  setupEventListeners() {
    const toggleButton = this.shadow.querySelector('.toggle-button');
    const chatWindow = this.shadow.querySelector('.chat-window');
    const form = this.shadow.querySelector('form');
    const input = this.shadow.querySelector('.message-input');

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
  }

  async sendMessage(content) {
    this.addMessage({ role: 'user', content });
    this.setTypingIndicator(true);
    this.clearError();

    try {
      const payload = {
        message: content,
        profileId: this.profileId,
        agentId: this.agentId
      };

      // Only include documentUrl if it exists
      if (this.documentUrl) {
        payload.documentUrl = this.documentUrl;
      }

      const response = await fetch(`${this.API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      this.addMessage({ 
        role: 'assistant', 
        content: data.message,
        isDocumentMode: data.isDocumentMode 
      });
    } catch (error) {
      console.error('Error sending message:', error);
      this.showError(error.message || 'An unexpected error occurred');
    } finally {
      this.setTypingIndicator(false);
    }
  }

  addMessage(message) {
    this.messages.push(message);
    const messagesContainer = this.shadow.querySelector('.chat-messages');
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.role}-message`;
    if (message.isDocumentMode) {
      messageElement.classList.add('document-response');
    }
    messageElement.innerHTML = `<div class="message-content">${message.content}</div>`;
    messagesContainer.appendChild(messageElement);
    this.scrollToBottom();
  }

  scrollToBottom() {
    const messagesContainer = this.shadow.querySelector('.chat-messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  setTypingIndicator(visible) {
    const indicator = this.shadow.querySelector('.typing-indicator');
    indicator.classList.toggle('visible', visible);
  }

  showError(message) {
    const errorElement = this.shadow.querySelector('.error-message');
    errorElement.textContent = message;
    errorElement.classList.add('visible');
  }

  clearError() {
    const errorElement = this.shadow.querySelector('.error-message');
    errorElement.classList.remove('visible');
  }

  adjustColor(color, amount) {
    const hex = color.replace('#', '');
    const num = parseInt(hex, 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }
}

customElements.define('chatbot-widget', ChatbotWidget);
