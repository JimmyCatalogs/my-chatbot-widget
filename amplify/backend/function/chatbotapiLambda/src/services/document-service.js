const { dynamoClient } = require('../config/aws-clients');
const { downloadPDFFromS3 } = require('./pdf-service');
const { getEmbeddings, generateDocumentSummary } = require('./embedding-service');
const { cleanText, createChunks, cosineSimilarity } = require('../utils/document-utils');
const pdfParse = require('pdf-parse');

const CHUNKS_TABLE = process.env.CHUNKS_TABLE || "DocumentChunks";
const BATCH_SIZE = 5; // Process 5 chunks at a time to avoid timeouts

async function processAndStoreDocument(url, contextId = null) {
  console.log(`Processing document from URL: ${url}`);
  try {
    const docId = Buffer.from(url).toString('base64');
    
    // Check for existing chunks
    const { Items: existingChunks } = await dynamoClient.query({
      TableName: CHUNKS_TABLE,
      KeyConditionExpression: 'docId = :docId',
      ExpressionAttributeValues: {
        ':docId': docId
      }
    });
    
    if (existingChunks && existingChunks.length > 0) {
      console.log('Found existing chunks');
      return {
        chunks: existingChunks.map(c => c.text),
        embeddings: existingChunks.map(c => c.embedding),
        summary: existingChunks[0].metadata.summary,
        fullText: existingChunks.map(c => c.text).join(' ')
      };
    }

    // Download and parse PDF
    const pdfBuffer = await downloadPDFFromS3(url);
    console.log('PDF downloaded successfully');

    const pdfData = await pdfParse(pdfBuffer);
    const cleanedText = cleanText(pdfData.text);
    console.log(`PDF parsed and cleaned, text length: ${cleanedText.length}`);
    
    // Generate document summary first
    console.log('Generating document summary...');
    const summary = await generateDocumentSummary(cleanedText);
    console.log('Summary generated:', summary);
    
    // Split into chunks
    const chunks = createChunks(cleanedText);
    console.log(`Split into ${chunks.length} chunks`);
    
    // Process chunks in batches
    const processedChunks = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${i/BATCH_SIZE + 1}/${Math.ceil(chunks.length/BATCH_SIZE)}`);
      
      // Generate embeddings for batch
      const batchEmbeddings = await Promise.all(
        batch.map(chunk => getEmbeddings(chunk))
      );
      
      // Store chunks with embeddings
      await Promise.all(batch.map((chunk, index) => {
        const chunkId = `${docId}_${i + index}`;
        return dynamoClient.put({
          TableName: CHUNKS_TABLE,
          Item: {
            docId,
            chunkId,
            text: chunk,
            embedding: batchEmbeddings[index],
            metadata: {
              position: i + index,
              charLength: chunk.length,
              tokenEstimate: chunk.split(/\s+/).length,
              sourceUrl: url,
              contextId: contextId, // Store contextId if provided (for training docs)
              summary: i === 0 ? summary : undefined // Store summary with first chunk
            }
          }
        });
      }));
      
      processedChunks.push(...batch.map((chunk, index) => ({
        text: chunk,
        embedding: batchEmbeddings[index]
      })));
      
      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('All chunks processed and stored');
    return {
      chunks: processedChunks.map(c => c.text),
      embeddings: processedChunks.map(c => c.embedding),
      summary,
      fullText: cleanedText
    };
  } catch (error) {
    console.error('Error processing document:', error.stack);
    throw error;
  }
}

async function findRelevantContext(query, url) {
  console.log(`Finding relevant context for query: "${query}"`);
  try {
    const { chunks, embeddings, summary } = await processAndStoreDocument(url);
    
    // For document overview queries, return the summary
    const overviewKeywords = ['tell me about', 'what is', 'summarize', 'overview', 'summary'];
    if (overviewKeywords.some(keyword => query.toLowerCase().includes(keyword))) {
      return { context: summary, isOverview: true, summary };
    }
    
    console.log('Document processed, generating query embedding');
    const queryEmbedding = await getEmbeddings(query);
    console.log('Query embedding generated, calculating similarities');
    
    // Calculate similarities and get top 3 most relevant chunks
    const similarities = embeddings.map(embedding => cosineSimilarity(queryEmbedding, embedding));
    const topIndices = similarities
      .map((similarity, index) => ({ similarity, index }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map(item => item.index);
    
    console.log(`Found top ${topIndices.length} relevant chunks`);
    const relevantContext = topIndices.map(index => chunks[index]).join('\n\n');
    return { context: relevantContext, isOverview: false, summary };
  } catch (error) {
    console.error('Error finding relevant context:', error.stack);
    throw error;
  }
}

async function getStoredChunks(contextId) {
  try {
    const { Items: chunks } = await dynamoClient.query({
      TableName: CHUNKS_TABLE,
      IndexName: 'contextId-index',
      KeyConditionExpression: 'contextId = :contextId',
      ExpressionAttributeValues: {
        ':contextId': contextId
      }
    });
    
    if (chunks && chunks.length > 0) {
      return chunks.map(chunk => ({
        text: chunk.text,
        embedding: chunk.embedding
      }));
    }
    return [];
  } catch (error) {
    console.error('Error getting stored chunks:', error);
    throw error;
  }
}

module.exports = {
  processAndStoreDocument,
  findRelevantContext,
  getStoredChunks
};
