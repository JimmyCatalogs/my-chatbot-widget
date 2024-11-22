const express = require("express");
const bodyParser = require("body-parser");
const awsServerlessExpressMiddleware = require("aws-serverless-express/middleware");
const chatRoutes = require('./routes/chat-routes');
const trainingRoutes = require('./routes/training-routes');
const { notFoundHandler, errorHandler } = require('./middleware/error-handlers');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(awsServerlessExpressMiddleware.eventContext());

// CORS headers for API endpoints
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

app.options("/api/*", function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  );
  res.sendStatus(200);
});

// Routes
app.use("/api", chatRoutes);
app.use("/api/training", trainingRoutes);

// Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
