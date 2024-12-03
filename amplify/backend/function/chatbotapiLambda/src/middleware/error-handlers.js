function notFoundHandler(req, res) {
  console.log(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found`
  });
}

function errorHandler(error, req, res, next) {
  // Log the full error with stack trace
  console.error("Unhandled error:", {
    message: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code,
    path: req.path,
    method: req.method,
    body: req.body
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: "Validation Error",
      message: error.message,
      details: error.details
    });
  }

  if (error.code === 'InvalidParameterException') {
    return res.status(400).json({
      error: "Invalid Parameter",
      message: error.message,
      details: error.details
    });
  }

  if (error.code === 'ResourceNotFoundException') {
    return res.status(404).json({
      error: "Resource Not Found",
      message: error.message,
      details: error.details
    });
  }

  if (error.code === 'AccessDeniedException') {
    return res.status(403).json({
      error: "Access Denied",
      message: error.message,
      details: "Please check IAM permissions"
    });
  }

  // For S3 and PDF processing errors
  if (error.message && error.message.includes('PDF')) {
    return res.status(400).json({
      error: "PDF Processing Error",
      message: error.message,
      details: error.details || "Error processing PDF document"
    });
  }

  // For DynamoDB errors
  if (error.name === 'DynamoDBError' || (error.message && error.message.includes('DynamoDB'))) {
    return res.status(500).json({
      error: "Database Error",
      message: "Error accessing database",
      details: error.message
    });
  }

  // For Bedrock/Claude errors
  if (error.message && (error.message.includes('Bedrock') || error.message.includes('Claude'))) {
    return res.status(500).json({
      error: "AI Processing Error",
      message: "Error processing with AI model",
      details: error.message
    });
  }

  // Default error response
  res.status(500).json({
    error: "Internal Server Error",
    message: "An unexpected error occurred",
    details: error.message,
    requestPath: req.path,
    requestMethod: req.method
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
