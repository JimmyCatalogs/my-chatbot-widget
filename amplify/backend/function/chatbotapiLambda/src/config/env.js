// Load environment variables for local development
const loadEnv = () => {
  if (process.env.NODE_ENV === 'development') {
    const requiredVars = [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_REGION',
      'CHUNKS_TABLE'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('Missing required environment variables:', missingVars.join(', '));
      console.error('Please ensure all required environment variables are set for local development');
      process.exit(1);
    }
  }
};

module.exports = { loadEnv };
