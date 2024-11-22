// src/lambda/processPdf/index.js
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { PDFDocument } from 'pdf-lib';

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const dynamoClient = DynamoDBDocument.from(new DynamoDBClient({ region: process.env.AWS_REGION }));

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 50;

// Utility functions
const cleanText = (text) => {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/["'']/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\n\d+\n/g, '\n')
    .trim();
};

const createChunks = (text) => {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + CHUNK_SIZE;
    
    if (end >= text.length) {
      chunks.push(text.slice(start));
      break;
    }
    
    const nextPeriod = text.indexOf('.', end - 50);
    if (nextPeriod !== -1 && nextPeriod < end + 50) {
      end = nextPeriod + 1;
    }
    
    chunks.push(text.slice(start, end));
    start = end - CHUNK_OVERLAP;
  }
  
  return chunks;
};

const getEmbedding = async (text) => {
  try {
    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Please generate an embedding vector for the following text. Respond only with the vector as a JSON array of numbers:\n\n${text}`
          }
        ]
      }),
      contentType: "application/json",
      accept: "application/json",
    });

    const response = await bedrockClient.send(command);
    const embedding = JSON.parse(Buffer.from(response.body).toString()).content[0].vector;
    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
};

// Process PDF Lambda Handler
export const processPdfHandler = async (event) => {
  try {
    const { s3Key } = JSON.parse(event.body);
    
    // Get PDF from S3
    const getCommand = new GetObjectCommand({
      Bucket: process.env.PDF_BUCKET,
      Key: s3Key
    });
    
    const { Body } = await s3Client.send(getCommand);
    const pdfBuffer = await streamToBuffer(Body);
    
    // Extract text from PDF
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const numPages = pdfDoc.getPages().length;
    let fullText = '';
    
    for (let i = 0; i < numPages; i++) {
      const page = pdfDoc.getPage(i);
      const text = await page.getText();
      fullText += text + '\n';
    }
    
    // Process text into chunks
    const cleanedText = cleanText(fullText);
    const chunks = createChunks(cleanedText);
    const docId = `doc_${Date.now()}`;
    
    // Process and store chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk);
      const chunkId = `${docId}_${i}`;
      
      // Store chunk in DynamoDB
      await dynamoClient.put({
        TableName: process.env.CHUNKS_TABLE,
        Item: {
          chunkId,
          text: chunk,
          embedding,
          metadata: {
            docId,
            position: i,
            charLength: chunk.length,
            tokenEstimate: chunk.split(/\s+/).length,
            sourceKey: s3Key
          }
        }
      });
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        docId,
        chunks: chunks.length
      })
    };
    
  } catch (error) {
    console.error('Error processing PDF:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process PDF' })
    };
  }
};

// Search/Query Lambda Handler
export const searchHandler = async (event) => {
  try {
    const { query } = JSON.parse(event.body);
    
    // Get query embedding
    const queryEmbedding = await getEmbedding(query);
    
    // Search for similar chunks in DynamoDB
    // Note: This is a simplified similarity search. In production,
    // you might want to use a proper vector database or AWS OpenSearch
    const { Items: chunks } = await dynamoClient.scan({
      TableName: process.env.CHUNKS_TABLE
    });
    
    // Calculate cosine similarity and sort chunks
    const results = chunks
      .map(chunk => ({
        ...chunk,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
    
    // Use Claude to generate answer based on relevant chunks
    const contextText = results
      .map(r => r.text)
      .join('\n\n');
      
    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `Based on the following context, please answer this question: ${query}\n\nContext:\n${contextText}`
          }
        ]
      }),
      contentType: "application/json",
      accept: "application/json",
    });

    const response = await bedrockClient.send(command);
    const answer = JSON.parse(Buffer.from(response.body).toString()).content[0].text;
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        answer,
        relevantChunks: results.map(r => ({
          text: r.text,
          similarity: r.similarity,
          metadata: r.metadata
        }))
      })
    };
    
  } catch (error) {
    console.error('Error performing search:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Search failed' })
    };
  }
};

// Utility function for cosine similarity
const cosineSimilarity = (vec1, vec2) => {
  const dotProduct = vec1.reduce((acc, val, i) => acc + val * vec2[i], 0);
  const norm1 = Math.sqrt(vec1.reduce((acc, val) => acc + val * val, 0));
  const norm2 = Math.sqrt(vec2.reduce((acc, val) => acc + val * val, 0));
  return dotProduct / (norm1 * norm2);
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};
