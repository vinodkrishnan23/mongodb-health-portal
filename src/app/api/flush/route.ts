import { NextRequest, NextResponse } from 'next/server';
import { getLogFilesCollection } from '@/lib/mongodb';

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const sourceFile = searchParams.get('sourceFile');
    
    if (!sourceFile) {
      return NextResponse.json({
        success: false,
        message: 'sourceFile parameter is required'
      }, { status: 400 });
    }

    const collection = await getLogFilesCollection();
    
    // Delete all documents for the specified source file
    const result = await collection.deleteMany({ sourceFile });
    
    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} log entries for file: ${sourceFile}`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Flush error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to flush log entries',
      error: 'FLUSH_ERROR'
    }, { status: 500 });
  }
}
