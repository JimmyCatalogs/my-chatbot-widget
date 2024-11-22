const { InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { bedrockClient } = require('../config/aws-clients');

async function getEmbeddings(text) {
  console.log('Generating embeddings for text chunk');
  try {
    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Convert this text into a numerical vector representation. Respond with ONLY a JSON array of 384 numbers between -1 and 1, no other text:\n\n${text}`
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
    console.log('Raw embedding response:', responseBody.content[0].text);
    
    // Clean the response text
    let cleanedText = responseBody.content[0].text.trim();
    cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    cleanedText = cleanedText.replace(/^[^[\n]*/, '').replace(/[^\]]*$/, '');
    
    console.log('Cleaned embedding text:', cleanedText);
    
    try {
      const embedding = JSON.parse(cleanedText);
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Invalid embedding format - expected non-empty array');
      }
      console.log(`Successfully generated embedding with length: ${embedding.length}`);
      return embedding;
    } catch (parseError) {
      console.error('Error parsing embedding response. Cleaned text:', cleanedText);
      throw new Error(`Failed to parse embedding: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw error;
  }
}

async function generateDocumentSummary(text) {
  console.log('Generating document summary');
  try {
    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Please provide a concise summary of this document, including its main topic and key points:\n\n${text}`
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
