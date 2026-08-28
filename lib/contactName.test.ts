import { describe, it, expect } from 'vitest'
import { isLikelyPersonName, isPlaceholderContactName, shouldWriteContactName } from './contactName'

// Server-side guard: the AI call-transcription enrichment (telnyx/transcribe)
// and the inbound-SMS capture (contact-capture) must NEVER persist a sentence,
// phrase, or transcript fragment as a contact's name. All of them funnel their
// low-confidence value through isLikelyPersonName / shouldWriteContactName.

describe('isLikelyPersonName — rejects phrases / fragments', () => {
  for (const v of [
    'looking for', 'Looking for a filter', 'looking for advice',
    'I need help with my aquarium', 'Calling about order 123',
    'want to know', 'need a quote', 'is there a filter', 'can you help',
    'hello there', 'Hi', "I'm looking", '+61 423 971 867', 'order 456',
  ]) it(`rejects "${v}"`, () => expect(isLikelyPersonName(v)).toBe(false))
})

describe('isLikelyPersonName — accepts real names', () => {
  for (const v of [
    'Sarah Johnson', 'Michael', 'John Smith', 'ABC Plumbing',
    "O'Brien", 'Mary-Jane Watson', 'Will Turner', 'May Robinson', 'Grace Hopper',
  ]) it(`accepts "${v}"`, () => expect(isLikelyPersonName(v)).toBe(true))
})

describe('shouldWriteContactName — confidence / no-overwrite', () => {
  it('retains an existing real name against a low-confidence fragment', () => {
    expect(shouldWriteContactName('John Smith', 'looking for advice')).toBe(false)
    expect(shouldWriteContactName('John Smith', 'Sarah Johnson')).toBe(false)
  })
  it('fills a placeholder / blank with a valid name', () => {
    expect(shouldWriteContactName(null, 'Sarah Johnson')).toBe(true)
    expect(shouldWriteContactName('Visitor', 'Sarah Johnson')).toBe(true)
    expect(shouldWriteContactName('+61 423 971 867', 'Sarah Johnson')).toBe(true)
  })
  it('never fills with a phrase, even over a placeholder', () => {
    expect(shouldWriteContactName('Visitor', 'looking for')).toBe(false)
    expect(shouldWriteContactName(null, 'I need help')).toBe(false)
  })
  it('a trusted structured source bypasses the person-name heuristic', () => {
    expect(shouldWriteContactName('Visitor', 'ABC Plumbing & Gas', { trusted: true })).toBe(true)
    expect(shouldWriteContactName('Visitor', '+61 423 971 867', { trusted: true })).toBe(false)
  })
})

describe('isPlaceholderContactName', () => {
  it('flags placeholders and bare numbers', () => {
    for (const v of ['', 'Visitor', 'guest', 'Unknown', 'customer', 'No caller ID', '+61423971867'])
      expect(isPlaceholderContactName(v)).toBe(true)
  })
  it('does not flag a real name', () => {
    expect(isPlaceholderContactName('Sarah Johnson')).toBe(false)
  })
})
