function notFoundHandler(req, res) {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found`
  });
}

function errorHandler(error, req, res, next) {
  console.error("Unhandled error:", error.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: error.message
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
