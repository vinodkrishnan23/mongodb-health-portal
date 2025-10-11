'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTimezone } from '@/context/TimezoneContext';
import { formatTimestampInTimezone, convertTimezoneToUTC } from '@/lib/timezone';

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
  userEmail?: string;
}

export default function AnalyticsDashboard({ sourceFile, userEmail }: AnalyticsDashboardProps) {
  // Simple render counter for debugging
  const renderCount = useRef(0);
  renderCount.current += 1;
  
  if (renderCount.current % 50 === 0) {
    console.warn(`⚠️ High render count detected: ${renderCount.current} renders`);
  }
  
  const { timezone } = useTimezone();
  
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true); // Full page loading for initial load
  const [queryPerformanceLoading, setQueryPerformanceLoading] = useState(false); // Just for query performance
  const [error, setError] = useState<string | null>(null);
  const [selectedQuery, setSelectedQuery] = useState<any | null>(null);
  const [showQueryModal, setShowQueryModal] = useState(false);
  
  // AI Response states
  const [activeTab, setActiveTab] = useState<'query' | 'ai'>('query');
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  
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
  const [excludeSystemNamespaces, setExcludeSystemNamespaces] = useState<boolean>(false);
  
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
  
  // Available dates state
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loadingDates, setLoadingDates] = useState<boolean>(false);
  
  // AI Feature Toggle - Set to false to disable, true to enable
  const AI_FEATURE_ENABLED = false;
  
  // Quick date select state
  const [selectedQuickDate, setSelectedQuickDate] = useState<string>('');
  const [showManualDateFilters, setShowManualDateFilters] = useState<boolean>(true);
  
  // Original unfiltered queries for dropdown population
  const [originalSlowQueries, setOriginalSlowQueries] = useState<any[]>([]);

  // Stabilize slowQueries to prevent filtering useEffect from running constantly
  const slowQueries = useMemo(() => {
    // console.log('🔍 slowQueries memoized, analytics changed');
    return analytics?.slowQueries || [];
  }, [analytics]);

  useEffect(() => {
    console.log('🚀 Initial load triggered for:', { sourceFile, userEmail });
    
    // Debounce to prevent rapid successive calls
    const timeoutId = setTimeout(() => {
      console.log('🚀 Initial load: fetching static analytics, query performance, and available dates');
      fetchStaticAnalytics(); // Fetch static analytics (always latest day)
      fetchQueryPerformance(); // Fetch initial query performance (default date range)
      fetchAvailableDates(); // Fetch available dates for dropdown
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [sourceFile, userEmail]);

  // Fetch available dates from logs
  const fetchAvailableDates = async () => {
    // console.log('📡 fetchAvailableDates called');
    try {
      setLoadingDates(true);
      const response = await fetch(`/api/dates?sourceFile=${encodeURIComponent(sourceFile)}`, {
        headers: {
          'x-user-email': userEmail || '',
        },
      });
      const data = await response.json();
      
      if (data.success) {
        // console.log('📅 Available dates received:', data.dates);
        const dates = data.dates || [];
        setAvailableDates(dates);
        
        // Auto-select the latest date (first in the array since they're sorted newest first)
        if (dates.length > 0 && !selectedQuickDate) {
          const latestDate = dates[0];
          // console.log('📅 Auto-selecting latest date for query performance:', latestDate);
          setStartDate(latestDate);
          setEndDate(latestDate);
          setSelectedQuickDate(latestDate);
          setShowManualDateFilters(false);
          // Clear time filters for full day selection
          setStartTime('');
          setEndTime('');
        }
      } else {
        console.error('Failed to fetch available dates:', data.message);
      }
    } catch (err) {
      console.error('Network error while fetching available dates:', err);
    } finally {
      setLoadingDates(false);
    }
  };

  // Fetch static analytics (connection stats, auth events, etc.) - always latest day
  const fetchStaticAnalytics = async () => {
    // console.log('📡 fetchStaticAnalytics called (latest day data)');
    try {
      const response = await fetch(`/api/analytics?sourceFile=${encodeURIComponent(sourceFile)}`, {
        headers: {
          'x-user-email': userEmail || '',
        },
      });
      const data = await response.json();
      
      if (data.success) {
        // console.log('📊 Setting static analytics data');
        setAnalytics(data.analytics);
        // console.log('Static analytics received:', data.analytics);
        console.log('Timestamp range:', data.analytics.timestampRange);
        
        // Set default date range from static analytics
        if (data.analytics.timestampRange?.minTimestamp && data.analytics.timestampRange?.maxTimestamp) {
          // console.log('📊 Setting initial date range from static analytics');
          const minDate = new Date(data.analytics.timestampRange.minTimestamp);
          const maxDate = new Date(data.analytics.timestampRange.maxTimestamp);
          setStartDate(minDate.toISOString().split('T')[0]);
          setEndDate(maxDate.toISOString().split('T')[0]);
        }
        
        setError(null);
      } else {
        setError(data.message || 'Failed to fetch static analytics');
      }
    } catch (err) {
      setError('Network error while fetching static analytics');
    } finally {
      // Static analytics loaded - turn off main loading
      setLoading(false);
    }
  };

  // Fetch query performance data (responds to date filters)
  const fetchQueryPerformance = async (filterParams?: {
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    operationFilter?: string;
    namespaceFilter?: string;
    excludeSystemNamespaces?: boolean;
    inMemorySortsFilter?: boolean;
    fromMultiPlannerFilter?: boolean;
  }) => {
    // console.log('📡 fetchQueryPerformance called with filters:', filterParams);
    try {
      setQueryPerformanceLoading(true); // Use separate loading state
      
      // Build query parameters
      const params = new URLSearchParams({
        sourceFile: sourceFile
      });
      
      // Convert timezone-aware dates to UTC before sending to API
      // console.log('🔍 About to process date filters:', {
      //   startDate: filterParams?.startDate,
      //   endDate: filterParams?.endDate,
      //   startTime: filterParams?.startTime,
      //   endTime: filterParams?.endTime,
      //   timezone: timezone,
      //   isQuickDateSelect: !filterParams?.startTime && !filterParams?.endTime
      // });
      
      // For Quick Date Select (no time specified), don't apply timezone conversion
      // For manual date+time filters, apply timezone conversion
      if (filterParams?.startDate) {
        if (filterParams.startTime) {
          // Manual time specified - apply timezone conversion
          try {
            // console.log('🔍 Converting startDate (manual time)...', { date: filterParams.startDate, time: filterParams.startTime, timezone });
            const utcStartDate = convertTimezoneToUTC(filterParams.startDate, filterParams.startTime, timezone);
            // console.log('🔍 Raw convertTimezoneToUTC result for startDate:', utcStartDate);
            
            if (utcStartDate && utcStartDate instanceof Date && !isNaN(utcStartDate.getTime())) {
              const utcDateStr = utcStartDate.toISOString().split('T')[0];
              const utcTimeStr = utcStartDate.toISOString().split('T')[1].split('.')[0];
              
              params.set('startDate', utcDateStr);
              params.set('startTime', utcTimeStr);
              // console.log(`🌍 ✅ Converted startDate from ${timezone} to UTC:`, {
              //   original: `${filterParams.startDate} ${filterParams.startTime}`,
              //   utc: utcStartDate.toISOString(),
              //   sentToAPI: { date: utcDateStr, time: utcTimeStr }
              // });
            } else {
              console.warn('⚠️ Invalid utcStartDate returned from convertTimezoneToUTC, using original values:', utcStartDate);
              params.set('startDate', filterParams.startDate);
              params.set('startTime', filterParams.startTime);
            }
          } catch (error) {
            console.error('❌ Error converting startDate to UTC:', error);
            params.set('startDate', filterParams.startDate);
            params.set('startTime', filterParams.startTime);
          }
        } else {
          // No time specified (Quick Date Select) - use original date without timezone conversion
          // console.log('🔍 Using startDate without timezone conversion (Quick Date Select):', filterParams.startDate);
          params.set('startDate', filterParams.startDate);
        }
      }
      
      if (filterParams?.endDate) {
        if (filterParams.endTime) {
          // Manual time specified - apply timezone conversion
          try {
            // console.log('🔍 Converting endDate (manual time)...', { date: filterParams.endDate, time: filterParams.endTime, timezone });
            const utcEndDate = convertTimezoneToUTC(filterParams.endDate, filterParams.endTime, timezone);
            // console.log('🔍 Raw convertTimezoneToUTC result for endDate:', utcEndDate);
            
            if (utcEndDate && utcEndDate instanceof Date && !isNaN(utcEndDate.getTime())) {
              const utcDateStr = utcEndDate.toISOString().split('T')[0];
              const utcTimeStr = utcEndDate.toISOString().split('T')[1].split('.')[0];
              
              params.set('endDate', utcDateStr);
              params.set('endTime', utcTimeStr);
              // console.log(`🌍 ✅ Converted endDate from ${timezone} to UTC:`, {
              //   original: `${filterParams.endDate} ${filterParams.endTime}`,
              //   utc: utcEndDate.toISOString(),
              //   sentToAPI: { date: utcDateStr, time: utcTimeStr }
              // });
            } else {
              console.warn('⚠️ Invalid utcEndDate returned from convertTimezoneToUTC, using original values:', utcEndDate);
              params.set('endDate', filterParams.endDate);
              params.set('endTime', filterParams.endTime);
            }
          } catch (error) {
            console.error('❌ Error converting endDate to UTC:', error);
            params.set('endDate', filterParams.endDate);
            params.set('endTime', filterParams.endTime);
          }
        } else {
          // No time specified (Quick Date Select) - use original date without timezone conversion
          // console.log('🔍 Using endDate without timezone conversion (Quick Date Select):', filterParams.endDate);
          params.set('endDate', filterParams.endDate);
        }
      }
      if (filterParams?.operationFilter) {
        params.set('operationFilter', filterParams.operationFilter);
        // console.log('🔍 Sending operationFilter to API:', filterParams.operationFilter);
      }
      if (filterParams?.namespaceFilter) params.set('namespaceFilter', filterParams.namespaceFilter);
      if (filterParams?.excludeSystemNamespaces) params.set('excludeSystemNamespaces', 'true');
      if (filterParams?.inMemorySortsFilter) params.set('inMemorySortsFilter', 'true');
      if (filterParams?.fromMultiPlannerFilter) params.set('fromMultiPlannerFilter', 'true');
      
      // console.log('📡 Final Query Performance API URL:', `/api/query-performance?${params.toString()}`);
      // console.log('📡 All URL parameters being sent:', Object.fromEntries(params.entries()));
      
      const response = await fetch(`/api/query-performance?${params.toString()}`, {
        headers: {
          'x-user-email': userEmail || '',
        },
      });
      const data = await response.json();
      
      if (data.success) {
        // console.log('📊 Setting query performance data');
        // console.log('Query performance data received:', data.queryPerformance);
        // console.log('Slow queries:', data.queryPerformance.slowQueries?.length || 0);
        console.log('Filter metadata:', data.metadata?.filterApplied);
        
        // Set filtered queries directly from server response
        if (data.queryPerformance.slowQueries) {
          // console.log('📊 Setting filtered queries from query performance API');
          setFilteredQueries(data.queryPerformance.slowQueries);
          
          // Store original unfiltered queries on first load (no specific filters applied)
          // Note: We ignore date/time filters for dropdown population to show all possible values
          const hasSpecificFilters = filterParams?.operationFilter || filterParams?.namespaceFilter || 
                                    filterParams?.inMemorySortsFilter || filterParams?.fromMultiPlannerFilter || 
                                    filterParams?.excludeSystemNamespaces;
          
          if (!hasSpecificFilters && originalSlowQueries.length === 0) {
            // console.log('📊 Storing original unfiltered queries for dropdown population');
            setOriginalSlowQueries(data.queryPerformance.slowQueries);
          }
          
          // CRITICAL FIX: Update analytics.slowQueries so Timeline Analysis uses the same filtered data
          setAnalytics(prev => {
            if (!prev) {
              // If no previous analytics, create minimal structure
              return {
                timestampRange: { minTimestamp: null, maxTimestamp: null, totalLogs: 0 },
                connectionStats: [],
                errorAnalysis: [],
                slowQueries: data.queryPerformance.slowQueries,
                slowOperations: [],
                indexUsage: [],
                performanceInsights: [],
                authEvents: [],
                connectionSources: [],
                healthEvents: []
              };
            }
            // Update existing analytics
            return {
              ...prev,
              slowQueries: data.queryPerformance.slowQueries
            };
          });
          // console.log('📊 Updated analytics.slowQueries for Timeline Analysis with filtered data');
          // console.log('📊 New analytics.slowQueries length:', data.queryPerformance.slowQueries.length);
        }
        
        setError(null);
      } else {
        setError(data.message || 'Failed to fetch query performance data');
      }
    } catch (err) {
      setError('Network error while fetching query performance data');
    } finally {
      setQueryPerformanceLoading(false); // Use separate loading state
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

  // Handle date selection from dropdown
  const handleDateSelection = (selectedDate: string) => {
    // console.log('📅 Date selected from dropdown:', selectedDate);
    // Set both start and end date to the selected date for a single day filter
    setStartDate(selectedDate);
    setEndDate(selectedDate);
    // Clear time inputs for full day selection
    setStartTime('');
    setEndTime('');
    // Update quick date state and hide manual filters
    setSelectedQuickDate(selectedDate);
    setShowManualDateFilters(false);
  };

  // Handle reset functionality
  const handleResetFilters = () => {
    // console.log('🔄 Resetting all filters');
    // Reset date filters
    setStartDate('');
    setEndDate('');
    setStartTime('');
    setEndTime('');
    // Reset quick date select
    setSelectedQuickDate('');
    setShowManualDateFilters(true);
    // Reset other filters
    setOperationFilter('');
    setNamespaceFilter('');
    setInMemorySortsFilter(false);
    setFromMultiPlannerFilter(false);
    setExcludeSystemNamespaces(false);
  };

  // Trigger query performance refetch when filter values change (with debouncing)
  // Static analytics remain unchanged - only query performance graphs update
  useEffect(() => {
    // console.log('🔄 Filter change detected, scheduling Query Performance refetch');
    // console.log('🔄 Current filter values:', { startDate, endDate, startTime, endTime, operationFilter, namespaceFilter });
    
    // Debounce API calls to avoid too many requests
    const timeoutId = setTimeout(() => {
      // console.log('🔄 Executing debounced Query Performance refetch with current filters');
      // console.log('🔄 Static analytics (connection stats, auth events, etc.) remain unchanged');
      
      const filterParams = {
        // Only include dates if they have actual values (not empty strings)
        startDate: startDate && startDate.trim() ? startDate : undefined,
        endDate: endDate && endDate.trim() ? endDate : undefined,
        startTime: startTime && startTime.trim() ? startTime : undefined,
        endTime: endTime && endTime.trim() ? endTime : undefined,
        operationFilter: operationFilter || undefined,
        namespaceFilter: namespaceFilter || undefined,
        excludeSystemNamespaces: excludeSystemNamespaces || undefined,
        inMemorySortsFilter: inMemorySortsFilter || undefined,
        fromMultiPlannerFilter: fromMultiPlannerFilter || undefined,
      };
      
      // console.log('🔄 Calling fetchQueryPerformance with filterParams:', filterParams);
      
      // Only fetch query performance - static analytics stay the same
      fetchQueryPerformance(filterParams);
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [startDate, endDate, startTime, endTime, operationFilter, namespaceFilter, inMemorySortsFilter, fromMultiPlannerFilter, excludeSystemNamespaces]);

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

  // Function to analyze queries running at a specific timestamp
  const analyzeQueriesAtTimestamp = useCallback((timestamp: string) => {
    // console.log('🔍 Analyzing queries at timestamp:', timestamp);
    if (!analytics?.slowQueries || !timestamp) {
      // console.log('❌ No analytics data or timestamp provided', {
      //   hasAnalytics: !!analytics,
      //   hasSlowQueries: !!analytics?.slowQueries,
      //   slowQueriesLength: analytics?.slowQueries?.length || 0,
      //   timestamp: timestamp
      // });
      setTimelineQueries([]);
      setShowTimelineAnalysis(false);
      return;
    }

    const targetTime = new Date(timestamp).getTime();
    // console.log('🎯 Target time:', targetTime, 'from timestamp:', timestamp);
    // console.log('📊 Total slow queries available for timeline analysis:', analytics.slowQueries.length);
    // console.log('📊 Data source: analytics.slowQueries (updated by query performance API)');
    
    // Note: filteredQueries comparison removed to avoid variable hoisting issues
    
    // Debug: Check sample query structure and timestamp formats
    if (analytics.slowQueries.length > 0) {
      const sampleQuery = analytics.slowQueries[0];
      // console.log('📋 Sample query structure:', {
      //   hasQueryStartTime: !!sampleQuery.queryStartTime,
      //   hasQueryEndTime: !!sampleQuery.queryEndTime,
      //   hasLogTimestamp: !!sampleQuery.logTimestamp,
      //   queryStartTimeType: typeof sampleQuery.queryStartTime,
      //   queryEndTimeType: typeof sampleQuery.queryEndTime,
      //   logTimestampType: typeof sampleQuery.logTimestamp,
      //   queryStartTimeValue: sampleQuery.queryStartTime,
      //   queryEndTimeValue: sampleQuery.queryEndTime,
      //   logTimestampValue: sampleQuery.logTimestamp,
      //   durationMillis: sampleQuery.durationMillis,
      //   duration: sampleQuery.duration,
      //   namespace: sampleQuery.namespace
      // });

      // Parse timestamps to see if there are conversion issues
      if (sampleQuery.queryStartTime) {
        let parsedStartTime;
        if (typeof sampleQuery.queryStartTime === 'number') {
          parsedStartTime = sampleQuery.queryStartTime * 1000; // Assuming seconds, converting to ms
        } else if (sampleQuery.queryStartTime.$date) {
          parsedStartTime = new Date(sampleQuery.queryStartTime.$date).getTime();
        } else {
          parsedStartTime = new Date(sampleQuery.queryStartTime).getTime();
        }
        // console.log('🕰️ Parsed queryStartTime:', parsedStartTime, 'as ISO:', new Date(parsedStartTime).toISOString());
      }

      if (sampleQuery.queryEndTime) {
        let parsedEndTime;
        if (typeof sampleQuery.queryEndTime === 'number') {
          parsedEndTime = sampleQuery.queryEndTime * 1000;
        } else if (sampleQuery.queryEndTime.$date) {
          parsedEndTime = new Date(sampleQuery.queryEndTime.$date).getTime();
        } else {
          parsedEndTime = new Date(sampleQuery.queryEndTime).getTime();
        }
        // console.log('🕰️ Parsed queryEndTime:', parsedEndTime, 'as ISO:', new Date(parsedEndTime).toISOString());
      }
    }
    
    const runningQueries = analytics.slowQueries.filter((query: any, index: number) => {
      // Show debug info for first few queries
      const isDebugQuery = index < 3;
      
      if (isDebugQuery) {
        // console.log(`🔍 Processing query ${index + 1}:`, {
        //   namespace: query.namespace,
        //   hasQueryStartTime: !!query.queryStartTime,
        //   hasQueryEndTime: !!query.queryEndTime,
        //   hasLogTimestamp: !!query.logTimestamp,
        //   queryStartTimeRaw: query.queryStartTime,
        //   queryEndTimeRaw: query.queryEndTime,
        //   logTimestampRaw: query.logTimestamp,
        //   duration: query.durationMillis || query.duration
        // });
      }

      // Check if query has both start and end times
      if (!query.queryStartTime || !query.queryEndTime) {
        // Try alternative timestamp fields if primary ones don't exist
        if (!query.logTimestamp) {
          // if (isDebugQuery) console.log(`❌ Query ${index + 1}: No usable timestamp data`);
          return false;
        }
        // If we only have logTimestamp, assume the query was running at that time
        // This is a fallback for queries that don't have explicit start/end times
      }
      
      // Filter out system databases (local, admin, config)
      if (query.namespace) {
        const dbName = query.namespace.split('.')[0];
        if (['local', 'admin', 'config'].includes(dbName)) {
          // if (isDebugQuery) console.log(`❌ Query ${index + 1}: Filtered out system database: ${dbName}`);
          return false;
        }
      }
      
      let startTime: number;
      let endTime: number;
      
      try {
        // Handle case where we have explicit start/end times
        if (query.queryStartTime && query.queryEndTime) {
          // Handle different timestamp formats for start time
          if (typeof query.queryStartTime === 'number') {
            // CRITICAL FIX: Don't multiply by 1000 if already in milliseconds
            startTime = query.queryStartTime > 1e12 ? query.queryStartTime : query.queryStartTime * 1000;
          } else if (query.queryStartTime.$date) {
            startTime = new Date(query.queryStartTime.$date).getTime();
          } else {
            startTime = new Date(query.queryStartTime).getTime();
          }
          
          // Handle different timestamp formats for end time
          if (typeof query.queryEndTime === 'number') {
            // CRITICAL FIX: Don't multiply by 1000 if already in milliseconds
            endTime = query.queryEndTime > 1e12 ? query.queryEndTime : query.queryEndTime * 1000;
          } else if (query.queryEndTime.$date) {
            endTime = new Date(query.queryEndTime.$date).getTime();
          } else {
            endTime = new Date(query.queryEndTime).getTime();
          }
        } else if (query.logTimestamp) {
          // Fallback: use logTimestamp and estimate duration
          let logTime: number;
          if (typeof query.logTimestamp === 'number') {
            // CRITICAL FIX: Don't multiply by 1000 if already in milliseconds
            logTime = query.logTimestamp > 1e12 ? query.logTimestamp : query.logTimestamp * 1000;
          } else if (query.logTimestamp.$date) {
            logTime = new Date(query.logTimestamp.$date).getTime();
          } else {
            logTime = new Date(query.logTimestamp).getTime();
          }
          
          // Estimate start time based on duration (if available) or use a default window
          const duration = query.durationMillis || query.duration || 100; // Default 100ms if no duration
          startTime = logTime - duration;
          endTime = logTime;
        } else {
          // if (isDebugQuery) console.log(`❌ Query ${index + 1}: No usable timestamp data after parsing`);
          return false; // No usable timestamp data
        }

        // if (isDebugQuery) {
        //   console.log(`🕰️ Query ${index + 1} parsed timestamps:`, {
        //     startTimeMs: startTime,
        //     endTimeMs: endTime,
        //     startTimeISO: new Date(startTime).toISOString(),
        //     endTimeISO: new Date(endTime).toISOString(),
        //     targetTimeMs: targetTime,
        //     targetTimeISO: new Date(targetTime).toISOString(),
        //     queryDuration: endTime - startTime,
        //     targetInRange: `${targetTime} >= ${startTime} && ${targetTime} <= ${endTime}`,
        //     willMatch: targetTime >= startTime && targetTime <= endTime
        //   });
        // }
        
        // Check if target timestamp falls within query execution period
        const isRunning = targetTime >= startTime && targetTime <= endTime;
        
        if (isRunning) {
          // console.log('✅ Query was running:', {
          //   namespace: query.namespace,
          //   startTime: new Date(startTime).toISOString(),
          //   endTime: new Date(endTime).toISOString(),
          //   targetTime: new Date(targetTime).toISOString(),
          //   duration: query.durationMillis || query.duration,
          //   queryIndex: index + 1
          // });
        }
        
        return isRunning;
      } catch (e) {
        // console.warn('Error parsing timestamps for query:', query, e);
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

    // Apply system namespace exclusion filter to timeline as well
    if (excludeSystemNamespaces) {
      filteredQueries = filteredQueries.filter((query: any) => {
        if (!query.namespace) return true; // Keep queries without namespace
        const namespace = query.namespace.toString();
        return !namespace.startsWith('local.') && 
               !namespace.startsWith('admin.') && 
               !namespace.startsWith('config.');
      });
    }

    // Sort by selected metric (highest first) and add timeline position info
    const sortedQueries = filteredQueries
      .sort((a, b) => getTimelineSortValue(b) - getTimelineSortValue(a))
      .map((query, index) => ({
        ...query,
        timelineIndex: index
      }));

    // console.log('✅ Timeline Analysis Results:', {
    //   totalSlowQueries: analytics.slowQueries.length,
    //   queriesRunningAtTime: runningQueries.length,
    //   afterFiltering: filteredQueries.length,
    //   finalSortedQueries: sortedQueries.length,
    //   timestamp: timestamp,
    //   filters: {
    //     operation: timelineOperationFilter,
    //     inMemorySorts: timelineInMemorySortsFilter,
    //     fromMultiPlanner: timelineFromMultiPlannerFilter,
    //     excludeErrored: timelineExcludeErroredFilter,
    //     excludeSystemNamespaces: excludeSystemNamespaces
    //   }
    // });
    
    setTimelineQueries(sortedQueries);
    setShowTimelineAnalysis(true);
  }, [analytics?.slowQueries, timelineOperationFilter, timelineInMemorySortsFilter, timelineFromMultiPlannerFilter, timelineExcludeErroredFilter, excludeSystemNamespaces, timelineSortMetric]);

  // Auto-analyze when timestamp changes
  useEffect(() => {
    if (selectedTimestamp && analytics?.slowQueries) {
      // console.log('🔄 Auto-analyzing timeline due to timestamp change:', selectedTimestamp);
      analyzeQueriesAtTimestamp(selectedTimestamp);
    }
  }, [selectedTimestamp, analyzeQueriesAtTimestamp]);


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
      <div className="bg-white rounded-xl p-6 border border-green-300">
        <h3 className="text-green-600 font-semibold mb-2">Analytics Error</h3>
        <p className="text-gray-700">{error}</p>
      </div>
    );
  }

  const formatTimestamp = (timestamp: string) => {
    return formatTimestampInTimezone(timestamp, timezone, {
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
        // If it's a Unix timestamp (check if it's in seconds or milliseconds)
        date = new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
      } else if (timestamp.$date) {
        // MongoDB date format
        date = new Date(timestamp.$date);
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else {
        return JSON.stringify(timestamp);
      }
      
      // Use timezone-aware formatting
      return formatTimestampInTimezone(date, timezone, {
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

  const handleAskAI = async () => {
    if (!selectedQuery) return;
    
    setIsLoadingAi(true);
    setAiError(null);
    setActiveTab('ai');
    
    try {
      const response = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail || ''
        },
        body: JSON.stringify({
          sourceFile,
          query: selectedQuery,
          queryHash: selectedQuery.queryHash,
          numYields: selectedQuery.numYields
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      setAiResponse('');
      
      // Batch chunks to reduce excessive re-renders and prevent call stack overflow
      let accumulatedText = '';
      let lastUpdateTime = Date.now();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Add any remaining accumulated text when done
          if (accumulatedText) {
            setAiResponse(prev => prev + accumulatedText);
          }
          break;
        }
        
        const chunk = new TextDecoder().decode(value);
        accumulatedText += chunk;
        
        // Throttle updates - only update every 100ms to prevent call stack overflow
        const now = Date.now();
        if (now - lastUpdateTime > 100) {
          setAiResponse(prev => prev + accumulatedText);
          accumulatedText = '';
          lastUpdateTime = now;
          
          // Small delay to prevent overwhelming React's render cycle
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } catch (error) {
      console.error('Error getting AI response:', error);
      setAiError(error instanceof Error ? error.message : 'Failed to get AI response');
    } finally {
      setIsLoadingAi(false);
    }
  };

  const resetAiStates = () => {
    setActiveTab('query');
    setAiResponse('');
    setIsLoadingAi(false);
    setAiError(null);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'E': return 'text-green-600';
      case 'F': return 'text-green-700';
      case 'W': return 'text-green-600';
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


  // Debug information (only show in development)
  // console.log('🔍 AnalyticsDashboard Debug Info:', {
  //   hasAnalytics: !!analytics,
  //   slowQueriesCount: analytics?.slowQueries?.length || 0,
  //   selectedTimestamp,
  //   timelineQueriesCount: timelineQueries.length,
  //   operationFilterValue: operationFilter,
  //   namespaceFilterValue: namespaceFilter,
  //   loading,
  //   queryPerformanceLoading
  // });
  
  // if (analytics?.slowQueries?.length > 0) {
  //   console.log('🔍 First slow query sample:', analytics.slowQueries[0]);
  // }

  return (
    <div className="w-full space-y-4 lg:space-y-6 text-left">
      {/* Debug Info Panel - Hidden */}
      {false && process.env.NODE_ENV === 'development' && analytics && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-4 text-sm">
          <h4 className="font-semibold text-green-800 mb-2">🔍 Debug Information</h4>
          <div className="text-green-700 space-y-1">
            <div>Analytics loaded: {analytics ? 'Yes' : 'No'}</div>
            <div>Slow queries count: {analytics?.slowQueries?.length || 0}</div>
            <div>Selected timestamp: {selectedTimestamp || 'None'}</div>
            <div>Timeline queries: {timelineQueries.length}</div>
            <div>Operation filter: {operationFilter || 'All'}</div>
            <div>Namespace filter: {namespaceFilter || 'All'}</div>
            <div>Loading: {loading ? 'Yes' : 'No'}</div>
            <div>Query performance loading: {queryPerformanceLoading ? 'Yes' : 'No'}</div>
          </div>
        </div>
      )}

      {/* Connection Analytics Widget */}
      <div className="bg-white rounded-xl p-4 lg:p-6 border border-gray-300">
        <h3 className="text-lg lg:text-xl font-semibold text-green-600 mb-4">🌐 Application Connections</h3>
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
                      <span className="text-green-600 text-xs px-2 py-1 bg-green-100 rounded">
                        {conn.totalConnections} connections
                      </span>
                      <span className="text-green-400 text-xs px-2 py-1 bg-green-700 rounded">
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
                                : 'bg-green-100 text-green-800'
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
                                      : 'bg-green-100 text-green-800'
                                  }`}>
                                    {result.isCompatible ? '✅' : '❌'}
                                  </span>
                                  {!result.isCompatible && (
                                    <span className="text-green-400 text-xs">
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
                            <div className="text-xs text-green-400">
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
                            <div className="text-green-400 text-xs mt-1">
                              Debug: remoteIPs = {JSON.stringify(conn.remoteIPs)} | 
                              allRemoteIPs = {JSON.stringify(conn.allRemoteIPs)}
                            </div>
                          </div>
                        )}
                        {conn.totalUniqueIPs > 10 && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
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
                    <div className="text-green-600">{source.connections} events</div>
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
        <h3 className="text-lg lg:text-xl font-semibold text-green-600 mb-4">⚡ Performance Insights</h3>
        
        {/* Slow Running Queries Scatter Plot */}
        <div className="mb-6 border border-green-300 rounded-lg p-1">
          <h4 className="text-green-700 font-semibold mb-3 bg-green-100 p-2 rounded">
            🔍 Query Performance Analysis
            {queryPerformanceLoading && (
              <span className="ml-2 text-sm text-gray-600 animate-pulse">
                🔄 Updating with new filters...
              </span>
            )}
          </h4>
          
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
                  {(() => {
                    // Use originalSlowQueries for dropdown population to maintain all options
                    const useOriginal = originalSlowQueries.length > 0;
                    const dataSource = useOriginal ? originalSlowQueries : analytics?.slowQueries;
                    
                    if (!dataSource || dataSource.length === 0) {
                      // console.log('🔍 No data available for Operation dropdown');
                      return null;
                    }
                    
                    // console.log(`🔍 Operation dropdown using ${useOriginal ? 'original unfiltered' : 'current analytics'} data (${dataSource.length} queries)`);
                    
                    const operations = Array.from(new Set(
                      dataSource.map((query: any) => {
                        const op = getOperationType(query);
                        // Reduced logging to avoid spam - only log if no operation found
                        if (!op) {
                          // console.log('🔍 Query with no operation extracted:', { 
                          //   hasOperation: !!query.operation,
                          //   hasCommand: !!query.command,
                          //   operation: query.operation,
                          //   command: query.command,
                          //   extractedOp: op
                          // });
                        }
                        return op;
                      }).filter((op): op is string => Boolean(op))
                    )).sort();
                    
                    // console.log('🔍 Unique operations found for dropdown:', operations);
                    
                    return operations.map((op: string) => (
                      <option key={op} value={op}>{op}</option>
                    ));
                  })()}
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
                  {(() => {
                    // Use originalSlowQueries for dropdown population to maintain all options
                    const useOriginal = originalSlowQueries.length > 0;
                    const dataSource = useOriginal ? originalSlowQueries : analytics?.slowQueries;
                    
                    if (!dataSource || dataSource.length === 0) {
                      // console.log('🔍 No data available for Namespace dropdown');
                      return null;
                    }
                    
                    // console.log(`🔍 Namespace dropdown using ${useOriginal ? 'original unfiltered' : 'current analytics'} data (${dataSource.length} queries)`);
                    
                    const namespaces = Array.from(new Set(
                      dataSource.map((query: any) => {
                        // Reduced logging to avoid spam
                        return query.namespace;
                      }).filter(Boolean)
                    )).sort();
                    
                    // console.log('🔍 Unique namespaces found for dropdown:', namespaces);
                    
                    return namespaces.map((ns) => (
                      <option key={ns} value={ns}>{ns}</option>
                    ));
                  })()}
                </select>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inMemorySortsFilter}
                    onChange={(e) => setInMemorySortsFilter(e.target.checked)}
                    className="w-4 h-4 text-green-600 bg-white border-gray-200 rounded focus:ring-green-500 focus:ring-2"
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
                    className="w-4 h-4 text-green-600 bg-white border-gray-200 rounded focus:ring-green-500 focus:ring-2"
                  />
                  <span>FromMultiPlanner</span>
                </label>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excludeSystemNamespaces}
                    onChange={(e) => setExcludeSystemNamespaces(e.target.checked)}
                    className="w-4 h-4 text-green-600 bg-white border-gray-200 rounded focus:ring-green-500 focus:ring-2"
                  />
                  <span>Exclude System Namespaces</span>
                </label>
              </div>
            </div>
            
            {/* Date Dropdown Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label htmlFor="dateDropdown" className="text-sm font-medium text-green-700 whitespace-nowrap">Quick Date Select:</label>
                <select
                  id="dateDropdown"
                  value={selectedQuickDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleDateSelection(e.target.value);
                    }
                  }}
                  className="bg-white border border-green-300 rounded-lg px-4 py-2 text-sm text-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 w-full sm:w-auto min-w-[200px] shadow-sm"
                  disabled={loadingDates}
                >
                  <option value="">
                    {loadingDates ? 'Loading dates...' : 'Select a date'}
                  </option>
                  {availableDates.map((date, index) => (
                    <option key={index} value={date}>
                      {formatTimestampInTimezone(date, timezone, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })} ({date})
                    </option>
                  ))}
                </select>
                {availableDates.length > 0 && (
                  <span className="text-xs text-green-600">
                    {availableDates.length} days available
                  </span>
                )}
                
                {/* Reset Button - show when quick date is selected */}
                {selectedQuickDate && (
                  <button
                    onClick={handleResetFilters}
                    className="ml-3 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Reset Filters
                  </button>
                )}
              </div>
            </div>

            {/* Manual Date Filter Controls - Only show when not using quick date select */}
            {showManualDateFilters && (
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 mb-3 border border-gray-200 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <label htmlFor="startDate" className="text-sm font-medium text-gray-700 whitespace-nowrap flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      From:
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          // Reset quick date when manual date is changed
                          if (selectedQuickDate) {
                            setSelectedQuickDate('');
                          }
                        }}
                        className="bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm w-full sm:w-auto"
                      />
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => {
                          setStartTime(e.target.value);
                          // Reset quick date when manual time is changed
                          if (selectedQuickDate) {
                            setSelectedQuickDate('');
                          }
                        }}
                        className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm w-full sm:w-auto"
                        step="1"
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <label htmlFor="endDate" className="text-sm font-medium text-gray-700 whitespace-nowrap flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      To:
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="endDate"
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          // Reset quick date when manual date is changed
                          if (selectedQuickDate) {
                            setSelectedQuickDate('');
                          }
                        }}
                        className="bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm w-full sm:w-auto"
                      />
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => {
                          setEndTime(e.target.value);
                          // Reset quick date when manual time is changed
                          if (selectedQuickDate) {
                            setSelectedQuickDate('');
                          }
                        }}
                        className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm w-full sm:w-auto"
                        step="1"
                      />
                    </div>
                  </div>
                  
                  {/* Clear Manual Filters Button */}
                  {(startDate || endDate || startTime || endTime) && (
                    <button
                      onClick={() => {
                        setStartDate('');
                        setEndDate('');
                        setStartTime('');
                        setEndTime('');
                      }}
                      className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear Date & Time
                    </button>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setStartTime('');
                    setEndTime('');
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
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
                    {analytics.timestampRange.minTimestamp ? formatTimestampInTimezone(analytics.timestampRange.minTimestamp, timezone, { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'} to {' '}
                    {analytics.timestampRange.maxTimestamp ? formatTimestampInTimezone(analytics.timestampRange.maxTimestamp, timezone, { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
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
                                      {formatTimestampInTimezone(date, timezone, { 
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
                    <div className="text-sm font-medium text-green-400 mb-1">
                      {hoveredQuery.operationType.toUpperCase()} Operation
                    </div>
                    <div className="text-xs space-y-1">
                      <div>
                        <span className="text-gray-600">Timestamp:</span> {formatTimestampInTimezone(hoveredQuery.timestamp, timezone)}
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
                <p className="text-green-400 text-xs mt-2">
                  Debug: slowQueries = {analytics.slowQueries ? analytics.slowQueries.length : 'undefined'}, filtered = {filteredQueries.length}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline Analysis Widget */}
      <div className="bg-white rounded-xl p-4 lg:p-6 border border-gray-300">
        <h3 className="text-lg lg:text-xl font-semibold text-green-600 mb-4">⏰ Timeline Analysis</h3>
        
        <div className="mb-6 border border-green-300 rounded-lg p-4">
          <h4 className="text-green-700 font-semibold mb-3">🕐 Queries Running at Specific Time</h4>
          
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
                  onClick={() => {
                    console.log('🔄 Manual refresh triggered', { 
                      selectedTimestamp, 
                      hasAnalytics: !!analytics,
                      slowQueriesCount: analytics?.slowQueries?.length || 0,
                      timelineQueriesLength: timelineQueries.length
                    });
                    if (!selectedTimestamp) {
                      console.error('❌ No timestamp selected for analysis');
                      return;
                    }
                    if (!analytics?.slowQueries) {
                      console.error('❌ No analytics or slow queries data available');
                      return;
                    }
                    analyzeQueriesAtTimestamp(selectedTimestamp);
                  }}
                  disabled={!selectedTimestamp}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2"
                  title="Refresh timeline analysis with current filters"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh Analysis
                </button>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>
                    Found: {timelineQueries.length} concurrent queries{timelineOperationFilter ? ` (${timelineOperationFilter} operations)` : ''}
                  </div>
                  <div className="text-xs text-green-600">
                    💡 Analysis updates automatically when timestamp changes
                  </div>
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
                      className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs font-medium transition-colors"
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
                      className="w-4 h-4 text-green-600 bg-white border-gray-200 rounded focus:ring-green-500 focus:ring-2"
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
                      className="w-4 h-4 text-green-600 bg-white border-gray-200 rounded focus:ring-green-500 focus:ring-2"
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
                      className="w-4 h-4 text-green-600 bg-white border-gray-200 rounded focus:ring-green-500 focus:ring-2"
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
              <h5 className="text-green-600 font-semibold mb-3">
                Queries Running at {selectedTimestamp ? formatTimestampInTimezone(selectedTimestamp, timezone, {
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
                {/* Click instruction */}
                <div className="absolute top-2 left-2 z-10 bg-black bg-opacity-70 text-white text-xs px-3 py-1 rounded shadow-sm">
                  💡 Click anywhere on timeline to analyze queries at that time
                </div>
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
                        
                        {/* Clickable timeline area */}
                        <rect 
                          x={margin} 
                          y="20" 
                          width={chartWidth} 
                          height={chartHeight - 20} 
                          fill="transparent" 
                          className="cursor-crosshair hover:fill-blue-50 hover:fill-opacity-20"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const svg = e.currentTarget.ownerSVGElement;
                            if (!svg) return;
                            
                            const svgRect = svg.getBoundingClientRect();
                            const x = e.clientX - svgRect.left;
                            
                            // Convert screen coordinates to SVG coordinates
                            const svgX = (x / svgRect.width) * 800;
                            
                            // Convert SVG X coordinate to time
                            const relativeX = (svgX - margin) / chartWidth;
                            const clickedTime = startTime + (relativeX * timeRange);
                            
                            // Set the timestamp
                            const clickedDate = new Date(clickedTime);
                            const timeString = clickedDate.toISOString().slice(0, 19); // Remove Z and milliseconds
                            
                            console.log('🎯 Timeline clicked:', {
                              svgX,
                              relativeX, 
                              clickedTime,
                              formattedTime: timeString
                            });
                            
                            setSelectedTimestamp(timeString);
                            // Analysis will be triggered automatically via useEffect
                          }}
                        />
                        
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
                          <span className="text-green-600 text-sm font-mono">#{index + 1}</span>
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
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200 text-center">
              <div className="text-yellow-800 mb-2">
                <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="font-semibold">No queries were running at the selected timestamp</p>
              </div>
              <div className="text-yellow-700 text-sm space-y-1">
                <p>Timestamp: {formatTimestampInTimezone(selectedTimestamp, timezone)}</p>
                <div className="mt-3 space-y-1">
                  <p><strong>Troubleshooting:</strong></p>
                  <ul className="text-left inline-block">
                    <li>• Try clicking on a different time on the timeline chart above</li>
                    <li>• Check if your filters are too restrictive</li>
                    <li>• Verify your log data contains query timing information</li>
                    <li>• Try a timestamp when you know queries were active</li>
                  </ul>
                </div>
              </div>
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
                <div className="flex items-center space-x-4">
                  {AI_FEATURE_ENABLED && (
                    <button
                      onClick={handleAskAI}
                      disabled={isLoadingAi}
                      className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <span>🤖</span>
                      <span>{isLoadingAi ? 'Analyzing...' : 'Ask AI'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowQueryModal(false);
                      resetAiStates();
                    }}
                    className="text-gray-600 hover:text-gray-800 text-2xl"
                  >
                    ×
                  </button>
                </div>
              </div>
              
              {/* Tab Navigation - Only show tabs if AI is enabled */}
              {AI_FEATURE_ENABLED && (
                <div className="flex space-x-4 mt-4">
                  <button
                    onClick={() => setActiveTab('query')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'query'
                        ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    Query Details
                  </button>
                  <button
                    onClick={() => setActiveTab('ai')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'ai'
                        ? 'bg-purple-100 text-purple-800 border border-purple-300'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    AI Analysis
                    {aiResponse && <span className="ml-1 w-2 h-2 bg-green-500 rounded-full inline-block"></span>}
                  </button>
                </div>
              )}
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Show Query Details - If AI is disabled, always show query tab; if enabled, show based on activeTab */}
              {(!AI_FEATURE_ENABLED || activeTab === 'query') ? (
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
                        <div><span className="text-gray-600">Query Start Time ({timezone}):</span> <span className="text-gray-700">{formatTimestampIST(selectedQuery.queryStartTime)}</span></div>
                      )}
                      {selectedQuery.queryEndTime && (
                        <div><span className="text-gray-600">Query End Time ({timezone}):</span> <span className="text-gray-700">{formatTimestampIST(selectedQuery.queryEndTime)}</span></div>
                      )}
                      {selectedQuery.queryHash && (
                        <div><span className="text-gray-600">Query Hash:</span> <span className="text-gray-700 font-mono text-sm">{selectedQuery.queryHash}</span></div>
                      )}
                      {selectedQuery.remoteIP && (
                        <div><span className="text-gray-600">Remote IP Origin:</span> <span className="text-gray-700 font-mono text-sm">{selectedQuery.remoteIP}</span></div>
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
              ) : (
                /* AI Response Tab - Only show if AI is enabled */
                AI_FEATURE_ENABLED && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 mb-4">
                    <span className="text-2xl">🤖</span>
                    <h4 className="text-xl font-semibold text-purple-600">AI Analysis</h4>
                  </div>
                  
                  {isLoadingAi && (
                    <div className="flex items-center justify-center py-12">
                      <div className="flex items-center space-x-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                        <span className="text-gray-600">Analyzing query with AI...</span>
                      </div>
                    </div>
                  )}
                  
                  {aiError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-red-600">⚠️</span>
                        <span className="text-red-800 font-medium">Error</span>
                      </div>
                      <p className="text-red-700 mt-2">{aiError}</p>
                      {AI_FEATURE_ENABLED && (
                        <button
                          onClick={handleAskAI}
                          className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          Try Again
                        </button>
                      )}
                    </div>
                  )}
                  
                  {aiResponse && !isLoadingAi && (
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-6">
                      <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-strong:text-gray-900 prose-code:text-purple-700 prose-code:bg-purple-100 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-100 prose-pre:border prose-li:text-gray-800">
                        <ReactMarkdown
                          components={{
                            // Custom styling for specific elements
                            h1: ({ children }) => <h1 className="text-xl font-bold text-purple-900 mb-3 mt-4 first:mt-0">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-lg font-bold text-purple-800 mb-2 mt-3 first:mt-0">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-md font-semibold text-purple-700 mb-2 mt-3 first:mt-0">{children}</h3>,
                            p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold text-purple-900">{children}</strong>,
                            ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-3">{children}</ol>,
                            li: ({ children }) => <li className="text-gray-800">{children}</li>,
                            code: ({ children }) => <code className="bg-purple-100 text-purple-800 px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
                            pre: ({ children }) => <pre className="bg-gray-100 border rounded-lg p-3 overflow-x-auto mb-3">{children}</pre>
                          }}
                        >
                          {aiResponse}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                  
                  {!aiResponse && !isLoadingAi && !aiError && (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">🤖</div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">AI Analysis Ready</h3>
                      <p className="text-gray-600 mb-6">
                        Click the "Ask AI" button to get intelligent insights about this query's performance, 
                        optimization suggestions, and potential issues.
                      </p>
                      <button
                        onClick={handleAskAI}
                        className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium"
                      >
                        🤖 Ask AI to Analyze This Query
                      </button>
                    </div>
                  )}
                </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
