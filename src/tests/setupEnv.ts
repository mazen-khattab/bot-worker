process.env.WORKER_API_KEY = 'test-worker-api-key-1234567890';
process.env.DOTNET_API_URL = 'http://localhost:5001';
process.env.DOTNET_API_KEY = 'test-dotnet-api-key';
process.env.DLQ_FILE_PATH = './data/dlq.test.' + (process.env.VITEST_WORKER_ID || Math.random().toString(36).substring(7)) + '.json';
process.env.SCREENSHOT_DIR = './screenshots-test';
process.env.NODE_ENV = 'test';
export {};
