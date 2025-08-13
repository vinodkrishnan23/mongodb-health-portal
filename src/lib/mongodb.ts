import { MongoClient, Db, Collection } from 'mongodb';

let client: MongoClient;
let db: Db;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'mongolog_analyzer';

export async function connectToDatabase(): Promise<{ db: Db; client: MongoClient }> {
  if (client && db) {
    return { db, client };
  }

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE_NAME);

    console.log('Connected to MongoDB');
    return { db, client };
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function getLogFilesCollection(): Promise<Collection> {
  const { db } = await connectToDatabase();
  return db.collection('log_entries');
}

export async function getUserEmailCollection(): Promise<Collection> {
  const { db } = await connectToDatabase();
  return db.collection('user_email');
}

export async function closeDatabaseConnection(): Promise<void> {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
  }
}
