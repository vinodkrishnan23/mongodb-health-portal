import { NextRequest, NextResponse } from 'next/server';
import { getLogFilesCollection } from '@/lib/mongodb';

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

// Helper function to create additional filters for slow queries (applied at MongoDB query level)
function createSlowQueryFilters(namespaceFilter?: string, excludeSystemNamespaces?: boolean, inMemorySortsFilter?: boolean, fromMultiPlannerFilter?: boolean, collectionScansFilter?: boolean) {
  const additionalFilters: any[] = [];
  
  // NOTE: Operation type filter is now applied post-aggregation to match frontend logic
  
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
  
  // Collection scans filter
  if (collectionScansFilter) {
    additionalFilters.push({
      "attr.planSummary": "COLLSCAN"
    });
  }
  
  return additionalFilters;
}

// Helper function to extract operation type from query object (matches frontend logic)
function getOperationType(query: any): string | null {
  // Check for errors first - highest priority
  if (query.errCode && query.errCode !== null && query.errCode !== '') {
    return 'ErroredOut';
  }
  
  // Check query.command first (most common for MongoDB operations)
  if (query.command && typeof query.command === 'object') {
    if (query.command.find) return 'find';
    if (query.command.aggregate) return 'aggregate';
    if (query.command.update) return 'update';
    if (query.command.insert) return 'insert';
    if (query.command.delete) return 'delete';
    if (query.command.findAndModify) return 'findAndModify';
    if (query.command.count) return 'count';
    if (query.command.distinct) return 'distinct';
    if (query.command.mapReduce) return 'mapReduce';
    if (query.command.createIndexes) return 'createIndexes';
    if (query.command.dropIndexes) return 'dropIndexes';
    
    // Return the first key if it's not one of the above
    const firstKey = Object.keys(query.command)[0];
    if (firstKey && !['filter', 'sort', 'limit', 'skip'].includes(firstKey)) {
      return firstKey;
    }
  }
  
  // Check query.operation as fallback
  if (query.operation) {
    if (typeof query.operation === 'object' && query.operation !== null) {
      return Object.keys(query.operation)[0];
    } else if (typeof query.operation === 'string') {
      return query.operation;
    }
  }
  
  // Check message for operation type as last resort
  if (query.message && typeof query.message === 'string') {
    const msg = query.message.toLowerCase();
    if (msg.includes('find')) return 'find';
    if (msg.includes('aggregate')) return 'aggregate';
    if (msg.includes('update')) return 'update';
    if (msg.includes('insert')) return 'insert';
    if (msg.includes('delete')) return 'delete';
    if (msg.includes('count')) return 'count';
  }
  
  return null;
}

// Helper function to apply post-aggregation filters
function applyPostAggregationFilters(queries: any[], operationFilter?: string): any[] {
  if (!operationFilter) {
    console.log(`🔍 No operation filter specified, returning all ${queries.length} queries`);
    return queries;
  }
  
  console.log(`🔍 Applying operation filter: ${operationFilter} to ${queries.length} queries`);
  
  // Debug: Show all unique operation types found in the data
  const operationTypes = new Set<string>();
  queries.forEach(query => {
    const extractedOperation = getOperationType(query);
    if (extractedOperation) {
      operationTypes.add(extractedOperation);
    }
  });
  console.log(`🔍 Unique operation types found in data:`, Array.from(operationTypes).sort());
  
  let matchCount = 0;
  const filteredQueries = queries.filter(query => {
    const extractedOperation = getOperationType(query);
    const matches = extractedOperation === operationFilter;
    
    if (matches) {
      matchCount++;
      // Only log first few matches to avoid console spam
      if (matchCount <= 3) {
        console.log(`✅ Query ${matchCount} matches operation filter:`, {
          operationFilter,
          extractedOperation,
          hasCommand: !!query.command,
          hasOperation: !!query.operation,
          hasErrCode: !!query.errCode
        });
      }
    }
    
    return matches;
  });
  
  console.log(`🔍 Operation filter result: ${filteredQueries.length}/${queries.length} queries matched (${((filteredQueries.length/queries.length)*100).toFixed(1)}%)`);
  return filteredQueries;
}


export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const sourceFile = searchParams.get('sourceFile');
    const userEmail = request.headers.get('x-user-email') || searchParams.get('userEmail');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const startTimeParam = searchParams.get('startTime');
    const endTimeParam = searchParams.get('endTime');
    const timeFilter = searchParams.get('timeFilter');
    const operationFilter = searchParams.get('operationFilter');
    const namespaceFilter = searchParams.get('namespaceFilter');
    const excludeSystemNamespaces = searchParams.get('excludeSystemNamespaces') === 'true';
    const inMemorySortsFilter = searchParams.get('inMemorySortsFilter') === 'true';
    const fromMultiPlannerFilter = searchParams.get('fromMultiPlannerFilter') === 'true';
    const collectionScansFilter = searchParams.get('collectionScansFilter') === 'true';
    
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
    
    // Parse date parameters if provided
    const startDate = startDateParam ? new Date(startDateParam) : undefined;
    const endDate = endDateParam ? new Date(endDateParam) : undefined;
    
    let dateFilter: any;
    let filterDescription: string;
    let timeRange: any;
    
    if (startDate && endDate) {
      // Use provided date range
      dateFilter = createDateFilter(startDate, endDate, undefined, startTimeParam || undefined, endTimeParam || undefined, timeFilter || undefined);
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      filterDescription = `${startStr} to ${endStr}`;
      if (startTimeParam || endTimeParam) {
        filterDescription += ` (${startTimeParam || '00:00:00'} - ${endTimeParam || '23:59:59'})`;
      }
      if (timeFilter) {
        const [startHour, endHour] = timeFilter.split('-');
        filterDescription += ` time-of-day: ${startHour}:00-${endHour}:00`;
      }
      
      // Get timestamp range for metadata
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
      timeRange = timestampRangeResult[0] || { minTimestamp: null, maxTimestamp: null, totalLogs: 0 };
      
      console.log(`🔍 Query Performance API - Using custom date range (IST): ${filterDescription}...`);
    } else {
      // Default behavior - get max date and use full day
      console.log('🔍 Query Performance API - Getting IST timestamp range from actual data...');
      
      // Step 1: Get the actual min/max logTimestamp range from the data
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

      timeRange = timestampRangeResult[0] || { minTimestamp: null, maxTimestamp: null, totalLogs: 0 };
      
      if (!timeRange.maxTimestamp) {
        return NextResponse.json({
          success: false,
          message: 'No log data with valid logTimestamp found for the specified source file'
        }, { status: 404 });
      }

      // Step 2: Create date filter for the full day of the max timestamp
      dateFilter = createDateFilter(undefined, undefined, new Date(timeRange.maxTimestamp), startTimeParam || undefined, endTimeParam || undefined, timeFilter || undefined);
      const maxDateStr = new Date(timeRange.maxTimestamp).toISOString().split('T')[0];
      filterDescription = `${maxDateStr} (full day)`;
      
      if (startTimeParam || endTimeParam) {
        filterDescription += ` (${startTimeParam || '00:00:00'} - ${endTimeParam || '23:59:59'})`;
      }
      if (timeFilter) {
        const [startHour, endHour] = timeFilter.split('-');
        filterDescription += ` time-of-day: ${startHour}:00-${endHour}:00`;
      }
      
      console.log(`🚀 Query Performance API - Using max date full day (IST): ${maxDateStr} (00:00:00 - 23:59:59)...`);
    }
    
    // Create additional filters for slow queries (operation filter applied post-aggregation)
    const slowQueryAdditionalFilters = createSlowQueryFilters(namespaceFilter || undefined, excludeSystemNamespaces, inMemorySortsFilter, fromMultiPlannerFilter, collectionScansFilter);
    
    console.log(`🚀 Query Performance API - Starting queries for: ${filterDescription}...`);
    console.log(`🔍 Additional filters: operation=${operationFilter}, namespace=${namespaceFilter}, excludeSystem=${excludeSystemNamespaces}, inMemorySort=${inMemorySortsFilter}, multiPlanner=${fromMultiPlannerFilter}, collectionScans=${collectionScansFilter}`);
    console.log(`🔍 Date filter being applied:`, JSON.stringify(dateFilter, null, 2));
    
    // Debug: Check how many total documents match the basic filters before slow query filtering
    const totalMatchingDocs = await collection.countDocuments({
      sourceFile,
      userEmail,
      logTimestamp: dateFilter.logTimestamp
    });
    console.log(`📊 Total documents matching date filter: ${totalMatchingDocs}`);
    
    const startTime = Date.now();

    // Slow Query Analysis - the main query performance data
    const queryStart = Date.now();
    
    // Define the aggregation pipeline
    const slowQueriesPipeline = [
      { 
        $match: { 
          $and: [
            {
              sourceFile,
              userEmail,
              msg: "Slow query"
            },
            dateFilter,
            ...slowQueryAdditionalFilters
          ]
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
          hasSortStage: { $ifNull: ["$attr.hasSortStage", false] },
          message: "$msg",
          queryHash: "$attr.queryHash",
          planCacheKey: "$attr.planCacheKey",
          component: "$c",
          reslen: "$attr.reslen",
          numYields: "$attr.numYields",
          nReturned: "$attr.nReturned",
          nreturned: "$attr.nreturned",
          queryFramework: "$attr.queryFramework",
          bytesRead: "$attr.storage.data.bytesRead",
          timeReadingMicros: "$attr.storage.data.timeReadingMicros",
          cpuNanos: "$attr.cpuNanos",
          durationMillis: "$attr.durationMillis",
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
                  "$attr.durationMillis"
                ]
              },
              else: null
            }
          },
          queryEndTime: {
            $cond: {
              if: { $ne: ["$logTimestamp", null] },
              then: "$logTimestamp",
              else: null
            }
          },
          workingMillis: "$attr.workingMillis",
          planningTimeMicros: "$attr.planningTimeMicros",
          totalTimeQueuedMicros: "$attr.queues.execution.totalTimeQueuedMicros",
          waitForWriteConcernDurationMillis: "$attr.waitForWriteConcernDurationMillis",
          writeConflicts: "$attr.writeConflicts",
          fromPlanCache: { $ifNull: ["$attr.fromPlanCache", false] },
          fromMultiPlanner: { $ifNull: ["$attr.fromMultiPlanner", false] },
          errCode: "$attr.errCode",
          errName: "$attr.errName",
          errMsg: "$attr.errMsg",
          dataReadMB: {
            $cond: {
              if: { $ne: ["$attr.storage.data.bytesRead", null] },
              then: { $divide: ["$attr.storage.data.bytesRead", 1048576] },
              else: null
            }
          },
          timeSpentReadingSeconds: {
            $cond: {
              if: { $ne: ["$attr.storage.data.timeReadingMicros", null] },
              then: { $divide: ["$attr.storage.data.timeReadingMicros", 1000000] },
              else: null
            }
          },
          cpuTimeSeconds: {
            $cond: {
              if: { $ne: ["$attr.cpuNanos", null] },
              then: { $divide: ["$attr.cpuNanos", 1000000000] },
              else: null
            }
          },
          dirtyBytesMB: {
            $cond: {
              if: { $ne: ["$attr.storage.data.txnBytesDirty", null] },
              then: { $divide: ["$attr.storage.data.txnBytesDirty", 1048576] },
              else: null
            }
          },
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
          remoteIP: "$attr.remote"
        }
      },
      {
        $match: {
          duration: { $exists: true, $gte: 0 }
        }
      },
      { $sort: { "duration": -1 } },
      //{ $limit: 5000 }
    ];
    
    console.log('🔍 QUERY PERFORMANCE PIPELINE:');
    console.log(JSON.stringify(slowQueriesPipeline.slice(0, 2), null, 2)); // Only log first 2 stages
    
    const rawSlowQueries = await collection.aggregate(slowQueriesPipeline).toArray();
    console.log(`⏱️  Query Performance Query: ${Date.now() - queryStart}ms`);
    console.log(`📊 Raw slow queries retrieved: ${rawSlowQueries.length}`);
    
    // Debug: Check if there are any documents at all in the time range (not just slow ones)
    const totalDocsInTimeRange = await collection.countDocuments({
      sourceFile,
      userEmail,
      ...dateFilter
    });
    console.log(`📊 DEBUGGING: Total documents in time range: ${totalDocsInTimeRange}`);
    
    // Debug: Check slow query criteria being applied
    if (rawSlowQueries.length === 0) {
      console.log(`⚠️  No slow queries found - let's check why:`);
      console.log(`🔍 Slow query filters applied:`, JSON.stringify(slowQueryAdditionalFilters, null, 2));
      
      // Check how many queries exist in the time range without slow filters
      const basicQueryCount = await collection.countDocuments({
        sourceFile,
        userEmail,
        logTimestamp: dateFilter.logTimestamp,
        operation: { $exists: true, $ne: null }
      });
      console.log(`📊 Total queries in time range: ${basicQueryCount}`);
    }
    
    // Apply post-aggregation operation type filter (matches frontend logic)
    const slowQueries = applyPostAggregationFilters(rawSlowQueries, operationFilter || undefined);
    console.log(`📊 After operation filtering: ${slowQueries.length} queries`);
    
    const totalTime = Date.now() - startTime;
    console.log(`🏁 Query Performance analysis completed in: ${totalTime}ms`);

    return NextResponse.json({
      success: true,
      queryPerformance: {
        slowQueries,
        timestampRange: timeRange
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
          isCustomRange: !!(startDate && endDate),
          ...(startDate && endDate ? {
            customStartDate: startDate.toISOString(),
            customEndDate: endDate.toISOString()
          } : {
            maxDateUsed: timeRange.maxTimestamp
          }),
          additionalFilters: {
            operationFilter,
            namespaceFilter,
            excludeSystemNamespaces,
            inMemorySortsFilter,
            fromMultiPlannerFilter,
            collectionScansFilter,
            timeFilter,
            hasAdditionalFilters: slowQueryAdditionalFilters.length > 0
          }
        },
        performance: {
          totalQueryTime: totalTime,
          slowQueriesFound: slowQueries.length
        }
      }
    });

  } catch (error) {
    console.error('Query Performance API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      name: error instanceof Error ? error.name : 'Unknown'
    });
    return NextResponse.json({
      success: false,
      message: 'Failed to analyze query performance',
      error: 'QUERY_PERFORMANCE_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
