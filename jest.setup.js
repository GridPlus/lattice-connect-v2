const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.test file
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

// Add any other global setup here
jest.setTimeout(60000); // Set default timeout to 60 seconds 