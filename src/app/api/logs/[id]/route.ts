import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getLogFilesCollection } from '@/lib/mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = parseInt(searchParams.get('skip') || '0');
    
    // Get user email from header or query parameter (fallback for window.open scenarios)
    const userEmail = request.headers.get('x-user-email') || searchParams.get('userEmail');

    if (!userEmail) {
      return NextResponse.json({
        success: false,
        message: 'User authentication required',
        error: 'MISSING_USER_EMAIL'
      }, { status: 401 });
    }

    const collection = await getLogFilesCollection();
    
    // Find log entries for the specific source file
    const logEntries = await collection
      .find({ sourceFile: id,userEmail })
      .sort({ lineNumber: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    console.log('logEntries:', logEntries.length);

    if (logEntries.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No log entries found for this file',
        error: 'ENTRIES_NOT_FOUND'
      }, { status: 404 });
    }

    // Get total count
    const total = await collection.countDocuments({ sourceFile: id, userEmail });

    return NextResponse.json({
      success: true,
      data: logEntries,
      pagination: {
        total,
        limit,
        skip,
        hasMore: skip + limit < total
      }
    });

  } catch (error) {
    console.error('Error fetching log entries:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch log entries',
      error: 'DATABASE_ERROR'
    }, { status: 500 });
  }
}
