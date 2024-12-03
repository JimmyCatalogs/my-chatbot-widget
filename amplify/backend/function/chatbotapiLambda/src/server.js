require('dotenv').config();
const { loadEnv } = require('./config/env');
const app = require('./app');

// Load and validate environment variables
loadEnv();

// Start the server
app.listen(3001, () => {
  console.log('Backend running on http://localhost:3001');
});
