import { NextRequest, NextResponse } from 'next/server';
import { getLogFilesCollection } from '@/lib/mongodb';
import { checkDriverCompatibility, checkCombinedDriverCompatibility } from '@/lib/driverCompatibility';

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
    
    // Add performance monitoring to identify slowest queries
    console.log('🚀 Starting analytics queries...');
    const startTime = Date.now();
    
    // Run all aggregation pipelines in parallel for better performance
    const [
      timestampRange,
      connectionStats,
      slowOperations,
      slowQueries,
      authEvents,
      indexUsage,
      healthEvents
    ] = await Promise.all([
      // Get overall timestamp range for the log file using extracted timestamps
      (async () => {
        const queryStart = Date.now();
        const result = await collection.aggregate([
          { $match: { sourceFile, userEmail } },
          {
            $group: {
              _id: null,
              minTimestamp: { 
                $min: {
                  $cond: {
                    if: { $ne: ["$logTimestamp", null] },
                    then: "$logTimestamp",
                    else: "$uploadDate"
                  }
                }
              },
              maxTimestamp: { 
                $max: {
                  $cond: {
                    if: { $ne: ["$logTimestamp", null] },
                    then: "$logTimestamp",
                    else: "$uploadDate"
                  }
                }
              },
              totalLogs: { $sum: 1 }
            }
          }
        ]).toArray();
        console.log(`⏱️  Timestamp Range Query: ${Date.now() - queryStart}ms`);
        return result;
      })(),

      // Connection Analytics - Application Connections
      (async () => {
        const queryStart = Date.now();
        const result = await collection.aggregate([
          {
            $match: {
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
            }
          },
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
                  10
                ]
              },
              totalConnections: "$count",
              totalUniqueIPs: { $size: "$remoteIPs" },
              allRemoteIPs: "$remoteIPs"  // Keep original array for debugging
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
              sourceFile,
              userEmail,
              //msg: { $regex: RegExp("slow query", "i") }
              msg: "Slow query"
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

      // Slow Query Analysis for scatter plot
      (async () => {
        const queryStart = Date.now();
        
        // Define the aggregation pipeline
        const slowQueriesPipeline = [
          { 
            $match: { 
              sourceFile,
              userEmail,
              msg: "Slow query",
              // Exclude system databases
              /*"attr.ns": { 
                $not: { 
                  $regex: "^(local|admin|config)\\." 
                } 
              },
              /*$or: [
                // Slow query messages
                { 
                  $and: [
                    { msg: { $regex: RegExp("slow query", "i") } },
                    { "attr.durationMillis": { $gte: 100 } }
                  ]
                },
                // CRUD operations in COMMAND component with duration
                { 
                  $and: [
                    { c: "COMMAND" },
                    { $or: [
                      { "attr.command.find": { $exists: true } },
                      { "attr.command.aggregate": { $exists: true } },
                      { "attr.command.update": { $exists: true } },
                      { "attr.command.delete": { $exists: true } },
                      { "attr.command.insert": { $exists: true } },
                      { "attr.command.findAndModify": { $exists: true } },
                      { "attr.command.count": { $exists: true } }
                    ]},
                    { "attr.durationMillis": { $gte: 50 } } // Commands taking 50ms or more
                  ]
                }
              ]*/
            }
          },
          {
            $sort:{"attr.durationMillis":-1}
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
              duration: { 
                $ifNull: [
                  "$attr.durationMillis", 
                  {
                    $toInt: {
                      $arrayElemAt: [
                        { $split: [{ $arrayElemAt: [{ $split: ["$msg", " "] }, -1] }, "ms"] },
                        0
                      ]
                    }
                  }
                ]
              },
              namespace: "$attr.ns",
              operation: { $ifNull: ["$attr.type", "$attr.command"] },
              planSummary: "$attr.planSummary",
              command: "$attr.command",
              filter: "$attr.command.filter",
              pipeline: "$attr.command.pipeline",
              sort: "$attr.command.sort",
              docsExamined: "$attr.docsExamined",
              docsReturned: "$attr.docsReturned",
              keysExamined: "$attr.keysExamined",
              numRowsReturnedByQuery: "$attr.nreturned",
              //hasSortStage: "$attr.hasSortStage",
              hasSortStage: { $ifNull: ["$attr.hasSortStage", false] },
              message: "$msg",
              queryHash: "$attr.queryHash",
              planCacheKey: "$attr.planCacheKey",
              component: "$c",
              // Additional fields for new Y-axis metrics
              reslen: "$attr.reslen",
              numYields: "$attr.numYields",
              // New requested fields
              nReturned: "$attr.nReturned",
              nreturned: "$attr.nreturned", // For ratio calculations (lowercase)
              queryFramework: "$attr.queryFramework",
              bytesRead: "$attr.storage.data.bytesRead",
              timeReadingMicros: "$attr.storage.data.timeReadingMicros",
              cpuNanos: "$attr.cpuNanos",
              durationMillis: "$attr.durationMillis",
              // Timeline Analysis timestamp fields
              queryStartTime: {
                $cond: {
                  if: { 
                    $and: [
                      { $ne: ["$logTimestamp", null] },
                      { $ne: ["$attr.durationMillis", null] }
                    ]
                  },
                  then: {
                    $subtract: [
                      "$logTimestamp",
                      "$attr.durationMillis" // Subtract duration from end time to get start time
                    ]
                  },
                  else: null
                }
              },
              queryEndTime: {
                $cond: {
                  if: { $ne: ["$logTimestamp", null] },
                  then: "$logTimestamp", // logTimestamp is the query end time
                  else: null
                }
              },
              // New timing and execution fields
              workingMillis: "$attr.workingMillis",
              planningTimeMicros: "$attr.planningTimeMicros",
              totalTimeQueuedMicros: "$attr.queues.execution.totalTimeQueuedMicros",
              waitForWriteConcernDurationMillis: "$attr.waitForWriteConcernDurationMillis",
              writeConflicts: "$attr.writeConflicts",
              //fromPlanCache: "$attr.fromPlanCache",
              fromPlanCache: { $ifNull: ["$attr.fromPlanCache", false] },
              fromMultiPlanner: { $ifNull: ["$attr.fromMultiPlanner", false] },
              // Error details for ErroredOut operations
              errCode: "$attr.errCode",
              errName: "$attr.errName",
              errMsg: "$attr.errMsg",
              // Additional storage metrics - calculated fields
              dataReadMB: {
                $cond: {
                  if: { $ne: ["$attr.storage.data.bytesRead", null] },
                  then: { $divide: ["$attr.storage.data.bytesRead", 1048576] }, // Convert bytes to MB
                  else: null
                }
              },
              timeSpentReadingSeconds: {
                $cond: {
                  if: { $ne: ["$attr.storage.data.timeReadingMicros", null] },
                  then: { $divide: ["$attr.storage.data.timeReadingMicros", 1000000] }, // Convert microseconds to seconds
                  else: null
                }
              },
              cpuTimeSeconds: {
                $cond: {
                  if: { $ne: ["$attr.cpuNanos", null] },
                  then: { $divide: ["$attr.cpuNanos", 1000000000] }, // Convert nanoseconds to seconds
                  else: null
                }
              },
              dirtyBytesMB: {
                $cond: {
                  if: { $ne: ["$attr.storage.data.txnBytesDirty", null] },
                  then: { $divide: ["$attr.storage.data.txnBytesDirty", 1048576] }, // Convert bytes to MB
                  else: null
                }
              },
              // Calculate scanned/returned ratio
              scannedReturnedRatio: {
                $cond: {
                  if: { 
                    $and: [
                      { $gt: ["$attr.docsReturned", 0] },
                      { $ne: ["$attr.docsExamined", null] }
                    ]
                  },
                  then: { $divide: ["$attr.docsExamined", "$attr.docsReturned"] },
                  else: null
                }
              },

            }
          },
          {
            $match: {
              duration: { $exists: true, $gte: 0 } // Ensure we have valid duration
            }
          },
          //{ $sort: { "duration": -1 } }
        ];
        
        // Log the query being sent to MongoDB
        console.log('🔍 SLOW QUERIES AGGREGATION PIPELINE:');
        console.log(JSON.stringify(slowQueriesPipeline, null, 2));       
        const result = await collection.aggregate(slowQueriesPipeline).toArray();
        console.log(`⏱️  Slow Queries Query (LARGEST): ${Date.now() - queryStart}ms`);
        return result;
      })(),

      // Authentication Events
      (async () => {
        const queryStart = Date.now();
        const result = await collection.aggregate([
          { 
            $match: { 
              sourceFile,
              userEmail,
              $or: [
                { c: "ACCESS" },
                { msg: { $regex: /auth/i } },
                { msg: { $regex: /login|logout|authenticate/i } }
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
              sourceFile,
              userEmail,
              $or: [
                { msg: { $regex: /index/i } },
                { "attr.planSummary": { $exists: true } }
              ]
            }
          },
          {
            $group: {
              _id: "$attr.planSummary",
              count: { $sum: 1 },
              collections: { $addToSet: "$attr.ns" }
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
              sourceFile,
              userEmail,
              $or: [
                { c: "CONTROL" },
                { msg: { $regex: /start|stop|restart|shutdown/i } },
                { msg: { $regex: /replica|shard|election/i } }
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

    const timeRange = timestampRange[0] || { minTimestamp: null, maxTimestamp: null, totalLogs: 0 };

    
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

    // Debug logging
    console.log('Connection Stats Sample:', JSON.stringify(connectionStats.slice(0, 2), null, 2));
    console.log('Slow queries found:', slowQueries.length);
    console.log('Timestamp range:', JSON.stringify(timeRange, null, 2));
    if (slowQueries.length > 0) {
      console.log('Sample slow queries with timestamps:', JSON.stringify(slowQueries.slice(0, 2), null, 2));
    } else {
      // If no queries found, let's check what we have in the collection
      const sampleLogs = await collection.aggregate([
        { $match: { sourceFile } },
        { $limit: 5 },
        { $project: { msg: 1, attr: 1, c: 1, t: 1, uploadDate: 1 } }
      ]).toArray();
      console.log('Sample logs for debugging (with timestamps):', JSON.stringify(sampleLogs, null, 2));
    }

    // Connection Sources Analysis - DISABLED
    const connectionSources: any[] = [];    return NextResponse.json({
      success: true,
      analytics: {
        timestampRange: timeRange,
        connectionStats: connectionStatsWithCompatibility,
        slowOperations,
        slowQueries,
        authEvents,
        connectionSources,
        indexUsage,
        healthEvents
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
