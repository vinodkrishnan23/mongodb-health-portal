import { NextRequest, NextResponse } from 'next/server';
import { getUserEmailCollection } from '@/lib/mongodb';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { name, email } = await request.json();
    
    if (!name || !email) {
      return NextResponse.json({
        success: false,
        message: 'Name and email are required'
      }, { status: 400 });
    }

    const collection = await getUserEmailCollection();
    
    // Check if user already exists
    const existingUser = await collection.findOne({ email });
    
    if (existingUser) {
      return NextResponse.json({
        success: false,
        message: 'User already exists'
      }, { status: 400 });
    }

    // Create new user
    const newUser = {
      name,
      email,
      createdAt: new Date(),
      lastLogin: new Date()
    };

    const result = await collection.insertOne(newUser);
    
    return NextResponse.json({
      success: true,
      user: {
        name,
        email,
        userId: result.insertedId
      },
      message: 'User created successfully'
    });

  } catch (error) {
    console.error('Register user error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to register user',
      error: 'REGISTER_ERROR'
    }, { status: 500 });
  }
}
