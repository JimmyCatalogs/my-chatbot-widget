const cleanText = (text) => {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/["'']/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\n\d+\n/g, '\n')
    .trim();
};

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 50;

const createChunks = (text) => {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + CHUNK_SIZE;
    
    if (end >= text.length) {
      chunks.push(text.slice(start));
      break;
    }
    
    // Try to end chunk at a sentence boundary
    const nextPeriod = text.indexOf('.', end - 50);
    if (nextPeriod !== -1 && nextPeriod < end + 50) {
      end = nextPeriod + 1;
    }
    
    chunks.push(text.slice(start, end));
    start = end - CHUNK_OVERLAP;
  }
  
  return chunks;
};

function cosineSimilarity(a, b) {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

module.exports = {
  cleanText,
  createChunks,
  cosineSimilarity,
  CHUNK_SIZE,
  CHUNK_OVERLAP
};
