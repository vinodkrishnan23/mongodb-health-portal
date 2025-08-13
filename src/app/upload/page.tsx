'use client';

import { useState, useEffect } from 'react';
import FileUpload from '@/components/FileUpload';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import Header from '@/components/Header';
import { LogEntry } from '@/types';

interface LogFile {
  _id: string;
  count: number;
  uploadDate: string;
  isCompressed: boolean;
  originalName: string;
}

interface LogsResponse {
  success: boolean;
  data: LogFile[];
  pagination: {
    total: number;
    limit: number;
    skip: number;
    hasMore: boolean;
  };
}

interface StatsResponse {
  success: boolean;
  data: {
    overview: {
      totalEntries: number;
      uniqueFiles: number;
      withTimestamp: number;
      withLevel: number;
      withComponent: number;
      withContext: number;
      withMessage: number;
      emptyLines: number;
      timestampPercentage: number;
      levelPercentage: number;
      componentPercentage: number;
      avgLineLength: number;
      firstUpload: string;
      lastUpload: string;
    };
    levelDistribution: Array<{ _id: string; count: number }>;
    componentDistribution: Array<{ _id: string; count: number }>;
  };
}

interface FileStatsData {
  fileName: string;
  classification?: 'primary' | 'secondary';
  stats: StatsResponse['data'];
}

export default function UploadPage() {
  const [uploadedFiles, setUploadedFiles] = useState<LogFile[]>([]);
  const [currentFileStats, setCurrentFileStats] = useState<FileStatsData[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsFiles, setAnalyticsFiles] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);

  // Get user information from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
  }, []);

  const fetchUploadedFiles = async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/logs');
      const data: LogsResponse = await response.json();
      
      if (data.success) {
        setUploadedFiles(data.data);
      }
    } catch (error) {
      console.error('Error fetching uploaded files:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const fetchStatsForFile = async (sourceFile: string) => {
    try {
      const response = await fetch(`/api/stats?sourceFile=${encodeURIComponent(sourceFile)}`);
      const data: StatsResponse = await response.json();
      
      if (data.success) {
        // Try to get file classification from the first document
        let classification: 'primary' | 'secondary' | undefined;
        try {
          const entryResponse = await fetch(`/api/logs/${encodeURIComponent(sourceFile)}?limit=1`);
          const entryData = await entryResponse.json();
          if (entryData.success && entryData.data.length > 0) {
            classification = entryData.data[0].fileClassification;
          }
        } catch (e) {
          console.warn('Could not fetch file classification');
        }
        
        setCurrentFileStats(prev => [
          ...prev.filter(f => f.fileName !== sourceFile), // Remove existing stats for this file
          { fileName: sourceFile, classification, stats: data.data }
        ]);
      }
    } catch (error) {
      console.error('Error fetching file stats:', error);
    }
  };

  useEffect(() => {
    fetchUploadedFiles();
  }, []);

  const handleUpload = async (files: FileList, cleanedNames?: string[]) => {
    setLoading(true);
    // Clear previous stats when starting new upload
    setCurrentFileStats([]);
    
    try {
      // Files are already uploaded by the FileUpload component
      const fileNames = cleanedNames || Array.from(files).map(file => file.name);
      
      // Small delay to ensure data is inserted
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refresh the file list and fetch stats for each newly uploaded file
      await fetchUploadedFiles();
      
      // Fetch stats for each uploaded file using cleaned names
      for (const fileName of fileNames) {
        await fetchStatsForFile(fileName);
      }
    } catch (error) {
      console.error('Error handling upload:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFlushFile = async (sourceFile: string) => {
    if (!confirm(`Are you sure you want to delete all log entries for "${sourceFile}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/flush?sourceFile=${encodeURIComponent(sourceFile)}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`Successfully deleted ${result.deletedCount} log entries for "${sourceFile}"`);
        // Refresh the uploaded files list
        await fetchUploadedFiles();
        // Remove the file from current stats if it exists
        setCurrentFileStats(prev => prev.filter(f => f.fileName !== sourceFile));
      } else {
        alert(`Failed to flush file: ${result.message}`);
      }
    } catch (error) {
      console.error('Error flushing file:', error);
      alert('An error occurred while flushing the file');
    }
  };

  const handleFlushAllFiles = async () => {
    if (!confirm(`Are you sure you want to delete ALL log entries from all files? This action cannot be undone.`)) {
      return;
    }

    try {
      // Flush each file individually
      const flushPromises = uploadedFiles.map(file => 
        fetch(`/api/flush?sourceFile=${encodeURIComponent(file._id)}`, { method: 'DELETE' })
      );
      
      const responses = await Promise.all(flushPromises);
      const results = await Promise.all(responses.map(r => r.json()));
      
      const totalDeleted = results.reduce((sum, result) => sum + (result.deletedCount || 0), 0);
      
      alert(`Successfully deleted ${totalDeleted} log entries from ${uploadedFiles.length} files`);
      
      // Refresh the uploaded files list and clear stats
      await fetchUploadedFiles();
      setCurrentFileStats([]);
    } catch (error) {
      console.error('Error flushing all files:', error);
      alert('An error occurred while flushing all files');
    }
  };

  const formatDate = (date: string | Date): string => {
    return new Date(date).toLocaleString();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Header 
        title="MongoDB Health Check Portal"
        subtitle="Upload your MongoDB log files (.log or .log.gz) for analysis."
      />

      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-50 border border-gray-300 rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-2xl font-semibold text-green-600 mb-6">Upload Log Files</h2>
          <FileUpload 
            onUpload={handleUpload}
            loading={loading}
            accept=".log,.log.gz"
            user={user}
          />
        </div>

        {/* Analyze Logs Button - Shows after successful upload */}
        {currentFileStats.length > 0 && (
          <div className="text-center mb-8">
            <button
              onClick={async () => {
                const filesData = currentFileStats.map((fileData, index) => ({
                  fileName: fileData.fileName,
                  cleanedFilename: fileData.fileName, // Already cleaned filename from stats
                  classification: fileData.classification || 'primary',
                  entriesCreated: fileData.stats.overview.totalEntries,
                  uploadDate: new Date().toISOString(),
                  active: index === 0 // Set first file as active
                }));
                
                // Generate unique session ID
                const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                // Store files in MongoDB for persistence
                if (user?.email) {
                  try {
                    await fetch('/api/upload-session', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        userEmail: user.email,
                        sessionId,
                        files: filesData
                      })
                    });
                    
                    // Also store current session ID in localStorage for quick access
                    localStorage.setItem('currentSessionId', sessionId);
                    localStorage.setItem('lastUploadedFiles', JSON.stringify(filesData)); // Fallback
                  } catch (error) {
                    console.error('Failed to store session in MongoDB:', error);
                    // Fallback to localStorage
                    localStorage.setItem('lastUploadedFiles', JSON.stringify(filesData));
                  }
                } else {
                  // Fallback to localStorage if no user
                  localStorage.setItem('lastUploadedFiles', JSON.stringify(filesData));
                }
                
                setAnalyticsFiles(filesData);
                setShowAnalytics(!showAnalytics);
              }}
              className="inline-flex items-center px-8 py-3 bg-green-600 text-black rounded-lg hover:bg-green-500 font-semibold text-lg transition-colors shadow-lg"
            >
              <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {showAnalytics ? '❌ Hide Analytics' : '📊 Show Analytics'} ({currentFileStats.length} file{currentFileStats.length > 1 ? 's' : ''})
            </button>
            <p className="text-sm text-gray-600 mt-2">
              Deep dive into error analysis, performance insights, and security events
            </p>
          </div>
        )}

        {/* Analytics Dashboard - Shows when analytics button is clicked */}
        {showAnalytics && analyticsFiles.length > 0 && (
          <div className="mb-8 bg-gray-50 border border-gray-300 rounded-lg shadow-md">
            <div className="p-6 border-b border-gray-300">
              <h3 className="text-xl font-semibold text-green-600 mb-2">📊 Log Analytics</h3>
              <p className="text-gray-600">
                Comprehensive analysis of {analyticsFiles.length} log file{analyticsFiles.length > 1 ? 's' : ''}
              </p>
            </div>
            
            {/* Tabs for multiple files */}
            {analyticsFiles.length > 1 ? (
              <div className="border-b border-gray-300">
                <div className="flex overflow-x-auto">
                  {analyticsFiles.map((file) => (
                    <button
                      key={file.fileName}
                      onClick={() => setAnalyticsFiles(prev => prev.map(f => ({ ...f, active: f.fileName === file.fileName })))}
                      className={`flex-shrink-0 px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                        file.active
                          ? 'border-green-400 text-green-600 bg-gray-100'
                          : 'border-transparent text-gray-600 hover:text-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span>{file.fileName}</span>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          file.classification === 'primary' ? 
                          'bg-green-800 text-green-200' : 'bg-blue-800 text-blue-200'
                        }`}>
                          {file.classification}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            
            {/* Analytics content for active file */}
            <div className="p-6">
              {/* Full Analytics Button */}
              <div className="mb-6 text-center">
                <button
                  onClick={() => {
                    const filesParam = encodeURIComponent(JSON.stringify(analyticsFiles));
                    window.location.href = `/analytics?files=${filesParam}`;
                  }}
                  className="inline-flex items-center px-6 py-3 bg-blue-600 text-gray-900 rounded-lg hover:bg-blue-700 font-semibold transition-colors shadow-lg"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open Full Analytics Dashboard
                </button>
                <p className="text-sm text-gray-600 mt-2">
                  Access the complete analytics interface with enhanced scatter plots and detailed insights
                </p>
              </div>
              
              {analyticsFiles.length === 1 ? (
                <AnalyticsDashboard sourceFile={analyticsFiles[0].fileName} />
              ) : (
                (() => {
                  const activeFile = analyticsFiles.find(f => f.active) || analyticsFiles[0];
                  return <AnalyticsDashboard sourceFile={activeFile.fileName} />;
                })()
              )}
            </div>
          </div>
        )}

        {/* Statistics Section - Show for each uploaded file */}
        {currentFileStats.length > 0 && (
          <div className="space-y-6 mb-8">
            {currentFileStats.map((fileData, index) => (
              <div key={index} className="bg-gray-50 border border-gray-300 rounded-lg shadow-md p-8">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-semibold text-green-600">Log Stats</h3>
                  {fileData.classification && (
                    <span className={`px-3 py-1 text-xs rounded-full ${
                      fileData.classification === 'primary' ? 
                      'bg-green-800 text-green-200' : 'bg-blue-800 text-blue-200'
                    }`}>
                      {fileData.classification.charAt(0).toUpperCase() + fileData.classification.slice(1)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-6">Statistics for: <span className="text-green-300 font-medium">{fileData.fileName}</span></p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-100 p-4 rounded-lg border border-gray-600">
                    <div className="text-2xl font-bold text-green-600">{fileData.stats.overview.totalEntries.toLocaleString()}</div>
                    <div className="text-sm text-gray-600">Log Entries Created</div>
                  </div>
                  <div className="bg-gray-100 p-4 rounded-lg border border-gray-600">
                    <div className="text-2xl font-bold text-green-600">{fileData.stats.overview.timestampPercentage}%</div>
                    <div className="text-sm text-gray-600">Successfully Parsed Timestamps</div>
                  </div>
                  <div className="bg-gray-100 p-4 rounded-lg border border-gray-600">
                    <div className="text-2xl font-bold text-green-600">{fileData.stats.overview.levelPercentage}%</div>
                    <div className="text-sm text-gray-600">Successfully Parsed Log Levels</div>
                  </div>
                  <div className="bg-gray-100 p-4 rounded-lg border border-gray-600">
                    <div className="text-2xl font-bold text-green-600">{fileData.stats.overview.componentPercentage}%</div>
                    <div className="text-sm text-gray-600">Successfully Parsed Components</div>
                  </div>
                </div>
                
                {/* Remove individual file stats button */}
                <div className="mt-6 pt-4 border-t border-gray-300">
                  <button
                    onClick={() => {
                      setCurrentFileStats(prev => prev.filter(f => f.fileName !== fileData.fileName));
                    }}
                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-600"
                  >
                    Clear Stats for {fileData.fileName}
                  </button>
                </div>
              </div>
            ))}
            
            {/* Clear All Stats Button */}
            {currentFileStats.length > 1 && (
              <div className="text-center">
                <button
                  onClick={() => setCurrentFileStats([])}
                  className="px-6 py-2 text-sm bg-gray-600 text-gray-700 rounded hover:bg-gray-500"
                >
                  Clear All Log Stats
                </button>
              </div>
            )}
          </div>
        )}

        {uploadedFiles.length > 0 && (
          <div className="bg-gray-50 border border-gray-300 rounded-lg shadow-md p-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-green-600">Uploaded Files</h3>
              <button
                onClick={fetchUploadedFiles}
                disabled={refreshing}
                className="px-3 py-1 text-sm bg-green-600 text-black rounded hover:bg-green-500 disabled:opacity-50"
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            <div className="space-y-3">
              {uploadedFiles.map((logFile, index) => (
                <div 
                  key={logFile._id || index}
                  className="flex items-center justify-between p-4 bg-gray-100 rounded-lg border border-gray-600"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-green-300">{logFile._id}</span>
                      {logFile.isCompressed && (
                        <span className="px-2 py-1 text-xs bg-green-800 text-green-200 rounded">
                          Compressed
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      Log Entries: {logFile.count} • 
                      Uploaded: {formatDate(logFile.uploadDate)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        // Create a file object that matches the analytics page format
                        const analyticsFile = {
                          fileName: logFile._id,
                          cleanedFilename: logFile._id,
                          classification: 'primary' as const,
                          entriesCreated: logFile.count,
                          uploadDate: logFile.uploadDate
                        };
                        const singleFileParam = encodeURIComponent(JSON.stringify([analyticsFile]));
                        window.open(`/analytics?files=${singleFileParam}`, '_blank');
                      }}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
                    >
                      View Analytics
                    </button>
                    <button
                      onClick={() => window.open(`/api/logs/${logFile._id}`, '_blank')}
                      className="px-3 py-1 text-xs bg-green-600 text-black rounded hover:bg-green-500"
                    >
                      View Entries
                    </button>
                    <button
                      onClick={() => handleFlushFile(logFile._id)}
                      className="px-3 py-1 text-xs bg-red-600 text-gray-900 rounded hover:bg-red-500"
                    >
                      Flush
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Flush All Files Button */}
            {uploadedFiles.length > 1 && (
              <div className="mt-6 pt-4 border-t border-gray-300 text-center">
                <button
                  onClick={handleFlushAllFiles}
                  className="inline-flex items-center px-6 py-2 bg-red-600 text-gray-900 rounded-lg hover:bg-red-500 font-semibold transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  🗑️ Flush All Files ({uploadedFiles.length})
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  This will permanently delete all log entries from all uploaded files
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 bg-gray-50 border border-green-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-green-600 mb-3">Supported File Formats</h3>
          <ul className="space-y-2 text-green-300">
            <li className="flex items-center">
              <svg className="w-4 h-4 mr-2 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <strong>.log files</strong> - Standard MongoDB log files
            </li>
            <li className="flex items-center">
              <svg className="w-4 h-4 mr-2 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <strong>.gz files</strong> - Compressed MongoDB log files (automatically decompressed)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
