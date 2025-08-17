import { NextRequest, NextResponse } from 'next/server';
import { getAskAiCollection } from '@/lib/mongodb';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
if (!process.env.GOOGLE_AI_API_KEY) {
  console.error('❌ GOOGLE_AI_API_KEY environment variable is not set');
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

// Use a consistent, available model.
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Helper function for retrying API calls with exponential backoff
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, initialDelay = 1000): Promise<T> {
  let delay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      // Only retry on 503 Service Unavailable errors
      if (error.message.includes('503') && i < retries - 1) {
        console.warn(`⚠️ API call failed with 503, retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
        const jitter = Math.random() * delay * 0.2;
        await new Promise(res => setTimeout(res, delay + jitter));
        delay *= 2; // Exponentially increase delay
      } else {
        throw error;
      }
    }
  }
  throw new Error("Retry logic failed unexpectedly.");
}

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
    const userEmail = request.headers.get('x-user-email'); 
    console.log("userEmail:", request.headers);
    const queryIdentifier = {
      sourceFile,
      userEmail,
      queryHash: queryHash || null,
      numYields: numYields || null,
      namespace: query.namespace || null,
      operation: query.operation || null,
      duration: query.duration || query.durationMillis || null
    };

    console.log('🔍 Checking for existing AI response for query:', queryIdentifier);

    const existingResponse = await collection.findOne(queryIdentifier);

    if (existingResponse) {
      console.log('✅ Found existing AI response, streaming cached result');
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const response = existingResponse.aiResponse || 'No response found';
          const words = response.split(' ');
          let index = 0;
          
          const streamChunk = () => {
            if (index < words.length) {
              const wordsPerChunk = 5;
              const chunk = words.slice(index, index + wordsPerChunk).join(' ') + ' ';
              controller.enqueue(encoder.encode(chunk));
              index += wordsPerChunk;
              setTimeout(streamChunk, 100);
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

    // **MODIFIED SECTION START**
    // This prompt uses cleaner, more standard Markdown for better rendering.
    const prompt = `<INSTRUCTIONS>
You are a world-class MongoDB Performance Engineer. Your task is to analyze a slow query log, identify the root cause, and provide actionable optimization recommendations.

Your response MUST be in Markdown and STRICTLY follow the structure in the <OUTPUT_TEMPLATE>. Do not add any commentary before or after the response.

Analyze the provided <QUERY_DATA> to fill out the template.
</INSTRUCTIONS>

<QUERY_DATA>
${JSON.stringify(query, null, 2)}
</QUERY_DATA>

<OUTPUT_TEMPLATE>
### Performance Assessment
**Status:** [Choose: EXCELLENT, GOOD, POOR, CRITICAL]
**Summary:** [2-3 sentence summary of the query's performance.]

---

### Key Metrics Analysis
- **Duration:** ${query.duration || query.durationMillis || 'N/A'} ms
- **Documents Examined vs. Returned:** ${query.docsExamined || 'N/A'} / ${query.docsReturned || 'N/A'}
- **Efficiency Ratio:** [Calculate docsExamined / docsReturned. If docsReturned is 0, state "N/A".]
- **Index Usage:** [Analyze \`planSummary\`. State if an index was used effectively (IXSCAN vs. COLLSCAN).]

---

### Root Cause Analysis
[Detailed analysis of WHY the query is slow, connecting the metrics to the problem. Explain how a high efficiency ratio or a SORT stage indicates a problem.]

---

### Optimization Recommendations
**1. Create Optimized Index (Priority: HIGH)**
- **Description:** An index is needed to cover the query's filter and sort criteria.
- **Command:**
\`\`\`javascript
db.getCollection('${query.namespace?.split('.')[1] || 'collection'}').createIndex({ /* field: 1, anotherField: -1 */ });
\`\`\`
- **Rationale:** [Explain why this index helps, referencing the ESR rule, sometimes ESR may not be applicable, so explain why it is not applicable in that case.]
- **Expected Impact:** Significant reduction in query duration and documents examined.

**2. Query Restructuring (If Applicable)**
- **Suggestion:** [If the query can be improved, describe the change. Otherwise, state "No restructuring needed." ]

---

### Expected Impact
- **Performance Improvement:** [Estimate improvement, e.g., ">90% reduction in latency".]
- **Resource Savings:** [Estimate savings, e.g., "Lower CPU and I/O usage." ]
</OUTPUT_TEMPLATE>
`;
    // **MODIFIED SECTION END**

    console.log(`🤖 Calling Gemini API with model: ${model.model}`);
    
    const result = await retryWithBackoff(() => model.generateContent(prompt));
    
    const response = result.response;
    const aiResponse = response.text();
    const usageMetadata = response.usageMetadata;
    const totalTokens = usageMetadata ? usageMetadata.totalTokenCount : 0;

    console.log(`🪙 Token usage: ${totalTokens} tokens (Prompt: ${usageMetadata?.promptTokenCount}, Response: ${usageMetadata?.candidatesTokenCount})`);
    
    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('Empty response from Gemini API');
    }

    const requiredSections = [
      '### Performance Assessment',
      '### Key Metrics Analysis',
      '### Root Cause Analysis',
      '### Optimization Recommendations',
      '### Expected Impact'
    ];

    const missingSection = requiredSections.find(section => !aiResponse.includes(section));
    if (missingSection) {
      console.warn(`⚠️ AI response missing expected section: ${missingSection}`);
    }

    console.log('✅ AI response format validation complete');
    console.log('🎯 Generated AI response, saving to database');

    const responseDocument = {
      ...queryIdentifier,
      aiResponse,
      createdAt: new Date(),
      rawsageMetadata:usageMetadata,
      tokenUsage: {
          promptTokens: usageMetadata?.promptTokenCount || 0,
          responseTokens: usageMetadata?.candidatesTokenCount || 0,
          totalTokens: totalTokens,
      },
      prompt: prompt.substring(0, 1000) + '...',
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

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const words = aiResponse.split(' ');
        let index = 0;
        
        const streamChunk = () => {
          if (index < words.length) {
            const wordsPerChunk = 5;
            const chunk = words.slice(index, index + wordsPerChunk).join(' ') + ' ';
            controller.enqueue(encoder.encode(chunk));
            index += wordsPerChunk;
            setTimeout(streamChunk, 100);
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
    
    let errorMessage = 'Error generating AI response: ';
    
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('api key')) {
            errorMessage += 'Invalid or missing Google AI API key.';
        } else if (message.includes('model') && message.includes('not found')) {
            errorMessage += 'Model not available. Please check the model name.';
        } else if (message.includes('quota') || message.includes('limit')) {
            errorMessage += 'API quota exceeded.';
        } else if (message.includes('billing')) {
            errorMessage += 'Billing issue. Please check your Google Cloud project billing status.';
        } else if (message.includes('503')) {
            errorMessage += 'The model is temporarily overloaded. Please try again later.';
        } else {
            errorMessage += error.message;
        }
    } else {
        errorMessage += 'An unknown error occurred.';
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