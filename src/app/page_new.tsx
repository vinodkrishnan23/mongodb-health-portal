'use client';

import { useState } from 'react';
import FileUpload from '@/components/FileUpload';

export default function Home() {
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleUpload = async (files: FileList) => {
    setLoading(true);
    try {
      // File is already uploaded by the FileUpload component
      // Here we can add any additional logic like refreshing the file list
      const fileName = files[0].name;
      setUploadedFiles(prev => [...prev, fileName]);
    } catch (error) {
      console.error('Error handling upload:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            MongoDB Health Check Portal
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload your MongoDB log files (.log or .log.gz) to analyze and store them in the database.
            Our system automatically processes both regular and compressed log files.
          </p>
        </header>

        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">Upload Log Files</h2>
            <FileUpload 
              onUpload={handleUpload}
              loading={loading}
              accept=".log,.log.gz"
            />
          </div>

          {uploadedFiles.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-8">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Recently Uploaded Files</h3>
              <div className="space-y-2">
                {uploadedFiles.map((fileName, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <span className="text-sm font-medium text-gray-700">{fileName}</span>
                    <span className="text-xs text-gray-500">Uploaded successfully</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-800 mb-3">Supported File Formats</h3>
            <ul className="space-y-2 text-blue-700">
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <strong>.log files</strong> - Standard MongoDB log files
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <strong>.log.gz files</strong> - Compressed MongoDB log files (automatically decompressed)
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
