'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CompactTimezoneSelector } from './TimezoneSelector';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  backButtonHref?: string;
  children?: React.ReactNode;
}

export default function Header({ 
  title, 
  subtitle, 
  showBackButton = false, 
  backButtonHref = '/',
  children 
}: HeaderProps) {
  const [user, setUser] = useState<{name: string; email: string} | null>(null);

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

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('lastUploadedFiles');
    localStorage.removeItem('currentSessionId');
    window.location.href = '/';
  };

  return (
    <header className="bg-white border-b border-green-200">
      <div className="w-full px-4 sm:px-6 lg:px-8 p-4">
        <div className="flex items-center justify-between">
          {/* Left side - Title & Navigation */}
          <div className="flex items-center space-x-6">
            {showBackButton && (
              <Link
                href={backButtonHref}
                className="flex items-center px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                </svg>
                Back
              </Link>
            )}
            <div>
              <h1 className="text-2xl font-bold text-green-600">{title}</h1>
              {subtitle && (
                <p className="text-sm text-green-700 mt-1">{subtitle}</p>
              )}
            </div>
          </div>
          
          {/* Right side - User Welcome & Actions */}
          <div className="flex items-center space-x-4">
            {/* Timezone Selector */}
            <CompactTimezoneSelector />
            
            {/* User Welcome Section */}
            {user && (
              <div className="flex items-center space-x-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-sm font-medium text-green-700">
                  Welcome, {user.name}
                </span>
              </div>
            )}
            
            {/* Logout Button with Green Theme */}
            {user && (
              <button
                onClick={handleLogout}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            )}
          </div>
        </div>
        
        {/* Custom content area */}
        {children}
      </div>
    </header>
  );
}