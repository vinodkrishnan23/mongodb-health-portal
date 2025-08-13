'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useCallback } from 'react';
import Header from '@/components/Header';

interface LastUploadedFile {
  fileName: string;
  cleanedFilename: string;
  classification: 'primary' | 'secondary';
  entriesCreated: number;
  uploadDate: string;
}

export default function HomePage() {
  const router = useRouter();
  const [lastUploadedFiles, setLastUploadedFiles] = useState<LastUploadedFile[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserAndFiles = async () => {
      // Get user information from localStorage first (immediate)
      const savedUser = localStorage.getItem('user');
      let userData = null;
      if (savedUser) {
        try {
          userData = JSON.parse(savedUser);
          setUser(userData);
        } catch (error) {
          console.error('Error parsing user data:', error);
        }
      }

      // Load localStorage files immediately for instant UI
      const savedFiles = localStorage.getItem('lastUploadedFiles');
      if (savedFiles) {
        try {
          const parsedFiles = JSON.parse(savedFiles);
          setLastUploadedFiles(parsedFiles);
          setLoading(false); // Show UI immediately with localStorage data
        } catch (error) {
          console.error('Error parsing last uploaded files:', error);
        }
      }

      // Then try MongoDB in background
      if (userData?.email) {
        try {
          const response = await fetch(`/api/upload-session?userEmail=${encodeURIComponent(userData.email)}`);
          const data = await response.json();
          
          console.log('Upload session response:', data);
          
          if (data.success && data.data.latestSession?.uploadedFiles) {
            console.log('Found uploaded files in session:', data.data.latestSession.uploadedFiles.length, 'files');
            // Update with MongoDB data if available and different
            const mongoFiles = data.data.latestSession.uploadedFiles;
            setLastUploadedFiles(mongoFiles);
            
            // Also update localStorage for next time
            localStorage.setItem('lastUploadedFiles', JSON.stringify(mongoFiles));
          }
        } catch (error) {
          console.error('Failed to load files from MongoDB:', error);
        }
      }

      // Ensure loading is false even if no files found
      if (!savedFiles) {
        setLoading(false);
      }
    };

    loadUserAndFiles();
  }, []);

  const handleOpenAnalytics = () => {
    if (lastUploadedFiles.length > 0) {
      const filesParam = encodeURIComponent(JSON.stringify(lastUploadedFiles));
      router.push(`/analytics?files=${filesParam}`);
    }
  };

  const handleNewUpload = () => {
    router.push('/upload');
  };

  const getClassificationBadge = useCallback((classification: 'primary' | 'secondary') => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    if (classification === 'primary') {
      return `${baseClasses} bg-green-100 text-green-800 border border-green-300`;
    } else {
      return `${baseClasses} bg-blue-100 text-blue-800 border border-blue-300`;
    }
  }, []);

  // Memoized date formatter
  const formatDate = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  }, []);

  // Memoize expensive calculations
  const fileStats = useMemo(() => {
    if (!lastUploadedFiles.length) return null;
    
    return {
      totalFiles: lastUploadedFiles.length,
      totalEntries: lastUploadedFiles.reduce((sum, file) => sum + file.entriesCreated, 0),
      primaryFiles: lastUploadedFiles.filter(f => f.classification === 'primary').length,
      secondaryFiles: lastUploadedFiles.filter(f => f.classification === 'secondary').length
    };
  }, [lastUploadedFiles]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-green-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Header title="MongoDB Health Check Portal" />
      
      {/* Main Content */}
      <div className="w-full px-4 sm:px-6 lg:px-8 p-6">
        {lastUploadedFiles.length > 0 ? (
          <div className="space-y-6">
            {/* Last Uploaded Files Section */}
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-300">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-green-600 mb-2">📊 Your Last Analyzed Files</h2>
                  <p className="text-gray-600">Continue where you left off or start a new analysis</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleOpenAnalytics}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Open Analytics
                  </button>
                </div>
              </div>

              {/* Files Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {lastUploadedFiles.map((file, index) => (
                  <div key={index} className="bg-gray-100 rounded-lg p-4 border border-gray-600 hover:border-green-500 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">{file.cleanedFilename}</h3>
                        <p className="text-sm text-gray-600 truncate">{file.fileName}</p>
                      </div>
                      <span className={getClassificationBadge(file.classification)}>
                        {file.classification}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm mb-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Entries:</span>
                        <span className="text-green-600 font-semibold">{file.entriesCreated.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Uploaded:</span>
                        <span className="text-gray-700">{formatDate(file.uploadDate)}</span>
                      </div>
                    </div>
                    
                    {/* View Analytics Button */}
                    <button
                      onClick={() => {
                        const singleFileParam = encodeURIComponent(JSON.stringify([file]));
                        router.push(`/analytics?files=${singleFileParam}`);
                      }}
                      className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 mt-3 shadow-sm border border-green-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      View Analytics
                    </button>
                  </div>
                ))}
              </div>

              {/* Summary Stats */}
              <div className="mt-6 bg-gray-100 rounded-lg p-4 border border-gray-600">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{fileStats?.totalFiles || 0}</div>
                    <div className="text-sm text-gray-600">Files Analyzed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-400">
                      {fileStats?.totalEntries?.toLocaleString() || 0}
                    </div>
                    <div className="text-sm text-gray-600">Total Entries</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-400">
                      {fileStats?.primaryFiles || 0}
                    </div>
                    <div className="text-sm text-gray-600">Primary Files</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-400">
                      {fileStats?.secondaryFiles || 0}
                    </div>
                    <div className="text-sm text-gray-600">Secondary Files</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-300">
              <h3 className="text-xl font-semibold text-yellow-400 mb-4">⚡ Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <button
                  onClick={handleOpenAnalytics}
                  className="bg-gray-100 hover:bg-gray-200 border border-gray-600 rounded-lg p-4 text-left transition-colors group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center group-hover:bg-green-500">
                      <svg className="w-5 h-5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900">View Analytics</h4>
                  </div>
                  <p className="text-sm text-gray-600">Open interactive analytics dashboard for your last uploaded files</p>
                </button>

                <button
                  onClick={handleNewUpload}
                  className="bg-gray-100 hover:bg-gray-200 border border-gray-600 rounded-lg p-4 text-left transition-colors group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center group-hover:bg-blue-500">
                      <svg className="w-5 h-5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900">Upload New Files</h4>
                  </div>
                  <p className="text-sm text-gray-600">Upload and analyze new MongoDB log files</p>
                </button>

                <button
                  onClick={() => {
                    localStorage.removeItem('lastUploadedFiles');
                    setLastUploadedFiles([]);
                  }}
                  className="bg-gray-100 hover:bg-gray-200 border border-gray-600 rounded-lg p-4 text-left transition-colors group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center group-hover:bg-red-500">
                      <svg className="w-5 h-5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900">Clear History</h4>
                  </div>
                  <p className="text-sm text-gray-600">Clear your last uploaded files history</p>
                </button>
              </div>
            </div>
          </div>
        ) : (
          // First time user or no previous files
          <div className="max-w-4xl mx-auto text-center">
            <div className="bg-gray-50 rounded-xl p-8 border border-gray-300">
              <div className="text-gray-600 mb-6">
                <svg className="w-20 h-20 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              
              <p className="text-xl text-gray-700 mb-8">
                Get started by uploading your MongoDB log files to unlock powerful analytics and insights.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gray-100 rounded-lg p-6 border border-gray-600">
                  <div className="text-green-600 mb-3">
                    <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload & Process</h3>
                  <p className="text-sm text-gray-600">Upload .log or .log.gz files and let our system process them automatically</p>
                </div>
                
                <div className="bg-gray-100 rounded-lg p-6 border border-gray-600">
                  <div className="text-blue-400 mb-3">
                    <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Analyze & Visualize</h3>
                  <p className="text-sm text-gray-600">Get comprehensive analytics with interactive charts and performance insights</p>
                </div>
                
                <div className="bg-gray-100 rounded-lg p-6 border border-gray-600">
                  <div className="text-yellow-400 mb-3">
                    <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Optimize Performance</h3>
                  <p className="text-sm text-gray-600">Identify slow queries, connection issues, and optimization opportunities</p>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <button
                  onClick={handleNewUpload}
                  className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-lg text-lg font-semibold transition-colors flex items-center gap-3"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Start Analyzing Your Logs
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
