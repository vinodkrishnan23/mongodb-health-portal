import { NextRequest, NextResponse } from 'next/server';
import { getUserEmailCollection } from '@/lib/mongodb';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json({
        success: false,
        message: 'Email is required'
      }, { status: 400 });
    }

    const collection = await getUserEmailCollection();
    
    // Check if user exists
    const existingUser = await collection.findOne({ email });
    
    if (existingUser) {
      return NextResponse.json({
        success: true,
        userExists: true,
        user: {
          name: existingUser.name,
          email: existingUser.email,
          userId: existingUser._id
        }
      });
    } else {
      return NextResponse.json({
        success: true,
        userExists: false
      });
    }

  } catch (error) {
    console.error('Check email error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to check email',
      error: 'CHECK_EMAIL_ERROR'
    }, { status: 500 });
  }
}
