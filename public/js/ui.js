import * as api from './api.js';

// Make necessary functions globally available
window.copyCode = function(button) {
    const codeBlock = button.parentElement;
    const code = codeBlock.textContent.trim();
    
    navigator.clipboard.writeText(code).then(() => {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    });
};

window.logDebug = function(message, isBackendLog = false) {
    const debugOutput = document.getElementById('debug-output');
    const timestamp = new Date().toLocaleTimeString();
    const prefix = isBackendLog ? '[BACKEND]' : '[FRONTEND]';
    debugOutput.innerHTML += `[${timestamp}] ${prefix} ${message}\n`;
    debugOutput.scrollTop = debugOutput.scrollHeight;
};

window.logBackendLogs = function(logs) {
    if (Array.isArray(logs)) {
        logs.forEach(log => window.logDebug(log.replace(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] /, ''), true));
    }
};

function showStatus(message, isError = false) {
    const statusElement = document.querySelector('.status-message');
    statusElement.textContent = message;
    statusElement.className = `status-message visible ${isError ? 'error' : 'success'}`;
}

function updateProgress(progress) {
    const progressBar = document.querySelector('.progress-bar');
    const progressFill = document.querySelector('.progress-fill');
    progressBar.classList.add('visible');
    progressFill.style.width = `${progress}%`;
}

async function loadAgents() {
    try {
        const data = await api.loadAgents();
        const uploadSelect = document.getElementById('uploadAgentSelect');
        const chatbotSelect = document.getElementById('chatbotAgentSelect');
        
        // Update upload agent dropdown
        uploadSelect.innerHTML = '<option value="">Select an agent...</option>';
        data.agents.forEach(agent => {
            const option = document.createElement('option');
            option.value = agent;
            option.textContent = agent;
            uploadSelect.appendChild(option);
        });

        // Update chatbot agent dropdown
        chatbotSelect.innerHTML = '<option value="">Select an agent...</option>';
        data.agents.forEach(agent => {
            const option = document.createElement('option');
            option.value = agent;
            option.textContent = agent;
            chatbotSelect.appendChild(option);
        });
        
        window.logDebug(`Loaded ${data.agents.length} agents`);
    } catch (error) {
        window.logDebug(`Error loading agents: ${error.message}`);
        showStatus('Failed to load agents', true);
    }
}

async function loadDocuments(agentName) {
    try {
        const data = await api.loadDocuments(agentName);
        const select = document.getElementById('documentSelect');
        const reprocessButton = document.getElementById('reprocessButton');
        
        select.innerHTML = '<option value="">Select a document...</option>';
        data.documents.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.url;
            option.textContent = doc.name;
            select.appendChild(option);
        });
        
        select.disabled = false;
        reprocessButton.disabled = !select.value;
        
        window.logDebug(`Loaded ${data.documents.length} documents for agent ${agentName}`);
        return data.documents;
    } catch (error) {
        window.logDebug(`Error loading documents: ${error.message}`);
        showStatus('Failed to load documents', true);
    }
}

function setupTabNavigation() {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            
            // Update button states
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');
            
            // Update content visibility
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(tabId).classList.add('active');
        });
    });
}

function setupEventListeners() {
    const elements = {
        uploadButton: document.getElementById('uploadButton'),
        fileInput: document.getElementById('pdfFile'),
        uploadAgentSelect: document.getElementById('uploadAgentSelect'),
        chatbotAgentSelect: document.getElementById('chatbotAgentSelect'),
        documentSelect: document.getElementById('documentSelect'),
        reprocessButton: document.getElementById('reprocessButton'),
        showCreateAgentButton: document.getElementById('showCreateAgentButton'),
        newAgentForm: document.getElementById('newAgentForm'),
        createAgentButton: document.getElementById('createAgentButton'),
        newAgentInput: document.getElementById('newAgentName'),
        clearDbButton: document.getElementById('clearDbButton'),
        docWidget: document.getElementById('doc-widget')
    };

    // Clear database
    elements.clearDbButton.addEventListener('click', async () => {
        try {
            showStatus('Clearing database...');
            const data = await api.clearDatabase();
            showStatus(`Database cleared successfully. ${data.chunksDeleted} chunks deleted.`);
            window.logDebug(`Cleared ${data.chunksDeleted} chunks from database`);
        } catch (error) {
            window.logDebug(`Error clearing database: ${error.message}`);
            showStatus('Failed to clear database: ' + error.message, true);
        }
    });

    // Show/hide new agent form
    elements.showCreateAgentButton.addEventListener('click', () => {
        elements.newAgentForm.classList.toggle('visible');
    });

    // Create new agent
    elements.createAgentButton.addEventListener('click', async () => {
        const agentName = elements.newAgentInput.value.trim();
        if (!agentName) {
            showStatus('Please enter an agent name', true);
            return;
        }

        if (!/^[a-zA-Z0-9-]+$/.test(agentName)) {
            showStatus('Agent name can only contain letters, numbers, and hyphens', true);
            return;
        }

        try {
            await api.createAgent(agentName);
            elements.newAgentInput.value = '';
            elements.newAgentForm.classList.remove('visible');
            showStatus('Agent created successfully');
            await loadAgents();
        } catch (error) {
            showStatus(`Failed to create agent: ${error.message}`, true);
        }
    });

    // Handle agent selection for upload
    elements.uploadAgentSelect.addEventListener('change', async (e) => {
        const agentName = e.target.value;
        elements.fileInput.disabled = !agentName;
        elements.uploadButton.disabled = !agentName;
        elements.documentSelect.disabled = !agentName;
        
        if (agentName) {
            await loadDocuments(agentName);
        } else {
            elements.documentSelect.innerHTML = '<option value="">Select a document...</option>';
            elements.documentSelect.disabled = true;
            elements.reprocessButton.disabled = true;
        }
        
        window.logDebug(`Selected upload agent: ${agentName}`);
    });

    // Handle agent selection for chatbot
    elements.chatbotAgentSelect.addEventListener('change', async (e) => {
        const agentName = e.target.value;
        if (agentName) {
            const data = await api.loadDocuments(agentName);
            elements.docWidget.setAttribute('agent-name', agentName);
            elements.docWidget.setAttribute('document-count', data.documents.length);
        } else {
            elements.docWidget.removeAttribute('agent-name');
            elements.docWidget.removeAttribute('document-count');
        }
        window.logDebug(`Selected chatbot agent: ${agentName}`);
    });

    // Handle document upload
    elements.uploadButton.addEventListener('click', async () => {
        const file = elements.fileInput.files[0];
        const agentName = elements.uploadAgentSelect.value;

        if (!file) {
            showStatus('Please select a PDF file', true);
            return;
        }

        if (!agentName) {
            showStatus('Please select an agent', true);
            return;
        }

        try {
            updateProgress(0);
            showStatus('Uploading PDF...');
            window.logDebug('Starting file upload...');

            const data = await api.uploadDocument(agentName, file);

            if (data.logs) {
                window.logBackendLogs(data.logs);
            }

            updateProgress(100);
            showStatus('PDF uploaded and processed successfully');
            
            if (data.processingStats) {
                const stats = data.processingStats;
                window.logDebug(`Processing complete: ${stats.successfulChunks}/${stats.totalChunks} chunks processed`);
                if (stats.failedChunks > 0) {
                    window.logDebug(`Warning: ${stats.failedChunks} chunks failed to process`);
                }
            }

            elements.fileInput.value = '';
            await loadDocuments(agentName);

            // Update chatbot if it's using the same agent
            if (elements.chatbotAgentSelect.value === agentName) {
                const documents = await api.loadDocuments(agentName);
                elements.docWidget.setAttribute('document-count', documents.length);
            }
        } catch (error) {
            window.logDebug(`Upload error: ${error.message}`);
            showStatus('Upload failed: ' + error.message, true);
        }
    });

    // Handle document selection
    elements.documentSelect.addEventListener('change', (e) => {
        elements.reprocessButton.disabled = !e.target.value;
    });

    // Handle document reprocessing
    elements.reprocessButton.addEventListener('click', async () => {
        const url = elements.documentSelect.value;
        const agentName = elements.uploadAgentSelect.value;
        if (url && agentName) {
            try {
                updateProgress(0);
                showStatus('Reprocessing document...');
                window.logDebug('Starting document reprocessing...');

                const data = await api.reprocessDocument(agentName, url);

                if (data.logs) {
                    window.logBackendLogs(data.logs);
                }

                updateProgress(100);
                showStatus('Document reprocessed successfully');
                
                if (data.processingStats) {
                    const stats = data.processingStats;
                    window.logDebug(`Processing complete: ${stats.successfulChunks}/${stats.totalChunks} chunks processed`);
                    if (stats.failedChunks > 0) {
                        window.logDebug(`Warning: ${stats.failedChunks} chunks failed to process`);
                    }
                }

                await loadDocuments(agentName);

                // Update chatbot if it's using the same agent
                if (elements.chatbotAgentSelect.value === agentName) {
                    const documents = await api.loadDocuments(agentName);
                    elements.docWidget.setAttribute('document-count', documents.length);
                }
            } catch (error) {
                window.logDebug(`Reprocessing error: ${error.message}`);
                showStatus('Reprocessing failed: ' + error.message, true);
            }
        }
    });
}

export function initializeUI() {
    setupTabNavigation();
    setupEventListeners();
    loadAgents(); // Initial load of agents
}
