const {
  BedrockRuntimeClient,
} = require("@aws-sdk/client-bedrock-runtime");
const { 
  S3Client,
} = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocument } = require("@aws-sdk/lib-dynamodb");

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

const dynamoClient = DynamoDBDocument.from(new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
}));

module.exports = {
  bedrockClient,
  s3Client,
  dynamoClient
};
