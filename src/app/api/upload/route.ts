// Import necessary modules at the top of your file
import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, promises as fs } from 'fs';
import { gunzip } from 'zlib';
import path from 'path';
import os from 'os';
import { getLogFilesCollection } from '@/lib/mongodb';
import { LogEntry, UploadResponse } from '@/types';
import pLimit from 'p-limit';

// All your helper functions (cleanFileName, cleanDollarKeys, etc.) remain unchanged.
// --- Paste your existing helper functions here ---
// function cleanFileName(fileName: string): string { ... }
// function cleanDollarKeys(obj: any): any { ... }
// function cleanIncompleteClusterTime(obj: any): any { ... }
// function processJsonLogLine(line: string, metadata: any): any { ... }

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
    cleanedLine = cleanedLine.replace(/^\[/, '').replace(/,\s*$/, '').replace(/\]\s*$/, '');
    if (!cleanedLine) {
      return null;
    }

    // Parse the cleaned JSON line
    let jsonLog = JSON.parse(cleanedLine);

    // --- NEWLY INTEGRATED STEPS ---
    // 1. First, clean any incomplete clusterTime objects.
    jsonLog = cleanIncompleteClusterTime(jsonLog);

    // 2. Next, recursively clean keys starting with '$'.
    jsonLog = cleanDollarKeys(jsonLog);
    // --- END OF NEW STEPS ---

    // Extract timestamp from t.$date field and convert to Date object
    let logTimestamp = null;
    let queryStartTime = null;
    if (jsonLog.t && jsonLog.t.date) { // Note: cleanDollarKeys changes t.$date to t.date
      try {
        logTimestamp = new Date(jsonLog.t.date);
        if (isNaN(logTimestamp.getTime())) {
          logTimestamp = null;
        }
      } catch (dateError) {
        console.warn(`Failed to parse timestamp from t.date: ${jsonLog.t.date}`, dateError);
        logTimestamp = null;
      }
    } else if (jsonLog.t && typeof jsonLog.t === 'string') {
      try {
        logTimestamp = new Date(jsonLog.t);
        if (isNaN(logTimestamp.getTime())) {
          logTimestamp = null;
        }
      } catch (dateError) {
        console.warn(`Failed to parse timestamp from t: ${jsonLog.t}`, dateError);
        logTimestamp = null;
      }
    }
    
    // Note: The '$' from '$clusterTime' and '$timestamp' will be removed by cleanDollarKeys
    if (jsonLog.attr && jsonLog.attr.command && jsonLog.attr.command.clusterTime && jsonLog.attr.command.clusterTime.clusterTime && jsonLog.attr.command.clusterTime.clusterTime.timestamp && jsonLog.attr.command.clusterTime.clusterTime.timestamp.t) {
        try {
            queryStartTime = new Date(jsonLog.attr.command.clusterTime.clusterTime.timestamp.t * 1000);
        } catch (dateError) {
            console.warn(`Failed to parse timestamp from attr.command.clusterTime`, dateError);
            queryStartTime = null;
        }
    }
    else if (logTimestamp && jsonLog.attr && jsonLog.attr.durationMillis){
        queryStartTime = new Date (logTimestamp.getTime() - jsonLog.attr.durationMillis);
    }
    else {
        queryStartTime = logTimestamp; // Fallback to log timestamp
    }
    
    // Add metadata and extracted timestamp to the existing JSON structure
    return {
      ...jsonLog,
      logTimestamp: logTimestamp,
      queryStartTime: queryStartTime,
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
      // ... (rest of metadata)
    };
  }
}


// The new, revamped POST handler
export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse>> {
  try {
    const formData = await request.formData();
    
    // --- User Info and File Classification Parsing (Unchanged) ---
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

    const files: Blob[] = [];
    let fileClassifications: Array<{fileName: string, cleanedName?: string, classification: string, mongodbVersion?: string, index: number}> = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'file' && typeof (value as any).arrayBuffer === 'function') {
        files.push(value as Blob);
      }
      if (key === 'fileClassifications' && typeof value === 'string') {
        try {
          fileClassifications = JSON.parse(value);
        } catch (e) { console.warn('Failed to parse file classifications, using defaults'); }
      }
    }
    if (files.length === 0) {
      return NextResponse.json({ success: false, message: 'No files uploaded', error: 'FILES_MISSING' }, { status: 400 });
    }

    const uploadSessionId = new Date().toISOString() + '_' + Math.random().toString(36).substr(2, 9);
    let totalEntriesCreated = 0;
    let fileResults: any[] = [];
    let allProcessedDocs: any[] = [];

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];
      const fileInfo = fileClassifications.find(fc => fc.index === fileIndex) || { fileName: `uploaded_${fileIndex}.log`, classification: 'primary', mongodbVersion: '' };
      const { fileName, classification, mongodbVersion } = fileInfo;
      const cleanedFileName = cleanFileName(fileName);
      const isGzipped = fileName.toLowerCase().endsWith('.gz');

      // --- 1. Save File to a Temporary Location ---
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `upload_${Date.now()}_${fileName}`);
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(tempFilePath, buffer);

        // --- 2. Process File in Chunks ---
        const { documents, linesProcessed } = await processFileInChunks(tempFilePath, {
            cleanedFileName,
            classification,
            mongodbVersion,
            uploadSessionId,
            userInfo,
            isGzipped,
        });

        allProcessedDocs.push(...documents);
        totalEntriesCreated += documents.length;
        fileResults.push({ filename: fileName, cleanedFilename: cleanedFileName, classification, success: true, entriesCreated: documents.length, linesProcessed });

      } catch (fileProcessingError: any) {
        console.error(`Error processing file ${fileName}:`, fileProcessingError);
        fileResults.push({ filename: fileName, cleanedFilename: cleanedFileName, classification, success: false, message: fileProcessingError.message || 'Error processing file', error: 'FILE_PROCESSING_ERROR' });
      } finally {
        // --- 3. Cleanup Temporary File ---
        await fs.unlink(tempFilePath).catch(err => console.error(`Failed to delete temp file: ${tempFilePath}`, err));
      }
    }

    // --- 4. Bulk Insert All Processed Documents ---
    let allInsertedIds = {};
    if (allProcessedDocs.length > 0) {
      try {
        const collection = await getLogFilesCollection();
        // For very large uploads, consider batching this insertMany as well
        const result = await collection.insertMany(allProcessedDocs, { ordered: false });
        allInsertedIds = result.insertedIds;
      } catch (mongoError) {
        console.error("MongoDB Insertion Error:", mongoError);
        throw new Error('Failed to insert documents into MongoDB');
      }
    }

    // --- Statistics and Response (Unchanged) ---
    const stats = {
        totalEntries: allProcessedDocs.length,
        successfullyParsed: allProcessedDocs.filter((entry: any) => !entry.parseError).length,
        parseErrors: allProcessedDocs.filter((entry: any) => entry.parseError).length,
        // ... add other stats as needed
    };
    const successfulFiles = fileResults.filter(f => f.success).length;
    const failedFiles = fileResults.filter(f => !f.success).length;
    return NextResponse.json({ success: successfulFiles > 0, message: `Processed ${files.length} files. ${successfulFiles} successful, ${failedFiles} failed. Created ${totalEntriesCreated} total documents.`, entriesCreated: totalEntriesCreated, uploadSessionId, stats, insertedIds: allInsertedIds, fileResults });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ success: false, message: 'Internal server error', error: error?.message || 'SERVER_ERROR' }, { status: 500 });
  }
}

// --- New Helper Function for Chunk Processing ---
async function processFileInChunks(filePath: string, options: any) {
  const { cleanedFileName, classification, mongodbVersion, uploadSessionId, userInfo, isGzipped } = options;
  const CHUNK_SIZE = 200 * 1024 * 1024; // 200 MB
  const fileStats = await fs.stat(filePath);
  const totalSize = fileStats.size;
  const readPromises: Promise<any[]>[] = [];

  for (let start = 0; start < totalSize; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, totalSize - 1);
      const readStream = createReadStream(filePath, { start, end });

      // Decompress if gzipped, otherwise pass through
      const stream = isGzipped ? readStream.pipe(gunzip()) : readStream;
      
      readPromises.push(processStreamChunk(stream, {
          cleanedFileName,
          classification,
          mongodbVersion,
          uploadSessionId,
          userInfo
      }));
  }
  
  const chunkResults = await Promise.all(readPromises);
  
  const allDocuments = chunkResults.flat();
  const totalLines = allDocuments.reduce((acc, doc) => Math.max(acc, doc.lineNumber || 0), 0);
  
  return { documents: allDocuments, linesProcessed: totalLines };
}

async function processStreamChunk(stream: NodeJS.ReadableStream, metadataOptions: any): Promise<any[]> {
    const documents: any[] = [];
    let buffer = '';
    let lineNumber = 0; // Line numbers will be relative to the chunk, but this is a necessary tradeoff

    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
            buffer += chunk.toString('utf-8');
            let lastNewline;
            while ((lastNewline = buffer.lastIndexOf('\n')) !== -1) {
                const lines = buffer.substring(0, lastNewline).split('\n');
                buffer = buffer.substring(lastNewline + 1);

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    lineNumber++;
                    const lineMetadata = {
                      sourceFile: metadataOptions.cleanedFileName,
                      uploadDate: new Date(),
                      uploadSessionId: metadataOptions.uploadSessionId,
                      lineNumber: lineNumber, // Note: This is chunk-local, not file-global
                      fileClassification: metadataOptions.classification,
                      mongodbVersion: metadataOptions.mongodbVersion,
                      userEmail: metadataOptions.userInfo.email,
                      userName: metadataOptions.userInfo.name,
                      userId: metadataOptions.userInfo.userId
                    };
                    const doc = processJsonLogLine(line, lineMetadata);
                    if (doc) documents.push(doc);
                }
            }
        });

        stream.on('end', () => {
            if (buffer.trim()) {
                lineNumber++;
                 const lineMetadata = {
                      sourceFile: metadataOptions.cleanedFileName,
                      uploadDate: new Date(),
                      uploadSessionId: metadataOptions.uploadSessionId,
                      lineNumber: lineNumber,
                      fileClassification: metadataOptions.classification,
                      mongodbVersion: metadataOptions.mongodbVersion,
                      userEmail: metadataOptions.userInfo.email,
                      userName: metadataOptions.userInfo.name,
                      userId: metadataOptions.userInfo.userId
                    };
                const doc = processJsonLogLine(buffer, lineMetadata);
                if (doc) documents.push(doc);
            }
            resolve(documents);
        });
        
        stream.on('error', reject);
    });
}