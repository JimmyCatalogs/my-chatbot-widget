const {
  BedrockRuntimeClient,
} = require("@aws-sdk/client-bedrock-runtime");
const { 
  S3Client,
} = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocument } = require("@aws-sdk/lib-dynamodb");

// Common config for local development
const localConfig = {
  region: process.env.AWS_REGION || "us-east-1",
  credentials: process.env.NODE_ENV === 'development' ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  } : undefined
};

const bedrockClient = new BedrockRuntimeClient(localConfig);
const s3Client = new S3Client(localConfig);
const dynamoClient = DynamoDBDocument.from(new DynamoDBClient(localConfig), {
  marshallOptions: {
    removeUndefinedValues: true,
  }
});

// Mock clients for development if needed
const getMockClient = (client, name) => {
  if (process.env.NODE_ENV === 'development' && !process.env.AWS_ACCESS_KEY_ID) {
    console.warn(`Warning: No AWS credentials found. ${name} operations will be mocked.`);
    return {
      send: async (command) => {
        console.log(`Mock ${name} command:`, command.constructor.name);
        return { mock: true };
      }
    };
  }
  return client;
};

module.exports = {
  bedrockClient: getMockClient(bedrockClient, 'Bedrock'),
  s3Client: getMockClient(s3Client, 'S3'),
  dynamoClient: getMockClient(dynamoClient, 'DynamoDB')
};
