const { GetObjectCommand } = require("@aws-sdk/client-s3");
const pdfParse = require('pdf-parse');
const { s3Client } = require('../config/aws-clients');

const S3_BUCKET = process.env.S3_BUCKET || 'ai-testing-jw';

async function downloadPDFFromS3(url) {
  console.log(`Downloading PDF from URL: ${url}`);
  try {
    if (!url) {
      throw new Error('URL is required');
    }

    let bucket = S3_BUCKET;
    let key = url;

    // If it's a full URL, parse it
    if (url.startsWith('https://')) {
      console.log('Parsing S3 URL components...');
      const urlParts = url.replace('https://', '').split('/');
      
      if (urlParts.length < 2) {
        throw new Error('Invalid S3 URL format - must include bucket and key');
      }

      const bucketParts = urlParts[0].split('.');
      if (bucketParts.length === 0) {
        throw new Error('Could not parse bucket name from URL');
      }

      bucket = bucketParts[0];
      key = urlParts.slice(1).join('/');
    }

    if (!bucket || !key) {
      throw new Error(`Invalid S3 components - Bucket: ${bucket}, Key: ${key}`);
    }

    console.log(`Using S3 components - Bucket: ${bucket}, Key: ${key}`);

    console.log('Initiating S3 GetObject request...');
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    console.log('Sending S3 request...');
    const response = await s3Client.send(command);
    
    console.log('S3 request successful, streaming response body...');
    const chunks = [];
    
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    console.log(`Successfully downloaded PDF, size: ${buffer.length} bytes`);
    
    if (buffer.length === 0) {
      throw new Error('Downloaded file is empty');
    }

    if (buffer.slice(0, 5).toString() !== '%PDF-') {
      throw new Error('Downloaded file is not a valid PDF');
    }
    
    return buffer;
  } catch (error) {
    console.error('Error in downloadPDFFromS3:', error);
    throw new Error(`PDF download failed: ${error.message}`);
  }
}

async function extractTextFromPDF(pdfBuffer) {
  console.log('Attempting to extract text from PDF...');
  try {
    const data = await pdfParse(pdfBuffer);
    
    if (!data || !data.text) {
      throw new Error('No text content extracted from PDF');
    }

    let extractedText = data.text;
    console.log(`Raw text extracted, length: ${extractedText.length}`);

    // Clean up the text
    extractedText = extractedText
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\x20-\x7E\n]/g, '') // Remove non-printable characters except newlines
      .replace(/\n\s*\n/g, '\n\n') // Normalize multiple newlines
      .trim();

    if (!extractedText) {
      throw new Error('No valid text content after cleaning');
    }

    console.log(`Successfully extracted ${extractedText.length} characters`);
    console.log('Sample of extracted text:', extractedText.slice(0, 500));
    
    return extractedText;
  } catch (error) {
    console.error('Error in extractTextFromPDF:', error);
    throw new Error(`PDF text extraction failed: ${error.message}`);
  }
}

module.exports = {
  downloadPDFFromS3,
  extractTextFromPDF
};
