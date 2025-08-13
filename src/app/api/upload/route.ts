import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream } from 'fs';
import { gunzipSync } from 'zlib';
import { pipeline } from 'stream/promises';
import path from 'path';
import { getLogFilesCollection } from '@/lib/mongodb';
import { LogEntry, UploadResponse } from '@/types';

// Function to clean up file names by extracting everything before the first dot
function cleanFileName(fileName: string): string {
  // Find the first dot and take everything before it
  const firstDotIndex = fileName.indexOf('.');
  if (firstDotIndex !== -1) {
    return fileName.substring(0, firstDotIndex);
  }
  
  // If no dot found, return the original filename
  return fileName;
}

// Function to recursively clean keys that start with $
function cleanDollarKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(cleanDollarKeys);
  }
  
  const cleaned: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    let newKey = key;
    
    // Remove $ prefix or replace with underscore
    if (key.startsWith('$')) {
      newKey = key.substring(1); // Remove $ prefix
      // Alternative: newKey = '_' + key.substring(1); // Replace with underscore
    }
    
    // Recursively clean nested objects
    cleaned[newKey] = cleanDollarKeys(value);
  }
  
  return cleaned;
}

// Function to check if clusterTime path is complete and remove if incomplete
function cleanIncompleteClusterTime(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(cleanIncompleteClusterTime);
  }
  
  const cleaned = { ...obj };
  
  // Check for incomplete $clusterTime in attr.command
  if (cleaned.attr && cleaned.attr.command && cleaned.attr.command.clusterTime) {
    const clusterTime = cleaned.attr.command.clusterTime;
    
    // Check if the path clusterTime.clusterTime.timestamp.t exists
    const hasCompleteClusterTime = 
      clusterTime.clusterTime && 
      clusterTime.clusterTime.timestamp && 
      clusterTime.clusterTime.timestamp.t !== undefined;
    
    if (!hasCompleteClusterTime) {
      // Remove the incomplete clusterTime object
      delete cleaned.attr.command.clusterTime;
    }
  }
  
  // Also check at root level clusterTime
  if (cleaned.clusterTime) {
    const clusterTime = cleaned.clusterTime;
    
    // Check if the path clusterTime.clusterTime.timestamp.t exists
    const hasCompleteClusterTime = 
      clusterTime.clusterTime && 
      clusterTime.clusterTime.timestamp && 
      clusterTime.clusterTime.timestamp.t !== undefined;
    
    if (!hasCompleteClusterTime) {
      // Remove the incomplete clusterTime object
      delete cleaned.clusterTime;
    }
  }
  
  // Recursively clean nested objects
  for (const [key, value] of Object.entries(cleaned)) {
    if (typeof value === 'object' && value !== null) {
      cleaned[key] = cleanIncompleteClusterTime(value);
    }
  }
  
  return cleaned;
}

// Function to process a single MongoDB JSON log line
function processJsonLogLine(line: string, metadata: any): any {
  try {
    // Clean the line - remove array brackets and trailing commas
    let cleanedLine = line.trim();
    
    // Remove leading [ and trailing , or ] characters
    cleanedLine = cleanedLine.replace(/^\[/, '').replace(/,\s*$/, '').replace(/\]\s*$/, '');
    
    // Skip if line is now empty after cleaning
    if (!cleanedLine) {
      return null;
    }
    
    // Parse the cleaned JSON line
    const jsonLog = JSON.parse(cleanedLine);
    
    // Extract timestamp from t.$date field and convert to Date object
    let logTimestamp = null;
    let queryStartTime = null;
    if (jsonLog.t && jsonLog.t.$date) {
      try {
        logTimestamp = new Date(jsonLog.t.$date);
        // Validate the date
        if (isNaN(logTimestamp.getTime())) {
          logTimestamp = null;
        }
      } catch (dateError) {
        console.warn(`Failed to parse timestamp from t.$date: ${jsonLog.t.$date}`, dateError);
        logTimestamp = null;
      }
    } else if (jsonLog.t && typeof jsonLog.t === 'string') {
      try {
        logTimestamp = new Date(jsonLog.t);
        // Validate the date
        if (isNaN(logTimestamp.getTime())) {
          logTimestamp = null;
        }
      } catch (dateError) {
        console.warn(`Failed to parse timestamp from t: ${jsonLog.t}`, dateError);
        logTimestamp = null;
      }
    }
    
    if (jsonLog.attr && jsonLog.attr.command && jsonLog.attr.command.$clusterTime && jsonLog.attr.command.$clusterTime.clusterTime && jsonLog.attr.command.$clusterTime.clusterTime.$timestamp && jsonLog.attr.command.$clusterTime.clusterTime.$timestamp.t) {
        try {
            queryStartTime = new Date(jsonLog.attr.command.$clusterTime.clusterTime.$timestamp.t * 1000); // Convert seconds to milliseconds
            // Validate the date
            if (isNaN(queryStartTime.getTime())) {
            queryStartTime = null;
            }
        } catch (dateError) {
            console.warn(`Failed to parse timestamp from attr.command.$clusterTime: ${jsonLog.attr.command.$clusterTime}`, dateError);
            queryStartTime = null;
        }
    }
    
    // Add metadata and extracted timestamp to the existing JSON structure
    return {
      ...jsonLog,
      logTimestamp: logTimestamp, // Direct timestamp field for easy querying
      queryStartTime: queryStartTime, // Query start time if available
      sourceFile: metadata.sourceFile,
      uploadDate: metadata.uploadDate,
      uploadSessionId: metadata.uploadSessionId,
      lineNumber: metadata.lineNumber,
      fileClassification: metadata.fileClassification,
      mongodbVersion: metadata.mongodbVersion,
      userEmail: metadata.userEmail,
      userName: metadata.userName,
      userId: metadata.userId
    };
    
  } catch (jsonError: any) {
    // If parsing fails, return the original line with metadata
    console.warn(`Failed to parse JSON line ${metadata.lineNumber}:`, jsonError.message);
    return {
      originalLine: line,
      parseError: true,
      sourceFile: metadata.sourceFile,
      uploadDate: metadata.uploadDate,
      uploadSessionId: metadata.uploadSessionId,
      lineNumber: metadata.lineNumber,
      fileClassification: metadata.fileClassification,
      mongodbVersion: metadata.mongodbVersion,
      userEmail: metadata.userEmail,
      userName: metadata.userName,
      userId: metadata.userId
    };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse>> {
  try {
    const formData = await request.formData();
    
    // Get user information from the request
    const userDataString = formData.get('user');
    let userInfo = null;
    if (userDataString && typeof userDataString === 'string') {
      try {
        userInfo = JSON.parse(userDataString);
      } catch (e) {
        return NextResponse.json({
          success: false,
          message: 'Invalid user information',
          error: 'INVALID_USER_DATA'
        }, { status: 400 });
      }
    }

    if (!userInfo || !userInfo.email || !userInfo.userId) {
      return NextResponse.json({
        success: false,
        message: 'User authentication required',
        error: 'USER_AUTH_REQUIRED'
      }, { status: 401 });
    }
    
    // Get all files from formData
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'file' && value instanceof File) {
        files.push(value);
      }
    }

    // Get file classifications (now includes MongoDB version)
    let fileClassifications: Array<{fileName: string, cleanedName?: string, classification: string, mongodbVersion?: string, index: number}> = [];
    const classificationsData = formData.get('fileClassifications');
    if (classificationsData && typeof classificationsData === 'string') {
      try {
        fileClassifications = JSON.parse(classificationsData);
      } catch (e) {
        console.warn('Failed to parse file classifications, using defaults');
      }
    }

    if (files.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No files uploaded',
        error: 'FILES_MISSING'
      }, { status: 400 });
    }

    // Generate unique upload session ID for this batch
    const uploadSessionId = new Date().toISOString() + '_' + Math.random().toString(36).substr(2, 9);
    
    let totalDocuments: any[] = [];
    let totalEntriesCreated = 0;
    let allInsertedIds: any = {};
    let fileResults: any[] = [];

    // Process each file
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];
      
      // Get the classification and MongoDB version for this file
      const fileClassification = fileClassifications.find(fc => 
        fc.fileName === file.name && fc.index === fileIndex
      );
      const classification = fileClassification?.classification || 'primary'; // Default to primary
      const mongodbVersion = fileClassification?.mongodbVersion || '';
      
      console.log(`Processing file ${fileIndex + 1}/${files.length}: ${file.name} (${classification}, MongoDB ${mongodbVersion})`);

      // Clean up the file name for storage
      const cleanedFileName = cleanFileName(file.name);
      console.log(`Cleaned file name: ${file.name} -> ${cleanedFileName}`);

      // Validate file type
      const allowedExtensions = ['.log', '.gz'];
      const isGzipped = file.name.toLowerCase().endsWith('.gz');
      
      if (!allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
        fileResults.push({
          filename: file.name,
          cleanedFilename: cleanedFileName,
          classification: classification,
          success: false,
          message: 'Invalid file type. Only .log and .gz files are allowed.',
          error: 'INVALID_FILE_TYPE'
        });
        continue;
      }

      try {
        console.log(`Starting processing of file: ${file.name} (${file.size} bytes)`);
        
        // Create temporary file path
        const tempDir = '/tmp';
        const tempFilePath = path.join(tempDir, `upload_${Date.now()}_${fileIndex}_${file.name}`);

        // Write uploaded file to temporary location
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await writeFile(tempFilePath, buffer);
        console.log(`Wrote file to temp location: ${tempFilePath}`);

        let content = '';
        
        if (isGzipped) {
          // Handle gzipped files with synchronous decompression
          try {
            console.log(`Decompressing gzipped file: ${file.name}`);
            const decompressed = gunzipSync(buffer);
            content = decompressed.toString('utf-8');
            console.log(`Successfully decompressed ${file.name}, content length: ${content.length}`);
          } catch (gzipError) {
            console.error(`Failed to decompress ${file.name}:`, gzipError);
            throw new Error(`Failed to decompress gzipped file: ${file.name}`);
          }
        } else {
          // Handle regular log files
          content = buffer.toString('utf-8');
        }

        // Parse log content into individual entries - line by line processing
        const logLines = content.split('\n');
        console.log(`Processing ${logLines.length} lines from file: ${file.name}`);
        
        // Process each line and create documents for MongoDB
        const fileDocuments: any[] = [];
        let processedLines = 0;
        
        for (let i = 0; i < logLines.length; i++) {
          const line = logLines[i];
          
          // Skip completely empty lines
          if (line.trim() === '') {
            continue;
          }
          
          processedLines++;
          
          // Create metadata for this line
          const lineMetadata = {
            sourceFile: cleanedFileName,
            uploadDate: new Date(),
            uploadSessionId: uploadSessionId,
            lineNumber: i + 1,
            fileClassification: classification,
            mongodbVersion: mongodbVersion,
            userEmail: userInfo.email,
            userName: userInfo.name,
            userId: userInfo.userId
          };
          
          // Process the JSON log line and add metadata
          const document = processJsonLogLine(line, lineMetadata);
          
          // Skip if document is null (empty line after cleaning)
          if (document === null) {
            continue;
          }
          
          // Log sample document for debugging (first few lines of first file only)
          if (fileIndex === 0 && i < 3) {
            console.log(`Sample document for file ${cleanedFileName}, line ${i + 1}:`, JSON.stringify(document, null, 2));
          }
          
          fileDocuments.push(document);
          
          // Log progress for large files
          if (processedLines % 1000 === 0) {
            console.log(`Processed ${processedLines} lines from ${file.name}`);
          }
        }
        
        console.log(`Completed processing ${fileDocuments.length} non-empty lines from ${cleanedFileName} (${file.name})`);
        
        // Add file documents to total
        totalDocuments = totalDocuments.concat(fileDocuments);
        
        // Clean up temporary file
        await unlink(tempFilePath);
        
        fileResults.push({
          filename: file.name,
          cleanedFilename: cleanedFileName,
          classification: classification,
          success: true,
          entriesCreated: fileDocuments.length,
          linesProcessed: logLines.length
        });
        
      } catch (fileProcessingError) {
        console.error(`Error processing file ${file.name}:`, fileProcessingError);
        
        fileResults.push({
          filename: file.name,
          cleanedFilename: cleanedFileName,
          classification: classification,
          success: false,
          message: 'Error processing file',
          error: 'FILE_PROCESSING_ERROR'
        });
      }
    }

    console.log(`Created ${totalDocuments.length} total documents for MongoDB insertion from ${files.length} files`);

    // Insert all documents into MongoDB collection
    if (totalDocuments.length > 0) {
      try {
        const collection = await getLogFilesCollection();
        console.log(`Inserting ${totalDocuments.length} documents into MongoDB collection: log_entries`);
        
        const result = await collection.insertMany(totalDocuments);
        console.log(`Successfully inserted ${Object.keys(result.insertedIds).length} documents`);
        allInsertedIds = result.insertedIds;
        totalEntriesCreated = totalDocuments.length;
      } catch (mongoError) {
        console.error('MongoDB insertion error:', mongoError);
        throw new Error('Failed to insert documents into MongoDB');
      }
    } else {
      console.log('No documents to insert into MongoDB');
    }

    // Calculate detailed statistics
    const stats = {
      totalEntries: totalDocuments.length,
      successfullyParsed: totalDocuments.filter((entry: any) => !entry.parseError).length,
      parseErrors: totalDocuments.filter((entry: any) => entry.parseError).length,
      withTimestamp: totalDocuments.filter((entry: any) => !entry.parseError && entry.t).length,
      withLevel: totalDocuments.filter((entry: any) => !entry.parseError && entry.s).length,
      withComponent: totalDocuments.filter((entry: any) => !entry.parseError && entry.c).length,
      withContext: totalDocuments.filter((entry: any) => !entry.parseError && entry.ctx).length,
      withMessage: totalDocuments.filter((entry: any) => !entry.parseError && entry.msg).length
    };

    const successfulFiles = fileResults.filter(f => f.success).length;
    const failedFiles = fileResults.filter(f => !f.success).length;

    return NextResponse.json({
      success: successfulFiles > 0,
      message: `Processed ${files.length} files. ${successfulFiles} successful, ${failedFiles} failed. Created ${totalEntriesCreated} total documents in MongoDB.`,
      entriesCreated: totalEntriesCreated,
      uploadSessionId: uploadSessionId,
      stats: stats,
      insertedIds: allInsertedIds,
      fileResults: fileResults
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: 'SERVER_ERROR'
    }, { status: 500 });
  }
}
