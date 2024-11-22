const express = require('express');
const multer = require('multer');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient, PutItemCommand, GetItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { processAndStoreDocument, getStoredChunks } = require('../services/document-service');
const pdfParse = require('pdf-parse');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamodb = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Use environment variables for bucket and table names
const TRAINING_BUCKET = process.env.TRAINING_BUCKET;
const TRAINING_TABLE = process.env.TRAINING_TABLE;

// Use consistent model ID
const CLAUDE_MODEL = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

// Create or update training context
router.post('/context', async (req, res) => {
  try {
    const { contextId, businessType, industry, targetUser, specialInstructions } = req.body;

    if (!contextId || !businessType || !industry || !targetUser) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'contextId, businessType, industry, and targetUser are required'
      });
    }

    const item = {
      TableName: TRAINING_TABLE,
      Item: {
        contextId: { S: contextId },
        businessType: { S: businessType },
        industry: { S: industry },
        targetUser: { S: targetUser },
        specialInstructions: { S: specialInstructions || '' },
        createdAt: { S: new Date().toISOString() }
      }
    };

    await dynamodb.send(new PutItemCommand(item));

    res.json({
      message: 'Training context created successfully',
      contextId
    });
  } catch (error) {
    console.error('Error creating training context:', error);
    res.status(500).json({
      error: 'Error creating training context',
      message: error.message
    });
  }
});

// Generate responses for a question
router.post('/responses/:contextId', async (req, res) => {
  const { contextId } = req.params;
  const { question } = req.body;
  
  try {
    if (!question) {
      return res.status(400).json({ error: 'No question provided' });
    }

    // Get context from DynamoDB
    const contextResponse = await dynamodb.send(new GetItemCommand({
      TableName: TRAINING_TABLE,
      Key: {
        contextId: { S: contextId }
      }
    }));

    if (!contextResponse.Item) {
      return res.status(404).json({ error: 'Context not found' });
    }
    
    const context = {
      businessType: contextResponse.Item.businessType.S,
      industry: contextResponse.Item.industry.S,
      targetUser: contextResponse.Item.targetUser.S,
      specialInstructions: contextResponse.Item.specialInstructions.S
    };

    // Get stored chunks for this context
    const chunks = await getStoredChunks(contextId);

    // Use Bedrock embeddings to find relevant chunks
    const embeddingResponse = await bedrock.send(new InvokeModelCommand({
      modelId: 'amazon.titan-embed-text-v1',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({ inputText: question })
    }));

    const questionEmbedding = JSON.parse(new TextDecoder().decode(embeddingResponse.body)).embedding;

    // Simple cosine similarity search
    const relevantChunks = chunks
      .sort((a, b) => 
        cosineSimilarity(questionEmbedding, b.embedding) - 
        cosineSimilarity(questionEmbedding, a.embedding)
      )
      .slice(0, 3);

    const contextualContent = relevantChunks
      .map(chunk => chunk.text)
      .join('\n');

    console.log('Generating responses for question:', question);
    const command = new InvokeModelCommand({
      modelId: CLAUDE_MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `You are assisting ${context.targetUser} of a ${context.businessType} in the ${context.industry} industry.
              Special context: ${context.specialInstructions}

              Generate exactly 3 different responses to this question: "${question}"
              
              Reference material:
              ${contextualContent}

              Format requirements:
              - Start each response with a number and period (1., 2., 3.)
              - Each response should be on its own line
              - Do not include any other text or formatting
              - Vary responses in:
                1. Detail level for ${context.targetUser}
                2. Tone (formal to conversational)
                3. Technical depth based on ${context.targetUser} expertise`
          }
        ],
        temperature: 0.7
      })
    });

    console.log('Sending request to Bedrock');
    const response = await bedrock.send(command);
    console.log('Received response from Bedrock');

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    console.log('Raw response:', responseBody);

    if (!responseBody.content || !responseBody.content[0] || !responseBody.content[0].text) {
      throw new Error('Invalid response format from Bedrock');
    }

    // Process responses: split on numbered lines and clean up
    const responseText = responseBody.content[0].text;
    console.log('Response text:', responseText);

    // Split on numbered lines and clean up
    const responses = responseText
      .split(/^\d+\.\s*/m)  // Split on lines starting with numbers
      .map(r => r.trim())
      .filter(r => r.length > 0);

    console.log('Processed responses:', responses);

    if (!responses.length) {
      throw new Error('No valid responses generated');
    }

    res.json({ responses });
  } catch (error) {
    console.error('Error generating responses:', error);
    res.status(500).json({ 
      error: 'Error generating responses',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;
