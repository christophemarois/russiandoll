export const tokens = {
  curlyBrackets:  /(\{(?:[A-z\u00C0-\u00ff\d-_']+\:)?|\})/,
  paragraph:      /(\>[A-z\u00C0-\u00ff\d-_']*\s?)/g,
  fragmentLink:   /(\[[^\]]*\](?:#[A-z\u00C0-\u00ff\d-_']+)?)/g
}

export const parsers = {
  paragraph:      /\>([A-z\u00C0-\u00ff\d-_']*)\s?/g,
  fragmentLink:   /\[([^\]]*)\](?:#([A-z\u00C0-\u00ff\d-_']+))?/g,
  fragmentOpen:   /\{(?:([A-z\u00C0-\u00ff\d-_']+)\:)?/g,
  fragmentClose:  /\}/g
}

export const markup = {
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
}
