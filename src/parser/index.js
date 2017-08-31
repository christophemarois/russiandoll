/**
 * Russiandoll Parser v1.0.0
 * © Christophe Marois <github.com/christophemarois>
**/

import * as regexps from './regexps'
import * as utils from './utils'

const VERSION = '1.0.0'

class RussiandollError extends Error {
  constructor (message, pos = null) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
    this.name = 'RussiandollError'
    this.pos = pos
  }
}

export default class Russiandoll {
  constructor (opts = {}) {
    Object.assign(this, { source: '', isDev: false }, opts)
  }

  get tokens () {
    if (typeof this.source !== 'string') {
      throw new RussiandollError('Source must be a string')
    }

    let tokens = [this.source]

    // For every token regexp, split every element, flatten the resulting
    // nested arrays and remove the empty string elements.
    for (const regexp of Object.values(regexps.tokens)) {
      tokens = Array.prototype.concat(
        ...tokens
          .map(token => token.split(regexp))
          .filter(token => token !== '')
      )
    }

    return tokens.filter(token => token !== '')
  }

  get ast () {
    const tokens = this.tokens // Avoid computing multiple times

    let nesting = [] // Flat tree of ids that lead to current scope
    let scopeId = 0 // Auto-incrementing reference used for scoped numeric ids
    let stack = [[]] // Nested scopes used to reference auto ids
    let uniqueId = 0 // Auto-incrementing reference for auto ids
    let usedIds = [] // Reference of used ids meant to prevent double-linking

    let output = [{ type: 'paragraph-open', pos: '1,1', nesting: [] }]

    for (const [i, token] of tokens.entries()) {
      const pos = utils.getPos(this.source, tokens, i)

      let matches = {}

      for (const [name, regexp] of Object.entries(regexps.parsers)) {
        regexp.lastIndex = 0
        matches[name] = regexp.exec(token)
      }

      // On new paragraph
      if (matches.paragraph) {
        if (stack.length > 1) {
          throw new RussiandollError(`Unexpected paragraph in fragment`, pos)
        }

        const id = matches.paragraph[1] ? '_' + matches.paragraph[1] : ''

        if (nesting.length > 0) nesting.pop()
        output.push({
          type: 'paragraph-close',
          pos,
          nesting: Array.from(nesting)
        })

        nesting.push(id)
        output.push({
          type: 'paragraph-open',
          openedBy: id,
          pos,
          nesting: Array.from(nesting)
        })
        scopeId++

        // On fragment open
      } else if (matches.fragmentOpen) {
        let id
        if (matches.fragmentOpen[1]) {
          if (parseInt(matches.fragmentOpen[1]) >= 0) {
            id = scopeId + '-' + matches.fragmentOpen[1]
          } else {
            id = '_' + utils.escape(matches.fragmentOpen[1])
          }
        } else if (stack[0].length > 0) {
          id = stack[0].shift()
        } else {
          id = 'nothing'
        }

        nesting.push(id)
        output.push({
          type: 'fragment-open',
          openedBy: id,
          pos,
          nesting: Array.from(nesting)
        })
        stack.unshift([])
        scopeId++

        // On fragment close
      } else if (matches.fragmentClose) {
        nesting.pop()
        stack.shift()
        scopeId--

        if (stack.length === 0) {
          throw new RussiandollError(`Unexpected fragment closing`, pos)
        }

        output.push({
          type: 'fragment-close',
          pos,
          nesting: Array.from(nesting)
        })

        // On fragment link
      } else if (matches.fragmentLink) {
        let [, original, id] = matches.fragmentLink

        if (id) {
          if (parseInt(id) >= 0) {
            id = scopeId + '-' + id
          } else {
            id = '_' + utils.escape(id)
          }

          // Check for double-linking
          if (usedIds.includes(id)) {
            const original = output.find(
              token => token.type === 'fragment-link' && token.opens === id
            )
            throw new RussiandollError(
              `Fragment "${id}" was already opened at ${original.pos}`,
              pos
            )
          } else {
            usedIds.push(id)
          }
        } else {
          id = uniqueId++
          stack[0].push(id)
        }

        const text = utils.markup(utils.escape(original))
        output.push({
          type: 'fragment-link',
          opens: id,
          text,
          original,
          pos,
          nesting: Array.from(nesting)
        })

        // On plain text
      } else {
        const text = utils.markup(utils.escape(token))
        output.push({
          type: 'text',
          text,
          original: token,
          pos,
          nesting: Array.from(nesting)
        })
      }
    }

    if (stack.length > 1) {
      throw new RussiandollError(
        `Missing ${stack.length - 1} closing curly bracket`
      )
    }

    output.push({ type: 'paragraph-close' })

    for (const [i, token] of output.entries()) {
      if (token.type === 'fragment-link') {
        // Should never happen because of the double-linking check
        if (output[i].nesting.includes(token.opens)) {
          throw new RussiandollError(
            `Recursive fragment link "${token.opens}"`,
            token.pos
          )
        }

        output[i].descendants = utils.findLinkDescendants(output, token.opens)
      }
    }

    return output
  }

  get html () {
    let html = ''

    html += `<div data-russiandoll="${VERSION}">`

    for (const el of this.ast) {
      const pos = this.isDev ? el.pos : null

      if (el.type === 'paragraph-open') {
        html += `<p${utils.attrs({
          'data-opened-by': el.openedBy === '' ? null : el.openedBy,
          'data-source-pos': pos
        })}>`
      }
      if (el.type === 'paragraph-close') {
        html += `</p>`
      }
      if (el.type === 'fragment-open') {
        html += `<span${utils.attrs({
          'data-opened-by': el.openedBy,
          'data-source-pos': pos
        })}>`
      }
      if (el.type === 'fragment-close') {
        html += `</span>`
      }
      if (el.type === 'fragment-link') {
        html += `<a href="#"${utils.attrs({
          'data-opens': el.opens,
          'data-source-pos': pos,
          'data-descendants': this.isDev ? el.descendants.join(',') : null
        })}>${el.text}</a>`
      }
      if (el.type === 'text') {
        html += el.text
      }
    }

    html += `</div>`

    return html
  }
}
