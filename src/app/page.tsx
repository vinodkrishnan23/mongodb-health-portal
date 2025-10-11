'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import FileUpload from '@/components/FileUpload';
import { useTimezone } from '@/context/TimezoneContext';
import { formatTimestampInTimezone } from '@/lib/timezone';

interface UploadedFile {
  fileName: string;
  cleanedFilename: string;
  classification: 'primary' | 'secondary';
  entriesCreated: number;
  uploadDate: string;
}

interface UploadSession {
  sessionId: string;
  userEmail: string;
  filesCount: number;
  uploadedFiles: UploadedFile[];
  createdAt: string;
  totalEntries: number;
  lastUploadDate: string;
}

export default function HomePage() {
  const router = useRouter();
  const { timezone } = useTimezone();
  const [user, setUser] = useState<any>(null);
  const [uploadSessions, setUploadSessions] = useState<UploadSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [flushLoading, setFlushLoading] = useState<string>(''); // Track which item is being flushed
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [migrationLoading, setMigrationLoading] = useState(false);

  useEffect(() => {
    const loadUserAndSessions = async () => {
      // Get user information from localStorage
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

      // Load upload sessions from MongoDB
      if (userData?.email) {
        try {
          console.log('📡 Fetching upload sessions for user:', userData.email);
          const response = await fetch(`/api/upload-session?userEmail=${encodeURIComponent(userData.email)}`);
          const data = await response.json();
          
          console.log('📋 API Response:', data);
          
          if (data.success && data.data.sessions && data.data.sessions.length > 0) {
            console.log('📋 Found upload sessions:', data.data.sessions.length);
            
            // Transform sessions to match our interface
            const transformedSessions = data.data.sessions.map((session: any) => ({
              sessionId: session.sessionId,
              userEmail: session.userEmail,
              filesCount: session.filesCount || 0,
              uploadedFiles: session.uploadedFiles || [],
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              // Calculate total entries across all files in this session
              totalEntries: (session.uploadedFiles || []).reduce((sum: number, file: any) => sum + (file.entriesCreated || 0), 0),
              // Get most recent upload date from files
              lastUploadDate: session.uploadedFiles && session.uploadedFiles.length > 0 
                ? session.uploadedFiles.reduce((latest: string, file: any) => 
                    new Date(file.uploadDate || file.createdAt || session.createdAt) > new Date(latest) 
                      ? file.uploadDate || file.createdAt || session.createdAt
                      : latest
                  , session.uploadedFiles[0].uploadDate || session.uploadedFiles[0].createdAt || session.createdAt)
                : session.createdAt || session.updatedAt
            }));
            
            setUploadSessions(transformedSessions);
          } else {
            console.log('📋 No upload sessions found or empty sessions array');
            setUploadSessions([]);
          }
        } catch (error) {
          console.error('Failed to load upload sessions:', error);
          setUploadSessions([]);
        }
      }

      setLoading(false);
    };

    loadUserAndSessions();
  }, []);

  const handleUploadSuccess = async (files: FileList, cleanedNames?: string[]) => {
    console.log('Upload successful with files:', files.length);
    
    // Show success message
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-green-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-md';
    notification.innerHTML = `
      <div class="flex items-center gap-3">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div>
          <div class="font-semibold">Upload Successful!</div>
          <div class="text-sm opacity-90">${files.length} file(s) processed successfully</div>
          <div class="text-sm opacity-90 mt-1">Page will refresh to show your analyzed files...</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Remove notification after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
    
    // Refresh upload sessions after successful upload
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  };

  const handleFlush = async (sessionId: string, fileName?: string) => {
    if (!user?.email) return;
    
    const confirmMessage = fileName 
      ? `Are you sure you want to delete data for "${fileName}"?`
      : `Are you sure you want to delete all data for session "${sessionId}"?`;
      
    if (!confirm(confirmMessage)) return;
    
    const flushKey = fileName || sessionId;
    setFlushLoading(flushKey);
    
    try {
      const params = new URLSearchParams({
        userEmail: user.email,
        sessionId: sessionId
      });
      
      if (fileName) {
        params.append('sourceFile', fileName);
      }
      
      const response = await fetch(`/api/flush?${params.toString()}`, {
        method: 'DELETE',
        headers: {
          'x-user-email': user.email,
        },
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log('🗑️ Flush successful:', data);
        // Refresh the page to show updated data
        window.location.reload();
      } else {
        alert(`Failed to flush data: ${data.message}`);
      }
    } catch (error) {
      console.error('Failed to flush data:', error);
      alert('Failed to flush data. Please try again.');
    } finally {
      setFlushLoading('');
    }
  };

  const handleViewAnalytics = (files: UploadedFile[]) => {
    const filesParam = encodeURIComponent(JSON.stringify(files));
    router.push(`/analytics?files=${filesParam}`);
  };

  const handleDebugFlush = async () => {
    if (!user?.email) return;
    
    try {
      console.log('🔍 DEBUG FLUSH: Fetching debug info for user:', user.email);
      const response = await fetch(`/api/debug-flush?userEmail=${encodeURIComponent(user.email)}`);
      const data = await response.json();
      
      if (data.success) {
        console.log('🔍 DEBUG FLUSH: Data found:', data.data);
        alert(`Debug Info:
Sessions: ${data.data.uploadSessions.length}
Log Files: ${data.data.totalLogFiles}
Unique uploadSessionIds: ${data.data.uniqueUploadSessionIds.length}

See console for detailed info.`);
      } else {
        alert(`Debug failed: ${data.message}`);
      }
    } catch (error) {
      console.error('Debug flush failed:', error);
      alert('Debug flush failed. Check console.');
    }
  };

  const handleDebug = async () => {
    if (!user?.email) return;
    
    try {
      console.log('🔍 DEBUG: Fetching debug info for user:', user.email);
      const response = await fetch(`/api/debug-sessions?userEmail=${encodeURIComponent(user.email)}`);
      const data = await response.json();
      
      if (data.success) {
        setDebugInfo(data.debug);
        setShowDebug(true);
        console.log('🔍 DEBUG: Debug info received:', data.debug);
      } else {
        alert(`Debug failed: ${data.message}`);
      }
    } catch (error) {
      console.error('Debug failed:', error);
      alert('Debug failed. Check console for details.');
    }
  };

  const handleMigration = async () => {
    if (!user?.email) return;
    
    if (!confirm('This will create upload_sessions records from your existing log files. Continue?')) return;
    
    setMigrationLoading(true);
    
    try {
      console.log('🔄 MIGRATION: Starting migration for user:', user.email);
      const response = await fetch(`/api/migrate-sessions?userEmail=${encodeURIComponent(user.email)}`, {
        method: 'POST',
        headers: {
          'x-user-email': user.email,
        },
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log('🔄 MIGRATION: Migration successful:', data);
        alert(`Migration successful! Created ${data.data.migratedSessions} sessions, skipped ${data.data.skippedSessions} existing ones.`);
        // Refresh the page to show migrated data
        window.location.reload();
      } else {
        alert(`Migration failed: ${data.message}`);
      }
    } catch (error) {
      console.error('Migration failed:', error);
      alert('Migration failed. Check console for details.');
    } finally {
      setMigrationLoading(false);
    }
  };

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
      <div className="w-full px-4 sm:px-6 lg:px-8 p-6 space-y-8">
        {/* File Upload Section */}
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-300">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-green-600 mb-2">Upload MongoDB Log Files</h2>
            <p className="text-gray-600">Upload .log or .log.gz files to analyze your MongoDB performance</p>
          </div>
          
          <FileUpload 
            onUpload={handleUploadSuccess}
            user={user}
            loading={false}
          />
        </div>

        {/* Analyzed Files Section */}
        {uploadSessions.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-6 border border-gray-300">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-green-600 mb-2">Your Analyzed Files</h2>
              <p className="text-gray-600">Recent upload sessions and their analytics</p>
            </div>
            
            <div className="space-y-4">
              {uploadSessions.map((session) => (
                <div key={session.sessionId} className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                  {/* Session Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Session: {session.sessionId.replace('session_', '').substring(0, 8)}...
                        </h3>
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                          {session.filesCount} file{session.filesCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <div>Total Entries: <span className="font-semibold text-green-600">{session.totalEntries.toLocaleString()}</span></div>
                        <div>Last Updated: {formatTimestampInTimezone(session.lastUploadDate, timezone, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZoneName: 'short'
                        })}</div>
                      </div>
                    </div>
                    
                    {/* Session Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewAnalytics(session.uploadedFiles)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        View Analytics
                      </button>
                      
                      <button
                        onClick={() => handleFlush(session.sessionId)}
                        disabled={flushLoading === session.sessionId}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        {flushLoading === session.sessionId ? 'Flushing...' : 'Flush Session'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Files in Session */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {session.uploadedFiles.map((file, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate">{file.cleanedFilename}</h4>
                            <p className="text-xs text-gray-500 truncate">{file.fileName}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            file.classification === 'primary' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-green-50 text-green-600'
                          }`}>
                            {file.classification}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-600 mb-3">
                          <div>Entries: <span className="font-medium">{file.entriesCreated.toLocaleString()}</span></div>
                          <div>Date: {formatTimestampInTimezone(file.uploadDate, timezone, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}</div>
                        </div>
                        
                        {/* Individual File Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewAnalytics([file])}
                            className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Analytics
                          </button>
                          
                          <button
                            onClick={() => handleFlush(session.sessionId, file.fileName)}
                            disabled={flushLoading === file.fileName}
                            className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded text-xs font-medium transition-colors flex items-center justify-center"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            {flushLoading === file.fileName ? '...' : 'Flush'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Debug Section */}
        {uploadSessions.length === 0 && (
          <div className="bg-yellow-50 rounded-xl p-6 border border-yellow-200">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-yellow-800 mb-2">🔍 Troubleshooting</h2>
              <p className="text-yellow-700 mb-4">
                Can't see your previously analyzed files? This might help diagnose the issue.
              </p>
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleDebug}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Check Database
                </button>
                
                <button
                  onClick={handleDebugFlush}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Debug Flush
                </button>
                
                <button
                  onClick={handleMigration}
                  disabled={migrationLoading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {migrationLoading ? 'Migrating...' : 'Fix Missing Sessions'}
                </button>
              </div>
            </div>
            
            {/* Debug Information Display */}
            {showDebug && debugInfo && (
              <div className="mt-6 bg-white rounded-lg p-4 border border-yellow-300">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">Debug Information</h3>
                  <button
                    onClick={() => setShowDebug(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="space-y-3 text-sm">
                  <div>
                    <strong>Upload Sessions in Database:</strong> {debugInfo.uploadSessions.count}
                    {debugInfo.uploadSessions.count > 0 && (
                      <div className="ml-4 mt-1">
                        {debugInfo.uploadSessions.records.map((session: any, i: number) => (
                          <div key={i} className="text-xs text-gray-600">
                            • {session.sessionId} ({session.filesCount} files)
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <strong>Log Entries in Database:</strong> {debugInfo.logFiles.count}
                    {debugInfo.logFiles.count > 0 && (
                      <div className="ml-4 mt-1 space-y-1">
                        <div><strong>Files:</strong> {debugInfo.logFiles.distinctSourceFiles.join(', ')}</div>
                        <div><strong>Session IDs:</strong> {debugInfo.logFiles.distinctUploadSessionIds.length > 0 ? debugInfo.logFiles.distinctUploadSessionIds.join(', ') : 'None found'}</div>
                      </div>
                    )}
                  </div>
                  
                  {debugInfo.suggestions && debugInfo.suggestions.length > 0 && (
                    <div className="bg-red-50 rounded p-3 border border-red-200">
                      <strong className="text-red-800">Suggestions:</strong>
                      <ul className="list-disc list-inside mt-1 text-red-700">
                        {debugInfo.suggestions.map((suggestion: string, i: number) => (
                          <li key={i}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* No Data State */}
        {uploadSessions.length === 0 && !showDebug && (
          <div className="bg-gray-50 rounded-xl p-8 border border-gray-300 text-center">
            <div className="text-gray-600 mb-4">
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Analyzed Files Yet</h3>
            <p className="text-gray-600 mb-6">
              Upload your first MongoDB log files using the upload widget above to start analyzing your database performance.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-green-600 mb-2">
                  <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">Upload & Process</h4>
                <p className="text-sm text-gray-600">Upload .log or .log.gz files and let our system process them automatically</p>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-blue-400 mb-2">
                  <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">Analyze & Visualize</h4>
                <p className="text-sm text-gray-600">Get comprehensive analytics with interactive charts and performance insights</p>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-yellow-400 mb-2">
                  <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">Optimize Performance</h4>
                <p className="text-sm text-gray-600">Identify slow queries, connection issues, and optimization opportunities</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}