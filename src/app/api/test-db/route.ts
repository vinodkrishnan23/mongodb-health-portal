import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    const { db } = await connectToDatabase();
    
    if (action === 'reset') {
      // Drop and recreate upload_sessions collection
      await db.collection('upload_sessions').drop().catch(() => {
        console.log('Collection upload_sessions did not exist, creating new one');
      });
      
      return NextResponse.json({
        success: true,
        message: 'upload_sessions collection reset'
      });
    }

    // List all collections
    const collections = await db.listCollections().toArray();
    
    // Get upload_sessions stats
    const uploadSessionsCollection = db.collection('upload_sessions');
    const uploadSessionsCount = await uploadSessionsCollection.countDocuments();
    const uploadSessionsData = await uploadSessionsCollection.find({}).limit(5).toArray();

    return NextResponse.json({
      success: true,
      data: {
        collections: collections.map(c => c.name),
        upload_sessions: {
          count: uploadSessionsCount,
          sampleDocuments: uploadSessionsData
        }
      }
    });

  } catch (error) {
    console.error('Database test error:', error);
    return NextResponse.json({
      success: false,
      error: 'Database test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
