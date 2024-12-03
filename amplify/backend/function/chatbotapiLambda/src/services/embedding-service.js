const { InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { bedrockClient } = require('../config/aws-clients');

async function getEmbeddings(text) {
  console.log('Generating embeddings for text chunk');
  try {
    // Truncate text if it's too long (keeping first 2000 chars should be safe)
    const truncatedText = text.length > 2000 ? text.slice(0, 2000) + '...' : text;
    
    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Generate a vector embedding for this text. The embedding should be an array of 50 floating point numbers between -1 and 1. Respond with ONLY the array in JSON format, no other text:\n\n${truncatedText}`
        }
      ],
      temperature: 0
    };

    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      body: JSON.stringify(payload),
      contentType: "application/json",
      accept: "application/json",
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    console.log('Raw Claude response:', JSON.stringify(responseBody));
    
    let cleanedText = responseBody.content[0].text.trim();
    console.log('Cleaned response text:', cleanedText);
    
    // First try direct JSON parse
    try {
      const embedding = JSON.parse(cleanedText);
      if (isValidEmbedding(embedding)) {
        console.log(`Successfully parsed direct JSON embedding with length: ${embedding.length}`);
        return embedding;
      } else {
        console.log('Direct parse produced invalid embedding, trying array extraction');
      }
    } catch (e) {
      console.log('Direct parse failed, trying to extract array:', e.message);
    }
    
    // Try to extract array from response
    const arrayMatch = cleanedText.match(/\[[\s\S]*?\]/);
    if (!arrayMatch) {
      console.error('No array found in response:', cleanedText);
      throw new Error('No valid array found in embedding response');
    }
    
    cleanedText = arrayMatch[0];
    console.log('Extracted array text:', cleanedText);
    
    try {
      // Clean up any formatting issues
      cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
      const embedding = JSON.parse(cleanedText);
      
      if (!isValidEmbedding(embedding)) {
        console.error('Invalid embedding format after parsing:', embedding);
        throw new Error('Invalid embedding format');
      }
      
      console.log(`Successfully generated embedding with length: ${embedding.length}`);
      console.log('Embedding preview:', embedding.slice(0, 3), '...');
      return embedding;
    } catch (parseError) {
      console.error('Error parsing embedding array:', parseError);
      console.error('Failed text:', cleanedText);
      throw new Error(`Failed to parse embedding array: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error in getEmbeddings:', error);
    throw error;
  }
}

function isValidEmbedding(embedding) {
  const valid = (
    Array.isArray(embedding) &&
    embedding.length === 50 && // Must be exactly 50 dimensions
    embedding.every(num => 
      typeof num === 'number' &&
      !isNaN(num) &&
      num >= -1 &&
      num <= 1
    )
  );

  if (!valid) {
    console.log('Invalid embedding:', {
      isArray: Array.isArray(embedding),
      length: embedding?.length,
      allNumbers: embedding?.every(num => typeof num === 'number'),
      allValid: embedding?.every(num => !isNaN(num) && num >= -1 && num <= 1)
    });
  }

  return valid;
}

async function generateDocumentSummary(text) {
  console.log('Generating document summary');
  try {
    // Truncate text if needed
    const truncatedText = text.length > 4000 ? text.slice(0, 4000) + '...' : text;
    
    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Please provide a concise summary of this document, including its main topic and key points (max 2-3 sentences):\n\n${truncatedText}`
        }
      ],
      temperature: 0
    };

    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      body: JSON.stringify(payload),
      contentType: "application/json",
      accept: "application/json",
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.content[0].text.trim();
  } catch (error) {
    console.error('Error generating document summary:', error);
    throw error;
  }
}

module.exports = {
  getEmbeddings,
  generateDocumentSummary
};
