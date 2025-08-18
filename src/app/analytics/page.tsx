'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import Header from '@/components/Header';

interface FileData {
  fileName: string;
  cleanedFilename: string;
  classification: 'primary' | 'secondary';
  entriesCreated: number;
  uploadDate?: string;
}

export default function AnalyticsPage() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeFile, setActiveFile] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{name: string; email: string} | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const loadFiles = async () => {
      // Get files from URL params first
      const filesParam = searchParams.get('files');
      if (filesParam) {
        try {
          const parsedFiles = JSON.parse(decodeURIComponent(filesParam));
          setFiles(parsedFiles);
          if (parsedFiles.length > 0) {
            setActiveFile(parsedFiles[0]);
          }
          setLoading(false);
          return;
        } catch (error) {
          console.error('Error parsing files parameter:', error);
        }
      }

      // Try to get files from MongoDB using user email
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        try {
          const userData = JSON.parse(savedUser);
          setUser(userData); // Set user state for display
          if (userData.email) {
            const response = await fetch(`/api/upload-session?userEmail=${encodeURIComponent(userData.email)}`);
            const data = await response.json();
            
            console.log('Analytics page - Upload session response:', data);
            
            if (data.success && data.data.latestSession?.uploadedFiles) {
              console.log('Analytics page - Found uploaded files:', data.data.latestSession.uploadedFiles.length, 'files');
              setFiles(data.data.latestSession.uploadedFiles);
              if (data.data.latestSession.uploadedFiles.length > 0) {
                setActiveFile(data.data.latestSession.uploadedFiles[0]);
              }
              setLoading(false);
              return;
            } else {
              console.log('Analytics page - No uploaded files found in session');
            }
          }
        } catch (error) {
          console.error('Failed to load files from MongoDB:', error);
        }
      }

      // Fallback to localStorage
      const savedFiles = localStorage.getItem('lastUploadedFiles');
      if (savedFiles) {
        try {
          const parsedSavedFiles = JSON.parse(savedFiles);
          setFiles(parsedSavedFiles);
          if (parsedSavedFiles.length > 0) {
            setActiveFile(parsedSavedFiles[0]);
          }
        } catch (error) {
          console.error('Error parsing saved files:', error);
        }
      }

      setLoading(false);
    };

    loadFiles();
  }, [searchParams]);

  const getClassificationBadge = (classification: 'primary' | 'secondary') => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    if (classification === 'primary') {
      return `${baseClasses} bg-green-900 text-green-300 border border-green-700`;
    } else {
      return `${baseClasses} bg-blue-900 text-blue-300 border border-blue-700`;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded w-1/3 mb-6"></div>
            <div className="h-4 bg-gray-300 rounded w-2/3 mb-8"></div>
            <div className="space-y-4">
              <div className="h-12 bg-gray-300 rounded"></div>
              <div className="h-64 bg-gray-300 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="min-h-screen bg-white text-gray-900 p-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-green-600 mb-4">📊 MongoDB Log Analytics</h1>
          <div className="bg-gray-50 rounded-xl p-8 border border-gray-300">
            <div className="text-gray-600 mb-4">
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No Log Files to Analyze</h2>
            <p className="text-gray-500 mb-6">
              Please upload some MongoDB log files first to view analytics.
            </p>
            <a
              href="/"
              className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 font-semibold transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
              </svg>
              Go Back to Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Header title="📊 MongoDB Log Analytics" showBackButton={true}>
        {/* File Selector */}
        <div className="mt-4 flex items-center space-x-3">
          <label htmlFor="fileSelector" className="text-sm font-medium text-gray-700">
            Log File:
          </label>
          <select
            id="fileSelector"
            value={activeFile?.fileName || ''}
            onChange={(e) => {
              const selectedFile = files.find(f => f.fileName === e.target.value);
              setActiveFile(selectedFile || null);
            }}
            className="bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent min-w-0"
          >
            <option value="">Select a log file...</option>
            {files.map(file => (
              <option key={file.fileName} value={file.fileName}>
                {file.cleanedFilename} ({file.entriesCreated.toLocaleString()} entries)
              </option>
            ))}
          </select>
        </div>
      </Header>

      {/* File Info Row */}
      {activeFile && (
        <div className="mx-4 sm:mx-6 lg:mx-8 mb-4 flex items-center justify-between bg-gray-100 rounded-lg p-3 border border-gray-300">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-medium text-gray-900">{activeFile.cleanedFilename}</span>
            </div>
            <span className={getClassificationBadge(activeFile.classification)}>
              {activeFile.classification}
            </span>
            <span className="text-sm text-gray-600">
              📝 {activeFile.entriesCreated.toLocaleString()} entries
            </span>
            {activeFile.uploadDate && (
              <span className="text-sm text-gray-600">
                📅 {formatDate(activeFile.uploadDate)}
              </span>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Original Filename</div>
            <div className="text-gray-700 font-mono text-sm truncate max-w-xs">
              {activeFile.fileName}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 p-6">
        {activeFile ? (
          <div>
            {/* Analytics Dashboard */}
            <AnalyticsDashboard sourceFile={activeFile.cleanedFilename} />
          </div>
        ) : (
          /* Welcome Screen */
          <div className="text-center py-12">
            <div className="bg-gray-50 rounded-xl p-8 border border-gray-300 max-w-2xl mx-auto">
              <div className="text-gray-600 mb-4">
                <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Select a Log File to Analyze</h2>
              <p className="text-gray-500 mb-6">
                Choose from {files.length} available log file{files.length > 1 ? 's' : ''} using the selector above.
              </p>
              
              {/* Quick File Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
                {files.slice(0, 6).map((file) => (
                  <div
                    key={file.fileName}
                    onClick={() => setActiveFile(file)}
                    className="bg-white rounded-lg p-4 border border-gray-300 hover:border-green-500 cursor-pointer transition-colors group shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-green-600 transition-colors">
                          {file.cleanedFilename}
                        </h3>
                      </div>
                      <span className={getClassificationBadge(file.classification)}>
                        {file.classification}
                      </span>
                    </div>
                    
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Entries:</span>
                        <span className="text-green-600 font-semibold">{file.entriesCreated.toLocaleString()}</span>
                      </div>
                      {file.uploadDate && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Uploaded:</span>
                          <span className="text-gray-700">{formatDate(file.uploadDate)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {files.length > 6 && (
                  <div className="bg-white rounded-lg p-4 border border-gray-300 flex items-center justify-center shadow-sm">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-600 mb-1">+{files.length - 6}</div>
                      <div className="text-xs text-gray-500">more files</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
