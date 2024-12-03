// training-api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';

export async function createContext(data) {
  const response = await axios.post(`${API_URL}/training/context`, {
    businessType: data.businessType,
    industry: data.industry,
    targetUser: data.targetUser,
    specialInstructions: data.specialInstructions,
    contextId: data.contextId // Allow passing existing contextId
  });
  return response.data;
}

export async function uploadDocuments(contextId, files) {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });

  const response = await axios.post(
    `${API_URL}/training/documents/${contextId}`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }
  );
  return response.data;
}

export async function generateQuestions(contextId) {
  const response = await axios.post(`${API_URL}/training/questions/${contextId}`);
  return response.data;
}

export async function generateResponses(contextId, question) {
  const response = await axios.post(`${API_URL}/training/responses/${contextId}`, {
    question
  });
  return response.data;
}
