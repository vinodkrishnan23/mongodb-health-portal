export interface LogFile {
  _id?: string;
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
  uploadDate: Date;
  content?: string;
  isCompressed: boolean;
  metadata?: {
    [key: string]: any;
  };
}

export interface UploadResponse {
  success: boolean;
  message: string;
  entriesCreated?: number;
  uploadSessionId?: string;
  stats?: {
    totalEntries: number;
    successfullyParsed: number;
    parseErrors: number;
    withTimestamp: number;
    withLevel: number;
    withComponent: number;
    withContext: number;
    withMessage: number;
  };
  insertedIds?: any;
  fileId?: string;
  error?: string;
  fileResults?: any[];
}

export interface FileUploadProps {
  onUpload: (files: FileList, cleanedNames?: string[]) => Promise<void>;
  loading?: boolean;
  accept?: string;
  user?: {
    name: string;
    email: string;
    userId: string;
  };
}

export interface LogEntry {
  _id?: string;
  
  // Added metadata fields
  sourceFile: string;
  uploadDate: Date;
  uploadSessionId: string;
  lineNumber: number;
  fileClassification: 'primary' | 'secondary';
  
  // Original MongoDB JSON log structure will be preserved
  // plus any additional fields like parseError, originalLine for failed parses
  [key: string]: any;
}
