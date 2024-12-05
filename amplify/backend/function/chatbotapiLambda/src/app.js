const express = require('express');
const chatRoutes = require('./routes/chat-routes');
const docProcessingRoutes = require('./routes/doc-processing-routes');
const trainingRoutes = require('./routes/training-routes');
const errorHandlers = require('./middleware/error-handlers');

const app = express();

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

module.exports = app;
