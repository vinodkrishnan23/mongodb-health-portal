'use client';

import { useState, useEffect } from 'react';

interface AnalyticsData {
  timestampRange: {
    minTimestamp: string | null;
    maxTimestamp: string | null;
    totalLogs: number;
  };
  connectionStats: any[];
  errorAnalysis: any[];
  slowOperations: any[];
  slowQueries: any[];
  authEvents: any[];
  connectionSources: any[];
  indexUsage: any[];
  healthEvents: any[];
}

interface AnalyticsDashboardProps {
  sourceFile: string;
}

export default function AnalyticsDashboard({ sourceFile }: AnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuery, setSelectedQuery] = useState<any | null>(null);
  const [showQueryModal, setShowQueryModal] = useState(false);
  
  // Timestamp filtering states
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [filteredQueries, setFilteredQueries] = useState<any[]>([]);
  
  // Time filter dropdown state
  const [timeFilter, setTimeFilter] = useState<string>('');
  
  // Operation type and namespace filter states
  const [operationFilter, setOperationFilter] = useState<string>('');
  const [namespaceFilter, setNamespaceFilter] = useState<string>('');
  const [inMemorySortsFilter, setInMemorySortsFilter] = useState<boolean>(false);
  const [fromMultiPlannerFilter, setFromMultiPlannerFilter] = useState<boolean>(false);
  
  // Timeline analysis states
  const [selectedTimestamp, setSelectedTimestamp] = useState<string>('');
  const [timelineQueries, setTimelineQueries] = useState<any[]>([]);
  const [showTimelineAnalysis, setShowTimelineAnalysis] = useState(false);
  const [timelineSortMetric, setTimelineSortMetric] = useState<string>('duration');
  const [timelineOperationFilter, setTimelineOperationFilter] = useState<string>('');
  const [timelineInMemorySortsFilter, setTimelineInMemorySortsFilter] = useState<boolean>(false);
  const [timelineFromMultiPlannerFilter, setTimelineFromMultiPlannerFilter] = useState<boolean>(false);
  const [timelineExcludeErroredFilter, setTimelineExcludeErroredFilter] = useState<boolean>(false);
  const [timelineWindowSeconds, setTimelineWindowSeconds] = useState<number>(120);
  
  // Hover tooltip state
  const [hoveredQuery, setHoveredQuery] = useState<any | null>(null);
  
  // Y-axis selection and scrolling states
  const [yAxisMetric, setYAxisMetric] = useState<string>('duration');
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const [maxScrollOffset, setMaxScrollOffset] = useState<number>(0);
  const [viewportWidth, setViewportWidth] = useState<number>(800);
  const [totalWidth, setTotalWidth] = useState<number>(800);

  useEffect(() => {
    fetchAnalytics();
  }, [sourceFile]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/analytics?sourceFile=${encodeURIComponent(sourceFile)}`);
      const data = await response.json();
      
      if (data.success) {
        setAnalytics(data.analytics);
        console.log('Analytics data received:', data.analytics);
        console.log('Slow queries:', data.analytics.slowQueries?.length || 0);
        console.log('Timestamp range:', data.analytics.timestampRange);
        
        // Initialize filtered queries with all data
        setFilteredQueries(data.analytics.slowQueries || []);
        
        // Set default date range based on overall log file timestamp range
        if (data.analytics.timestampRange?.minTimestamp && data.analytics.timestampRange?.maxTimestamp) {
          const minDate = new Date(data.analytics.timestampRange.minTimestamp);
          const maxDate = new Date(data.analytics.timestampRange.maxTimestamp);
          setStartDate(minDate.toISOString().split('T')[0]);
          setEndDate(maxDate.toISOString().split('T')[0]);
        }
        
        setError(null);
      } else {
        setError(data.message || 'Failed to fetch analytics');
      }
    } catch (err) {
      setError('Network error while fetching analytics');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to extract operation type from query
  const getOperationType = (query: any): string | null => {
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
  };

  // Classify queries by performance characteristics
  const getTimelineOperationType = (query: any): string => {
    // Check for errors first - highest priority
    if (query.errCode && query.errCode !== null && query.errCode !== '') {
      return 'ErroredOut';
    }
    
    // Check for COLLSCAN - high priority after errors
    if (query.planSummary && query.planSummary === 'COLLSCAN') {
      return 'COLLSCAN';
    }
    
    // Calculate total duration in seconds for percentage calculations
    const totalDurationMs = query.durationMillis || query.duration || 0;
    const totalDurationSeconds = totalDurationMs / 1000;
    
    // Check for CPU Intensive (CPU Time / Total Duration > 20%)
    if (query.cpuNanos && totalDurationSeconds > 0) {
      const cpuTimeSeconds = query.cpuNanos / 1000000000;
      const cpuPercentage = (cpuTimeSeconds / totalDurationSeconds) * 100;
      if (cpuPercentage > 50) {
        return 'CPU Intensive';
      }
    }
    
    // Check for Disk Intensive (Data Reading I/O / Total Duration > 50% OR Data Read > 500MB)
    if (query.timeReadingMicros && totalDurationSeconds > 0) {
      const ioTimeSeconds = query.timeReadingMicros / 1000000;
      const ioPercentage = (ioTimeSeconds / totalDurationSeconds) * 100;
      if (ioPercentage > 50) {
        return 'Disk Intensive';
      }
    }
    
    if (query.dataReadMB && query.dataReadMB > 500) {
      return 'Disk Intensive';
    }
    
    // Default to regular operation type classification
    return getOperationType(query) || 'unknown';
  };

  // Filter queries when date/time range or time filter changes
  useEffect(() => {
    if (!analytics?.slowQueries) return;

    let filtered = analytics.slowQueries;

    // Apply operation type filter
    if (operationFilter) {
      filtered = filtered.filter((query: any) => {
        const operationType = getOperationType(query);
        return operationType === operationFilter;
      });
    }

    // Apply namespace filter
    if (namespaceFilter) {
      filtered = filtered.filter((query: any) => query.namespace === namespaceFilter);
    }

    // Apply InMemorySorts filter
    if (inMemorySortsFilter) {
      filtered = filtered.filter((query: any) => query.hasSortStage === true);
    }

    // Apply FromMultiPlanner filter
    if (fromMultiPlannerFilter) {
      filtered = filtered.filter((query: any) => query.fromMultiPlanner === true);
    }

    // Apply time filter first (12:00 AM to 12:00 PM means 00:00 to 12:00)
    if (timeFilter) {
      const [startHour, endHour] = timeFilter.split('-').map(t => parseInt(t));
      filtered = filtered.filter((query: any) => {
        const queryDate = new Date(query.timestamp);
        const queryHour = queryDate.getHours();
        if (startHour <= endHour) {
          return queryHour >= startHour && queryHour < endHour;
        } else {
          // Handle overnight ranges (e.g., 22-06)
          return queryHour >= startHour || queryHour < endHour;
        }
      });
    }

    // Apply date/time filtering
    if (startDate || endDate || startTime || endTime) {
      filtered = filtered.filter((query: any) => {
        const queryDate = new Date(query.timestamp);
        
        // Create start datetime
        let startDateTime = null;
        if (startDate) {
          const timeStr = startTime || '00:00:00';
          startDateTime = new Date(`${startDate}T${timeStr}`);
        }
        
        // Create end datetime
        let endDateTime = null;
        if (endDate) {
          const timeStr = endTime || '23:59:59';
          endDateTime = new Date(`${endDate}T${timeStr}`);
        }

        if (startDateTime && queryDate < startDateTime) return false;
        if (endDateTime && queryDate > endDateTime) return false;
        return true;
      });
    }

    setFilteredQueries(filtered);
    console.log(`Filtered queries: ${filtered.length} out of ${analytics.slowQueries.length}`);
  }, [analytics?.slowQueries, startDate, endDate, startTime, endTime, timeFilter, operationFilter, namespaceFilter, inMemorySortsFilter, fromMultiPlannerFilter]);

  // Handle viewport width changes and scrolling boundaries
  useEffect(() => {
    const handleResize = () => {
      // Make viewport width responsive to screen size
      const screenWidth = window.innerWidth;
      if (screenWidth < 640) { // sm breakpoint
        setViewportWidth(600);
      } else if (screenWidth < 1024) { // lg breakpoint
        setViewportWidth(700);
      } else {
        setViewportWidth(800);
      }
    };
    
    // Set initial viewport width
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle keyboard navigation for scrolling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!filteredQueries.length) return;
      
      const scrollStep = viewportWidth * 0.1; // 10% of viewport
      
      switch (e.key) {
        case 'ArrowLeft':
          setScrollOffset(prev => Math.max(0, prev - scrollStep));
          break;
        case 'ArrowRight':
          setScrollOffset(prev => Math.min(maxScrollOffset, prev + scrollStep));
          break;
        case 'Home':
          setScrollOffset(0);
          break;
        case 'End':
          setScrollOffset(maxScrollOffset);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredQueries.length, viewportWidth, maxScrollOffset]);

  // Mouse wheel scrolling support
  useEffect(() => {
    const handleWheel = (e: Event) => {
      const wheelEvent = e as WheelEvent;
      if (!filteredQueries.length) return;
      
      e.preventDefault();
      const scrollStep = viewportWidth * 0.05; // 5% of viewport per scroll
      const deltaX = wheelEvent.deltaX || wheelEvent.deltaY; // Support both horizontal and vertical scrolling
      
      if (deltaX > 0) {
        setScrollOffset(prev => Math.min(maxScrollOffset, prev + scrollStep));
      } else if (deltaX < 0) {
        setScrollOffset(prev => Math.max(0, prev - scrollStep));
      }
    };

    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) {
      chartContainer.addEventListener('wheel', handleWheel, { passive: false });
      return () => chartContainer.removeEventListener('wheel', handleWheel);
    }
  }, [filteredQueries.length, viewportWidth, maxScrollOffset]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 border border-gray-300">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-300 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-300 rounded"></div>
            <div className="h-3 bg-gray-300 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="bg-white rounded-xl p-6 border border-red-300">
        <h3 className="text-red-600 font-semibold mb-2">Analytics Error</h3>
        <p className="text-gray-700">{error}</p>
      </div>
    );
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const formatTimestampIST = (timestamp: any) => {
    try {
      let date: Date;
      if (typeof timestamp === 'number') {
        // If it's a Unix timestamp
        date = new Date(timestamp * 1000);
      } else if (timestamp.$date) {
        // MongoDB date format
        date = new Date(timestamp.$date);
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else {
        return JSON.stringify(timestamp);
      }
      
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (e) {
      return 'Invalid timestamp';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'E': return 'text-red-600';
      case 'F': return 'text-red-700';
      case 'W': return 'text-yellow-600';
      case 'I': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  // Function to get sort value for timeline analysis
  const getTimelineSortValue = (query: any) => {
    switch (timelineSortMetric) {
      case 'duration':
        return query.duration || 0;
      case 'docsExaminedReturnedRatio':
        const docsExamined = query.docsExamined || 0;
        const nreturned = query.nreturned || 1;
        return nreturned > 0 ? docsExamined / nreturned : 0;
      case 'keysExaminedReturnedRatio':
        const keysExamined = query.keysExamined || 0;
        const nreturnedKeys = query.nreturned || 1;
        return nreturnedKeys > 0 ? keysExamined / nreturnedKeys : 0;
      case 'reslen':
        return query.reslen || 0;
      case 'numYields':
        return query.numYields || 0;
      case 'dataReadMB':
        return query.dataReadMB || 0;
      case 'cpuTimeSeconds':
        return query.cpuTimeSeconds || 0;
      default:
        return query.duration || 0;
    }
  };

  // Function to get sort metric label for timeline analysis
  const getTimelineSortLabel = () => {
    switch (timelineSortMetric) {
      case 'duration':
        return 'duration';
      case 'docsExaminedReturnedRatio':
        return 'docs examined/returned ratio';
      case 'keysExaminedReturnedRatio':
        return 'keys examined/returned ratio';
      case 'reslen':
        return 'response length';
      case 'numYields':
        return 'number of yields';
      case 'dataReadMB':
        return 'data read from disk';
      case 'cpuTimeSeconds':
        return 'CPU time';
      default:
        return 'duration';
    }
  };

  // Function to format timeline sort value for display
  const formatTimelineSortValue = (query: any) => {
    const value = getTimelineSortValue(query);
    switch (timelineSortMetric) {
      case 'duration':
        return `${value}ms`;
      case 'docsExaminedReturnedRatio':
      case 'keysExaminedReturnedRatio':
        return value.toFixed(2);
      case 'reslen':
        return `${value} bytes`;
      case 'numYields':
        return `${value} yields`;
      case 'dataReadMB':
        return `${value.toFixed(2)} MB`;
      case 'cpuTimeSeconds':
        return `${value.toFixed(3)}s`;
      default:
        return `${value}ms`;
    }
  };

  // Function to analyze queries running at a specific timestamp
  const analyzeQueriesAtTimestamp = (timestamp: string) => {
    if (!analytics?.slowQueries || !timestamp) {
      setTimelineQueries([]);
      return;
    }

    const targetTime = new Date(timestamp).getTime();
    
    const runningQueries = analytics.slowQueries.filter((query: any) => {
      // Check if query has both start and end times
      if (!query.queryStartTime || !query.queryEndTime) return false;
      
      // Filter out system databases (local, admin, config)
      if (query.namespace) {
        const dbName = query.namespace.split('.')[0];
        if (['local', 'admin', 'config'].includes(dbName)) {
          return false;
        }
      }
      
      let startTime: number;
      let endTime: number;
      
      try {
        // Handle different timestamp formats
        if (typeof query.queryStartTime === 'number') {
          startTime = query.queryStartTime * 1000; // Convert to milliseconds if it's Unix timestamp
        } else if (query.queryStartTime.$date) {
          startTime = new Date(query.queryStartTime.$date).getTime();
        } else {
          startTime = new Date(query.queryStartTime).getTime();
        }
        
        if (typeof query.queryEndTime === 'number') {
          endTime = query.queryEndTime * 1000;
        } else if (query.queryEndTime.$date) {
          endTime = new Date(query.queryEndTime.$date).getTime();
        } else {
          endTime = new Date(query.queryEndTime).getTime();
        }
        
        // Check if target timestamp falls within query execution period
        return targetTime >= startTime && targetTime <= endTime;
      } catch (e) {
        console.warn('Error parsing timestamps for query:', query);
        return false;
      }
    });

    // Apply operation type filter if selected
    let filteredQueries = runningQueries;
    if (timelineOperationFilter) {
      filteredQueries = runningQueries.filter((query: any) => {
        const operationType = getTimelineOperationType(query);
        return operationType === timelineOperationFilter;
      });
    }

    // Apply Timeline InMemorySorts filter if selected
    if (timelineInMemorySortsFilter) {
      filteredQueries = filteredQueries.filter((query: any) => query.hasSortStage === true);
    }

    // Apply Timeline FromMultiPlanner filter if selected
    if (timelineFromMultiPlannerFilter) {
      filteredQueries = filteredQueries.filter((query: any) => query.fromMultiPlanner === true);
    }

    // Apply Timeline Exclude Errored Queries filter if selected
    if (timelineExcludeErroredFilter) {
      filteredQueries = filteredQueries.filter((query: any) => {
        // Exclude queries that have error codes (ErroredOut queries)
        return !(query.errCode && query.errCode !== null && query.errCode !== '');
      });
    }

    // Sort by selected metric (highest first) and add timeline position info
    const sortedQueries = filteredQueries
      .sort((a, b) => getTimelineSortValue(b) - getTimelineSortValue(a))
      .map((query, index) => ({
        ...query,
        timelineIndex: index
      }));

    setTimelineQueries(sortedQueries);
    setShowTimelineAnalysis(true);
  };

  return (
    <div className="w-full space-y-4 lg:space-y-6 text-left">
      {/* Connection Analytics Widget */}
      <div className="bg-white rounded-xl p-4 lg:p-6 border border-gray-300">
        <h3 className="text-lg lg:text-xl font-semibold text-blue-600 mb-4">🌐 Application Connections</h3>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {analytics.connectionStats.length > 0 ? (
            analytics.connectionStats.map((conn, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-3 mb-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-green-400 font-semibold text-sm">
                        {conn.appName || 'Unknown App'}
                      </span>
                      <span className="text-blue-600 text-xs px-2 py-1 bg-blue-100 rounded">
                        {conn.totalConnections} connections
                      </span>
                      <span className="text-purple-400 text-xs px-2 py-1 bg-purple-900 rounded">
                        {conn.totalUniqueIPs} unique IPs
                      </span>
                    </div>
                    <div className="text-gray-700 text-sm mb-2">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <span><strong>Driver:</strong> {conn.driverName || 'Unknown'}</span>
                        <span><strong>Version:</strong> {conn.driverVersion || 'Unknown'}</span>
                        {conn.mongodbVersion && (
                          <span><strong>MongoDB:</strong> {conn.mongodbVersion}</span>
                        )}
                      </div>
                      {/* Driver Compatibility Status */}
                      {conn.compatibility && (
                        <div className="mt-2 space-y-2">
                          {/* Overall Compatibility Status */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-gray-700 text-sm"><strong>Compatibility:</strong></span>
                            <span className={`text-xs px-2 py-1 rounded font-medium ${
                              conn.compatibility.isCompatible 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {conn.compatibility.isCompatible ? '✅ Compatible' : '❌ Not Compatible'}
                            </span>
                          </div>
                          
                          {/* Individual Driver Results for Combined Drivers */}
                          {conn.compatibility.results && conn.compatibility.results.length > 1 && (
                            <div className="space-y-1">
                              {conn.compatibility.results.map((result: any, resultIndex: number) => (
                                <div key={resultIndex} className="flex items-center space-x-2 text-xs">
                                  <span className="text-gray-600">{result.driverName}:</span>
                                  <span className={`px-1 py-0.5 rounded ${
                                    result.isCompatible 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-red-100 text-red-800'
                                  }`}>
                                    {result.isCompatible ? '✅' : '❌'}
                                  </span>
                                  {!result.isCompatible && (
                                    <span className="text-yellow-400 text-xs">
                                      {result.notes?.includes('does not support') 
                                        ? 'Unsupported MongoDB version' 
                                        : result.recommendedVersions ? `Rec: ${result.recommendedVersions.slice(0, 2).join(', ')}` : 'Incompatible'
                                      }
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* Overall recommendations */}
                          {!conn.compatibility.isCompatible && conn.compatibility.recommendedVersions && conn.compatibility.recommendedVersions.length > 0 && (
                            <div className="text-xs text-yellow-400">
                              <strong>Recommendations:</strong> {conn.compatibility.recommendedVersions.slice(0, 3).join(', ')}
                            </div>
                          )}
                          
                          {/* Overall notes and detailed information */}
                          {conn.compatibility && (conn.compatibility.notes || 
                            (conn.compatibility.results && conn.compatibility.results.some((r: any) => r.notes))) && (
                            <div className="text-xs text-gray-600 mt-1 space-y-1">
                              {conn.compatibility.notes && (
                                <div>{conn.compatibility.notes}</div>
                              )}
                              {conn.compatibility.results && conn.compatibility.results.filter((r: any) => r.notes).map((result: any, noteIndex: number) => (
                                <div key={noteIndex} className="text-orange-400">
                                  <strong>{result.driverName}:</strong> {result.notes}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <strong className="text-gray-700 text-sm">IP Addresses:</strong>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {conn.remoteIPs && Array.isArray(conn.remoteIPs) && conn.remoteIPs.length > 0 ? (
                          conn.remoteIPs.filter((ip: string) => ip && ip !== null && ip !== undefined).map((ip: string, ipIndex: number) => (
                            <span key={ipIndex} className="text-xs bg-white text-gray-700 px-2 py-1 rounded font-mono">
                              {ip}
                            </span>
                          ))
                        ) : (
                          <div className="text-gray-600 text-xs">
                            <span>No IP addresses recorded</span>
                            {/* Debug info */}
                            <div className="text-yellow-400 text-xs mt-1">
                              Debug: remoteIPs = {JSON.stringify(conn.remoteIPs)} | 
                              allRemoteIPs = {JSON.stringify(conn.allRemoteIPs)}
                            </div>
                          </div>
                        )}
                        {conn.totalUniqueIPs > 10 && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                            +{conn.totalUniqueIPs - 10} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-600">No application connection metadata found in this log file.</p>
          )}
        </div>
        
        {/* Connection Sources Section - DISABLED */}
        {/* <div className="mt-6">
          <h4 className="text-green-400 font-semibold mb-3">Connection Sources</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {analytics.connectionSources.slice(0, 10).map((source, index) => (
              <div key={index} className="bg-gray-50 rounded p-3 border border-gray-200">
                <div className="flex justify-between items-start">
                  <span className="text-gray-700 text-sm font-mono">{typeof source._id === 'object' ? JSON.stringify(source._id) : source._id}</span>
                  <div className="text-right text-xs">
                    <div className="text-blue-600">{source.connections} events</div>
                    <div className="text-green-400">{source.uniqueConnectionCount} unique</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div> */}
      </div>

      {/* Performance Insights Widget */}
      <div className="bg-white rounded-xl p-4 lg:p-6 border border-gray-300">
        <h3 className="text-lg lg:text-xl font-semibold text-yellow-600 mb-4">⚡ Performance Insights</h3>
        
        {/* Slow Running Queries Scatter Plot */}
        <div className="mb-6 border border-yellow-300 rounded-lg p-1">
          <h4 className="text-yellow-700 font-semibold mb-3 bg-yellow-100 p-2 rounded">🔍 Query Performance Analysis</h4>
          
          {/* Controls Section */}
          <div className="mb-4 bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-3">
            
            {/* Y-axis Metric Selector and Time Filter */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label htmlFor="yAxisMetric" className="text-sm font-medium text-gray-700 whitespace-nowrap">Y-Axis Metric:</label>
                <select
                  id="yAxisMetric"
                  value={yAxisMetric}
                  onChange={(e) => setYAxisMetric(e.target.value)}
                  className="bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-500 w-full sm:w-auto min-w-0"
                >
                  <option value="duration">Operation Execution Time (ms)</option>
                  <option value="docsExaminedReturnedRatio">Docs Examined/Returned Ratio</option>
                  <option value="keysExaminedReturnedRatio">Keys Examined/Returned Ratio</option>
                  <option value="reslen">Response Length (bytes)</option>
                  <option value="numYields">Number of Yields</option>
                  <option value="dataReadMB">Data Read from Disk (MB)</option>
                  <option value="cpuTimeSeconds">CPU Time (s)</option>
                </select>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label htmlFor="timeFilter" className="text-sm font-medium text-gray-700 whitespace-nowrap">Time Filter:</label>
                <select
                  id="timeFilter"
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value)}
                  className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-500 w-full sm:w-auto min-w-0"
                >
                  <option value="">All Day</option>
                  <option value="0-1">12:00 AM - 1:00 AM</option>
                  <option value="1-2">1:00 AM - 2:00 AM</option>
                  <option value="2-3">2:00 AM - 3:00 AM</option>
                  <option value="3-4">3:00 AM - 4:00 AM</option>
                  <option value="4-5">4:00 AM - 5:00 AM</option>
                  <option value="5-6">5:00 AM - 6:00 AM</option>
                  <option value="6-7">6:00 AM - 7:00 AM</option>
                  <option value="7-8">7:00 AM - 8:00 AM</option>
                  <option value="8-9">8:00 AM - 9:00 AM</option>
                  <option value="9-10">9:00 AM - 10:00 AM</option>
                  <option value="10-11">10:00 AM - 11:00 AM</option>
                  <option value="11-12">11:00 AM - 12:00 PM</option>
                  <option value="12-13">12:00 PM - 1:00 PM</option>
                  <option value="13-14">1:00 PM - 2:00 PM</option>
                  <option value="14-15">2:00 PM - 3:00 PM</option>
                  <option value="15-16">3:00 PM - 4:00 PM</option>
                  <option value="16-17">4:00 PM - 5:00 PM</option>
                  <option value="17-18">5:00 PM - 6:00 PM</option>
                  <option value="18-19">6:00 PM - 7:00 PM</option>
                  <option value="19-20">7:00 PM - 8:00 PM</option>
                  <option value="20-21">8:00 PM - 9:00 PM</option>
                  <option value="21-22">9:00 PM - 10:00 PM</option>
                  <option value="22-23">10:00 PM - 11:00 PM</option>
                  <option value="23-24">11:00 PM - 12:00 AM</option>
                </select>
              </div>
            </div>

            {/* Operation Type and Namespace Filters */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label htmlFor="operationFilter" className="text-sm font-medium text-gray-700 whitespace-nowrap">Operation Type:</label>
                <select
                  id="operationFilter"
                  value={operationFilter}
                  onChange={(e) => setOperationFilter(e.target.value)}
                  className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-500 w-full sm:w-auto min-w-0"
                >
                  <option value="">All Operations</option>
                  {analytics?.slowQueries && Array.from(new Set(
                    analytics.slowQueries.map((query: any) => getOperationType(query)).filter((op): op is string => Boolean(op))
                  )).sort().map((op: string) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label htmlFor="namespaceFilter" className="text-sm font-medium text-gray-700 whitespace-nowrap">Namespace:</label>
                <select
                  id="namespaceFilter"
                  value={namespaceFilter}
                  onChange={(e) => setNamespaceFilter(e.target.value)}
                  className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-500 w-full sm:w-auto min-w-0"
                >
                  <option value="">All Namespaces</option>
                  {analytics?.slowQueries && Array.from(new Set(
                    analytics.slowQueries.map((query: any) => query.namespace).filter(Boolean)
                  )).sort().map((ns) => (
                    <option key={ns} value={ns}>{ns}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inMemorySortsFilter}
                    onChange={(e) => setInMemorySortsFilter(e.target.checked)}
                    className="w-4 h-4 text-yellow-600 bg-white border-gray-200 rounded focus:ring-yellow-500 focus:ring-2"
                  />
                  <span>InMemorySorts</span>
                </label>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fromMultiPlannerFilter}
                    onChange={(e) => setFromMultiPlannerFilter(e.target.checked)}
                    className="w-4 h-4 text-yellow-600 bg-white border-gray-200 rounded focus:ring-yellow-500 focus:ring-2"
                  />
                  <span>FromMultiPlanner</span>
                </label>
              </div>
            </div>
            
            {/* Date Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 mb-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label htmlFor="startDate" className="text-sm text-gray-700 whitespace-nowrap">From:</label>
                <div className="flex gap-2">
                  <input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-white border border-gray-200 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-500 w-full sm:w-auto"
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="bg-white border border-gray-200 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-500 w-full sm:w-auto"
                    step="1"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label htmlFor="endDate" className="text-sm text-gray-700 whitespace-nowrap">To:</label>
                <div className="flex gap-2">
                  <input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-white border border-gray-200 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-500 w-full sm:w-auto"
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="bg-white border border-gray-200 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-500 w-full sm:w-auto"
                    step="1"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setStartTime('');
                    setEndTime('');
                  }}
                  className="bg-yellow-600 hover:bg-yellow-700 text-black px-3 py-1 rounded text-sm font-medium transition-colors"
                >
                  Clear Date Filters
                </button>
                <button
                  onClick={() => setScrollOffset(0)}
                  className="bg-green-600 hover:bg-green-700 text-gray-800 px-3 py-1 rounded text-sm font-medium transition-colors"
                >
                  Reset View
                </button>
              </div>
              <div className="flex-1 space-y-1">
                <div className="text-sm text-gray-600">
                  Showing {filteredQueries.length} of {analytics.slowQueries?.length || 0} queries
                </div>
                {analytics.timestampRange && (
                  <div className="text-xs text-gray-600 break-words">
                    Log range: {analytics.timestampRange.totalLogs} entries from {' '}
                    {analytics.timestampRange.minTimestamp ? new Date(analytics.timestampRange.minTimestamp).toLocaleDateString() : 'N/A'} to {' '}
                    {analytics.timestampRange.maxTimestamp ? new Date(analytics.timestampRange.maxTimestamp).toLocaleDateString() : 'N/A'}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Left-aligned Chart Container */}
          <div className="bg-gray-50 rounded-lg p-2 lg:p-4 border border-gray-200">
            {filteredQueries && filteredQueries.length > 0 ? (
              <div className="space-y-2">
                {/* Main Chart Area - Left Aligned */}
                <div className="chart-container relative w-full h-64 sm:h-80 lg:h-96 bg-gray-900 rounded border border-gray-300 overflow-hidden">
                  <svg 
                    className="w-full h-full" 
                    viewBox={`${scrollOffset} 0 ${viewportWidth} 400`}
                    style={{ display: 'block' }}
                  >
                    {(() => {
                      // Calculate metrics for current Y-axis selection
                      const getYValue = (query: any) => {
                        switch (yAxisMetric) {
                          case 'duration':
                            return query.duration || 0;
                          case 'docsExaminedReturnedRatio':
                            // Calculate docsExamined / nreturned
                            const docsExamined = query.docsExamined || 0;
                            const nreturned = query.nreturned || 1; // Avoid division by zero
                            return nreturned > 0 ? docsExamined / nreturned : 0;
                          case 'keysExaminedReturnedRatio':
                            // Calculate keysExamined / nreturned
                            const keysExamined = query.keysExamined || 0;
                            const nreturnedKeys = query.nreturned || 1; // Avoid division by zero
                            return nreturnedKeys > 0 ? keysExamined / nreturnedKeys : 0;
                          case 'reslen':
                            return query.reslen || 0;
                          case 'numYields':
                            return query.numYields || 0;
                          case 'dataReadMB':
                            return query.dataReadMB || 0;
                          case 'cpuTimeSeconds':
                            return query.cpuTimeSeconds || 0;
                          default:
                            return query.duration || 0;
                        }
                      };

                      const getYAxisLabel = () => {
                        switch (yAxisMetric) {
                          case 'duration':
                            return 'Duration (ms)';
                          case 'docsExaminedReturnedRatio':
                            return 'Docs Examined/Returned Ratio';
                          case 'keysExaminedReturnedRatio':
                            return 'Keys Examined/Returned Ratio';
                          case 'reslen':
                            return 'Response Length (bytes)';
                          case 'numYields':
                            return 'Number of Yields';
                          case 'dataReadMB':
                            return 'Data Read from Disk (MB)';
                          case 'cpuTimeSeconds':
                            return 'CPU Time (s)';
                          default:
                            return 'Duration (ms)';
                        }
                      };

                      // Filter queries with valid Y values
                      const validQueries = filteredQueries.filter(q => {
                        const yValue = getYValue(q);
                        return yValue !== null && yValue !== undefined && yValue >= 0;
                      });

                      // Debug CPU time metric
                      if (yAxisMetric === 'cpuTimeSeconds') {
                        console.log('CPU Time Debug:');
                        console.log('Total filtered queries:', filteredQueries.length);
                        console.log('Valid CPU time queries:', validQueries.length);
                        console.log('Sample raw queries:', filteredQueries.slice(0, 3).map(q => ({
                          cpuTimeSeconds: q.cpuTimeSeconds,
                          cpuNanos: q.cpuNanos,
                          duration: q.duration,
                          namespace: q.namespace,
                          cpuTimeType: typeof q.cpuTimeSeconds,
                          cpuTimeValue: q.cpuTimeSeconds
                        })));
                        console.log('Sample getYValue results:', filteredQueries.slice(0, 3).map(q => ({
                          query: q.namespace,
                          yValue: getYValue(q),
                          yValueType: typeof getYValue(q)
                        })));
                      }

                      if (validQueries.length === 0) {
                        return (
                          <text x="400" y="200" textAnchor="middle" fill="#9CA3AF" fontSize="14">
                            No data available for selected metric
                          </text>
                        );
                      }

                      const maxYValue = Math.max(...validQueries.map(getYValue));
                      
                      // Debug CPU time metric
                      if (yAxisMetric === 'cpuTimeSeconds') {
                        console.log('CPU Time maxYValue:', maxYValue);
                        console.log('All CPU time values:', validQueries.map(getYValue));
                      }
                      const minTime = Math.min(...validQueries.map(q => new Date(q.timestamp).getTime()));
                      const maxTime = Math.max(...validQueries.map(q => new Date(q.timestamp).getTime()));
                      
                      // Calculate total width needed for proper time spacing
                      const timeSpanHours = (maxTime - minTime) / (1000 * 60 * 60);
                      const minChartWidth = Math.max(1200, timeSpanHours * 50); // 50px per hour minimum
                      
                      // Update total width for scrolling
                      if (totalWidth !== minChartWidth) {
                        setTotalWidth(minChartWidth);
                        setMaxScrollOffset(Math.max(0, minChartWidth - viewportWidth));
                      }

                      // Time range for current view (no zoom, use full range)
                      const visibleMinTime = minTime;
                      const visibleMaxTime = maxTime;
                      const timeRange = visibleMaxTime - visibleMinTime || 1;
                      const yRange = maxYValue || 1;

                      return (
                        <>
                          {/* Chart background and axes */}
                          <rect x="0" y="0" width={totalWidth} height="400" fill="#ffffff" />
                          
                          {/* Grid lines - 30-minute intervals */}
                          {(() => {
                            const gridLines = [];
                            
                            // Fixed 30-minute interval
                            const intervalMs = 30 * 60 * 1000; // 30 minutes
                            
                            // Start from the first 30-minute boundary
                            const startTime = Math.ceil(visibleMinTime / intervalMs) * intervalMs;
                            
                            for (let time = startTime; time <= visibleMaxTime; time += intervalMs) {
                              const x = 40 + ((time - visibleMinTime) / timeRange) * (totalWidth - 80);
                              if (x >= 40 && x <= totalWidth - 40) {
                                const date = new Date(time);
                                
                                gridLines.push(
                                  <g key={time}>
                                    <line 
                                      x1={x} y1="30" 
                                      x2={x} y2="340" 
                                      stroke="#d1d5db" 
                                      strokeWidth="1" 
                                      strokeOpacity="0.5"
                                    />
                                    <text 
                                      x={x} y="360" 
                                      textAnchor="middle" 
                                      fill="#6b7280" 
                                      fontSize="9"
                                      transform={`rotate(-45, ${x}, 360)`}
                                    >
                                      {date.toLocaleTimeString('en-US', { 
                                        hour: '2-digit', 
                                        minute: '2-digit',
                                        hour12: false 
                                      })}
                                    </text>
                                  </g>
                                );
                              }
                            }
                            return gridLines;
                          })()}

                          {/* Horizontal grid lines for Y-axis */}
                          {[0.2, 0.4, 0.6, 0.8].map(fraction => {
                            const y = 340 - (fraction * 310);
                            // Format values based on metric type - ratios and decimal metrics need decimal places
                            const isDecimalMetric = yAxisMetric === 'docsExaminedReturnedRatio' || 
                                                   yAxisMetric === 'keysExaminedReturnedRatio' ||
                                                   yAxisMetric === 'dataReadMB' ||
                                                   yAxisMetric === 'cpuTimeSeconds';
                            const value = (maxYValue * fraction).toFixed(isDecimalMetric ? 2 : 0);
                            return (
                              <g key={fraction}>
                                <line x1="40" y1={y} x2={totalWidth - 40} y2={y} stroke="#e5e7eb" strokeWidth="1" strokeOpacity="0.3"/>
                                <text x="35" y={y + 3} textAnchor="end" fill="#6B7280" fontSize="10">{value}</text>
                              </g>
                            );
                          })}

                          {/* Main axes */}
                          <line x1="40" y1="340" x2={totalWidth - 40} y2="340" stroke="#6B7280" strokeWidth="2"/>
                          <line x1="40" y1="30" x2="40" y2="340" stroke="#6B7280" strokeWidth="2"/>
                          
                          {/* Axis labels */}
                          <text x={totalWidth / 2} y="390" textAnchor="middle" fill="#9CA3AF" fontSize="14" fontWeight="bold">
                            Time (30-minute intervals) → (Scroll to navigate)
                          </text>
                          
                          <text x="15" y="20" fill="#9CA3AF" fontSize="12" fontWeight="bold">
                            {getYAxisLabel()}
                          </text>
                          
                          {/* Data points */}
                          {validQueries.slice(0, 1000).map((query, index) => {
                            const queryTime = new Date(query.timestamp).getTime();
                            const yValue = getYValue(query);
                            
                            // Skip if outside visible time range
                            if (queryTime < visibleMinTime || queryTime > visibleMaxTime) return null;
                            
                            const x = 40 + ((queryTime - visibleMinTime) / timeRange) * (totalWidth - 80);
                            const y = 340 - ((yValue / yRange) * 310);
                            
                            // Extract operation type
                            const getOperationType = (query: any) => {
                              // Check for errors first - highest priority
                              if (query.errCode && query.errCode !== null && query.errCode !== '') {
                                return 'ErroredOut';
                              }
                              
                              if (query.command) {
                                if (query.command.find) return 'find';
                                if (query.command.aggregate) return 'aggregate';
                                if (query.command.update) return 'update';
                                if (query.command.insert) return 'insert';
                                if (query.command.delete) return 'delete';
                                if (query.command.findAndModify) return 'findAndModify';
                                if (query.command.count) return 'count';
                                return Object.keys(query.command)[0] || 'unknown';
                              }
                              
                              if (query.operation) {
                                return query.operation;
                              }
                              
                              const msg = query.message || '';
                              if (msg.includes('find')) return 'find';
                              if (msg.includes('aggregate')) return 'aggregate';
                              if (msg.includes('update')) return 'update';
                              if (msg.includes('insert')) return 'insert';
                              if (msg.includes('delete')) return 'delete';
                              if (msg.includes('count')) return 'count';
                              
                              return 'query';
                            };

                            const operationType = getOperationType(query);
                            
                            // Color coding by operation type
                            const getColor = (opType: string) => {
                              switch (opType) {
                                case 'ErroredOut': return '#DC2626'; // bright red for errors
                                case 'find': return '#10B981'; // green
                                case 'aggregate': return '#F59E0B'; // yellow
                                case 'update': return '#EF4444'; // red
                                case 'insert': return '#3B82F6'; // blue
                                case 'delete': return '#DC2626'; // dark red
                                case 'count': return '#8B5CF6'; // purple
                                default: return '#6B7280'; // gray
                              }
                            };
                            
                            return (
                              <circle
                                key={`${query._id || index}-${queryTime}`}
                                cx={x}
                                cy={y}
                                r="4"
                                fill={getColor(operationType)}
                                stroke="#374151"
                                strokeWidth="1"
                                opacity="0.8"
                                className="cursor-pointer hover:opacity-100 hover:r-6"
                                onMouseEnter={(e) => {
                                  setHoveredQuery({
                                    ...query,
                                    operationType,
                                    yValue,
                                    yMetric: yAxisMetric,
                                    x: e.clientX,
                                    y: e.clientY
                                  });
                                }}
                                onMouseLeave={() => setHoveredQuery(null)}
                                onClick={() => {
                                  setSelectedQuery(query);
                                  setShowQueryModal(true);
                                }}
                              />
                            );
                          })}

                        </>
                      );
                    })()}
                  </svg>
                </div>

                {/* Operation Types Legend */}
                <div className="flex flex-wrap items-center justify-center gap-4 mt-2 text-xs">
                  {[
                    { type: 'find', color: '#10B981', label: 'Find' },
                    { type: 'aggregate', color: '#F59E0B', label: 'Aggregate' },
                    { type: 'update', color: '#EF4444', label: 'Update' },
                    { type: 'insert', color: '#3B82F6', label: 'Insert' },
                    { type: 'delete', color: '#DC2626', label: 'Delete' },
                    { type: 'count', color: '#8B5CF6', label: 'Count' }
                  ].map(({ type, color, label }) => (
                    <div key={type} className="flex items-center gap-1">
                      <div 
                        className="w-3 h-3 rounded-full border border-white/20"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-gray-700">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Hover Tooltip */}
                {hoveredQuery && (
                  <div 
                    className="fixed z-50 bg-gray-50 text-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 pointer-events-none max-w-xs"
                    style={{
                      left: hoveredQuery.x + 10,
                      top: hoveredQuery.y - 10,
                      transform: 'translateY(-100%)'
                    }}
                  >
                    <div className="text-sm font-medium text-yellow-400 mb-1">
                      {hoveredQuery.operationType.toUpperCase()} Operation
                    </div>
                    <div className="text-xs space-y-1">
                      <div>
                        <span className="text-gray-600">Timestamp:</span> {new Date(hoveredQuery.timestamp).toLocaleString()}
                      </div>
                      <div>
                        <span className="text-gray-600">Operation:</span> {hoveredQuery.operationType}
                      </div>
                      <div>
                        <span className="text-gray-600">{hoveredQuery.yMetric === 'duration' ? 'Duration' : 
                          hoveredQuery.yMetric === 'scannedReturnedRatio' ? 'Scanned/Returned Ratio' :
                          hoveredQuery.yMetric === 'reslen' ? 'Response Length' : 'Number of Yields'}:</span> {
                          hoveredQuery.yMetric === 'scannedReturnedRatio' ? 
                            (hoveredQuery.yValue ? hoveredQuery.yValue.toFixed(2) : 'N/A') :
                            (hoveredQuery.yValue || 'N/A')
                        }{hoveredQuery.yMetric === 'duration' ? 'ms' : hoveredQuery.yMetric === 'reslen' ? ' bytes' : ''}
                      </div>
                      {hoveredQuery.queryHash && (
                        <div>
                          <span className="text-gray-600">Query Hash:</span> {hoveredQuery.queryHash}
                        </div>
                      )}
                      {hoveredQuery.namespace && (
                        <div>
                          <span className="text-gray-600">Namespace:</span> {hoveredQuery.namespace}
                        </div>
                      )}
                      {hoveredQuery.docsExamined && (
                        <div>
                          <span className="text-gray-600">Docs Examined:</span> {hoveredQuery.docsExamined}
                        </div>
                      )}
                      {hoveredQuery.docsReturned && (
                        <div>
                          <span className="text-gray-600">Docs Returned:</span> {hoveredQuery.docsReturned}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 bg-white rounded border-2 border-dashed border-gray-500">
                <p className="text-gray-700 mb-2 font-semibold">📊 Scatter Plot Area</p>
                {analytics.slowQueries && analytics.slowQueries.length > 0 ? (
                  <div>
                    <p className="text-gray-600 mb-2">No queries match the current date filter.</p>
                    <p className="text-gray-600 text-sm">
                      Try adjusting the date range or clearing filters to see all {analytics.slowQueries.length} queries.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-600 mb-2">No slow queries found in this log file.</p>
                    <p className="text-gray-600 text-sm">
                      Looking for queries with duration ≥ 0.01s or containing performance data...
                    </p>
                  </div>
                )}
                <p className="text-yellow-400 text-xs mt-2">
                  Debug: slowQueries = {analytics.slowQueries ? analytics.slowQueries.length : 'undefined'}, filtered = {filteredQueries.length}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline Analysis Widget */}
      <div className="bg-white rounded-xl p-4 lg:p-6 border border-gray-300">
        <h3 className="text-lg lg:text-xl font-semibold text-purple-600 mb-4">⏰ Timeline Analysis</h3>
        
        <div className="mb-6 border border-purple-300 rounded-lg p-4">
          <h4 className="text-purple-700 font-semibold mb-3">🕐 Queries Running at Specific Time</h4>
          
          {/* Timestamp Input Section */}
          <div className="mb-4 bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="flex flex-col gap-4">
              {/* First row: Timestamp input and analyze button */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label htmlFor="selectedTimestamp" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    Select Timestamp:
                  </label>
                  <input
                    id="selectedTimestamp"
                    type="datetime-local"
                    value={selectedTimestamp}
                    onChange={(e) => setSelectedTimestamp(e.target.value)}
                    className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    step="1"
                  />
                </div>
                <button
                  onClick={() => analyzeQueriesAtTimestamp(selectedTimestamp)}
                  disabled={!selectedTimestamp}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-gray-800 px-4 py-2 rounded text-sm font-medium transition-colors"
                >
                  Analyze Timeline
                </button>
                <div className="text-sm text-gray-600">
                  Found: {timelineQueries.length} concurrent queries{timelineOperationFilter ? ` (${timelineOperationFilter} operations)` : ''}
                </div>
              </div>
              
              {/* Second row: Sort metric dropdown */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label htmlFor="timelineSortMetric" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    Sort by:
                  </label>
                  <select
                    id="timelineSortMetric"
                    value={timelineSortMetric}
                    onChange={(e) => {
                      setTimelineSortMetric(e.target.value);
                      if (selectedTimestamp && timelineQueries.length > 0) {
                        analyzeQueriesAtTimestamp(selectedTimestamp);
                      }
                    }}
                    className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-auto min-w-0"
                  >
                    <option value="duration">Operation Execution Time (ms)</option>
                    <option value="docsExaminedReturnedRatio">Docs Examined/Returned Ratio</option>
                    <option value="keysExaminedReturnedRatio">Keys Examined/Returned Ratio</option>
                    <option value="reslen">Response Length (bytes)</option>
                    <option value="numYields">Number of Yields</option>
                    <option value="dataReadMB">Data Read from Disk (MB)</option>
                    <option value="cpuTimeSeconds">CPU Time (s)</option>
                  </select>
                </div>
                <div className="text-sm text-gray-600">
                  Queries will be sorted by selected metric (highest first)
                </div>
              </div>
              
              {/* Third row: Operation type filter dropdown */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label htmlFor="timelineOperationFilter" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    Operation Type:
                  </label>
                  <select
                    id="timelineOperationFilter"
                    value={timelineOperationFilter}
                    onChange={(e) => {
                      setTimelineOperationFilter(e.target.value);
                      if (selectedTimestamp && timelineQueries.length > 0) {
                        analyzeQueriesAtTimestamp(selectedTimestamp);
                      }
                    }}
                    className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-auto min-w-0"
                  >
                    <option value="">All Operations</option>
                    <option value="COLLSCAN">COLLSCAN</option>
                    <option value="CPU Intensive">CPU Intensive</option>
                    <option value="Disk Intensive">Disk Intensive</option>
                    <option value="find">Find</option>
                    <option value="aggregate">Aggregate</option>
                    <option value="insert">Insert</option>
                    <option value="update">Update</option>
                    <option value="delete">Delete</option>
                    <option value="getmore">Getmore</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-600">
                    Filter by operation type or performance characteristics
                  </div>
                  {timelineOperationFilter && (
                    <button
                      onClick={() => {
                        setTimelineOperationFilter('');
                        if (selectedTimestamp) {
                          analyzeQueriesAtTimestamp(selectedTimestamp);
                        }
                      }}
                      className="bg-purple-600 hover:bg-purple-700 text-gray-800 px-2 py-1 rounded text-xs font-medium transition-colors"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>
              </div>
              
              {/* Fourth row: InMemorySorts filter checkbox */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={timelineInMemorySortsFilter}
                      onChange={(e) => {
                        setTimelineInMemorySortsFilter(e.target.checked);
                        if (selectedTimestamp) {
                          analyzeQueriesAtTimestamp(selectedTimestamp);
                        }
                      }}
                      className="w-4 h-4 text-purple-600 bg-white border-gray-200 rounded focus:ring-purple-500 focus:ring-2"
                    />
                    <span>InMemorySorts</span>
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={timelineFromMultiPlannerFilter}
                      onChange={(e) => {
                        setTimelineFromMultiPlannerFilter(e.target.checked);
                        if (selectedTimestamp) {
                          analyzeQueriesAtTimestamp(selectedTimestamp);
                        }
                      }}
                      className="w-4 h-4 text-purple-600 bg-white border-gray-200 rounded focus:ring-purple-500 focus:ring-2"
                    />
                    <span>FromMultiPlanner</span>
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={timelineExcludeErroredFilter}
                      onChange={(e) => {
                        setTimelineExcludeErroredFilter(e.target.checked);
                        if (selectedTimestamp) {
                          analyzeQueriesAtTimestamp(selectedTimestamp);
                        }
                      }}
                      className="w-4 h-4 text-purple-600 bg-white border-gray-200 rounded focus:ring-purple-500 focus:ring-2"
                    />
                    <span>Exclude Errored Queries</span>
                  </label>
                </div>
                <div className="text-sm text-gray-600">
                  Filter options for query display
                </div>
              </div>
              
              {/* Fifth row: Time window scale input */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label htmlFor="timelineWindowSeconds" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    Time Window (±seconds):
                  </label>
                  <input
                    id="timelineWindowSeconds"
                    type="number"
                    min="10"
                    max="3600"
                    step="10"
                    value={timelineWindowSeconds}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 120;
                      setTimelineWindowSeconds(Math.max(10, Math.min(3600, value)));
                    }}
                    className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 w-20"
                  />
                  <span className="text-xs text-gray-600">seconds</span>
                </div>
                <div className="text-sm text-gray-600">
                  Graph will show ±{timelineWindowSeconds} seconds around the selected timestamp
                </div>
              </div>
            </div>
          </div>

          {/* Timeline Visualization */}
          {showTimelineAnalysis && timelineQueries.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h5 className="text-purple-300 font-semibold mb-3">
                Queries Running at {selectedTimestamp ? new Date(selectedTimestamp).toLocaleString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                }) : ''}
              </h5>
              
              {/* Timeline Chart */}
              <div className="relative w-full h-80 bg-gray-900 rounded border border-gray-300 overflow-hidden mb-4">
                <svg className="w-full h-full" viewBox="0 0 800 320">
                  {(() => {
                    if (timelineQueries.length === 0) return null;
                    
                    const targetTime = new Date(selectedTimestamp).getTime();
                    const margin = 60;
                    const chartWidth = 800 - (margin * 2);
                    const chartHeight = 320 - 40;
                    
                    // Calculate time range for visualization (dynamic seconds around target)
                    const timeWindow = timelineWindowSeconds * 1000; // Convert seconds to milliseconds
                    const startTime = targetTime - timeWindow;
                    const endTime = targetTime + timeWindow;
                    const timeRange = endTime - startTime;
                    
                    return (
                      <>
                        {/* Background */}
                        <rect x="0" y="0" width="800" height="320" fill="#ffffff" />
                        
                        {/* Time axis */}
                        <line x1={margin} y1={chartHeight} x2={800 - margin} y2={chartHeight} stroke="#6B7280" strokeWidth="2"/>
                        
                        {/* Target time line */}
                        <line 
                          x1={margin + (chartWidth / 2)} 
                          y1="20" 
                          x2={margin + (chartWidth / 2)} 
                          y2={chartHeight} 
                          stroke="#A855F7" 
                          strokeWidth="3" 
                          strokeDasharray="5,5"
                        />
                        <text 
                          x={margin + (chartWidth / 2)} 
                          y="15" 
                          textAnchor="middle" 
                          fill="#A855F7" 
                          fontSize="12" 
                          fontWeight="bold"
                        >
                          Target Time
                        </text>
                        
                        {/* Time labels */}
                        {(() => {
                          // Calculate appropriate intervals based on time window
                          const totalWindow = timelineWindowSeconds * 2; // Both sides
                          let intervals: number[];
                          
                          if (totalWindow <= 60) {
                            // For small windows (≤30s each side), show every 10s
                            intervals = Array.from({length: Math.floor(totalWindow / 10) + 1}, (_, i) => 
                              -timelineWindowSeconds + (i * 10)
                            ).filter(offset => Math.abs(offset) <= timelineWindowSeconds);
                          } else if (totalWindow <= 240) {
                            // For medium windows (≤120s each side), show every 20s
                            intervals = Array.from({length: Math.floor(totalWindow / 20) + 1}, (_, i) => 
                              -timelineWindowSeconds + (i * 20)
                            ).filter(offset => Math.abs(offset) <= timelineWindowSeconds);
                          } else if (totalWindow <= 600) {
                            // For larger windows (≤300s each side), show every 60s
                            intervals = Array.from({length: Math.floor(totalWindow / 60) + 1}, (_, i) => 
                              -timelineWindowSeconds + (i * 60)
                            ).filter(offset => Math.abs(offset) <= timelineWindowSeconds);
                          } else {
                            // For very large windows, show every 120s
                            intervals = Array.from({length: Math.floor(totalWindow / 120) + 1}, (_, i) => 
                              -timelineWindowSeconds + (i * 120)
                            ).filter(offset => Math.abs(offset) <= timelineWindowSeconds);
                          }
                          
                          // Always include 0 if not already present
                          if (!intervals.includes(0)) {
                            intervals.push(0);
                            intervals.sort((a, b) => a - b);
                          }
                          
                          return intervals.map(offset => {
                            const time = new Date(targetTime + (offset * 1000));
                            const x = margin + ((offset + timelineWindowSeconds) / (timelineWindowSeconds * 2)) * chartWidth;
                            return (
                              <g key={offset}>
                                <line x1={x} y1={chartHeight - 5} x2={x} y2={chartHeight + 5} stroke="#6B7280" strokeWidth="1"/>
                                <text x={x} y={chartHeight + 20} textAnchor="middle" fill="#6B7280" fontSize="10">
                                  {offset === 0 ? '0s' : `${offset > 0 ? '+' : ''}${offset}s`}
                                </text>
                              </g>
                            );
                          });
                        })()}
                        
                        {/* Query bars */}
                        {timelineQueries.slice(0, 15).map((query, index) => {
                          const y = 30 + (index * 18);
                          const barHeight = 14;
                          
                          // Parse query start and end times
                          let queryStart: number, queryEnd: number;
                          try {
                            if (typeof query.queryStartTime === 'number') {
                              queryStart = query.queryStartTime * 1000;
                            } else if (query.queryStartTime.$date) {
                              queryStart = new Date(query.queryStartTime.$date).getTime();
                            } else {
                              queryStart = new Date(query.queryStartTime).getTime();
                            }
                            
                            if (typeof query.queryEndTime === 'number') {
                              queryEnd = query.queryEndTime * 1000;
                            } else if (query.queryEndTime.$date) {
                              queryEnd = new Date(query.queryEndTime.$date).getTime();
                            } else {
                              queryEnd = new Date(query.queryEndTime).getTime();
                            }
                          } catch (e) {
                            return null;
                          }
                          
                          // Calculate bar position and width
                          const barStart = Math.max(startTime, queryStart);
                          const barEnd = Math.min(endTime, queryEnd);
                          
                          const x = margin + ((barStart - startTime) / timeRange) * chartWidth;
                          const width = ((barEnd - barStart) / timeRange) * chartWidth;
                          
                          // Color based on operation type
                          const getQueryColor = (query: any) => {
                            const operation = query.operation;
                            let opType = 'unknown';
                            
                            if (typeof operation === 'object' && operation !== null) {
                              opType = Object.keys(operation)[0];
                            } else if (typeof operation === 'string') {
                              opType = operation;
                            } else if (query.command) {
                              if (query.command.find) opType = 'find';
                              else if (query.command.aggregate) opType = 'aggregate';
                              else if (query.command.update) opType = 'update';
                              else if (query.command.insert) opType = 'insert';
                              else if (query.command.delete) opType = 'delete';
                              else opType = Object.keys(query.command)[0] || 'unknown';
                            }
                            
                            switch (opType) {
                              case 'find': return '#10B981';
                              case 'aggregate': return '#F59E0B';
                              case 'update': return '#EF4444';
                              case 'insert': return '#3B82F6';
                              case 'delete': return '#DC2626';
                              case 'count': return '#8B5CF6';
                              default: return '#6B7280';
                            }
                          };
                          
                          return (
                            <g key={index}>
                              <rect
                                x={x}
                                y={y}
                                width={Math.max(width, 2)}
                                height={barHeight}
                                fill={getQueryColor(query)}
                                stroke="#374151"
                                strokeWidth="0.5"
                                opacity="0.8"
                                className="cursor-pointer hover:opacity-100"
                                onClick={() => {
                                  setSelectedQuery(query);
                                  setShowQueryModal(true);
                                }}
                              />
                              <text
                                x={x + 5}
                                y={y + barHeight - 2}
                                fill="#374151"
                                fontSize="9"
                                className="pointer-events-none"
                              >
                                {query.namespace || 'unknown'} ({(query.duration || 0)}ms)
                              </text>
                            </g>
                          );
                        })}
                        
                        {/* Y-axis label */}
                        <text x="10" y="20" fill="#9CA3AF" fontSize="12" fontWeight="bold">
                          Concurrent Queries
                        </text>
                        
                      </>
                    );
                  })()}
                </svg>
              </div>
              
              {/* Query Details List */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <h6 className="text-gray-700 font-semibold text-sm mb-2">
                  Query Details (sorted by {getTimelineSortLabel()}):
                </h6>
                {timelineQueries.map((query, index) => (
                  <div 
                    key={index} 
                    className="bg-white rounded p-3 border border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => {
                      setSelectedQuery(query);
                      setShowQueryModal(true);
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-purple-400 text-sm font-mono">#{index + 1}</span>
                          <span className="text-blue-600 text-sm">{query.namespace || 'unknown'}</span>
                          <span className="text-yellow-400 text-xs px-2 py-1 bg-yellow-900 rounded">
                            {query.duration || 0}ms
                          </span>
                          <span className="text-green-400 text-xs px-2 py-1 bg-green-900 rounded">
                            {formatTimelineSortValue(query)}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            getTimelineOperationType(query) === 'ErroredOut' ? 'bg-red-900 text-red-400' :
                            getTimelineOperationType(query) === 'COLLSCAN' ? 'bg-yellow-900 text-yellow-400' :
                            getTimelineOperationType(query) === 'CPU Intensive' ? 'bg-orange-900 text-orange-400' :
                            getTimelineOperationType(query) === 'Disk Intensive' ? 'bg-cyan-900 text-cyan-400' :
                            'bg-gray-900 text-gray-600'
                          }`}>
                            {getTimelineOperationType(query)}
                          </span>
                        </div>
                        <div className="text-gray-700 text-xs">
                          <span className="text-gray-600">Operation:</span> {
                            typeof query.operation === 'object' && query.operation !== null 
                              ? Object.keys(query.operation)[0] 
                              : query.operation || 'unknown'
                          }
                        </div>
                        <div className="text-gray-700 text-xs">
                          <span className="text-gray-600">Started:</span> {formatTimestampIST(query.queryStartTime)} | 
                          <span className="text-gray-600"> Ended:</span> {formatTimestampIST(query.queryEndTime)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {showTimelineAnalysis && timelineQueries.length === 0 && selectedTimestamp && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-center">
              <p className="text-gray-700">No queries were running at the selected timestamp.</p>
              <p className="text-gray-600 text-sm mt-1">
                Try selecting a different time or check if your log data contains queryStartTime and queryEndTime.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Authentication Events Widget */}
      <div className="bg-white rounded-xl p-6 border border-gray-300">
        <h3 className="text-xl font-semibold text-purple-600 mb-4">🔐 Authentication Events</h3>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {analytics.authEvents.length > 0 ? (
            analytics.authEvents.map((auth, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-gray-700 text-sm">{auth._id.type}</p>
                    {auth._id.user && (
                      <p className="text-blue-600 text-sm">
                        User: {typeof auth._id.user === 'object' ? JSON.stringify(auth._id.user) : auth._id.user}
                      </p>
                    )}
                    {auth._id.source && (
                      <p className="text-gray-600 text-sm font-mono">
                        From: {typeof auth._id.source === 'object' ? JSON.stringify(auth._id.source) : auth._id.source}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-purple-400 font-semibold">{auth.count}x</div>
                    <div className="text-gray-600">{formatTimestamp(auth.lastSeen)}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-600">No authentication events found.</p>
          )}
        </div>
      </div>

      {/* Index Usage Widget */}
      <div className="bg-white rounded-xl p-6 border border-gray-300">
        <h3 className="text-xl font-semibold text-cyan-600 mb-4">📈 Index Usage Patterns</h3>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {analytics.indexUsage.length > 0 ? (
            analytics.indexUsage.map((usage, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-gray-700 text-sm font-mono">{usage._id || 'Unknown Plan'}</p>
                    <p className="text-gray-600 text-xs">
                      Collections: {usage.collections && Array.isArray(usage.collections) ? usage.collections.join(', ') : 'N/A'}
                    </p>
                  </div>
                  <div className="text-cyan-400 font-semibold">{usage.count}x</div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-600">No index usage patterns detected.</p>
          )}
        </div>
      </div>

      {/* Server Health Widget */}
      <div className="bg-white rounded-xl p-6 border border-gray-300">
        <h3 className="text-xl font-semibold text-orange-600 mb-4">🏥 Server Health Events</h3>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {analytics.healthEvents.length > 0 ? (
            analytics.healthEvents.map((health, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className={`font-mono text-sm px-2 py-1 rounded ${getSeverityColor(health.severity)}`}>
                        {health.severity}
                      </span>
                      <span className="text-orange-400 text-sm">{health.component}</span>
                      <span className="text-gray-600 text-sm">{health.context}</span>
                    </div>
                    <p className="text-gray-700 text-sm mt-1">{health.message}</p>
                  </div>
                  <div className="text-gray-600 text-sm">{formatTimestamp(health.timestamp)}</div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-600">No significant server health events.</p>
          )}
        </div>
      </div>

      {/* Query Details Modal */}
      {showQueryModal && selectedQuery && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-300 max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-300">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-yellow-600">🔍 Query Details</h3>
                <button
                  onClick={() => setShowQueryModal(false)}
                  className="text-gray-600 hover:text-gray-800 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Query Info */}
                <div className="space-y-4">
                  {/* Overall Time */}
                  <div>
                    <h4 className="text-green-400 font-semibold mb-2">Overall Time</h4>
                    <div className="bg-gray-50 rounded p-3 space-y-2">
                      {(selectedQuery.durationMillis !== null && selectedQuery.durationMillis !== undefined) && (
                        <div><span className="text-gray-600">Total Duration:</span> <span className="text-yellow-400">{(selectedQuery.durationMillis / 1000).toFixed(3)}s</span></div>
                      )}
                      {(selectedQuery.totalTimeQueuedMicros !== null && selectedQuery.totalTimeQueuedMicros !== undefined) && (
                        <div><span className="text-gray-600">Time Waiting in Queue:</span> <span className="text-orange-400">{(selectedQuery.totalTimeQueuedMicros / 1000000).toFixed(3)}s</span></div>
                      )}
                      {(selectedQuery.workingMillis !== null && selectedQuery.workingMillis !== undefined) && (
                        <div><span className="text-gray-600">Active Execution Time:</span> <span className="text-cyan-400">{(selectedQuery.workingMillis / 1000).toFixed(3)}s</span></div>
                      )}
                    </div>
                  </div>

                  {/* Active Execution Breakup */}
                  <div>
                    <h4 className="text-blue-600 font-semibold mb-2">Active Execution & Planner Stats</h4>
                    <div className="bg-gray-50 rounded p-3 space-y-2">
                      {(selectedQuery.planningTimeMicros !== null && selectedQuery.planningTimeMicros !== undefined) && (
                        <div><span className="text-gray-600">Query Planning:</span> <span className="text-purple-400">{(selectedQuery.planningTimeMicros / 1000000).toFixed(3)}s</span></div>
                      )}
                      {(selectedQuery.cpuNanos !== null && selectedQuery.cpuNanos !== undefined) && (
                        <div><span className="text-gray-600">CPU Time:</span> <span className="text-pink-400">{(selectedQuery.cpuNanos / 1000000000).toFixed(3)}s</span></div>
                      )}
                      {(selectedQuery.timeReadingMicros !== null && selectedQuery.timeReadingMicros !== undefined) && (
                        <div><span className="text-gray-600">Data Reading (I/O):</span> <span className="text-cyan-400">{(selectedQuery.timeReadingMicros / 1000000).toFixed(3)}s</span></div>
                      )}
                      {(selectedQuery.dataReadMB !== null && selectedQuery.dataReadMB !== undefined) && (
                        <div><span className="text-gray-600">Data Read from Disk (MB):</span> <span className="text-orange-400">{selectedQuery.dataReadMB.toFixed(2)} MB</span></div>
                      )}
                      {(selectedQuery.waitForWriteConcernDurationMillis !== null && selectedQuery.waitForWriteConcernDurationMillis !== undefined) && (
                        <div><span className="text-gray-600">Waiting for Write Concern:</span> <span className="text-red-400">{(selectedQuery.waitForWriteConcernDurationMillis / 1000).toFixed(3)}s</span></div>
                      )}
                    </div>
                  </div>

                  {/* Contention and Plan Caching */}
                  <div>
                    <h4 className="text-purple-400 font-semibold mb-2">Contention and Plan Caching</h4>
                    <div className="bg-gray-50 rounded p-3 space-y-2">
                      {(selectedQuery.writeConflicts !== null && selectedQuery.writeConflicts !== undefined) && (
                        <div><span className="text-gray-600">Write Conflicts:</span> <span className="text-red-400">{selectedQuery.writeConflicts}</span></div>
                      )}
                      {(selectedQuery.numYields !== null && selectedQuery.numYields !== undefined) && (
                        <div><span className="text-gray-600">Yields:</span> <span className="text-yellow-400">{selectedQuery.numYields}</span></div>
                      )}
                      {(selectedQuery.fromPlanCache !== null && selectedQuery.fromPlanCache !== undefined) && (
                        <div><span className="text-gray-600">From Plan Cache:</span> <span className={selectedQuery.fromPlanCache ? "text-green-400" : "text-gray-600"}>{selectedQuery.fromPlanCache ? "Yes" : "No"}</span></div>
                      )}
                      <div><span className="text-gray-600">From Multi Planner:</span> <span className={selectedQuery.fromMultiPlanner ? "text-green-400" : "text-gray-600"}>{selectedQuery.fromMultiPlanner ? "Yes" : "No"}</span></div>
                    </div>
                  </div>

                  {/* Query Information */}
                  <div>
                    <h4 className="text-amber-400 font-semibold mb-2">Query Information</h4>
                    <div className="bg-gray-50 rounded p-3 space-y-2">
                      <div><span className="text-gray-600">Namespace:</span> <span className="text-blue-600">{selectedQuery.namespace || 'N/A'}</span></div>
                      <div><span className="text-gray-600">Operation:</span> <span className="text-purple-400">{selectedQuery.operation || 'N/A'}</span></div>
                      <div><span className="text-gray-600">Timestamp (IST):</span> <span className="text-gray-700">{formatTimestamp(selectedQuery.timestamp)}</span></div>
                      {selectedQuery.planSummary && (
                        <div><span className="text-gray-600">Plan Summary:</span> <span className="text-green-400">{selectedQuery.planSummary}</span></div>
                      )}
                      {(selectedQuery.docsExamined !== null && selectedQuery.docsExamined !== undefined) && (
                        <div><span className="text-gray-600">Docs Examined:</span> <span className="text-red-400">{selectedQuery.docsExamined}</span></div>
                      )}
                      {(selectedQuery.docsReturned !== null && selectedQuery.docsReturned !== undefined) && (
                        <div><span className="text-gray-600">Docs Returned:</span> <span className="text-blue-600">{selectedQuery.docsReturned}</span></div>
                      )}
                      {(selectedQuery.keysExamined !== null && selectedQuery.keysExamined !== undefined) && (
                        <div><span className="text-gray-600">Keys Examined:</span> <span className="text-yellow-400">{selectedQuery.keysExamined}</span></div>
                      )}
                      {(selectedQuery.numRowsReturnedByQuery !== null && selectedQuery.numRowsReturnedByQuery !== undefined) && (
                        <div><span className="text-gray-600">Number of Rows Returned:</span> <span className="text-blue-600">{selectedQuery.numRowsReturnedByQuery}</span></div>
                      )}
                      {selectedQuery.queryFramework && (
                        <div><span className="text-gray-600">Query Framework:</span> <span className="text-purple-400">{selectedQuery.queryFramework}</span></div>
                      )}
                      {selectedQuery.queryStartTime && (
                        <div><span className="text-gray-600">Query Start Time (IST):</span> <span className="text-gray-700">{formatTimestampIST(selectedQuery.queryStartTime)}</span></div>
                      )}
                      {selectedQuery.queryEndTime && (
                        <div><span className="text-gray-600">Query End Time (IST):</span> <span className="text-gray-700">{formatTimestampIST(selectedQuery.queryEndTime)}</span></div>
                      )}
                      {selectedQuery.queryHash && (
                        <div><span className="text-gray-600">Query Hash:</span> <span className="text-gray-700 font-mono text-sm">{selectedQuery.queryHash}</span></div>
                      )}
                    </div>
                  </div>

                  {/* Error Details - only show for ErroredOut operations */}
                  {selectedQuery.errCode && (
                    <div>
                      <h4 className="text-red-400 font-semibold mb-2">Error Details</h4>
                      <div className="bg-red-900/20 border border-red-500/30 rounded p-3 space-y-2">
                        <div><span className="text-gray-600">Error Code:</span> <span className="text-red-400 font-mono">{selectedQuery.errCode}</span></div>
                        {selectedQuery.errName && (
                          <div><span className="text-gray-600">Error Name:</span> <span className="text-red-400">{selectedQuery.errName}</span></div>
                        )}
                        {selectedQuery.errMsg && (
                          <div><span className="text-gray-600">Error Message:</span> <span className="text-red-300">{selectedQuery.errMsg}</span></div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Query Details */}
                <div className="space-y-4">
                  {/* Aggregation Pipeline */}
                  {selectedQuery.pipeline && (
                    <div>
                      <h4 className="text-green-400 font-semibold mb-2">Aggregation Pipeline</h4>
                      <div className="bg-gray-50 rounded p-3">
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap overflow-x-auto">
                          {JSON.stringify(selectedQuery.pipeline, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Command Details */}
                  {selectedQuery.command && (
                    <div>
                      <h4 className="text-green-400 font-semibold mb-2">Command</h4>
                      <div className="bg-gray-50 rounded p-3">
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap overflow-x-auto">
                          {JSON.stringify(selectedQuery.command, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Filter */}
                  {selectedQuery.filter && (
                    <div>
                      <h4 className="text-green-400 font-semibold mb-2">Filter</h4>
                      <div className="bg-gray-50 rounded p-3">
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap overflow-x-auto">
                          {JSON.stringify(selectedQuery.filter, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Sort */}
                  {selectedQuery.sort && (
                    <div>
                      <h4 className="text-green-400 font-semibold mb-2">Sort</h4>
                      <div className="bg-gray-50 rounded p-3">
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap overflow-x-auto">
                          {JSON.stringify(selectedQuery.sort, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Full Message */}
                  <div>
                    <h4 className="text-green-400 font-semibold mb-2">Full Log Message</h4>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {selectedQuery.message}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
