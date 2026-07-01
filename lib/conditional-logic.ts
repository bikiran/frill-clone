/**
 * Conditional Logic Evaluator
 * Evaluates whether questions should be shown/hidden based on previous answers
 */

export type Condition = {
  condition: 'show' | 'hide'
  rules: Array<{
    questionId: string
    operator: 'equals' | 'contains' | 'is_empty'
    value: string
  }>
  logic: 'all' | 'any'
}

export function shouldShowQuestion(
  questionId: string,
  answers: Record<string, any>,
  questions: any[],
  conditionalLogic?: Condition
): boolean {
  if (!conditionalLogic || !conditionalLogic.rules || conditionalLogic.rules.length === 0) {
    return true
  }

  const { condition, rules, logic } = conditionalLogic

  // Evaluate all rules
  const ruleResults = rules.map(rule => evaluateRule(rule, answers))

  // Combine results based on logic (all/any)
  const conditionMet = logic === 'all' 
    ? ruleResults.every(r => r)
    : ruleResults.some(r => r)

  // Apply show/hide logic
  return condition === 'show' ? conditionMet : !conditionMet
}

function evaluateRule(
  rule: { questionId: string; operator: string; value: string },
  answers: Record<string, any>
): boolean {
  const answer = answers[rule.questionId]

  switch (rule.operator) {
    case 'equals':
      return String(answer) === String(rule.value)
    
    case 'contains':
      if (Array.isArray(answer)) {
        return answer.some(a => String(a).includes(rule.value))
      }
      return String(answer).includes(rule.value)
    
    case 'is_empty':
      return !answer || (Array.isArray(answer) && answer.length === 0) || String(answer).trim() === ''
    
    default:
      return true
  }
}

export function getVisibleQuestions(
  questions: any[],
  answers: Record<string, any>
): any[] {
  return questions.filter(q => shouldShowQuestion(q.id, answers, questions, q.conditional_logic))
}
