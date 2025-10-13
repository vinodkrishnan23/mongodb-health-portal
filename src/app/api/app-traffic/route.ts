import { NextRequest, NextResponse } from 'next/server';
import { getLogFilesCollection } from '@/lib/mongodb';

// Helper function to extract operation type from query object (matches query-performance logic)
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

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 App Traffic API - Starting request');
    
    const searchParams = request.nextUrl.searchParams;
    const sourceFile = searchParams.get('sourceFile');
    const userEmail = request.headers.get('x-user-email');
    
    console.log('📋 App Traffic API - Parameters:', { sourceFile, userEmail });
    
    if (!sourceFile || !userEmail) {
      console.log('❌ App Traffic API - Missing parameters');
      return NextResponse.json(
        { error: 'Missing required parameters: sourceFile and userEmail' },
        { status: 400 }
      );
    }

    console.log('🔌 App Traffic API - Getting database collection');
    const collection = await getLogFilesCollection();
    console.log('✅ App Traffic API - Database collection obtained');

    // Test 1: Check if ANY documents exist for this sourceFile/userEmail
    console.log('🔍 App Traffic API - Checking total documents');
    const totalDocsQuery = await collection.countDocuments({
      sourceFile,
      userEmail
    });
    console.log('📊 App Traffic API - Total docs:', totalDocsQuery);

    // Test 2: Check for any client metadata messages (minimal filter)
    console.log('🔍 App Traffic API - Checking client metadata documents');
    const clientMetadataQuery = await collection.countDocuments({
      sourceFile,
      userEmail,
      msg: "client metadata"
    });
    console.log('📊 App Traffic API - Client metadata docs:', clientMetadataQuery);

    // Test 3: Check for any slow query messages (minimal filter)  
    console.log('🔍 App Traffic API - Checking slow query documents');
    const slowQueryQuery = await collection.countDocuments({
      sourceFile,
      userEmail,
      msg: "Slow query"
    });
    console.log('📊 App Traffic API - Slow query docs:', slowQueryQuery);

    // Test 4: Get some actual driver data (if any exists)
    console.log('🔍 App Traffic API - Running driver aggregation');
    const driverData = await collection.aggregate([
      {
        $match: {
          sourceFile,
          userEmail,
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
            driverName: "$attr.doc.driver.name",
            driverVersion: "$attr.doc.driver.version"
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();
    console.log('📊 App Traffic API - Driver data results:', driverData.length);

    // Test 5: Get some actual IP data (if any exists) - with port removal in pipeline
    console.log('🔍 App Traffic API - Running IP aggregation');
    const ipData = await collection.aggregate([
      {
        $match: {
          sourceFile,
          userEmail,
          msg: "Slow query"
        }
      },
      {
        $addFields: {
          cleanIp: {
            $cond: {
              if: { 
                $and: [
                  { $ne: ["$attr.remote", null] },
                  { $ne: ["$attr.remote", ""] },
                  { $eq: [{ $type: "$attr.remote" }, "string"] }
                ]
              },
              then: {
                $cond: {
                  if: { $regexMatch: { input: "$attr.remote", regex: ":[0-9]+$" } },
                  then: {
                    $substr: [
                      "$attr.remote", 
                      0, 
                      { $subtract: [
                        { $strLenCP: "$attr.remote" },
                        { $add: [
                          { $strLenCP: { 
                            $arrayElemAt: [
                              { $split: ["$attr.remote", ":"] }, 
                              -1
                            ] 
                          }},
                          1
                        ]}
                      ]}
                    ]
                  },
                  else: "$attr.remote"
                }
              },
              else: "Unknown"
            }
          }
        }
      },
      {
        $group: {
          _id: "$cleanIp",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();
    console.log('📊 App Traffic API - IP data results:', ipData.length);

    // Test 6: Get slow query documents for operation type analysis (enhanced approach)
    console.log('🔍 App Traffic API - Running enhanced operation aggregation');
    const slowQueryDocs = await collection.aggregate([
      {
        $match: {
          sourceFile,
          userEmail,
          msg: "Slow query"
        }
      },
      {
        $project: {
          command: "$attr.command",
          operation: "$attr.type",
          message: "$msg",
          errCode: "$attr.errCode"
        }
      },
      //{ $limit: 5000 } // Limit to prevent memory issues
    ]).toArray();
    console.log('📊 App Traffic API - Slow query documents for operation analysis:', slowQueryDocs.length);

    console.log('🔄 App Traffic API - Processing results');
    
    // Process driver data
    const languages = driverData
      .filter(item => item._id?.driverName) // Only include items with actual driver names
      .map(item => {
        const driverName = item._id.driverName || 'Unknown Driver';
        const driverVersion = item._id.driverVersion || 'Unknown Version';
        const displayName = `${driverName} v${driverVersion}`;
        
        return {
          name: displayName,
          driverName: driverName,
          driverVersion: driverVersion,
          count: item.count
        };
      });

    // Process IP data - simplified since cleaning is done in pipeline
    const ipAddresses = ipData
      .filter(item => item._id && item._id !== "Unknown") // Remove unknown IPs
      .map(item => ({
        name: item._id,                   // Already clean IP from pipeline
        count: item.count
      }));

    // Process operation data using enhanced operation type extraction
    console.log('🔄 App Traffic API - Extracting operation types from slow query documents');
    const operationTypeMap = new Map<string, number>();
    
    slowQueryDocs.forEach(doc => {
      const operationType = getOperationType(doc);
      if (operationType) {
        const currentCount = operationTypeMap.get(operationType) || 0;
        operationTypeMap.set(operationType, currentCount + 1);
      }
    });
    
    // Convert map to array and sort by count
    const operationTypes = Array.from(operationTypeMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    
    console.log('📊 App Traffic API - Operation types extracted:', operationTypes.length);
    console.log('🔍 App Traffic API - Top operation types:', operationTypes.slice(0, 5));

    console.log('✅ App Traffic API - Processed results:', {
      languages: languages.length,
      ipAddresses: ipAddresses.length,
      operationTypes: operationTypes.length
    });

    return NextResponse.json({
      success: true,
      data: {
        languages,
        ipAddresses,
        operationTypes
      },
      metadata: {
        sourceFile,
        userEmail,
        dataScope: "entire_log_file",
        debug: {
          totalDocs: totalDocsQuery,
          clientMetadataDocs: clientMetadataQuery,
          slowQueryDocs: slowQueryQuery,
          rawDriverData: driverData.length,
          rawIpData: ipData.length,
          slowQueryDocsForOperations: slowQueryDocs.length,
          extractedOperationTypes: operationTypes.length
        }
      }
    });

  } catch (error) {
    console.error('❌ App Traffic API Error:', error);
    console.error('❌ App Traffic API Error Stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Failed to fetch app traffic data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
