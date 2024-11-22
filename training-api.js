// api/trainingApi.js
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import express from 'express';
import multer from 'multer';
import { OpenSearchClient } from '@opensearch-project/opensearch';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { DocxLoader } from 'langchain/document_loaders/fs/docx';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { createClient } from 'redis';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const opensearch = new OpenSearchClient({
  node: process.env.OPENSEARCH_URL
});

const redis = createClient({
  url: process.env.REDIS_URL
});

async function processDocument(file) {
  let loader;
  const buffer = file.buffer;
  
  switch(file.mimetype) {
    case 'application/pdf':
      loader = new PDFLoader(buffer);
      break;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      loader = new DocxLoader(buffer);
      break;
    default:
      loader = new TextLoader(buffer);
  }

  const docs = await loader.load();
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200
  });

  return await splitter.splitDocuments(docs);
}

async function indexDocuments(chunks, contextId) {
  const bulk = chunks.flatMap(chunk => [
    { index: { _index: `docs_${contextId}` } },
    {
      content: chunk.pageContent,
      metadata: chunk.metadata
    }
  ]);

  await opensearch.bulk({ body: bulk });
  await redis.set(`chunks:${contextId}`, JSON.stringify(chunks), 'EX', 86400); // 24hr TTL
}

// Create new training context
router.post('/context', async (req, res) => {
  const {
    businessType,
    industry,
    targetUser,
    specialInstructions,
    numQuestions
  } = req.body;

  const contextId = `ctx_${Date.now()}`;
  
  await redis.hSet(`context:${contextId}`, {
    businessType,
    industry,
    targetUser,
    specialInstructions,
    numQuestions: numQuestions || 25
  });

  res.json({ contextId });
});

// Upload and process documents
router.post('/documents/:contextId', upload.array('files'), async (req, res) => {
  const { contextId } = req.params;
  
  try {
    const processedDocs = await Promise.all(
      req.files.map(processDocument)
    );

    const allChunks = processedDocs.flat();
    await indexDocuments(allChunks, contextId);

    res.json({ success: true, documentCount: allChunks.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate training questions
router.post('/questions/:contextId', async (req, res) => {
  const { contextId } = req.params;
  
  try {
    const context = await redis.hGetAll(`context:${contextId}`);
    const chunks = JSON.parse(await redis.get(`chunks:${contextId}`));
    
    const prompt = `
      Generate ${context.numQuestions} questions for training a model to assist ${context.targetUser} 
      of a ${context.businessType} in the ${context.industry} industry.
      
      Special instructions: ${context.specialInstructions}
      
      Use these reference documents:
      ${chunks.slice(0, 5).map(c => c.pageContent).join('\n\n')}
      
      Questions should:
      1. Reflect real ${context.targetUser} inquiries and needs
      2. Cover key operational interactions
      3. Address common pain points
      4. Include scenario-based situations
    `;

    const response = await bedrock.send(new InvokeModelCommand({
      modelId: 'anthropic.claude-v2',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
        max_tokens: 2000,
        temperature: 0.7
      })
    }));

    const questions = JSON.parse(response.body.toString()).completion
      .split('\n')
      .filter(q => q.trim())
      .slice(0, context.numQuestions);

    await redis.set(`questions:${contextId}`, JSON.stringify(questions));
    res.json({ questions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate responses for a question
router.post('/responses/:contextId', async (req, res) => {
  const { contextId } = req.params;
  const { question } = req.body;
  
  try {
    const context = await redis.hGetAll(`context:${contextId}`);
    
    const relevantDocs = await opensearch.search({
      index: `docs_${contextId}`,
      body: {
        query: {
          match: {
            content: question
          }
        },
        size: 3
      }
    });

    const contextualContent = relevantDocs.body.hits.hits
      .map(hit => hit._source.content)
      .join('\n');

    const prompt = `
      You are assisting ${context.targetUser} of a ${context.businessType} in the ${context.industry} industry.
      Special context: ${context.specialInstructions}

      Generate 3 different responses to this question: "${question}"
      
      Reference material:
      ${contextualContent}

      Vary responses in:
      1. Detail level for ${context.targetUser}
      2. Tone (formal to conversational)
      3. Technical depth based on ${context.targetUser} expertise
    `;

    const response = await bedrock.send(new InvokeModelCommand({
      modelId: 'anthropic.claude-v2',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
        max_tokens: 1500,
        temperature: 0.7
      })
    }));

    const responses = JSON.parse(response.body.toString()).completion
      .split('\n')
      .filter(r => r.trim())
      .slice(0, 3);

    res.json({ responses });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save final training data
router.post('/save/:contextId', async (req, res) => {
  const { contextId } = req.params;
  const { questions } = req.body;
  
  try {
    const context = await redis.hGetAll(`context:${contextId}`);
    
    await opensearch.index({
      index: 'training_sets',
      id: contextId,
      body: {
        context,
        questions,
        timestamp: new Date()
      }
    });
    
    // Cleanup
    await Promise.all([
      redis.del(`context:${contextId}`),
      redis.del(`chunks:${contextId}`),
      redis.del(`questions:${contextId}`),
      opensearch.indices.delete({ index: `docs_${contextId}` })
    ]);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
