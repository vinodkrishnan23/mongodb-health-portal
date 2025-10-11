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

export async function GET(request: NextRequest): Promise<NextResponse> {
  let client: MongoClient | null = null;
  
  try {
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get('userEmail') || request.headers.get('x-user-email');
    
    if (!userEmail) {
      return NextResponse.json({
        success: false,
        message: 'User email is required'
      }, { status: 400 });
    }

    console.log(`🔍 Debug flush: Checking data for user: ${userEmail}`);
    
    client = await getMongoClient();
    const db = client.db(DB_NAME);
    
    // Check upload_sessions
    const uploadSessionsCollection = db.collection('upload_sessions');
    const sessions = await uploadSessionsCollection.find({ userEmail }).toArray();
    
    console.log(`🔍 Found ${sessions.length} upload sessions:`);
    sessions.forEach((session, index) => {
      console.log(`  Session ${index + 1}: sessionId="${session.sessionId}", files=${session.filesCount}`);
    });
    
    // Check log_files
    const logFilesCollection = db.collection(COLLECTION_NAME);
    const logFiles = await logFilesCollection.find({ userEmail }).limit(5).toArray();
    
    console.log(`🔍 Sample log files (first 5):`);
    logFiles.forEach((file, index) => {
      console.log(`  File ${index + 1}: uploadSessionId="${file.uploadSessionId}", sourceFile="${file.sourceFile}"`);
    });
    
    // Count total log files
    const totalLogFiles = await logFilesCollection.countDocuments({ userEmail });
    
    // Get unique uploadSessionIds from log_files
    const uniqueUploadSessions = await logFilesCollection.distinct('uploadSessionId', { userEmail });
    
    console.log(`🔍 Total log files: ${totalLogFiles}`);
    console.log(`🔍 Unique uploadSessionIds in log_files: ${uniqueUploadSessions.length}`);
    console.log(`🔍 uploadSessionIds:`, uniqueUploadSessions);
    
    return NextResponse.json({
      success: true,
      data: {
        userEmail,
        uploadSessions: sessions.map(s => ({
          sessionId: s.sessionId,
          filesCount: s.filesCount,
          createdAt: s.createdAt,
          uploadedFiles: s.uploadedFiles?.map(f => ({ fileName: f.fileName, cleanedFilename: f.cleanedFilename }))
        })),
        totalLogFiles,
        uniqueUploadSessionIds: uniqueUploadSessions,
        sampleLogFiles: logFiles.map(f => ({
          uploadSessionId: f.uploadSessionId,
          sourceFile: f.sourceFile,
          logTimestamp: f.logTimestamp,
          lineNumber: f.lineNumber
        }))
      }
    });

  } catch (error) {
    console.error('Debug flush API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({
      success: false,
      message: 'Failed to debug flush data',
      error: 'DEBUG_FLUSH_API_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    if (client) {
      await client.close();
    }
  }
}
