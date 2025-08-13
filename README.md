# MongoDB Health Check Portal

A Next.js 15 application for uploading and analyzing MongoDB log files. This application allows users to upload MongoDB log files in both `.log` and `.log.gz` formats, automatically processes them, and stores them in a MongoDB collection.

## Features

- 📁 **File Upload**: Support for both `.log` and `.log.gz` MongoDB log files
- 🗜️ **Automatic Decompression**: Automatically handles gzipped log files
- 💾 **MongoDB Storage**: Stores uploaded logs and metadata in MongoDB collections
- 🎨 **Modern UI**: Clean, responsive interface built with Tailwind CSS
- 📊 **File Management**: Track uploaded files and their processing status
- 🔍 **Type Safety**: Full TypeScript support for better development experience

## Prerequisites

- Node.js 18+ 
- MongoDB (local installation or MongoDB Atlas)
- npm, yarn, pnpm, or bun

## Getting Started

1. **Clone and install dependencies:**

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

2. **Configure Environment Variables:**

Copy the example environment file and update with your MongoDB connection:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your MongoDB connection string:

```bash
MONGODB_URI=mongodb://localhost:27017
# or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/

DATABASE_NAME=mongolog_analyzer
```

3. **Start MongoDB:**

If using local MongoDB:
```bash
# macOS with Homebrew
brew services start mongodb-community

# Ubuntu/Debian
sudo systemctl start mongod

# Windows
net start MongoDB
```

4. **Run the development server:**

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

5. **Open the application:**

Open [http://localhost:3000](http://localhost:3000) with your browser to see the MongoDB Health Check Portal.

## Usage

1. **Upload Log Files:**
   - Navigate to the upload section on the homepage
   - Drag and drop your `.log` or `.log.gz` files, or click to browse
   - The system will automatically process and store your files

2. **Supported File Types:**
   - `.log` - Standard MongoDB log files
   - `.log.gz` - Compressed MongoDB log files (automatically decompressed)

3. **File Processing:**
   - Files are validated for correct format
   - Compressed files are automatically decompressed
   - Log content is parsed and stored with metadata
   - File information is saved to MongoDB collection

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   └── upload/        # File upload endpoint
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Homepage
├── components/            # React components
│   └── FileUpload.tsx     # File upload component
├── lib/                   # Utility libraries
│   └── mongodb.ts         # MongoDB connection
└── types/                 # TypeScript type definitions
    └── index.ts           # Application types
```

## API Endpoints

### POST /api/upload
Upload MongoDB log files to the system.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: File form data with key `file`

**Response:**
```json
{
  "success": true,
  "message": "File uploaded and processed successfully",
  "fileId": "507f1f77bcf86cd799439011"
}
```

## Database Schema

### log_files Collection

```typescript
{
  _id: ObjectId,
  filename: string,           // Original filename
  originalName: string,       // Original filename
  size: number,              // File size in bytes
  mimetype: string,          // MIME type
  uploadDate: Date,          // Upload timestamp
  content: string,           // Processed log content
  isCompressed: boolean,     // Whether file was compressed
  metadata: {
    linesCount: number,      // Number of lines in log
    charactersCount: number  // Number of characters
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017` |
| `DATABASE_NAME` | Database name | `mongolog_analyzer` |

## Development

This project uses:
- **Next.js 15** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **MongoDB** for data storage
- **ESLint** for code linting

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License.
