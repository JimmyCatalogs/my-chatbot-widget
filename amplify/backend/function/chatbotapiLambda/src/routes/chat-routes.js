const express = require('express');
const router = express.Router();
const { InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { bedrockClient } = require('../config/aws-clients');
const { processAndStoreDocument, findRelevantContext } = require('../services/document-service');

router.get("/test", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    region: process.env.AWS_REGION,
  });
});

router.post("/chat", async (req, res) => {
  console.log("Chat request received:", req.body);
  try {
    const { message, profileId, agentId, documentUrl } = req.body;

    // Validate required fields
    if (!message || !profileId || !agentId) {
      return res.status(400).json({ 
        error: "Missing required fields",
        received: { message, profileId, agentId }
      });
    }

    // Validate agentId
    if (agentId !== 'claude-default') {
      return res.status(400).json({ 
        error: "Invalid agent ID",
        validAgents: ['claude-default']
      });
    }

    console.log("Processing chat request with message:", message);
    let contextInfo = null;
    let isDocumentMode = false;

    if (documentUrl) {
      console.log('Document URL provided, fetching relevant context');
      try {
        contextInfo = await findRelevantContext(message, documentUrl);
        console.log('Successfully retrieved context');
        isDocumentMode = true;
      } catch (error) {
        console.error('Error getting relevant context:', error.stack);
        if (error.message.includes('exceeds limit')) {
          return res.status(400).json({
            error: 'Document too large',
            details: error.message
          });
        }
        return res.status(500).json({ 
          error: 'Failed to process document context',
          details: error.message
        });
      }
    }

    const systemPrompt = isDocumentMode 
      ? `You are a helpful AI assistant that answers questions based on the provided document. The document's summary is: ${contextInfo.summary}\n\nWhen answering questions, reference specific information from the provided context. If the context doesn't contain relevant information to answer the question, say so clearly.`
      : "You are a helpful AI assistant.";

    const userMessage = isDocumentMode
      ? contextInfo.isOverview
        ? `Here is a summary of the document:\n\n${contextInfo.context}\n\nPlease provide an overview based on this summary.`
        : `Here is the relevant context from the document:\n\n${contextInfo.context}\n\nBased on this context, please answer the following question: ${message}`
      : message;

    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: systemPrompt
          },
          { 
            role: "user", 
            content: userMessage 
          }
        ],
        temperature: 0.7,
      }),
    });

    console.log("Sending command to Bedrock");
    const response = await bedrockClient.send(command);
    console.log("Received response from Bedrock");

    const responseBody = new TextDecoder().decode(response.body);
    console.log("Response body:", responseBody);

    const parsedResponse = JSON.parse(responseBody);
    
    // Add prefix to response in document mode
    const responseText = isDocumentMode
      ? (contextInfo.isOverview ? "Document Overview: " : "Based on the document context: ") + parsedResponse.content[0].text
      : parsedResponse.content[0].text;

    res.json({ 
      message: responseText,
      agentId: agentId,
      timestamp: new Date().toISOString(),
      isDocumentMode: isDocumentMode
    });

  } catch (error) {
    console.error("Error processing chat request:", error.stack);
    
    if (error.name === 'ValidationException') {
      res.status(400).json({
        error: "Invalid request",
        details: error.message
      });
    } else if (error.name === 'ResourceNotFoundException') {
      res.status(404).json({
        error: "Model not found",
        details: error.message
      });
    } else if (error.name === 'AccessDeniedException') {
      res.status(403).json({
        error: "Access denied to Bedrock",
        details: "Please check IAM permissions"
      });
    } else {
      res.status(500).json({
        error: "Internal server error",
        details: error.message,
        type: error.name
      });
    }
  }
});

module.exports = router;
