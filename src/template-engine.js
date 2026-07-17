/**
 * template-engine.js
 *
 * Interpolates {{variable}} and {{variable|filter}} expressions in a
 * HyperMD template source string, given a context object representing
 * one query result item.
 *
 * Design principle: this is purely a string substitution step that runs
 * BEFORE HyperMD parsing, not a post-parse tree transform. This means:
 *  - Full HyperMD syntax (**bold**, :::panel, ::button) works inside
 *    templates because the output is re-parsed as real HyperMD
 *  - Template expressions can appear anywhere in the source, including
 *    inside directive attributes: :::panel{id=post-{{entity.id}}}
 *  - Unknown expressions are left as empty strings (not {{ literal }})
 *    so a typo in a variable name produces a visible empty gap rather
 *    than broken-looking template syntax in the output
 *
 * Context shape (one query result item):
 *   entity:    { id, type, author, createdAt }
 *   content:   { body, contentType } | null
 *   tags:      string[]
 *   relations: { [type]: { count: number, items: object[] } }
 *   index:     number  (0-based position in result set)
 *   route:     { id, ... }  (current page route params)
 */

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Interpolate all {{...}} expressions in a template source string.
 *
 * @param {string} templateSource - raw HyperMD with {{expr}} holes
 * @param {object} context        - item context (see file header)
 * @returns {string}              - HyperMD source ready to parse
 */
export function interpolate(templateSource, context) {
  return templateSource.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const [path, ...filterParts] = expr.trim().split('|')
    const raw = resolvePath(path.trim(), context)
    return applyFilters(raw, filterParts.map(f => f.trim()))
  })
}

// ─── Path resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a dotted path expression against the context.
 * Examples:
 *   "entity.author"       → context.entity.author
 *   "content.body"        → context.content?.body ?? ''
 *   "relations.reply.count" → context.relations?.reply?.count ?? 0
 *   "tags"                → context.tags joined as space-separated string
 *   "tag:sub:"            → first tag with prefix "sub:", prefix stripped
 *   "index"               → context.index
 *   "route.id"            → context.route?.id ?? ''
 */
function resolvePath(path, context) {
  // Special: tag:prefix — first matching tag with prefix stripped
  if (path.startsWith('tag:')) {
    const prefix = path.slice(4)
    const match = (context.tags ?? []).find(t => t.startsWith(prefix))
    return match ? match.slice(prefix.length) : ''
  }

  // Special: tags — all tags as a space-separated string
  if (path === 'tags') {
    return (context.tags ?? []).join(' ')
  }

  // General dotted path
  const parts = path.split('.')
  let val = context
  for (const part of parts) {
    if (val == null) return ''
    val = val[part]
  }

  if (val == null) return ''
  return String(val)
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function applyFilters(value, filters) {
  let out = value
  for (const filter of filters) {
    out = applyFilter(out, filter)
  }
  return out
}

function applyFilter(value, filter) {
  // Filters with arguments: filtername:arg
  const colonIdx = filter.indexOf(':')
  const name = colonIdx >= 0 ? filter.slice(0, colonIdx) : filter
  const arg  = colonIdx >= 0 ? filter.slice(colonIdx + 1) : ''

  switch (name) {
    case 'truncate': {
      const n = parseInt(arg, 10) || 100
      return value.length > n ? value.slice(0, n) + '…' : value
    }

    case 'pubkey':
    case 'short': {
      // Truncate a public key or any long identifier to 8 chars + ellipsis
      return value.length > 8 ? value.slice(0, 8) + '…' : value
    }

    case 'date': {
      const ts = Number(value)
      const d  = new Date(isNaN(ts) ? value : ts)
      if (isNaN(d.getTime())) return value

      switch (arg) {
        case 'relative': return formatRelative(d)
        case 'iso':      return d.toISOString()
        case 'short':    return d.toLocaleDateString()
        case 'time':     return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        default:         return d.toLocaleString()
      }
    }

    case 'uppercase':   return value.toUpperCase()
    case 'lowercase':   return value.toLowerCase()

    case 'default':
      // Use fallback if value is empty
      return value.trim() ? value : arg

    case 'prefix':
      // Prepend a string: {{entity.author|prefix:@}}
      return arg + value

    case 'suffix':
      return value + arg

    default:
      // Unknown filter — pass through unchanged rather than erroring
      return value
  }
}

function formatRelative(date) {
  const diff = Date.now() - date.getTime()
  const abs  = Math.abs(diff)
  const future = diff < 0

  const seconds = Math.floor(abs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours   = Math.floor(minutes / 60)
  const days    = Math.floor(hours / 24)
  const weeks   = Math.floor(days / 7)
  const months  = Math.floor(days / 30)
  const years   = Math.floor(days / 365)

  let label
  if (seconds < 10)       label = 'just now'
  else if (seconds < 60)  label = `${seconds}s ago`
  else if (minutes < 60)  label = `${minutes}m ago`
  else if (hours < 24)    label = `${hours}h ago`
  else if (days === 1)    label = 'yesterday'
  else if (days < 7)      label = `${days} days ago`
  else if (weeks < 5)     label = `${weeks} weeks ago`
  else if (months < 12)   label = `${months} months ago`
  else                    label = `${years} year${years > 1 ? 's' : ''} ago`

  return future ? label.replace('ago', 'from now') : label
}