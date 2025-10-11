'use client';

import { useTimezone } from '@/context/TimezoneContext';

interface TimezoneSelectorProps {
  showLabel?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function TimezoneSelector({ 
  showLabel = true, 
  className = '', 
  size = 'md' 
}: TimezoneSelectorProps) {
  const { timezone, setTimezone, timezoneOptions, isTimezoneLoaded } = useTimezone();

  if (!isTimezoneLoaded) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {showLabel && <span className="text-sm text-gray-600">Timezone:</span>}
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-2',
    lg: 'text-base px-4 py-2'
  };

  const handleTimezoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTimezone = e.target.value;
    setTimezone(newTimezone);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <label htmlFor="timezone-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">
          Timezone:
        </label>
      )}
      <select
        id="timezone-select"
        value={timezone}
        onChange={handleTimezoneChange}
        className={`
          bg-white border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 
          focus:border-green-500 text-gray-800 cursor-pointer hover:border-green-400 transition-colors
          ${sizeClasses[size]}
        `}
        title="Select your timezone for timestamp display"
      >
        {timezoneOptions.map((tz) => (
          <option key={tz.value} value={tz.value}>
            {tz.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Compact version for headers/navigation
export function CompactTimezoneSelector({ className = '' }: { className?: string }) {
  return (
    <TimezoneSelector 
      showLabel={false}
      size="sm"
      className={`${className}`}
    />
  );
}
