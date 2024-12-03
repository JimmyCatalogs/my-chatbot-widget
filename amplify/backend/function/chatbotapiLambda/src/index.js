const awsServerlessExpress = require('aws-serverless-express');
const app = require('./app');

// Define allowed origins
const allowedOrigins = [
  'http://localhost:9000',
  'http://localhost:3000',
  'https://dev.d14atbjemoqupg.amplifyapp.com'
];

/**
 * @type {import('http').Server}
 */
const server = awsServerlessExpress.createServer(app, null, [
  'application/json',
  'text/plain',
  'application/octet-stream'
], {
  binary: true
});

/**
 * @type {import('@types/aws-lambda').APIGatewayProxyHandler}
 */
exports.handler = async (event, context) => {
  // Print event details for debugging
  console.log('Lambda handler started');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context:', JSON.stringify({
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    memoryLimitInMB: context.memoryLimitInMB,
    remainingTime: context.getRemainingTimeInMillis(),
  }, null, 2));

  // Keep the Lambda function warm
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    // Get the origin from the request
    const origin = event.headers?.origin || event.headers?.Origin;
    const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    // Add CORS headers to the event
    if (!event.headers) {
      event.headers = {};
    }
    event.headers['Access-Control-Allow-Origin'] = allowedOrigin;
    event.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization';
    event.headers['Access-Control-Allow-Methods'] = 'GET,HEAD,PUT,PATCH,POST,DELETE';
    event.headers['Access-Control-Allow-Credentials'] = 'true';

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '3600'
        },
        body: ''
      };
    }

    // Handle the request
    const response = await awsServerlessExpress.proxy(server, event, context, 'PROMISE').promise;
    
    // Ensure response has proper headers
    response.headers = {
      ...response.headers,
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
      'Access-Control-Allow-Credentials': 'true'
    };

    console.log('Response:', JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    console.error('Error in Lambda handler:', error);
    console.error('Stack trace:', error.stack);

    // Get the origin from the request for error responses
    const origin = event.headers?.origin || event.headers?.Origin;
    const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    // Return a properly formatted error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        requestId: context.awsRequestId,
        timestamp: new Date().toISOString()
      })
    };
  }
};
