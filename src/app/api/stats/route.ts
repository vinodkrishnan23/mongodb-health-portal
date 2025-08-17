import { NextRequest, NextResponse } from 'next/server';
import { getLogFilesCollection } from '@/lib/mongodb';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const sourceFile = searchParams.get('sourceFile');
    const userEmail = request.headers.get('x-user-email'); // Example: get user from header
    
    const collection = await getLogFilesCollection();
    
    // Build match criteria
    const matchCriteria = sourceFile ? { sourceFile,userEmail } : {};
    
    // Aggregation pipeline for statistics
    const pipeline = [
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          totalEntries: { $sum: 1 },
          totalFiles: { $addToSet: "$sourceFile" },
          withTimestamp: { $sum: { $cond: [{ $ne: ["$t", null] }, 1, 0] } },
          withLevel: { $sum: { $cond: [{ $ne: ["$s", null] }, 1, 0] } },
          withComponent: { $sum: { $cond: [{ $ne: ["$c", null] }, 1, 0] } },
          withContext: { $sum: { $cond: [{ $ne: ["$ctx", null] }, 1, 0] } },
          withMessage: { $sum: { $cond: [{ $ne: ["$msg", null] }, 1, 0] } },
          parseErrors: { $sum: { $cond: ["$parseError", 1, 0] } },
          avgLineLength: { $avg: { $strLenCP: { $ifNull: ["$originalLine", { $toString: "$msg" }] } } },
          firstUpload: { $min: "$uploadDate" },
          lastUpload: { $max: "$uploadDate" }
        }
      },
      {
        $project: {
          _id: 0,
          totalEntries: 1,
          uniqueFiles: { $size: "$totalFiles" },
          withTimestamp: 1,
          withLevel: 1,
          withComponent: 1,
          withContext: 1,
          withMessage: 1,
          parseErrors: 1,
          avgLineLength: { $round: ["$avgLineLength", 2] },
          firstUpload: 1,
          lastUpload: 1,
          timestampPercentage: { 
            $round: [{ $multiply: [{ $divide: ["$withTimestamp", "$totalEntries"] }, 100] }, 2] 
          },
          levelPercentage: { 
            $round: [{ $multiply: [{ $divide: ["$withLevel", "$totalEntries"] }, 100] }, 2] 
          },
          componentPercentage: { 
            $round: [{ $multiply: [{ $divide: ["$withComponent", "$totalEntries"] }, 100] }, 2] 
          }
        }
      }
    ];

    // Get level distribution
    const levelPipeline = [
      { $match: { ...matchCriteria, s: { $exists: true, $ne: null } } },
      { $group: { _id: "$s", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ];

    // Get component distribution
    const componentPipeline = [
      { $match: { ...matchCriteria, c: { $exists: true, $ne: null } } },
      { $group: { _id: "$c", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ];

    const [stats, levelDistribution, componentDistribution] = await Promise.all([
      collection.aggregate(pipeline).toArray(),
      collection.aggregate(levelPipeline).toArray(),
      collection.aggregate(componentPipeline).toArray()
    ]);

    return NextResponse.json({
      success: true,
      data: {
        overview: stats[0] || {
          totalEntries: 0,
          uniqueFiles: 0,
          withTimestamp: 0,
          withLevel: 0,
          withComponent: 0,
          withContext: 0,
          withMessage: 0,
          parseErrors: 0,
          avgLineLength: 0,
          firstUpload: null,
          lastUpload: null,
          timestampPercentage: 0,
          levelPercentage: 0,
          componentPercentage: 0
        },
        levelDistribution,
        componentDistribution
      }
    });

  } catch (error) {
    console.error('Error fetching statistics:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch statistics',
      error: 'DATABASE_ERROR'
    }, { status: 500 });
  }
}
