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

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    console.log(`🔄 MIGRATION: Creating upload_sessions from existing log_files for user: ${userEmail}`);
    
    client = await getMongoClient();
    const db = client.db(DB_NAME);
    
    const logFilesCollection = db.collection(COLLECTION_NAME);
    const uploadSessionsCollection = db.collection('upload_sessions');
    
    // Get all unique uploadSessionIds for this user
    const existingSessions = await uploadSessionsCollection.distinct('sessionId', { userEmail });
    console.log(`🔄 MIGRATION: Found ${existingSessions.length} existing sessions`);
    
    // Get unique upload sessions from log_files
    const logFilesSessions = await logFilesCollection.aggregate([
      { 
        $match: { 
          userEmail,
          uploadSessionId: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            uploadSessionId: "$uploadSessionId",
            userEmail: "$userEmail",
            userName: "$userName"
          },
          files: {
            $addToSet: {
              fileName: "$sourceFile",
              cleanedFilename: { $ifNull: ["$sourceFile", "$node_name"] },
              classification: { $ifNull: ["$fileClassification", "primary"] },
              entriesCreated: 1, // We'll count this properly below
              uploadDate: { $ifNull: ["$uploadDate", "$createdAt"] },
              active: true
            }
          },
          firstUploadDate: { $min: "$uploadDate" },
          lastUploadDate: { $max: "$uploadDate" },
          totalLogEntries: { $sum: 1 }
        }
      }
    ]).toArray();
    
    console.log(`🔄 MIGRATION: Found ${logFilesSessions.length} session groups in log_files`);
    
    let migratedSessions = 0;
    let skippedSessions = 0;
    
    for (const sessionGroup of logFilesSessions) {
      const sessionId = sessionGroup._id.uploadSessionId;
      
      // Skip if session already exists
      if (existingSessions.includes(sessionId)) {
        console.log(`🔄 MIGRATION: Skipping existing session: ${sessionId}`);
        skippedSessions++;
        continue;
      }
      
      // Count actual entries for each file
      const filesWithCounts = await Promise.all(
        sessionGroup.files.map(async (file: any) => {
          const count = await logFilesCollection.countDocuments({
            userEmail,
            uploadSessionId: sessionId,
            sourceFile: file.fileName
          });
          
          return {
            ...file,
            entriesCreated: count
          };
        })
      );
      
      // Create upload_session record
      const uploadSessionRecord = {
        userEmail: sessionGroup._id.userEmail,
        sessionId: sessionId,
        filesCount: filesWithCounts.length,
        uploadedFiles: filesWithCounts,
        createdAt: sessionGroup.firstUploadDate || new Date(),
        updatedAt: sessionGroup.lastUploadDate || new Date()
      };
      
      try {
        await uploadSessionsCollection.insertOne(uploadSessionRecord);
        console.log(`🔄 MIGRATION: Created session ${sessionId} with ${filesWithCounts.length} files`);
        migratedSessions++;
      } catch (error) {
        console.error(`🔄 MIGRATION: Error creating session ${sessionId}:`, error);
      }
    }
    
    // Also check for log files without uploadSessionId (legacy data)
    const legacyLogFiles = await logFilesCollection.aggregate([
      { 
        $match: { 
          userEmail,
          $or: [
            { uploadSessionId: { $exists: false } },
            { uploadSessionId: null }
          ]
        }
      },
      {
        $group: {
          _id: {
            sourceFile: "$sourceFile",
            uploadDate: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: { $ifNull: ["$uploadDate", "$createdAt", new Date()] }
              }
            }
          },
          count: { $sum: 1 },
          firstSeen: { $min: { $ifNull: ["$uploadDate", "$createdAt"] } },
          fileClassification: { $first: { $ifNull: ["$fileClassification", "primary"] } },
          userName: { $first: "$userName" }
        }
      }
    ]).toArray();
    
    if (legacyLogFiles.length > 0) {
      console.log(`🔄 MIGRATION: Found ${legacyLogFiles.length} legacy file groups without session IDs`);
      
      // Create a legacy session for files without session IDs
      const legacySessionId = `session_${Date.now()}_legacy_migration`;
      
      const legacyUploadedFiles = legacyLogFiles.map(file => ({
        fileName: file._id.sourceFile,
        cleanedFilename: file._id.sourceFile,
        classification: file.fileClassification as 'primary' | 'secondary',
        entriesCreated: file.count,
        uploadDate: file.firstSeen || new Date(),
        active: true
      }));
      
      const legacySessionRecord = {
        userEmail,
        sessionId: legacySessionId,
        filesCount: legacyUploadedFiles.length,
        uploadedFiles: legacyUploadedFiles,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      try {
        await uploadSessionsCollection.insertOne(legacySessionRecord);
        console.log(`🔄 MIGRATION: Created legacy session ${legacySessionId} with ${legacyUploadedFiles.length} files`);
        migratedSessions++;
      } catch (error) {
        console.error(`🔄 MIGRATION: Error creating legacy session:`, error);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Migration completed successfully`,
      data: {
        userEmail,
        migratedSessions,
        skippedSessions,
        totalProcessed: logFilesSessions.length,
        legacyFilesFound: legacyLogFiles.length
      }
    });

  } catch (error) {
    console.error('Migration API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({
      success: false,
      message: 'Failed to migrate sessions',
      error: 'MIGRATION_API_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    if (client) {
      await client.close();
    }
  }
}
