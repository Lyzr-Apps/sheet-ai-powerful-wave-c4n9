import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/onemin
 *
 * Proxies requests to the 1min.ai API.
 * Expects body: { apiKey, model, type, promptObject }
 * The API key is passed from the client (user-configured) since this is a personal tool.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { apiKey, model, type, promptObject } = body

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'API key is required. Configure it in Settings.' },
        { status: 400 }
      )
    }

    if (!promptObject?.prompt) {
      return NextResponse.json(
        { success: false, error: 'prompt is required in promptObject' },
        { status: 400 }
      )
    }

    const payload = {
      type: type || 'CONTENT_GENERATOR_EMAIL',
      model: model || 'gpt-4o',
      conversationId: type || 'CONTENT_GENERATOR_EMAIL',
      promptObject: {
        tone: promptObject.tone || 'professional',
        language: promptObject.language || 'English',
        prompt: promptObject.prompt,
      },
    }

    const response = await fetch('https://api.1min.ai/api/features', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-KEY': apiKey,
      },
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()

    if (!response.ok) {
      let errorMsg = `1min.ai API returned status ${response.status}`
      try {
        const errorData = JSON.parse(responseText)
        errorMsg = errorData?.message || errorData?.error || errorData?.detail || errorMsg
      } catch {
        // Use status-based message
      }
      return NextResponse.json(
        { success: false, error: errorMsg, status: response.status },
        { status: response.status }
      )
    }

    // Parse the response
    let data: any
    try {
      data = JSON.parse(responseText)
    } catch {
      // If not JSON, treat the raw text as the result
      data = { result: responseText }
    }

    // Extract the generated content from the response
    // 1min.ai may return different structures; handle common patterns
    let outputText = ''

    if (typeof data === 'string') {
      outputText = data
    } else if (data?.result && typeof data.result === 'string') {
      outputText = data.result
    } else if (data?.aiRecord?.aiRecordDetail?.result) {
      // Common 1min.ai response structure
      const result = data.aiRecord.aiRecordDetail.result
      if (typeof result === 'string') {
        outputText = result
      } else if (Array.isArray(result)) {
        // Sometimes result is an array of content blocks
        outputText = result
          .map((block: any) => {
            if (typeof block === 'string') return block
            if (block?.text) return block.text
            if (block?.content) return block.content
            return JSON.stringify(block)
          })
          .join('\n')
      } else if (typeof result === 'object') {
        outputText = result.text || result.content || result.message || JSON.stringify(result)
      }
    } else if (data?.response) {
      outputText = typeof data.response === 'string' ? data.response : JSON.stringify(data.response)
    } else if (data?.content) {
      outputText = typeof data.content === 'string' ? data.content : JSON.stringify(data.content)
    } else if (data?.message) {
      outputText = typeof data.message === 'string' ? data.message : JSON.stringify(data.message)
    } else if (data?.text) {
      outputText = data.text
    } else if (data?.output) {
      outputText = typeof data.output === 'string' ? data.output : JSON.stringify(data.output)
    } else {
      // Fallback: stringify the whole response
      outputText = JSON.stringify(data)
    }

    return NextResponse.json({
      success: true,
      output: outputText,
      raw: data,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    )
  }
}
