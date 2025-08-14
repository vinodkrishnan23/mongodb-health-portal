import { NextRequest, NextResponse } from 'next/server';
import { getAskAiCollection } from '@/lib/mongodb';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
if (!process.env.GOOGLE_AI_API_KEY) {
  console.error('❌ GOOGLE_AI_API_KEY environment variable is not set');
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

// Try different model names in order of preference
const getModel = () => {
  const modelNames = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'];
  // For now, start with the most recent model
  return genAI.getGenerativeModel({ model: modelNames[0] });
};

const model = getModel();

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.GOOGLE_AI_API_KEY) {
      const errorMessage = 'AI service is not configured. Please set GOOGLE_AI_API_KEY environment variable.';
      console.error('❌', errorMessage);
      
      const encoder = new TextEncoder();
      const errorStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(errorMessage));
          controller.close();
        }
      });

      return new Response(errorStream, {
        status: 503,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    const { sourceFile, query, queryHash, numYields } = await request.json();

    if (!sourceFile || !query) {
      return NextResponse.json({
        success: false,
        message: 'sourceFile and query are required'
      }, { status: 400 });
    }

    const collection = await getAskAiCollection();
    
    // Create a unique identifier for this query
    const queryIdentifier = {
      sourceFile,
      queryHash: queryHash || null,
      numYields: numYields || null,
      // Include key query characteristics for uniqueness
      namespace: query.namespace || null,
      operation: query.operation || null,
      duration: query.duration || query.durationMillis || null
    };

    console.log('🔍 Checking for existing AI response for query:', queryIdentifier);

    // Check if response already exists
    const existingResponse = await collection.findOne(queryIdentifier);

    if (existingResponse) {
      console.log('✅ Found existing AI response, streaming cached result');
      
      // Stream the cached response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const response = existingResponse.aiResponse || 'No response found';
          // Stream the response in chunks to simulate real-time streaming
          const words = response.split(' ');
          let index = 0;
          
          const streamChunk = () => {
            if (index < words.length) {
              // Stream multiple words at once for better markdown rendering
              const wordsPerChunk = 5;
              const chunk = words.slice(index, index + wordsPerChunk).join(' ') + ' ';
              controller.enqueue(encoder.encode(chunk));
              index += wordsPerChunk;
              setTimeout(streamChunk, 100); // Slightly longer delay for smoother appearance
            } else {
              controller.close();
            }
          };
          
          streamChunk();
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    console.log('🤖 No existing response found, generating new AI analysis');

    // Create a comprehensive prompt for the AI
    const prompt = `As a MongoDB performance expert, analyze this slow query and provide detailed insights:

**Query Details:**
- Namespace: ${query.namespace || 'N/A'}
- Operation: ${query.operation || 'N/A'}
- Duration: ${query.duration || query.durationMillis || 'N/A'}ms
- Documents Examined: ${query.docsExamined || 'N/A'}
- Documents Returned: ${query.docsReturned || 'N/A'}
- Keys Examined: ${query.keysExamined || 'N/A'}
- Plan Summary: ${query.planSummary || 'N/A'}
- Query Hash: ${query.queryHash || 'N/A'}
- Number of Yields: ${query.numYields || 'N/A'}
- From Plan Cache: ${query.fromPlanCache ? 'Yes' : 'No'}
- From Multi Planner: ${query.fromMultiPlanner ? 'Yes' : 'No'}
- CPU Time: ${query.cpuNanos ? (query.cpuNanos / 1000000000).toFixed(3) + 's' : 'N/A'}
- Data Read: ${query.dataReadMB ? query.dataReadMB.toFixed(2) + ' MB' : 'N/A'}
- Time Reading: ${query.timeReadingMicros ? (query.timeReadingMicros / 1000000).toFixed(3) + 's' : 'N/A'}

**Command/Filter:**
${query.command ? JSON.stringify(query.command, null, 2) : 'N/A'}

**Filter:**
${query.filter ? JSON.stringify(query.filter, null, 2) : 'N/A'}

**Sort:**
${query.sort ? JSON.stringify(query.sort, null, 2) : 'N/A'}

**Pipeline (if aggregation):**
${query.pipeline ? JSON.stringify(query.pipeline, null, 2) : 'N/A'}

Please provide a comprehensive analysis including:

1. **Performance Assessment**: Is this query performing well or poorly? What are the key indicators?

2. **Root Cause Analysis**: What's causing the performance issues? Look at:
   - Index usage and efficiency
   - Document scanning vs. returning ratio
   - Sort operations and memory usage
   - Plan cache utilization

3. **Optimization Recommendations**: Specific actionable steps to improve performance:
   - Index suggestions (compound indexes, partial indexes, etc.)
   - Query restructuring recommendations
   - Schema design improvements
   - Configuration tuning suggestions

4. **Priority Assessment**: Rate the urgency of fixing this query (High/Medium/Low) and explain why.

5. **Expected Impact**: What performance improvements can be expected after optimization?

Please be specific, practical, and focus on actionable insights that a MongoDB administrator can implement.`;

    // Generate AI response using Gemini
    console.log('🤖 Calling Gemini API with model: gemini-1.5-flash');
    const result = await model.generateContent(prompt);
    const aiResponse = result.response.text();
    
    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('Empty response from Gemini API');
    }

    console.log('🎯 Generated AI response, saving to database');

    // Save the response to the database
    const responseDocument = {
      ...queryIdentifier,
      aiResponse,
      createdAt: new Date(),
      prompt: prompt.substring(0, 1000) + '...', // Store truncated prompt for debugging
      queryDetails: {
        originalQuery: query,
        metadata: {
          sourceFile,
          queryHash,
          numYields,
          timestamp: new Date()
        }
      }
    };

    await collection.insertOne(responseDocument);
    console.log('💾 AI response saved successfully');

    // Stream the new response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const words = aiResponse.split(' ');
        let index = 0;
        
        const streamChunk = () => {
          if (index < words.length) {
            // Stream multiple words at once for better markdown rendering
            const wordsPerChunk = 5;
            const chunk = words.slice(index, index + wordsPerChunk).join(' ') + ' ';
            controller.enqueue(encoder.encode(chunk));
            index += wordsPerChunk;
            setTimeout(streamChunk, 100); // Slightly longer delay for smoother appearance
          } else {
            controller.close();
          }
        };
        
        streamChunk();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });

  } catch (error) {
    console.error('Ask AI error:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Error generating AI response: ';
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        errorMessage += 'Invalid or missing Google AI API key. Please check your GOOGLE_AI_API_KEY environment variable.';
      } else if (error.message.includes('models/') || error.message.includes('not found')) {
        errorMessage += 'Model not available. The Gemini model may have been updated. Please check the latest model names.';
      } else if (error.message.includes('quota') || error.message.includes('limit')) {
        errorMessage += 'API quota exceeded. Please check your Google AI API usage limits.';
      } else {
        errorMessage += error.message;
      }
    } else {
      errorMessage += 'Unknown error occurred';
    }
    
    const encoder = new TextEncoder();
    
    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(errorMessage));
        controller.close();
      }
    });

    return new Response(errorStream, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}
