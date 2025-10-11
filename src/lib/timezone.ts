// Timezone utility functions for handling timezone conversions

// Common timezone options for users
export const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)', offset: 0 },
  { value: 'America/New_York', label: 'Eastern Time (ET)', offset: -5 },
  { value: 'America/Chicago', label: 'Central Time (CT)', offset: -6 },
  { value: 'America/Denver', label: 'Mountain Time (MT)', offset: -7 },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)', offset: -8 },
  { value: 'Europe/London', label: 'Greenwich Mean Time (GMT)', offset: 0 },
  { value: 'Europe/Paris', label: 'Central European Time (CET)', offset: 1 },
  { value: 'Europe/Berlin', label: 'Central European Time (CET)', offset: 1 },
  { value: 'Asia/Kolkata', label: 'India Standard Time (IST)', offset: 5.5 },
  { value: 'Asia/Shanghai', label: 'China Standard Time (CST)', offset: 8 },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)', offset: 9 },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET)', offset: 10 },
  { value: 'Pacific/Auckland', label: 'New Zealand Standard Time (NZST)', offset: 12 }
];

// Default timezone (IST for backward compatibility)
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * Convert UTC timestamp to user's selected timezone
 * @param utcTimestamp - UTC timestamp string or Date object
 * @param timezone - Target timezone (IANA timezone identifier)
 * @returns Date object in target timezone
 */
export function convertUTCToTimezone(utcTimestamp: string | Date, timezone: string = DEFAULT_TIMEZONE): Date {
  if (!utcTimestamp) return new Date();
  
  const utcDate = typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp;
  
  // If the date is invalid, return current date
  if (isNaN(utcDate.getTime())) {
    console.warn('Invalid timestamp provided to convertUTCToTimezone:', utcTimestamp);
    return new Date();
  }
  
  // Use Intl.DateTimeFormat to handle timezone conversion
  try {
    // Create a new date representing the same moment in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(utcDate);
    const partsObj: { [key: string]: string } = {};
    parts.forEach(part => {
      partsObj[part.type] = part.value;
    });
    
    // Construct the date string and create new Date
    const dateString = `${partsObj.year}-${partsObj.month}-${partsObj.day}T${partsObj.hour}:${partsObj.minute}:${partsObj.second}`;
    return new Date(dateString);
  } catch (error) {
    console.warn('Error converting timezone:', error);
    return utcDate; // Fallback to original date
  }
}

/**
 * Format timestamp for display in user's timezone
 * @param utcTimestamp - UTC timestamp string or Date object
 * @param timezone - Target timezone (IANA timezone identifier)
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatTimestampInTimezone(
  utcTimestamp: string | Date, 
  timezone: string = DEFAULT_TIMEZONE,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  }
): string {
  if (!utcTimestamp) return 'N/A';
  
  const utcDate = typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp;
  
  // If the date is invalid, return N/A
  if (isNaN(utcDate.getTime())) {
    console.warn('Invalid timestamp provided to formatTimestampInTimezone:', utcTimestamp);
    return 'N/A';
  }
  
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: timezone
    });
    
    return formatter.format(utcDate);
  } catch (error) {
    console.warn('Error formatting timestamp in timezone:', error);
    return utcDate.toLocaleString(); // Fallback to local formatting
  }
}

/**
 * Get user's browser timezone
 * @returns IANA timezone identifier
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.warn('Error getting browser timezone, using default:', error);
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Get timezone display name
 * @param timezone - IANA timezone identifier
 * @returns Human-readable timezone name
 */
export function getTimezoneDisplayName(timezone: string): string {
  const option = TIMEZONE_OPTIONS.find(tz => tz.value === timezone);
  if (option) {
    return option.label;
  }
  
  // Fallback: try to get display name from Intl
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'long'
    });
    const parts = formatter.formatToParts(now);
    const timeZonePart = parts.find(part => part.type === 'timeZoneName');
    return timeZonePart ? timeZonePart.value : timezone;
  } catch (error) {
    return timezone;
  }
}

/**
 * Store user's timezone preference in localStorage
 * @param timezone - IANA timezone identifier
 */
export function saveTimezonePreference(timezone: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('userTimezone', timezone);
  }
}

/**
 * Load user's timezone preference from localStorage
 * @returns IANA timezone identifier or default
 */
export function loadTimezonePreference(): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('userTimezone');
      if (saved && TIMEZONE_OPTIONS.some(tz => tz.value === saved)) {
        return saved;
      }
    } catch (error) {
      console.error('Error accessing localStorage for timezone:', error);
    }
  }
  
  // If no saved preference, try to use browser timezone if it's in our list
  try {
    const browserTz = getBrowserTimezone();
    if (TIMEZONE_OPTIONS.some(tz => tz.value === browserTz)) {
      return browserTz;
    }
  } catch (error) {
    console.error('Error getting browser timezone:', error);
  }
  
  return DEFAULT_TIMEZONE;
}

/**
 * Convert a date range to UTC for API queries
 * @param dateString - Date string in YYYY-MM-DD format
 * @param timeString - Time string in HH:mm format (optional)
 * @param timezone - User's timezone
 * @returns UTC Date object
 */
export function convertTimezoneToUTC(dateString: string, timeString?: string, timezone: string = DEFAULT_TIMEZONE): Date {
  try {
    const timeStr = timeString || '00:00';
    console.log('🌍 convertTimezoneToUTC input:', { dateString, timeString: timeStr, timezone });
    
    // Create date parts
    const [year, month, day] = dateString.split('-').map(Number);
    const [hours, minutes, seconds = 0] = timeStr.split(':').map(Number);
    
    console.log('🌍 Date parts:', { year, month, day, hours, minutes, seconds });
    
    // Use a simpler, more reliable approach
    // Create the date string in the user's timezone and let the browser handle conversion
    const inputDateStr = `${dateString}T${timeStr}:00`;
    console.log('🌍 Input date string:', inputDateStr);
    
    // Create a date in the user's specified timezone
    // Use Intl.DateTimeFormat to handle the timezone conversion properly
    const tempDate = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    console.log('🌍 Temp date (local interpretation):', tempDate.toISOString());
    
    // Get the actual UTC time by using the timezone offset
    // This is a more direct approach using the Date constructor with timezone awareness
    const utcMs = tempDate.getTime() - (tempDate.getTimezoneOffset() * 60 * 1000);
    
    // Now adjust for the target timezone
    // Get the timezone offset for the target timezone at this specific date/time
    const offsetMinutes = getTimezoneOffset(timezone, tempDate);
    console.log('🌍 Target timezone offset (minutes):', offsetMinutes);
    
    // Convert: subtract the timezone offset to get UTC
    const result = new Date(utcMs - (offsetMinutes * 60 * 1000));
    console.log('🌍 Final UTC result:', result.toISOString());
    
    return result;
  } catch (error) {
    console.error('🌍 Error in convertTimezoneToUTC:', error);
    // Simple fallback
    const fallback = new Date(`${dateString}T${timeString || '00:00'}:00Z`);
    console.log('🌍 Using fallback:', fallback.toISOString());
    return fallback;
  }
}

// Helper function to get timezone offset for a specific timezone and date
function getTimezoneOffset(timezone: string, date: Date): number {
  try {
    // Create a date formatter for the timezone
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    
    // Calculate offset in minutes
    const offsetMs = tzDate.getTime() - utcDate.getTime();
    return offsetMs / (60 * 1000);
  } catch (error) {
    console.error('Error getting timezone offset:', error);
    return 0; // Fallback to UTC
  }
}
