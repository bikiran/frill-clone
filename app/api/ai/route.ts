import { NextRequest, NextResponse } from 'next/server'
import { createAIService } from '@/lib/ai-service'

export async function POST(req: NextRequest) {
  try {
    const { task, text, tone, maxLength, maxTags, topic, details, description, question } = await req.json()

    if (!task) {
      return NextResponse.json({ error: 'Missing task parameter' }, { status: 400 })
    }

    try {
      const ai = createAIService()

      switch (task) {
        case 'improve_writing':
          if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 })
          const improved = await ai.improveWriting(text, tone)
          return NextResponse.json({ result: improved })

        case 'summarize':
          if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 })
          const summary = await ai.summarize(text, maxLength)
          return NextResponse.json({ result: summary })

        case 'fix_formatting':
          if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 })
          const formatted = await ai.fixFormatting(text)
          return NextResponse.json({ result: formatted })

        case 'suggest_tags':
          if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 })
          const tags = await ai.suggestTags(text, maxTags)
          return NextResponse.json({ result: tags })

        case 'write_help_article':
          if (!topic) return NextResponse.json({ error: 'Missing topic' }, { status: 400 })
          const article = await ai.writeHelpArticle(topic, details || '')
          return NextResponse.json({ result: article })

        case 'build_form':
          if (!description) return NextResponse.json({ error: 'Missing description' }, { status: 400 })
          const form = await ai.buildForm(description)
          return NextResponse.json({ result: form })

        case 'create_poll':
          if (!question) return NextResponse.json({ error: 'Missing question' }, { status: 400 })
          const poll = await ai.createPoll(question)
          return NextResponse.json({ result: poll })

        case 'create_survey':
          if (!topic) return NextResponse.json({ error: 'Missing topic' }, { status: 400 })
          const survey = await ai.createSurvey(topic)
          return NextResponse.json({ result: survey })

        default:
          return NextResponse.json({ error: 'Unknown task' }, { status: 400 })
      }
    } catch (serviceError: any) {
      if (serviceError.message.includes('Anthropic SDK not installed')) {
        return NextResponse.json({
          error: 'AI features not configured. Please run: npm install @anthropic-ai/sdk and set ANTHROPIC_API_KEY'
        }, { status: 503 })
      }
      if (serviceError.message.includes('ANTHROPIC_API_KEY')) {
        return NextResponse.json({
          error: 'ANTHROPIC_API_KEY environment variable not set'
        }, { status: 503 })
      }
      throw serviceError
    }
  } catch (error: any) {
    console.error('AI API error:', error)
    return NextResponse.json(
      { error: error.message || 'AI service error' },
      { status: 500 }
    )
  }
}

