'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface LoginPageProps {
  onLogin: (user: { name: string; email: string; userId: string }) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleEmailCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        if (data.userExists) {
          // User exists, log them in
          onLogin(data.user);
          localStorage.setItem('user', JSON.stringify(data.user));
          router.push('/');
        } else {
          // User doesn't exist, show registration form
          setShowRegisterForm(true);
        }
      } else {
        setError(data.message || 'Failed to check email');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
      console.error('Email check error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email }),
      });

      const data = await response.json();

      if (data.success) {
        // Registration successful, log them in
        onLogin(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
        router.push('/');
      } else {
        setError(data.message || 'Failed to register user');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
      console.error('Registration error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setShowRegisterForm(false);
    setName('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="text-green-600 font-bold text-2xl">MongoDB</div>
          </div>
          <h1 className="text-3xl font-bold text-green-600 mb-2">
            Health Check Portal
          </h1>
          <p className="text-gray-700">
            {showRegisterForm ? 'Complete your registration' : 'Sign in to continue'}
          </p>
        </div>

        {/* Login/Register Form */}
        <div className="bg-gray-50 border border-gray-300 rounded-lg shadow-lg p-8">
          {!showRegisterForm ? (
            // Email Check Form
            <form onSubmit={handleEmailCheck} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-gray-100 border border-gray-600 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter your email address"
                />
              </div>

              {error && (
                <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Checking...' : 'Continue'}
              </button>
            </form>
          ) : (
            // Registration Form
            <form onSubmit={handleRegister} className="space-y-6">
              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold text-green-600">Welcome!</h3>
                <p className="text-gray-700 text-sm mt-1">
                  We need a few more details to create your account
                </p>
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-gray-100 border border-gray-600 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter your full name"
                />
              </div>

              <div>
                <label htmlFor="email-confirm" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email-confirm"
                  value={email}
                  disabled
                  className="w-full px-3 py-2 bg-gray-200 border border-gray-600 rounded-lg text-gray-600 cursor-not-allowed"
                />
              </div>

              {error && (
                <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handleBackToEmail}
                  className="flex-1 bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-white transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-600 text-sm">
          <p>Secure MongoDB health monitoring and log analysis</p>
        </div>
      </div>
    </div>
  );
}
