const express = require('express');
const router = express.Router();
const { s3Client, dynamoClient } = require('../config/aws-clients');
const { processAndStoreDocument } = require('../services/document-service');
const { ListObjectsV2Command, PutObjectCommand } = require('@aws-sdk/client-s3');

const S3_BUCKET = process.env.S3_BUCKET || 'ai-testing-jw';
const AGENTS_PREFIX = 'agents/';
const CHUNKS_TABLE = process.env.CHUNKS_TABLE || "chatbot-document-chunks";

// Clear all chunks from DynamoDB
router.post('/clear-chunks', async (req, res) => {
  try {
    // Scan all items
    const { Items: chunks } = await dynamoClient.scan({
      TableName: CHUNKS_TABLE
    });

    console.log(`Found ${chunks.length} chunks to delete`);

    // Delete each item
    for (const chunk of chunks) {
      await dynamoClient.delete({
        TableName: CHUNKS_TABLE,
        Key: {
          docId: chunk.docId,
          chunkId: chunk.chunkId
        }
      });
    }

    res.json({ 
      message: 'All chunks cleared successfully',
      chunksDeleted: chunks.length
    });
  } catch (error) {
    console.error('Error clearing chunks:', error);
    res.status(500).json({ error: 'Failed to clear chunks' });
  }
});

// List all available agents
router.get('/agents', async (req, res) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: AGENTS_PREFIX,
      Delimiter: '/'
    });

    const response = await s3Client.send(command);
    const agents = response.CommonPrefixes
      .map(prefix => prefix.Prefix.replace(AGENTS_PREFIX, '').replace('/', ''))
      .filter(agent => agent.length > 0);

    res.json({ agents });
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// Create new agent
router.post('/agents', async (req, res) => {
  try {
    const { agentName } = req.body;

    if (!agentName) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    if (!/^[a-zA-Z0-9-]+$/.test(agentName)) {
      return res.status(400).json({ 
        error: 'Agent name must contain only letters, numbers, and hyphens' 
      });
    }

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `${AGENTS_PREFIX}${agentName}/`,
      Body: ''
    });

    await s3Client.send(command);
    res.json({ message: 'Agent created successfully', agentName });
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// List documents for a specific agent
router.get('/agents/:agentName/documents', async (req, res) => {
  try {
    const { agentName } = req.params;
    const prefix = `${AGENTS_PREFIX}${agentName}/`;

    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix
    });

    const response = await s3Client.send(command);
    const documents = response.Contents
      .filter(item => item.Key !== prefix) // Exclude the folder itself
      .map(item => ({
        name: item.Key.split('/').pop(),
        url: item.Key,
        size: item.Size,
        lastModified: item.LastModified
      }));

    res.json({ documents });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// Upload and process document for specific agent
router.post('/agents/:agentName/documents', async (req, res) => {
  try {
    const { agentName } = req.params;
    const { file, fileName } = req.body;

    if (!file || !fileName) {
      return res.status(400).json({ error: 'File and fileName are required' });
    }

    const s3Key = `${AGENTS_PREFIX}${agentName}/${fileName}`;
    const uploadCommand = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: Buffer.from(file.split(',')[1], 'base64'),
      ContentType: 'application/pdf'
    });

    await s3Client.send(uploadCommand);

    const result = await processAndStoreDocument(s3Key, agentName);
    res.json(result);
  } catch (error) {
    console.error('Error processing document:', error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

module.exports = router;
