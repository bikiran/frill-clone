// Form Templates - Pre-built forms users can clone
export const FORM_TEMPLATES = [
  {
    id: 'customer-feedback',
    name: 'Customer Feedback',
    description: 'Collect structured feedback from customers',
    icon: '📝',
    questions: [
      {
        id: 'q1',
        type: 'rating',
        title: 'How satisfied are you with our product?',
        required: true,
      },
      {
        id: 'q2',
        type: 'text',
        title: 'What could we improve?',
        description: 'Tell us what we could do better',
        required: false,
      },
      {
        id: 'q3',
        type: 'text',
        title: 'Your email',
        description: 'So we can follow up with you',
        required: false,
      },
    ],
  },
  {
    id: 'product-launch',
    name: 'Product Launch Survey',
    description: 'Gather feedback on a new product launch',
    icon: '🚀',
    questions: [
      {
        id: 'q1',
        type: 'text',
        title: 'What is your name?',
        required: true,
      },
      {
        id: 'q2',
        type: 'email',
        title: 'Your email address',
        required: true,
      },
      {
        id: 'q3',
        type: 'multiple_choice',
        title: 'What features are most important to you?',
        options: ['Feature A', 'Feature B', 'Feature C'],
        required: true,
      },
      {
        id: 'q4',
        type: 'rating',
        title: 'How likely are you to recommend this?',
        required: true,
      },
      {
        id: 'q5',
        type: 'text',
        title: 'Any additional feedback?',
        required: false,
      },
    ],
  },
  {
    id: 'job-application',
    name: 'Job Application',
    description: 'Screen job candidates efficiently',
    icon: '💼',
    questions: [
      {
        id: 'q1',
        type: 'text',
        title: 'Full name',
        required: true,
      },
      {
        id: 'q2',
        type: 'email',
        title: 'Email address',
        required: true,
      },
      {
        id: 'q3',
        type: 'text',
        title: 'Years of experience',
        required: true,
      },
      {
        id: 'q4',
        type: 'checkbox',
        title: 'Which technologies are you proficient with?',
        options: ['JavaScript', 'Python', 'React', 'Node.js', 'SQL'],
        required: true,
      },
      {
        id: 'q5',
        type: 'text',
        title: 'Portfolio or GitHub URL',
        required: false,
      },
    ],
  },
  {
    id: 'nps-survey',
    name: 'NPS Survey',
    description: 'Measure Net Promoter Score',
    icon: '📊',
    questions: [
      {
        id: 'q1',
        type: 'rating',
        title: 'How likely are you to recommend us to a friend?',
        description: '0 = Not at all likely, 10 = Extremely likely',
        required: true,
      },
      {
        id: 'q2',
        type: 'text',
        title: 'What is the main reason for your score?',
        required: true,
      },
      {
        id: 'q3',
        type: 'text',
        title: 'What could we do to improve your experience?',
        required: false,
      },
    ],
  },
  {
    id: 'event-registration',
    name: 'Event Registration',
    description: 'Register attendees for events',
    icon: '🎫',
    questions: [
      {
        id: 'q1',
        type: 'text',
        title: 'Full name',
        required: true,
      },
      {
        id: 'q2',
        type: 'email',
        title: 'Email address',
        required: true,
      },
      {
        id: 'q3',
        type: 'text',
        title: 'Company',
        required: false,
      },
      {
        id: 'q4',
        type: 'multiple_choice',
        title: 'Which sessions are you interested in?',
        options: ['Keynote', 'Workshop A', 'Workshop B', 'Networking'],
        required: true,
      },
      {
        id: 'q5',
        type: 'checkbox',
        title: 'Dietary requirements',
        options: ['Vegetarian', 'Vegan', 'Gluten-free', 'None'],
        required: false,
      },
    ],
  },
]

export function getTemplate(id: string) {
  return FORM_TEMPLATES.find(t => t.id === id)
}
