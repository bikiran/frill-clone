// Colvy AI working in a note (lib/note-ai): the change, its Undo, and the
// "Assisted by Colvy AI" mark. Made-up notes only.
//
//   npx tsx scripts/note-ai.test.mjs

const N = await import('../lib/note-ai.ts')

let failures = 0
const ok = (cond, name, extra) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)) } }

const note = () => ({
  title: 'Coburg to Preston', body: '<p>Move on Friday.</p>', reminder_at: null, tags: ['transfer'],
  checklist: [
    { id: 'a', text: 'UV canister filter', done: false, qty: 10 },
    { id: 'b', text: 'Aquarium 120cm x 45cm x 60cm', done: true },
    { id: 'c', text: 'Lids for the smallest boxes', done: false },
  ],
})

console.log('finding an item')
const list = note().checklist
ok(N.findItem(list, 'b')?.id === 'b', 'by its id')
ok(N.findItem(list, '3')?.id === 'c' && N.findItem(list, '#1')?.id === 'a', 'by its number in the list')
ok(N.findItem(list, 'lids for the smallest boxes')?.id === 'c', 'by its text, any case')
ok(N.findItem(list, 'canister')?.id === 'a', 'by part of its text when only one matches')
ok(N.findItem([...list, { id: 'd', text: 'Canister hose', done: false }], 'canister') === null, 'not a guess when two match')

console.log('the change')
let n = note()
let r = N.applyNoteChange(n, { addItems: ['120cm x 35cm pine stand'] })
ok(r.patch.checklist?.length === 4 && r.patch.checklist[3].text === '120cm x 35cm pine stand' && r.patch.checklist[3].ai === true && !r.patch.checklist[3].done, 'adds an item, marked as added by Colvy AI', r.patch.checklist)
ok(r.undo.addedIds.length === 1 && r.done[0] === 'Added: 120cm x 35cm pine stand', 'and says what it did', r.done)
r = N.applyNoteChange(n, { addItems: ['lids for the smallest boxes', 'Silicone', 'silicone'] })
ok(r.patch.checklist?.length === 4 && r.done.some(d => d.startsWith('Already on the list')), 'never adds an item twice', r)
r = N.applyNoteChange(n, { tickItems: ['UV canister filter', '3'], untickItems: ['2'] })
const by = id => r.patch.checklist.find(i => i.id === id)
ok(by('a').done && by('c').done && !by('b').done, 'ticks by text and number, unticks', r.patch.checklist)
r = N.applyNoteChange(n, { removeItems: ['2'], flagItems: ['1'] })
ok(r.patch.checklist.length === 2 && r.patch.checklist[0].flagged && r.undo.removed[0].index === 1, 'removes and flags', r)
r = N.applyNoteChange(n, { appendText: 'Van booked\nfor 9am', title: 'Coburg → Preston', reminderAt: '2026-11-20T09:00:00+11:00', addTags: ['#van', 'transfer'] })
ok(r.patch.body === '<p>Move on Friday.</p><p>Van booked</p><p>for 9am</p>', 'adds text as paragraphs', r.patch.body)
ok(r.patch.title === 'Coburg → Preston' && r.patch.reminder_at && r.patch.tags.join() === 'transfer,van', 'renames, sets a reminder, adds only new tags', r.patch)
r = N.applyNoteChange(n, { tickItems: ['the gravel'] })
ok(!Object.keys(r.patch).length && r.missing[0] === 'the gravel', 'an item that isn’t there changes nothing and is reported', r)
r = N.applyNoteChange(n, { appendText: '<b>hi</b>' })
ok(r.patch.body.endsWith('<p>&lt;b&gt;hi&lt;/b&gt;</p>'), 'text is never taken as markup')

console.log('Undo')
{
  const before = note()
  const { patch, undo } = N.applyNoteChange(before, { addItems: ['Pine stand'], tickItems: ['1'], removeItems: ['Lids for the smallest boxes'], flagItems: ['2'], appendText: 'Van booked', title: 'New name', addTags: ['van'] })
  const after = { ...before, ...patch }
  const back = { ...after, ...N.revertNoteChange(after, undo) }
  ok(JSON.stringify(back.checklist.map(i => [i.id, i.done, !!i.flagged])) === JSON.stringify(before.checklist.map(i => [i.id, i.done, !!i.flagged])), 'puts the checklist back exactly (added gone, tick and flag undone, removed item back in its place)', back.checklist)
  ok(back.body === before.body && back.title === before.title && back.tags.join() === 'transfer', 'text, title and tags back', back)
}
{
  const before = note()
  const { patch, undo } = N.applyNoteChange(before, { addItems: ['Pine stand'], tickItems: ['1'], title: 'New name' })
  // Someone keeps working after Colvy AI: adds an item, unticks the filter, renames the note.
  const after = { ...before, ...patch }
  after.checklist = [...after.checklist.map(i => i.id === 'a' ? { ...i, done: false } : i), { id: 'z', text: 'Silicone', done: false }]
  after.title = 'Renamed by a person'
  const back = { ...after, ...N.revertNoteChange(after, undo) }
  ok(back.checklist.some(i => i.id === 'z') && !back.checklist.some(i => i.text === 'Pine stand'), 'keeps what a person added since, takes back only its own item', back.checklist)
  ok(back.checklist.find(i => i.id === 'a').done === false, 'leaves an item a person changed since', back.checklist)
  ok(back.title === 'Renamed by a person', 'leaves a title a person changed since')
}

console.log('Assisted by Colvy AI')
{
  const log = [{ name: 'Robin Park', at: '2026-11-14T01:00:00Z' }, N.aiLogEntry('Casey', 'Added: Pine stand', '2026-11-15T01:00:00Z'), N.aiLogEntry('Casey', 'Ticked: Lids', '2026-11-15T02:00:00Z')]
  const a = N.aiAssist(log)
  ok(a && a.what === 'Ticked: Lids' && a.by === 'Casey' && a.count === 2, 'the latest thing Colvy AI did, and for whom', a)
  ok(N.aiAssist([{ name: 'Robin Park', at: 'x' }]) === null, 'nothing when Colvy AI never touched it')
  ok(N.peopleEdits(log).length === 1 && N.peopleEdits(log)[0].name === 'Robin Park', 'people’s edits leave Colvy AI’s out')
  ok(N.aiLogEntry('Casey', 'x').ai === true && N.aiLogEntry('Casey', 'x').name === 'Colvy AI', 'entries are marked as Colvy AI’s')
}
ok(N.htmlToText('<p>One</p><p>Two &amp; three</p>') === 'One\nTwo & three', 'a note body read as text')

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
