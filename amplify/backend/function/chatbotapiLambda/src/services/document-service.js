const { dynamoClient } = require('../config/aws-clients');
const { downloadPDFFromS3, extractTextFromPDF } = require('./pdf-service');
const { getEmbeddings, generateDocumentSummary } = require('./embedding-service');

const CHUNKS_TABLE = process.env.CHUNKS_TABLE || "chatbot-document-chunks";
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const MAX_CHUNKS_PER_QUERY = 5;

const cleanText = (text) => {
  if (!text) return '';
  
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const createChunks = (text) => {
  if (!text || text.length === 0) {
    console.log('Warning: Empty text provided to createChunks');
    return [];
  }

  console.log('Creating chunks from text of length:', text.length);
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + CHUNK_SIZE;
    if (end >= text.length) {
      chunks.push(text.slice(start));
      break;
    }
    
    const periodIndex = text.indexOf('.', end - CHUNK_OVERLAP);
    const newlineIndex = text.indexOf('\n', end - CHUNK_OVERLAP);
    const spaceIndex = text.indexOf(' ', end - CHUNK_OVERLAP);
    
    let breakPoint = end;
    if (periodIndex !== -1 && periodIndex < end + CHUNK_OVERLAP) {
      breakPoint = periodIndex + 1;
    } else if (newlineIndex !== -1 && newlineIndex < end + CHUNK_OVERLAP) {
      breakPoint = newlineIndex + 1;
    } else if (spaceIndex !== -1 && spaceIndex < end + CHUNK_OVERLAP) {
      breakPoint = spaceIndex + 1;
    }
    
    const chunk = text.slice(start, breakPoint).trim();
    if (chunk.length >= 50) {
      chunks.push(chunk);
    }
    start = breakPoint - CHUNK_OVERLAP;
  }
  
  const validChunks = chunks.filter(chunk => {
    const words = chunk.split(/\s+/).filter(word => word.length > 0);
    return words.length >= 5;
  });

  if (validChunks.length === 0 && text.length > 0) {
    console.log('Warning: No valid chunks created from non-empty text');
    console.log('Text sample:', text.slice(0, 200));
  }

  return validChunks;
};

async function processAndStoreDocument(url, agentName) {
  try {
    console.log('Starting document processing for URL:', url);
    console.log('Agent Name:', agentName);
    
    if (!agentName) {
      throw new Error('Agent name is required');
    }

    const docId = Buffer.from(url).toString('base64');
    const fileName = url.split('/').pop();
    
    console.log('Downloading PDF...');
    const pdfData = await downloadPDFFromS3(url);
    
    console.log('Extracting text from PDF...');
    const rawText = await extractTextFromPDF(pdfData);
    console.log(`Raw text extracted, length: ${rawText.length}`);
    
    const cleanedText = cleanText(rawText);
    console.log(`Text cleaned, final length: ${cleanedText.length}`);
    
    if (cleanedText.length === 0) {
      throw new Error('No text content could be extracted from the PDF');
    }
    
    console.log('Generating document summary...');
    const summary = await generateDocumentSummary(cleanedText.slice(0, 4000));
    console.log('Summary generated:', summary);
    
    console.log('Creating text chunks...');
    const chunks = createChunks(cleanedText);
    console.log(`Created ${chunks.length} chunks`);
    
    if (chunks.length === 0) {
      throw new Error('No valid chunks could be created from the PDF text');
    }
    
    let successfulChunks = 0;
    const failedChunks = [];
    
    // Delete existing chunks for this document if any
    const deleteParams = {
      TableName: CHUNKS_TABLE,
      KeyConditionExpression: 'docId = :docId',
      ExpressionAttributeValues: {
        ':docId': docId
      }
    };
    
    const existingChunks = await dynamoClient.query(deleteParams);
    if (existingChunks.Items && existingChunks.Items.length > 0) {
      console.log(`Deleting ${existingChunks.Items.length} existing chunks for document`);
      for (const chunk of existingChunks.Items) {
        await dynamoClient.delete({
          TableName: CHUNKS_TABLE,
          Key: {
            docId: chunk.docId,
            chunkId: chunk.chunkId
          }
        });
      }
    }
    
    // Process and store new chunks
    for (let i = 0; i < chunks.length; i++) {
      try {
        console.log(`Processing chunk ${i + 1}/${chunks.length}`);
        const chunk = chunks[i];
        
        console.log(`Generating embedding for chunk ${i + 1}...`);
        const embedding = await getEmbeddings(chunk);
        
        const chunkId = `${docId}_${i}`;
        const metadata = {
          fileName,
          position: i,
          sourceUrl: url,
          agentName,
          ...(i === 0 && summary && { summary })
        };
        
        await dynamoClient.put({
          TableName: CHUNKS_TABLE,
          Item: {
            docId,
            chunkId,
            text: chunk,
            embedding,
            metadata,
            agentName // Add at root level for querying
          }
        });
        
        console.log(`Chunk ${i + 1} stored successfully`);
        successfulChunks++;
      } catch (chunkError) {
        console.error(`Error processing chunk ${i}:`, chunkError);
        failedChunks.push(i);
      }
    }
    
    if (successfulChunks === 0) {
      throw new Error('Failed to process any chunks successfully');
    }
    
    return {
      fileName,
      summary,
      docId,
      totalChunks: chunks.length,
      successfulChunks,
      failedChunks: failedChunks.length
    };
  } catch (error) {
    console.error('Error in processAndStoreDocument:', error);
    throw error;
  }
}

async function findRelevantContext(query, agentName) {
  try {
    console.log('Finding relevant context for query:', query);
    console.log('Agent Name:', agentName);
    
    if (!agentName) {
      throw new Error('Agent name is required');
    }

    // Query chunks for this agent
    const { Items: chunks } = await dynamoClient.query({
      TableName: CHUNKS_TABLE,
      IndexName: 'AgentIndex', // Assuming we create a GSI on agentName
      KeyConditionExpression: 'agentName = :agentName',
      ExpressionAttributeValues: {
        ':agentName': agentName
      }
    });
    
    if (!chunks || chunks.length === 0) {
      console.log('No chunks found for agent:', agentName);
      throw new Error(`No document chunks found for agent: ${agentName}`);
    }
    
    console.log(`Found ${chunks.length} chunks for agent ${agentName}, generating query embedding...`);
    const queryEmbedding = await getEmbeddings(query);
    console.log('Query embedding generated, calculating similarities...');
    
    // Calculate similarities
    const similarities = [];
    for (const chunk of chunks) {
      if (!Array.isArray(chunk.embedding) || 
          chunk.embedding.length !== queryEmbedding.length ||
          !chunk.text || 
          typeof chunk.text !== 'string') {
        continue;
      }
      
      const dotProduct = queryEmbedding.reduce((sum, val, i) => sum + val * chunk.embedding[i], 0);
      const norm1 = Math.sqrt(queryEmbedding.reduce((sum, val) => sum + val * val, 0));
      const norm2 = Math.sqrt(chunk.embedding.reduce((sum, val) => sum + val * val, 0));
      const similarity = dotProduct / (norm1 * norm2);
      
      similarities.push({ chunk, similarity });
    }
    
    if (similarities.length === 0) {
      throw new Error('No valid chunks found for similarity calculation');
    }
    
    // Get top N most relevant chunks
    const topChunks = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MAX_CHUNKS_PER_QUERY)
      .map(item => item.chunk);
    
    console.log(`Selected top ${topChunks.length} chunks`);
    
    // Group chunks by document
    const chunksByDoc = topChunks.reduce((acc, chunk) => {
      const docId = chunk.docId;
      if (!acc[docId]) {
        acc[docId] = [];
      }
      acc[docId].push(chunk);
      return acc;
    }, {});
    
    // Assemble context with document attribution
    const contextParts = [];
    for (const chunks of Object.values(chunksByDoc)) {
      const fileName = chunks[0].metadata?.fileName || 'Unknown Document';
      const docContext = chunks
        .map(chunk => chunk.text.trim())
        .filter(text => text.length > 0)
        .join('\n\n');
      contextParts.push(`From document "${fileName}":\n\n${docContext}`);
    }
    
    const context = contextParts.join('\n\n---\n\n');
    console.log(`Assembled context with length: ${context.length}`);
    console.log('Context preview:', context.slice(0, 200) + '...');
    
    // Get summaries of all referenced documents
    const summaries = [...new Set(topChunks
      .map(chunk => chunk.metadata?.summary)
      .filter(Boolean))];
    
    return {
      context,
      summaries,
      documentCount: Object.keys(chunksByDoc).length,
      fileNames: [...new Set(topChunks.map(chunk => chunk.metadata?.fileName))]
    };
  } catch (error) {
    console.error('Error in findRelevantContext:', error);
    throw error;
  }
}

module.exports = {
  processAndStoreDocument,
  findRelevantContext
};
