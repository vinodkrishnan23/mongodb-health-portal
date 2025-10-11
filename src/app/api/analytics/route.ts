import { NextRequest, NextResponse } from 'next/server';
import { getLogFilesCollection } from '@/lib/mongodb';
import { checkDriverCompatibility, checkCombinedDriverCompatibility } from '@/lib/driverCompatibility';

// Helper function to ensure date is in UTC
function toUTC(date: Date): Date {
  // Ensure we're working with UTC timestamps
  return new Date(date.toISOString());
}

// Helper function to create UTC date from date string
function createUTCDate(dateString: string): Date {
  // Parse the date string and treat it as UTC
  const date = new Date(dateString + 'T00:00:00Z');
  return date;
}

// Helper function to create date filter based on provided dates or max date from data
function createDateFilter(startDate?: Date, endDate?: Date, maxDate?: Date, startTime?: string, endTime?: string, timeFilter?: string) {
  let dayStart: Date;
  let dayEnd: Date;
  
  if (startDate && endDate) {
    // Use provided date range - database timestamps are now in UTC
    dayStart = new Date(startDate);
    dayEnd = new Date(endDate);
    
    // Set UTC time boundaries for the date range
    if (startTime) {
      const [hours, minutes, seconds] = startTime.split(':').map(n => parseInt(n));
      dayStart.setUTCHours(hours || 0, minutes || 0, seconds || 0, 0);
    } else {
      dayStart.setUTCHours(0, 0, 0, 0);
    }
    
    if (endTime) {
      const [hours, minutes, seconds] = endTime.split(':').map(n => parseInt(n));
      dayEnd.setUTCHours(hours || 23, minutes || 59, seconds || 59, 999);
    } else {
      dayEnd.setUTCHours(23, 59, 59, 999);
    }
  } else if (maxDate) {
    // Use full day of max date (default behavior)
    // maxDate from database is now in UTC
    dayStart = new Date(maxDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    
    dayEnd = new Date(maxDate);
    dayEnd.setUTCHours(23, 59, 59, 999);
  } else {
    throw new Error('Either startDate/endDate or maxDate must be provided');
  }
  
  // Handle time-of-day filter (e.g., "12-18" for 12:00-18:00)
  let timeOfDayFilter = {};
  if (timeFilter) {
    const [startHour, endHour] = timeFilter.split('-').map(t => parseInt(t));
    
    if (startHour <= endHour) {
      // Normal range (e.g., 9-17 for 9am to 5pm)
      timeOfDayFilter = {
        $expr: {
          $and: [
            { $gte: [{ $hour: "$logTimestamp" }, startHour] },
            { $lt: [{ $hour: "$logTimestamp" }, endHour] }
          ]
        }
      };
    } else {
      // Overnight range (e.g., 22-6 for 10pm to 6am)
      timeOfDayFilter = {
        $expr: {
          $or: [
            { $gte: [{ $hour: "$logTimestamp" }, startHour] },
            { $lt: [{ $hour: "$logTimestamp" }, endHour] }
          ]
        }
      };
    }
  }
  
  return {
    $and: [
      {
        logTimestamp: { 
          $gte: dayStart,
          $lte: dayEnd
        }
      },
      ...(Object.keys(timeOfDayFilter).length > 0 ? [timeOfDayFilter] : [])
    ]
  };
}

// Helper function to create additional filters for slow queries
function createSlowQueryFilters(operationFilter?: string, namespaceFilter?: string, excludeSystemNamespaces?: boolean, inMemorySortsFilter?: boolean, fromMultiPlannerFilter?: boolean) {
  const additionalFilters: any[] = [];
  
  // Operation type filter
  if (operationFilter) {
    additionalFilters.push({
      "attr.type": operationFilter
    });
  }
  
  // Namespace filter
  if (namespaceFilter) {
    additionalFilters.push({
      "attr.ns": namespaceFilter
    });
  }
  
  // Exclude system namespaces
  if (excludeSystemNamespaces) {
    additionalFilters.push({
      "attr.ns": { 
        $not: { 
          $regex: "^(admin|config|local)\\." 
        } 
      }
    });
  }
  
  // In-memory sorts filter
  if (inMemorySortsFilter) {
    additionalFilters.push({
      "attr.hasSortStage": true
    });
  }
  
  // Multi-planner filter
  if (fromMultiPlannerFilter) {
    additionalFilters.push({
      "attr.fromMultiPlanner": true
    });
  }
  
  return additionalFilters;
}


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
    
    console.log('🔍 Static Analytics API - Getting latest day data (IST timezone aware)...');
    
    // Always get max date and use full day for static analytics
    const timestampRangeResult = await collection.aggregate([
      { $match: { 
        sourceFile, 
        userEmail,
        logTimestamp: { $exists: true, $ne: null }
      }},
      {
        $group: {
          _id: null,
          minTimestamp: { $min: "$logTimestamp" },
          maxTimestamp: { $max: "$logTimestamp" },
          totalLogs: { $sum: 1 }
        }
      }
    ]).toArray();

    const timeRange = timestampRangeResult[0] || { minTimestamp: null, maxTimestamp: null, totalLogs: 0 };
    
    if (!timeRange.maxTimestamp) {
      return NextResponse.json({
        success: false,
        message: 'No log data with valid logTimestamp found for the specified source file'
      }, { status: 404 });
    }

    // Create date filter for the full day of the max timestamp (static - always latest day)
    const dateFilter = createDateFilter(undefined, undefined, new Date(timeRange.maxTimestamp));
    const maxDateStr = new Date(timeRange.maxTimestamp).toISOString().split('T')[0];
    const filterDescription = `${maxDateStr} (latest day - static)`;
    
      console.log(`🚀 Static Analytics API - Using latest day (IST): ${maxDateStr} (00:00:00 - 23:59:59)...`);
    const startTime = Date.now();
    
    // Run all static analytics pipelines in parallel (excluding query performance data)
    const [
      connectionStats,
      slowOperations,
      authEvents,
      indexUsage,
      healthEvents
    ] = await Promise.all([

      // Connection Analytics - Application Connections
      (async () => {
        const queryStart = Date.now();
        const result = await collection.aggregate([
          {
            $match: {
              $and: [
                {
                  sourceFile,
                  userEmail,
                  c: "NETWORK",
                  msg: "client metadata",
                  "attr.doc.driver.name": {
                    $nin: ["MongoDB Internal Client","NetworkInterfaceTL-ReplNodeDbWorkerNetwork"],
                    $not :{
                        $regex: "networkinterface",
                      $options: "i"
                    }
                  },
                  "attr.doc.application.name": {
                    $nin: ["NetworkInterfaceTL-ReplCoordExternNetwork", "Studio 3T Community Edition", "Studio 3T", "mongot steady state sync"],
                    $not :{
                      $regex: "compass|mongodb|mongosh|mongo shell|mongot",
                      $options: "i"
                    }
                  }
                },
                dateFilter
              ]
            }
          },
          // Add $sample stage to limit data before grouping (helps prevent huge arrays)
          { $sample: { size: 10000 } },
          {
            $group: {
              _id: {
                appName: "$attr.doc.application.name",
                driverName: "$attr.doc.driver.name",
                driverVersion: "$attr.doc.driver.version",
                mongodbVersion: "$mongodbVersion"
              },
              remoteIPs: { $addToSet: "$attr.remote" },
              count: { $sum: 1 }
            }
          },
          {
            $set: {
              _id: {
                driverName: {
                  $arrayElemAt: [
                    {
                      $split: ["$_id.driverName", "|"]
                    },
                    0
                  ]
                },
                driverVersion: {
                  $arrayElemAt: [
                    {
                      $split: ["$_id.driverVersion", "|"]
                    },
                    0
                  ]
                },
                mongodbVersion: "$_id.mongodbVersion"
              }
            }
          },
          {
            $sort: {
              "_id.appName": -1
            }
          },
          {
            $project: {
              appName: "$_id.appName",
              driverName: "$_id.driverName", 
              driverVersion: "$_id.driverVersion",
              mongodbVersion: "$_id.mongodbVersion",
              remoteIPs: { 
                $slice: [
                  {
                    $filter: {
                      input: "$remoteIPs",
                      cond: { $ne: ["$$this", null] }
                    }
                  }, 
                  50  // Increased from 10 to 50 since we're limiting input data
                ]
              },
              totalConnections: "$count",
              totalUniqueIPs: { $size: "$remoteIPs" }
              // Removed allRemoteIPs to prevent BSON size issues
            }
          }
        ]).toArray();
        console.log(`⏱️  Connection Stats Query: ${Date.now() - queryStart}ms`);
        return result;
      })(),

      // Performance Insights
      (async () => {
        const queryStart = Date.now();
        const result = await collection.aggregate([
          { 
            $match: { 
              $and: [
                {
                  sourceFile,
                  userEmail,
                  //msg: { $regex: RegExp("slow query", "i") }
                  msg: "Slow query"
                },
                dateFilter
              ]
            }
          },
          {
            $project: {
              timestamp: {
                $cond: {
                  if: { $ne: ["$logTimestamp", null] },
                  then: "$logTimestamp",
                  else: "$uploadDate"
                }
              },
              component: "$c",
              context: "$ctx",
              message: "$msg",
              duration: "$attr.durationMillis",
              operation: "$attr.type"
            }
          },
          { $sort: { "duration": -1 } },
          { $limit: 50 }
        ]).toArray();
        console.log(`⏱️  Slow Operations Query: ${Date.now() - queryStart}ms`);
        return result;
      })(),


      // Authentication Events
      (async () => {
        const queryStart = Date.now();
        const result = await collection.aggregate([
          { 
            $match: { 
              $and: [
                {
                  sourceFile,
                  userEmail,
                  $or: [
                    { c: "ACCESS" },
                    { msg: { $regex: /auth/i } },
                    { msg: { $regex: /login|logout|authenticate/i } }
                  ]
                },
                dateFilter
              ]
            }
          },
          {
            $group: {
              _id: {
                type: "$msg",
                user: "$attr.user",
                source: "$attr.remote"
              },
              count: { $sum: 1 },
              firstSeen: { 
                $min: {
                  $cond: {
                    if: { $ne: ["$logTimestamp", null] },
                    then: "$logTimestamp",
                    else: "$uploadDate"
                  }
                }
              },
              lastSeen: { 
                $max: {
                  $cond: {
                    if: { $ne: ["$logTimestamp", null] },
                    then: "$logTimestamp",
                    else: "$uploadDate"
                  }
                }
              }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 20 }
        ]).toArray();
        console.log(`⏱️  Auth Events Query: ${Date.now() - queryStart}ms`);
        return result;
      })(),

      // Index Usage Patterns
      (async () => {
        const queryStart = Date.now();
        const result = await collection.aggregate([
          { 
            $match: { 
              $and: [
                {
                  sourceFile,
                  userEmail,
                  $or: [
                    { msg: { $regex: /index/i } },
                    { "attr.planSummary": { $exists: true } }
                  ]
                },
                dateFilter
              ]
            }
          },
          // Add sample stage to prevent BSON size issues
          { $sample: { size: 5000 } },
          {
            $group: {
              _id: "$attr.planSummary",
              count: { $sum: 1 },
              collections: { $addToSet: "$attr.ns" }
            }
          },
          {
            $project: {
              _id: 1,
              count: 1,
              // Limit collections array to prevent BSON size issues
              collections: { $slice: ["$collections", 20] },
              totalCollections: { $size: "$collections" }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 15 }
        ]).toArray();
        console.log(`⏱️  Index Usage Query: ${Date.now() - queryStart}ms`);
        return result;
      })(),

      // Server Health Events
      (async () => {
        const queryStart = Date.now();
        const result = await collection.aggregate([
          { 
            $match: { 
              $and: [
                {
                  sourceFile,
                  userEmail,
                  $or: [
                    { c: "CONTROL" },
                    { msg: { $regex: /start|stop|restart|shutdown/i } },
                    { msg: { $regex: /replica|shard|election/i } }
                  ]
                },
                dateFilter
              ]
            }
          },
          {
            $project: {
              timestamp: {
                $cond: {
                  if: { $ne: ["$logTimestamp", null] },
                  then: "$logTimestamp",
                  else: "$uploadDate"
                }
              },
              component: "$c",
              severity: "$s",
              message: "$msg",
              context: "$ctx"
            }
          },
          { $sort: { timestamp: -1 } },
          { $limit: 30 }
        ]).toArray();
        console.log(`⏱️  Health Events Query: ${Date.now() - queryStart}ms`);
        return result;
      })()
    ]);

    const totalTime = Date.now() - startTime;
    console.log(`🏁 All queries completed in: ${totalTime}ms`);

    
    // Add compatibility checking to connection stats
    const connectionStatsWithCompatibility = connectionStats.map(stat => {
      const compatibility = checkCombinedDriverCompatibility(
        stat.driverName || '',
        stat.driverVersion || '',
        stat.mongodbVersion || ''
      );
      
      return {
        ...stat,
        compatibility: {
          isCompatible: compatibility.isCompatible,
          notes: compatibility.notes,
          results: compatibility.results,
          recommendedVersions: compatibility.results
            .filter(r => !r.isCompatible)
            .flatMap(r => r.recommendedVersions || [])
        }
      };
    });

    // Debug logging for static analytics
    console.log('Static Analytics Results:');
    console.log('- Connection Stats found:', connectionStats.length);
    console.log('- Slow Operations found:', slowOperations.length);
    console.log('- Auth Events found:', authEvents.length);
    console.log('- Index Usage patterns found:', indexUsage.length);
    console.log('- Health Events found:', healthEvents.length);
    console.log('Connection Stats Sample (first 2):', JSON.stringify(connectionStats.slice(0, 2), null, 2));
    console.log('Timestamp range:', JSON.stringify(timeRange, null, 2));
    
    // Debug driver compatibility processing
    console.log('Driver compatibility debug:');
    console.log('- Raw connection stats count:', connectionStats.length);
    if (connectionStats.length > 0) {
      const sample = connectionStats[0];
      console.log('- Sample connection stat:', {
        driverName: sample.driverName,
        driverVersion: sample.driverVersion,
        mongodbVersion: sample.mongodbVersion
      });
      
      const testCompatibility = checkCombinedDriverCompatibility(
        sample.driverName || '',
        sample.driverVersion || '',
        sample.mongodbVersion || ''
      );
      console.log('- Sample compatibility result:', testCompatibility);
    }

    // Connection Sources Analysis - DISABLED
    const connectionSources: any[] = [];
    
    return NextResponse.json({
      success: true,
      analytics: {
        timestampRange: timeRange,
        connectionStats: connectionStatsWithCompatibility,
        slowOperations,
        authEvents,
        connectionSources,
        indexUsage,
        healthEvents
      },
      metadata: {
        dateRange: {
          minLogTimestamp: timeRange.minTimestamp,
          maxLogTimestamp: timeRange.maxTimestamp,
          totalLogsWithTimestamp: timeRange.totalLogs
        },
        filterApplied: {
          field: "logTimestamp", 
          description: filterDescription,
          dateFilter: dateFilter,
          staticLatestDay: true,
          maxDateUsed: timeRange.maxTimestamp
        },
        performance: {
          totalQueryTime: totalTime
        }
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      name: error instanceof Error ? error.name : 'Unknown'
    });
    return NextResponse.json({
      success: false,
      message: 'Failed to generate analytics',
      error: 'ANALYTICS_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
