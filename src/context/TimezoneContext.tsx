'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  TIMEZONE_OPTIONS, 
  DEFAULT_TIMEZONE, 
  loadTimezonePreference, 
  saveTimezonePreference,
  getTimezoneDisplayName
} from '@/lib/timezone';

interface TimezoneContextType {
  timezone: string;
  setTimezone: (timezone: string) => void;
  timezoneOptions: typeof TIMEZONE_OPTIONS;
  getTimezoneDisplayName: (timezone: string) => string;
  isTimezoneLoaded: boolean;
}

const TimezoneContext = createContext<TimezoneContextType | undefined>(undefined);

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState<string>(DEFAULT_TIMEZONE);
  const [isTimezoneLoaded, setIsTimezoneLoaded] = useState(false);

  useEffect(() => {
    // Load timezone preference on client-side only
    try {
      const loadedTimezone = loadTimezonePreference();
      setTimezoneState(loadedTimezone);
      setIsTimezoneLoaded(true);
    } catch (error) {
      console.error('Error loading timezone preference:', error);
      setTimezoneState(DEFAULT_TIMEZONE);
      setIsTimezoneLoaded(true);
    }
  }, []);

  const setTimezone = (newTimezone: string) => {
    setTimezoneState(newTimezone);
    saveTimezonePreference(newTimezone);
  };

  const value: TimezoneContextType = {
    timezone,
    setTimezone,
    timezoneOptions: TIMEZONE_OPTIONS,
    getTimezoneDisplayName,
    isTimezoneLoaded
  };

  return (
    <TimezoneContext.Provider value={value}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  const context = useContext(TimezoneContext);
  if (context === undefined) {
    throw new Error('useTimezone must be used within a TimezoneProvider');
  }
  return context;
}

export default TimezoneContext;
