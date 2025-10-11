import { NextRequest, NextResponse } from 'next/server';
import { getLogFilesCollection } from '@/lib/mongodb';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const sourceFile = searchParams.get('sourceFile');
    const userEmail = request.headers.get('x-user-email') || searchParams.get('userEmail');
    
    if (!sourceFile) {
      return NextResponse.json({
        success: false,
        message: 'sourceFile parameter is required'
      }, { status: 400 });
    }

    if (!userEmail) {
      return NextResponse.json({
        success: false,
        message: 'User authentication required'
      }, { status: 401 });
    }

    const collection = await getLogFilesCollection();
    
    console.log('📅 Fetching unique dates from logs (UTC timezone)...');
    
    // Get unique dates from logTimestamp field
    // Since all timestamps are now stored in UTC, we extract just the date part
    const uniqueDatesResult = await collection.aggregate([
      { 
        $match: { 
          sourceFile, 
          userEmail,
          logTimestamp: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$logTimestamp",
              timezone: "UTC"  // UTC timezone
            }
          }
        }
      },
      {
        $project: {
          date: "$_id",
          _id: 0
        }
      },
      {
        $sort: { date: -1 } // Most recent dates first
      }
    ]).toArray();

    const uniqueDates = uniqueDatesResult.map(item => item.date);
    
    console.log(`📅 Found ${uniqueDates.length} unique dates:`, uniqueDates);

    return NextResponse.json({
      success: true,
      dates: uniqueDates,
      metadata: {
        totalUniqueDates: uniqueDates.length,
        sourceFile,
        userEmail,
        timezone: 'UTC'
      }
    });

  } catch (error) {
    console.error('Dates API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch unique dates',
      error: 'DATES_API_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
