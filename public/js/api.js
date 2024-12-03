const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3001'
    : 'https://twprrdsgsk.execute-api.us-east-1.amazonaws.com/dev';

function isBase64(str) {
    try {
        return btoa(atob(str)) === str;
    } catch (err) {
        return false;
    }
}

async function parseResponseData(response) {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        if (isBase64(text)) {
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

export function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

export async function loadAgents() {
    try {
        const response = await fetch(`${API_URL}/api/docs/agents`);
        if (!response.ok) {
            throw new Error('Failed to load agents');
        }
        const data = await parseResponseData(response);
        return data;
    } catch (error) {
        console.error('Error loading agents:', error);
        throw error;
    }
}

export async function loadDocuments(agentName) {
    try {
        const response = await fetch(`${API_URL}/api/docs/agents/${agentName}/documents`);
        if (!response.ok) {
            throw new Error('Failed to load documents');
        }
        const data = await parseResponseData(response);
        return data;
    } catch (error) {
        console.error('Error loading documents:', error);
        throw error;
    }
}

export async function createAgent(agentName) {
    try {
        const response = await fetch(`${API_URL}/api/docs/agents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ agentName })
        });

        const data = await parseResponseData(response);
        if (!response.ok) {
            throw new Error(data.error || 'Failed to create agent');
        }

        return data;
    } catch (error) {
        console.error('Error creating agent:', error);
        throw error;
    }
}

export async function clearDatabase() {
    try {
        const response = await fetch(`${API_URL}/api/docs/clear-chunks`, {
            method: 'POST'
        });

        const data = await parseResponseData(response);
        if (!response.ok) {
            throw new Error(data.error || 'Failed to clear database');
        }

        return data;
    } catch (error) {
        console.error('Error clearing database:', error);
        throw error;
    }
}

export async function uploadDocument(agentName, file) {
    try {
        const base64File = await readFileAsBase64(file);
        const response = await fetch(`${API_URL}/api/docs/agents/${agentName}/documents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file: base64File,
                fileName: file.name
            })
        });

        const data = await parseResponseData(response);
        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }

        return data;
    } catch (error) {
        console.error('Error uploading document:', error);
        throw error;
    }
}

export async function reprocessDocument(agentName, url) {
    try {
        const response = await fetch(`${API_URL}/api/docs/agents/${agentName}/documents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url })
        });

        const data = await parseResponseData(response);
        if (!response.ok) {
            throw new Error(data.error || 'Reprocessing failed');
        }

        return data;
    } catch (error) {
        console.error('Error reprocessing document:', error);
        throw error;
    }
}
