const { GetObjectCommand } = require("@aws-sdk/client-s3");
const pdfParse = require('pdf-parse');
const { s3Client } = require('../config/aws-clients');

async function downloadPDFFromS3(url) {
  console.log(`Downloading PDF from URL: ${url}`);
  try {
    const urlParts = url.replace('https://', '').split('/');
    const bucket = urlParts[0].split('.')[0];
    const key = urlParts.slice(1).join('/');

    console.log(`Accessing S3 - Bucket: ${bucket}, Key: ${key}`);

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const response = await s3Client.send(command);
    const chunks = [];
    
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    console.log(`Successfully downloaded PDF, size: ${buffer.length} bytes`);
    
    return buffer;
  } catch (error) {
    console.error('Error downloading PDF:', error);
    throw error;
  }
}

module.exports = {
  downloadPDFFromS3
};
