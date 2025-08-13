import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { userEmail, files, sessionId } = body;

    if (!userEmail || !files || !sessionId) {
      return NextResponse.json({
        success: false,
        message: 'userEmail, files, and sessionId are required'
      }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const collection = db.collection('upload_sessions');

    console.log('Storing upload session:', { userEmail, sessionId, filesCount: files.length });
    console.log('Files being stored:', files.map((f: any) => ({ fileName: f.fileName, cleanedFilename: f.cleanedFilename, entriesCreated: f.entriesCreated })));

    // Check if session exists
    const existingSession = await collection.findOne({ userEmail, sessionId });
    
    if (existingSession) {
      // Update existing session
      const result = await collection.updateOne(
        { userEmail, sessionId },
        {
          $set: { 
            filesCount: files.length, 
            uploadedFiles: files, 
            updatedAt: new Date() 
          }
        }
      );
      console.log('Updated existing session:', { sessionId, modified: result.modifiedCount > 0 });
    } else {
      // Create new session
      const result = await collection.insertOne({
        userEmail,
        sessionId,
        filesCount: files.length,
        uploadedFiles: files,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log('Created new session:', { sessionId, inserted: result.insertedId });
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        userEmail,
        filesCount: files.length
      }
    });

  } catch (error) {
    console.error('Upload session storage error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to store upload session',
      error: 'STORAGE_ERROR'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get('userEmail');
    const sessionId = searchParams.get('sessionId');

    if (!userEmail) {
      return NextResponse.json({
        success: false,
        message: 'userEmail parameter is required'
      }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const collection = db.collection('upload_sessions');

    let query: any = { userEmail };
    if (sessionId) {
      query.sessionId = sessionId;
    }

    console.log('Querying upload sessions with:', query);

    // Get the most recent session for this user
    const sessions = await collection
      .find(query)
      .sort({ updatedAt: -1 })
      .limit(sessionId ? 1 : 10) // If specific session, get 1, otherwise get last 10
      .toArray();

    console.log('Found sessions:', sessions.length, sessions.map(s => ({ 
      sessionId: s.sessionId, 
      filesCount: s.filesCount,
      uploadedFilesCount: s.uploadedFiles?.length,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    })));

    // Detailed logging of the latest session
    if (sessions.length > 0) {
      const latestSession = sessions[0];
      console.log('Latest session details:', {
        sessionId: latestSession.sessionId,
        userEmail: latestSession.userEmail,
        filesCount: latestSession.filesCount,
        uploadedFiles: latestSession.uploadedFiles?.map((f: any) => ({
          fileName: f.fileName,
          cleanedFilename: f.cleanedFilename,
          entriesCreated: f.entriesCreated
        }))
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        sessions,
        latestSession: sessions[0] || null
      }
    });

  } catch (error) {
    console.error('Upload session retrieval error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to retrieve upload session',
      error: 'RETRIEVAL_ERROR'
    }, { status: 500 });
  }
}
