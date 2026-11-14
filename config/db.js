// MongoDB connection (Atlas or local, from MONGODB_URI in .env)
const mongoose = require('mongoose');

async function connectDB(uri) {
  if (!uri || uri.includes('<username>')) {
    console.warn('MONGODB_URI is not set in .env - the app needs a database to run.');
    return false;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('Connected to MongoDB:', mongoose.connection.name);
    return true;
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    return false;
  }
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isConnected };
