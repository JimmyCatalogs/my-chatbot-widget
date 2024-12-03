const express = require('express');
const router = express.Router();
const { InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { bedrockClient } = require('../config/aws-clients');
const { findRelevantContext } = require('../services/document-service');

const CLAUDE_MODEL = "anthropic.claude-3-5-sonnet-20240620-v1:0";

// Collect logs
const logs = [];
const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  logs.push(logMessage);
  console.log(logMessage);
};

// Clear logs between requests
const clearLogs = () => {
  logs.length = 0;
};

router.get("/test", (req, res) => {
  clearLogs();
  log('Health check endpoint called');
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    region: process.env.AWS_REGION,
    logs
  });
});

router.post("/", async (req, res) => {
  clearLogs();
  log("Chat request received");
  const progress = [];
  
  try {
    const { message, agentName, agentId = 'claude-default' } = req.body;
    log(`Request params: message="${message}", agentName="${agentName || 'none'}", agentId="${agentId}"`);

    // Validate required fields
    if (!message || !agentName) {
      log('Missing required fields in request');
      return res.status(400).json({ 
        error: "Missing required fields",
        received: { message, agentName },
        logs
      });
    }

    // Validate agentId
    if (agentId !== 'claude-default') {
      log('Invalid agent ID provided');
      return res.status(400).json({ 
        error: "Invalid agent ID",
        validAgents: ['claude-default'],
        logs
      });
    }

    let contextInfo = null;

    try {
      progress.push("Finding relevant context...");
      log('Finding relevant context for agent...');
      log(`Agent Name: ${agentName}`);
      
      contextInfo = await findRelevantContext(message, agentName);
      progress.push("Context found");
      log(`Found relevant context from ${contextInfo.documentCount} documents`);
      log(`Context length: ${contextInfo.context.length} characters`);
      log(`Context preview: ${contextInfo.context.slice(0, 200)}...`);
      
      if (!contextInfo.context || contextInfo.context.length === 0) {
        log('Warning: Empty context returned');
        throw new Error('No relevant context found for this agent');
      }
    } catch (error) {
      log(`Error finding context: ${error.message}`);
      return res.status(500).json({
        error: 'Failed to find relevant context',
        details: error.message,
        progress,
        logs
      });
    }

    // Prepare chat completion request
    progress.push("Generating response...");
    log('Preparing chat completion request');

    const messages = [
      { 
        role: "user", 
        content: `You are ${agentName}, a knowledgeable assistant. Provide concise, focused responses that highlight the most relevant information. Keep your initial response brief (2-3 key points) and end by offering to provide more specific details if the user would like to know more about any particular aspect. Your tone should be natural and confident while staying accurate to the provided context.`
      },
      {
        role: "assistant",
        content: `I understand. I'll provide brief, focused responses and offer to expand on specific topics if needed.`
      },
      { 
        role: "user", 
        content: `Here's some relevant information:\n\n${contextInfo.context}\n\n${message}`
      }
    ];
    log('Prepared messages with document context');

    // Get response from Claude
    log('Sending request to Claude');
    const command = new InvokeModelCommand({
      modelId: CLAUDE_MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        messages: messages,
        temperature: 0.7,
      }),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(Buffer.from(response.body).toString());
    progress.push("Response generated");
    log('Received response from Claude');
    
    // Send the response directly without prepending the agent name
    const responseText = responseBody.content[0].text;

    log('Sending response to client');
    log(`Response preview: ${responseText.slice(0, 200)}...`);
    
    res.json({ 
      message: responseText,
      agentId: agentId,
      agentName: agentName,
      timestamp: new Date().toISOString(),
      progress,
      logs
    });

  } catch (error) {
    log(`Error processing chat request: ${error.message}`);
    
    if (error.name === 'ValidationException') {
      res.status(400).json({
        error: "Invalid request",
        details: error.message,
        progress,
        logs
      });
    } else if (error.name === 'ResourceNotFoundException') {
      res.status(404).json({
        error: "Model not found",
        details: error.message,
        progress,
        logs
      });
    } else if (error.name === 'AccessDeniedException') {
      res.status(403).json({
        error: "Access denied to Bedrock",
        details: "Please check IAM permissions",
        progress,
        logs
      });
    } else {
      res.status(500).json({
        error: "Internal server error",
        details: error.message,
        type: error.name,
        progress,
        logs
      });
    }
  }
});

module.exports = router;
