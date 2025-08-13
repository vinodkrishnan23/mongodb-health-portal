<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# MongoDB Health Check Portal - Copilot Instructions

This is a Next.js 15 application built with TypeScript for uploading and analyzing MongoDB log files.

## Project Context
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: MongoDB
- **File Handling**: Supports .log and .log.gz file uploads

## Key Features
- Upload MongoDB log files in .log or .log.gz format
- Process and decompress gzipped log files
- Store uploaded logs in MongoDB collections
- File validation and error handling
- Drag-and-drop file upload interface

## Architecture Guidelines
- Use App Router for routing (`src/app/` directory structure)
- API routes in `src/app/api/` for backend functionality
- Components in `src/components/` for reusable UI elements
- Database utilities in `src/lib/` for MongoDB operations
- Types in `src/types/` for TypeScript definitions

## Code Standards
- Use TypeScript strict mode
- Follow Next.js 15 best practices
- Implement proper error handling
- Use server actions where appropriate
- Maintain responsive design with Tailwind CSS
