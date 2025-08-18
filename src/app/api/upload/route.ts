import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream } from 'fs';
import { gunzipSync } from 'zlib';
import { pipeline } from 'stream/promises';
import path from 'path';
import { getLogFilesCollection } from '@/lib/mongodb';
import { LogEntry, UploadResponse } from '@/types';
import { json } from 'stream/consumers';

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
            
        } catch (dateError) {
            console.warn(`Failed to parse timestamp from attr.command.$clusterTime: ${jsonLog.attr.command.$clusterTime}`, dateError);
            queryStartTime = null;
        }
    }

    else if (jsonLog.t && jsonLog.t.$date && jsonLog.attr && jsonLog.attr.durationMillis){
      // Validate the date
            queryStartTime = new Date (new Date(jsonLog.t.$date).getTime() - jsonLog.attr.durationMillis);
    }
    else {
              queryStartTime = new Date(jsonLog.t.$date);
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
        return NextResponse.json({ success: false, message: 'Invalid user information', error: 'INVALID_USER_DATA' }, { status: 400 });
      }
    }
    if (!userInfo || !userInfo.email || !userInfo.userId) {
      return NextResponse.json({ success: false, message: 'User authentication required', error: 'USER_AUTH_REQUIRED' }, { status: 401 });
    }

    // Get all files and file classifications from formData
    const files: Blob[] = [];
    let fileClassifications: Array<{fileName: string, cleanedName?: string, classification: string, mongodbVersion?: string, index: number}> = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'file' && typeof (value as any).arrayBuffer === 'function') {
        files.push(value as Blob);
      }
      if (key === 'fileClassifications' && typeof value === 'string') {
        try {
          fileClassifications = JSON.parse(value);
        } catch (e) {
          console.warn('Failed to parse file classifications, using defaults');
        }
      }
    }
    if (files.length === 0) {
      return NextResponse.json({ success: false, message: 'No files uploaded', error: 'FILES_MISSING' }, { status: 400 });
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
      const fileClassification = fileClassifications.find(fc => fc.index === fileIndex);
      const fileName = fileClassification?.fileName || `uploaded_${fileIndex}.log`;
      const classification = fileClassification?.classification || 'primary';
      const mongodbVersion = fileClassification?.mongodbVersion || '';
      const cleanedFileName = cleanFileName(fileName);
      const allowedExtensions = ['.log', '.gz'];
      const isGzipped = fileName.toLowerCase().endsWith('.gz');
      if (!allowedExtensions.some(ext => fileName.toLowerCase().endsWith(ext))) {
        fileResults.push({ filename: fileName, cleanedFilename: cleanedFileName, classification, success: false, message: 'Invalid file type. Only .log and .gz files are allowed.', error: 'INVALID_FILE_TYPE' });
        continue;
      }
      try {
        const tempDir = '/tmp';
        const tempFilePath = path.join(tempDir, `upload_${Date.now()}_${fileIndex}_${fileName}`);
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await writeFile(tempFilePath, buffer);
        let content = '';
        if (isGzipped) {
          try {
            const decompressed = gunzipSync(buffer);
            content = decompressed.toString('utf-8');
          } catch (gzipError) {
            throw new Error(`Failed to decompress gzipped file: ${fileName}`);
          }
        } else {
          content = buffer.toString('utf-8');
        }
        const logLines = content.split('\n');
        const fileDocuments: any[] = [];
        for (let i = 0; i < logLines.length; i++) {
          const line = logLines[i];
          if (line.trim() === '') continue;
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
          const document = processJsonLogLine(line, lineMetadata);
          if (document === null) continue;
          fileDocuments.push(document);
        }
        totalDocuments = totalDocuments.concat(fileDocuments);
        await unlink(tempFilePath);
        fileResults.push({ filename: fileName, cleanedFilename: cleanedFileName, classification, success: true, entriesCreated: fileDocuments.length, linesProcessed: logLines.length });
      } catch (fileProcessingError) {
        fileResults.push({ filename: fileName, cleanedFilename: cleanedFileName, classification, success: false, message: 'Error processing file', error: 'FILE_PROCESSING_ERROR' });
      }
    }

    // Insert all documents into MongoDB collection
    if (totalDocuments.length > 0) {
      try {
        const collection = await getLogFilesCollection();
        const result = await collection.insertMany(totalDocuments);
        allInsertedIds = result.insertedIds;
        totalEntriesCreated = totalDocuments.length;
      } catch (mongoError) {
        throw new Error('Failed to insert documents into MongoDB');
      }
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
    return NextResponse.json({ success: successfulFiles > 0, message: `Processed ${files.length} files. ${successfulFiles} successful, ${failedFiles} failed. Created ${totalEntriesCreated} total documents in MongoDB.`, entriesCreated: totalEntriesCreated, uploadSessionId, stats, insertedIds: allInsertedIds, fileResults });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: 'Internal server error', error: error?.message || 'SERVER_ERROR' }, { status: 500 });
  }
}
