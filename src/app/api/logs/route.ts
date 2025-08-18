import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getLogFilesCollection } from '@/lib/mongodb';
import { LogEntry } from '@/types';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const collection = await getLogFilesCollection();
    
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = parseInt(searchParams.get('skip') || '0');
    
    // Get user email from header or query parameter
    const userEmail = request.headers.get('x-user-email') || searchParams.get('userEmail');
    
    if (!userEmail) {
      return NextResponse.json({
        success: false,
        message: 'User authentication required',
        error: 'MISSING_USER_EMAIL'
      }, { status: 401 });
    }
    
    console.log('User email:', userEmail);
    
    // Debug: Check if there are any documents for this user
    const userDocCount = await collection.countDocuments({ "userEmail": userEmail });
    console.log(`Found ${userDocCount} documents for user: ${userEmail}`);
    
    // Fetch log entries (group by source file for summary)
    const pipeline = [
      {
        $match: {
          "userEmail": userEmail
        }
      },
      {
        $group: {
          _id: "$sourceFile",
          count: { $sum: 1 },
          uploadDate: { $first: "$uploadDate" },
          isCompressed: { $first: "$isCompressed" },
          originalName: { $first: "$originalName" },
          fileClassification: { $first: "$fileClassification" },
          mongodbVersion: { $first: "$mongodbVersion" }
        }
      },
      { $sort: { uploadDate: -1 } },
      { $skip: skip },
      { $limit: limit }
    ];

    const logFiles = await collection.aggregate(pipeline).toArray();

    // Get total count of unique files for this user
    const totalPipeline = [
      {
        $match: {
          "userEmail": userEmail
        }
      },
      { $group: { _id: "$sourceFile" } },
      { $count: "total" }
    ];
    const totalResult = await collection.aggregate(totalPipeline).toArray();
    const total = totalResult[0]?.total || 0;

    return NextResponse.json({
      success: true,
      data: logFiles,
      pagination: {
        total,
        limit,
        skip,
        hasMore: skip + limit < total
      }
    });

  } catch (error) {
    console.error('Error fetching log files:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch log files',
      error: 'DATABASE_ERROR'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('id');

    if (!fileId) {
      return NextResponse.json({
        success: false,
        message: 'File ID is required',
        error: 'MISSING_FILE_ID'
      }, { status: 400 });
    }

    const collection = await getLogFilesCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(fileId) });

    if (result.deletedCount === 0) {
      return NextResponse.json({
        success: false,
        message: 'File not found',
        error: 'FILE_NOT_FOUND'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting log file:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete log file',
      error: 'DATABASE_ERROR'
    }, { status: 500 });
  }
}
