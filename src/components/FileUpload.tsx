'use client';

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { FileUploadProps, UploadResponse } from '@/types';
import { getSupportedMongoDBVersions, getMongoDBVersionDisplayName } from '@/lib/driverCompatibility';

interface FileWithClassification {
  file: File;
  classification: 'primary' | 'secondary';
  cleanedName: string;
}

// Function to clean up file names by extracting everything before the first dot
function cleanFileName(fileName: string): string {
  const firstDotIndex = fileName.indexOf('.');
  if (firstDotIndex !== -1) {
    return fileName.substring(0, firstDotIndex);
  }
  return fileName;
}

export default function FileUpload({ onUpload, loading = false, accept = '.log,.gz', user }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<FileWithClassification[]>([]);
  const [showClassification, setShowClassification] = useState(false);
  const [mongodbVersion, setMongodbVersion] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files);
    }
  };

  const handleFileSelection = (files: FileList) => {
    setUploadError('');
    setUploadStatus('');

    // Validate all files first
    const invalidFiles = Array.from(files).filter(file => 
      !file.name.toLowerCase().endsWith('.log') && !file.name.toLowerCase().endsWith('.gz')
    );

    if (invalidFiles.length > 0) {
      setUploadError(`Invalid file types: ${invalidFiles.map(f => f.name).join(', ')}. Please select only .log or .gz files`);
      return;
    }

    // Convert FileList to array with default classification and cleaned names
    const filesWithClassification: FileWithClassification[] = Array.from(files).map(file => ({
      file,
      classification: 'primary', // Default to primary
      cleanedName: cleanFileName(file.name)
    }));

    setSelectedFiles(filesWithClassification);
    setShowClassification(true);
  };

  const updateFileClassification = (index: number, classification: 'primary' | 'secondary') => {
    setSelectedFiles(prev => 
      prev.map((item, i) => 
        i === index ? { ...item, classification } : item
      )
    );
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    if (selectedFiles.length === 1) {
      setShowClassification(false);
    }
  };

  const proceedWithUpload = async () => {
    if (selectedFiles.length === 0) return;

    // Check if user information is available
    if (!user || !user.email || !user.userId) {
      setUploadError('User authentication required. Please refresh the page and try again.');
      return;
    }

    // Validate that MongoDB version is selected for the upload batch
    if (!mongodbVersion) {
      setUploadError('Please select a MongoDB version for this upload batch.');
      return;
    }

    try {
      setUploadStatus(`Uploading and processing ${selectedFiles.length} file(s)...`);
      const formData = new FormData();
      
      // Add user information
      formData.append('user', JSON.stringify(user));
      
      // Add MongoDB version for the entire batch
      formData.append('mongodbVersion', mongodbVersion);
      
      // Add all files with their classifications to FormData
      selectedFiles.forEach((item, index) => {
        formData.append('file', item.file);
        formData.append(`classification_${index}`, item.classification);
      });
      
      // Also add the classification mapping as JSON (now includes batch MongoDB version)
      formData.append('fileClassifications', JSON.stringify(
        selectedFiles.map((item, index) => ({
          fileName: item.file.name,
          cleanedName: item.cleanedName,
          classification: item.classification,
          mongodbVersion: mongodbVersion, // Apply same version to all files
          index
        }))
      ));

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result: UploadResponse = await response.json();

      if (result.success) {
        setUploadStatus(`Files uploaded successfully! Created ${result.entriesCreated} total log entries from ${selectedFiles.length} file(s).`);
        
        // Create a FileList-like object for the onUpload callback
        const fileList = selectedFiles.map(item => item.file);
        const cleanedNames = selectedFiles.map(item => item.cleanedName);
        const mockFileList = Object.assign(fileList, {
          item: (index: number) => fileList[index] || null,
        }) as unknown as FileList;
        
        await onUpload(mockFileList, cleanedNames);
        
        // Clear the selected files after successful upload
        setSelectedFiles([]);
        setShowClassification(false);
        setMongodbVersion('');
      } else {
        setUploadError(result.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError('An error occurred during upload');
    }
  };

  const cancelSelection = () => {
    setSelectedFiles([]);
    setShowClassification(false);
    setMongodbVersion('');
    setUploadStatus('');
    setUploadError('');
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`w-full mx-auto ${showClassification ? 'max-w-4xl' : 'max-w-md'}`}>
      {!showClassification ? (
        // File selection interface
        <div
          className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragActive
              ? 'border-green-400 bg-gray-100'
              : 'border-gray-600 hover:border-gray-500 bg-gray-100'
          } ${loading ? 'opacity-50 pointer-events-none' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={accept}
            multiple
            onChange={handleChange}
            disabled={loading}
          />

          <div className="space-y-4">
            <div className="mx-auto h-12 w-12 text-gray-600">
              <svg
                className="h-12 w-12"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
                aria-hidden="true"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div>
              <p className="text-sm text-gray-700">
                <button
                  type="button"
                  className="font-medium text-green-600 hover:text-green-300 focus:outline-none focus:underline"
                  onClick={onButtonClick}
                  disabled={loading}
                >
                  {loading ? 'Uploading...' : 'Click to upload'}
                </button>{' '}
                or drag and drop
              </p>
              <p className="text-xs text-gray-500">
                MongoDB log files (.log or .gz) - Multiple files supported
              </p>
            </div>
          </div>

          {loading && (
            <div className="absolute inset-0 bg-gray-100 bg-opacity-75 flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-400"></div>
            </div>
          )}
        </div>
      ) : (
        // File classification interface
        <div className="bg-gray-100 border border-gray-300 rounded-lg p-8">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-green-600 mb-2">Classify Your Files</h3>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Please mark each file as either <span className="text-green-300 font-semibold">Primary</span> (main logs) or <span className="text-blue-300 font-semibold">Secondary</span> (supplementary logs) to help organize your MongoDB log analysis.
            </p>
          </div>

          {/* Global MongoDB Version Selection */}
          <div className="bg-gray-200 rounded-xl p-6 mb-6 border border-gray-600">
            <div className="flex items-center justify-center space-x-4">
              <label className="text-lg font-medium text-green-600">
                MongoDB Version for this upload batch:
              </label>
              <select
                value={mongodbVersion}
                onChange={(e) => setMongodbVersion(e.target.value)}
                className="px-4 py-2 bg-gray-600 border border-gray-500 rounded-lg text-gray-900 text-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent min-w-48"
              >
                <option value="">Select MongoDB Version</option>
                {getSupportedMongoDBVersions().map(version => (
                  <option key={version} value={version}>
                    {getMongoDBVersionDisplayName(version)}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-center text-gray-600 text-sm mt-2">
              This version will be applied to all {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} in this upload
            </p>
          </div>
          
          <div className="grid gap-6 mb-8">
            {selectedFiles.map((item, index) => (
              <div key={index} className="bg-gray-200 rounded-xl border border-gray-600 p-6 hover:border-gray-500 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 mr-6">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="p-2 bg-gray-600 rounded-lg">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-lg font-medium text-green-300 truncate">{item.cleanedName}</div>
                        <div className="text-sm text-gray-600">
                          {(item.file.size / 1024 / 1024).toFixed(2)} MB • {item.file.name}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-6">
                    {/* File Classification */}
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-3 cursor-pointer group">
                        <div className="relative">
                          <input
                            type="radio"
                            name={`classification_${index}`}
                            value="primary"
                            checked={item.classification === 'primary'}
                            onChange={() => updateFileClassification(index, 'primary')}
                            className="sr-only"
                          />
                          <div className={`w-5 h-5 rounded-full border-2 transition-colors ${
                            item.classification === 'primary' 
                              ? 'border-green-400 bg-green-400' 
                              : 'border-gray-400 group-hover:border-green-400'
                          }`}>
                            {item.classification === 'primary' && (
                              <div className="w-full h-full rounded-full bg-green-400 flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-gray-100"></div>
                              </div>
                            )}
                          </div>
                        </div>
                        <span className={`text-base font-medium transition-colors ${
                          item.classification === 'primary' ? 'text-green-300' : 'text-gray-700 group-hover:text-green-300'
                        }`}>
                          Primary
                        </span>
                      </label>
                      
                      <label className="flex items-center space-x-3 cursor-pointer group">
                        <div className="relative">
                          <input
                            type="radio"
                            name={`classification_${index}`}
                            value="secondary"
                            checked={item.classification === 'secondary'}
                            onChange={() => updateFileClassification(index, 'secondary')}
                            className="sr-only"
                          />
                          <div className={`w-5 h-5 rounded-full border-2 transition-colors ${
                            item.classification === 'secondary' 
                              ? 'border-blue-400 bg-blue-400' 
                              : 'border-gray-400 group-hover:border-blue-400'
                          }`}>
                            {item.classification === 'secondary' && (
                              <div className="w-full h-full rounded-full bg-blue-400 flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-gray-100"></div>
                              </div>
                            )}
                          </div>
                        </div>
                        <span className={`text-base font-medium transition-colors ${
                          item.classification === 'secondary' ? 'text-blue-300' : 'text-gray-700 group-hover:text-blue-300'
                        }`}>
                          Secondary
                        </span>
                      </label>
                    </div>
                    
                    <button
                      onClick={() => removeFile(index)}
                      className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Remove file"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={proceedWithUpload}
              disabled={loading || !mongodbVersion}
              className={`px-8 py-3 rounded-lg font-semibold text-lg transition-colors flex items-center justify-center space-x-2 ${
                !mongodbVersion
                  ? 'bg-gray-600 text-gray-600 cursor-not-allowed'
                  : loading
                  ? 'bg-green-700 text-green-200 cursor-wait'
                  : 'bg-green-600 text-black hover:bg-green-500'
              }`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>
                    Upload {selectedFiles.length} File{selectedFiles.length > 1 ? 's' : ''} 
                    {mongodbVersion && ` (MongoDB ${mongodbVersion})`}
                  </span>
                </>
              )}
            </button>
            
            <button
              onClick={cancelSelection}
              disabled={loading}
              className="px-8 py-3 bg-gray-600 text-gray-700 rounded-lg hover:bg-gray-500 disabled:opacity-50 font-semibold text-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {uploadStatus && (
        <div className="mt-3 p-3 bg-green-900 border border-green-700 rounded-md">
          <p className="text-sm text-green-300">{uploadStatus}</p>
        </div>
      )}

      {uploadError && (
        <div className="mt-3 p-3 bg-red-900 border border-red-700 rounded-md">
          <p className="text-sm text-red-300">{uploadError}</p>
        </div>
      )}
    </div>
  );
}
