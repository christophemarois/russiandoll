'use strict';

const tokens = {
  curlyBrackets:  /(\{(?:[A-z\u00C0-\u00ff\d-_']+\:)?|\})/,
  paragraph:      /(\>[A-z\u00C0-\u00ff\d-_']*\s?)/g,
  fragmentLink:   /(\[[^\]]*\](?:#[A-z\u00C0-\u00ff\d-_']+)?)/g
};

const parsers = {
  paragraph:      /\>([A-z\u00C0-\u00ff\d-_']*)\s?/g,
  fragmentLink:   /\[([^\]]*)\](?:#([A-z\u00C0-\u00ff\d-_']+))?/g,
  fragmentOpen:   /\{(?:([A-z\u00C0-\u00ff\d-_']+)\:)?/g,
  fragmentClose:  /\}/g
};

const markup = {
  // ~~strikethrough~~
  strikethrough: {
    regexp: /~~([^~]+?)~~/g,
    replacer: '<del>$1</del>'
  },
  // **bold**
  bold: {
    regexp: /\*\*([^\*]+?)\*\*/g,
    replacer: '<strong>$1</strong>'
  },
  // *italic*
  italic: {
    regexp: /\*([^\*]+?)\*/g,
    replacer: '<em>$1</em>'
  },
  // (link: https://domain.com/ link text)
  link: {
    regexp: /\(link:\s*(https?:\/\/[^\s]+)\s+([^)]+)\)/g,
    replacer: '<a href="$1" target="_blank">$2</a>'
  },
  // (image: https://domain.com/image.jpg)
  image: {
    regexp: /\(image:\s*((https?:\/\/)[^)]+)\)/g,
    replacer: '<img src="$1" />'
  }
};

function escape (str) {
  return str.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  }[char]))
}

function findLinkDescendants (tokens$$1, rootId) {
  let descendants = new Set();(function findLinkDescendant (openedBy) {
    // Find all links that are descendants of the current link, then map their
    // `opens` ids
    const links = tokens$$1.filter(token =>
      token.type === 'fragment-link' &&
      token.nesting.includes(openedBy)
    ).map(token => token.opens);

    // Find all fragments and paragraphs opened by the current link, but not
    // in the same descendants tree, then map their `openedBy` ids
    const fragments = tokens$$1.filter(token =>
      ['fragment-open', 'paragraph-open'].includes(token.type) &&
      token.nesting &&
      token.nesting.includes(openedBy) &&
      !descendants.has(token.openedBy)
    ).map(token => token.openedBy);

    // Recursively process all ids
    for (const id of [...fragments, ...links]) {
      // Skip descendants we already processed to save some time
      if (descendants.has(id)) continue

      descendants.add(id);
      findLinkDescendant(id);
    }
  })(rootId);

  return Array.from(descendants)
}

function getPos (source, tokens$$1, tokenI) {
  const sourceCharI = tokens$$1.slice(0, tokenI).reduce((m, v) => m += v, '').length;
  const lines = source.slice(0, sourceCharI + 1).split(/\n/);
  const lastLineCharI = lines[lines.length - 1].length;
  return [lines.length, lastLineCharI].join(',')
}

function attrs (attrs = {}) {
  let out = '';
  for (let [k, v] of Object.entries(attrs)) {
    if (typeof v === 'undefined' || v === null) continue
    v = String(v).replace(/"/g, '\\"');
    out += ` ${k}="${v}"`;
  }
  return out
}

function markup$1 (str) {
  for (let { regexp, replacer } of Object.values(markup)) {
    str = str.replace(regexp, replacer);
  }

  return str
}

/**
 * Russiandoll Parser v1.0.0
 * © Christophe Marois <github.com/christophemarois>
**/

const VERSION = '1.0.0';

class RussiandollError extends Error {
  constructor (message, pos = null) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.name = 'RussiandollError';
    this.pos = pos;
  }
}

class Russiandoll {
  constructor (opts = {}) {
    Object.assign(this, { source: '', isDev: false }, opts);
  }

  get tokens () {
    if (typeof this.source !== 'string') {
      throw new RussiandollError('Source must be a string')
    }

    let tokens$$1 = [this.source];

    // For every token regexp, split every element, flatten the resulting
    // nested arrays and remove the empty string elements.
    for (const regexp of Object.values(tokens)) {
      tokens$$1 = Array.prototype.concat(
        ...tokens$$1
          .map(token => token.split(regexp))
          .filter(token => token !== '')
      );
    }

    return tokens$$1.filter(token => token !== '')
  }

  get ast () {
    const tokens$$1 = this.tokens; // Avoid computing multiple times

    let nesting = []; // Flat tree of ids that lead to current scope
    let scopeId = 0; // Auto-incrementing reference used for scoped numeric ids
    let stack = [[]]; // Nested scopes used to reference auto ids
    let uniqueId = 0; // Auto-incrementing reference for auto ids
    let usedIds = []; // Reference of used ids meant to prevent double-linking

    let output = [{ type: 'paragraph-open', pos: '1,1', nesting: [] }];

    for (const [i, token] of tokens$$1.entries()) {
      const pos = getPos(this.source, tokens$$1, i);

      let matches = {};

      for (const [name, regexp] of Object.entries(parsers)) {
        regexp.lastIndex = 0;
        matches[name] = regexp.exec(token);
      }

      // On new paragraph
      if (matches.paragraph) {
        if (stack.length > 1) {
          throw new RussiandollError(`Unexpected paragraph in fragment`, pos)
        }

        const id = matches.paragraph[1] ? '_' + matches.paragraph[1] : '';

        if (nesting.length > 0) nesting.pop();
        output.push({
          type: 'paragraph-close',
          pos,
          nesting: Array.from(nesting)
        });

        nesting.push(id);
        output.push({
          type: 'paragraph-open',
          openedBy: id,
          pos,
          nesting: Array.from(nesting)
        });
        scopeId++;

        // On fragment open
      } else if (matches.fragmentOpen) {
        let id;
        if (matches.fragmentOpen[1]) {
          if (parseInt(matches.fragmentOpen[1]) >= 0) {
            id = scopeId + '-' + matches.fragmentOpen[1];
          } else {
            id = '_' + escape(matches.fragmentOpen[1]);
          }
        } else if (stack[0].length > 0) {
          id = stack[0].shift();
        } else {
          id = 'nothing';
        }

        nesting.push(id);
        output.push({
          type: 'fragment-open',
          openedBy: id,
          pos,
          nesting: Array.from(nesting)
        });
        stack.unshift([]);
        scopeId++;

        // On fragment close
      } else if (matches.fragmentClose) {
        nesting.pop();
        stack.shift();
        scopeId--;

        if (stack.length === 0) {
          throw new RussiandollError(`Unexpected fragment closing`, pos)
        }

        output.push({
          type: 'fragment-close',
          pos,
          nesting: Array.from(nesting)
        });

        // On fragment link
      } else if (matches.fragmentLink) {
        let [, original, id] = matches.fragmentLink;

        if (id) {
          if (parseInt(id) >= 0) {
            id = scopeId + '-' + id;
          } else {
            id = '_' + escape(id);
          }

          // Check for double-linking
          if (usedIds.includes(id)) {
            const original = output.find(
              token => token.type === 'fragment-link' && token.opens === id
            );
            throw new RussiandollError(
              `Fragment "${id}" was already opened at ${original.pos}`,
              pos
            )
          } else {
            usedIds.push(id);
          }
        } else {
          id = uniqueId++;
          stack[0].push(id);
        }

        const text = markup$1(escape(original));
        output.push({
          type: 'fragment-link',
          opens: id,
          text,
          original,
          pos,
          nesting: Array.from(nesting)
        });

        // On plain text
      } else {
        const text = markup$1(escape(token));
        output.push({
          type: 'text',
          text,
          original: token,
          pos,
          nesting: Array.from(nesting)
        });
      }
    }

    if (stack.length > 1) {
      throw new RussiandollError(
        `Missing ${stack.length - 1} closing curly bracket`
      )
    }

    output.push({ type: 'paragraph-close' });

    for (const [i, token] of output.entries()) {
      if (token.type === 'fragment-link') {
        // Should never happen because of the double-linking check
        if (output[i].nesting.includes(token.opens)) {
          throw new RussiandollError(
            `Recursive fragment link "${token.opens}"`,
            token.pos
          )
        }

        output[i].descendants = findLinkDescendants(output, token.opens);
      }
    }

    return output
  }

  get html () {
    let html = '';

    html += `<div data-russiandoll="${VERSION}">`;

    for (const el of this.ast) {
      const pos = this.isDev ? el.pos : null;

      if (el.type === 'paragraph-open') {
        html += `<p${attrs({
          'data-opened-by': el.openedBy === '' ? null : el.openedBy,
          'data-source-pos': pos
        })}>`;
      }
      if (el.type === 'paragraph-close') {
        html += `</p>`;
      }
      if (el.type === 'fragment-open') {
        html += `<span${attrs({
          'data-opened-by': el.openedBy,
          'data-source-pos': pos
        })}>`;
      }
      if (el.type === 'fragment-close') {
        html += `</span>`;
      }
      if (el.type === 'fragment-link') {
        html += `<a href="#"${attrs({
          'data-opens': el.opens,
          'data-source-pos': pos,
          'data-descendants': this.isDev ? el.descendants.join(',') : null
        })}>${el.text}</a>`;
      }
      if (el.type === 'text') {
        html += el.text;
      }
    }

    html += `</div>`;

    return html
  }
}

module.exports = Russiandoll;
