/**
 * Question Piping Utility
 * Allows referencing previous answers in question text/title
 * 
 * Syntax: {previous_answer:question_id}
 * Example: "Hello {previous_answer:q1}, what's your favorite..."
 */

export function getPipedText(text: string, answers: Record<string, string>): string {
  let result = text
  const pipeRegex = /\{previous_answer:([^}]+)\}/g
  
  result = result.replace(pipeRegex, (match, questionId) => {
    return answers[questionId] || match
  })
  
  return result
}

export function extractPipedQuestionIds(text: string): string[] {
  const pipeRegex = /\{previous_answer:([^}]+)\}/g
  const ids: string[] = []
  let match
  
  while ((match = pipeRegex.exec(text)) !== null) {
    if (!ids.includes(match[1])) {
      ids.push(match[1])
    }
  }
  
  return ids
}

export function createPipeTemplate(questionId: string): string {
  return `{previous_answer:${questionId}}`
}
