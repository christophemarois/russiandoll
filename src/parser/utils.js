import * as regexps from './regexps'

export function escape (str) {
  return str.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  }[char]))
}

export function findLinkDescendants (tokens, rootId) {
  let descendants = new Set()

  ;(function findLinkDescendant (openedBy) {
    // Find all links that are descendants of the current link, then map their
    // `opens` ids
    const links = tokens.filter(token =>
      token.type === 'fragment-link' &&
      token.nesting.includes(openedBy)
    ).map(token => token.opens)

    // Find all fragments and paragraphs opened by the current link, but not
    // in the same descendants tree, then map their `openedBy` ids
    const fragments = tokens.filter(token =>
      ['fragment-open', 'paragraph-open'].includes(token.type) &&
      token.nesting &&
      token.nesting.includes(openedBy) &&
      !descendants.has(token.openedBy)
    ).map(token => token.openedBy)

    // Recursively process all ids
    for (const id of [...fragments, ...links]) {
      // Skip descendants we already processed to save some time
      if (descendants.has(id)) continue

      descendants.add(id)
      findLinkDescendant(id)
    }
  })(rootId)

  return Array.from(descendants)
}

export function getPos (source, tokens, tokenI) {
  const sourceCharI = tokens.slice(0, tokenI).reduce((m, v) => m += v, '').length
  const lines = source.slice(0, sourceCharI + 1).split(/\n/)
  const lastLineCharI = lines[lines.length - 1].length
  return [lines.length, lastLineCharI].join(',')
}

export function attrs (attrs = {}) {
  let out = ''
  for (let [k, v] of Object.entries(attrs)) {
    if (typeof v === 'undefined' || v === null) continue
    v = String(v).replace(/"/g, '\\"')
    out += ` ${k}="${v}"`
  }
  return out
}

export function markup (str) {
  for (let { regexp, replacer } of Object.values(regexps.markup)) {
    str = str.replace(regexp, replacer)
  }

  return str
}
