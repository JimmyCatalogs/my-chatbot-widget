const express = require('express');
const cors = require('cors');
const chatRoutes = require('./routes/chat-routes');
const docProcessingRoutes = require('./routes/doc-processing-routes');
const trainingRoutes = require('./routes/training-routes');
const errorHandlers = require('./middleware/error-handlers');

const app = express();

// Configure CORS
const corsOptions = {
  origin: [
    'http://localhost:9000',
    'http://localhost:3000',
    'https://dev.d14atbjemoqupg.amplifyapp.com',
  ],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Enable CORS with options
app.use(cors(corsOptions));

// Handle OPTIONS preflight
app.options('*', cors(corsOptions));

// Increase body size limit to 50MB
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: true}));

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/docs', docProcessingRoutes);
app.use('/api/training', trainingRoutes);

// Error handlers
app.use(errorHandlers.notFoundHandler);
app.use(errorHandlers.errorHandler);

// Add CORS headers to error responses
app.use((err, req, res, next) => {
  res.header('Access-Control-Allow-Origin', corsOptions.origin);
  res.header('Access-Control-Allow-Methods', corsOptions.methods);
  res.header('Access-Control-Allow-Headers', corsOptions.allowedHeaders);
  next(err);
});

module.exports = app;
