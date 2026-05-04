import { MongoMemoryServer } from 'mongodb-memory-server';
/**
 * Mock in-memory DB for testing purpose
 */
import mongoose from 'mongoose';

export type MongoMemoryServerHelper = typeof mongoose;

export const clearDatabase = async (): Promise<void> => {
  const collections = await mongoose.connection.db?.collections();

  if (collections) {
    await Promise.all(collections.map(async (collection) => collection.deleteMany({})));
  }
};

/**
 * Connect to mock memory db.
 * Using MongoMemoryReplSet to parallelize the capabilities of our cluster in staging and production.
 * In order to be able to use MongoDB transactions, a replica set is required,
 * and it's mandatory to use one to actually run the tests that imply transactions.
 * For more information about transactions, check: https://www.mongodb.com/docs/manual/core/transactions/
 */
export const connect = async (testSuiteName: string): Promise<typeof mongoose> => {
  const mongoServer = await MongoMemoryServer.create();
  const db = await mongoose.connect(mongoServer.getUri(), {
    directConnection: true,
    dbName: testSuiteName
  });

  // Clear all data
  await clearDatabase();

  return db;
};

/**
 * Close db connection
 */
export const closeDatabase = async (db: typeof mongoose): Promise<void> => {
  try {
    // await mongoose.connection.db.dropDatabase();
    await mongoose.connection.close();
    if (db) {
      await db.disconnect();
    }
  } catch (err) {
    console.error(err);
  }
};
