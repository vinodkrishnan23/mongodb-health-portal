import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'mongodlog_analyzer';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'log_files';

// Helper function to get MongoDB connection
async function getMongoClient(): Promise<MongoClient> {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  return client;
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  let client: MongoClient | null = null;
  
  try {
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get('userEmail') || request.headers.get('x-user-email');
    const sessionId = searchParams.get('sessionId');
    const sourceFile = searchParams.get('sourceFile');
    
    if (!userEmail) {
      return NextResponse.json({
        success: false,
        message: 'User email is required'
      }, { status: 400 });
    }

    console.log(`🗑️ Flushing data for user: ${userEmail}`);
    console.log(`🗑️ Parameters received: sessionId=${sessionId}, sourceFile=${sourceFile}`);
    
    client = await getMongoClient();
    const db = client.db(DB_NAME);
    
    let deleteQuery: any = { userEmail };
    let deleteDescription = `all data for user ${userEmail}`;
    
    // If sessionId is provided, delete only that session's data
    if (sessionId) {
      deleteQuery.uploadSessionId = sessionId;
      deleteDescription = `session ${sessionId} data for user ${userEmail}`;
      console.log(`🗑️ Deleting data for specific session: ${sessionId}`);
    }
    
    // If sourceFile is provided, delete only that file's data
    if (sourceFile) {
      deleteQuery.sourceFile = sourceFile;
      deleteDescription = `sourceFile ${sourceFile} data for user ${userEmail}`;
      console.log(`🗑️ Deleting data for specific sourceFile: ${sourceFile}`);
    }
    
    console.log('🗑️ Delete query for log_files:', deleteQuery);
    
    // First, let's check what data exists before deletion
    const logFilesCollection = db.collection(COLLECTION_NAME);
    const uploadSessionsCollection = db.collection('upload_sessions');
    
    const existingLogFiles = await logFilesCollection.countDocuments(deleteQuery);
    console.log(`🗑️ Found ${existingLogFiles} log files matching query`);
    
    const existingSessionsQuery: any = { userEmail };
    if (sessionId) {
      existingSessionsQuery.sessionId = sessionId;
    }
    const existingSessions = await uploadSessionsCollection.countDocuments(existingSessionsQuery);
    console.log(`🗑️ Found ${existingSessions} upload sessions matching query:`, existingSessionsQuery);
    
    // Delete from log_files collection
    const logDeleteResult = await logFilesCollection.deleteMany(deleteQuery);
    
    console.log(`🗑️ Deleted ${logDeleteResult.deletedCount} log entries`);
    
    // If deleting by sessionId or all data, also delete from upload_sessions
    let sessionDeleteResult = null;
    if (sessionId || (!sessionId && !sourceFile)) {
      const uploadSessionsCollection = db.collection('upload_sessions');
      
      let sessionDeleteQuery: any = { userEmail };
      if (sessionId) {
        sessionDeleteQuery.sessionId = sessionId;
      }
      
      sessionDeleteResult = await uploadSessionsCollection.deleteMany(sessionDeleteQuery);
      console.log(`🗑️ Deleted ${sessionDeleteResult.deletedCount} upload session records`);
    }
    
    // If deleting specific sourceFile, update upload_sessions to remove that file
    if (sourceFile && !sessionId) {
      const uploadSessionsCollection = db.collection('upload_sessions');
      
      // Remove the specific file from uploadedFiles arrays and decrement filesCount
      const updateResult = await uploadSessionsCollection.updateMany(
        { 
          userEmail,
          "uploadedFiles.fileName": sourceFile
        },
        {
          $pull: { uploadedFiles: { fileName: sourceFile } },
          $inc: { filesCount: -1 }
        }
      );
      
      console.log(`🗑️ Updated ${updateResult.modifiedCount} upload session records to remove sourceFile`);
      
      // Delete sessions that have no files left
      const cleanupResult = await uploadSessionsCollection.deleteMany({
        userEmail,
        $or: [
          { filesCount: { $lte: 0 } },
          { uploadedFiles: { $size: 0 } }
        ]
      });
      
      console.log(`🗑️ Cleaned up ${cleanupResult.deletedCount} empty upload sessions`);
    }
    
    return NextResponse.json({
      success: true,
      message: `Successfully flushed ${deleteDescription}`,
      data: {
        logEntriesDeleted: logDeleteResult.deletedCount,
        uploadSessionsDeleted: sessionDeleteResult?.deletedCount || 0,
        deleteQuery,
        userEmail,
        sessionId,
        sourceFile
      }
    });

  } catch (error) {
    console.error('Flush API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({
      success: false,
      message: 'Failed to flush data',
      error: 'FLUSH_API_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    if (client) {
      await client.close();
    }
  }
}