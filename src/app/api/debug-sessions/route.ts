import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'mongodlog_analyzer';

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

    console.log(`🔍 DEBUG: Checking database for user: ${userEmail}`);
    
    client = await getMongoClient();
    const db = client.db(DB_NAME);
    
    // Check upload_sessions collection
    const uploadSessionsCollection = db.collection('upload_sessions');
    const sessionCount = await uploadSessionsCollection.countDocuments({ userEmail });
    const allSessions = await uploadSessionsCollection.find({ userEmail }).toArray();
    
    console.log(`🔍 DEBUG: Found ${sessionCount} upload_sessions for ${userEmail}`);
    
    // Check log_files collection for this user
    const logFilesCollection = db.collection('log_files');
    const logFilesCount = await logFilesCollection.countDocuments({ userEmail });
    const distinctSourceFiles = await logFilesCollection.distinct('sourceFile', { userEmail });
    const distinctUploadSessionIds = await logFilesCollection.distinct('uploadSessionId', { userEmail });
    
    console.log(`🔍 DEBUG: Found ${logFilesCount} log entries for ${userEmail}`);
    console.log(`🔍 DEBUG: Distinct sourceFiles:`, distinctSourceFiles);
    console.log(`🔍 DEBUG: Distinct uploadSessionIds:`, distinctUploadSessionIds);
    
    // Get sample log entries to see what data we have
    const sampleLogEntries = await logFilesCollection.find(
      { userEmail }, 
      { 
        projection: { 
          sourceFile: 1, 
          uploadSessionId: 1, 
          uploadDate: 1,
          userName: 1,
          fileClassification: 1,
          mongodbVersion: 1
        },
        limit: 5 
      }
    ).toArray();
    
    return NextResponse.json({
      success: true,
      debug: {
        userEmail,
        uploadSessions: {
          count: sessionCount,
          records: allSessions
        },
        logFiles: {
          count: logFilesCount,
          distinctSourceFiles,
          distinctUploadSessionIds,
          sampleEntries: sampleLogEntries
        },
        suggestions: sessionCount === 0 ? [
          "No upload_sessions found - this means the Python upload script may not be creating session records",
          "Check if you've uploaded files using the new Python script with session tracking",
          "If you have log_files data but no upload_sessions, you may need to re-upload or create session records manually"
        ] : []
      }
    });

  } catch (error) {
    console.error('Debug sessions API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({
      success: false,
      message: 'Failed to debug sessions',
      error: 'DEBUG_SESSIONS_API_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    if (client) {
      await client.close();
    }
  }
}
