// Tool schemas the AI provider will accept.
//
// Every tool sent to the model carries an input_schema that must be a valid
// JSON Schema (draft 2020-12) with an object at the top. One bad schema fails
// the whole request ("tools.9.custom.input_schema: JSON schema is invalid"),
// so a single outside tool with an odd schema used to stop an agent outright.
//
// normaliseToolSchema() repairs the common slips that keep their meaning
// (OpenAPI's nullable, `required: true` on a property, "integer|string",
// tuple-style items, draft-4 exclusiveMinimum, a null description) and
// reports what it couldn't repair faithfully (a $ref to nothing, a type it
// doesn't know, a schema too deep or too large). guardTools() runs it on the
// whole tool list just before a request: Colvy's own tools are repaired (and
// logged — a test keeps them clean), outside tools that can't be repaired are
// left out with a logged reason, so the rest of the run still works.
//
// Pure: no Node or browser APIs, so the Agents page can use the error helpers.

export type ToolLike = { name: string; description?: string; input_schema: any }

export type SchemaReport = {
  /** The schema to send: the original when it was already valid. */
  schema: Record<string, any>
  /** Slips repaired without changing what the tool accepts. */
  fixes: string[]
  /** Problems that couldn't be repaired faithfully. Outside tools with any are left out. */
  lossy: string[]
  /** Keywords JSON Schema allows but the model ignores (dropped, not a problem). */
  stripped: string[]
}

const SIMPLE_TYPES = ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']
const TYPE_ALIASES: Record<string, { type: string; format?: string }> = {
  int: { type: 'integer' }, integer: { type: 'integer' }, long: { type: 'integer' }, int32: { type: 'integer' }, int64: { type: 'integer' },
  float: { type: 'number' }, double: { type: 'number' }, decimal: { type: 'number' }, number: { type: 'number' }, numeric: { type: 'number' },
  bool: { type: 'boolean' }, boolean: { type: 'boolean' },
  str: { type: 'string' }, string: { type: 'string' }, text: { type: 'string' },
  date: { type: 'string', format: 'date' }, datetime: { type: 'string', format: 'date-time' }, 'date-time': { type: 'string', format: 'date-time' },
  time: { type: 'string', format: 'time' }, email: { type: 'string', format: 'email' }, uri: { type: 'string', format: 'uri' }, url: { type: 'string', format: 'uri' }, uuid: { type: 'string', format: 'uuid' },
  object: { type: 'object' }, dict: { type: 'object' }, map: { type: 'object' }, record: { type: 'object' },
  array: { type: 'array' }, list: { type: 'array' },
  null: { type: 'null' }, none: { type: 'null' },
}

const STRING_KEYS = ['title', 'description', '$comment', 'format', 'contentEncoding', 'contentMediaType']
const NUMBER_KEYS = ['maximum', 'minimum']
const COUNT_KEYS = ['maxLength', 'minLength', 'maxItems', 'minItems', 'maxProperties', 'minProperties', 'maxContains', 'minContains']
const BOOL_KEYS = ['uniqueItems', 'readOnly', 'writeOnly', 'deprecated']
const SCHEMA_KEYS = ['additionalProperties', 'items', 'not', 'contains', 'propertyNames']
const SCHEMA_LIST_KEYS = ['allOf', 'anyOf', 'oneOf', 'prefixItems']
const SCHEMA_MAP_KEYS = ['properties', 'patternProperties', '$defs', 'definitions']
// Fine in JSON Schema, but they make a schema harder to resolve and the model
// doesn't need them: dropped quietly.
const QUIET_DROP = new Set(['$schema', '$id', 'id', '$anchor', '$dynamicAnchor', '$vocabulary', 'examples', 'example', 'discriminator', 'xml', 'externalDocs',
  'if', 'then', 'else', 'dependentSchemas', 'dependentRequired', 'dependencies', 'unevaluatedItems', 'unevaluatedProperties', 'additionalItems', 'contentSchema'])
const KNOWN = new Set([...STRING_KEYS, ...NUMBER_KEYS, ...COUNT_KEYS, ...BOOL_KEYS, ...SCHEMA_KEYS, ...SCHEMA_LIST_KEYS, ...SCHEMA_MAP_KEYS,
  'type', 'enum', 'const', 'default', 'required', 'pattern', 'multipleOf', 'exclusiveMaximum', 'exclusiveMinimum', '$ref', 'nullable', 'optional'])

const MAX_DEPTH = 24
const MAX_BYTES = 100_000

const isObj = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const isNum = (v: any) => typeof v === 'number' && Number.isFinite(v)
const validRegex = (p: string) => { try { new RegExp(p, 'u'); return true } catch { return false } }

function mapType(raw: any): { types: string[]; format?: string; unknown: string[] } {
  const parts: string[] = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[|,\s]+/) : [])
    .map((t: any) => String(t ?? '').trim().toLowerCase()).filter(Boolean)
  const types: string[] = []; const unknown: string[] = []; let format: string | undefined
  for (const p of parts) {
    if (p === 'any' || p === 'mixed') return { types: [], unknown: [] }   // "any" = no type limit
    const m = TYPE_ALIASES[p]
    if (!m) { unknown.push(p); continue }
    if (!types.includes(m.type)) types.push(m.type)
    if (m.format && !format) format = m.format
  }
  return { types, format, unknown }
}

/** Repair one tool's input_schema; see SchemaReport. */
export function normaliseToolSchema(input: any): SchemaReport {
  const fixes: string[] = [], lossy: string[] = [], stripped: string[] = []
  let size = 0
  let changed = false   // dropped something quietly ($schema, x-…): send the cleaned copy
  try { size = JSON.stringify(input ?? null).length } catch { lossy.push('the schema could not be read (circular)'); return { schema: { type: 'object', properties: {} }, fixes, lossy, stripped } }
  if (size > MAX_BYTES) lossy.push(`the schema is too large (${Math.round(size / 1000)} KB)`)

  const walk = (s: any, path: string, depth: number): any => {
    if (typeof s === 'boolean') return s
    if (typeof s === 'string' && TYPE_ALIASES[s.toLowerCase()]) {
      fixes.push(`${path}: a bare type name instead of a schema`)
      const m = TYPE_ALIASES[s.toLowerCase()]
      return m.format ? { type: m.type, format: m.format } : { type: m.type }
    }
    if (s === null || s === undefined) { fixes.push(`${path}: null instead of a schema`); return {} }
    if (!isObj(s)) { lossy.push(`${path}: not a schema (${Array.isArray(s) ? 'a list' : typeof s})`); return {} }
    if (depth > MAX_DEPTH) { lossy.push(`${path}: nested too deeply`); return {} }
    const out: Record<string, any> = {}

    for (const k of Object.keys(s)) {
      if (KNOWN.has(k)) continue
      changed = true
      if (k === '$dynamicRef') lossy.push(`${path}: $dynamicRef isn't supported`)
      else if (!QUIET_DROP.has(k) && !k.startsWith('x-')) stripped.push(`${path}.${k}`)
    }

    // type
    if ('type' in s && s.type !== undefined) {
      const { types, format, unknown } = mapType(s.type)
      const exact = typeof s.type === 'string' ? SIMPLE_TYPES.includes(s.type) : Array.isArray(s.type) && s.type.length > 0 && s.type.every((t: any) => SIMPLE_TYPES.includes(t)) && new Set(s.type).size === s.type.length
      if (unknown.length) lossy.push(`${path}: unknown type "${unknown.join('|')}"`)
      else if (!exact) fixes.push(`${path}: type ${JSON.stringify(s.type)}`)
      let t = types
      if (s.nullable === true && t.length && !t.includes('null')) t = [...t, 'null']
      if (t.length === 1) out.type = t[0]
      else if (t.length > 1) out.type = t
      if (format && !('format' in s)) out.format = format
    }
    if ('nullable' in s) fixes.push(`${path}: nullable (OpenAPI) instead of a "null" type`)
    if ('optional' in s) fixes.push(`${path}: optional (not JSON Schema)`)

    for (const k of STRING_KEYS) if (k in s) {
      if (typeof s[k] === 'string') out[k] = s[k]
      else if (s[k] != null && k !== 'format' && (typeof s[k] === 'number' || typeof s[k] === 'boolean')) { out[k] = String(s[k]); fixes.push(`${path}.${k}: not text`) }
      else fixes.push(`${path}.${k}: ${s[k] === null ? 'null' : 'not text'}`)
    }
    for (const k of NUMBER_KEYS) if (k in s) { if (isNum(s[k])) out[k] = s[k]; else fixes.push(`${path}.${k}: not a number`) }
    for (const k of ['exclusiveMaximum', 'exclusiveMinimum'] as const) if (k in s) {
      const base = k === 'exclusiveMaximum' ? 'maximum' : 'minimum'
      if (isNum(s[k])) out[k] = s[k]
      else if (s[k] === true && isNum(s[base])) { out[k] = s[base]; delete out[base]; fixes.push(`${path}.${k}: true (draft 4) instead of a number`) }
      else if (s[k] === false) fixes.push(`${path}.${k}: false (draft 4) instead of a number`)
      else fixes.push(`${path}.${k}: not a number`)
    }
    if ('multipleOf' in s) { if (isNum(s.multipleOf) && s.multipleOf > 0) out.multipleOf = s.multipleOf; else fixes.push(`${path}.multipleOf: not a positive number`) }
    for (const k of COUNT_KEYS) if (k in s) { if (Number.isInteger(s[k]) && s[k] >= 0) out[k] = s[k]; else fixes.push(`${path}.${k}: not a whole number`) }
    for (const k of BOOL_KEYS) if (k in s) { if (typeof s[k] === 'boolean') out[k] = s[k]; else fixes.push(`${path}.${k}: not true/false`) }
    if ('pattern' in s) { if (typeof s.pattern === 'string' && validRegex(s.pattern)) out.pattern = s.pattern; else fixes.push(`${path}.pattern: not a valid pattern`) }
    if ('enum' in s) {
      if (Array.isArray(s.enum) && s.enum.length) out.enum = s.enum
      else fixes.push(`${path}.enum: ${Array.isArray(s.enum) ? 'empty' : 'not a list'}`)
    }
    if ('const' in s) out.const = s.const
    if ('default' in s) out.default = s.default
    if ('$ref' in s) {
      if (typeof s.$ref === 'string' && (s.$ref === '#' || s.$ref.startsWith('#/'))) out.$ref = s.$ref
      else lossy.push(`${path}.$ref: ${typeof s.$ref === 'string' ? `points outside the schema (${s.$ref.slice(0, 80)})` : 'not text'}`)
    }

    for (const k of SCHEMA_KEYS) if (k in s) {
      if (k === 'items' && Array.isArray(s.items)) {
        // Tuple form (draft 4–2019) is prefixItems in 2020-12.
        fixes.push(`${path}.items: a list (old tuple form) instead of prefixItems`)
        if (s.items.length) out.prefixItems = s.items.map((x: any, i: number) => walk(x, `${path}.items[${i}]`, depth + 1))
        if ('additionalItems' in s) out.items = walk(s.additionalItems, `${path}.additionalItems`, depth + 1)
        continue
      }
      out[k] = walk(s[k], `${path}.${k}`, depth + 1)
    }
    for (const k of SCHEMA_LIST_KEYS) if (k in s) {
      if (Array.isArray(s[k]) && s[k].length) out[k] = s[k].map((x: any, i: number) => walk(x, `${path}.${k}[${i}]`, depth + 1))
      else if (k !== 'prefixItems' || !out.prefixItems) fixes.push(`${path}.${k}: ${Array.isArray(s[k]) ? 'empty' : 'not a list'}`)
    }

    // properties: `required: true` / `optional: true` on a property → the
    // object's required list.
    const req = new Set<string>()
    let reqFixed = false
    for (const k of SCHEMA_MAP_KEYS) if (k in s) {
      if (!isObj(s[k])) { fixes.push(`${path}.${k}: not an object`); continue }
      const m: Record<string, any> = {}
      for (const [name, sub] of Object.entries(s[k])) {
        if (k === 'patternProperties' && !validRegex(name)) { fixes.push(`${path}.patternProperties: "${name}" isn't a valid pattern`); continue }
        if (k === 'properties' && isObj(sub)) {
          if (typeof sub.required === 'boolean') { if (sub.required) req.add(name); reqFixed = true }
          if (sub.optional === false) req.add(name)
        }
        m[name] = walk(k === 'properties' && isObj(sub) && typeof sub.required === 'boolean' ? (({ required: _r, ...rest }) => rest)(sub) : sub, `${path}.${k}.${name}`, depth + 1)
      }
      out[k] = m
    }
    if (reqFixed) fixes.push(`${path}: required: true/false on a property instead of in the object's required list`)
    if ('required' in s) {
      const r = s.required
      if (Array.isArray(r)) {
        const clean = r.filter((x: any) => typeof x === 'string')
        if (clean.length !== r.length || new Set(clean).size !== clean.length) fixes.push(`${path}.required: not a list of unique names`)
        clean.forEach((x: string) => req.add(x))
      } else if (typeof r === 'string') { req.add(r); fixes.push(`${path}.required: a name instead of a list`) }
      else fixes.push(`${path}.required: ${typeof r === 'boolean' ? 'true/false instead of a list of names' : 'not a list'}`)
    }
    if (isObj(s.properties)) for (const [name, sub] of Object.entries(s.properties)) if (isObj(sub) && sub.optional === true) req.delete(name)
    if (req.size) out.required = Array.from(req)
    return out
  }

  let schema = walk(input, 'schema', 0)
  if (schema === true || schema === false || !isObj(schema)) { lossy.push('the top of the schema must be an object'); schema = { type: 'object', properties: {} } }
  if (schema.type !== 'object') {
    if (schema.type == null && !schema.$ref && !schema.anyOf && !schema.oneOf && !schema.allOf) { schema.type = 'object'; fixes.push('schema: no type at the top (an object)') }
    else lossy.push(`the top of the schema must be an object, not ${JSON.stringify(schema.type ?? 'a reference')}`)
  }
  if (schema.type === 'object' && !isObj(schema.properties)) schema.properties = {}

  // Every $ref must point at something that's still in the schema.
  const resolve = (ref: string): boolean => {
    if (ref === '#') return true
    let cur: any = schema
    for (const raw of ref.slice(2).split('/')) {
      const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~')
      if (cur && typeof cur === 'object' && key in cur) cur = cur[key]
      else return false
    }
    return typeof cur === 'boolean' || isObj(cur)
  }
  const checkRefs = (s: any, path: string) => {
    if (Array.isArray(s)) { s.forEach((x, i) => checkRefs(x, `${path}[${i}]`)); return }
    if (!isObj(s)) return
    if (typeof s.$ref === 'string' && !resolve(s.$ref)) { lossy.push(`${path}.$ref: "${s.$ref.slice(0, 80)}" points at nothing`); delete s.$ref }
    for (const [k, v] of Object.entries(s)) if (k !== 'enum' && k !== 'const' && k !== 'default') checkRefs(v, `${path}.${k}`)
  }
  checkRefs(schema, 'schema')

  // Already valid: send exactly what we were given.
  const clean = !changed && !fixes.length && !lossy.length && !stripped.length
  return { schema: clean && isObj(input) ? input : schema, fixes, lossy, stripped }
}

/** Why this schema isn't valid as it stands ([] when it is). `strict` also counts keywords the model ignores. */
export function schemaProblems(schema: any, opts: { strict?: boolean } = {}): string[] {
  const r = normaliseToolSchema(schema)
  return [...r.lossy, ...r.fixes, ...(opts.strict ? r.stripped.map(p => `${p}: not a JSON Schema keyword`) : [])]
}

/** One plain reason an outside tool can't be used, or null when it can (possibly after repairs). */
export function toolSchemaProblem(schema: any): string | null {
  const r = normaliseToolSchema(schema)
  return r.lossy.length ? r.lossy[0] : null
}

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/

// Logged once per tool and reason every 10 minutes — not on every step.
const logged = new Map<string, number>()
function logOnce(key: string, msg: string, at = Date.now()) {
  const last = logged.get(key) || 0
  if (at - last < 600_000) return
  logged.set(key, at)
  if (logged.size > 2000) logged.clear()
  console.warn(msg)
}

export type GuardResult<T> = { tools: T[]; dropped: { name: string; reason: string }[]; repaired: { name: string; fixes: string[] }[] }

/**
 * Check every tool right before a model request. Valid tools pass through
 * untouched; repairable ones are sent repaired; outside tools (isOutside) that
 * can't be repaired faithfully, or with an unusable name, are left out with a
 * logged reason. Colvy's own tools are always kept (repaired as best we can).
 */
export function guardTools<T extends ToolLike>(tools: T[] | undefined, opts: { isOutside?: (name: string) => boolean; where?: string } = {}): GuardResult<T> {
  const out: T[] = [], dropped: GuardResult<T>['dropped'] = [], repaired: GuardResult<T>['repaired'] = []
  const seen = new Set<string>()
  const where = opts.where ? ` (${opts.where})` : ''
  for (const t of tools || []) {
    const name = String(t?.name ?? '')
    const outside = !!opts.isOutside?.(name)
    if (!NAME_RE.test(name) || seen.has(name)) {
      const reason = seen.has(name) ? 'a second tool with the same name' : 'the name has characters the model can’t use'
      dropped.push({ name, reason })
      logOnce(`name:${name}`, `[agent tools] left out "${name}"${where}: ${reason}`)
      continue
    }
    const r = normaliseToolSchema(t.input_schema)
    if (r.lossy.length && outside) {
      dropped.push({ name, reason: r.lossy[0] })
      logOnce(`drop:${name}:${r.lossy[0]}`, `[agent tools] left out outside tool "${name}"${where}: its input schema is invalid — ${r.lossy.slice(0, 3).join('; ')}`)
      continue
    }
    seen.add(name)
    const problems = [...r.lossy, ...r.fixes]
    if (problems.length) {
      repaired.push({ name, fixes: problems })
      logOnce(`fix:${name}:${problems[0]}`, outside
        ? `[agent tools] repaired outside tool "${name}"${where}: ${problems.slice(0, 3).join('; ')}`
        : `[agent tools] Colvy tool "${name}" had an invalid schema${where} and was repaired: ${problems.slice(0, 3).join('; ')}`)
    }
    out.push(r.schema === t.input_schema && typeof t.description === 'string' ? t : { ...t, description: String(t.description ?? ''), input_schema: r.schema })
  }
  return { tools: out, dropped, repaired }
}

// ── Errors people read ───────────────────────────────────────────────────────

/** The index of the tool a provider error blames ("tools.9.custom.input_schema…"), or null. */
export function toolIndexFromError(message: string): number | null {
  const m = /tools\.(\d+)\.(?:custom\.)?input_schema/.exec(String(message || ''))
  return m ? Number(m[1]) : null
}

/**
 * Turn a raw model/provider error into something an owner can act on. `toolName`
 * maps a tool index to the name people know it by.
 */
export function friendlyRunError(raw: string, toolName?: (index: number) => string | null): string {
  const msg = String(raw || '')
  const i = toolIndexFromError(msg)
  if (i != null) {
    const name = toolName?.(i)
    return name ? `A tool's settings are invalid: ${name}` : 'A tool’s settings are invalid, so the agent couldn’t start. Check the outside tools connected to this agent.'
  }
  // A provider error carries its JSON body ("400 {"type":"error",…}") — show the message, not the JSON.
  const jsonAt = msg.indexOf('{')
  if (jsonAt >= 0 && /"type"\s*:\s*"error"/.test(msg)) {
    try {
      const body = JSON.parse(msg.slice(jsonAt))
      const inner = body?.error?.message
      if (typeof inner === 'string' && inner) return `The AI service turned the request down: ${inner.slice(0, 200)}`
    } catch { /* not JSON after all */ }
    return 'The AI service turned the request down.'
  }
  return msg
}
