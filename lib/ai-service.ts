// lib/ai-service.ts
// Lazy-load Anthropic SDK to prevent build failures if not installed
let Anthropic: any = null

try {
  // This will only fail at runtime if SDK isn't installed
  Anthropic = require('@anthropic-ai/sdk').default
} catch (e) {
  console.warn('Anthropic SDK not installed. AI features will not work. Run: npm install @anthropic-ai/sdk')
}

export type AIProvider = 'claude' | 'openai' | 'gemini'
export type AITask = 'improve_writing' | 'summarize' | 'fix_formatting' | 'suggest_tags' | 'write_help_article' | 'build_form' | 'create_poll' | 'create_survey'

interface AIServiceConfig {
  provider: AIProvider
  apiKey?: string
  model?: string
}

export class AIService {
  private provider: AIProvider
  private anthropic: any = null
  private model: string
  private isAvailable: boolean = false

  constructor(config: AIServiceConfig = {}) {
    this.provider = config.provider || 'claude'
    this.model = config.model || 'claude-opus-4-1'  // Valid Anthropic model

    if (this.provider === 'claude') {
      if (!Anthropic) {
        throw new Error('Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk')
      }
      
      const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable not set')
      }

      this.anthropic = new Anthropic({ apiKey })
      this.isAvailable = true
    }
  }

  private ensureAvailable() {
    if (!this.isAvailable || !this.anthropic) {
      throw new Error('Claude AI service not available. Check that Anthropic SDK is installed and API key is set.')
    }
  }

  async improveWriting(text: string, tone: 'professional' | 'casual' | 'persuasive' = 'professional'): Promise<string> {
    this.ensureAvailable()

    const message = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Improve the following text to be more ${tone}. Maintain the original meaning but enhance clarity and impact. Return only the improved text, no explanations.\n\nText: ${text}`
        }
      ]
    })

    return message.content[0].type === 'text' ? message.content[0].text : ''
  }

  async summarize(text: string, maxLength: number = 150): Promise<string> {
    this.ensureAvailable()

    const message = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Summarize the following text in ${maxLength} characters or less. Return only the summary, no explanations.\n\nText: ${text}`
        }
      ]
    })

    return message.content[0].type === 'text' ? message.content[0].text : ''
  }

  async fixFormatting(text: string): Promise<string> {
    this.ensureAvailable()

    const message = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Fix the formatting of the following text. Correct grammar, punctuation, spacing, and structure. Return only the formatted text, no explanations.\n\nText: ${text}`
        }
      ]
    })

    return message.content[0].type === 'text' ? message.content[0].text : ''
  }

  async suggestTags(text: string, maxTags: number = 5): Promise<string[]> {
    this.ensureAvailable()

    const message = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Based on the following text, suggest ${maxTags} relevant tags as a JSON array of strings. Return only the JSON array, no explanations.\n\nText: ${text}`
        }
      ]
    })

    try {
      const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
      const match = text.match(/\[.*\]/s)
      return JSON.parse(match ? match[0] : '[]')
    } catch {
      return []
    }
  }

  async writeHelpArticle(topic: string, details: string): Promise<{ title: string; content: string }> {
    this.ensureAvailable()

    const message = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Write a help center article about: ${topic}\n\nDetails: ${details}\n\nReturn JSON with "title" and "content" fields. Make it clear, step-by-step, and user-friendly.`
        }
      ]
    })

    try {
      const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
      const match = text.match(/\{.*\}/s)
      return JSON.parse(match ? match[0] : '{}')
    } catch {
      return { title: topic, content: details }
    }
  }

  async buildForm(description: string): Promise<{ fields: Array<{ label: string; type: string; required: boolean }> }> {
    this.ensureAvailable()

    const message = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Design a form based on this description: ${description}\n\nReturn JSON with a "fields" array, each with label, type (text/email/number/textarea/select/checkbox), and required (boolean).`
        }
      ]
    })

    try {
      const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
      const match = text.match(/\{.*\}/s)
      return JSON.parse(match ? match[0] : '{}')
    } catch {
      return { fields: [] }
    }
  }

  async createPoll(question: string): Promise<{ question: string; options: string[] }> {
    this.ensureAvailable()

    const message = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Create poll options for this question: ${question}\n\nReturn JSON with "question" and "options" (array of 2-5 strings). Make them distinct and balanced.`
        }
      ]
    })

    try {
      const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
      const match = text.match(/\{.*\}/s)
      return JSON.parse(match ? match[0] : { question, options: [] })
    } catch {
      return { question, options: [] }
    }
  }

  async createSurvey(topic: string): Promise<{ questions: Array<{ title: string; type: 'text' | 'single_choice' | 'multiple_choice' | 'rating'; options?: string[] }> }> {
    this.ensureAvailable()

    const message = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Create a survey about: ${topic}\n\nReturn JSON with "questions" array, each with title, type (text/single_choice/multiple_choice/rating), and optional options array.`
        }
      ]
    })

    try {
      const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
      const match = text.match(/\{.*\}/s)
      return JSON.parse(match ? match[0] : { questions: [] })
    } catch {
      return { questions: [] }
    }
  }
}

export const createAIService = (config?: AIServiceConfig) => new AIService(config)
