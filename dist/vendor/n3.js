/*! vendored n3@2.13.12 */
if (typeof globalThis.process === "undefined") {
  globalThis.process = {
    env: {}, browser: true, version: "", versions: { node: "" },
    nextTick: (cb, ...a) => Promise.resolve().then(() => cb(...a)),
    cwd: () => "/", platform: "browser",
  };
}
const RDF  = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    XSD  = 'http://www.w3.org/2001/XMLSchema#',
    SWAP = 'http://www.w3.org/2000/10/swap/';

var namespaces = {
  xsd: {
    decimal: `${XSD}decimal`,
    boolean: `${XSD}boolean`,
    dateTime: `${XSD}dateTime`,
    double:  `${XSD}double`,
    integer: `${XSD}integer`,
    string:  `${XSD}string`,
  },
  rdf: {
    type:          `${RDF}type`,
    nil:           `${RDF}nil`,
    first:         `${RDF}first`,
    rest:          `${RDF}rest`,
    langString:    `${RDF}langString`,
    dirLangString: `${RDF}dirLangString`,
    reifies:       `${RDF}reifies`,
  },
  owl: {
    sameAs: 'http://www.w3.org/2002/07/owl#sameAs',
  },
  r: {
    forSome: `${SWAP}reify#forSome`,
    forAll:  `${SWAP}reify#forAll`,
  },
  log: {
    implies: `${SWAP}log#implies`,
    isImpliedBy: `${SWAP}log#isImpliedBy`,
  },
};

// **N3Lexer** tokenizes N3 documents.

const { xsd: xsd$2 } = namespaces;
const SPACE = 0x20, TAB = 0x09, LF = 0x0A, CR = 0x0D, HASH = 0x23,
    DOT = 0x2E, COLON = 0x3A, ZERO = 0x30, NINE = 0x39,
    PERCENT = 0x25, BACKSLASH = 0x5C;

// Whitespace as matched by `\s`
function isWhitespace(charCode) {
  return charCode === SPACE || charCode >= TAB && charCode <= CR ||
    charCode >= 0xA0 && (charCode === 0xA0 || charCode === 0x1680 ||
      charCode >= 0x2000 && charCode <= 0x200A || charCode === 0x2028 || charCode === 0x2029 ||
      charCode === 0x202F || charCode === 0x205F || charCode === 0x3000 || charCode === 0xFEFF);
}
// Characters that can directly follow a name: whitespace and punctuation
// (the lookahead `[,;!\^\s#()\[\]\{\}"'<>]` of the former regular expressions)
const asciiDelimiters = new Uint8Array(0x80);
for (const char of ',;!^#()[]{}"\'<> \t\n\v\f\r')
  asciiDelimiters[char.charCodeAt(0)] = 1;
function isDelimiter(charCode) {
  return charCode < 0x80 ? asciiDelimiters[charCode] === 1 : isWhitespace(charCode);
}
// Whether a name can end before the given position: it must be followed by
// a delimiter, optionally after a dot. At the end of finished input, it can always end.
function canEndName(input, pos, inputFinished) {
  let charCode = input.charCodeAt(pos);
  if (charCode === DOT)
    charCode = input.charCodeAt(++pos);
  if (pos >= input.length)
    return inputFinished;
  return isDelimiter(charCode);
}

// Fixed escape sequences allowed in string literals (ECHAR)
const stringEscapeReplacements = {
  '\\': '\\', "'": "'", '"': '"',
  'n': '\n', 'r': '\r', 't': '\t', 'f': '\f', 'b': '\b',
};
// Fixed escape sequences allowed in local names of prefixed names (PN_LOCAL_ESC)
const localNameEscapeReplacements = {
  '_': '_', '~': '~', '.': '.', '-': '-', '!': '!', '$': '$', '&': '&',
  "'": "'", '(': '(', ')': ')', '*': '*', '+': '+', ',': ',', ';': ';',
  '=': '=', '/': '/', '?': '?', '#': '#', '@': '@', '%': '%',
};
const illegalIriChars = /[\x00-\x20<>\\"\{\}\|\^\`]/;

// Character classes of names, as bit flags for ASCII characters
const PREFIX_START = 1, // PN_CHARS_BASE
    LOCAL_START = 2,      // PN_CHARS_U, digits, and colon
    NAME_CHAR = 4,        // PN_CHARS
    LOCAL_CHAR = 8,       // PN_CHARS and colon
    LOCAL_ESCAPE = 16;    // characters that can be escaped in local names (PN_LOCAL_ESC)
const asciiNameClasses = new Uint8Array(0x80);
for (let charCode = 0; charCode < 0x80; charCode++) {
  const char = String.fromCharCode(charCode);
  const letter = char >= 'A' && char <= 'Z' || char >= 'a' && char <= 'z';
  const nameChar = letter || char === '_' || char === '-' || char >= '0' && char <= '9';
  asciiNameClasses[charCode] =
    (letter ? PREFIX_START : 0) |
    (nameChar && char !== '-' || char === ':' ? LOCAL_START : 0) |
    (nameChar ? NAME_CHAR : 0) |
    (nameChar || char === ':' ? LOCAL_CHAR : 0) |
    (char in localNameEscapeReplacements ? LOCAL_ESCAPE : 0);
}
// Returns the length (0, 1, or 2 code units) of the character at the given position
// if it is in the given name character class
function nameCharLength(input, pos, charClass) {
  const charCode = input.charCodeAt(pos);
  if (charCode < 0x80)
    return (asciiNameClasses[charCode] & charClass) !== 0 ? 1 : 0;
  // Characters from U+10000 to U+EFFFF consist of a surrogate pair
  if (charCode >= 0xD800 && charCode <= 0xDB7F) {
    const low = input.charCodeAt(pos + 1);
    return low >= 0xDC00 && low <= 0xDFFF ? 2 : 0;
  }
  // PN_CHARS has some characters that PN_CHARS_BASE does not
  if (charClass >= NAME_CHAR && (charCode === 0xB7 || charCode >= 0x300 && charCode <= 0x36F ||
                                 charCode === 0x203F || charCode === 0x2040))
    return 1;
  // PN_CHARS_BASE
  return charCode >= 0xC0 && charCode <= 0x1FFF && charCode !== 0xD7 && charCode !== 0xF7 &&
           (charCode < 0x300 || charCode >= 0x370 && charCode !== 0x37E) ||
         charCode >= 0x200C && charCode <= 0x200D || charCode >= 0x2070 && charCode <= 0x218F ||
         charCode >= 0x2C00 && charCode <= 0x2FEF || charCode >= 0x3001 && charCode <= 0xD7FF ||
         charCode >= 0xF900 && charCode <= 0xFDCF || charCode >= 0xFDF0 && charCode <= 0xFFFD ? 1 : 0;
}
function isLocalEscape(charCode) {
  return charCode < 0x80 && (asciiNameClasses[charCode] & LOCAL_ESCAPE) !== 0;
}
function isHexDigit(charCode) {
  return charCode >= ZERO && charCode <= NINE ||
    charCode >= 0x41 && charCode <= 0x46 || charCode >= 0x61 && charCode <= 0x66;
}
// Returns the end of the prefix (PN_PREFIX) at the given position,
// which can contain single dots, but not start or end with one
function skipPrefix(input, pos) {
  let length = nameCharLength(input, pos, PREFIX_START);
  while (length !== 0) {
    pos += length;
    const next = input.charCodeAt(pos) === DOT ? pos + 1 : pos;
    // Most names are ASCII, so look those up without a call
    const charCode = input.charCodeAt(next);
    length = charCode < 0x80 ? (asciiNameClasses[charCode] & NAME_CHAR) !== 0 ? 1 : 0 :
      nameCharLength(input, next, NAME_CHAR);
    if (length !== 0)
      pos = next;
  }
  return pos;
}
// Returns the end of the local name (PN_LOCAL) at the given position,
// which can contain dots, but not start or end with one
function skipLocalName(input, pos) {
  let end = pos, charClass = LOCAL_START;
  while (true) {
    // Most names are ASCII, so look those up without a call
    const charCode = input.charCodeAt(pos);
    let length = charCode < 0x80 ? (asciiNameClasses[charCode] & charClass) !== 0 ? 1 : 0 :
      nameCharLength(input, pos, charClass);
    // Percent-encoded character (PERCENT)
    if (length === 0 && charCode === PERCENT &&
        isHexDigit(input.charCodeAt(pos + 1)) && isHexDigit(input.charCodeAt(pos + 2)))
      length = 3;
    // Escaped character (PN_LOCAL_ESC)
    else if (length === 0 && charCode === BACKSLASH && isLocalEscape(input.charCodeAt(pos + 1)))
      length = 2;
    if (length !== 0) {
      end = pos += length;
      charClass = LOCAL_CHAR;
    }
    // Dots are allowed after the first character, but not at the end
    else if (charCode === DOT && charClass === LOCAL_CHAR)
      pos++;
    else
      return end;
  }
}
// Returns the end of the prefixed name at the given position, or -1 if there is none
function skipPrefixedName(input, pos, inputFinished) {
  const colon = skipPrefix(input, pos);
  if (input.charCodeAt(colon) !== COLON)
    return -1;
  const end = skipLocalName(input, colon + 1);
  return canEndName(input, end, inputFinished) ? end : -1;
}

// A valid code point is a Unicode scalar value: at most U+10FFFF and not a surrogate
function isValidCodePoint(charCode) {
  return charCode <= 0x10FFFF && (charCode < 0xD800 || charCode > 0xDFFF);
}

const lineModeRegExps = {
  _iri: true,
  _unescapedIri: true,
  _simpleQuotedString: true,
  _langcode: true,
  _blank: true,
  _commentLine: true,
  _whitespace: true,
};
const invalidRegExp = /$0^/;
const nonWhitespace = /\S*/y;

// Matches a sticky regular expression at the given position of the input
function execAt(regExp, input, pos) {
  regExp.lastIndex = pos;
  return regExp.exec(input);
}
function testAt(regExp, input, pos) {
  regExp.lastIndex = pos;
  return regExp.test(input);
}
// Matches the rest of the input followed by a space, as at the end of the input,
// a token that can contain (but not end with) a dot needs a non-dot character after it
function execAtEnd(regExp, input, pos) {
  regExp.lastIndex = 0;
  return regExp.exec(`${input.slice(pos)} `);
}

// Whitespace or the start of a comment
function isSeparatorCode(code) {
  return code === SPACE || code === TAB || code === LF || code === CR || code === HASH;
}

// Words with a fixed meaning in the grammar, which cannot name an additional directive
const reservedWords = /^(?:prefix|base|version|graph|forsome|forall|iri|a|true|false|has|is|of|id)$/i;

// Unfinished input in a stream up to this length is tokenized again with every chunk
const MIN_RESCAN_LENGTH = 1024;

// ## Constructor
class N3Lexer {
  constructor(options) {
    // ## Regular expressions
    // It's slightly faster to have these as properties than as in-scope variables.
    // They are sticky, so they only match at the `lastIndex` set by `execAt`.
    this._iri = /<((?:[^ <>{}\\]|\\[uU])+)>[ \t]*/y; // IRI with escape sequences; needs sanity check after unescaping
    this._unescapedIri = /<([^\x00-\x20<>\\"\{\}\|\^\`]*)>[ \t]*/y; // IRI without escape sequences; no unescaping
    this._simpleQuotedString = /"([^"\\\r\n]*)"(?=[^"])/y; // string without escape sequences
    this._simpleApostropheString = /'([^'\\\r\n]*)'(?=[^'])/y;
    this._langcode = /@([a-z]+(?:-[a-z0-9]+)*)(?=[^a-z0-9])/iy;
    this._variable = /\?(?:(?:[A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:[\-0-9:A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)(?=[.,;!\^\s#()\[\]\{\}"'<>])/y;
    this._blank = /_:((?:[0-9A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)(?:[ \t]+|(?=\.?[,;:!\^\s#()\[\]\{\}"'<>]))/y;
    this._number = /[\-+]?(?:(\d+\.\d*|\.?\d+)[eE][\-+]?\d+|(?=\.?\d)\d*(?:(\.)\d+)?)(?=\.?[,;:!\^\s#()\[\]\{\}"'<>])/y;
    this._boolean = /(?:true|false)(?=[.,;!\^\s#()\[\]\{\}"'<>])/y;
    this._atKeyword = /@[a-z]+(?=[\s#<:"'.])/iy;
    this._keyword = /(?:PREFIX|BASE|VERSION|GRAPH)(?=[\s#<"'])/iy;
    this._n3Verb = /(?:has|is|of)(?=[\s#()\[\]\{\}"'<>?_+\-0-9])/y;
    this._n3Id = /id(?=[\s#<])/y;
    this._shortPredicates = /a(?=[\s#()\[\]\{\}"'<>])/y;
    this._commentLine = /[ \t]*#([^\n\r]*)(?:\r\n|\n|\r)([ \t]*)/y;
    this._whitespace = /[ \t]+/y;
    options = options || {};

    // Whether the log:isImpliedBy predicate is supported
    this._isImpliedBy = options.isImpliedBy;

    // In line mode (N-Triples or N-Quads), only simple features may be parsed
    if (this._lineMode = !!options.lineMode) {
      this._n3Mode = false;
      // Don't tokenize special literals
      for (const key in this) {
        if (!(key in lineModeRegExps) && this[key] instanceof RegExp)
          this[key] = invalidRegExp;
      }
      // The only keyword in N-Triples and N-Quads is VERSION, which is case-sensitive
      this._keyword = /VERSION(?=[\s#<"])/y;
    }
    // When not in line mode, enable N3 functionality by default
    else {
      this._n3Mode = options.n3 !== false;
    }
    // Recognize additional directive keywords, such as MESSAGE
    // (the @-form of a directive is always tokenized as an @-keyword)
    this._directive = null;
    if (options.directives && options.directives.length !== 0) {
      for (const name of options.directives) {
        if (!/^[a-z]+$/i.test(name) || reservedWords.test(name))
          throw new Error(`Invalid directive name: "${name}"`);
      }
      this._directive = new RegExp(`(?:${options.directives.join('|')})(?=[\\s#<])`, 'iy');
      this._directiveMaxLength = Math.max(...options.directives.map(name => name.length));
      // The first characters of directive names, so other words skip the regular expression
      this._directiveStarts = options.directives.map(name => name[0].toLowerCase() + name[0].toUpperCase()).join('');
    }
    // Don't output comment tokens by default
    this.comments = !!options.comments;
    // Cache the last tested closing position of long literals
    this._literalClosingPos = 0;
  }

  // ## Private methods

  // ### `_tokenizeToEnd` tokenizes as for as possible, emitting tokens through the callback
  _tokenizeToEnd(callback, inputFinished) {
    // Continue parsing as far as possible; the loop will return eventually.
    // Rather than slicing off every token, track the position of the remaining input;
    // the regular expressions are sticky, so they match at that position.
    const input = this._input;
    let pos = 0;
    let currentLineLength = this._linePosition + input.length;
    while (true) {
      // Consume one separator line at a time, including its following indentation.
      while (true) {
        let charCode = input.charCodeAt(pos), separatorLength = 0;
        if (charCode === SPACE || charCode === TAB) {
          const next = input.charCodeAt(pos + 1);
          separatorLength = next === SPACE || next === TAB ?
            execAt(this._whitespace, input, pos)[0].length : 1;
          charCode = input.charCodeAt(pos + separatorLength);
        }
        if (charCode === HASH) {
          const comment = execAt(this._commentLine, input, pos);
          if (comment) {
            const commentLength = comment[0].length;
            // Keep a trailing CR buffered in case the next chunk starts with LF.
            if (!inputFinished && pos + commentLength === input.length &&
                input.charCodeAt(input.length - 1) === CR)
              return this._suspend(input, pos, currentLineLength);
            if (this.comments)
              emitComment(comment[1], this._line, currentLineLength - (input.length - pos) + separatorLength);
            pos += commentLength;
            currentLineLength = input.length - pos + comment[2].length;
            this._line++;
          }
          else {
            // A comment without a line ending stays buffered until EOF.
            pos += separatorLength;
            if (!inputFinished)
              return this._suspend(input, pos, currentLineLength);
            if (this.comments)
              emitComment(input.slice(pos + 1), this._line, currentLineLength - (input.length - pos));
            pos = input.length;
            break;
          }
        }
        else if (charCode === LF || charCode === CR) {
          // A CR at the end of a chunk may still be followed by LF.
          if (!inputFinished && charCode === CR && pos + separatorLength + 1 === input.length)
            return this._suspend(input, pos, currentLineLength);
          separatorLength += charCode === CR && input.charCodeAt(pos + separatorLength + 1) === LF ? 2 : 1;
          // Indentation is consumed with the newline, but belongs to the next line's columns.
          let indentationLength = 0;
          const next = input.charCodeAt(pos + separatorLength);
          if (next === SPACE || next === TAB) {
            const following = input.charCodeAt(pos + separatorLength + 1);
            indentationLength = following === SPACE || following === TAB ?
              execAt(this._whitespace, input, pos + separatorLength)[0].length : 1;
          }
          pos += separatorLength + indentationLength;
          currentLineLength = input.length - pos + indentationLength;
          this._line++;
        }
        else {
          pos += separatorLength;
          break;
        }
      }
      if (pos >= input.length) {
        // A datatype marker needs a type
        if (inputFinished && this._previousMarker === '^^')
          return reportSyntaxError(this, input, pos);
        this._linePosition = currentLineLength;
        if (inputFinished) {
          emitToken('eof', '', '', this._line, currentLineLength, 0);
          return this._input = null;
        }
        return this._input = '';
      }

      // Look for specific token types based on the first character
      const line = this._line, firstChar = input[pos];
      let type = '', value = '', prefix = '',
          match = null, matchLength = 0, lexicalLength = 0,
          finalLineLength = 0, inconclusive = false, tripleQuoted = false;
      switch (firstChar) {
      case '^':
        // A datatype marker separated from its type cannot be followed by another marker
        if (this._previousMarker === '^^')
          return reportSyntaxError(this, input, pos);
        // We need at least 3 tokens lookahead to distinguish ^^<IRI> and ^^pre:fixed
        if (input.length - pos < 3)
          break;
        // Try to match a type
        else if (input[pos + 1] === '^') {
          this._previousMarker = '^^';
          // Move to type IRI or prefixed name
          pos += 2;
          if (input[pos] !== '<') {
            // Whitespace and comments may separate the marker from the type
            if (isSeparatorCode(input.charCodeAt(pos)))
              continue; // eslint-disable-line no-continue
            inconclusive = true;
            break;
          }
        }
        // If no type, it must be a path expression
        else {
          if (this._n3Mode) {
            matchLength = 1;
            type = '^';
          }
          break;
        }
        // Fall through in case the type is an IRI
      case '<':
        // Try to find a full IRI without escape sequences
        if (match = execAt(this._unescapedIri, input, pos)) {
          type = 'IRI', value = match[1];
          lexicalLength = match[1].length + 2;
        }
        // Try to find a full IRI with escape sequences
        else if (match = execAt(this._iri, input, pos)) {
          value = this._unescape(match[1], stringEscapeReplacements);
          if (value === null || illegalIriChars.test(value))
            return reportSyntaxError(this, input, pos);
          type = 'IRI';
          lexicalLength = match[1].length + 2;
        }
        // Try to find a triple term
        else if (input.length - pos > 2 && input[pos + 1] === '<' && input[pos + 2] === '(')
          type = '<<(', matchLength = 3;
        // Try to find a reified triple
        else if (!this._lineMode && input.length - pos > (inputFinished ? 1 : 2) && input[pos + 1] === '<')
          type = '<<', matchLength = 2;
        // Try to find a backwards implication arrow
        else if (this._n3Mode && input.length - pos > 1 && input[pos + 1] === '=') {
          matchLength = 2;
          if (this._isImpliedBy) type = 'abbreviation', value = '<';
          else type = 'inverse', value = '>';
        }
        // Try to find an inverted predicate marker
        else if (this._n3Mode && input.length - pos > 1 && input[pos + 1] === '-')
          type = 'inversePredicate', matchLength = 2;
        break;

      case '>':
        // Try to find a reified triple
        if (input.length - pos > 1 && input[pos + 1] === '>')
          type = '>>', matchLength = 2;
        break;

      case '_':
        // Try to find a blank node. Since it can contain (but not end with) a dot,
        // we always need a non-dot character before deciding it is a blank node.
        // Therefore, try inserting a space if we're at the end of the input.
        if ((match = execAt(this._blank, input, pos)) ||
            inputFinished && (match = execAtEnd(this._blank, input, pos))) {
          type = 'blank', prefix = '_', value = match[1];
          lexicalLength = match[1].length + 2;
        }
        break;

      case '"':
        // Try to find a literal without escape sequences
        if (match = execAt(this._simpleQuotedString, input, pos))
          value = match[1];
        // Try to find a literal wrapped in three pairs of quotes
        else {
          ({ value, matchLength, finalLineLength, tripleQuoted } = this._parseLiteral(input, pos));
          if (value === null)
            return reportSyntaxError(this, input, pos);
        }
        if (match !== null || matchLength !== 0) {
          type = 'literal';
          this._literalClosingPos = 0;
        }
        break;

      case "'":
        if (!this._lineMode) {
          // Try to find a literal without escape sequences
          if (match = execAt(this._simpleApostropheString, input, pos))
            value = match[1];
          // Try to find a literal wrapped in three pairs of quotes
          else {
            ({ value, matchLength, finalLineLength, tripleQuoted } = this._parseLiteral(input, pos));
            if (value === null)
              return reportSyntaxError(this, input, pos);
          }
          if (match !== null || matchLength !== 0) {
            type = 'literal';
            this._literalClosingPos = 0;
          }
        }
        break;

      case '?':
        // Try to find a variable
        if (this._n3Mode && (match = execAt(this._variable, input, pos)))
          type = 'var', value = match[0];
        break;

      case '@':
        // Try to find a language code. A language code can contain dash-separated
        // subtags, so if the match is immediately followed by a single dash and the
        // input is not finished, another subtag may still arrive in a later chunk and
        // the match would be premature; wait for more input in that case.
        // A double dash starts a direction code, which cannot extend the language code.
        if (this._previousMarker === 'literal' && (match = execAt(this._langcode, input, pos)) && match[1] !== 'version') {
          const end = pos + match[0].length;
          if (!inputFinished && input[end] === '-' && input[end + 1] !== '-')
            match = null;
          else
            type = 'langcode', value = match[1];
        }
        // Try to find a keyword
        else if (match = execAt(this._atKeyword, input, pos))
          type = match[0];
        break;

      case '.':
        // Try to find a dot as punctuation
        if (input.length - pos === 1 ? inputFinished : (input[pos + 1] < '0' || input[pos + 1] > '9')) {
          type = '.';
          matchLength = 1;
          break;
        }
        // Fall through to numerical case (could be a decimal dot)

      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
      case '+':
      case '-':
        if (input[pos + 1] === '-') {
          // Try to find a direction code
          if (this._previousMarker === 'langcode') {
            if (input.startsWith('--ltr', pos))
              type = 'dircode', value = 'ltr', matchLength = 5;
            else if (input.startsWith('--rtl', pos))
              type = 'dircode', value = 'rtl', matchLength = 5;
          }
          break;
        }

        // Try to find a number. Since it can contain (but not end with) a dot,
        // we always need a non-dot character before deciding it is a number.
        // Therefore, try inserting a space if we're at the end of the input.
        if (match = execAt(this._number, input, pos) ||
            inputFinished && (match = execAtEnd(this._number, input, pos))) {
          type = 'literal', value = match[0];
          prefix = (typeof match[1] === 'string' ? xsd$2.double :
                    (typeof match[2] === 'string' ? xsd$2.decimal : xsd$2.integer));
        }
        break;

      case 'B':
      case 'b':
      case 'p':
      case 'P':
      case 'G':
      case 'g':
      case 'V':
      case 'v':
        // Try to find a SPARQL-style keyword
        if (match = execAt(this._keyword, input, pos))
          type = match[0].toUpperCase();
        else
          inconclusive = true;
        break;

      case 'f':
      case 't':
        // Try to match a boolean
        if (testAt(this._boolean, input, pos))
          type = 'literal', value = firstChar === 't' ? 'true' : 'false', prefix = xsd$2.boolean, matchLength = value.length;
        else
          inconclusive = true;
        break;

      case 'a':
        // Try to find an abbreviated predicate
        if (testAt(this._shortPredicates, input, pos))
          type = 'abbreviation', value = 'a', matchLength = 1;
        else
          inconclusive = true;
        break;

      case 'h':
      case 'o':
        // Try to find an N3 verb keyword
        if (this._n3Mode && (match = this._matchN3Verb(input, pos, inputFinished)))
          type = match[0];
        else
          inconclusive = true;
        break;

      case 'i':
        // Try to find an IRI property list identifier or N3 verb keyword
        if (this._n3Mode && testAt(this._n3Id, input, pos))
          type = 'id', matchLength = 2;
        else if (this._n3Mode && (match = this._matchN3Verb(input, pos, inputFinished)))
          type = match[0];
        else
          inconclusive = true;
        break;

      case '=':
        // Try to find an implication arrow or equals sign
        if (this._n3Mode && input.length - pos > 1) {
          type = 'abbreviation';
          if (input[pos + 1] !== '>')
            matchLength = 1, value = '=';
          else
            matchLength = 2, value = '>';
        }
        break;

      case '!':
        if (!this._n3Mode)
          break;
      case ')':
        if (!inputFinished && (input.length - pos === 1 || (input.length - pos === 2 && input[pos + 1] === '>'))) {
          // Don't consume yet, as it *could* become a triple term end.
          break;
        }
        // Try to find a triple term
        if (input.length - pos > 2 && input[pos + 1] === '>' && input[pos + 2] === '>') {
          type = ')>>', matchLength = 3;
          break;
        }
      case ',':
      case ';':
      case '[':
      case ']':
      case '(':
      case '}':
      case '~':
        if (!this._lineMode) {
          matchLength = 1;
          type = firstChar;
        }
        break;
      case '{':
        // We need at least 2 tokens lookahead to distinguish "{|" and "{ "
        if (!this._lineMode && input.length - pos >= 2) {
          // Try to find a quoted triple annotation start
          if (input[pos + 1] === '|')
            type = '{|', matchLength = 2;
          else
            type = firstChar, matchLength = 1;
        }
        break;
      case '|':
        // We need 2 tokens lookahead to parse "|}"
        // Try to find a quoted triple annotation end
        if (input.length - pos >= 2 && input[pos + 1] === '}')
          type = '|}', matchLength = 2;
        break;

      default:
        inconclusive = true;
      }

      // Some first characters do not allow an immediate decision, so inspect more
      if (inconclusive) {
        // Try to find a prefix
        let end;
        if ((this._previousMarker === '@prefix' || this._previousMarker === 'PREFIX') &&
            input.charCodeAt(end = skipPrefix(input, pos)) === COLON &&
            end + 1 < input.length && (input[end + 1] === '#' || input[end + 1] === '<' ||
                                       isWhitespace(input.charCodeAt(end + 1)))) {
          type = 'prefix', value = input.slice(pos, end);
          matchLength = end + 1 - pos;
        }
        // Try to find an additional directive keyword
        // (at the end of the input, only a short final word can be one)
        else if (this._directive !== null && this._directiveStarts.includes(firstChar) &&
                 ((match = execAt(this._directive, input, pos)) ||
                 inputFinished && input.length - pos <= this._directiveMaxLength &&
                 (match = execAtEnd(this._directive, input, pos))))
          type = match[0].toUpperCase();
        // Try to find a prefixed name. Since it can contain (but not end with) a dot,
        // we always need a non-dot character before deciding it is a prefixed name,
        // except at the end of the input.
        else if (!this._lineMode && (end = skipPrefixedName(input, pos, inputFinished)) >= 0) {
          const colon = input.indexOf(':', pos);
          type = 'prefixed', prefix = input.slice(pos, colon);
          value = this._unescape(input.slice(colon + 1, end), localNameEscapeReplacements);
          matchLength = end - pos;
        }
      }

      // A type token is special: it can only be emitted after an IRI or prefixed name is read
      if (this._previousMarker === '^^') {
        switch (type) {
        case 'prefixed': type = 'type';    break;
        case 'IRI':      type = 'typeIRI'; break;
        default:         type = '';
        }
      }

      // What if nothing of the above was found?
      if (!type) {
        // We could be in streaming mode, and then we just wait for more input to arrive.
        // Otherwise, a syntax error has occurred in the input.
        // One exception: error on an unaccounted linebreak (= not inside a triple-quoted literal).
        if (inputFinished || (!input.startsWith("'''", pos) && !input.startsWith('"""', pos) &&
                              /\n|\r/.test(input.slice(pos))))
          return reportSyntaxError(this, input, pos);
        else
          return this._suspend(input, pos, currentLineLength);
      }

      // Emit the parsed token
      // Consumption includes separator whitespace; lexicalLength excludes it
      // and any synthetic EOF space. Consumption is clamped to the input below.
      const length = matchLength || match[0].length;
      const start = currentLineLength - (input.length - pos);
      let token;
      if (finalLineLength) {
        token = {
          type, value, prefix, line, start,
          end: finalLineLength, endLine: this._line, tripleQuoted,
        };
        callback(null, token);
      }
      // Triple-quoted strings are marked, since version declarations do not allow them
      else if (tripleQuoted) {
        token = { type, value, prefix, line, start, end: start + length, tripleQuoted };
        callback(null, token);
      }
      else
        token = emitToken(type, value, prefix, line, start, lexicalLength || length);
      this.previousToken = token;
      // The string of a version declaration cannot take a language tag, so a following @keyword is a keyword
      this._previousMarker = type === 'literal' && (this._previousMarker === 'VERSION' || this._previousMarker === '@version') ? 'version' : type;

      // Advance to next part to tokenize
      pos = Math.min(pos + length, input.length);
      if (finalLineLength)
        currentLineLength = input.length - pos + finalLineLength;
    }

    // Emits a comment at its exact position within matched whitespace.
    function emitComment(value, line, start) {
      callback(null, {
        type: 'comment', value, prefix: '', line,
        start, end: start + value.length + 1,
      });
    }
    // Emits the token through the callback
    function emitToken(type, value, prefix, line, start, length) {
      const token = { type, value, prefix, line, start, end: start + length };
      callback(null, token);
      return token;
    }
    // Signals the syntax error through the callback
    function reportSyntaxError(self, input, pos) {
      callback(self._syntaxError(execAt(nonWhitespace, input, pos)[0]));
    }
  }

  // ### `_suspend` keeps the unconsumed input until more input arrives
  _suspend(input, pos, currentLineLength) {
    this._linePosition = currentLineLength - (input.length - pos);
    return this._input = input.slice(pos);
  }

  // ### `_matchN3Verb` matches an N3 verb unless the input is a longer prefixed name
  _matchN3Verb(input, pos, inputFinished) {
    const verb = execAt(this._n3Verb, input, pos);
    if (!verb)
      return null;

    // Most verb boundaries cannot be part of a prefix, so keep the common path fast.
    // U+1680 and U+FEFF are whitespace to the regular expression but name characters.
    const next = input[pos + verb[0].length];
    if (next !== '-' && next !== '_' && (next < '0' || next > '9') &&
        next !== '\u1680' && next !== '\ufeff')
      return verb;

    // A prefix can start with a verb and continue with characters that are also
    // valid verb boundaries. Prefer the longer prefixed name when it is complete.
    if (skipPrefixedName(input, pos, true) >= 0)
      return null;

    // If a stream chunk ends partway through such a prefix,
    // wait for the colon instead of prematurely emitting the verb.
    if (!inputFinished && skipPrefix(input, pos) === input.length)
      return null;
    return verb;
  }

  // ### `_unescape` replaces N3 escape codes by their corresponding characters,
  // allowing only the fixed escape sequences from the given replacement table
  _unescape(item, replacements) {
    let backslash = item.indexOf('\\');
    if (backslash < 0)
      return item;

    let result = '', start = 0;
    // A trailing lone backslash is not an escape sequence.
    while (backslash >= 0 && backslash + 1 < item.length) {
      const escapedChar = item[backslash + 1];
      let end = backslash + 2, replacement;
      if (escapedChar === 'u' || escapedChar === 'U') {
        end += escapedChar === 'u' ? 4 : 8;
        if (end > item.length)
          return null;

        let charCode = 0;
        for (let i = backslash + 2; i < end; i++) {
          let digit = item.charCodeAt(i);
          if (digit >= 0x30 && digit <= 0x39) // 0–9
            digit -= 0x30;
          else if (digit >= 0x41 && digit <= 0x46) // A–F
            digit -= 0x41 - 10;
          else if (digit >= 0x61 && digit <= 0x66) // a–f
            digit -= 0x61 - 10;
          else
            return null;
          // Eight digits can exceed a signed 32-bit integer; avoid bitwise shifts.
          charCode = charCode * 16 + digit;
        }
        if (!isValidCodePoint(charCode))
          return null;
        replacement = String.fromCodePoint(charCode);
      }
      else {
        if (!(escapedChar in replacements))
          return null;
        replacement = replacements[escapedChar];
      }
      result += item.slice(start, backslash) + replacement;
      start = end;
      backslash = item.indexOf('\\', start);
    }
    return result + item.slice(start);
  }

  // ### `_parseLiteral` parses a literal at the given position into an unescaped value
  _parseLiteral(input, pos) {
    // Ensure we have enough lookahead to identify triple-quoted strings
    if (input.length - pos >= 3) {
      // The caller has already identified a single or double quote.
      const quote = input[pos];
      const openingLength = input[pos + 1] === quote && input[pos + 2] === quote ? 3 : 1;
      let opening = quote;
      if (openingLength === 3)
        opening = quote === '"' ? '"""' : "'''";

      // Find the next candidate closing quotes
      let closingPos = pos + Math.max(this._literalClosingPos, openingLength);
      while ((closingPos = input.indexOf(opening, closingPos)) > pos) {
        // Count backslashes right before the closing quotes
        let backslashCount = 0;
        while (input[closingPos - backslashCount - 1] === '\\')
          backslashCount++;

        // An even number of backslashes (in particular 0)
        // means these are actual, non-escaped closing quotes
        if (backslashCount % 2 === 0) {
          // Extract and unescape the value
          const raw = input.substring(pos + openingLength, closingPos),
              lines = raw.split(/\r\n|\r|\n/),
              lineCount = lines.length - 1;
          const matchLength = closingPos - pos + openingLength;
          // Only triple-quoted strings can be multi-line
          if (openingLength === 1 && lineCount !== 0 ||
              openingLength === 3 && this._lineMode)
            break;
          this._line += lineCount;
          const finalLineLength = lineCount === 0 ? 0 : lines[lines.length - 1].length + openingLength;
          return {
            value: this._unescape(raw, stringEscapeReplacements), matchLength, finalLineLength,
            tripleQuoted: openingLength === 3,
          };
        }
        closingPos++;
      }
      this._literalClosingPos = input.length - pos - openingLength + 1;
    }
    return { value: '', matchLength: 0, finalLineLength: 0, tripleQuoted: false };
  }

  // ### `_tryTokenizeToEnd` tokenizes as far as possible, reporting failures through the callback
  _tryTokenizeToEnd(callback, inputFinished) {
    // Keep track of errors thrown by the callback, which must reach the caller unchanged
    let callbackError;
    try {
      this._tokenizeToEnd((error, token) => {
        try {
          return callback(error, token);
        }
        catch (thrown) {
          throw (callbackError = thrown);
        }
      }, inputFinished);
    }
    catch (error) {
      // Matching an extremely long token can exhaust the regular expression stack
      if (error === callbackError || !(error instanceof RangeError))
        throw error;
      callback(this._syntaxError(null, `Token too long on line ${this._line}.`));
    }
  }

  // ### `_syntaxError` creates a syntax error for the given issue
  _syntaxError(issue, message = `Unexpected "${issue}" on line ${this._line}.`) {
    this._input = null;
    const err = new Error(message);
    err.context = {
      token: undefined,
      line: this._line,
      previousToken: this.previousToken,
    };
    return err;
  }

  // ### `_startTokenization` resets the lexer state for a new input
  _startTokenization() {
    this._line = 1;
    this._linePosition = 0;
    this._previousMarker = undefined;
    this.previousToken = undefined;
    this._literalClosingPos = 0;
    this._input = undefined;
    // Deferred tokenization and stream events can outlive their invocation.
    // Ignore them once a later call takes ownership of the lexer state.
    return this._tokenization = {};
  }

  // ### `_tokenizeString` synchronously emits the tokens of a complete string through the callback,
  // so that the caller can consume each token without the lexer collecting them all first
  _tokenizeString(input, callback) {
    this._startTokenization();
    this._input = this._readStartingBom(input);
    this._tryTokenizeToEnd(callback, true);
  }

  // ### Strips off any starting UTF BOM mark.
  _readStartingBom(input) {
    if (input.startsWith('\ufeff')) {
      this._linePosition = 1;
      return input.slice(1);
    }
    return input;
  }

  // ## Public methods

  // ### `tokenize` starts the transformation of an N3 document into an array of tokens.
  // The input can be a string or a stream.
  // Token ranges use one-based lines and zero-based, end-exclusive UTF-16 columns.
  // Separator whitespace counts towards the next token's start, outside either range.
  // Multiline tokens also have endLine; their end column is relative to that line.
  tokenize(input, callback) {
    const tokenization = this._startTokenization();

    // If the input is a string, continuously emit tokens through the callback until the end
    if (typeof input === 'string') {
      this._input = this._readStartingBom(input);
      // If a callback was passed, asynchronously call it
      if (typeof callback === 'function')
        queueMicrotask(() => {
          if (this._tokenization === tokenization)
            this._tryTokenizeToEnd(callback, true);
        });
      // If no callback was passed, tokenize synchronously and return
      else {
        const tokens = [];
        let error;
        this._tryTokenizeToEnd((e, t) => e ? (error = e) : tokens.push(t), true);
        if (error) throw error;
        return tokens;
      }
    }
    // Otherwise, the input must be a stream
    else {
      let decoder, retryLength = 0;
      if (typeof input.setEncoding === 'function')
        input.setEncoding('utf8');
      // Adds the data chunk to the buffer and parses as far as possible
      input.on('data', data => {
        if (this._tokenization === tokenization && this._input !== null && data.length !== 0) {
          // Decode bytes, keeping an incomplete trailing character for the next chunk
          if (typeof data !== 'string') {
            decoder = decoder || new TextDecoder('utf-8', { ignoreBOM: true });
            if (!(data = decoder.decode(data, { stream: true })))
              return;
          }
          // Only read a BOM at the start
          if (typeof this._input === 'undefined')
            this._input = this._readStartingBom(data);
          else
            this._input += data;
          // Tokenize as far as possible. When a previous attempt left a long unfinished token,
          // wait until the buffered input has doubled, so the token is not rescanned for every chunk.
          if (this._input.length >= retryLength) {
            this._tryTokenizeToEnd(callback, false);
            retryLength = this._input !== null && this._input.length > MIN_RESCAN_LENGTH ?
              2 * this._input.length : 0;
          }
        }
      });
      // Parses until the end
      input.on('end', () => {
        if (this._tokenization === tokenization && this._input !== null) {
          // Decode any incomplete character left at the end
          const rest = decoder ? decoder.decode() : '';
          if (rest)
            this._input = typeof this._input === 'string' ? this._input + rest : rest;
          if (typeof this._input === 'string')
            this._tryTokenizeToEnd(callback, true);
        }
      });
      input.on('error', error => {
        if (this._tokenization === tokenization)
          callback(error);
      });
    }
  }
}

// N3.js implementations of the RDF/JS core data types
// See http://rdf.js.org/data-model-spec/


const { rdf: rdf$1, xsd: xsd$1 } = namespaces;

// eslint-disable-next-line prefer-const
let DEFAULTGRAPH$1;
let _blankNodeCounter = 0;
// The ID of the empty IRI, which cannot be '' as that is the ID of the default graph
const EMPTY_IRI_ID = '<>';

// ## DataFactory singleton
const DataFactory = {
  namedNode,
  blankNode,
  variable,
  literal,
  defaultGraph,
  quad,
  triple: quad,
  fromTerm,
  fromQuad,
};

// ## Term constructor
class Term {
  constructor(id) {
    this.id = id;
  }

  // ### The value of this term
  get value() {
    return this.id;
  }

  // ### Returns whether this object represents the same term as the other
  equals(other) {
    // If both terms were created by this library,
    // equality can be computed through ids of the same term type,
    // since IRIs such as `?x` have the same id as other terms
    if (other instanceof Term)
      return this.id === other.id && this.termType === other.termType;
    // Otherwise, compare term type and value
    return !!other && this.termType === other.termType &&
                      this.value    === other.value;
  }

  // ### Implement hashCode for Immutable.js, since we implement `equals`
  // https://immutable-js.com/docs/v4.0.0/ValueObject/#hashCode()
  hashCode() {
    return 0;
  }

  // ### Returns a plain object representation of this term
  toJSON() {
    return {
      termType: this.termType,
      value:    this.value,
    };
  }
}


// ## NamedNode constructor
class NamedNode extends Term {
  // ### Creates a named node
  /**
   * @deprecated Create named nodes through a data factory instead
   * (`DataFactory.namedNode(iri)`), so that term validation can be applied;
   * the constructor assumes an already-validated IRI.
   */
  constructor(iri) {
    if (iri !== '')
      super(iri);
    // The empty IRI gets a distinct ID, since '' is the ID of the default graph
    else {
      super(EMPTY_IRI_ID);
      Object.defineProperty(this, 'value', { value: '' });
    }
  }

  // ### The term type of this term
  get termType() {
    return 'NamedNode';
  }
}

// ## Literal constructor
class Literal extends Term {
  // ### Creates a literal
  /**
   * @deprecated Create literals through a data factory instead
   * (`DataFactory.literal(value, languageOrDatatype)`), so that term
   * validation can be applied; the constructor takes the internal
   * id representation and assumes it is already valid.
   */
  constructor(id) {
    super(id);
  }

  // ### The term type of this term
  get termType() {
    return 'Literal';
  }

  // ### The text value of this literal
  get value() {
    return this.id.substring(1, this.id.lastIndexOf('"'));
  }

  // ### The language of this literal
  get language() {
    // Find the last quotation mark (e.g., '"abc"@en-us')
    const id = this.id;
    let atPos = id.lastIndexOf('"') + 1;
    const dirPos = id.lastIndexOf('--');
    // If "@" it follows, return the remaining substring; empty otherwise
    return atPos < id.length && id[atPos++] === '@' ? (dirPos > atPos ? id.substr(0, dirPos) : id).substr(atPos).toLowerCase() : '';
  }

  // ### The direction of this literal
  get direction() {
    // Find the last double dash after the closing quote and language tag (e.g., '"abc"@en-us--ltr')
    const id = this.id;
    const endPos = id.lastIndexOf('"');
    const dirPos = id[endPos + 1] === '@' ? id.lastIndexOf('--') : -1;
    return dirPos > endPos && dirPos + 2 < id.length ? id.substr(dirPos + 2).toLowerCase() : '';
  }

  // ### The datatype IRI of this literal
  get datatype() {
    return new NamedNode(this.datatypeString);
  }

  // ### The datatype string of this literal
  get datatypeString() {
    // Find the last quotation mark (e.g., '"abc"^^http://ex.org/types#t')
    const id = this.id, dtPos = id.lastIndexOf('"') + 1;
    const char = dtPos < id.length ? id[dtPos] : '';
    // If "^" it follows, return the remaining substring
    return char === '^' ? id.substr(dtPos + 2) :
           // If "@" follows, return rdf:langString or rdf:dirLangString; xsd:string otherwise
           (char !== '@' ? xsd$1.string : (id.indexOf('--', dtPos) > 0 ? rdf$1.dirLangString : rdf$1.langString));
  }

  // ### Returns whether this object represents the same term as the other
  equals(other) {
    // If both literals were created by this library,
    // equality can be computed through ids
    if (other instanceof Literal)
      return this.id === other.id;
    // Otherwise, compare term type, value, language, and datatype
    return !!other && !!other.datatype &&
                      this.termType === other.termType &&
                      this.value    === other.value    &&
                      this.language === other.language &&
                      ((this.direction === other.direction) || (this.direction === '' && !other.direction)) &&
                      this.datatype.value === other.datatype.value;
  }

  toJSON() {
    return {
      termType:  this.termType,
      value:     this.value,
      language:  this.language,
      direction: this.direction,
      datatype: { termType: 'NamedNode', value: this.datatypeString },
    };
  }
}

// ## BlankNode constructor
class BlankNode extends Term {
  // ### Creates a blank node
  /**
   * @deprecated Create blank nodes through a data factory instead
   * (`DataFactory.blankNode(name)`), so that term validation can be applied;
   * the constructor assumes an already-validated name.
   */
  constructor(name) {
    super(`_:${name}`);
  }

  // ### The term type of this term
  get termType() {
    return 'BlankNode';
  }

  // ### The name of this blank node
  get value() {
    return this.id.substr(2);
  }
}

class Variable extends Term {
  // ### Creates a variable
  /**
   * @deprecated Create variables through a data factory instead
   * (`DataFactory.variable(name)`), so that term validation can be applied;
   * the constructor assumes an already-validated name.
   */
  constructor(name) {
    super(`?${name}`);
  }

  // ### The term type of this term
  get termType() {
    return 'Variable';
  }

  // ### The name of this variable
  get value() {
    return this.id.substr(1);
  }
}

// ## DefaultGraph constructor
class DefaultGraph extends Term {
  // ### Creates the default graph
  /**
   * @deprecated Obtain the default graph through a data factory instead
   * (`DataFactory.defaultGraph()`).
   */
  constructor() {
    super('');
    return DEFAULTGRAPH$1 || this;
  }

  // ### The term type of this term
  get termType() {
    return 'DefaultGraph';
  }

  // ### Returns whether this object represents the same term as the other
  equals(other) {
    // If both terms were created by this library,
    // equality can be computed through strict equality;
    // otherwise, compare term types.
    return (this === other) || (!!other && (this.termType === other.termType));
  }
}

// ## DefaultGraph singleton
DEFAULTGRAPH$1 = new DefaultGraph();

// ### Constructs a term from the given internal string ID
// The third 'nested' parameter of this function is to aid
// with recursion over nested terms. It should not be used
// by consumers of this library.
// See https://github.com/rdfjs/N3.js/pull/311#discussion_r1061042725
function termFromId(id, factory, nested) {
  factory = factory || DataFactory;

  // Falsy value or empty string indicate the default graph
  if (!id)
    return factory.defaultGraph();

  // Identify the term type based on the first character
  switch (id[0]) {
  case '?':
    return factory.variable(id.substr(1));
  case '_':
    return factory.blankNode(id.substr(2));
  case '"':
    // Shortcut for internal literals
    if (factory === DataFactory)
      return new Literal(id);
    // Literal without datatype or language
    if (id[id.length - 1] === '"')
      return factory.literal(id.substr(1, id.length - 2));
    // Literal with datatype or language
    const endPos = id.lastIndexOf('"', id.length - 1);
    let languageOrDatatype;
    if (id[endPos + 1] === '@') {
      languageOrDatatype = id.substr(endPos + 2);
      const dashDashIndex = languageOrDatatype.lastIndexOf('--');
      if (dashDashIndex > 0 && dashDashIndex < languageOrDatatype.length) {
        languageOrDatatype = {
          language: languageOrDatatype.substr(0, dashDashIndex),
          direction: languageOrDatatype.substr(dashDashIndex + 2),
        };
      }
    }
    else {
      languageOrDatatype = factory.namedNode(id.substr(endPos + 3));
    }
    return factory.literal(id.substr(1, endPos - 1),
            languageOrDatatype);
  case '[':
    id = JSON.parse(id);
    break;
  case '<':
    if (id === EMPTY_IRI_ID)
      return factory.namedNode('');
    // falls through
  default:
    if (!nested || !Array.isArray(id)) {
      return factory.namedNode(id);
    }
  }
  return factory.quad(
    termFromId(id[0], factory, true),
    termFromId(id[1], factory, true),
    termFromId(id[2], factory, true),
    id[3] && termFromId(id[3], factory, true),
  );
}

// ### Constructs an internal string ID from the given term or ID string
// The third 'nested' parameter of this function is to aid
// with recursion over nested terms. It should not be used
// by consumers of this library.
// See https://github.com/rdfjs/N3.js/pull/311#discussion_r1061042725
function termToId(term, nested) {
  if (typeof term === 'string')
    return term;
  if (term instanceof Term && term.termType !== 'Quad')
    return term.id;
  if (!term)
    return DEFAULTGRAPH$1.id;

  // Term instantiated with another library
  switch (term.termType) {
  case 'NamedNode': {
    const iri = term.value;
    return iri !== '' ? iri : EMPTY_IRI_ID;
  }
  case 'BlankNode':    return `_:${term.value}`;
  case 'Variable':     return `?${term.value}`;
  case 'DefaultGraph': return '';
  case 'Literal':      return `"${term.value}"${
    term.language ? `@${term.language}${term.direction ? `--${term.direction}` : ''}` :
      (term.datatype && term.datatype.value !== xsd$1.string ? `^^${term.datatype.value}` : '')}`;
  case 'Quad':
    const res = [
      termToId(term.subject, true),
      termToId(term.predicate, true),
      termToId(term.object, true),
    ];
    if (term.graph && term.graph.termType !== 'DefaultGraph') {
      res.push(termToId(term.graph, true));
    }
    return nested ? res : JSON.stringify(res);
  default: throw new Error(`Unexpected termType: ${term.termType}`);
  }
}


// ## Quad constructor
class Quad extends Term {
  // ### Creates a quad
  /**
   * @deprecated Create quads through a data factory instead
   * (`DataFactory.quad(subject, predicate, object, graph)`), so that term
   * validation can be applied; the constructor assumes already-validated terms.
   */
  constructor(subject, predicate, object, graph) {
    super('');
    this._subject   = subject;
    this._predicate = predicate;
    this._object    = object;
    this._graph     = graph || DEFAULTGRAPH$1;
  }

  // ### The term type of this term
  get termType() {
    return 'Quad';
  }

  get subject() {
    return this._subject;
  }

  get predicate() {
    return this._predicate;
  }

  get object() {
    return this._object;
  }

  get graph() {
    return this._graph;
  }

  // ### Returns a plain object representation of this quad
  toJSON() {
    return {
      termType:  this.termType,
      subject:   this._subject.toJSON(),
      predicate: this._predicate.toJSON(),
      object:    this._object.toJSON(),
      graph:     this._graph.toJSON(),
    };
  }

  // ### Returns whether this object represents the same quad as the other
  equals(other) {
    return !!other && this._subject.equals(other.subject)     &&
                      this._predicate.equals(other.predicate) &&
                      this._object.equals(other.object)       &&
                      this._graph.equals(other.graph);
  }
}

// ### Creates an IRI
function namedNode(iri) {
  return new NamedNode(iri);
}

// ### Creates a blank node
function blankNode(name) {
  return new BlankNode(name || `n3-${_blankNodeCounter++}`);
}

// ### Creates a literal
function literal(value, languageOrDataType) {
  // Create a language-tagged string
  if (typeof languageOrDataType === 'string')
    return new Literal(`"${value}"@${languageOrDataType.toLowerCase()}`);

  // Create a language-tagged string with base direction
  if (languageOrDataType !== undefined && !('termType' in languageOrDataType)) {
    return new Literal(`"${value}"@${languageOrDataType.language.toLowerCase()}${languageOrDataType.direction ? `--${languageOrDataType.direction.toLowerCase()}` : ''}`);
  }

  // Automatically determine datatype for booleans, numbers, BigInts, and dates
  let datatype = languageOrDataType ? languageOrDataType.value : '';
  if (datatype === '') {
    // Convert a boolean
    if (typeof value === 'boolean')
      datatype = xsd$1.boolean;
    // Convert an integer or double
    else if (typeof value === 'number') {
      if (Number.isFinite(value))
        // From 1e21 upward, a number's string form turns exponential ("1e+21"),
        // which is not a valid xsd:integer lexical, so type it as xsd:double
        // (the same cut-off as JSON-LD 1.1's Object to RDF Conversion)
        datatype = Number.isInteger(value) && Math.abs(value) < 1e21 ? xsd$1.integer : xsd$1.double;
      else {
        datatype = xsd$1.double;
        if (!Number.isNaN(value))
          value = value > 0 ? 'INF' : '-INF';
      }
    }
    // Convert a BigInt, whose decimal string is always a valid xsd:integer lexical
    else if (typeof value === 'bigint')
      datatype = xsd$1.integer;
    // Convert a valid date
    else if (value instanceof Date && !Number.isNaN(value.getTime())) {
      datatype = xsd$1.dateTime;
      value = value.toISOString();
    }
  }

  // Create a datatyped literal
  return (datatype === '' || datatype === xsd$1.string) ?
    new Literal(`"${value}"`) :
    new Literal(`"${value}"^^${datatype}`);
}

// ### Creates a variable
function variable(name) {
  return new Variable(name);
}

// ### Returns the default graph
function defaultGraph() {
  return DEFAULTGRAPH$1;
}

// ### Creates a quad
function quad(subject, predicate, object, graph) {
  return new Quad(subject, predicate, object, graph);
}

function fromTerm(term) {
  if (term instanceof Term)
    return term;

  // Term instantiated with another library
  switch (term.termType) {
  case 'NamedNode':    return namedNode(term.value);
  case 'BlankNode':    return blankNode(term.value);
  case 'Variable':     return variable(term.value);
  case 'DefaultGraph': return DEFAULTGRAPH$1;
  case 'Literal':      return literal(term.value, !term.language ? term.datatype :
    term.direction ? { language: term.language, direction: term.direction } : term.language);
  case 'Quad':         return fromQuad(term);
  default:             throw new Error(`Unexpected termType: ${term.termType}`);
  }
}

function fromQuad(inQuad) {
  if (inQuad instanceof Quad)
    return inQuad;

  if (inQuad.termType !== 'Quad')
    throw new Error(`Unexpected termType: ${inQuad.termType}`);

  return quad(fromTerm(inQuad.subject), fromTerm(inQuad.predicate), fromTerm(inQuad.object), fromTerm(inQuad.graph));
}

// **N3Parser** parses N3 documents.

let blankNodePrefix = 0;
// Detects `.` and `..` path segments in an IRI
const dotSegments = /(^|\/)\.\.?($|[/#?])/;
// Detects `.` and `..` segments in the path of an IRI, ignoring its query and fragment
const pathDotSegments = /^[^?#]*(?:^|\/)\.\.?(?:$|[/#?])/;

// ## Constructor
class N3Parser {
  constructor(options) {
    this._contextStack = [];
    this._graph = null;

    // Set the document IRI
    options = options || {};
    this._setBase(options.baseIRI);
    options.factory && initDataFactory(this, options.factory);

    // Set supported features depending on the format
    const format = (typeof options.format === 'string') ?
                 options.format.match(/(?:^|\W)(\w*)$/)[1].toLowerCase() : '',
        isTurtle = /turtle/.test(format), isTriG = /trig/.test(format),
        isNTriples = /triple/.test(format), isNQuads = /quad/.test(format),
        isN3 = this._n3Mode = /n3/.test(format),
        isLineMode = isNTriples || isNQuads;
    // Keep inverse handling off the non-N3 emission path
    this._emitCurrent = this._emit;
    if (isN3) {
      this._createQuad = this._createQuadInDirection;
      this._emit = this._emitInDirection;
      this._emitCurrent = this._emitCurrentInDirection;
    }
    if (!(this._supportsNamedGraphs = !(isTurtle || isN3)))
      this._readPredicateOrNamedGraph = this._readPredicate;
    // Support triples in other graphs
    this._supportsQuads = !(isTurtle || isTriG || isNTriples || isN3);
    // Whether the log:isImpliedBy predicate is supported
    this._isImpliedBy = options.isImpliedBy;
    // Whether an undeclared empty prefix resolves against the document IRI
    this._implicitEmptyPrefix = !!options.implicitEmptyPrefix;
    // Whether an empty formula is read as the boolean literal true,
    // as in the N3 spec tests (opt-in until the next major version)
    this._emptyFormulaAsTrue = !!options.emptyFormulaAsTrue;
    // Disable relative IRIs in N-Triples or N-Quads mode
    if (isLineMode)
      this._resolveRelativeIRI = iri => { return null; };
    this._blankNodePrefix = typeof options.blankNodePrefix !== 'string' ? '' :
                              options.blankNodePrefix.replace(/^(?!_:)/, '_:');
    // Map the token types of additional directives (@name and NAME) to their names
    this._directives = null;
    if (options.directives) {
      this._directives = Object.create(null);
      for (const name of options.directives)
        this._directives[`@${name.toLowerCase()}`] = this._directives[name.toUpperCase()] = name;
    }
    this._lexer = options.lexer || new N3Lexer({
      lineMode: isLineMode, n3: isN3, isImpliedBy: this._isImpliedBy, directives: options.directives,
    });
    // Disable explicit quantifiers by default
    this._explicitQuantifiers = !!options.explicitQuantifiers;
    // Disable formula-only blank node scoping by default
    this._formulaScopedBlankNodes = !!options.formulaScopedBlankNodes;
    // Disable parsing of unsupported versions by default
    this._parseUnsupportedVersions = !!options.parseUnsupportedVersions;
    this._version = options.version;
    // Maximum nesting depth of triple terms (default 1024; Infinity disables the limit)
    const maxTripleTermDepth = options.maxTripleTermDepth;
    this._maxTripleTermDepth = maxTripleTermDepth === Infinity ||
      Number.isInteger(maxTripleTermDepth) && maxTripleTermDepth >= 0 ? maxTripleTermDepth : 1024;
  }

  // ## Static class methods

  // ### `_resetBlankNodePrefix` restarts blank node prefix identification
  static _resetBlankNodePrefix() {
    blankNodePrefix = 0;
  }

  // ## Private methods

  // ### `_setBase` sets the base IRI to resolve relative IRIs
  _setBase(baseIRI) {
    if (!baseIRI) {
      this._base = '';
      this._basePath = '';
      this._basePathHasDotSegments = false;
    }
    else {
      // Remove fragment if present
      const fragmentPos = baseIRI.indexOf('#');
      if (fragmentPos >= 0)
        baseIRI = baseIRI.substr(0, fragmentPos);
      // Set base IRI and its components
      this._base = baseIRI;
      const queryPos = baseIRI.indexOf('?');
      const path = queryPos < 0 ? baseIRI : baseIRI.substr(0, queryPos);
      this._basePath   = baseIRI.indexOf('/') < 0 ? baseIRI :
                         path.substr(0, path.lastIndexOf('/') + 1);
      const base = baseIRI;
      baseIRI = baseIRI.match(/^(?:([a-z][a-z0-9+.-]*:))?(\/\/[^\/?#]*)?/i);
      this._baseRoot   = baseIRI[0];
      this._baseScheme = baseIRI[1];
      // If the base has an authority but an empty path,
      // relative IRIs merge under the path '/' (RFC 3986 §5.2.3)
      if (baseIRI[2] !== undefined && (base.length === this._baseRoot.length || base[this._baseRoot.length] === '?'))
        this._basePath = `${this._baseRoot}/`;
      // Check once whether resolving against the base path needs to remove dot segments
      this._basePathHasDotSegments = dotSegments.test(this._basePath);
    }
  }

  // ### `_enterTripleTerm` stores the current parsing context when entering a triple term,
  // failing if triple terms nest deeper than the maximum depth
  _enterTripleTerm(type, subject, predicate, token) {
    if (this._tripleTermDepth >= this._maxTripleTermDepth) {
      this._error(`Triple terms nested deeper than ${this._maxTripleTermDepth} level${this._maxTripleTermDepth === 1 ? '' : 's'}`, token);
      return false;
    }
    this._tripleTermDepth++;
    this._saveContext(type, this._graph, subject, predicate, null);
    this._graph = null;
    return true;
  }

  // ### `_saveContext` stores the current parsing context
  // when entering a new scope (list, blank node, formula)
  _saveContext(type, graph, subject, predicate, object) {
    // Only N3 contexts need the extra parser state.
    if (!this._n3Mode) {
      this._contextStack.push({ type, subject, predicate, object, graph });
      return;
    }
    const context = {
      type,
      subject, predicate, object, graph,
      inverse: this._inversePredicate,
      expectOf: this._expectOf,
      blankPrefix: this._prefixes._,
      prefixChanges: this._prefixChanges,
      quantifiedChanges: this._quantifiedChanges,
      emptyFormula: this._emptyFormula,
    };
    // Prefix and base declarations are scoped to their formula,
    // so record prefix changes to undo them when the formula ends
    if (type === 'formula') {
      context.base = [this._base, this._basePath, this._baseRoot, this._baseScheme,
        this._basePathHasDotSegments];
      this._prefixChanges = [];
    }
    this._contextStack.push(context);
    // Every new scope resets the predicate direction
    this._inversePredicate = false;
    this._expectOf = false;
    // In N3, blank nodes and quantifiers are scoped to a formula;
    // with `formulaScopedBlankNodes`, lists and blank node property lists
    // share the enclosing scope instead of rescoping
    if (!this._formulaScopedBlankNodes || type === 'formula') {
      // Label the scope with the enclosing formula's blank node
      // (using a dot as separator, as a blank node label cannot start with it)
      this._prefixes._ = (this._graph ? `${this._graph.value}.` : '.');
      this._quantifiedChanges = [];
    }
    // A formula starts empty and must not inherit its parent's subject
    if (type === 'formula') {
      this._subject = null;
      this._emptyFormula = true;
    }
  }

  // ### `_restoreContext` restores the parent context
  // when leaving a scope (list, blank node, formula)
  _restoreContext(type, token) {
    // Obtain the previous context
    const context = this._contextStack.pop();
    if (!context || context.type !== type)
      return this._error(`Unexpected ${token.type}`, token);

    // Restore the quad of the previous context
    this._subject   = context.subject;
    this._predicate = context.predicate;
    this._object    = context.object;
    this._graph     = context.graph;

    // Restore N3 context settings
    if (this._n3Mode) {
      this._inversePredicate = context.inverse;
      this._expectOf = context.expectOf;
      if (type === 'formula')
        [this._base, this._basePath, this._baseRoot, this._baseScheme,
          this._basePathHasDotSegments] = context.base;
      if (this._prefixChanges !== context.prefixChanges) {
        undoChanges(this._prefixes, this._prefixChanges);
        this._prefixChanges = context.prefixChanges;
      }
      this._prefixes._ = context.blankPrefix;
      if (this._quantifiedChanges !== context.quantifiedChanges) {
        undoChanges(this._quantified, this._quantifiedChanges);
        this._quantifiedChanges = context.quantifiedChanges;
      }
      this._emptyFormula = context.emptyFormula;
    }
  }

  // ### `_readBeforeTopContext` is called once only at the start of parsing.
  _readBeforeTopContext(token) {
    if (this._version && !this._isValidVersion(this._version))
      return this._error(`Detected unsupported version as media type parameter: "${this._version}"`, token);
    return this._readInTopContext(token);
  }

  // ### `_readInTopContext` reads a token when in the top context
  _readInTopContext(token) {
    switch (token.type) {
    // If an EOF token arrives in the top context, signal that we're done
    case 'eof':
      if (this._graph !== null)
        return this._error('Unclosed graph', token);
      delete this._prefixes._;
      return this._callback(null, null, this._prefixes);
    // It could be a prefix declaration
    case 'PREFIX':
      this._sparqlStyle = true;
    case '@prefix':
      return this._readPrefix;
    // It could be a base declaration
    case 'BASE':
      this._sparqlStyle = true;
    case '@base':
      return this._readBaseIRI;
    // It could be a version declaration
    case 'VERSION':
      this._sparqlStyle = true;
    case '@version':
      return this._readVersion;
    // It could be a graph
    case '{':
      if (this._supportsNamedGraphs) {
        this._graph = '';
        this._subject = null;
        return this._readSubject;
      }
    case 'GRAPH':
      if (this._supportsNamedGraphs)
        return this._readNamedGraphLabel;
    // Otherwise, the next token must be a subject, unless it is an additional directive
    default:
      if (this._directives !== null && token.type in this._directives && this._graph === null) {
        this._sparqlStyle = token.type[0] !== '@';
        this._directiveCallback(this._directives[token.type]);
        return this._readDeclarationPunctuation;
      }
      return this._readSubject(token);
    }
  }

  // ### `_readInFormulaContext` reads a token at the statement level of a formula
  _readInFormulaContext(token) {
    switch (token.type) {
    case 'PREFIX':
      this._sparqlStyle = true;
    case '@prefix':
      return this._readPrefix;
    case 'BASE':
      this._sparqlStyle = true;
    case '@base':
      return this._readBaseIRI;
    default:
      return this._readSubject(token);
    }
  }

  // ### `_getStatementReader` returns the reader for the current statement scope
  _getStatementReader() {
    const context = this._contextStack[this._contextStack.length - 1];
    return context && context.type === 'formula' ? this._readInFormulaContext : this._readInTopContext;
  }

  // ### `_readEntity` reads an IRI, prefixed name, blank node, or variable
  _readEntity(token, quantifier) {
    let value;
    switch (token.type) {
    // Read a relative or absolute IRI
    case 'IRI':
    case 'typeIRI':
      const iri = this._resolveIRI(token.value);
      if (iri === null)
        return this._error('Invalid IRI', token);
      value = this._factory.namedNode(iri);
      break;
    // Read a prefixed name
    case 'type':
    case 'prefixed':
      const prefix = this._prefixes[token.prefix];
      if (prefix === undefined)
        return this._error(`Undefined prefix "${token.prefix}:"`, token);
      value = this._factory.namedNode(prefix + token.value);
      break;
    // Read a blank node
    case 'blank':
      value = this._factory.blankNode(this._prefixes[token.prefix] + token.value);
      break;
    // Read a variable
    case 'var':
      value = this._factory.variable(token.value.substr(1));
      break;
    // Everything else is not an entity
    default:
      return this._error(`Expected entity but got ${token.type}`, token);
    }
    // In N3 mode, replace the entity if it is quantified
    if (!quantifier && this._n3Mode && (value.id in this._quantified))
      value = this._quantified[value.id];
    return value;
  }

  // ### `_readList` starts reading a list in the subject, predicate, or object position
  _readList(token, subject, predicate, object) {
    const stack = this._contextStack, parent = stack.length && stack[stack.length - 1];
    if (parent.type === '<<') {
      return this._error('Unexpected list in reified triple', token);
    }
    // Start a new list
    this._saveContext('list', this._graph, subject, predicate, object);
    this._subject = null;
    return this._readListItem;
  }

  // ### `_readSubject` reads a quad's subject
  _readSubject(token) {
    this._predicate = null;
    // Any statement token means the enclosing formula is not empty
    if (token.type !== '}')
      this._emptyFormula = false;
    switch (token.type) {
    case '[':
      // Start a new quad with a new blank node as subject
      this._saveContext('blank', this._graph,
                        this._subject = this._factory.blankNode(), null, null);
      return this._readBlankNodeHead;
    case '(':
      return this._readList(token, this.RDF_NIL, null, null);
    case '{':
      // Start a new formula
      if (!this._n3Mode)
        return this._error('Unexpected graph', token);
      this._saveContext('formula', this._graph,
                        this._graph = this._factory.blankNode(), null, null);
      return this._readInFormulaContext;
    case '}':
       // No subject; the graph in which we are reading is closed instead
      return this._readPunctuation(token);
    case '@forSome':
      if (!this._n3Mode)
        return this._error('Unexpected "@forSome"', token);
      this._subject = null;
      this._predicate = this.N3_FORSOME;
      this._quantifier = 'blankNode';
      return this._readQuantifierList;
    case '@forAll':
      if (!this._n3Mode)
        return this._error('Unexpected "@forAll"', token);
      this._subject = null;
      this._predicate = this.N3_FORALL;
      this._quantifier = 'variable';
      return this._readQuantifierList;
    case 'literal':
      if (!this._n3Mode)
        return this._error('Unexpected literal', token);

      if (token.prefix.length === 0) {
        this._literalValue = token.value;
        return this._completeSubjectLiteral;
      }
      else {
        this._subject = this._factory.literal(token.value, this._factory.namedNode(token.prefix));
        // This branch is N3-only, so the literal subject might start a path
        return this._getPathReader(this._readPredicateOrNamedGraph);
      }
    case '<<(':
      if (!this._n3Mode)
        return this._error('Disallowed triple term as subject', token);
      return this._enterTripleTerm('<<(', null, null, token) && this._readSubject;
    case '<<':
      return this._enterTripleTerm('<<', null, null, token) && this._readSubject;
    default:
      // Read the subject entity
      if ((this._subject = this._readEntity(token)) === undefined)
        return;
      // In N3 mode, the subject might be a path
      if (this._n3Mode)
        return this._getPathReader(this._readPredicateOrNamedGraph);
    }

    // The next token must be a predicate,
    // or, if the subject was actually a graph IRI, a named graph
    return this._readPredicateOrNamedGraph;
  }

  // ### `_readPredicate` reads a quad's predicate
  _readPredicate(token) {
    const type = token.type;
    let pathable = false;
    switch (type) {
    case 'inverse':
      this._inversePredicate = true;
    case 'abbreviation':
      this._predicate = this.ABBREVIATIONS[token.value];
      break;
    case 'has':
      return this._readPredicateAfterVerb;
    case 'is':
      this._inversePredicate = true;
      this._expectOf = true;
      return this._readPredicateAfterVerb;
    case 'inversePredicate':
      this._inversePredicate = true;
      return this._readPredicateAfterVerb;
    case '|}':
      // Expected predicate didn't come, must have been trailing semicolon
      // or an empty annotation block
      this._subject = null;
      return this._readAnnotationBlockPunctuation(token);
    case '.':
    case ']':
    case '}':
      // Expected predicate didn't come, must have been trailing semicolon.
      // In N3 mode, a subject (such as a path) can be a statement by itself.
      if (this._predicate === null && !this._n3Mode)
        return this._error(`Unexpected ${type}`, token);
      this._subject = null;
      return type === ']' ? this._readBlankNodeTail(token) : this._readPunctuation(token);
    case ';':
      // Additional semicolons can be safely ignored
      return this._predicate !== null ? this._readPredicate :
             this._error('Expected predicate but got ;', token);
    case 'literal':
      if (!this._n3Mode)
        return this._error('Unexpected literal', token);

      if (token.prefix.length === 0) {
        this._literalValue = token.value;
        return this._completePredicateLiteral;
      }
      else
        this._predicate = this._factory.literal(token.value, this._factory.namedNode(token.prefix));

      pathable = true;
      break;
    case '(':
      // In N3, a list can be a predicate
      return this._n3Mode ?
        this._readList(token, this._subject, this.RDF_NIL, null) :
        this._error(`Expected entity but got ${type}`, token);
    case '[':
      if (this._n3Mode) {
        // Start a new quad with a new blank node as subject
        this._saveContext('blank', this._graph, this._subject,
                          this._subject = this._factory.blankNode(), null);
        return this._readBlankNodeHead;
      }
      return this._error('Disallowed blank node as predicate', token);
    case '{':
      // In N3, a formula can be a predicate
      if (this._n3Mode) {
        this._saveContext('formula', this._graph, this._subject,
                          this._graph = this._factory.blankNode(), null);
        return this._readSubject;
      }
      return this._readEntity(token);
    case 'blank':
      if (!this._n3Mode)
        return this._error('Disallowed blank node as predicate', token);
    default:
      if ((this._predicate = this._readEntity(token)) === undefined)
        return;
      pathable = this._n3Mode;
    }
    this._validAnnotation = true;
    // The next token must be an object
    return pathable ? this._getPathReader(this._readObject, 'predicate') : this._readObject;
  }

  // ### `_readPredicateAfterVerb` reads the predicate following `has` or `is`
  _readPredicateAfterVerb(token) {
    if (token.type === 'has' || token.type === 'is' || token.type === 'of' ||
        token.type === 'inversePredicate')
      return this._error(`Expected expression but got ${token.type}`, token);
    return this._readPredicate(token);
  }

  // ### `_readObject` reads a quad's object
  _readObject(token) {
    if (this._expectOf) {
      if (token.type !== 'of')
        return this._error(`Expected of but got ${token.type}`, token);
      this._expectOf = false;
      return this._readObject;
    }
    switch (token.type) {
    case 'literal':
      // Regular literal, can still get a datatype or language
      if (token.prefix.length === 0) {
        this._literalValue = token.value;
        return this._readDataTypeOrLang;
      }
      // Pre-datatyped string literal (prefix stores the datatype)
      else {
        this._object = this._factory.literal(token.value, this._factory.namedNode(token.prefix));
        // In N3 mode, the literal object might start a path
        if (this._n3Mode)
          return this._getPathReader(this._getContextEndReader());
      }
      break;
    case '[':
      // Start a new quad with a new blank node as subject
      this._saveContext('blank', this._graph, this._subject, this._predicate,
                        this._subject = this._factory.blankNode());
      return this._readBlankNodeHead;
    case '(':
      return this._readList(token, this._subject, this._predicate, this.RDF_NIL);
    case '{':
      // Start a new formula
      if (!this._n3Mode)
        return this._error('Unexpected graph', token);
      this._saveContext('formula', this._graph, this._subject, this._predicate,
                        this._graph = this._factory.blankNode());
      return this._readInFormulaContext;
    case '<<(':
      return this._enterTripleTerm('<<(', this._subject, this._predicate, token) && this._readSubject;
    case '<<':
      return this._enterTripleTerm('<<', this._subject, this._predicate, token) && this._readSubject;
    default:
      // Read the object entity
      if ((this._object = this._readEntity(token)) === undefined)
        return;
      // In N3 mode, the object might be a path
      if (this._n3Mode)
        return this._getPathReader(this._getContextEndReader());
    }
    return this._getContextEndReader();
  }

  // ### `_readPredicateOrNamedGraph` reads a quad's predicate, or a named graph
  _readPredicateOrNamedGraph(token) {
    return token.type === '{' ? this._readGraph(token) : this._readPredicate(token);
  }

  // ### `_readGraph` reads a graph
  _readGraph(token) {
    if (token.type !== '{')
      return this._error(`Expected graph but got ${token.type}`, token);
    // The "subject" we read is actually the GRAPH's label
    this._graph = this._subject, this._subject = null;
    return this._readSubject;
  }

  // ### `_readBlankNodeHead` reads the head of a blank node
  _readBlankNodeHead(token) {
    if (token.type === ']') {
      this._subject = null;
      return this._readBlankNodeTail(token);
    }
    else {
      const stack = this._contextStack, parentParent = stack.length > 1 && stack[stack.length - 2];
      if (parentParent.type === '<<') {
        return this._error('Unexpected compound blank node expression in reified triple', token);
      }
      if (token.type === 'id')
        return this._readIriPropertyListId;
      this._predicate = null;
      return this._readPredicate(token);
    }
  }

  // ### `_readIriPropertyListId` replaces a property list's blank node with its IRI
  _readIriPropertyListId(token) {
    const iri = this._readEntity(token);
    if (iri === undefined)
      return;
    if (iri.termType !== 'NamedNode')
      return this._error(`Expected IRI after id but got ${token.type}`, token);

    const placeholder = this._subject;
    this._subject = iri;
    const context = this._contextStack[this._contextStack.length - 1];
    if (context.subject === placeholder)
      context.subject = iri;
    if (context.predicate === placeholder)
      context.predicate = iri;
    if (context.object === placeholder)
      context.object = iri;
    this._predicate = null;
    return this._readIriPropertyListPredicate;
  }

  // ### `_readIriPropertyListPredicate` requires properties after an IRI property list ID
  _readIriPropertyListPredicate(token) {
    if (token.type === ';' || token.type === ']' || token.type === '.' || token.type === '}')
      return this._error(`Expected predicate but got ${token.type}`, token);
    return this._readPredicate(token);
  }

  // ### `_readBlankNodeTail` reads the end of a blank node
  _readBlankNodeTail(token) {
    if (token.type !== ']')
      return this._readBlankNodePunctuation(token);

    // Store blank node quad
    if (this._subject !== null)
      this._emitCurrent(this._subject, this._predicate, this._object, this._graph);

    // Restore the parent context containing this blank node
    const empty = this._predicate === null;
    this._restoreContext('blank', token);
    // If the blank node was the object, restore previous context and read punctuation
    if (this._object !== null)
      return this._getContextEndReader();
    // If the blank node was the predicate, continue reading the object
    else if (this._predicate !== null)
      return this._getPathReader(this._readObject, 'predicate');
    // If the blank node was the subject, continue reading the predicate
    else
      // If the blank node was empty, it could be a named graph label
      return empty ? this._readPredicateOrNamedGraph : this._readPredicateAfterBlank;
  }

  // ### `_readPredicateAfterBlank` reads a predicate after an anonymous blank node
  _readPredicateAfterBlank(token) {
    switch (token.type) {
    case '.':
    case '}':
      // No predicate is coming if the triple is terminated here
      this._subject = null;
      return this._readPunctuation(token);
    default:
      return this._readPredicate(token);
    }
  }

  // ### `_readListItem` reads items from a list
  _readListItem(token) {
    let item = null,                      // The item of the list
        list = null,                      // The list itself
        next = this._readListItem;        // The next function to execute
    const previousList = this._subject,   // The previous list that contains this list
        stack = this._contextStack,       // The stack of parent contexts
        parent = stack[stack.length - 1]; // The parent containing the current list

    switch (token.type) {
    case '[':
      // Stack the current list quad and start a new quad with a blank node as subject
      this._saveContext('blank', this._graph,
                        list = this._factory.blankNode(), this.RDF_FIRST,
                        this._subject = item = this._factory.blankNode());
      next = this._readBlankNodeHead;
      break;
    case '(':
      // Stack the current list quad and start a new list
      this._saveContext('list', this._graph,
                        list = this._factory.blankNode(), this.RDF_FIRST, this.RDF_NIL);
      this._subject = null;
      break;
    case ')':
      // Closing the list; restore the parent context
      this._restoreContext('list', token);
      // If this list is contained within a parent list, return the membership quad here.
      // This will be `<parent list element> rdf:first <this list>.`.
      if (stack.length !== 0 && stack[stack.length - 1].type === 'list') {
        // In N3 mode, this list might be the start of a path
        if (this._n3Mode) {
          // Close this list's tail, as a path would alter the membership quad only
          if (previousList !== null)
            this._emit(previousList, this.RDF_REST, this.RDF_NIL, this._graph);
          // Create a new context to read the path;
          // _readPath will restore the context and output the membership quad
          this._saveContext('item', this._graph, this._subject, this._predicate, this._object);
          this._subject = this._object, this._predicate = null;
          return this._getPathReader(this._readListItem);
        }
        this._emit(this._subject, this._predicate, this._object, this._graph);
      }
      // Was this list the parent's subject?
      if (this._predicate === null) {
        // The next token is the predicate
        next = this._n3Mode ? this._getPathReader(this._readPredicate) : this._readPredicate;
        // No list tail if this was an empty list
        if (this._subject === this.RDF_NIL)
          return next;
      }
      // Was this list the parent's predicate?
      else if (this._object === null) {
        // The next token is the object
        next = this._getPathReader(this._readObject, 'predicate');
        // No list tail if this was an empty list
        if (this._predicate === this.RDF_NIL)
          return next;
      }
      // The list was in the parent context's object
      else {
        next = this._getContextEndReader();
        // In N3 mode, the list object might be the start of a path
        if (this._n3Mode)
          next = this._getPathReader(next);
        // No list tail if this was an empty list
        if (this._object === this.RDF_NIL)
          return next;
      }
      // Close the list by making the head nil
      list = this.RDF_NIL;
      break;
    case 'literal':
      // Regular literal, can still get a datatype or language
      if (token.prefix.length === 0) {
        this._literalValue = token.value;
        next = this._readListItemDataTypeOrLang;
      }
      // Pre-datatyped string literal (prefix stores the datatype)
      else {
        item = this._factory.literal(token.value, this._factory.namedNode(token.prefix));
        next = this._getContextEndReader();
      }
      break;
    case '{':
      // Start a new formula
      if (!this._n3Mode)
        return this._error('Unexpected graph', token);
      // The formula is an item of the list,
      // so it must be linked in the list's graph before the graph changes
      list = this._factory.blankNode();
      item = this._factory.blankNode();
      // Is this the first element of the list?
      if (previousList === null) {
        // This list is either the subject or the object of its parent
        if (parent.predicate === null)
          parent.subject = list;
        else
          parent.object = list;
      }
      else {
        // Continue the previous list with the current list
        this._emit(previousList, this.RDF_REST, list, this._graph);
      }
      // Output the item
      this._emit(list, this.RDF_FIRST, item, this._graph);
      // Stack the current list quad and start the formula
      this._saveContext('formula', this._graph, list, this.RDF_FIRST,
                        this._graph = item);
      this._subject = null;
      return this._readInFormulaContext;
    case '<<(':
    case '<<':
      if (!this._enterTripleTerm(token.type, null, null, token))
        return;
      next = this._readSubject;
      break;
    default:
      if ((item = this._readEntity(token)) === undefined)
        return;
    }

     // Create a new blank node if no item head was assigned yet
    if (list === null)
      this._subject = list = this._factory.blankNode();

    // When reading a reified triple or triple term, store the list as subject in the stack, as this will be overridden when reading the triple.
    if (token.type === '<<' || token.type === '<<(')
      stack[stack.length - 1].subject = this._subject;

    // Is this the first element of the list?
    if (previousList === null) {
      // The list is the subject of the parent
      if (parent.predicate === null)
        parent.subject = list;
      // The list is the predicate of the parent
      else if (parent.object === null)
        parent.predicate = list;
      // The list is the object of the parent
      else
        parent.object = list;
    }
    else {
      // Continue the previous list with the current list
      this._emit(previousList, this.RDF_REST, list, this._graph);
    }
    // If an item was read, add it to the list
    if (item !== null) {
      // In N3 mode, the item might be a path
      if (this._n3Mode && (token.type === 'IRI' || token.type === 'prefixed' ||
                           token.type === 'var' || token.type === 'blank' ||
                           token.type === 'literal')) {
        // Create a new context to add the item's path
        this._saveContext('item', this._graph, list, this.RDF_FIRST, item);
        this._subject = item, this._predicate = null;
        // _readPath will restore the context and output the item
        return this._getPathReader(this._readListItem);
      }
      // Output the item
      this._emit(list, this.RDF_FIRST, item, this._graph);
    }
    return next;
  }

  // ### `_readDataTypeOrLang` reads an _optional_ datatype or language
  _readDataTypeOrLang(token) {
    return this._completeObjectLiteral(token, false);
  }


  // ### `_readListItemDataTypeOrLang` reads an _optional_ datatype or language in a list
  _readListItemDataTypeOrLang(token) {
    return this._completeObjectLiteral(token, true);
  }

  // ### `_completeLiteral` completes a literal with an optional datatype or language
  // Defers possible direction tags without allocating bound callbacks.
  _completeLiteral(token, component) {
    let literal, readCb = false;

    switch (token.type) {
    // Create a datatyped literal
    case 'type':
    case 'typeIRI':
      const datatype = this._readEntity(token);
      if (datatype === undefined) return; // No datatype means an error occurred
      if (datatype.value === namespaces.rdf.langString || datatype.value === namespaces.rdf.dirLangString) {
        return this._error('Detected illegal (directional) languaged-tagged string with explicit datatype', token);
      }
      literal = this._factory.literal(this._literalValue, datatype);
      token = null;
      break;
    // Create a language-tagged string
    case 'langcode':
      if (token.value.split('-').some(t => t.length > 8))
        return this._error('Detected language tag with subtag longer than 8 characters', token);
      literal = this._factory.literal(this._literalValue, token.value);
      this._literalLanguage = token.value;
      token = null;
      // Save state for a possible direction tag
      this._literalComponent = component;
      readCb = true;
      break;
    // Create a simple string literal by default
    default:
      literal = this._factory.literal(this._literalValue);
    }

    return { token, literal, readCb };
  }

  // ### `_readDirCode` reads an optional directional language tag
  _readDirCode(token) {
    const component = this._literalComponent, listItem = this._literalListItem;
    // Attempt to read a dircode
    if (token.type === 'dircode') {
      const term = this._factory.literal(this._literalValue, { language: this._literalLanguage, direction: token.value });
      if (component === 'subject')
        this._subject = term;
      else if (component === 'predicate')
        this._predicate = term;
      else
        this._object = term;
      this._literalLanguage = undefined;
      token = null;
    }

    if (component === 'subject' || component === 'predicate') {
      // A subject or predicate literal implies N3 mode, so it might start a path
      const next = component === 'subject' ? this._readPredicateOrNamedGraph : this._readObject;
      const reader = this._getPathEndReader(token, next, component);
      return reader || next.call(this, token);
    }
    return this._completeObjectLiteralPost(token, listItem);
  }

  // Completes a literal in subject or predicate position
  _completeTermLiteral(token, component) {
    const completed = this._completeLiteral(token, component);
    if (!completed)
      return;

    let next;
    if (component === 'subject') {
      this._subject = completed.literal;
      next = this._readPredicateOrNamedGraph;
    }
    else {
      this._predicate = completed.literal;
      this._validAnnotation = true;
      next = this._readObject;
    }

    // Postpone completion if the literal is only partially completed (such as lang+dir).
    if (completed.readCb) {
      this._literalListItem = false;
      return this._readDirCode;
    }

    // A subject or predicate literal implies N3 mode, so it might start a path.
    const reader = this._getPathEndReader(completed.token, next, component);
    if (reader)
      return reader;

    // Consume the non-path token now
    return next.call(this, completed.token);
  }

  // Completes a literal in subject position
  _completeSubjectLiteral(token) {
    return this._completeTermLiteral(token, 'subject');
  }

  // Completes a literal in predicate position
  _completePredicateLiteral(token) {
    return this._completeTermLiteral(token, 'predicate');
  }

  // Completes a literal in object position
  _completeObjectLiteral(token, listItem) {
    const completed = this._completeLiteral(token, 'object');
    if (!completed)
      return;

    this._object = completed.literal;

    // Postpone completion if the literal is only partially completed (such as lang+dir).
    if (completed.readCb) {
      this._literalListItem = listItem;
      return this._readDirCode;
    }

    return this._completeObjectLiteralPost(completed.token, listItem);
  }

  _completeObjectLiteralPost(token, listItem) {
    // In N3 mode, the literal object might start a path
    if (this._n3Mode && (token === null || token.type === '!' || token.type === '^')) {
      // If this literal was part of a list, defer writing the item;
      // _readPath will then restore the context and output it
      if (listItem) {
        this._saveContext('item', this._graph, this._subject, this.RDF_FIRST, this._object);
        this._subject = this._object, this._predicate = null;
        return this._getPathEndReader(token, this._readListItem);
      }
      return this._getPathEndReader(token, this._getContextEndReader());
    }
    // If this literal was part of a list, write the item
    // (we could also check the context stack, but passing in a flag is faster)
    if (listItem)
      this._emit(this._subject, this.RDF_FIRST, this._object, this._graph);
    // If the token was consumed, continue with the rest of the input
    if (token === null)
      return this._getContextEndReader();
    // Otherwise, consume the token now
    else {
      this._readCallback = this._getContextEndReader();
      return this._readCallback(token);
    }
  }

  // ### `_readFormulaTail` reads the end of a formula
  _readFormulaTail(token) {
    if (token.type !== '}')
      return this._readPunctuation(token);

    // Store the last quad of the formula
    if (this._subject !== null)
      this._emitCurrent(this._subject, this._predicate, this._object, this._graph);

    const formula = this._graph, empty = this._emptyFormula;
    // Restore the parent context containing this formula
    this._restoreContext('formula', token);

    // When the emptyFormulaAsTrue option is set, an empty formula
    // is read as the boolean literal true, following the N3 spec tests
    // and the direction discussed in https://github.com/w3c-cg/N3/issues/185
    if (empty && this._emptyFormulaAsTrue) {
      if (this._subject === formula)
        this._subject = this.N3_TRUE;
      else if (this._predicate === formula)
        this._predicate = this.N3_TRUE;
      else
        this._object = this.N3_TRUE;
    }

    // Continue according to the formula's position in the enclosing statement
    if (this._object !== null)
      return this._getPathReader(this._getContextEndReader(), 'object');
    if (this._predicate !== null)
      return this._getPathReader(this._readObject, 'predicate');
    return this._getPathReader(this._readPredicate, 'subject');
  }

  // ### `_readPunctuation` reads punctuation between quads or quad parts
  _readPunctuation(token) {
    let next, graph = this._graph;
    const subject = this._subject, inversePredicate = this._inversePredicate;
    switch (token.type) {
    // A closing brace ends a graph
    case '}':
      if (this._graph === null)
        return this._error('Unexpected graph closing', token);
      if (this._n3Mode)
        return this._readFormulaTail(token);
      this._graph = null;
    // A dot just ends the statement, without sharing anything with the next
    case '.':
      this._subject = null;
      this._tripleTerm = null;
      next = this._getStatementReader();
      if (inversePredicate) this._inversePredicate = false;
      break;
    // Semicolon means the subject is shared; predicate and object are different
    case ';':
      if (inversePredicate) this._inversePredicate = false;
      next = this._readPredicate;
      break;
    // Comma means both the subject and predicate are shared; the object is different
    case ',':
      next = this._readObject;
      break;
    // A reifier or annotation block annotates the triple just read
    case '~':
    case '{|':
      return this._readAnnotationStart(token);
    // An annotation block can only be closed from within one
    case '|}':
      return this._error('Unexpected annotation syntax closing', token);
    default:
      // An entity means this is a quad (only allowed if not already inside a graph)
      if (this._supportsQuads && this._graph === null && (graph = this._readEntity(token)) !== undefined) {
        next = this._readQuadPunctuation;
        break;
      }
      return this._error(`Expected punctuation to follow "${this._object.id}"`, token);
    }
    // A quad has been completed now, so return it
    if (subject !== null) {
      const predicate = this._predicate, object = this._object;
      this._emit(subject, predicate, object, graph, inversePredicate);
    }
    return next;
  }

    // ### `_readBlankNodePunctuation` reads punctuation in a blank node
  _readBlankNodePunctuation(token) {
    let next, resetInversePredicate = false;
    switch (token.type) {
    // Semicolon means the subject is shared; predicate and object are different
    case ';':
      resetInversePredicate = this._inversePredicate;
      next = this._readPredicate;
      break;
    // Comma means both the subject and predicate are shared; the object is different
    case ',':
      next = this._readObject;
      break;
    // Annotation syntax applies to the quad just read, exactly as it does
    // outside of a blank node property list
    case '~':
    case '{|':
      return this._readAnnotationStart(token);
    case '|}':
      return this._error('Unexpected annotation syntax closing', token);
    default:
      return this._error(`Expected punctuation to follow "${this._object.id}"`, token);
    }
    // A quad has been completed now, so return it
    this._emitCurrent(this._subject, this._predicate, this._object, this._graph);
    if (resetInversePredicate)
      this._inversePredicate = false;
    return next;
  }

  // ### `_readQuadPunctuation` reads punctuation after a quad
  _readQuadPunctuation(token) {
    if (token.type !== '.')
      return this._error('Expected dot to follow quad', token);
    return this._readInTopContext;
  }

  // ### `_readPrefix` reads the prefix of a prefix declaration
  _readPrefix(token) {
    if (token.type !== 'prefix')
      return this._error('Expected prefix to follow @prefix', token);
    this._prefix = token.value;
    return this._readPrefixIRI;
  }

  // ### `_readPrefixIRI` reads the IRI of a prefix declaration
  _readPrefixIRI(token) {
    if (token.type !== 'IRI')
      return this._error(`Expected IRI to follow prefix "${this._prefix}:"`, token);
    const prefixNode = this._readEntity(token);
    if (this._prefixChanges !== null)
      this._prefixChanges.push(this._prefix, this._prefixes[this._prefix]);
    this._prefixes[this._prefix] = prefixNode.value;
    this._prefixCallback(this._prefix, prefixNode);
    return this._readDeclarationPunctuation;
  }

  // ### `_readBaseIRI` reads the IRI of a base declaration
  _readBaseIRI(token) {
    const iri = token.type === 'IRI' && this._resolveIRI(token.value);
    if (!iri)
      return this._error('Expected valid IRI to follow base declaration', token);
    this._setBase(iri);
    return this._readDeclarationPunctuation;
  }

  // ### `_isValidVersion` checks if the given version is valid for this parser to handle.
  _isValidVersion(version) {
    return this._parseUnsupportedVersions || N3Parser.SUPPORTED_VERSIONS.includes(version);
  }

  // ### `_readVersion` reads version string declaration
  _readVersion(token) {
    if (token.type !== 'literal')
      return this._error('Expected literal to follow version declaration', token);
    // Only short strings are allowed, so no numbers or booleans (which have a datatype prefix)
    if (token.prefix !== '' || token.tripleQuoted)
      return this._error('Version declarations must use single quotes', token);
    this._versionCallback(token.value);
    if (!this._isValidVersion(token.value))
      return this._error(`Detected unsupported version: "${token.value}"`, token);
    return this._readDeclarationPunctuation;
  }

  // ### `_readNamedGraphLabel` reads the label of a named graph
  _readNamedGraphLabel(token) {
    switch (token.type) {
    case 'IRI':
    case 'blank':
    case 'prefixed':
      return this._readSubject(token), this._readGraph;
    case '[':
      return this._readNamedGraphBlankLabel;
    default:
      return this._error('Invalid graph label', token);
    }
  }

  // ### `_readNamedGraphLabel` reads a blank node label of a named graph
  _readNamedGraphBlankLabel(token) {
    if (token.type !== ']')
      return this._error('Invalid graph label', token);
    this._subject = this._factory.blankNode();
    return this._readGraph;
  }

  // ### `_readDeclarationPunctuation` reads the punctuation of a declaration
  _readDeclarationPunctuation(token) {
    // SPARQL-style declarations don't have punctuation
    if (this._sparqlStyle) {
      this._sparqlStyle = false;
      return this._getStatementReader().call(this, token);
    }

    if (token.type !== '.')
      return this._error('Expected declaration to end with a dot', token);
    return this._getStatementReader();
  }

  // Reads a list of quantified symbols from a @forSome or @forAll statement
  _readQuantifierList(token) {
    let entity;
    switch (token.type) {
    case 'IRI':
    case 'prefixed':
      if ((entity = this._readEntity(token, true)) !== undefined)
        break;
    default:
      return this._error(`Unexpected ${token.type}`, token);
    }
    // Without explicit quantifiers, map entities to a quantified entity
    if (!this._explicitQuantifiers) {
      if (this._quantifiedChanges !== null)
        this._quantifiedChanges.push(entity.id, this._quantified[entity.id]);
      this._quantified[entity.id] = this._factory[this._quantifier](this._factory.blankNode().value);
    }
    // With explicit quantifiers, output the reified quantifier
    else {
      // If this is the first item, start a new quantifier list
      if (this._subject === null)
        this._emit(this._graph || this.DEFAULTGRAPH, this._predicate,
                   this._subject = this._factory.blankNode(), this.QUANTIFIERS_GRAPH);
      // Otherwise, continue the previous list
      else
        this._emit(this._subject, this.RDF_REST,
                   this._subject = this._factory.blankNode(), this.QUANTIFIERS_GRAPH);
      // Output the list item
      this._emit(this._subject, this.RDF_FIRST, entity, this.QUANTIFIERS_GRAPH);
    }
    return this._readQuantifierPunctuation;
  }

  // Reads punctuation from a @forSome or @forAll statement
  _readQuantifierPunctuation(token) {
    // Read more quantifiers
    if (token.type === ',')
      return this._readQuantifierList;
    // End of the quantifier list
    else {
      // With explicit quantifiers, close the quantifier list
      if (this._explicitQuantifiers) {
        this._emit(this._subject, this.RDF_REST, this.RDF_NIL, this.QUANTIFIERS_GRAPH);
        this._subject = null;
      }
      // Read a dot
      this._readCallback = this._getContextEndReader();
      return this._readCallback(token);
    }
  }

  // ### `_getPathReader` reads a potential path and then resumes with the given function
  _getPathReader(afterPath, position) {
    this._afterPath = afterPath;
    this._pathPosition = position || (this._predicate === null ? 'subject' : 'object');
    return this._readPath;
  }

  // ### `_getPathEndReader` continues reading after a term that might start a path,
  // given the pending token that follows the term (or `null` if it was consumed)
  _getPathEndReader(token, afterPath, position) {
    // Other pending tokens are not handled here
    if (token !== null && token.type !== '!' && token.type !== '^')
      return null;
    const reader = this._getPathReader(afterPath, position);
    // If no token is pending, wait for the next one; otherwise, consume it now
    return token === null ? reader : reader.call(this, token);
  }

  // ### `_readPath` reads a potential path
  _readPath(token) {
    switch (token.type) {
    // Forward path
    case '!': return this._readForwardPath;
    // Backward path
    case '^': return this._readBackwardPath;
    // Not a path; resume reading where we left off
    default:
      const afterPath = this._afterPath;
      const stack = this._contextStack, parent = stack.length && stack[stack.length - 1];
      // If we were reading a list item, we still need to output it
      if (parent && parent.type === 'item') {
        // The list item is the remaining subejct after reading the path
        const item = this._subject;
        // Switch back to the context of the list
        this._restoreContext('item', token);
        // Output the list item
        this._emit(this._subject, this.RDF_FIRST, item, this._graph);
      }
      this._afterPath = null;
      this._pathPosition = null;
      return afterPath.call(this, token);
    }
  }

  // ### `_readForwardPath` reads a '!' path
  _readForwardPath(token) {
    let subject, predicate;
    const object = this._factory.blankNode();
    // The next token is the predicate
    if ((predicate = this._readEntity(token)) === undefined)
      return;
    // Replace the path expression with the generated object in its current position
    if (this._pathPosition === 'subject')
      subject = this._subject, this._subject = object;
    else if (this._pathPosition === 'predicate')
      subject = this._predicate, this._predicate = object;
    else
      subject = this._object,  this._object  = object;
    // Emit the path's current quad and read its next section
    this._emit(subject, predicate, object, this._graph);
    return this._readPath;
  }

  // ### `_readBackwardPath` reads a '^' path
  _readBackwardPath(token) {
    const subject = this._factory.blankNode();
    let predicate, object;
    // The next token is the predicate
    if ((predicate = this._readEntity(token)) === undefined)
      return;
    // Replace the path expression with the generated subject in its current position
    if (this._pathPosition === 'subject')
      object = this._subject, this._subject = subject;
    else if (this._pathPosition === 'predicate')
      object = this._predicate, this._predicate = subject;
    else
      object = this._object,  this._object  = subject;
    // Emit the path's current quad and read its next section
    this._emit(subject, predicate, object, this._graph);
    return this._readPath;
  }

// ### `_readTripleTermTail` reads the end of a triple term
  _readTripleTermTail(token) {
    if (token.type !== ')>>')
      return this._error(`Expected )>> but got ${token.type}`, token);
    // Read the quad and restore the previous context
    const quad = this._createQuad(this._subject, this._predicate, this._object,
        this._graph, this._inversePredicate);
    this._restoreContext('<<(', token);
    this._tripleTermDepth--;

    // If we're in a list, continue processing that list
    const stack = this._contextStack, parent = stack.length && stack[stack.length - 1];
    if (parent && parent.type === 'list') {
      this._emit(this._subject, this.RDF_FIRST, quad, this._graph);
      return this._getContextEndReader();
    }
    // If the triple was the subject, continue by reading the predicate.
    if (this._subject === null) {
      this._subject = quad;
      return this._readPredicate;
    }
    // If the triple was the object, read context end.
    else {
      this._object = quad;
      return this._getContextEndReader();
    }
  }

  // ### `_readReifiedTripleTailOrReifier` reads a reifier or the end of a nested reified triple
  _readReifiedTripleTailOrReifier(token) {
    if (token.type === '~') {
      return this._readReifier;
    }
    return this._readReifiedTripleTail(token);
  }

  // ### `_readReifiedTripleTail` reads the end of a nested reified triple
  _readReifiedTripleTail(token) {
    if (token.type !== '>>')
      return this._error(`Expected >> but got ${token.type}`, token);
    // Read the triple term and restore the previous context
    this._tripleTerm = null;
    const reifier = this._readTripleTerm();
    this._restoreContext('<<', token);
    this._tripleTermDepth--;

    // // If we're in a list, continue processing that list
    const stack = this._contextStack, parent = stack.length && stack[stack.length - 1];
    if (parent && parent.type === 'list') {
      this._emit(this._subject, this.RDF_FIRST, reifier, this._graph);
      return this._getContextEndReader();
    }
    // If the triple was the subject, continue by reading the predicate.
    else if (this._subject === null) {
      this._subject = reifier;
      return this._readPredicateOrReifierTripleEnd;
    }
    // If the triple was the object, read context end.
    else {
      this._object = reifier;
      return this._getContextEndReader();
    }
  }

  _readPredicateOrReifierTripleEnd(token) {
    if (token.type === '.') {
      this._subject = null;
      return this._readPunctuation(token);
    }
    return this._readPredicate(token);
  }

  // ### `_readReifier` reads the triple term identifier after a tilde when in a reifying triple.
  _readReifier(token) {
    // Without an identifier, the reifier is a fresh blank node
    if (token.type === '>>')
      return this._readReifiedTripleTail(token);
    this._reifier = this._readEntity(token);
    return this._readReifiedTripleTail;
  }

  // ### `_readAnnotationStart` reads the first reifier or annotation block after an object,
  // which completes the annotated quad
  _readAnnotationStart(token) {
    this._emitCurrent(this._subject, this._predicate, this._object, this._graph);
    // A new triple is annotated, so its triple term cannot be reused
    this._tripleTerm = null;
    return this._readAnnotation(token);
  }

  // ### `_readAnnotation` reads what follows an annotated quad:
  // further reifiers or annotation blocks for that same quad, or punctuation
  _readAnnotation(token) {
    switch (token.type) {
    case '~':
      return this._readReifierInAnnotation;
    case '{|':
      return this._readAnnotationBlockHead(token);
    }
    // The annotated quad was already emitted when its annotation started,
    // so continue without emitting it a second time
    this._tripleTerm = null;
    switch (token.type) {
    // The subject stays shared with the next predicate-object pair
    case ';':
      this._inversePredicate = false;
      return this._readPredicate;
    // The subject and predicate stay shared with the next object
    case ',':
      return this._readObject;
    default:
      this._subject = null;
      // Resume in the enclosing context
      return this._getContextEndReader().call(this, token);
    }
  }

  // ### `_readReifierInAnnotation` reads the optional reifier after a tilde in annotation syntax
  _readReifierInAnnotation(token) {
    switch (token.type) {
    case 'IRI':
    case 'typeIRI':
    case 'type':
    case 'prefixed':
    case 'blank':
    case 'var':
      this._reifier = this._readEntity(token);
      return this._readAnnotationBlockOrReifier;
    }
    // Without an identifier, the reifier is a fresh blank node
    this._reifier = this._factory.blankNode();
    return this._readAnnotationBlockOrReifier(token);
  }

  // ### `_readAnnotationBlockOrReifier` reads what follows a reifier:
  // either an annotation block, which uses the reifier as its subject,
  // or anything else, in which case the reifier stands alone
  _readAnnotationBlockOrReifier(token) {
    if (token.type === '{|')
      return this._readAnnotationBlockHead(token);
    this._readTripleTerm();
    return this._readAnnotation(token);
  }

  // ### `_readAnnotationBlockHead` opens an annotation block,
  // whose predicate-object pairs describe the reifier of the annotated quad
  _readAnnotationBlockHead(token) {
    const reifier = this._readTripleTerm();
    this._saveContext('annotation', this._graph, this._subject, this._predicate, this._object);
    // Restored when the block closes, so further annotations reuse the same triple term
    this._contextStack[this._contextStack.length - 1].tripleTerm = this._tripleTerm;
    this._subject = reifier;
    this._predicate = this._object = this._tripleTerm = null;
    this._inversePredicate = false;
    this._validAnnotation = false;
    return this._readPredicate;
  }

  // ### `_readAnnotationBlockPunctuation` reads punctuation inside an annotation block
  _readAnnotationBlockPunctuation(token) {
    const stack = this._contextStack;
    if (token.type === '|}') {
      if (!stack.length || stack[stack.length - 1].type !== 'annotation')
        return this._error('Unexpected annotation syntax closing', token);
      if (!this._validAnnotation)
        return this._error('Annotation block can not be empty', token);
      // Emit the last quad of the block, unless a trailing semicolon already did
      if (this._subject !== null)
        this._emitCurrent(this._subject, this._predicate, this._object, this._graph);
      // Return to the annotated quad, which can be followed by more annotations
      const { tripleTerm } = stack[stack.length - 1];
      this._restoreContext('annotation', token);
      this._tripleTerm = tripleTerm;
      return this._readAnnotation;
    }
    // Otherwise, punctuation inside a block works like inside a blank node property list
    return this._readBlankNodePunctuation(token);
  }

  _readTripleTerm() {
    const stack = this._contextStack, parent = stack.length && stack[stack.length - 1];
    const parentGraph = parent ? parent.graph : undefined;
    const reifier = this._reifier || this._factory.blankNode();
    this._reifier = null;
    this._tripleTerm = this._tripleTerm || this._createQuad(
      this._subject, this._predicate, this._object, null, this._inversePredicate,
    );
    this._emit(reifier, this.RDF_REIFIES, this._tripleTerm, parentGraph || this._graph || this.DEFAULTGRAPH);
    return reifier;
  }

  // ### `_getContextEndReader` gets the next reader function at the end of a context
  _getContextEndReader() {
    const contextStack = this._contextStack;
    if (!contextStack.length)
      return this._readPunctuation;

    switch (contextStack[contextStack.length - 1].type) {
    case 'blank':
      return this._readBlankNodeTail;
    case 'list':
      return this._readListItem;
    case 'formula':
      return this._readFormulaTail;
    case '<<(':
      return this._readTripleTermTail;
    case '<<':
      return this._readReifiedTripleTailOrReifier;
    case 'annotation':
      return this._readAnnotationBlockPunctuation;
    }
  }

  // ### `_createQuad` creates a quad
  _createQuad(subject, predicate, object, graph) {
    return this._factory.quad(subject, predicate, object, graph || this.DEFAULTGRAPH);
  }

  // ### `_createQuadInDirection` creates a quad in the active predicate direction
  _createQuadInDirection(subject, predicate, object, graph, inversePredicate) {
    return inversePredicate ?
      this._factory.quad(object, predicate, subject, graph || this.DEFAULTGRAPH) :
      this._factory.quad(subject, predicate, object, graph || this.DEFAULTGRAPH);
  }

  // ### `_emitInDirection` sends a quad in the active predicate direction
  _emitInDirection(subject, predicate, object, graph, inversePredicate) {
    this._callback(null, this._createQuad(subject, predicate, object, graph, inversePredicate));
  }

  // ### `_emitCurrentInDirection` sends a quad in the current predicate direction
  _emitCurrentInDirection(subject, predicate, object, graph) {
    this._callback(null, this._createQuad(subject, predicate, object, graph, this._inversePredicate));
  }

  // ### `_emit` sends a quad through the callback
  _emit(subject, predicate, object, graph) {
    this._callback(null, this._factory.quad(subject, predicate, object, graph || this.DEFAULTGRAPH));
  }

  // ### `_error` emits an error message through the callback
  _error(message, token) {
    // Bound input-derived content while preserving the line suffix and full token context.
    const suffix = ` on line ${token.line}.`;
    if (message.length + suffix.length > 200)
      message = `${message.slice(0, 199 - suffix.length)}…`;
    const err = new Error(`${message}${suffix}`);
    err.context = {
      token: token,
      line: token.line,
      previousToken: this._lexer.previousToken,
    };
    this._callback(err);
    this._callback = noop;
  }

  // ### `_resolveIRI` resolves an IRI against the base path
  _resolveIRI(iri) {
    return /^[a-z][a-z0-9+.-]*:/i.test(iri) ? iri : this._resolveRelativeIRI(iri);
  }

  // ### `_resolveRelativeIRI` resolves an IRI against the base path,
  // assuming that a base path has been set and that the IRI is indeed relative
  _resolveRelativeIRI(iri) {
    // An empty relative IRI indicates the base IRI
    if (!iri.length)
      return this._base;
    // Decide resolving strategy based in the first character
    switch (iri[0]) {
    // Resolve relative fragment IRIs against the base IRI
    case '#': return this._base + iri;
    // Resolve relative query string IRIs by replacing the query string
    case '?': {
      const queryPos = this._base.indexOf('?');
      return (queryPos < 0 ? this._base : this._base.substr(0, queryPos)) + iri;
    }
    // Resolve root-relative IRIs at the root of the base IRI
    case '/':
      // Resolve scheme-relative IRIs to the scheme,
      // keeping the reference's authority intact (RFC 3986 §5.2.4)
      if (iri[1] !== '/')
        return this._baseRoot + this._removeDotSegments(iri);
      // Without a base scheme, a leading ':' marks where the authority starts
      return this._baseScheme ? this._removeDotSegments(this._baseScheme + iri) :
        this._removeDotSegments(`:${iri}`).substr(1);
    // Resolve all other IRIs at the base IRI's path
    default:
      // Relative IRIs cannot contain a colon in the first path segment
      if (/^[^/:]*:/.test(iri))
        return null;
      // Only scan the joined IRI for dot segments if either part can contain them,
      // as the base path can be long and the joined IRI would need to be copied
      return this._basePathHasDotSegments || pathDotSegments.test(iri) ?
        this._removeDotSegments(this._basePath + iri) : this._basePath + iri;
    }
  }

  // ### `_removeDotSegments` resolves './' and '../' path segments in an IRI as per RFC3986
  _removeDotSegments(iri) {
    // Don't modify the IRI if it does not contain any dot segments
    if (!dotSegments.test(iri))
      return iri;

    // Start with an imaginary slash before the IRI in order to resolve trailing './' and '../'
    const length = iri.length;
    let result = '', i = -1, pathStart = -1, segmentStart = 0, next = '/';

    while (i < length) {
      switch (next) {
      // The path starts with the first slash after the authority
      case ':':
        if (pathStart < 0) {
          // Skip two slashes before the authority
          if (iri[++i] === '/' && iri[++i] === '/')
            // Skip to the end of the authority
            while ((pathStart = i + 1) < length && iri[pathStart] !== '/' && iri[pathStart] !== '?' && iri[pathStart] !== '#')
              i = pathStart;
        }
        break;
      // Don't modify a query string or fragment
      case '?':
      case '#':
        i = length;
        break;
      // Handle '/.' or '/..' path segments
      case '/':
        if (iri[i + 1] === '.') {
          next = iri[++i + 1];
          switch (next) {
          // Remove a '/.' segment
          case '/':
            result += iri.substring(segmentStart, i - 1);
            segmentStart = i + 1;
            break;
          // Remove a trailing '/.' segment
          case undefined:
          case '?':
          case '#':
            return result + iri.substring(segmentStart, i) + iri.substr(i + 1);
          // Remove a '/..' segment
          case '.':
            next = iri[++i + 1];
            if (next === undefined || next === '/' || next === '?' || next === '#') {
              result += iri.substring(segmentStart, i - 2);
              // Try to remove the parent path from result
              if ((segmentStart = result.lastIndexOf('/')) >= pathStart)
                result = result.substr(0, segmentStart);
              // Remove a trailing '/..' segment
              if (next !== '/')
                return `${result}/${iri.substr(i + 1)}`;
              segmentStart = i + 1;
            }
          }
        }
      }
      next = iri[++i];
    }
    return result + iri.substring(segmentStart);
  }

  // ## Public methods

  // ### `parse` parses the N3 input and emits each parsed quad through the onQuad callback.
  parse(input, quadCallback, prefixCallback, versionCallback) {
    // The second parameter also accepts an object of named callbacks.
    // As a second and third parameter it still accepts a separate quadCallback and prefixCallback for backward compatibility as well
    let onQuad, onPrefix, onComment, onVersion, onDirective, onToken, onTokenEnd;
    if (quadCallback && (quadCallback.onQuad || quadCallback.onPrefix || quadCallback.onComment || quadCallback.onVersion ||
                         quadCallback.onDirective || quadCallback.onToken || quadCallback.onTokenEnd)) {
      onQuad = quadCallback.onQuad;
      onPrefix = quadCallback.onPrefix;
      onComment = quadCallback.onComment;
      onVersion = quadCallback.onVersion;
      onDirective = quadCallback.onDirective;
      onToken = quadCallback.onToken;
      onTokenEnd = quadCallback.onTokenEnd;
    }
    else {
      onQuad = quadCallback;
      onPrefix = prefixCallback;
      onVersion = versionCallback;
    }
    // The read callback is the next function to be executed when a token arrives.
    // We start reading in the top context.
    this._readCallback = this._readBeforeTopContext;
    // A parse that failed part-way can have left scopes and a statement open
    this._contextStack = [];
    this._graph = this._subject = this._predicate = this._object = null;
    this._tripleTerm = this._reifier = null;
    this._sparqlStyle = false;
    this._prefixes = Object.create(null);
    this._prefixes._ = this._blankNodePrefix ? this._blankNodePrefix.substr(2)
                                             : `b${blankNodePrefix++}_`;
    // Optionally bind the N3 empty prefix to the document's local namespace
    if (this._n3Mode && this._implicitEmptyPrefix && this._base)
      this._prefixes[''] = this._resolveIRI('#');
    this._prefixCallback = onPrefix || noop;
    this._versionCallback = onVersion || noop;
    this._directiveCallback = onDirective || noop;
    this._inversePredicate = false;
    this._expectOf = false;
    this._quantified = Object.create(null);
    // Changes to prefixes and quantifiers in nested scopes, to undo when leaving them
    this._prefixChanges = null;
    this._quantifiedChanges = null;
    this._emptyFormula = false;
    this._tripleTermDepth = 0;

    const readGrammarToken = token => {
      return this._readCallback = this._readCallback(token);
    };
    let readToken = readGrammarToken;

    // Comments bypass the grammar, but participate in the token lifecycle.
    if (onComment || this._lexer.comments) {
      this._lexer.comments = true;
      readToken = token => {
        if (token.type !== 'comment')
          return readGrammarToken(token);
        if (onComment) onComment(token.value);
        return this._readCallback;
      };
    }

    // Install observers once per parse, leaving the ordinary token path intact.
    if (onToken || onTokenEnd) {
      const consumeToken = readToken;
      readToken = token => {
        try {
          try {
            if (onToken) onToken(token);
            return consumeToken(token);
          }
          finally {
            if (onTokenEnd) onTokenEnd(token);
          }
        }
        catch (error) {
          // A consumer exception aborts this parse, including later chunks.
          this._readCallback = null;
          throw error;
        }
      };
    }

    // Parse synchronously if no quad callback is given.
    if (!onQuad) {
      const quads = [];
      let error;
      this._callback = (e, t) => { e ? (error = e) : t && quads.push(t); };
      const lexer = this._lexer;
      // Without callbacks, nothing observes the parse before the whole document
      // has lexed, so tokens can be parsed as they are lexed instead of being
      // collected into an array first. A lexer that replaces the built-in
      // tokenize keeps going through its own implementation.
      if (!onPrefix && !onVersion && !onDirective && !onComment && !onToken && !onTokenEnd &&
          lexer.tokenize === N3Lexer.prototype.tokenize && typeof lexer._tokenizeString === 'function') {
        // A lexical error used to stop the parse before any token was read,
        // so undo base declarations that were read before it
        const base = [this._base, this._basePath, this._baseRoot, this._baseScheme];
        lexer._tokenizeString(input, (e, token) => {
          if (e) {
            [this._base, this._basePath, this._baseRoot, this._baseScheme] = base;
            this._callback(e), this._callback = noop;
          }
          else if (this._readCallback) readToken(token);
        });
      }
      else
        lexer.tokenize(input).every(readToken);
      if (error) throw error;
      return quads;
    }

    const processNextToken = (error, token) => {
      if (error !== null)
        this._callback(error), this._callback = noop;
      else if (this._readCallback)
        readToken(token);
    };

    // Parse asynchronously otherwise, executing the read callback when a token arrives
    this._callback = onQuad;
    this._lexer.tokenize(input, processNextToken);
  }
}

// ### `undoChanges` restores the entries of a map from a list of key and previous value pairs
function undoChanges(map, changes) {
  for (let i = changes.length - 2; i >= 0; i -= 2) {
    if (changes[i + 1] === undefined)
      delete map[changes[i]];
    else
      map[changes[i]] = changes[i + 1];
  }
}

// The empty function
function noop() {}

// Initializes the parser with the given data factory
function initDataFactory(parser, factory) {
  parser._factory = factory;

  parser.DEFAULTGRAPH = factory.defaultGraph();

  // Set common named nodes
  parser.RDF_FIRST   = factory.namedNode(namespaces.rdf.first);
  parser.RDF_REST    = factory.namedNode(namespaces.rdf.rest);
  parser.RDF_NIL     = factory.namedNode(namespaces.rdf.nil);
  parser.RDF_REIFIES = factory.namedNode(namespaces.rdf.reifies);
  parser.N3_FORALL   = factory.namedNode(namespaces.r.forAll);
  parser.N3_FORSOME  = factory.namedNode(namespaces.r.forSome);
  parser.N3_TRUE     = factory.literal('true', factory.namedNode(namespaces.xsd.boolean));
  parser.ABBREVIATIONS = {
    'a': factory.namedNode(namespaces.rdf.type),
    '=': factory.namedNode(namespaces.owl.sameAs),
    '>': factory.namedNode(namespaces.log.implies),
    '<': factory.namedNode(namespaces.log.isImpliedBy),
  };
  parser.QUANTIFIERS_GRAPH = factory.namedNode('urn:n3:quantifiers');
}
N3Parser.SUPPORTED_VERSIONS = [
  '1.2',
  '1.2-basic',
  '1.1',
];
initDataFactory(N3Parser.prototype, DataFactory);

// **N3Util** provides N3 utility functions.


// Tests whether the given term represents an IRI
function isNamedNode(term) {
  return !!term && term.termType === 'NamedNode';
}

// Tests whether the given term represents a blank node
function isBlankNode(term) {
  return !!term && term.termType === 'BlankNode';
}

// Tests whether the given term represents a literal
function isLiteral(term) {
  return !!term && term.termType === 'Literal';
}

// Tests whether the given term represents a variable
function isVariable(term) {
  return !!term && term.termType === 'Variable';
}

// Tests whether the given term represents a quad
function isQuad(term) {
  return !!term && term.termType === 'Quad';
}

// Tests whether the given term represents the default graph
function isDefaultGraph(term) {
  return !!term && term.termType === 'DefaultGraph';
}

// Tests whether the given quad is in the default graph
function inDefaultGraph(quad) {
  return isDefaultGraph(quad.graph);
}

// Creates a function that prepends the given IRI to a local name
function prefix(iri, factory) {
  return prefixes({ '': iri.value || iri }, factory)('');
}

// Creates a function that allows registering and expanding prefixes
function prefixes(defaultPrefixes, factory) {
  // Add all of the default prefixes
  const prefixes = Object.create(null);
  for (const prefix in defaultPrefixes)
    processPrefix(prefix, defaultPrefixes[prefix]);
  // Set the default factory if none was specified
  factory = factory || DataFactory;

  // Registers a new prefix (if an IRI was specified)
  // or retrieves a function that expands an existing prefix (if no IRI was specified)
  function processPrefix(prefix, iri) {
    // Create a new prefix if an IRI is specified or the prefix doesn't exist
    if (typeof iri === 'string') {
      // Create a function that expands the prefix
      const cache = Object.create(null);
      prefixes[prefix] = local => {
        return cache[local] || (cache[local] = factory.namedNode(iri + local));
      };
    }
    else if (!(prefix in prefixes)) {
      throw new Error(`Unknown prefix: ${prefix}`);
    }
    return prefixes[prefix];
  }
  return processPrefix;
}

var Util = /*#__PURE__*/Object.freeze({
  __proto__: null,
  inDefaultGraph: inDefaultGraph,
  isBlankNode: isBlankNode,
  isDefaultGraph: isDefaultGraph,
  isLiteral: isLiteral,
  isNamedNode: isNamedNode,
  isQuad: isQuad,
  isVariable: isVariable,
  prefix: prefix,
  prefixes: prefixes
});

function escapeRegex(regex) {
  return regex.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
}

// Do not handle base IRIs without scheme, and currently unsupported cases:
// - file: IRIs (which could also use backslashes)
// - IRIs containing /. or /.. or //
const BASE_UNSUPPORTED = /^:?[^:?#]*(?:[?#]|$)|^file:|^[^:]*:\/*[^?#]+?\/(?:\.\.?(?:\/|$)|\/)/i;
// Supported suffixes have a first path segment other than . or ..,
// and further path segments of at least 3 characters
const SUFFIX_SUPPORTED = /^(?:(?!\.\.?(?:[/?#]|$))[^/?#]+(?:\/[^/?#]{3,})*\/?)?(?:[?#]|$)/;
const CURRENT = './';
const PARENT = '../';
const QUERY = '?';
const FRAGMENT = '#';

class BaseIRI {
  constructor(base) {
    this.base = base;
    this._baseLength = 0;
    this._baseMatcher = null;
    this._pathReplacements = new Array(base.length + 1);
  }

  static supports(base) {
    return !BASE_UNSUPPORTED.test(base);
  }

  _getBaseMatcher() {
    if (this._baseMatcher)
      return this._baseMatcher;
    if (!BaseIRI.supports(this.base))
      return this._baseMatcher = /.^/;

    // Extract the scheme
    const scheme = /^[^:]*:\/*/.exec(this.base)[0];
    const regexHead = ['^', escapeRegex(scheme)];
    const regexTail = [];

    // Generate a regex for every path segment
    const segments = [], segmenter = /[^/?#]*([/?#])/y;
    let segment, query = 0, fragment = 0, last = segmenter.lastIndex = scheme.length;
    while (!query && !fragment && (segment = segmenter.exec(this.base))) {
      // Truncate base resolution path at fragment start
      if (segment[1] === FRAGMENT)
        fragment = segmenter.lastIndex - 1;
      else {
        // Create regex that matches the segment
        regexHead.push(escapeRegex(segment[0]), '(?:');
        regexTail.push(')?');

        // Create dedicated query string replacement
        if (segment[1] !== QUERY)
          segments.push(last = segmenter.lastIndex);
        else {
          query = last = segmenter.lastIndex;
          fragment = this.base.indexOf(FRAGMENT, query);
          this._pathReplacements[query] = QUERY;
        }
      }
    }

    // Precalculate parent path substitutions
    for (let i = 0; i < segments.length; i++)
      this._pathReplacements[segments[i]] = PARENT.repeat(segments.length - i - 1);
    this._pathReplacements[segments[segments.length - 1]] = CURRENT;

    // Add the remainder of the base IRI (without fragment) to the regex
    this._baseLength = fragment > 0 ? fragment : this.base.length;
    regexHead.push(
      escapeRegex(this.base.substring(last, this._baseLength)),
      query ? '(?:#|$)' : '(?:[?#]|$)',
    );
    return this._baseMatcher = new RegExp([...regexHead, ...regexTail].join(''));
  }

  toRelative(iri) {
    // Unsupported or non-matching base IRI
    const match = this._getBaseMatcher().exec(iri);
    if (!match)
      return iri;

    // Exact base IRI match
    const length = match[0].length;
    if (length === this._baseLength && length === iri.length)
      return '';

    // Parent path match
    const parentPath = this._pathReplacements[length];
    if (parentPath) {
      const suffix = iri.substring(length);
      // Don't abbreviate unsupported path
      if (parentPath !== QUERY && !SUFFIX_SUPPORTED.test(suffix))
        return iri;
      // Omit ./ with fragment or query string,
      // unless the first segment has a colon and would be read as a scheme
      if (parentPath === CURRENT && /^[^?#]/.test(suffix) &&
          (suffix.indexOf(':') < 0 || !/^[^/?#]*:/.test(suffix)))
        return suffix;
      // Append suffix to relative parent path
      return parentPath + suffix;
    }

    // Fragment or query string, so include delimiter
    return iri.substring(length - 1);
  }
}

// **N3Writer** writes N3 documents.

const DEFAULTGRAPH = DataFactory.defaultGraph();

const { rdf, xsd } = namespaces;
const { hasOwnProperty } = Object.prototype;

// Characters that require escaping in Turtle, TriG, and N3,
// where characters outside the Basic Multilingual Plane are escaped as well
const escape    = /["\\\t\n\r\b\f\u0000-\u0019\ud800-\udbff]/,
    escapeAll = /["\\\t\n\r\b\f\u0000-\u0019]|[\ud800-\udbff][\udc00-\udfff]/g,
    // Characters that require escaping in canonical N-Triples and N-Quads:
    // U+0000–U+001F, `"`, `\`, U+007F, U+FFFE, and U+FFFF.
    // A negated class is as fast to test as a shorter class listing characters.
    canonicalEscape    = /[^ !#-\[\]-~\u0080-\uFFFD]/,
    canonicalEscapeAll = /[^ !#-\[\]-~\u0080-\uFFFD]/g,
    escapedCharacters = {
      '\\': '\\\\', '"': '\\"', '\t': '\\t',
      '\n': '\\n', '\r': '\\r', '\b': '\\b', '\f': '\\f',
    };

// Characters that a version label cannot contain
const invalidVersionLabel = /["\\\u0000-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?:^|[^\ud800-\udbff])[\udc00-\udfff]/;

// A local name (PN_LOCAL) as written in a prefixed name, without backslash escapes,
// so that it denotes the same characters as the IRI it is taken from.
// Characters outside the Basic Multilingual Plane are escaped before matching, so they never occur.
const localNameStart = 'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF' +
                       '\\u200C\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD_:0-9',
    localNameChar = `${localNameStart}\\-\\u00B7\\u0300-\\u036F\\u203F\\u2040`,
    percent = '%[0-9A-Fa-f]{2}',
    localName = new RegExp(`^(?:(?:[${localNameStart}]|${percent})` +
                           `(?:(?:[${localNameChar}.]|${percent})*(?:[${localNameChar}]|${percent}))?)?$`);

// ## Placeholder class to represent already pretty-printed terms
class SerializedTerm extends Term {
  // Pretty-printed nodes are not equal to any other node
  // (e.g., [] does not equal [])
  equals(other) {
    return other === this;
  }
}

// ## Constructor
class N3Writer {
  constructor(outputStream, options) {
    // ### `_prefixRegex` matches a prefixed name or IRI that begins with one of the added prefixes
    this._prefixRegex = /$0^/;
    this._hasPrefixes = false;

    // Shift arguments if the first argument is not a stream
    if (outputStream && typeof outputStream.write !== 'function')
      options = outputStream, outputStream = null;
    options = options || {};
    this._lists = options.lists;

    // If no output stream given, send the output as string through the end callback
    if (!outputStream) {
      let output = '';
      this._outputStream = {
        write(chunk, encoding, done) { output += chunk; done && done(); },
        end: done => { done && done(null, output); },
      };
      this._endStream = true;
    }
    else {
      this._outputStream = outputStream;
      this._endStream = options.end === undefined ? true : !!options.end;
    }

    // A version label is written as-is, so it cannot contain characters that need escaping,
    // nor unpaired surrogates (which cannot be encoded)
    if (options.version && invalidVersionLabel.test(options.version))
      throw new Error(`Invalid version label: ${JSON.stringify(options.version)}`);

    // Initialize writer, depending on the format
    this._subject = null;
    if (!(/triple|quad/i).test(options.format)) {
      this._lineMode = false;
      this._escape = escape, this._escapeAll = escapeAll, this._characterReplacer = characterReplacer;
      this._graph = DEFAULTGRAPH;
      if (options.version)
        this._write(`@version "${options.version}".\n`);
      this._prefixIRIs = Object.create(null);
      // Escaped prefix IRIs and names for the prefix matcher, computed once per prefix
      this._prefixPatterns = Object.create(null);
      if (options.baseIRI) {
        this._baseIri = new BaseIRI(options.baseIRI);
        if (options.writeBase)
          this._write(`@base <${options.baseIRI}>.\n`);
      }
      options.prefixes && this.addPrefixes(options.prefixes);
    }
    else {
      this._lineMode = true;
      this._writeQuad = this._writeQuadLine;
      // N-Triples and N-Quads are written in their canonical form
      this._escape = canonicalEscape, this._escapeAll = canonicalEscapeAll;
      this._characterReplacer = canonicalCharacterReplacer;
      if (options.version)
        this._write(`VERSION "${options.version}"\n`);
    }
  }

  // ## Private methods

  // ### Whether the current graph is the default graph
  get _inDefaultGraph() {
    return DEFAULTGRAPH.equals(this._graph);
  }

  // ### `_write` writes the argument to the output stream
  _write(string, callback) {
    this._outputStream.write(string, 'utf8', callback);
  }

  // ### `_endStatement` finishes a pending statement and closes an open graph block
  _endStatement() {
    if (this._subject !== null) {
      this._write(this._inDefaultGraph ? '.\n' : '\n}\n');
      this._subject = null;
      this._graph = DEFAULTGRAPH;
    }
  }

  // ### `_writeQuad` writes the quad to the output stream
  _writeQuad(subject, predicate, object, graph, done) {
    try {
      // Write the graph's label if it has changed
      // (the id-based fast path of `equals` would conflate
      // the empty named node `<>` with the default graph)
      if (graph !== this._graph &&
          (!graph.equals(this._graph) || graph.termType !== this._graph.termType)) {
        // Close the previous graph and start the new one
        this._write((this._subject === null ? '' : (this._inDefaultGraph ? '.\n' : '\n}\n')) +
                    (DEFAULTGRAPH.equals(graph) ? '' : `${this._encodeIriOrBlank(graph)} {\n`));
        this._graph = graph;
        this._subject = null;
      }
      // Don't repeat the subject if it's the same
      if (subject === this._subject || subject.equals(this._subject)) {
        // Don't repeat the predicate if it's the same
        if (predicate === this._predicate || predicate.equals(this._predicate))
          this._write(`, ${this._encodeObject(object)}`, done);
        // Same subject, different predicate
        else
          this._write(`;\n    ${
                      this._encodePredicate(this._predicate = predicate)} ${
                      this._encodeObject(object)}`, done);
      }
      // Different subject; write the whole quad
      else
        this._write(`${(this._subject === null ? '' : '.\n') +
                    this._encodeSubject(this._subject = subject)} ${
                    this._encodePredicate(this._predicate = predicate)} ${
                    this._encodeObject(object)}`, done);
    }
    catch (error) { done && done(error); }
  }

  // ### `_writeQuadLine` writes the quad to the output stream as a single line
  _writeQuadLine(subject, predicate, object, graph, done) {
    // Write the quad without prefixes
    delete this._prefixMatch;
    this._write(this.quadToString(subject, predicate, object, graph), done);
  }

  // ### `quadToString` serializes a quad as a string
  quadToString(subject, predicate, object, graph) {
    return  `${this._encodeSubject(subject)} ${
            predicate.termType === 'Literal' ?
              this._encodeLiteral(predicate) : this._encodeIriOrBlank(predicate)} ${
            this._encodeObject(object)
            }${graph && !isDefaultGraph(graph) ? ` ${this._encodeIriOrBlank(graph)} .\n` : ' .\n'}`;
  }

  // ### `quadsToString` serializes an array of quads as a string
  quadsToString(quads) {
    let quadsString = '';
    for (const quad of quads)
      quadsString += this.quadToString(quad.subject, quad.predicate, quad.object, quad.graph);
    return quadsString;
  }

  // ### `_encodeSubject` represents a subject
  _encodeSubject(entity) {
    switch (entity.termType) {
    case 'Quad':
      return this._encodeQuad(entity);
    // Literal subjects are only valid in N3
    case 'Literal':
      return this._encodeLiteral(entity);
    default:
      return this._encodeIriOrBlank(entity);
    }
  }

  // ### `_encodeIriOrBlank` represents an IRI or blank node
  _encodeIriOrBlank(entity) {
    // A blank node or list is represented as-is
    if (entity.termType !== 'NamedNode') {
      // If it is a list head, pretty-print it
      if (this._lists && hasOwnProperty.call(this._lists, entity.value))
        entity = this.list(this._lists[entity.value]);
      // Terms from this library already hold their serialization as id
      if (entity instanceof Term)
        return entity.id;
      return entity.termType === 'Variable' ? `?${entity.value}` : `_:${entity.value}`;
    }
    let iri = entity.value;
    // Use relative IRIs if requested and possible
    if (this._baseIri) {
      iri = this._baseIri.toRelative(iri);
    }
    // Escape special characters
    if (this._escape.test(iri))
      iri = iri.replace(this._escapeAll, this._characterReplacer);
    // Try to represent the IRI as prefixed name, unless no prefixes were added
    const prefixMatch = this._hasPrefixes ? (this._prefixRegex || this._createPrefixRegex()).exec(iri) : null;
    if (!prefixMatch)
      return `<${iri}>`;
    // An IRI that starts with a registered prefix IRI
    if (prefixMatch[1])
      return this._prefixIRIs[prefixMatch[1]] + prefixMatch[2];
    // An IRI that already looks like a prefixed name, if the rest is a valid local name
    return localName.test(iri.slice(prefixMatch[0].length)) ? iri : `<${iri}>`;
  }

  // ### `_encodeLiteral` represents a literal
  _encodeLiteral(literal) {
    // Escape special characters
    let value = literal.value;
    if (this._escape.test(value))
      value = value.replace(this._escapeAll, this._characterReplacer);

    // Write a language-tagged literal
    const language = literal.language;
    if (language) {
      const literalDirection = literal.direction;
      const direction = literalDirection ? `--${literalDirection}` : '';
      return `"${value}"@${language}${direction}`;
    }

    // Write dedicated literals per data type
    if (this._lineMode) {
      // Only abbreviate strings in N-Triples or N-Quads
      if (literal.datatype.value === xsd.string)
        return `"${value}"`;
    }
    else {
      // Use common datatype abbreviations in Turtle or TriG
      switch (literal.datatype.value) {
      case xsd.string:
        return `"${value}"`;
      case xsd.boolean:
        if (value === 'true' || value === 'false')
          return value;
        break;
      case xsd.integer:
        if (/^[+-]?\d+$/.test(value))
          return value;
        break;
      case xsd.decimal:
        if (/^[+-]?\d*\.\d+$/.test(value))
          return value;
        break;
      case xsd.double:
        if (/^[+-]?(?:\d+\.\d*|\.?\d+)[eE][+-]?\d+$/.test(value))
          return value;
        break;
      }
    }

    // Write a regular datatyped literal
    return `"${value}"^^${this._encodeIriOrBlank(literal.datatype)}`;
  }

  // ### `_encodePredicate` represents a predicate
  _encodePredicate(predicate) {
    switch (predicate.termType) {
    case 'NamedNode':
      return predicate.value === rdf.type ? 'a' : this._encodeIriOrBlank(predicate);
    // Literal predicates are only valid in N3
    case 'Literal':
      return this._encodeLiteral(predicate);
    default:
      return this._encodeIriOrBlank(predicate);
    }
  }

  // ### `_encodeObject` represents an object
  _encodeObject(object) {
    switch (object.termType) {
    case 'Quad':
      return this._encodeQuad(object);
    case 'Literal':
      return this._encodeLiteral(object);
    default:
      return this._encodeIriOrBlank(object);
    }
  }

  // ### `_encodeQuad` encodes an RDF-star quad
  _encodeQuad({ subject, predicate, object, graph }) {
    // Canonical N-Triples and N-Quads put spaces inside the delimiters
    const space = this._lineMode ? ' ' : '';
    return `<<(${space}${
      this._encodeSubject(subject)} ${
      this._encodePredicate(predicate)} ${
      this._encodeObject(object)}${
      isDefaultGraph(graph) ? '' : ` ${this._encodeIriOrBlank(graph)}`}${space})>>`;
  }

  // ### `_blockedWrite` replaces `_write` after the writer has been closed
  _blockedWrite() {
    throw new Error('Cannot write because the writer has been closed.');
  }

  // ### `addQuad` adds the quad to the output stream
  addQuad(subject, predicate, object, graph, done) {
    // The quad was given as an object, so shift parameters
    if (object === undefined)
      this._writeQuad(subject.subject, subject.predicate, subject.object, subject.graph, predicate);
    // The optional `graph` parameter was not provided
    else if (typeof graph === 'function')
      this._writeQuad(subject, predicate, object, DEFAULTGRAPH, graph);
    // The `graph` parameter was provided
    else
      this._writeQuad(subject, predicate, object, graph || DEFAULTGRAPH, done);
  }

  // ### `addQuads` adds the quads to the output stream
  addQuads(quads) {
    for (let i = 0; i < quads.length; i++)
      this.addQuad(quads[i]);
  }

  // ### `addPrefix` adds the prefix to the output stream
  addPrefix(prefix, iri, done) {
    const prefixes = {};
    prefixes[prefix] = iri;
    this.addPrefixes(prefixes, done);
  }

  // ### `addPrefixes` adds the prefixes to the output stream
  addPrefixes(prefixes, done) {
    // Ignore prefixes if not supported by the serialization
    if (!this._prefixIRIs)
      return done && done();

    // Write all new prefixes
    let hasPrefixes = false;
    for (let prefix in prefixes) {
      let iri = prefixes[prefix];
      if (typeof iri !== 'string')
        iri = iri.value;
      hasPrefixes = true;
      // Finish a possible pending quad
      this._endStatement();
      // Store and write the prefix
      this._prefixIRIs[iri] = (prefix += ':');
      this._prefixPatterns[iri] = [escapeRegex(iri), escapeRegex(prefix)];
      this._write(`@prefix ${prefix} <${iri}>.\n`);
    }
    // Recreate the prefix matcher when it is next needed, so that adding
    // prefixes one by one does not rebuild it for every prefix
    if (hasPrefixes) {
      this._hasPrefixes = true;
      this._prefixRegex = null;
    }
    // End a prefix block with a newline
    this._write(hasPrefixes ? '\n' : '', done);
  }

  // ### `_createPrefixRegex` creates the matcher for the current prefixes
  _createPrefixRegex() {
    let IRIlist = '', prefixList = '';
    for (const prefixIRI in this._prefixPatterns) {
      const [IRIpattern, prefixPattern] = this._prefixPatterns[prefixIRI];
      IRIlist += IRIlist ? `|${IRIpattern}` : IRIpattern;
      prefixList += prefixList ? `|${prefixPattern}` : prefixPattern;
    }
    return this._prefixRegex = new RegExp(`^(${IRIlist})([_a-zA-Z0-9](?:\\.?[\\-_a-zA-Z0-9])*)$|` +
                                          `^(?:${prefixList})`);
  }

  // ### `blank` creates a blank node with the given content
  blank(predicate, object) {
    let children = predicate, child, length;
    // Empty blank node
    if (predicate === undefined)
      children = [];
    // Blank node passed as blank(Term("predicate"), Term("object"))
    else if (predicate.termType)
      children = [{ predicate: predicate, object: object }];
    // Blank node passed as blank({ predicate: predicate, object: object })
    else if (!('length' in predicate))
      children = [predicate];

    switch (length = children.length) {
    // Generate an empty blank node
    case 0:
      return new SerializedTerm('[]');
    // Generate a non-nested one-triple blank node
    case 1:
      child = children[0];
      if (!(child.object instanceof SerializedTerm))
        return new SerializedTerm(`[ ${this._encodePredicate(child.predicate)} ${
                                  this._encodeObject(child.object)} ]`);
    // Generate a multi-triple or nested blank node
    default:
      let contents = '[';
      // Write all triples in order
      for (let i = 0; i < length; i++) {
        child = children[i];
        // Write only the object is the predicate is the same as the previous
        if (child.predicate.equals(predicate))
          contents += `, ${this._encodeObject(child.object)}`;
        // Otherwise, write the predicate and the object
        else {
          contents += `${(i ? ';\n  ' : '\n  ') +
                      this._encodePredicate(child.predicate)} ${
                      this._encodeObject(child.object)}`;
          predicate = child.predicate;
        }
      }
      return new SerializedTerm(`${contents}\n]`);
    }
  }

  // ### `list` creates a list node with the given content
  list(elements) {
    const length = elements && elements.length || 0, contents = new Array(length);
    for (let i = 0; i < length; i++)
      contents[i] = this._encodeObject(elements[i]);
    return new SerializedTerm(`(${contents.join(' ')})`);
  }

  // ### `end` signals the end of the output stream
  end(done) {
    // Finish a possible pending quad
    this._endStatement();
    // Disallow further writing
    this._write = this._blockedWrite;

    // Try to end the underlying stream, ensuring done is called exactly one time
    let singleDone = done && ((error, result) => { singleDone = null, done(error, result); });
    if (this._endStream) {
      try { return this._outputStream.end(singleDone); }
      catch (error) { /* error closing stream */ }
    }
    singleDone && singleDone();
  }
}

// Replaces a character by its escaped version
function characterReplacer(character) {
  // Replace a single character by its escaped version
  let result = escapedCharacters[character];
  if (result === undefined) {
    // Replace a single character with its 4-bit unicode escape sequence
    if (character.length === 1) {
      result = character.charCodeAt(0).toString(16);
      result = '\\u0000'.substr(0, 6 - result.length) + result;
    }
    // Replace a surrogate pair with its 8-bit unicode escape sequence
    else {
      result = ((character.charCodeAt(0) - 0xD800) * 0x400 +
                 character.charCodeAt(1) + 0x2400).toString(16);
      result = '\\U00000000'.substr(0, 10 - result.length) + result;
    }
  }
  return result;
}

// Replaces a character by its canonical N-Triples escape:
// a short escape where one exists, and an upper-case `\uXXXX` escape otherwise
function canonicalCharacterReplacer(character) {
  let result = escapedCharacters[character];
  if (result === undefined) {
    result = character.charCodeAt(0).toString(16).toUpperCase();
    result = '\\u0000'.substr(0, 6 - result.length) + result;
  }
  return result;
}

var browser$2 = {exports: {}};

var stream = {exports: {}};

var buffer = {};

var base64Js = {};

var hasRequiredBase64Js;

function requireBase64Js () {
	if (hasRequiredBase64Js) return base64Js;
	hasRequiredBase64Js = 1;

	base64Js.byteLength = byteLength;
	base64Js.toByteArray = toByteArray;
	base64Js.fromByteArray = fromByteArray;

	var lookup = [];
	var revLookup = [];
	var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;

	var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	for (var i = 0, len = code.length; i < len; ++i) {
	  lookup[i] = code[i];
	  revLookup[code.charCodeAt(i)] = i;
	}

	// Support decoding URL-safe base64 strings, as Node.js does.
	// See: https://en.wikipedia.org/wiki/Base64#URL_applications
	revLookup['-'.charCodeAt(0)] = 62;
	revLookup['_'.charCodeAt(0)] = 63;

	function getLens (b64) {
	  var len = b64.length;

	  if (len % 4 > 0) {
	    throw new Error('Invalid string. Length must be a multiple of 4')
	  }

	  // Trim off extra bytes after placeholder bytes are found
	  // See: https://github.com/beatgammit/base64-js/issues/42
	  var validLen = b64.indexOf('=');
	  if (validLen === -1) validLen = len;

	  var placeHoldersLen = validLen === len
	    ? 0
	    : 4 - (validLen % 4);

	  return [validLen, placeHoldersLen]
	}

	// base64 is 4/3 + up to two characters of the original data
	function byteLength (b64) {
	  var lens = getLens(b64);
	  var validLen = lens[0];
	  var placeHoldersLen = lens[1];
	  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
	}

	function _byteLength (b64, validLen, placeHoldersLen) {
	  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
	}

	function toByteArray (b64) {
	  var tmp;
	  var lens = getLens(b64);
	  var validLen = lens[0];
	  var placeHoldersLen = lens[1];

	  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));

	  var curByte = 0;

	  // if there are placeholders, only get up to the last complete 4 chars
	  var len = placeHoldersLen > 0
	    ? validLen - 4
	    : validLen;

	  var i;
	  for (i = 0; i < len; i += 4) {
	    tmp =
	      (revLookup[b64.charCodeAt(i)] << 18) |
	      (revLookup[b64.charCodeAt(i + 1)] << 12) |
	      (revLookup[b64.charCodeAt(i + 2)] << 6) |
	      revLookup[b64.charCodeAt(i + 3)];
	    arr[curByte++] = (tmp >> 16) & 0xFF;
	    arr[curByte++] = (tmp >> 8) & 0xFF;
	    arr[curByte++] = tmp & 0xFF;
	  }

	  if (placeHoldersLen === 2) {
	    tmp =
	      (revLookup[b64.charCodeAt(i)] << 2) |
	      (revLookup[b64.charCodeAt(i + 1)] >> 4);
	    arr[curByte++] = tmp & 0xFF;
	  }

	  if (placeHoldersLen === 1) {
	    tmp =
	      (revLookup[b64.charCodeAt(i)] << 10) |
	      (revLookup[b64.charCodeAt(i + 1)] << 4) |
	      (revLookup[b64.charCodeAt(i + 2)] >> 2);
	    arr[curByte++] = (tmp >> 8) & 0xFF;
	    arr[curByte++] = tmp & 0xFF;
	  }

	  return arr
	}

	function tripletToBase64 (num) {
	  return lookup[num >> 18 & 0x3F] +
	    lookup[num >> 12 & 0x3F] +
	    lookup[num >> 6 & 0x3F] +
	    lookup[num & 0x3F]
	}

	function encodeChunk (uint8, start, end) {
	  var tmp;
	  var output = [];
	  for (var i = start; i < end; i += 3) {
	    tmp =
	      ((uint8[i] << 16) & 0xFF0000) +
	      ((uint8[i + 1] << 8) & 0xFF00) +
	      (uint8[i + 2] & 0xFF);
	    output.push(tripletToBase64(tmp));
	  }
	  return output.join('')
	}

	function fromByteArray (uint8) {
	  var tmp;
	  var len = uint8.length;
	  var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
	  var parts = [];
	  var maxChunkLength = 16383; // must be multiple of 3

	  // go through the array every three bytes, we'll deal with trailing stuff later
	  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
	    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
	  }

	  // pad the end with zeros, but make sure to not forget the extra bytes
	  if (extraBytes === 1) {
	    tmp = uint8[len - 1];
	    parts.push(
	      lookup[tmp >> 2] +
	      lookup[(tmp << 4) & 0x3F] +
	      '=='
	    );
	  } else if (extraBytes === 2) {
	    tmp = (uint8[len - 2] << 8) + uint8[len - 1];
	    parts.push(
	      lookup[tmp >> 10] +
	      lookup[(tmp >> 4) & 0x3F] +
	      lookup[(tmp << 2) & 0x3F] +
	      '='
	    );
	  }

	  return parts.join('')
	}
	return base64Js;
}

var ieee754 = {};

/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */

var hasRequiredIeee754;

function requireIeee754 () {
	if (hasRequiredIeee754) return ieee754;
	hasRequiredIeee754 = 1;
	ieee754.read = function (buffer, offset, isLE, mLen, nBytes) {
	  var e, m;
	  var eLen = (nBytes * 8) - mLen - 1;
	  var eMax = (1 << eLen) - 1;
	  var eBias = eMax >> 1;
	  var nBits = -7;
	  var i = isLE ? (nBytes - 1) : 0;
	  var d = isLE ? -1 : 1;
	  var s = buffer[offset + i];

	  i += d;

	  e = s & ((1 << (-nBits)) - 1);
	  s >>= (-nBits);
	  nBits += eLen;
	  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

	  m = e & ((1 << (-nBits)) - 1);
	  e >>= (-nBits);
	  nBits += mLen;
	  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

	  if (e === 0) {
	    e = 1 - eBias;
	  } else if (e === eMax) {
	    return m ? NaN : ((s ? -1 : 1) * Infinity)
	  } else {
	    m = m + Math.pow(2, mLen);
	    e = e - eBias;
	  }
	  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
	};

	ieee754.write = function (buffer, value, offset, isLE, mLen, nBytes) {
	  var e, m, c;
	  var eLen = (nBytes * 8) - mLen - 1;
	  var eMax = (1 << eLen) - 1;
	  var eBias = eMax >> 1;
	  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
	  var i = isLE ? 0 : (nBytes - 1);
	  var d = isLE ? 1 : -1;
	  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

	  value = Math.abs(value);

	  if (isNaN(value) || value === Infinity) {
	    m = isNaN(value) ? 1 : 0;
	    e = eMax;
	  } else {
	    e = Math.floor(Math.log(value) / Math.LN2);
	    if (value * (c = Math.pow(2, -e)) < 1) {
	      e--;
	      c *= 2;
	    }
	    if (e + eBias >= 1) {
	      value += rt / c;
	    } else {
	      value += rt * Math.pow(2, 1 - eBias);
	    }
	    if (value * c >= 2) {
	      e++;
	      c /= 2;
	    }

	    if (e + eBias >= eMax) {
	      m = 0;
	      e = eMax;
	    } else if (e + eBias >= 1) {
	      m = ((value * c) - 1) * Math.pow(2, mLen);
	      e = e + eBias;
	    } else {
	      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
	      e = 0;
	    }
	  }

	  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

	  e = (e << mLen) | m;
	  eLen += mLen;
	  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

	  buffer[offset + i - d] |= s * 128;
	};
	return ieee754;
}

/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

var hasRequiredBuffer;

function requireBuffer () {
	if (hasRequiredBuffer) return buffer;
	hasRequiredBuffer = 1;
	(function (exports$1) {

		const base64 = requireBase64Js();
		const ieee754 = requireIeee754();
		const customInspectSymbol =
		  (typeof Symbol === 'function' && typeof Symbol['for'] === 'function') // eslint-disable-line dot-notation
		    ? Symbol['for']('nodejs.util.inspect.custom') // eslint-disable-line dot-notation
		    : null;

		exports$1.Buffer = Buffer;
		exports$1.SlowBuffer = SlowBuffer;
		exports$1.INSPECT_MAX_BYTES = 50;

		const K_MAX_LENGTH = 0x7fffffff;
		exports$1.kMaxLength = K_MAX_LENGTH;

		/**
		 * If `Buffer.TYPED_ARRAY_SUPPORT`:
		 *   === true    Use Uint8Array implementation (fastest)
		 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
		 *               implementation (most compatible, even IE6)
		 *
		 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
		 * Opera 11.6+, iOS 4.2+.
		 *
		 * We report that the browser does not support typed arrays if the are not subclassable
		 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
		 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
		 * for __proto__ and has a buggy typed array implementation.
		 */
		Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport();

		if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
		    typeof console.error === 'function') {
		  console.error(
		    'This browser lacks typed array (Uint8Array) support which is required by ' +
		    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
		  );
		}

		function typedArraySupport () {
		  // Can typed array instances can be augmented?
		  try {
		    const arr = new Uint8Array(1);
		    const proto = { foo: function () { return 42 } };
		    Object.setPrototypeOf(proto, Uint8Array.prototype);
		    Object.setPrototypeOf(arr, proto);
		    return arr.foo() === 42
		  } catch (e) {
		    return false
		  }
		}

		Object.defineProperty(Buffer.prototype, 'parent', {
		  enumerable: true,
		  get: function () {
		    if (!Buffer.isBuffer(this)) return undefined
		    return this.buffer
		  }
		});

		Object.defineProperty(Buffer.prototype, 'offset', {
		  enumerable: true,
		  get: function () {
		    if (!Buffer.isBuffer(this)) return undefined
		    return this.byteOffset
		  }
		});

		function createBuffer (length) {
		  if (length > K_MAX_LENGTH) {
		    throw new RangeError('The value "' + length + '" is invalid for option "size"')
		  }
		  // Return an augmented `Uint8Array` instance
		  const buf = new Uint8Array(length);
		  Object.setPrototypeOf(buf, Buffer.prototype);
		  return buf
		}

		/**
		 * The Buffer constructor returns instances of `Uint8Array` that have their
		 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
		 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
		 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
		 * returns a single octet.
		 *
		 * The `Uint8Array` prototype remains unmodified.
		 */

		function Buffer (arg, encodingOrOffset, length) {
		  // Common case.
		  if (typeof arg === 'number') {
		    if (typeof encodingOrOffset === 'string') {
		      throw new TypeError(
		        'The "string" argument must be of type string. Received type number'
		      )
		    }
		    return allocUnsafe(arg)
		  }
		  return from(arg, encodingOrOffset, length)
		}

		Buffer.poolSize = 8192; // not used by this implementation

		function from (value, encodingOrOffset, length) {
		  if (typeof value === 'string') {
		    return fromString(value, encodingOrOffset)
		  }

		  if (ArrayBuffer.isView(value)) {
		    return fromArrayView(value)
		  }

		  if (value == null) {
		    throw new TypeError(
		      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
		      'or Array-like Object. Received type ' + (typeof value)
		    )
		  }

		  if (isInstance(value, ArrayBuffer) ||
		      (value && isInstance(value.buffer, ArrayBuffer))) {
		    return fromArrayBuffer(value, encodingOrOffset, length)
		  }

		  if (typeof SharedArrayBuffer !== 'undefined' &&
		      (isInstance(value, SharedArrayBuffer) ||
		      (value && isInstance(value.buffer, SharedArrayBuffer)))) {
		    return fromArrayBuffer(value, encodingOrOffset, length)
		  }

		  if (typeof value === 'number') {
		    throw new TypeError(
		      'The "value" argument must not be of type number. Received type number'
		    )
		  }

		  const valueOf = value.valueOf && value.valueOf();
		  if (valueOf != null && valueOf !== value) {
		    return Buffer.from(valueOf, encodingOrOffset, length)
		  }

		  const b = fromObject(value);
		  if (b) return b

		  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
		      typeof value[Symbol.toPrimitive] === 'function') {
		    return Buffer.from(value[Symbol.toPrimitive]('string'), encodingOrOffset, length)
		  }

		  throw new TypeError(
		    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
		    'or Array-like Object. Received type ' + (typeof value)
		  )
		}

		/**
		 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
		 * if value is a number.
		 * Buffer.from(str[, encoding])
		 * Buffer.from(array)
		 * Buffer.from(buffer)
		 * Buffer.from(arrayBuffer[, byteOffset[, length]])
		 **/
		Buffer.from = function (value, encodingOrOffset, length) {
		  return from(value, encodingOrOffset, length)
		};

		// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
		// https://github.com/feross/buffer/pull/148
		Object.setPrototypeOf(Buffer.prototype, Uint8Array.prototype);
		Object.setPrototypeOf(Buffer, Uint8Array);

		function assertSize (size) {
		  if (typeof size !== 'number') {
		    throw new TypeError('"size" argument must be of type number')
		  } else if (size < 0) {
		    throw new RangeError('The value "' + size + '" is invalid for option "size"')
		  }
		}

		function alloc (size, fill, encoding) {
		  assertSize(size);
		  if (size <= 0) {
		    return createBuffer(size)
		  }
		  if (fill !== undefined) {
		    // Only pay attention to encoding if it's a string. This
		    // prevents accidentally sending in a number that would
		    // be interpreted as a start offset.
		    return typeof encoding === 'string'
		      ? createBuffer(size).fill(fill, encoding)
		      : createBuffer(size).fill(fill)
		  }
		  return createBuffer(size)
		}

		/**
		 * Creates a new filled Buffer instance.
		 * alloc(size[, fill[, encoding]])
		 **/
		Buffer.alloc = function (size, fill, encoding) {
		  return alloc(size, fill, encoding)
		};

		function allocUnsafe (size) {
		  assertSize(size);
		  return createBuffer(size < 0 ? 0 : checked(size) | 0)
		}

		/**
		 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
		 * */
		Buffer.allocUnsafe = function (size) {
		  return allocUnsafe(size)
		};
		/**
		 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
		 */
		Buffer.allocUnsafeSlow = function (size) {
		  return allocUnsafe(size)
		};

		function fromString (string, encoding) {
		  if (typeof encoding !== 'string' || encoding === '') {
		    encoding = 'utf8';
		  }

		  if (!Buffer.isEncoding(encoding)) {
		    throw new TypeError('Unknown encoding: ' + encoding)
		  }

		  const length = byteLength(string, encoding) | 0;
		  let buf = createBuffer(length);

		  const actual = buf.write(string, encoding);

		  if (actual !== length) {
		    // Writing a hex string, for example, that contains invalid characters will
		    // cause everything after the first invalid character to be ignored. (e.g.
		    // 'abxxcd' will be treated as 'ab')
		    buf = buf.slice(0, actual);
		  }

		  return buf
		}

		function fromArrayLike (array) {
		  const length = array.length < 0 ? 0 : checked(array.length) | 0;
		  const buf = createBuffer(length);
		  for (let i = 0; i < length; i += 1) {
		    buf[i] = array[i] & 255;
		  }
		  return buf
		}

		function fromArrayView (arrayView) {
		  if (isInstance(arrayView, Uint8Array)) {
		    const copy = new Uint8Array(arrayView);
		    return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength)
		  }
		  return fromArrayLike(arrayView)
		}

		function fromArrayBuffer (array, byteOffset, length) {
		  if (byteOffset < 0 || array.byteLength < byteOffset) {
		    throw new RangeError('"offset" is outside of buffer bounds')
		  }

		  if (array.byteLength < byteOffset + (length || 0)) {
		    throw new RangeError('"length" is outside of buffer bounds')
		  }

		  let buf;
		  if (byteOffset === undefined && length === undefined) {
		    buf = new Uint8Array(array);
		  } else if (length === undefined) {
		    buf = new Uint8Array(array, byteOffset);
		  } else {
		    buf = new Uint8Array(array, byteOffset, length);
		  }

		  // Return an augmented `Uint8Array` instance
		  Object.setPrototypeOf(buf, Buffer.prototype);

		  return buf
		}

		function fromObject (obj) {
		  if (Buffer.isBuffer(obj)) {
		    const len = checked(obj.length) | 0;
		    const buf = createBuffer(len);

		    if (buf.length === 0) {
		      return buf
		    }

		    obj.copy(buf, 0, 0, len);
		    return buf
		  }

		  if (obj.length !== undefined) {
		    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
		      return createBuffer(0)
		    }
		    return fromArrayLike(obj)
		  }

		  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
		    return fromArrayLike(obj.data)
		  }
		}

		function checked (length) {
		  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
		  // length is NaN (which is otherwise coerced to zero.)
		  if (length >= K_MAX_LENGTH) {
		    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
		                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
		  }
		  return length | 0
		}

		function SlowBuffer (length) {
		  if (+length != length) { // eslint-disable-line eqeqeq
		    length = 0;
		  }
		  return Buffer.alloc(+length)
		}

		Buffer.isBuffer = function isBuffer (b) {
		  return b != null && b._isBuffer === true &&
		    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
		};

		Buffer.compare = function compare (a, b) {
		  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength);
		  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength);
		  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
		    throw new TypeError(
		      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
		    )
		  }

		  if (a === b) return 0

		  let x = a.length;
		  let y = b.length;

		  for (let i = 0, len = Math.min(x, y); i < len; ++i) {
		    if (a[i] !== b[i]) {
		      x = a[i];
		      y = b[i];
		      break
		    }
		  }

		  if (x < y) return -1
		  if (y < x) return 1
		  return 0
		};

		Buffer.isEncoding = function isEncoding (encoding) {
		  switch (String(encoding).toLowerCase()) {
		    case 'hex':
		    case 'utf8':
		    case 'utf-8':
		    case 'ascii':
		    case 'latin1':
		    case 'binary':
		    case 'base64':
		    case 'ucs2':
		    case 'ucs-2':
		    case 'utf16le':
		    case 'utf-16le':
		      return true
		    default:
		      return false
		  }
		};

		Buffer.concat = function concat (list, length) {
		  if (!Array.isArray(list)) {
		    throw new TypeError('"list" argument must be an Array of Buffers')
		  }

		  if (list.length === 0) {
		    return Buffer.alloc(0)
		  }

		  let i;
		  if (length === undefined) {
		    length = 0;
		    for (i = 0; i < list.length; ++i) {
		      length += list[i].length;
		    }
		  }

		  const buffer = Buffer.allocUnsafe(length);
		  let pos = 0;
		  for (i = 0; i < list.length; ++i) {
		    let buf = list[i];
		    if (isInstance(buf, Uint8Array)) {
		      if (pos + buf.length > buffer.length) {
		        if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
		        buf.copy(buffer, pos);
		      } else {
		        Uint8Array.prototype.set.call(
		          buffer,
		          buf,
		          pos
		        );
		      }
		    } else if (!Buffer.isBuffer(buf)) {
		      throw new TypeError('"list" argument must be an Array of Buffers')
		    } else {
		      buf.copy(buffer, pos);
		    }
		    pos += buf.length;
		  }
		  return buffer
		};

		function byteLength (string, encoding) {
		  if (Buffer.isBuffer(string)) {
		    return string.length
		  }
		  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
		    return string.byteLength
		  }
		  if (typeof string !== 'string') {
		    throw new TypeError(
		      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
		      'Received type ' + typeof string
		    )
		  }

		  const len = string.length;
		  const mustMatch = (arguments.length > 2 && arguments[2] === true);
		  if (!mustMatch && len === 0) return 0

		  // Use a for loop to avoid recursion
		  let loweredCase = false;
		  for (;;) {
		    switch (encoding) {
		      case 'ascii':
		      case 'latin1':
		      case 'binary':
		        return len
		      case 'utf8':
		      case 'utf-8':
		        return utf8ToBytes(string).length
		      case 'ucs2':
		      case 'ucs-2':
		      case 'utf16le':
		      case 'utf-16le':
		        return len * 2
		      case 'hex':
		        return len >>> 1
		      case 'base64':
		        return base64ToBytes(string).length
		      default:
		        if (loweredCase) {
		          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
		        }
		        encoding = ('' + encoding).toLowerCase();
		        loweredCase = true;
		    }
		  }
		}
		Buffer.byteLength = byteLength;

		function slowToString (encoding, start, end) {
		  let loweredCase = false;

		  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
		  // property of a typed array.

		  // This behaves neither like String nor Uint8Array in that we set start/end
		  // to their upper/lower bounds if the value passed is out of range.
		  // undefined is handled specially as per ECMA-262 6th Edition,
		  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
		  if (start === undefined || start < 0) {
		    start = 0;
		  }
		  // Return early if start > this.length. Done here to prevent potential uint32
		  // coercion fail below.
		  if (start > this.length) {
		    return ''
		  }

		  if (end === undefined || end > this.length) {
		    end = this.length;
		  }

		  if (end <= 0) {
		    return ''
		  }

		  // Force coercion to uint32. This will also coerce falsey/NaN values to 0.
		  end >>>= 0;
		  start >>>= 0;

		  if (end <= start) {
		    return ''
		  }

		  if (!encoding) encoding = 'utf8';

		  while (true) {
		    switch (encoding) {
		      case 'hex':
		        return hexSlice(this, start, end)

		      case 'utf8':
		      case 'utf-8':
		        return utf8Slice(this, start, end)

		      case 'ascii':
		        return asciiSlice(this, start, end)

		      case 'latin1':
		      case 'binary':
		        return latin1Slice(this, start, end)

		      case 'base64':
		        return base64Slice(this, start, end)

		      case 'ucs2':
		      case 'ucs-2':
		      case 'utf16le':
		      case 'utf-16le':
		        return utf16leSlice(this, start, end)

		      default:
		        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
		        encoding = (encoding + '').toLowerCase();
		        loweredCase = true;
		    }
		  }
		}

		// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
		// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
		// reliably in a browserify context because there could be multiple different
		// copies of the 'buffer' package in use. This method works even for Buffer
		// instances that were created from another copy of the `buffer` package.
		// See: https://github.com/feross/buffer/issues/154
		Buffer.prototype._isBuffer = true;

		function swap (b, n, m) {
		  const i = b[n];
		  b[n] = b[m];
		  b[m] = i;
		}

		Buffer.prototype.swap16 = function swap16 () {
		  const len = this.length;
		  if (len % 2 !== 0) {
		    throw new RangeError('Buffer size must be a multiple of 16-bits')
		  }
		  for (let i = 0; i < len; i += 2) {
		    swap(this, i, i + 1);
		  }
		  return this
		};

		Buffer.prototype.swap32 = function swap32 () {
		  const len = this.length;
		  if (len % 4 !== 0) {
		    throw new RangeError('Buffer size must be a multiple of 32-bits')
		  }
		  for (let i = 0; i < len; i += 4) {
		    swap(this, i, i + 3);
		    swap(this, i + 1, i + 2);
		  }
		  return this
		};

		Buffer.prototype.swap64 = function swap64 () {
		  const len = this.length;
		  if (len % 8 !== 0) {
		    throw new RangeError('Buffer size must be a multiple of 64-bits')
		  }
		  for (let i = 0; i < len; i += 8) {
		    swap(this, i, i + 7);
		    swap(this, i + 1, i + 6);
		    swap(this, i + 2, i + 5);
		    swap(this, i + 3, i + 4);
		  }
		  return this
		};

		Buffer.prototype.toString = function toString () {
		  const length = this.length;
		  if (length === 0) return ''
		  if (arguments.length === 0) return utf8Slice(this, 0, length)
		  return slowToString.apply(this, arguments)
		};

		Buffer.prototype.toLocaleString = Buffer.prototype.toString;

		Buffer.prototype.equals = function equals (b) {
		  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
		  if (this === b) return true
		  return Buffer.compare(this, b) === 0
		};

		Buffer.prototype.inspect = function inspect () {
		  let str = '';
		  const max = exports$1.INSPECT_MAX_BYTES;
		  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim();
		  if (this.length > max) str += ' ... ';
		  return '<Buffer ' + str + '>'
		};
		if (customInspectSymbol) {
		  Buffer.prototype[customInspectSymbol] = Buffer.prototype.inspect;
		}

		Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
		  if (isInstance(target, Uint8Array)) {
		    target = Buffer.from(target, target.offset, target.byteLength);
		  }
		  if (!Buffer.isBuffer(target)) {
		    throw new TypeError(
		      'The "target" argument must be one of type Buffer or Uint8Array. ' +
		      'Received type ' + (typeof target)
		    )
		  }

		  if (start === undefined) {
		    start = 0;
		  }
		  if (end === undefined) {
		    end = target ? target.length : 0;
		  }
		  if (thisStart === undefined) {
		    thisStart = 0;
		  }
		  if (thisEnd === undefined) {
		    thisEnd = this.length;
		  }

		  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
		    throw new RangeError('out of range index')
		  }

		  if (thisStart >= thisEnd && start >= end) {
		    return 0
		  }
		  if (thisStart >= thisEnd) {
		    return -1
		  }
		  if (start >= end) {
		    return 1
		  }

		  start >>>= 0;
		  end >>>= 0;
		  thisStart >>>= 0;
		  thisEnd >>>= 0;

		  if (this === target) return 0

		  let x = thisEnd - thisStart;
		  let y = end - start;
		  const len = Math.min(x, y);

		  const thisCopy = this.slice(thisStart, thisEnd);
		  const targetCopy = target.slice(start, end);

		  for (let i = 0; i < len; ++i) {
		    if (thisCopy[i] !== targetCopy[i]) {
		      x = thisCopy[i];
		      y = targetCopy[i];
		      break
		    }
		  }

		  if (x < y) return -1
		  if (y < x) return 1
		  return 0
		};

		// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
		// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
		//
		// Arguments:
		// - buffer - a Buffer to search
		// - val - a string, Buffer, or number
		// - byteOffset - an index into `buffer`; will be clamped to an int32
		// - encoding - an optional encoding, relevant is val is a string
		// - dir - true for indexOf, false for lastIndexOf
		function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
		  // Empty buffer means no match
		  if (buffer.length === 0) return -1

		  // Normalize byteOffset
		  if (typeof byteOffset === 'string') {
		    encoding = byteOffset;
		    byteOffset = 0;
		  } else if (byteOffset > 0x7fffffff) {
		    byteOffset = 0x7fffffff;
		  } else if (byteOffset < -2147483648) {
		    byteOffset = -2147483648;
		  }
		  byteOffset = +byteOffset; // Coerce to Number.
		  if (numberIsNaN(byteOffset)) {
		    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
		    byteOffset = dir ? 0 : (buffer.length - 1);
		  }

		  // Normalize byteOffset: negative offsets start from the end of the buffer
		  if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
		  if (byteOffset >= buffer.length) {
		    if (dir) return -1
		    else byteOffset = buffer.length - 1;
		  } else if (byteOffset < 0) {
		    if (dir) byteOffset = 0;
		    else return -1
		  }

		  // Normalize val
		  if (typeof val === 'string') {
		    val = Buffer.from(val, encoding);
		  }

		  // Finally, search either indexOf (if dir is true) or lastIndexOf
		  if (Buffer.isBuffer(val)) {
		    // Special case: looking for empty string/buffer always fails
		    if (val.length === 0) {
		      return -1
		    }
		    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
		  } else if (typeof val === 'number') {
		    val = val & 0xFF; // Search for a byte value [0-255]
		    if (typeof Uint8Array.prototype.indexOf === 'function') {
		      if (dir) {
		        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
		      } else {
		        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
		      }
		    }
		    return arrayIndexOf(buffer, [val], byteOffset, encoding, dir)
		  }

		  throw new TypeError('val must be string, number or Buffer')
		}

		function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
		  let indexSize = 1;
		  let arrLength = arr.length;
		  let valLength = val.length;

		  if (encoding !== undefined) {
		    encoding = String(encoding).toLowerCase();
		    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
		        encoding === 'utf16le' || encoding === 'utf-16le') {
		      if (arr.length < 2 || val.length < 2) {
		        return -1
		      }
		      indexSize = 2;
		      arrLength /= 2;
		      valLength /= 2;
		      byteOffset /= 2;
		    }
		  }

		  function read (buf, i) {
		    if (indexSize === 1) {
		      return buf[i]
		    } else {
		      return buf.readUInt16BE(i * indexSize)
		    }
		  }

		  let i;
		  if (dir) {
		    let foundIndex = -1;
		    for (i = byteOffset; i < arrLength; i++) {
		      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
		        if (foundIndex === -1) foundIndex = i;
		        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
		      } else {
		        if (foundIndex !== -1) i -= i - foundIndex;
		        foundIndex = -1;
		      }
		    }
		  } else {
		    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
		    for (i = byteOffset; i >= 0; i--) {
		      let found = true;
		      for (let j = 0; j < valLength; j++) {
		        if (read(arr, i + j) !== read(val, j)) {
		          found = false;
		          break
		        }
		      }
		      if (found) return i
		    }
		  }

		  return -1
		}

		Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
		  return this.indexOf(val, byteOffset, encoding) !== -1
		};

		Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
		  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
		};

		Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
		  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
		};

		function hexWrite (buf, string, offset, length) {
		  offset = Number(offset) || 0;
		  const remaining = buf.length - offset;
		  if (!length) {
		    length = remaining;
		  } else {
		    length = Number(length);
		    if (length > remaining) {
		      length = remaining;
		    }
		  }

		  const strLen = string.length;

		  if (length > strLen / 2) {
		    length = strLen / 2;
		  }
		  let i;
		  for (i = 0; i < length; ++i) {
		    const parsed = parseInt(string.substr(i * 2, 2), 16);
		    if (numberIsNaN(parsed)) return i
		    buf[offset + i] = parsed;
		  }
		  return i
		}

		function utf8Write (buf, string, offset, length) {
		  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
		}

		function asciiWrite (buf, string, offset, length) {
		  return blitBuffer(asciiToBytes(string), buf, offset, length)
		}

		function base64Write (buf, string, offset, length) {
		  return blitBuffer(base64ToBytes(string), buf, offset, length)
		}

		function ucs2Write (buf, string, offset, length) {
		  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
		}

		Buffer.prototype.write = function write (string, offset, length, encoding) {
		  // Buffer#write(string)
		  if (offset === undefined) {
		    encoding = 'utf8';
		    length = this.length;
		    offset = 0;
		  // Buffer#write(string, encoding)
		  } else if (length === undefined && typeof offset === 'string') {
		    encoding = offset;
		    length = this.length;
		    offset = 0;
		  // Buffer#write(string, offset[, length][, encoding])
		  } else if (isFinite(offset)) {
		    offset = offset >>> 0;
		    if (isFinite(length)) {
		      length = length >>> 0;
		      if (encoding === undefined) encoding = 'utf8';
		    } else {
		      encoding = length;
		      length = undefined;
		    }
		  } else {
		    throw new Error(
		      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
		    )
		  }

		  const remaining = this.length - offset;
		  if (length === undefined || length > remaining) length = remaining;

		  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
		    throw new RangeError('Attempt to write outside buffer bounds')
		  }

		  if (!encoding) encoding = 'utf8';

		  let loweredCase = false;
		  for (;;) {
		    switch (encoding) {
		      case 'hex':
		        return hexWrite(this, string, offset, length)

		      case 'utf8':
		      case 'utf-8':
		        return utf8Write(this, string, offset, length)

		      case 'ascii':
		      case 'latin1':
		      case 'binary':
		        return asciiWrite(this, string, offset, length)

		      case 'base64':
		        // Warning: maxLength not taken into account in base64Write
		        return base64Write(this, string, offset, length)

		      case 'ucs2':
		      case 'ucs-2':
		      case 'utf16le':
		      case 'utf-16le':
		        return ucs2Write(this, string, offset, length)

		      default:
		        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
		        encoding = ('' + encoding).toLowerCase();
		        loweredCase = true;
		    }
		  }
		};

		Buffer.prototype.toJSON = function toJSON () {
		  return {
		    type: 'Buffer',
		    data: Array.prototype.slice.call(this._arr || this, 0)
		  }
		};

		function base64Slice (buf, start, end) {
		  if (start === 0 && end === buf.length) {
		    return base64.fromByteArray(buf)
		  } else {
		    return base64.fromByteArray(buf.slice(start, end))
		  }
		}

		function utf8Slice (buf, start, end) {
		  end = Math.min(buf.length, end);
		  const res = [];

		  let i = start;
		  while (i < end) {
		    const firstByte = buf[i];
		    let codePoint = null;
		    let bytesPerSequence = (firstByte > 0xEF)
		      ? 4
		      : (firstByte > 0xDF)
		          ? 3
		          : (firstByte > 0xBF)
		              ? 2
		              : 1;

		    if (i + bytesPerSequence <= end) {
		      let secondByte, thirdByte, fourthByte, tempCodePoint;

		      switch (bytesPerSequence) {
		        case 1:
		          if (firstByte < 0x80) {
		            codePoint = firstByte;
		          }
		          break
		        case 2:
		          secondByte = buf[i + 1];
		          if ((secondByte & 0xC0) === 0x80) {
		            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
		            if (tempCodePoint > 0x7F) {
		              codePoint = tempCodePoint;
		            }
		          }
		          break
		        case 3:
		          secondByte = buf[i + 1];
		          thirdByte = buf[i + 2];
		          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
		            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
		            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
		              codePoint = tempCodePoint;
		            }
		          }
		          break
		        case 4:
		          secondByte = buf[i + 1];
		          thirdByte = buf[i + 2];
		          fourthByte = buf[i + 3];
		          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
		            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
		            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
		              codePoint = tempCodePoint;
		            }
		          }
		      }
		    }

		    if (codePoint === null) {
		      // we did not generate a valid codePoint so insert a
		      // replacement char (U+FFFD) and advance only 1 byte
		      codePoint = 0xFFFD;
		      bytesPerSequence = 1;
		    } else if (codePoint > 0xFFFF) {
		      // encode to utf16 (surrogate pair dance)
		      codePoint -= 0x10000;
		      res.push(codePoint >>> 10 & 0x3FF | 0xD800);
		      codePoint = 0xDC00 | codePoint & 0x3FF;
		    }

		    res.push(codePoint);
		    i += bytesPerSequence;
		  }

		  return decodeCodePointsArray(res)
		}

		// Based on http://stackoverflow.com/a/22747272/680742, the browser with
		// the lowest limit is Chrome, with 0x10000 args.
		// We go 1 magnitude less, for safety
		const MAX_ARGUMENTS_LENGTH = 0x1000;

		function decodeCodePointsArray (codePoints) {
		  const len = codePoints.length;
		  if (len <= MAX_ARGUMENTS_LENGTH) {
		    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
		  }

		  // Decode in chunks to avoid "call stack size exceeded".
		  let res = '';
		  let i = 0;
		  while (i < len) {
		    res += String.fromCharCode.apply(
		      String,
		      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
		    );
		  }
		  return res
		}

		function asciiSlice (buf, start, end) {
		  let ret = '';
		  end = Math.min(buf.length, end);

		  for (let i = start; i < end; ++i) {
		    ret += String.fromCharCode(buf[i] & 0x7F);
		  }
		  return ret
		}

		function latin1Slice (buf, start, end) {
		  let ret = '';
		  end = Math.min(buf.length, end);

		  for (let i = start; i < end; ++i) {
		    ret += String.fromCharCode(buf[i]);
		  }
		  return ret
		}

		function hexSlice (buf, start, end) {
		  const len = buf.length;

		  if (!start || start < 0) start = 0;
		  if (!end || end < 0 || end > len) end = len;

		  let out = '';
		  for (let i = start; i < end; ++i) {
		    out += hexSliceLookupTable[buf[i]];
		  }
		  return out
		}

		function utf16leSlice (buf, start, end) {
		  const bytes = buf.slice(start, end);
		  let res = '';
		  // If bytes.length is odd, the last 8 bits must be ignored (same as node.js)
		  for (let i = 0; i < bytes.length - 1; i += 2) {
		    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256));
		  }
		  return res
		}

		Buffer.prototype.slice = function slice (start, end) {
		  const len = this.length;
		  start = ~~start;
		  end = end === undefined ? len : ~~end;

		  if (start < 0) {
		    start += len;
		    if (start < 0) start = 0;
		  } else if (start > len) {
		    start = len;
		  }

		  if (end < 0) {
		    end += len;
		    if (end < 0) end = 0;
		  } else if (end > len) {
		    end = len;
		  }

		  if (end < start) end = start;

		  const newBuf = this.subarray(start, end);
		  // Return an augmented `Uint8Array` instance
		  Object.setPrototypeOf(newBuf, Buffer.prototype);

		  return newBuf
		};

		/*
		 * Need to make sure that buffer isn't trying to write out of bounds.
		 */
		function checkOffset (offset, ext, length) {
		  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
		  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
		}

		Buffer.prototype.readUintLE =
		Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
		  offset = offset >>> 0;
		  byteLength = byteLength >>> 0;
		  if (!noAssert) checkOffset(offset, byteLength, this.length);

		  let val = this[offset];
		  let mul = 1;
		  let i = 0;
		  while (++i < byteLength && (mul *= 0x100)) {
		    val += this[offset + i] * mul;
		  }

		  return val
		};

		Buffer.prototype.readUintBE =
		Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
		  offset = offset >>> 0;
		  byteLength = byteLength >>> 0;
		  if (!noAssert) {
		    checkOffset(offset, byteLength, this.length);
		  }

		  let val = this[offset + --byteLength];
		  let mul = 1;
		  while (byteLength > 0 && (mul *= 0x100)) {
		    val += this[offset + --byteLength] * mul;
		  }

		  return val
		};

		Buffer.prototype.readUint8 =
		Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 1, this.length);
		  return this[offset]
		};

		Buffer.prototype.readUint16LE =
		Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 2, this.length);
		  return this[offset] | (this[offset + 1] << 8)
		};

		Buffer.prototype.readUint16BE =
		Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 2, this.length);
		  return (this[offset] << 8) | this[offset + 1]
		};

		Buffer.prototype.readUint32LE =
		Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 4, this.length);

		  return ((this[offset]) |
		      (this[offset + 1] << 8) |
		      (this[offset + 2] << 16)) +
		      (this[offset + 3] * 0x1000000)
		};

		Buffer.prototype.readUint32BE =
		Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 4, this.length);

		  return (this[offset] * 0x1000000) +
		    ((this[offset + 1] << 16) |
		    (this[offset + 2] << 8) |
		    this[offset + 3])
		};

		Buffer.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE (offset) {
		  offset = offset >>> 0;
		  validateNumber(offset, 'offset');
		  const first = this[offset];
		  const last = this[offset + 7];
		  if (first === undefined || last === undefined) {
		    boundsError(offset, this.length - 8);
		  }

		  const lo = first +
		    this[++offset] * 2 ** 8 +
		    this[++offset] * 2 ** 16 +
		    this[++offset] * 2 ** 24;

		  const hi = this[++offset] +
		    this[++offset] * 2 ** 8 +
		    this[++offset] * 2 ** 16 +
		    last * 2 ** 24;

		  return BigInt(lo) + (BigInt(hi) << BigInt(32))
		});

		Buffer.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE (offset) {
		  offset = offset >>> 0;
		  validateNumber(offset, 'offset');
		  const first = this[offset];
		  const last = this[offset + 7];
		  if (first === undefined || last === undefined) {
		    boundsError(offset, this.length - 8);
		  }

		  const hi = first * 2 ** 24 +
		    this[++offset] * 2 ** 16 +
		    this[++offset] * 2 ** 8 +
		    this[++offset];

		  const lo = this[++offset] * 2 ** 24 +
		    this[++offset] * 2 ** 16 +
		    this[++offset] * 2 ** 8 +
		    last;

		  return (BigInt(hi) << BigInt(32)) + BigInt(lo)
		});

		Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
		  offset = offset >>> 0;
		  byteLength = byteLength >>> 0;
		  if (!noAssert) checkOffset(offset, byteLength, this.length);

		  let val = this[offset];
		  let mul = 1;
		  let i = 0;
		  while (++i < byteLength && (mul *= 0x100)) {
		    val += this[offset + i] * mul;
		  }
		  mul *= 0x80;

		  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

		  return val
		};

		Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
		  offset = offset >>> 0;
		  byteLength = byteLength >>> 0;
		  if (!noAssert) checkOffset(offset, byteLength, this.length);

		  let i = byteLength;
		  let mul = 1;
		  let val = this[offset + --i];
		  while (i > 0 && (mul *= 0x100)) {
		    val += this[offset + --i] * mul;
		  }
		  mul *= 0x80;

		  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

		  return val
		};

		Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 1, this.length);
		  if (!(this[offset] & 0x80)) return (this[offset])
		  return ((0xff - this[offset] + 1) * -1)
		};

		Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 2, this.length);
		  const val = this[offset] | (this[offset + 1] << 8);
		  return (val & 0x8000) ? val | 0xFFFF0000 : val
		};

		Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 2, this.length);
		  const val = this[offset + 1] | (this[offset] << 8);
		  return (val & 0x8000) ? val | 0xFFFF0000 : val
		};

		Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 4, this.length);

		  return (this[offset]) |
		    (this[offset + 1] << 8) |
		    (this[offset + 2] << 16) |
		    (this[offset + 3] << 24)
		};

		Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 4, this.length);

		  return (this[offset] << 24) |
		    (this[offset + 1] << 16) |
		    (this[offset + 2] << 8) |
		    (this[offset + 3])
		};

		Buffer.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE (offset) {
		  offset = offset >>> 0;
		  validateNumber(offset, 'offset');
		  const first = this[offset];
		  const last = this[offset + 7];
		  if (first === undefined || last === undefined) {
		    boundsError(offset, this.length - 8);
		  }

		  const val = this[offset + 4] +
		    this[offset + 5] * 2 ** 8 +
		    this[offset + 6] * 2 ** 16 +
		    (last << 24); // Overflow

		  return (BigInt(val) << BigInt(32)) +
		    BigInt(first +
		    this[++offset] * 2 ** 8 +
		    this[++offset] * 2 ** 16 +
		    this[++offset] * 2 ** 24)
		});

		Buffer.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE (offset) {
		  offset = offset >>> 0;
		  validateNumber(offset, 'offset');
		  const first = this[offset];
		  const last = this[offset + 7];
		  if (first === undefined || last === undefined) {
		    boundsError(offset, this.length - 8);
		  }

		  const val = (first << 24) + // Overflow
		    this[++offset] * 2 ** 16 +
		    this[++offset] * 2 ** 8 +
		    this[++offset];

		  return (BigInt(val) << BigInt(32)) +
		    BigInt(this[++offset] * 2 ** 24 +
		    this[++offset] * 2 ** 16 +
		    this[++offset] * 2 ** 8 +
		    last)
		});

		Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 4, this.length);
		  return ieee754.read(this, offset, true, 23, 4)
		};

		Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 4, this.length);
		  return ieee754.read(this, offset, false, 23, 4)
		};

		Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 8, this.length);
		  return ieee754.read(this, offset, true, 52, 8)
		};

		Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 8, this.length);
		  return ieee754.read(this, offset, false, 52, 8)
		};

		function checkInt (buf, value, offset, ext, max, min) {
		  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
		  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
		  if (offset + ext > buf.length) throw new RangeError('Index out of range')
		}

		Buffer.prototype.writeUintLE =
		Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  byteLength = byteLength >>> 0;
		  if (!noAssert) {
		    const maxBytes = Math.pow(2, 8 * byteLength) - 1;
		    checkInt(this, value, offset, byteLength, maxBytes, 0);
		  }

		  let mul = 1;
		  let i = 0;
		  this[offset] = value & 0xFF;
		  while (++i < byteLength && (mul *= 0x100)) {
		    this[offset + i] = (value / mul) & 0xFF;
		  }

		  return offset + byteLength
		};

		Buffer.prototype.writeUintBE =
		Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  byteLength = byteLength >>> 0;
		  if (!noAssert) {
		    const maxBytes = Math.pow(2, 8 * byteLength) - 1;
		    checkInt(this, value, offset, byteLength, maxBytes, 0);
		  }

		  let i = byteLength - 1;
		  let mul = 1;
		  this[offset + i] = value & 0xFF;
		  while (--i >= 0 && (mul *= 0x100)) {
		    this[offset + i] = (value / mul) & 0xFF;
		  }

		  return offset + byteLength
		};

		Buffer.prototype.writeUint8 =
		Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
		  this[offset] = (value & 0xff);
		  return offset + 1
		};

		Buffer.prototype.writeUint16LE =
		Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
		  this[offset] = (value & 0xff);
		  this[offset + 1] = (value >>> 8);
		  return offset + 2
		};

		Buffer.prototype.writeUint16BE =
		Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
		  this[offset] = (value >>> 8);
		  this[offset + 1] = (value & 0xff);
		  return offset + 2
		};

		Buffer.prototype.writeUint32LE =
		Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
		  this[offset + 3] = (value >>> 24);
		  this[offset + 2] = (value >>> 16);
		  this[offset + 1] = (value >>> 8);
		  this[offset] = (value & 0xff);
		  return offset + 4
		};

		Buffer.prototype.writeUint32BE =
		Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
		  this[offset] = (value >>> 24);
		  this[offset + 1] = (value >>> 16);
		  this[offset + 2] = (value >>> 8);
		  this[offset + 3] = (value & 0xff);
		  return offset + 4
		};

		function wrtBigUInt64LE (buf, value, offset, min, max) {
		  checkIntBI(value, min, max, buf, offset, 7);

		  let lo = Number(value & BigInt(0xffffffff));
		  buf[offset++] = lo;
		  lo = lo >> 8;
		  buf[offset++] = lo;
		  lo = lo >> 8;
		  buf[offset++] = lo;
		  lo = lo >> 8;
		  buf[offset++] = lo;
		  let hi = Number(value >> BigInt(32) & BigInt(0xffffffff));
		  buf[offset++] = hi;
		  hi = hi >> 8;
		  buf[offset++] = hi;
		  hi = hi >> 8;
		  buf[offset++] = hi;
		  hi = hi >> 8;
		  buf[offset++] = hi;
		  return offset
		}

		function wrtBigUInt64BE (buf, value, offset, min, max) {
		  checkIntBI(value, min, max, buf, offset, 7);

		  let lo = Number(value & BigInt(0xffffffff));
		  buf[offset + 7] = lo;
		  lo = lo >> 8;
		  buf[offset + 6] = lo;
		  lo = lo >> 8;
		  buf[offset + 5] = lo;
		  lo = lo >> 8;
		  buf[offset + 4] = lo;
		  let hi = Number(value >> BigInt(32) & BigInt(0xffffffff));
		  buf[offset + 3] = hi;
		  hi = hi >> 8;
		  buf[offset + 2] = hi;
		  hi = hi >> 8;
		  buf[offset + 1] = hi;
		  hi = hi >> 8;
		  buf[offset] = hi;
		  return offset + 8
		}

		Buffer.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE (value, offset = 0) {
		  return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt('0xffffffffffffffff'))
		});

		Buffer.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE (value, offset = 0) {
		  return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt('0xffffffffffffffff'))
		});

		Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) {
		    const limit = Math.pow(2, (8 * byteLength) - 1);

		    checkInt(this, value, offset, byteLength, limit - 1, -limit);
		  }

		  let i = 0;
		  let mul = 1;
		  let sub = 0;
		  this[offset] = value & 0xFF;
		  while (++i < byteLength && (mul *= 0x100)) {
		    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
		      sub = 1;
		    }
		    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
		  }

		  return offset + byteLength
		};

		Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) {
		    const limit = Math.pow(2, (8 * byteLength) - 1);

		    checkInt(this, value, offset, byteLength, limit - 1, -limit);
		  }

		  let i = byteLength - 1;
		  let mul = 1;
		  let sub = 0;
		  this[offset + i] = value & 0xFF;
		  while (--i >= 0 && (mul *= 0x100)) {
		    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
		      sub = 1;
		    }
		    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
		  }

		  return offset + byteLength
		};

		Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -128);
		  if (value < 0) value = 0xff + value + 1;
		  this[offset] = (value & 0xff);
		  return offset + 1
		};

		Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -32768);
		  this[offset] = (value & 0xff);
		  this[offset + 1] = (value >>> 8);
		  return offset + 2
		};

		Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -32768);
		  this[offset] = (value >>> 8);
		  this[offset + 1] = (value & 0xff);
		  return offset + 2
		};

		Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -2147483648);
		  this[offset] = (value & 0xff);
		  this[offset + 1] = (value >>> 8);
		  this[offset + 2] = (value >>> 16);
		  this[offset + 3] = (value >>> 24);
		  return offset + 4
		};

		Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -2147483648);
		  if (value < 0) value = 0xffffffff + value + 1;
		  this[offset] = (value >>> 24);
		  this[offset + 1] = (value >>> 16);
		  this[offset + 2] = (value >>> 8);
		  this[offset + 3] = (value & 0xff);
		  return offset + 4
		};

		Buffer.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE (value, offset = 0) {
		  return wrtBigUInt64LE(this, value, offset, -BigInt('0x8000000000000000'), BigInt('0x7fffffffffffffff'))
		});

		Buffer.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE (value, offset = 0) {
		  return wrtBigUInt64BE(this, value, offset, -BigInt('0x8000000000000000'), BigInt('0x7fffffffffffffff'))
		});

		function checkIEEE754 (buf, value, offset, ext, max, min) {
		  if (offset + ext > buf.length) throw new RangeError('Index out of range')
		  if (offset < 0) throw new RangeError('Index out of range')
		}

		function writeFloat (buf, value, offset, littleEndian, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) {
		    checkIEEE754(buf, value, offset, 4);
		  }
		  ieee754.write(buf, value, offset, littleEndian, 23, 4);
		  return offset + 4
		}

		Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
		  return writeFloat(this, value, offset, true, noAssert)
		};

		Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
		  return writeFloat(this, value, offset, false, noAssert)
		};

		function writeDouble (buf, value, offset, littleEndian, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) {
		    checkIEEE754(buf, value, offset, 8);
		  }
		  ieee754.write(buf, value, offset, littleEndian, 52, 8);
		  return offset + 8
		}

		Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
		  return writeDouble(this, value, offset, true, noAssert)
		};

		Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
		  return writeDouble(this, value, offset, false, noAssert)
		};

		// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
		Buffer.prototype.copy = function copy (target, targetStart, start, end) {
		  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
		  if (!start) start = 0;
		  if (!end && end !== 0) end = this.length;
		  if (targetStart >= target.length) targetStart = target.length;
		  if (!targetStart) targetStart = 0;
		  if (end > 0 && end < start) end = start;

		  // Copy 0 bytes; we're done
		  if (end === start) return 0
		  if (target.length === 0 || this.length === 0) return 0

		  // Fatal error conditions
		  if (targetStart < 0) {
		    throw new RangeError('targetStart out of bounds')
		  }
		  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
		  if (end < 0) throw new RangeError('sourceEnd out of bounds')

		  // Are we oob?
		  if (end > this.length) end = this.length;
		  if (target.length - targetStart < end - start) {
		    end = target.length - targetStart + start;
		  }

		  const len = end - start;

		  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
		    // Use built-in when available, missing from IE11
		    this.copyWithin(targetStart, start, end);
		  } else {
		    Uint8Array.prototype.set.call(
		      target,
		      this.subarray(start, end),
		      targetStart
		    );
		  }

		  return len
		};

		// Usage:
		//    buffer.fill(number[, offset[, end]])
		//    buffer.fill(buffer[, offset[, end]])
		//    buffer.fill(string[, offset[, end]][, encoding])
		Buffer.prototype.fill = function fill (val, start, end, encoding) {
		  // Handle string cases:
		  if (typeof val === 'string') {
		    if (typeof start === 'string') {
		      encoding = start;
		      start = 0;
		      end = this.length;
		    } else if (typeof end === 'string') {
		      encoding = end;
		      end = this.length;
		    }
		    if (encoding !== undefined && typeof encoding !== 'string') {
		      throw new TypeError('encoding must be a string')
		    }
		    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
		      throw new TypeError('Unknown encoding: ' + encoding)
		    }
		    if (val.length === 1) {
		      const code = val.charCodeAt(0);
		      if ((encoding === 'utf8' && code < 128) ||
		          encoding === 'latin1') {
		        // Fast path: If `val` fits into a single byte, use that numeric value.
		        val = code;
		      }
		    }
		  } else if (typeof val === 'number') {
		    val = val & 255;
		  } else if (typeof val === 'boolean') {
		    val = Number(val);
		  }

		  // Invalid ranges are not set to a default, so can range check early.
		  if (start < 0 || this.length < start || this.length < end) {
		    throw new RangeError('Out of range index')
		  }

		  if (end <= start) {
		    return this
		  }

		  start = start >>> 0;
		  end = end === undefined ? this.length : end >>> 0;

		  if (!val) val = 0;

		  let i;
		  if (typeof val === 'number') {
		    for (i = start; i < end; ++i) {
		      this[i] = val;
		    }
		  } else {
		    const bytes = Buffer.isBuffer(val)
		      ? val
		      : Buffer.from(val, encoding);
		    const len = bytes.length;
		    if (len === 0) {
		      throw new TypeError('The value "' + val +
		        '" is invalid for argument "value"')
		    }
		    for (i = 0; i < end - start; ++i) {
		      this[i + start] = bytes[i % len];
		    }
		  }

		  return this
		};

		// CUSTOM ERRORS
		// =============

		// Simplified versions from Node, changed for Buffer-only usage
		const errors = {};
		function E (sym, getMessage, Base) {
		  errors[sym] = class NodeError extends Base {
		    constructor () {
		      super();

		      Object.defineProperty(this, 'message', {
		        value: getMessage.apply(this, arguments),
		        writable: true,
		        configurable: true
		      });

		      // Add the error code to the name to include it in the stack trace.
		      this.name = `${this.name} [${sym}]`;
		      // Access the stack to generate the error message including the error code
		      // from the name.
		      this.stack; // eslint-disable-line no-unused-expressions
		      // Reset the name to the actual name.
		      delete this.name;
		    }

		    get code () {
		      return sym
		    }

		    set code (value) {
		      Object.defineProperty(this, 'code', {
		        configurable: true,
		        enumerable: true,
		        value,
		        writable: true
		      });
		    }

		    toString () {
		      return `${this.name} [${sym}]: ${this.message}`
		    }
		  };
		}

		E('ERR_BUFFER_OUT_OF_BOUNDS',
		  function (name) {
		    if (name) {
		      return `${name} is outside of buffer bounds`
		    }

		    return 'Attempt to access memory outside buffer bounds'
		  }, RangeError);
		E('ERR_INVALID_ARG_TYPE',
		  function (name, actual) {
		    return `The "${name}" argument must be of type number. Received type ${typeof actual}`
		  }, TypeError);
		E('ERR_OUT_OF_RANGE',
		  function (str, range, input) {
		    let msg = `The value of "${str}" is out of range.`;
		    let received = input;
		    if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
		      received = addNumericalSeparator(String(input));
		    } else if (typeof input === 'bigint') {
		      received = String(input);
		      if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
		        received = addNumericalSeparator(received);
		      }
		      received += 'n';
		    }
		    msg += ` It must be ${range}. Received ${received}`;
		    return msg
		  }, RangeError);

		function addNumericalSeparator (val) {
		  let res = '';
		  let i = val.length;
		  const start = val[0] === '-' ? 1 : 0;
		  for (; i >= start + 4; i -= 3) {
		    res = `_${val.slice(i - 3, i)}${res}`;
		  }
		  return `${val.slice(0, i)}${res}`
		}

		// CHECK FUNCTIONS
		// ===============

		function checkBounds (buf, offset, byteLength) {
		  validateNumber(offset, 'offset');
		  if (buf[offset] === undefined || buf[offset + byteLength] === undefined) {
		    boundsError(offset, buf.length - (byteLength + 1));
		  }
		}

		function checkIntBI (value, min, max, buf, offset, byteLength) {
		  if (value > max || value < min) {
		    const n = typeof min === 'bigint' ? 'n' : '';
		    let range;
		    {
		      if (min === 0 || min === BigInt(0)) {
		        range = `>= 0${n} and < 2${n} ** ${(byteLength + 1) * 8}${n}`;
		      } else {
		        range = `>= -(2${n} ** ${(byteLength + 1) * 8 - 1}${n}) and < 2 ** ` +
		                `${(byteLength + 1) * 8 - 1}${n}`;
		      }
		    }
		    throw new errors.ERR_OUT_OF_RANGE('value', range, value)
		  }
		  checkBounds(buf, offset, byteLength);
		}

		function validateNumber (value, name) {
		  if (typeof value !== 'number') {
		    throw new errors.ERR_INVALID_ARG_TYPE(name, 'number', value)
		  }
		}

		function boundsError (value, length, type) {
		  if (Math.floor(value) !== value) {
		    validateNumber(value, type);
		    throw new errors.ERR_OUT_OF_RANGE('offset', 'an integer', value)
		  }

		  if (length < 0) {
		    throw new errors.ERR_BUFFER_OUT_OF_BOUNDS()
		  }

		  throw new errors.ERR_OUT_OF_RANGE('offset',
		                                    `>= ${0} and <= ${length}`,
		                                    value)
		}

		// HELPER FUNCTIONS
		// ================

		const INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;

		function base64clean (str) {
		  // Node takes equal signs as end of the Base64 encoding
		  str = str.split('=')[0];
		  // Node strips out invalid characters like \n and \t from the string, base64-js does not
		  str = str.trim().replace(INVALID_BASE64_RE, '');
		  // Node converts strings with length < 2 to ''
		  if (str.length < 2) return ''
		  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
		  while (str.length % 4 !== 0) {
		    str = str + '=';
		  }
		  return str
		}

		function utf8ToBytes (string, units) {
		  units = units || Infinity;
		  let codePoint;
		  const length = string.length;
		  let leadSurrogate = null;
		  const bytes = [];

		  for (let i = 0; i < length; ++i) {
		    codePoint = string.charCodeAt(i);

		    // is surrogate component
		    if (codePoint > 0xD7FF && codePoint < 0xE000) {
		      // last char was a lead
		      if (!leadSurrogate) {
		        // no lead yet
		        if (codePoint > 0xDBFF) {
		          // unexpected trail
		          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
		          continue
		        } else if (i + 1 === length) {
		          // unpaired lead
		          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
		          continue
		        }

		        // valid lead
		        leadSurrogate = codePoint;

		        continue
		      }

		      // 2 leads in a row
		      if (codePoint < 0xDC00) {
		        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
		        leadSurrogate = codePoint;
		        continue
		      }

		      // valid surrogate pair
		      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
		    } else if (leadSurrogate) {
		      // valid bmp char, but last char was a lead
		      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
		    }

		    leadSurrogate = null;

		    // encode utf8
		    if (codePoint < 0x80) {
		      if ((units -= 1) < 0) break
		      bytes.push(codePoint);
		    } else if (codePoint < 0x800) {
		      if ((units -= 2) < 0) break
		      bytes.push(
		        codePoint >> 0x6 | 0xC0,
		        codePoint & 0x3F | 0x80
		      );
		    } else if (codePoint < 0x10000) {
		      if ((units -= 3) < 0) break
		      bytes.push(
		        codePoint >> 0xC | 0xE0,
		        codePoint >> 0x6 & 0x3F | 0x80,
		        codePoint & 0x3F | 0x80
		      );
		    } else if (codePoint < 0x110000) {
		      if ((units -= 4) < 0) break
		      bytes.push(
		        codePoint >> 0x12 | 0xF0,
		        codePoint >> 0xC & 0x3F | 0x80,
		        codePoint >> 0x6 & 0x3F | 0x80,
		        codePoint & 0x3F | 0x80
		      );
		    } else {
		      throw new Error('Invalid code point')
		    }
		  }

		  return bytes
		}

		function asciiToBytes (str) {
		  const byteArray = [];
		  for (let i = 0; i < str.length; ++i) {
		    // Node's code seems to be doing this and not & 0x7F..
		    byteArray.push(str.charCodeAt(i) & 0xFF);
		  }
		  return byteArray
		}

		function utf16leToBytes (str, units) {
		  let c, hi, lo;
		  const byteArray = [];
		  for (let i = 0; i < str.length; ++i) {
		    if ((units -= 2) < 0) break

		    c = str.charCodeAt(i);
		    hi = c >> 8;
		    lo = c % 256;
		    byteArray.push(lo);
		    byteArray.push(hi);
		  }

		  return byteArray
		}

		function base64ToBytes (str) {
		  return base64.toByteArray(base64clean(str))
		}

		function blitBuffer (src, dst, offset, length) {
		  let i;
		  for (i = 0; i < length; ++i) {
		    if ((i + offset >= dst.length) || (i >= src.length)) break
		    dst[i + offset] = src[i];
		  }
		  return i
		}

		// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
		// the `instanceof` check but they should be treated as of that type.
		// See: https://github.com/feross/buffer/issues/166
		function isInstance (obj, type) {
		  return obj instanceof type ||
		    (obj != null && obj.constructor != null && obj.constructor.name != null &&
		      obj.constructor.name === type.name)
		}
		function numberIsNaN (obj) {
		  // For IE11 support
		  return obj !== obj // eslint-disable-line no-self-compare
		}

		// Create lookup table for `toString('hex')`
		// See: https://github.com/feross/buffer/issues/219
		const hexSliceLookupTable = (function () {
		  const alphabet = '0123456789abcdef';
		  const table = new Array(256);
		  for (let i = 0; i < 16; ++i) {
		    const i16 = i * 16;
		    for (let j = 0; j < 16; ++j) {
		      table[i16 + j] = alphabet[i] + alphabet[j];
		    }
		  }
		  return table
		})();

		// Return not function with Error if BigInt not supported
		function defineBigIntMethod (fn) {
		  return typeof BigInt === 'undefined' ? BufferBigIntNotDefined : fn
		}

		function BufferBigIntNotDefined () {
		  throw new Error('BigInt not supported')
		} 
	} (buffer));
	return buffer;
}

var primordials;
var hasRequiredPrimordials;

function requirePrimordials () {
	if (hasRequiredPrimordials) return primordials;
	hasRequiredPrimordials = 1;

	/*
	  This file is a reduced and adapted version of the main lib/internal/per_context/primordials.js file defined at

	  https://github.com/nodejs/node/blob/main/lib/internal/per_context/primordials.js

	  Don't try to replace with the original file and keep it up to date with the upstream file.
	*/

	// This is a simplified version of AggregateError
	class AggregateError extends Error {
	  constructor(errors) {
	    if (!Array.isArray(errors)) {
	      throw new TypeError(`Expected input to be an Array, got ${typeof errors}`)
	    }
	    let message = '';
	    for (let i = 0; i < errors.length; i++) {
	      message += `    ${errors[i].stack}\n`;
	    }
	    super(message);
	    this.name = 'AggregateError';
	    this.errors = errors;
	  }
	}
	primordials = {
	  AggregateError,
	  ArrayIsArray(self) {
	    return Array.isArray(self)
	  },
	  ArrayPrototypeIncludes(self, el) {
	    return self.includes(el)
	  },
	  ArrayPrototypeIndexOf(self, el) {
	    return self.indexOf(el)
	  },
	  ArrayPrototypeJoin(self, sep) {
	    return self.join(sep)
	  },
	  ArrayPrototypeMap(self, fn) {
	    return self.map(fn)
	  },
	  ArrayPrototypePop(self, el) {
	    return self.pop(el)
	  },
	  ArrayPrototypePush(self, el) {
	    return self.push(el)
	  },
	  ArrayPrototypeSlice(self, start, end) {
	    return self.slice(start, end)
	  },
	  Error,
	  FunctionPrototypeCall(fn, thisArgs, ...args) {
	    return fn.call(thisArgs, ...args)
	  },
	  FunctionPrototypeSymbolHasInstance(self, instance) {
	    return Function.prototype[Symbol.hasInstance].call(self, instance)
	  },
	  MathFloor: Math.floor,
	  Number,
	  NumberIsInteger: Number.isInteger,
	  NumberIsNaN: Number.isNaN,
	  NumberMAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
	  NumberMIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
	  NumberParseInt: Number.parseInt,
	  ObjectDefineProperties(self, props) {
	    return Object.defineProperties(self, props)
	  },
	  ObjectDefineProperty(self, name, prop) {
	    return Object.defineProperty(self, name, prop)
	  },
	  ObjectGetOwnPropertyDescriptor(self, name) {
	    return Object.getOwnPropertyDescriptor(self, name)
	  },
	  ObjectKeys(obj) {
	    return Object.keys(obj)
	  },
	  ObjectSetPrototypeOf(target, proto) {
	    return Object.setPrototypeOf(target, proto)
	  },
	  Promise,
	  PromisePrototypeCatch(self, fn) {
	    return self.catch(fn)
	  },
	  PromisePrototypeThen(self, thenFn, catchFn) {
	    return self.then(thenFn, catchFn)
	  },
	  PromiseReject(err) {
	    return Promise.reject(err)
	  },
	  PromiseResolve(val) {
	    return Promise.resolve(val)
	  },
	  ReflectApply: Reflect.apply,
	  RegExpPrototypeTest(self, value) {
	    return self.test(value)
	  },
	  SafeSet: Set,
	  String,
	  StringPrototypeSlice(self, start, end) {
	    return self.slice(start, end)
	  },
	  StringPrototypeToLowerCase(self) {
	    return self.toLowerCase()
	  },
	  StringPrototypeToUpperCase(self) {
	    return self.toUpperCase()
	  },
	  StringPrototypeTrim(self) {
	    return self.trim()
	  },
	  Symbol,
	  SymbolFor: Symbol.for,
	  SymbolAsyncIterator: Symbol.asyncIterator,
	  SymbolHasInstance: Symbol.hasInstance,
	  SymbolIterator: Symbol.iterator,
	  SymbolDispose: Symbol.dispose || Symbol('Symbol.dispose'),
	  SymbolAsyncDispose: Symbol.asyncDispose || Symbol('Symbol.asyncDispose'),
	  TypedArrayPrototypeSet(self, buf, len) {
	    return self.set(buf, len)
	  },
	  Boolean,
	  Uint8Array
	};
	return primordials;
}

var util = {exports: {}};

var inspect;
var hasRequiredInspect;

function requireInspect () {
	if (hasRequiredInspect) return inspect;
	hasRequiredInspect = 1;

	/*
	  This file is a reduced and adapted version of the main lib/internal/util/inspect.js file defined at

	  https://github.com/nodejs/node/blob/main/lib/internal/util/inspect.js

	  Don't try to replace with the original file and keep it up to date with the upstream file.
	*/
	inspect = {
	  format(format, ...args) {
	    // Simplified version of https://nodejs.org/api/util.html#utilformatformat-args
	    return format.replace(/%([sdifj])/g, function (...[_unused, type]) {
	      const replacement = args.shift();
	      if (type === 'f') {
	        return replacement.toFixed(6)
	      } else if (type === 'j') {
	        return JSON.stringify(replacement)
	      } else if (type === 's' && typeof replacement === 'object') {
	        const ctor = replacement.constructor !== Object ? replacement.constructor.name : '';
	        return `${ctor} {}`.trim()
	      } else {
	        return replacement.toString()
	      }
	    })
	  },
	  inspect(value) {
	    // Vastly simplified version of https://nodejs.org/api/util.html#utilinspectobject-options
	    switch (typeof value) {
	      case 'string':
	        if (value.includes("'")) {
	          if (!value.includes('"')) {
	            return `"${value}"`
	          } else if (!value.includes('`') && !value.includes('${')) {
	            return `\`${value}\``
	          }
	        }
	        return `'${value}'`
	      case 'number':
	        if (isNaN(value)) {
	          return 'NaN'
	        } else if (Object.is(value, -0)) {
	          return String(value)
	        }
	        return value
	      case 'bigint':
	        return `${String(value)}n`
	      case 'boolean':
	      case 'undefined':
	        return String(value)
	      case 'object':
	        return '{}'
	    }
	  }
	};
	return inspect;
}

var errors;
var hasRequiredErrors;

function requireErrors () {
	if (hasRequiredErrors) return errors;
	hasRequiredErrors = 1;

	const { format, inspect } = requireInspect();
	const { AggregateError: CustomAggregateError } = requirePrimordials();

	/*
	  This file is a reduced and adapted version of the main lib/internal/errors.js file defined at

	  https://github.com/nodejs/node/blob/main/lib/internal/errors.js

	  Don't try to replace with the original file and keep it up to date (starting from E(...) definitions)
	  with the upstream file.
	*/

	const AggregateError = globalThis.AggregateError || CustomAggregateError;
	const kIsNodeError = Symbol('kIsNodeError');
	const kTypes = [
	  'string',
	  'function',
	  'number',
	  'object',
	  // Accept 'Function' and 'Object' as alternative to the lower cased version.
	  'Function',
	  'Object',
	  'boolean',
	  'bigint',
	  'symbol'
	];
	const classRegExp = /^([A-Z][a-z0-9]*)+$/;
	const nodeInternalPrefix = '__node_internal_';
	const codes = {};
	function assert(value, message) {
	  if (!value) {
	    throw new codes.ERR_INTERNAL_ASSERTION(message)
	  }
	}

	// Only use this for integers! Decimal numbers do not work with this function.
	function addNumericalSeparator(val) {
	  let res = '';
	  let i = val.length;
	  const start = val[0] === '-' ? 1 : 0;
	  for (; i >= start + 4; i -= 3) {
	    res = `_${val.slice(i - 3, i)}${res}`;
	  }
	  return `${val.slice(0, i)}${res}`
	}
	function getMessage(key, msg, args) {
	  if (typeof msg === 'function') {
	    assert(
	      msg.length <= args.length,
	      // Default options do not count.
	      `Code: ${key}; The provided arguments length (${args.length}) does not match the required ones (${msg.length}).`
	    );
	    return msg(...args)
	  }
	  const expectedLength = (msg.match(/%[dfijoOs]/g) || []).length;
	  assert(
	    expectedLength === args.length,
	    `Code: ${key}; The provided arguments length (${args.length}) does not match the required ones (${expectedLength}).`
	  );
	  if (args.length === 0) {
	    return msg
	  }
	  return format(msg, ...args)
	}
	function E(code, message, Base) {
	  if (!Base) {
	    Base = Error;
	  }
	  class NodeError extends Base {
	    constructor(...args) {
	      super(getMessage(code, message, args));
	    }
	    toString() {
	      return `${this.name} [${code}]: ${this.message}`
	    }
	  }
	  Object.defineProperties(NodeError.prototype, {
	    name: {
	      value: Base.name,
	      writable: true,
	      enumerable: false,
	      configurable: true
	    },
	    toString: {
	      value() {
	        return `${this.name} [${code}]: ${this.message}`
	      },
	      writable: true,
	      enumerable: false,
	      configurable: true
	    }
	  });
	  NodeError.prototype.code = code;
	  NodeError.prototype[kIsNodeError] = true;
	  codes[code] = NodeError;
	}
	function hideStackFrames(fn) {
	  // We rename the functions that will be hidden to cut off the stacktrace
	  // at the outermost one
	  const hidden = nodeInternalPrefix + fn.name;
	  Object.defineProperty(fn, 'name', {
	    value: hidden
	  });
	  return fn
	}
	function aggregateTwoErrors(innerError, outerError) {
	  if (innerError && outerError && innerError !== outerError) {
	    if (Array.isArray(outerError.errors)) {
	      // If `outerError` is already an `AggregateError`.
	      outerError.errors.push(innerError);
	      return outerError
	    }
	    const err = new AggregateError([outerError, innerError], outerError.message);
	    err.code = outerError.code;
	    return err
	  }
	  return innerError || outerError
	}
	class AbortError extends Error {
	  constructor(message = 'The operation was aborted', options = undefined) {
	    if (options !== undefined && typeof options !== 'object') {
	      throw new codes.ERR_INVALID_ARG_TYPE('options', 'Object', options)
	    }
	    super(message, options);
	    this.code = 'ABORT_ERR';
	    this.name = 'AbortError';
	  }
	}
	E('ERR_ASSERTION', '%s', Error);
	E(
	  'ERR_INVALID_ARG_TYPE',
	  (name, expected, actual) => {
	    assert(typeof name === 'string', "'name' must be a string");
	    if (!Array.isArray(expected)) {
	      expected = [expected];
	    }
	    let msg = 'The ';
	    if (name.endsWith(' argument')) {
	      // For cases like 'first argument'
	      msg += `${name} `;
	    } else {
	      msg += `"${name}" ${name.includes('.') ? 'property' : 'argument'} `;
	    }
	    msg += 'must be ';
	    const types = [];
	    const instances = [];
	    const other = [];
	    for (const value of expected) {
	      assert(typeof value === 'string', 'All expected entries have to be of type string');
	      if (kTypes.includes(value)) {
	        types.push(value.toLowerCase());
	      } else if (classRegExp.test(value)) {
	        instances.push(value);
	      } else {
	        assert(value !== 'object', 'The value "object" should be written as "Object"');
	        other.push(value);
	      }
	    }

	    // Special handle `object` in case other instances are allowed to outline
	    // the differences between each other.
	    if (instances.length > 0) {
	      const pos = types.indexOf('object');
	      if (pos !== -1) {
	        types.splice(types, pos, 1);
	        instances.push('Object');
	      }
	    }
	    if (types.length > 0) {
	      switch (types.length) {
	        case 1:
	          msg += `of type ${types[0]}`;
	          break
	        case 2:
	          msg += `one of type ${types[0]} or ${types[1]}`;
	          break
	        default: {
	          const last = types.pop();
	          msg += `one of type ${types.join(', ')}, or ${last}`;
	        }
	      }
	      if (instances.length > 0 || other.length > 0) {
	        msg += ' or ';
	      }
	    }
	    if (instances.length > 0) {
	      switch (instances.length) {
	        case 1:
	          msg += `an instance of ${instances[0]}`;
	          break
	        case 2:
	          msg += `an instance of ${instances[0]} or ${instances[1]}`;
	          break
	        default: {
	          const last = instances.pop();
	          msg += `an instance of ${instances.join(', ')}, or ${last}`;
	        }
	      }
	      if (other.length > 0) {
	        msg += ' or ';
	      }
	    }
	    switch (other.length) {
	      case 0:
	        break
	      case 1:
	        if (other[0].toLowerCase() !== other[0]) {
	          msg += 'an ';
	        }
	        msg += `${other[0]}`;
	        break
	      case 2:
	        msg += `one of ${other[0]} or ${other[1]}`;
	        break
	      default: {
	        const last = other.pop();
	        msg += `one of ${other.join(', ')}, or ${last}`;
	      }
	    }
	    if (actual == null) {
	      msg += `. Received ${actual}`;
	    } else if (typeof actual === 'function' && actual.name) {
	      msg += `. Received function ${actual.name}`;
	    } else if (typeof actual === 'object') {
	      var _actual$constructor;
	      if (
	        (_actual$constructor = actual.constructor) !== null &&
	        _actual$constructor !== undefined &&
	        _actual$constructor.name
	      ) {
	        msg += `. Received an instance of ${actual.constructor.name}`;
	      } else {
	        const inspected = inspect(actual, {
	          depth: -1
	        });
	        msg += `. Received ${inspected}`;
	      }
	    } else {
	      let inspected = inspect(actual, {
	        colors: false
	      });
	      if (inspected.length > 25) {
	        inspected = `${inspected.slice(0, 25)}...`;
	      }
	      msg += `. Received type ${typeof actual} (${inspected})`;
	    }
	    return msg
	  },
	  TypeError
	);
	E(
	  'ERR_INVALID_ARG_VALUE',
	  (name, value, reason = 'is invalid') => {
	    let inspected = inspect(value);
	    if (inspected.length > 128) {
	      inspected = inspected.slice(0, 128) + '...';
	    }
	    const type = name.includes('.') ? 'property' : 'argument';
	    return `The ${type} '${name}' ${reason}. Received ${inspected}`
	  },
	  TypeError
	);
	E(
	  'ERR_INVALID_RETURN_VALUE',
	  (input, name, value) => {
	    var _value$constructor;
	    const type =
	      value !== null &&
	      value !== undefined &&
	      (_value$constructor = value.constructor) !== null &&
	      _value$constructor !== undefined &&
	      _value$constructor.name
	        ? `instance of ${value.constructor.name}`
	        : `type ${typeof value}`;
	    return `Expected ${input} to be returned from the "${name}"` + ` function but got ${type}.`
	  },
	  TypeError
	);
	E(
	  'ERR_MISSING_ARGS',
	  (...args) => {
	    assert(args.length > 0, 'At least one arg needs to be specified');
	    let msg;
	    const len = args.length;
	    args = (Array.isArray(args) ? args : [args]).map((a) => `"${a}"`).join(' or ');
	    switch (len) {
	      case 1:
	        msg += `The ${args[0]} argument`;
	        break
	      case 2:
	        msg += `The ${args[0]} and ${args[1]} arguments`;
	        break
	      default:
	        {
	          const last = args.pop();
	          msg += `The ${args.join(', ')}, and ${last} arguments`;
	        }
	        break
	    }
	    return `${msg} must be specified`
	  },
	  TypeError
	);
	E(
	  'ERR_OUT_OF_RANGE',
	  (str, range, input) => {
	    assert(range, 'Missing "range" argument');
	    let received;
	    if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
	      received = addNumericalSeparator(String(input));
	    } else if (typeof input === 'bigint') {
	      received = String(input);
	      const limit = BigInt(2) ** BigInt(32);
	      if (input > limit || input < -limit) {
	        received = addNumericalSeparator(received);
	      }
	      received += 'n';
	    } else {
	      received = inspect(input);
	    }
	    return `The value of "${str}" is out of range. It must be ${range}. Received ${received}`
	  },
	  RangeError
	);
	E('ERR_MULTIPLE_CALLBACK', 'Callback called multiple times', Error);
	E('ERR_METHOD_NOT_IMPLEMENTED', 'The %s method is not implemented', Error);
	E('ERR_STREAM_ALREADY_FINISHED', 'Cannot call %s after a stream was finished', Error);
	E('ERR_STREAM_CANNOT_PIPE', 'Cannot pipe, not readable', Error);
	E('ERR_STREAM_DESTROYED', 'Cannot call %s after a stream was destroyed', Error);
	E('ERR_STREAM_NULL_VALUES', 'May not write null values to stream', TypeError);
	E('ERR_STREAM_PREMATURE_CLOSE', 'Premature close', Error);
	E('ERR_STREAM_PUSH_AFTER_EOF', 'stream.push() after EOF', Error);
	E('ERR_STREAM_UNSHIFT_AFTER_END_EVENT', 'stream.unshift() after end event', Error);
	E('ERR_STREAM_WRITE_AFTER_END', 'write after end', Error);
	E('ERR_UNKNOWN_ENCODING', 'Unknown encoding: %s', TypeError);
	errors = {
	  AbortError,
	  aggregateTwoErrors: hideStackFrames(aggregateTwoErrors),
	  hideStackFrames,
	  codes
	};
	return errors;
}

var browser$1 = {exports: {}};

/*globals self, window */

var hasRequiredBrowser$2;

function requireBrowser$2 () {
	if (hasRequiredBrowser$2) return browser$1.exports;
	hasRequiredBrowser$2 = 1;

	/*eslint-disable @mysticatea/prettier */
	const { AbortController, AbortSignal } =
	    typeof self !== "undefined" ? self :
	    typeof window !== "undefined" ? window :
	    /* otherwise */ undefined;
	/*eslint-enable @mysticatea/prettier */

	browser$1.exports = AbortController;
	browser$1.exports.AbortSignal = AbortSignal;
	browser$1.exports.default = AbortController;
	return browser$1.exports;
}

var events = {exports: {}};

var hasRequiredEvents;

function requireEvents () {
	if (hasRequiredEvents) return events.exports;
	hasRequiredEvents = 1;

	var R = typeof Reflect === 'object' ? Reflect : null;
	var ReflectApply = R && typeof R.apply === 'function'
	  ? R.apply
	  : function ReflectApply(target, receiver, args) {
	    return Function.prototype.apply.call(target, receiver, args);
	  };

	var ReflectOwnKeys;
	if (R && typeof R.ownKeys === 'function') {
	  ReflectOwnKeys = R.ownKeys;
	} else if (Object.getOwnPropertySymbols) {
	  ReflectOwnKeys = function ReflectOwnKeys(target) {
	    return Object.getOwnPropertyNames(target)
	      .concat(Object.getOwnPropertySymbols(target));
	  };
	} else {
	  ReflectOwnKeys = function ReflectOwnKeys(target) {
	    return Object.getOwnPropertyNames(target);
	  };
	}

	function ProcessEmitWarning(warning) {
	  if (console && console.warn) console.warn(warning);
	}

	var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
	  return value !== value;
	};

	function EventEmitter() {
	  EventEmitter.init.call(this);
	}
	events.exports = EventEmitter;
	events.exports.once = once;

	// Backwards-compat with node 0.10.x
	EventEmitter.EventEmitter = EventEmitter;

	EventEmitter.prototype._events = undefined;
	EventEmitter.prototype._eventsCount = 0;
	EventEmitter.prototype._maxListeners = undefined;

	// By default EventEmitters will print a warning if more than 10 listeners are
	// added to it. This is a useful default which helps finding memory leaks.
	var defaultMaxListeners = 10;

	function checkListener(listener) {
	  if (typeof listener !== 'function') {
	    throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
	  }
	}

	Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
	  enumerable: true,
	  get: function() {
	    return defaultMaxListeners;
	  },
	  set: function(arg) {
	    if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
	      throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
	    }
	    defaultMaxListeners = arg;
	  }
	});

	EventEmitter.init = function() {

	  if (this._events === undefined ||
	      this._events === Object.getPrototypeOf(this)._events) {
	    this._events = Object.create(null);
	    this._eventsCount = 0;
	  }

	  this._maxListeners = this._maxListeners || undefined;
	};

	// Obviously not all Emitters should be limited to 10. This function allows
	// that to be increased. Set to zero for unlimited.
	EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
	  if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
	    throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
	  }
	  this._maxListeners = n;
	  return this;
	};

	function _getMaxListeners(that) {
	  if (that._maxListeners === undefined)
	    return EventEmitter.defaultMaxListeners;
	  return that._maxListeners;
	}

	EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
	  return _getMaxListeners(this);
	};

	EventEmitter.prototype.emit = function emit(type) {
	  var args = [];
	  for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
	  var doError = (type === 'error');

	  var events = this._events;
	  if (events !== undefined)
	    doError = (doError && events.error === undefined);
	  else if (!doError)
	    return false;

	  // If there is no 'error' event listener then throw.
	  if (doError) {
	    var er;
	    if (args.length > 0)
	      er = args[0];
	    if (er instanceof Error) {
	      // Note: The comments on the `throw` lines are intentional, they show
	      // up in Node's output if this results in an unhandled exception.
	      throw er; // Unhandled 'error' event
	    }
	    // At least give some kind of context to the user
	    var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
	    err.context = er;
	    throw err; // Unhandled 'error' event
	  }

	  var handler = events[type];

	  if (handler === undefined)
	    return false;

	  if (typeof handler === 'function') {
	    ReflectApply(handler, this, args);
	  } else {
	    var len = handler.length;
	    var listeners = arrayClone(handler, len);
	    for (var i = 0; i < len; ++i)
	      ReflectApply(listeners[i], this, args);
	  }

	  return true;
	};

	function _addListener(target, type, listener, prepend) {
	  var m;
	  var events;
	  var existing;

	  checkListener(listener);

	  events = target._events;
	  if (events === undefined) {
	    events = target._events = Object.create(null);
	    target._eventsCount = 0;
	  } else {
	    // To avoid recursion in the case that type === "newListener"! Before
	    // adding it to the listeners, first emit "newListener".
	    if (events.newListener !== undefined) {
	      target.emit('newListener', type,
	                  listener.listener ? listener.listener : listener);

	      // Re-assign `events` because a newListener handler could have caused the
	      // this._events to be assigned to a new object
	      events = target._events;
	    }
	    existing = events[type];
	  }

	  if (existing === undefined) {
	    // Optimize the case of one listener. Don't need the extra array object.
	    existing = events[type] = listener;
	    ++target._eventsCount;
	  } else {
	    if (typeof existing === 'function') {
	      // Adding the second element, need to change to array.
	      existing = events[type] =
	        prepend ? [listener, existing] : [existing, listener];
	      // If we've already got an array, just append.
	    } else if (prepend) {
	      existing.unshift(listener);
	    } else {
	      existing.push(listener);
	    }

	    // Check for listener leak
	    m = _getMaxListeners(target);
	    if (m > 0 && existing.length > m && !existing.warned) {
	      existing.warned = true;
	      // No error code for this since it is a Warning
	      // eslint-disable-next-line no-restricted-syntax
	      var w = new Error('Possible EventEmitter memory leak detected. ' +
	                          existing.length + ' ' + String(type) + ' listeners ' +
	                          'added. Use emitter.setMaxListeners() to ' +
	                          'increase limit');
	      w.name = 'MaxListenersExceededWarning';
	      w.emitter = target;
	      w.type = type;
	      w.count = existing.length;
	      ProcessEmitWarning(w);
	    }
	  }

	  return target;
	}

	EventEmitter.prototype.addListener = function addListener(type, listener) {
	  return _addListener(this, type, listener, false);
	};

	EventEmitter.prototype.on = EventEmitter.prototype.addListener;

	EventEmitter.prototype.prependListener =
	    function prependListener(type, listener) {
	      return _addListener(this, type, listener, true);
	    };

	function onceWrapper() {
	  if (!this.fired) {
	    this.target.removeListener(this.type, this.wrapFn);
	    this.fired = true;
	    if (arguments.length === 0)
	      return this.listener.call(this.target);
	    return this.listener.apply(this.target, arguments);
	  }
	}

	function _onceWrap(target, type, listener) {
	  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
	  var wrapped = onceWrapper.bind(state);
	  wrapped.listener = listener;
	  state.wrapFn = wrapped;
	  return wrapped;
	}

	EventEmitter.prototype.once = function once(type, listener) {
	  checkListener(listener);
	  this.on(type, _onceWrap(this, type, listener));
	  return this;
	};

	EventEmitter.prototype.prependOnceListener =
	    function prependOnceListener(type, listener) {
	      checkListener(listener);
	      this.prependListener(type, _onceWrap(this, type, listener));
	      return this;
	    };

	// Emits a 'removeListener' event if and only if the listener was removed.
	EventEmitter.prototype.removeListener =
	    function removeListener(type, listener) {
	      var list, events, position, i, originalListener;

	      checkListener(listener);

	      events = this._events;
	      if (events === undefined)
	        return this;

	      list = events[type];
	      if (list === undefined)
	        return this;

	      if (list === listener || list.listener === listener) {
	        if (--this._eventsCount === 0)
	          this._events = Object.create(null);
	        else {
	          delete events[type];
	          if (events.removeListener)
	            this.emit('removeListener', type, list.listener || listener);
	        }
	      } else if (typeof list !== 'function') {
	        position = -1;

	        for (i = list.length - 1; i >= 0; i--) {
	          if (list[i] === listener || list[i].listener === listener) {
	            originalListener = list[i].listener;
	            position = i;
	            break;
	          }
	        }

	        if (position < 0)
	          return this;

	        if (position === 0)
	          list.shift();
	        else {
	          spliceOne(list, position);
	        }

	        if (list.length === 1)
	          events[type] = list[0];

	        if (events.removeListener !== undefined)
	          this.emit('removeListener', type, originalListener || listener);
	      }

	      return this;
	    };

	EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

	EventEmitter.prototype.removeAllListeners =
	    function removeAllListeners(type) {
	      var listeners, events, i;

	      events = this._events;
	      if (events === undefined)
	        return this;

	      // not listening for removeListener, no need to emit
	      if (events.removeListener === undefined) {
	        if (arguments.length === 0) {
	          this._events = Object.create(null);
	          this._eventsCount = 0;
	        } else if (events[type] !== undefined) {
	          if (--this._eventsCount === 0)
	            this._events = Object.create(null);
	          else
	            delete events[type];
	        }
	        return this;
	      }

	      // emit removeListener for all listeners on all events
	      if (arguments.length === 0) {
	        var keys = Object.keys(events);
	        var key;
	        for (i = 0; i < keys.length; ++i) {
	          key = keys[i];
	          if (key === 'removeListener') continue;
	          this.removeAllListeners(key);
	        }
	        this.removeAllListeners('removeListener');
	        this._events = Object.create(null);
	        this._eventsCount = 0;
	        return this;
	      }

	      listeners = events[type];

	      if (typeof listeners === 'function') {
	        this.removeListener(type, listeners);
	      } else if (listeners !== undefined) {
	        // LIFO order
	        for (i = listeners.length - 1; i >= 0; i--) {
	          this.removeListener(type, listeners[i]);
	        }
	      }

	      return this;
	    };

	function _listeners(target, type, unwrap) {
	  var events = target._events;

	  if (events === undefined)
	    return [];

	  var evlistener = events[type];
	  if (evlistener === undefined)
	    return [];

	  if (typeof evlistener === 'function')
	    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

	  return unwrap ?
	    unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
	}

	EventEmitter.prototype.listeners = function listeners(type) {
	  return _listeners(this, type, true);
	};

	EventEmitter.prototype.rawListeners = function rawListeners(type) {
	  return _listeners(this, type, false);
	};

	EventEmitter.listenerCount = function(emitter, type) {
	  if (typeof emitter.listenerCount === 'function') {
	    return emitter.listenerCount(type);
	  } else {
	    return listenerCount.call(emitter, type);
	  }
	};

	EventEmitter.prototype.listenerCount = listenerCount;
	function listenerCount(type) {
	  var events = this._events;

	  if (events !== undefined) {
	    var evlistener = events[type];

	    if (typeof evlistener === 'function') {
	      return 1;
	    } else if (evlistener !== undefined) {
	      return evlistener.length;
	    }
	  }

	  return 0;
	}

	EventEmitter.prototype.eventNames = function eventNames() {
	  return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
	};

	function arrayClone(arr, n) {
	  var copy = new Array(n);
	  for (var i = 0; i < n; ++i)
	    copy[i] = arr[i];
	  return copy;
	}

	function spliceOne(list, index) {
	  for (; index + 1 < list.length; index++)
	    list[index] = list[index + 1];
	  list.pop();
	}

	function unwrapListeners(arr) {
	  var ret = new Array(arr.length);
	  for (var i = 0; i < ret.length; ++i) {
	    ret[i] = arr[i].listener || arr[i];
	  }
	  return ret;
	}

	function once(emitter, name) {
	  return new Promise(function (resolve, reject) {
	    function errorListener(err) {
	      emitter.removeListener(name, resolver);
	      reject(err);
	    }

	    function resolver() {
	      if (typeof emitter.removeListener === 'function') {
	        emitter.removeListener('error', errorListener);
	      }
	      resolve([].slice.call(arguments));
	    }
	    eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
	    if (name !== 'error') {
	      addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
	    }
	  });
	}

	function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
	  if (typeof emitter.on === 'function') {
	    eventTargetAgnosticAddListener(emitter, 'error', handler, flags);
	  }
	}

	function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
	  if (typeof emitter.on === 'function') {
	    if (flags.once) {
	      emitter.once(name, listener);
	    } else {
	      emitter.on(name, listener);
	    }
	  } else if (typeof emitter.addEventListener === 'function') {
	    // EventTarget does not have `error` event semantics like Node
	    // EventEmitters, we do not listen for `error` events here.
	    emitter.addEventListener(name, function wrapListener(arg) {
	      // IE does not have builtin `{ once: true }` support so we
	      // have to do it manually.
	      if (flags.once) {
	        emitter.removeEventListener(name, wrapListener);
	      }
	      listener(arg);
	    });
	  } else {
	    throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
	  }
	}
	return events.exports;
}

var hasRequiredUtil;

function requireUtil () {
	if (hasRequiredUtil) return util.exports;
	hasRequiredUtil = 1;
	(function (module) {

		const bufferModule = requireBuffer();
		const { format, inspect } = requireInspect();
		const {
		  codes: { ERR_INVALID_ARG_TYPE }
		} = requireErrors();
		const { kResistStopPropagation, AggregateError, SymbolDispose } = requirePrimordials();
		const AbortSignal = globalThis.AbortSignal || requireBrowser$2().AbortSignal;
		const AbortController = globalThis.AbortController || requireBrowser$2().AbortController;
		const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
		const Blob = globalThis.Blob || bufferModule.Blob;
		/* eslint-disable indent */
		const isBlob =
		  typeof Blob !== 'undefined'
		    ? function isBlob(b) {
		        // eslint-disable-next-line indent
		        return b instanceof Blob
		      }
		    : function isBlob(b) {
		        return false
		      };
		/* eslint-enable indent */

		const validateAbortSignal = (signal, name) => {
		  if (signal !== undefined && (signal === null || typeof signal !== 'object' || !('aborted' in signal))) {
		    throw new ERR_INVALID_ARG_TYPE(name, 'AbortSignal', signal)
		  }
		};
		const validateFunction = (value, name) => {
		  if (typeof value !== 'function') {
		    throw new ERR_INVALID_ARG_TYPE(name, 'Function', value)
		  }
		};
		module.exports = {
		  AggregateError,
		  kEmptyObject: Object.freeze({}),
		  once(callback) {
		    let called = false;
		    return function (...args) {
		      if (called) {
		        return
		      }
		      called = true;
		      callback.apply(this, args);
		    }
		  },
		  createDeferredPromise: function () {
		    let resolve;
		    let reject;

		    // eslint-disable-next-line promise/param-names
		    const promise = new Promise((res, rej) => {
		      resolve = res;
		      reject = rej;
		    });
		    return {
		      promise,
		      resolve,
		      reject
		    }
		  },
		  promisify(fn) {
		    return new Promise((resolve, reject) => {
		      fn((err, ...args) => {
		        if (err) {
		          return reject(err)
		        }
		        return resolve(...args)
		      });
		    })
		  },
		  debuglog() {
		    return function () {}
		  },
		  format,
		  inspect,
		  types: {
		    isAsyncFunction(fn) {
		      return fn instanceof AsyncFunction
		    },
		    isArrayBufferView(arr) {
		      return ArrayBuffer.isView(arr)
		    }
		  },
		  isBlob,
		  deprecate(fn, message) {
		    return fn
		  },
		  addAbortListener:
		    requireEvents().addAbortListener ||
		    function addAbortListener(signal, listener) {
		      if (signal === undefined) {
		        throw new ERR_INVALID_ARG_TYPE('signal', 'AbortSignal', signal)
		      }
		      validateAbortSignal(signal, 'signal');
		      validateFunction(listener, 'listener');
		      let removeEventListener;
		      if (signal.aborted) {
		        queueMicrotask(() => listener());
		      } else {
		        signal.addEventListener('abort', listener, {
		          __proto__: null,
		          once: true,
		          [kResistStopPropagation]: true
		        });
		        removeEventListener = () => {
		          signal.removeEventListener('abort', listener);
		        };
		      }
		      return {
		        __proto__: null,
		        [SymbolDispose]() {
		          var _removeEventListener
		          ;(_removeEventListener = removeEventListener) === null || _removeEventListener === undefined
		            ? undefined
		            : _removeEventListener();
		        }
		      }
		    },
		  AbortSignalAny:
		    AbortSignal.any ||
		    function AbortSignalAny(signals) {
		      // Fast path if there is only one signal.
		      if (signals.length === 1) {
		        return signals[0]
		      }
		      const ac = new AbortController();
		      const abort = () => ac.abort();
		      signals.forEach((signal) => {
		        validateAbortSignal(signal, 'signals');
		        signal.addEventListener('abort', abort, {
		          once: true
		        });
		      });
		      ac.signal.addEventListener(
		        'abort',
		        () => {
		          signals.forEach((signal) => signal.removeEventListener('abort', abort));
		        },
		        {
		          once: true
		        }
		      );
		      return ac.signal
		    }
		};
		module.exports.promisify.custom = Symbol.for('nodejs.util.promisify.custom'); 
	} (util));
	return util.exports;
}

var operators = {};

/* eslint jsdoc/require-jsdoc: "error" */

var validators;
var hasRequiredValidators;

function requireValidators () {
	if (hasRequiredValidators) return validators;
	hasRequiredValidators = 1;

	const {
	  ArrayIsArray,
	  ArrayPrototypeIncludes,
	  ArrayPrototypeJoin,
	  ArrayPrototypeMap,
	  NumberIsInteger,
	  NumberIsNaN,
	  NumberMAX_SAFE_INTEGER,
	  NumberMIN_SAFE_INTEGER,
	  NumberParseInt,
	  ObjectPrototypeHasOwnProperty,
	  RegExpPrototypeExec,
	  String,
	  StringPrototypeToUpperCase,
	  StringPrototypeTrim
	} = requirePrimordials();
	const {
	  hideStackFrames,
	  codes: { ERR_SOCKET_BAD_PORT, ERR_INVALID_ARG_TYPE, ERR_INVALID_ARG_VALUE, ERR_OUT_OF_RANGE, ERR_UNKNOWN_SIGNAL }
	} = requireErrors();
	const { normalizeEncoding } = requireUtil();
	const { isAsyncFunction, isArrayBufferView } = requireUtil().types;
	const signals = {};

	/**
	 * @param {*} value
	 * @returns {boolean}
	 */
	function isInt32(value) {
	  return value === (value | 0)
	}

	/**
	 * @param {*} value
	 * @returns {boolean}
	 */
	function isUint32(value) {
	  return value === value >>> 0
	}
	const octalReg = /^[0-7]+$/;
	const modeDesc = 'must be a 32-bit unsigned integer or an octal string';

	/**
	 * Parse and validate values that will be converted into mode_t (the S_*
	 * constants). Only valid numbers and octal strings are allowed. They could be
	 * converted to 32-bit unsigned integers or non-negative signed integers in the
	 * C++ land, but any value higher than 0o777 will result in platform-specific
	 * behaviors.
	 * @param {*} value Values to be validated
	 * @param {string} name Name of the argument
	 * @param {number} [def] If specified, will be returned for invalid values
	 * @returns {number}
	 */
	function parseFileMode(value, name, def) {
	  if (typeof value === 'undefined') {
	    value = def;
	  }
	  if (typeof value === 'string') {
	    if (RegExpPrototypeExec(octalReg, value) === null) {
	      throw new ERR_INVALID_ARG_VALUE(name, value, modeDesc)
	    }
	    value = NumberParseInt(value, 8);
	  }
	  validateUint32(value, name);
	  return value
	}

	/**
	 * @callback validateInteger
	 * @param {*} value
	 * @param {string} name
	 * @param {number} [min]
	 * @param {number} [max]
	 * @returns {asserts value is number}
	 */

	/** @type {validateInteger} */
	const validateInteger = hideStackFrames((value, name, min = NumberMIN_SAFE_INTEGER, max = NumberMAX_SAFE_INTEGER) => {
	  if (typeof value !== 'number') throw new ERR_INVALID_ARG_TYPE(name, 'number', value)
	  if (!NumberIsInteger(value)) throw new ERR_OUT_OF_RANGE(name, 'an integer', value)
	  if (value < min || value > max) throw new ERR_OUT_OF_RANGE(name, `>= ${min} && <= ${max}`, value)
	});

	/**
	 * @callback validateInt32
	 * @param {*} value
	 * @param {string} name
	 * @param {number} [min]
	 * @param {number} [max]
	 * @returns {asserts value is number}
	 */

	/** @type {validateInt32} */
	const validateInt32 = hideStackFrames((value, name, min = -2147483648, max = 2147483647) => {
	  // The defaults for min and max correspond to the limits of 32-bit integers.
	  if (typeof value !== 'number') {
	    throw new ERR_INVALID_ARG_TYPE(name, 'number', value)
	  }
	  if (!NumberIsInteger(value)) {
	    throw new ERR_OUT_OF_RANGE(name, 'an integer', value)
	  }
	  if (value < min || value > max) {
	    throw new ERR_OUT_OF_RANGE(name, `>= ${min} && <= ${max}`, value)
	  }
	});

	/**
	 * @callback validateUint32
	 * @param {*} value
	 * @param {string} name
	 * @param {number|boolean} [positive=false]
	 * @returns {asserts value is number}
	 */

	/** @type {validateUint32} */
	const validateUint32 = hideStackFrames((value, name, positive = false) => {
	  if (typeof value !== 'number') {
	    throw new ERR_INVALID_ARG_TYPE(name, 'number', value)
	  }
	  if (!NumberIsInteger(value)) {
	    throw new ERR_OUT_OF_RANGE(name, 'an integer', value)
	  }
	  const min = positive ? 1 : 0;
	  // 2 ** 32 === 4294967296
	  const max = 4294967295;
	  if (value < min || value > max) {
	    throw new ERR_OUT_OF_RANGE(name, `>= ${min} && <= ${max}`, value)
	  }
	});

	/**
	 * @callback validateString
	 * @param {*} value
	 * @param {string} name
	 * @returns {asserts value is string}
	 */

	/** @type {validateString} */
	function validateString(value, name) {
	  if (typeof value !== 'string') throw new ERR_INVALID_ARG_TYPE(name, 'string', value)
	}

	/**
	 * @callback validateNumber
	 * @param {*} value
	 * @param {string} name
	 * @param {number} [min]
	 * @param {number} [max]
	 * @returns {asserts value is number}
	 */

	/** @type {validateNumber} */
	function validateNumber(value, name, min = undefined, max) {
	  if (typeof value !== 'number') throw new ERR_INVALID_ARG_TYPE(name, 'number', value)
	  if (
	    (min != null && value < min) ||
	    (max != null && value > max) ||
	    ((min != null || max != null) && NumberIsNaN(value))
	  ) {
	    throw new ERR_OUT_OF_RANGE(
	      name,
	      `${min != null ? `>= ${min}` : ''}${min != null && max != null ? ' && ' : ''}${max != null ? `<= ${max}` : ''}`,
	      value
	    )
	  }
	}

	/**
	 * @callback validateOneOf
	 * @template T
	 * @param {T} value
	 * @param {string} name
	 * @param {T[]} oneOf
	 */

	/** @type {validateOneOf} */
	const validateOneOf = hideStackFrames((value, name, oneOf) => {
	  if (!ArrayPrototypeIncludes(oneOf, value)) {
	    const allowed = ArrayPrototypeJoin(
	      ArrayPrototypeMap(oneOf, (v) => (typeof v === 'string' ? `'${v}'` : String(v))),
	      ', '
	    );
	    const reason = 'must be one of: ' + allowed;
	    throw new ERR_INVALID_ARG_VALUE(name, value, reason)
	  }
	});

	/**
	 * @callback validateBoolean
	 * @param {*} value
	 * @param {string} name
	 * @returns {asserts value is boolean}
	 */

	/** @type {validateBoolean} */
	function validateBoolean(value, name) {
	  if (typeof value !== 'boolean') throw new ERR_INVALID_ARG_TYPE(name, 'boolean', value)
	}

	/**
	 * @param {any} options
	 * @param {string} key
	 * @param {boolean} defaultValue
	 * @returns {boolean}
	 */
	function getOwnPropertyValueOrDefault(options, key, defaultValue) {
	  return options == null || !ObjectPrototypeHasOwnProperty(options, key) ? defaultValue : options[key]
	}

	/**
	 * @callback validateObject
	 * @param {*} value
	 * @param {string} name
	 * @param {{
	 *   allowArray?: boolean,
	 *   allowFunction?: boolean,
	 *   nullable?: boolean
	 * }} [options]
	 */

	/** @type {validateObject} */
	const validateObject = hideStackFrames((value, name, options = null) => {
	  const allowArray = getOwnPropertyValueOrDefault(options, 'allowArray', false);
	  const allowFunction = getOwnPropertyValueOrDefault(options, 'allowFunction', false);
	  const nullable = getOwnPropertyValueOrDefault(options, 'nullable', false);
	  if (
	    (!nullable && value === null) ||
	    (!allowArray && ArrayIsArray(value)) ||
	    (typeof value !== 'object' && (!allowFunction || typeof value !== 'function'))
	  ) {
	    throw new ERR_INVALID_ARG_TYPE(name, 'Object', value)
	  }
	});

	/**
	 * @callback validateDictionary - We are using the Web IDL Standard definition
	 *                                of "dictionary" here, which means any value
	 *                                whose Type is either Undefined, Null, or
	 *                                Object (which includes functions).
	 * @param {*} value
	 * @param {string} name
	 * @see https://webidl.spec.whatwg.org/#es-dictionary
	 * @see https://tc39.es/ecma262/#table-typeof-operator-results
	 */

	/** @type {validateDictionary} */
	const validateDictionary = hideStackFrames((value, name) => {
	  if (value != null && typeof value !== 'object' && typeof value !== 'function') {
	    throw new ERR_INVALID_ARG_TYPE(name, 'a dictionary', value)
	  }
	});

	/**
	 * @callback validateArray
	 * @param {*} value
	 * @param {string} name
	 * @param {number} [minLength]
	 * @returns {asserts value is any[]}
	 */

	/** @type {validateArray} */
	const validateArray = hideStackFrames((value, name, minLength = 0) => {
	  if (!ArrayIsArray(value)) {
	    throw new ERR_INVALID_ARG_TYPE(name, 'Array', value)
	  }
	  if (value.length < minLength) {
	    const reason = `must be longer than ${minLength}`;
	    throw new ERR_INVALID_ARG_VALUE(name, value, reason)
	  }
	});

	/**
	 * @callback validateStringArray
	 * @param {*} value
	 * @param {string} name
	 * @returns {asserts value is string[]}
	 */

	/** @type {validateStringArray} */
	function validateStringArray(value, name) {
	  validateArray(value, name);
	  for (let i = 0; i < value.length; i++) {
	    validateString(value[i], `${name}[${i}]`);
	  }
	}

	/**
	 * @callback validateBooleanArray
	 * @param {*} value
	 * @param {string} name
	 * @returns {asserts value is boolean[]}
	 */

	/** @type {validateBooleanArray} */
	function validateBooleanArray(value, name) {
	  validateArray(value, name);
	  for (let i = 0; i < value.length; i++) {
	    validateBoolean(value[i], `${name}[${i}]`);
	  }
	}

	/**
	 * @callback validateAbortSignalArray
	 * @param {*} value
	 * @param {string} name
	 * @returns {asserts value is AbortSignal[]}
	 */

	/** @type {validateAbortSignalArray} */
	function validateAbortSignalArray(value, name) {
	  validateArray(value, name);
	  for (let i = 0; i < value.length; i++) {
	    const signal = value[i];
	    const indexedName = `${name}[${i}]`;
	    if (signal == null) {
	      throw new ERR_INVALID_ARG_TYPE(indexedName, 'AbortSignal', signal)
	    }
	    validateAbortSignal(signal, indexedName);
	  }
	}

	/**
	 * @param {*} signal
	 * @param {string} [name='signal']
	 * @returns {asserts signal is keyof signals}
	 */
	function validateSignalName(signal, name = 'signal') {
	  validateString(signal, name);
	  if (signals[signal] === undefined) {
	    if (signals[StringPrototypeToUpperCase(signal)] !== undefined) {
	      throw new ERR_UNKNOWN_SIGNAL(signal + ' (signals must use all capital letters)')
	    }
	    throw new ERR_UNKNOWN_SIGNAL(signal)
	  }
	}

	/**
	 * @callback validateBuffer
	 * @param {*} buffer
	 * @param {string} [name='buffer']
	 * @returns {asserts buffer is ArrayBufferView}
	 */

	/** @type {validateBuffer} */
	const validateBuffer = hideStackFrames((buffer, name = 'buffer') => {
	  if (!isArrayBufferView(buffer)) {
	    throw new ERR_INVALID_ARG_TYPE(name, ['Buffer', 'TypedArray', 'DataView'], buffer)
	  }
	});

	/**
	 * @param {string} data
	 * @param {string} encoding
	 */
	function validateEncoding(data, encoding) {
	  const normalizedEncoding = normalizeEncoding(encoding);
	  const length = data.length;
	  if (normalizedEncoding === 'hex' && length % 2 !== 0) {
	    throw new ERR_INVALID_ARG_VALUE('encoding', encoding, `is invalid for data of length ${length}`)
	  }
	}

	/**
	 * Check that the port number is not NaN when coerced to a number,
	 * is an integer and that it falls within the legal range of port numbers.
	 * @param {*} port
	 * @param {string} [name='Port']
	 * @param {boolean} [allowZero=true]
	 * @returns {number}
	 */
	function validatePort(port, name = 'Port', allowZero = true) {
	  if (
	    (typeof port !== 'number' && typeof port !== 'string') ||
	    (typeof port === 'string' && StringPrototypeTrim(port).length === 0) ||
	    +port !== +port >>> 0 ||
	    port > 0xffff ||
	    (port === 0 && !allowZero)
	  ) {
	    throw new ERR_SOCKET_BAD_PORT(name, port, allowZero)
	  }
	  return port | 0
	}

	/**
	 * @callback validateAbortSignal
	 * @param {*} signal
	 * @param {string} name
	 */

	/** @type {validateAbortSignal} */
	const validateAbortSignal = hideStackFrames((signal, name) => {
	  if (signal !== undefined && (signal === null || typeof signal !== 'object' || !('aborted' in signal))) {
	    throw new ERR_INVALID_ARG_TYPE(name, 'AbortSignal', signal)
	  }
	});

	/**
	 * @callback validateFunction
	 * @param {*} value
	 * @param {string} name
	 * @returns {asserts value is Function}
	 */

	/** @type {validateFunction} */
	const validateFunction = hideStackFrames((value, name) => {
	  if (typeof value !== 'function') throw new ERR_INVALID_ARG_TYPE(name, 'Function', value)
	});

	/**
	 * @callback validatePlainFunction
	 * @param {*} value
	 * @param {string} name
	 * @returns {asserts value is Function}
	 */

	/** @type {validatePlainFunction} */
	const validatePlainFunction = hideStackFrames((value, name) => {
	  if (typeof value !== 'function' || isAsyncFunction(value)) throw new ERR_INVALID_ARG_TYPE(name, 'Function', value)
	});

	/**
	 * @callback validateUndefined
	 * @param {*} value
	 * @param {string} name
	 * @returns {asserts value is undefined}
	 */

	/** @type {validateUndefined} */
	const validateUndefined = hideStackFrames((value, name) => {
	  if (value !== undefined) throw new ERR_INVALID_ARG_TYPE(name, 'undefined', value)
	});

	/**
	 * @template T
	 * @param {T} value
	 * @param {string} name
	 * @param {T[]} union
	 */
	function validateUnion(value, name, union) {
	  if (!ArrayPrototypeIncludes(union, value)) {
	    throw new ERR_INVALID_ARG_TYPE(name, `('${ArrayPrototypeJoin(union, '|')}')`, value)
	  }
	}

	/*
	  The rules for the Link header field are described here:
	  https://www.rfc-editor.org/rfc/rfc8288.html#section-3

	  This regex validates any string surrounded by angle brackets
	  (not necessarily a valid URI reference) followed by zero or more
	  link-params separated by semicolons.
	*/
	const linkValueRegExp = /^(?:<[^>]*>)(?:\s*;\s*[^;"\s]+(?:=(")?[^;"\s]*\1)?)*$/;

	/**
	 * @param {any} value
	 * @param {string} name
	 */
	function validateLinkHeaderFormat(value, name) {
	  if (typeof value === 'undefined' || !RegExpPrototypeExec(linkValueRegExp, value)) {
	    throw new ERR_INVALID_ARG_VALUE(
	      name,
	      value,
	      'must be an array or string of format "</styles.css>; rel=preload; as=style"'
	    )
	  }
	}

	/**
	 * @param {any} hints
	 * @return {string}
	 */
	function validateLinkHeaderValue(hints) {
	  if (typeof hints === 'string') {
	    validateLinkHeaderFormat(hints, 'hints');
	    return hints
	  } else if (ArrayIsArray(hints)) {
	    const hintsLength = hints.length;
	    let result = '';
	    if (hintsLength === 0) {
	      return result
	    }
	    for (let i = 0; i < hintsLength; i++) {
	      const link = hints[i];
	      validateLinkHeaderFormat(link, 'hints');
	      result += link;
	      if (i !== hintsLength - 1) {
	        result += ', ';
	      }
	    }
	    return result
	  }
	  throw new ERR_INVALID_ARG_VALUE(
	    'hints',
	    hints,
	    'must be an array or string of format "</styles.css>; rel=preload; as=style"'
	  )
	}
	validators = {
	  isInt32,
	  isUint32,
	  parseFileMode,
	  validateArray,
	  validateStringArray,
	  validateBooleanArray,
	  validateAbortSignalArray,
	  validateBoolean,
	  validateBuffer,
	  validateDictionary,
	  validateEncoding,
	  validateFunction,
	  validateInt32,
	  validateInteger,
	  validateNumber,
	  validateObject,
	  validateOneOf,
	  validatePlainFunction,
	  validatePort,
	  validateSignalName,
	  validateString,
	  validateUint32,
	  validateUndefined,
	  validateUnion,
	  validateAbortSignal,
	  validateLinkHeaderValue
	};
	return validators;
}

var endOfStream = {exports: {}};

var browser = {exports: {}};

var hasRequiredBrowser$1;

function requireBrowser$1 () {
	if (hasRequiredBrowser$1) return browser.exports;
	hasRequiredBrowser$1 = 1;
	// shim for using process in browser
	var process = browser.exports = {};

	// cached from whatever global is present so that test runners that stub it
	// don't break things.  But we need to wrap it in a try catch in case it is
	// wrapped in strict mode code which doesn't define any globals.  It's inside a
	// function because try/catches deoptimize in certain engines.

	var cachedSetTimeout;
	var cachedClearTimeout;

	function defaultSetTimout() {
	    throw new Error('setTimeout has not been defined');
	}
	function defaultClearTimeout () {
	    throw new Error('clearTimeout has not been defined');
	}
	(function () {
	    try {
	        if (typeof setTimeout === 'function') {
	            cachedSetTimeout = setTimeout;
	        } else {
	            cachedSetTimeout = defaultSetTimout;
	        }
	    } catch (e) {
	        cachedSetTimeout = defaultSetTimout;
	    }
	    try {
	        if (typeof clearTimeout === 'function') {
	            cachedClearTimeout = clearTimeout;
	        } else {
	            cachedClearTimeout = defaultClearTimeout;
	        }
	    } catch (e) {
	        cachedClearTimeout = defaultClearTimeout;
	    }
	} ());
	function runTimeout(fun) {
	    if (cachedSetTimeout === setTimeout) {
	        //normal enviroments in sane situations
	        return setTimeout(fun, 0);
	    }
	    // if setTimeout wasn't available but was latter defined
	    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
	        cachedSetTimeout = setTimeout;
	        return setTimeout(fun, 0);
	    }
	    try {
	        // when when somebody has screwed with setTimeout but no I.E. maddness
	        return cachedSetTimeout(fun, 0);
	    } catch(e){
	        try {
	            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
	            return cachedSetTimeout.call(null, fun, 0);
	        } catch(e){
	            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
	            return cachedSetTimeout.call(this, fun, 0);
	        }
	    }


	}
	function runClearTimeout(marker) {
	    if (cachedClearTimeout === clearTimeout) {
	        //normal enviroments in sane situations
	        return clearTimeout(marker);
	    }
	    // if clearTimeout wasn't available but was latter defined
	    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
	        cachedClearTimeout = clearTimeout;
	        return clearTimeout(marker);
	    }
	    try {
	        // when when somebody has screwed with setTimeout but no I.E. maddness
	        return cachedClearTimeout(marker);
	    } catch (e){
	        try {
	            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
	            return cachedClearTimeout.call(null, marker);
	        } catch (e){
	            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
	            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
	            return cachedClearTimeout.call(this, marker);
	        }
	    }



	}
	var queue = [];
	var draining = false;
	var currentQueue;
	var queueIndex = -1;

	function cleanUpNextTick() {
	    if (!draining || !currentQueue) {
	        return;
	    }
	    draining = false;
	    if (currentQueue.length) {
	        queue = currentQueue.concat(queue);
	    } else {
	        queueIndex = -1;
	    }
	    if (queue.length) {
	        drainQueue();
	    }
	}

	function drainQueue() {
	    if (draining) {
	        return;
	    }
	    var timeout = runTimeout(cleanUpNextTick);
	    draining = true;

	    var len = queue.length;
	    while(len) {
	        currentQueue = queue;
	        queue = [];
	        while (++queueIndex < len) {
	            if (currentQueue) {
	                currentQueue[queueIndex].run();
	            }
	        }
	        queueIndex = -1;
	        len = queue.length;
	    }
	    currentQueue = null;
	    draining = false;
	    runClearTimeout(timeout);
	}

	process.nextTick = function (fun) {
	    var args = new Array(arguments.length - 1);
	    if (arguments.length > 1) {
	        for (var i = 1; i < arguments.length; i++) {
	            args[i - 1] = arguments[i];
	        }
	    }
	    queue.push(new Item(fun, args));
	    if (queue.length === 1 && !draining) {
	        runTimeout(drainQueue);
	    }
	};

	// v8 likes predictible objects
	function Item(fun, array) {
	    this.fun = fun;
	    this.array = array;
	}
	Item.prototype.run = function () {
	    this.fun.apply(null, this.array);
	};
	process.title = 'browser';
	process.browser = true;
	process.env = {};
	process.argv = [];
	process.version = ''; // empty string to avoid regexp issues
	process.versions = {};

	function noop() {}

	process.on = noop;
	process.addListener = noop;
	process.once = noop;
	process.off = noop;
	process.removeListener = noop;
	process.removeAllListeners = noop;
	process.emit = noop;
	process.prependListener = noop;
	process.prependOnceListener = noop;

	process.listeners = function (name) { return [] };

	process.binding = function (name) {
	    throw new Error('process.binding is not supported');
	};

	process.cwd = function () { return '/' };
	process.chdir = function (dir) {
	    throw new Error('process.chdir is not supported');
	};
	process.umask = function() { return 0; };
	return browser.exports;
}

var utils;
var hasRequiredUtils;

function requireUtils () {
	if (hasRequiredUtils) return utils;
	hasRequiredUtils = 1;

	const { SymbolAsyncIterator, SymbolIterator, SymbolFor } = requirePrimordials();

	// We need to use SymbolFor to make these globally available
	// for interopt with readable-stream, i.e. readable-stream
	// and node core needs to be able to read/write private state
	// from each other for proper interoperability.
	const kIsDestroyed = SymbolFor('nodejs.stream.destroyed');
	const kIsErrored = SymbolFor('nodejs.stream.errored');
	const kIsReadable = SymbolFor('nodejs.stream.readable');
	const kIsWritable = SymbolFor('nodejs.stream.writable');
	const kIsDisturbed = SymbolFor('nodejs.stream.disturbed');
	const kIsClosedPromise = SymbolFor('nodejs.webstream.isClosedPromise');
	const kControllerErrorFunction = SymbolFor('nodejs.webstream.controllerErrorFunction');
	function isReadableNodeStream(obj, strict = false) {
	  var _obj$_readableState;
	  return !!(
	    (
	      obj &&
	      typeof obj.pipe === 'function' &&
	      typeof obj.on === 'function' &&
	      (!strict || (typeof obj.pause === 'function' && typeof obj.resume === 'function')) &&
	      (!obj._writableState ||
	        ((_obj$_readableState = obj._readableState) === null || _obj$_readableState === undefined
	          ? undefined
	          : _obj$_readableState.readable) !== false) &&
	      // Duplex
	      (!obj._writableState || obj._readableState)
	    ) // Writable has .pipe.
	  )
	}
	function isWritableNodeStream(obj) {
	  var _obj$_writableState;
	  return !!(
	    (
	      obj &&
	      typeof obj.write === 'function' &&
	      typeof obj.on === 'function' &&
	      (!obj._readableState ||
	        ((_obj$_writableState = obj._writableState) === null || _obj$_writableState === undefined
	          ? undefined
	          : _obj$_writableState.writable) !== false)
	    ) // Duplex
	  )
	}
	function isDuplexNodeStream(obj) {
	  return !!(
	    obj &&
	    typeof obj.pipe === 'function' &&
	    obj._readableState &&
	    typeof obj.on === 'function' &&
	    typeof obj.write === 'function'
	  )
	}
	function isNodeStream(obj) {
	  return (
	    obj &&
	    (obj._readableState ||
	      obj._writableState ||
	      (typeof obj.write === 'function' && typeof obj.on === 'function') ||
	      (typeof obj.pipe === 'function' && typeof obj.on === 'function'))
	  )
	}
	function isReadableStream(obj) {
	  return !!(
	    obj &&
	    !isNodeStream(obj) &&
	    typeof obj.pipeThrough === 'function' &&
	    typeof obj.getReader === 'function' &&
	    typeof obj.cancel === 'function'
	  )
	}
	function isWritableStream(obj) {
	  return !!(obj && !isNodeStream(obj) && typeof obj.getWriter === 'function' && typeof obj.abort === 'function')
	}
	function isTransformStream(obj) {
	  return !!(obj && !isNodeStream(obj) && typeof obj.readable === 'object' && typeof obj.writable === 'object')
	}
	function isWebStream(obj) {
	  return isReadableStream(obj) || isWritableStream(obj) || isTransformStream(obj)
	}
	function isIterable(obj, isAsync) {
	  if (obj == null) return false
	  if (isAsync === true) return typeof obj[SymbolAsyncIterator] === 'function'
	  if (isAsync === false) return typeof obj[SymbolIterator] === 'function'
	  return typeof obj[SymbolAsyncIterator] === 'function' || typeof obj[SymbolIterator] === 'function'
	}
	function isDestroyed(stream) {
	  if (!isNodeStream(stream)) return null
	  const wState = stream._writableState;
	  const rState = stream._readableState;
	  const state = wState || rState;
	  return !!(stream.destroyed || stream[kIsDestroyed] || (state !== null && state !== undefined && state.destroyed))
	}

	// Have been end():d.
	function isWritableEnded(stream) {
	  if (!isWritableNodeStream(stream)) return null
	  if (stream.writableEnded === true) return true
	  const wState = stream._writableState;
	  if (wState !== null && wState !== undefined && wState.errored) return false
	  if (typeof (wState === null || wState === undefined ? undefined : wState.ended) !== 'boolean') return null
	  return wState.ended
	}

	// Have emitted 'finish'.
	function isWritableFinished(stream, strict) {
	  if (!isWritableNodeStream(stream)) return null
	  if (stream.writableFinished === true) return true
	  const wState = stream._writableState;
	  if (wState !== null && wState !== undefined && wState.errored) return false
	  if (typeof (wState === null || wState === undefined ? undefined : wState.finished) !== 'boolean') return null
	  return !!(wState.finished || (strict === false && wState.ended === true && wState.length === 0))
	}

	// Have been push(null):d.
	function isReadableEnded(stream) {
	  if (!isReadableNodeStream(stream)) return null
	  if (stream.readableEnded === true) return true
	  const rState = stream._readableState;
	  if (!rState || rState.errored) return false
	  if (typeof (rState === null || rState === undefined ? undefined : rState.ended) !== 'boolean') return null
	  return rState.ended
	}

	// Have emitted 'end'.
	function isReadableFinished(stream, strict) {
	  if (!isReadableNodeStream(stream)) return null
	  const rState = stream._readableState;
	  if (rState !== null && rState !== undefined && rState.errored) return false
	  if (typeof (rState === null || rState === undefined ? undefined : rState.endEmitted) !== 'boolean') return null
	  return !!(rState.endEmitted || (strict === false && rState.ended === true && rState.length === 0))
	}
	function isReadable(stream) {
	  if (stream && stream[kIsReadable] != null) return stream[kIsReadable]
	  if (typeof (stream === null || stream === undefined ? undefined : stream.readable) !== 'boolean') return null
	  if (isDestroyed(stream)) return false
	  return isReadableNodeStream(stream) && stream.readable && !isReadableFinished(stream)
	}
	function isWritable(stream) {
	  if (stream && stream[kIsWritable] != null) return stream[kIsWritable]
	  if (typeof (stream === null || stream === undefined ? undefined : stream.writable) !== 'boolean') return null
	  if (isDestroyed(stream)) return false
	  return isWritableNodeStream(stream) && stream.writable && !isWritableEnded(stream)
	}
	function isFinished(stream, opts) {
	  if (!isNodeStream(stream)) {
	    return null
	  }
	  if (isDestroyed(stream)) {
	    return true
	  }
	  if ((opts === null || opts === undefined ? undefined : opts.readable) !== false && isReadable(stream)) {
	    return false
	  }
	  if ((opts === null || opts === undefined ? undefined : opts.writable) !== false && isWritable(stream)) {
	    return false
	  }
	  return true
	}
	function isWritableErrored(stream) {
	  var _stream$_writableStat, _stream$_writableStat2;
	  if (!isNodeStream(stream)) {
	    return null
	  }
	  if (stream.writableErrored) {
	    return stream.writableErrored
	  }
	  return (_stream$_writableStat =
	    (_stream$_writableStat2 = stream._writableState) === null || _stream$_writableStat2 === undefined
	      ? undefined
	      : _stream$_writableStat2.errored) !== null && _stream$_writableStat !== undefined
	    ? _stream$_writableStat
	    : null
	}
	function isReadableErrored(stream) {
	  var _stream$_readableStat, _stream$_readableStat2;
	  if (!isNodeStream(stream)) {
	    return null
	  }
	  if (stream.readableErrored) {
	    return stream.readableErrored
	  }
	  return (_stream$_readableStat =
	    (_stream$_readableStat2 = stream._readableState) === null || _stream$_readableStat2 === undefined
	      ? undefined
	      : _stream$_readableStat2.errored) !== null && _stream$_readableStat !== undefined
	    ? _stream$_readableStat
	    : null
	}
	function isClosed(stream) {
	  if (!isNodeStream(stream)) {
	    return null
	  }
	  if (typeof stream.closed === 'boolean') {
	    return stream.closed
	  }
	  const wState = stream._writableState;
	  const rState = stream._readableState;
	  if (
	    typeof (wState === null || wState === undefined ? undefined : wState.closed) === 'boolean' ||
	    typeof (rState === null || rState === undefined ? undefined : rState.closed) === 'boolean'
	  ) {
	    return (
	      (wState === null || wState === undefined ? undefined : wState.closed) ||
	      (rState === null || rState === undefined ? undefined : rState.closed)
	    )
	  }
	  if (typeof stream._closed === 'boolean' && isOutgoingMessage(stream)) {
	    return stream._closed
	  }
	  return null
	}
	function isOutgoingMessage(stream) {
	  return (
	    typeof stream._closed === 'boolean' &&
	    typeof stream._defaultKeepAlive === 'boolean' &&
	    typeof stream._removedConnection === 'boolean' &&
	    typeof stream._removedContLen === 'boolean'
	  )
	}
	function isServerResponse(stream) {
	  return typeof stream._sent100 === 'boolean' && isOutgoingMessage(stream)
	}
	function isServerRequest(stream) {
	  var _stream$req;
	  return (
	    typeof stream._consuming === 'boolean' &&
	    typeof stream._dumped === 'boolean' &&
	    ((_stream$req = stream.req) === null || _stream$req === undefined ? undefined : _stream$req.upgradeOrConnect) ===
	      undefined
	  )
	}
	function willEmitClose(stream) {
	  if (!isNodeStream(stream)) return null
	  const wState = stream._writableState;
	  const rState = stream._readableState;
	  const state = wState || rState;
	  return (
	    (!state && isServerResponse(stream)) || !!(state && state.autoDestroy && state.emitClose && state.closed === false)
	  )
	}
	function isDisturbed(stream) {
	  var _stream$kIsDisturbed;
	  return !!(
	    stream &&
	    ((_stream$kIsDisturbed = stream[kIsDisturbed]) !== null && _stream$kIsDisturbed !== undefined
	      ? _stream$kIsDisturbed
	      : stream.readableDidRead || stream.readableAborted)
	  )
	}
	function isErrored(stream) {
	  var _ref,
	    _ref2,
	    _ref3,
	    _ref4,
	    _ref5,
	    _stream$kIsErrored,
	    _stream$_readableStat3,
	    _stream$_writableStat3,
	    _stream$_readableStat4,
	    _stream$_writableStat4;
	  return !!(
	    stream &&
	    ((_ref =
	      (_ref2 =
	        (_ref3 =
	          (_ref4 =
	            (_ref5 =
	              (_stream$kIsErrored = stream[kIsErrored]) !== null && _stream$kIsErrored !== undefined
	                ? _stream$kIsErrored
	                : stream.readableErrored) !== null && _ref5 !== undefined
	              ? _ref5
	              : stream.writableErrored) !== null && _ref4 !== undefined
	            ? _ref4
	            : (_stream$_readableStat3 = stream._readableState) === null || _stream$_readableStat3 === undefined
	            ? undefined
	            : _stream$_readableStat3.errorEmitted) !== null && _ref3 !== undefined
	          ? _ref3
	          : (_stream$_writableStat3 = stream._writableState) === null || _stream$_writableStat3 === undefined
	          ? undefined
	          : _stream$_writableStat3.errorEmitted) !== null && _ref2 !== undefined
	        ? _ref2
	        : (_stream$_readableStat4 = stream._readableState) === null || _stream$_readableStat4 === undefined
	        ? undefined
	        : _stream$_readableStat4.errored) !== null && _ref !== undefined
	      ? _ref
	      : (_stream$_writableStat4 = stream._writableState) === null || _stream$_writableStat4 === undefined
	      ? undefined
	      : _stream$_writableStat4.errored)
	  )
	}
	utils = {
	  isDestroyed,
	  kIsDestroyed,
	  isDisturbed,
	  kIsDisturbed,
	  isErrored,
	  kIsErrored,
	  isReadable,
	  kIsReadable,
	  kIsClosedPromise,
	  kControllerErrorFunction,
	  kIsWritable,
	  isClosed,
	  isDuplexNodeStream,
	  isFinished,
	  isIterable,
	  isReadableNodeStream,
	  isReadableStream,
	  isReadableEnded,
	  isReadableFinished,
	  isReadableErrored,
	  isNodeStream,
	  isWebStream,
	  isWritable,
	  isWritableNodeStream,
	  isWritableStream,
	  isWritableEnded,
	  isWritableFinished,
	  isWritableErrored,
	  isServerRequest,
	  isServerResponse,
	  willEmitClose,
	  isTransformStream
	};
	return utils;
}

var hasRequiredEndOfStream;

function requireEndOfStream () {
	if (hasRequiredEndOfStream) return endOfStream.exports;
	hasRequiredEndOfStream = 1;

	/* replacement start */

	const process = requireBrowser$1();

	/* replacement end */

	const { AbortError, codes } = requireErrors();
	const { ERR_INVALID_ARG_TYPE, ERR_STREAM_PREMATURE_CLOSE } = codes;
	const { kEmptyObject, once } = requireUtil();
	const { validateAbortSignal, validateFunction, validateObject, validateBoolean } = requireValidators();
	const { Promise, PromisePrototypeThen, SymbolDispose } = requirePrimordials();
	const {
	  isClosed,
	  isReadable,
	  isReadableNodeStream,
	  isReadableStream,
	  isReadableFinished,
	  isReadableErrored,
	  isWritable,
	  isWritableNodeStream,
	  isWritableStream,
	  isWritableFinished,
	  isWritableErrored,
	  isNodeStream,
	  willEmitClose: _willEmitClose,
	  kIsClosedPromise
	} = requireUtils();
	let addAbortListener;
	function isRequest(stream) {
	  return stream.setHeader && typeof stream.abort === 'function'
	}
	const nop = () => {};
	function eos(stream, options, callback) {
	  var _options$readable, _options$writable;
	  if (arguments.length === 2) {
	    callback = options;
	    options = kEmptyObject;
	  } else if (options == null) {
	    options = kEmptyObject;
	  } else {
	    validateObject(options, 'options');
	  }
	  validateFunction(callback, 'callback');
	  validateAbortSignal(options.signal, 'options.signal');
	  callback = once(callback);
	  if (isReadableStream(stream) || isWritableStream(stream)) {
	    return eosWeb(stream, options, callback)
	  }
	  if (!isNodeStream(stream)) {
	    throw new ERR_INVALID_ARG_TYPE('stream', ['ReadableStream', 'WritableStream', 'Stream'], stream)
	  }
	  const readable =
	    (_options$readable = options.readable) !== null && _options$readable !== undefined
	      ? _options$readable
	      : isReadableNodeStream(stream);
	  const writable =
	    (_options$writable = options.writable) !== null && _options$writable !== undefined
	      ? _options$writable
	      : isWritableNodeStream(stream);
	  const wState = stream._writableState;
	  const rState = stream._readableState;
	  const onlegacyfinish = () => {
	    if (!stream.writable) {
	      onfinish();
	    }
	  };

	  // TODO (ronag): Improve soft detection to include core modules and
	  // common ecosystem modules that do properly emit 'close' but fail
	  // this generic check.
	  let willEmitClose =
	    _willEmitClose(stream) && isReadableNodeStream(stream) === readable && isWritableNodeStream(stream) === writable;
	  let writableFinished = isWritableFinished(stream, false);
	  const onfinish = () => {
	    writableFinished = true;
	    // Stream should not be destroyed here. If it is that
	    // means that user space is doing something differently and
	    // we cannot trust willEmitClose.
	    if (stream.destroyed) {
	      willEmitClose = false;
	    }
	    if (willEmitClose && (!stream.readable || readable)) {
	      return
	    }
	    if (!readable || readableFinished) {
	      callback.call(stream);
	    }
	  };
	  let readableFinished = isReadableFinished(stream, false);
	  const onend = () => {
	    readableFinished = true;
	    // Stream should not be destroyed here. If it is that
	    // means that user space is doing something differently and
	    // we cannot trust willEmitClose.
	    if (stream.destroyed) {
	      willEmitClose = false;
	    }
	    if (willEmitClose && (!stream.writable || writable)) {
	      return
	    }
	    if (!writable || writableFinished) {
	      callback.call(stream);
	    }
	  };
	  const onerror = (err) => {
	    callback.call(stream, err);
	  };
	  let closed = isClosed(stream);
	  const onclose = () => {
	    closed = true;
	    const errored = isWritableErrored(stream) || isReadableErrored(stream);
	    if (errored && typeof errored !== 'boolean') {
	      return callback.call(stream, errored)
	    }
	    if (readable && !readableFinished && isReadableNodeStream(stream, true)) {
	      if (!isReadableFinished(stream, false)) return callback.call(stream, new ERR_STREAM_PREMATURE_CLOSE())
	    }
	    if (writable && !writableFinished) {
	      if (!isWritableFinished(stream, false)) return callback.call(stream, new ERR_STREAM_PREMATURE_CLOSE())
	    }
	    callback.call(stream);
	  };
	  const onclosed = () => {
	    closed = true;
	    const errored = isWritableErrored(stream) || isReadableErrored(stream);
	    if (errored && typeof errored !== 'boolean') {
	      return callback.call(stream, errored)
	    }
	    callback.call(stream);
	  };
	  const onrequest = () => {
	    stream.req.on('finish', onfinish);
	  };
	  if (isRequest(stream)) {
	    stream.on('complete', onfinish);
	    if (!willEmitClose) {
	      stream.on('abort', onclose);
	    }
	    if (stream.req) {
	      onrequest();
	    } else {
	      stream.on('request', onrequest);
	    }
	  } else if (writable && !wState) {
	    // legacy streams
	    stream.on('end', onlegacyfinish);
	    stream.on('close', onlegacyfinish);
	  }

	  // Not all streams will emit 'close' after 'aborted'.
	  if (!willEmitClose && typeof stream.aborted === 'boolean') {
	    stream.on('aborted', onclose);
	  }
	  stream.on('end', onend);
	  stream.on('finish', onfinish);
	  if (options.error !== false) {
	    stream.on('error', onerror);
	  }
	  stream.on('close', onclose);
	  if (closed) {
	    process.nextTick(onclose);
	  } else if (
	    (wState !== null && wState !== undefined && wState.errorEmitted) ||
	    (rState !== null && rState !== undefined && rState.errorEmitted)
	  ) {
	    if (!willEmitClose) {
	      process.nextTick(onclosed);
	    }
	  } else if (
	    !readable &&
	    (!willEmitClose || isReadable(stream)) &&
	    (writableFinished || isWritable(stream) === false)
	  ) {
	    process.nextTick(onclosed);
	  } else if (
	    !writable &&
	    (!willEmitClose || isWritable(stream)) &&
	    (readableFinished || isReadable(stream) === false)
	  ) {
	    process.nextTick(onclosed);
	  } else if (rState && stream.req && stream.aborted) {
	    process.nextTick(onclosed);
	  }
	  const cleanup = () => {
	    callback = nop;
	    stream.removeListener('aborted', onclose);
	    stream.removeListener('complete', onfinish);
	    stream.removeListener('abort', onclose);
	    stream.removeListener('request', onrequest);
	    if (stream.req) stream.req.removeListener('finish', onfinish);
	    stream.removeListener('end', onlegacyfinish);
	    stream.removeListener('close', onlegacyfinish);
	    stream.removeListener('finish', onfinish);
	    stream.removeListener('end', onend);
	    stream.removeListener('error', onerror);
	    stream.removeListener('close', onclose);
	  };
	  if (options.signal && !closed) {
	    const abort = () => {
	      // Keep it because cleanup removes it.
	      const endCallback = callback;
	      cleanup();
	      endCallback.call(
	        stream,
	        new AbortError(undefined, {
	          cause: options.signal.reason
	        })
	      );
	    };
	    if (options.signal.aborted) {
	      process.nextTick(abort);
	    } else {
	      addAbortListener = addAbortListener || requireUtil().addAbortListener;
	      const disposable = addAbortListener(options.signal, abort);
	      const originalCallback = callback;
	      callback = once((...args) => {
	        disposable[SymbolDispose]();
	        originalCallback.apply(stream, args);
	      });
	    }
	  }
	  return cleanup
	}
	function eosWeb(stream, options, callback) {
	  let isAborted = false;
	  let abort = nop;
	  if (options.signal) {
	    abort = () => {
	      isAborted = true;
	      callback.call(
	        stream,
	        new AbortError(undefined, {
	          cause: options.signal.reason
	        })
	      );
	    };
	    if (options.signal.aborted) {
	      process.nextTick(abort);
	    } else {
	      addAbortListener = addAbortListener || requireUtil().addAbortListener;
	      const disposable = addAbortListener(options.signal, abort);
	      const originalCallback = callback;
	      callback = once((...args) => {
	        disposable[SymbolDispose]();
	        originalCallback.apply(stream, args);
	      });
	    }
	  }
	  const resolverFn = (...args) => {
	    if (!isAborted) {
	      process.nextTick(() => callback.apply(stream, args));
	    }
	  };
	  PromisePrototypeThen(stream[kIsClosedPromise].promise, resolverFn, resolverFn);
	  return nop
	}
	function finished(stream, opts) {
	  var _opts;
	  let autoCleanup = false;
	  if (opts === null) {
	    opts = kEmptyObject;
	  }
	  if ((_opts = opts) !== null && _opts !== undefined && _opts.cleanup) {
	    validateBoolean(opts.cleanup, 'cleanup');
	    autoCleanup = opts.cleanup;
	  }
	  return new Promise((resolve, reject) => {
	    const cleanup = eos(stream, opts, (err) => {
	      if (autoCleanup) {
	        cleanup();
	      }
	      if (err) {
	        reject(err);
	      } else {
	        resolve();
	      }
	    });
	  })
	}
	endOfStream.exports = eos;
	endOfStream.exports.finished = finished;
	return endOfStream.exports;
}

var destroy_1;
var hasRequiredDestroy;

function requireDestroy () {
	if (hasRequiredDestroy) return destroy_1;
	hasRequiredDestroy = 1;

	/* replacement start */

	const process = requireBrowser$1();

	/* replacement end */

	const {
	  aggregateTwoErrors,
	  codes: { ERR_MULTIPLE_CALLBACK },
	  AbortError
	} = requireErrors();
	const { Symbol } = requirePrimordials();
	const { kIsDestroyed, isDestroyed, isFinished, isServerRequest } = requireUtils();
	const kDestroy = Symbol('kDestroy');
	const kConstruct = Symbol('kConstruct');
	function checkError(err, w, r) {
	  if (err) {
	    // Avoid V8 leak, https://github.com/nodejs/node/pull/34103#issuecomment-652002364
	    err.stack; // eslint-disable-line no-unused-expressions

	    if (w && !w.errored) {
	      w.errored = err;
	    }
	    if (r && !r.errored) {
	      r.errored = err;
	    }
	  }
	}

	// Backwards compat. cb() is undocumented and unused in core but
	// unfortunately might be used by modules.
	function destroy(err, cb) {
	  const r = this._readableState;
	  const w = this._writableState;
	  // With duplex streams we use the writable side for state.
	  const s = w || r;
	  if ((w !== null && w !== undefined && w.destroyed) || (r !== null && r !== undefined && r.destroyed)) {
	    if (typeof cb === 'function') {
	      cb();
	    }
	    return this
	  }

	  // We set destroyed to true before firing error callbacks in order
	  // to make it re-entrance safe in case destroy() is called within callbacks
	  checkError(err, w, r);
	  if (w) {
	    w.destroyed = true;
	  }
	  if (r) {
	    r.destroyed = true;
	  }

	  // If still constructing then defer calling _destroy.
	  if (!s.constructed) {
	    this.once(kDestroy, function (er) {
	      _destroy(this, aggregateTwoErrors(er, err), cb);
	    });
	  } else {
	    _destroy(this, err, cb);
	  }
	  return this
	}
	function _destroy(self, err, cb) {
	  let called = false;
	  function onDestroy(err) {
	    if (called) {
	      return
	    }
	    called = true;
	    const r = self._readableState;
	    const w = self._writableState;
	    checkError(err, w, r);
	    if (w) {
	      w.closed = true;
	    }
	    if (r) {
	      r.closed = true;
	    }
	    if (typeof cb === 'function') {
	      cb(err);
	    }
	    if (err) {
	      process.nextTick(emitErrorCloseNT, self, err);
	    } else {
	      process.nextTick(emitCloseNT, self);
	    }
	  }
	  try {
	    self._destroy(err || null, onDestroy);
	  } catch (err) {
	    onDestroy(err);
	  }
	}
	function emitErrorCloseNT(self, err) {
	  emitErrorNT(self, err);
	  emitCloseNT(self);
	}
	function emitCloseNT(self) {
	  const r = self._readableState;
	  const w = self._writableState;
	  if (w) {
	    w.closeEmitted = true;
	  }
	  if (r) {
	    r.closeEmitted = true;
	  }
	  if ((w !== null && w !== undefined && w.emitClose) || (r !== null && r !== undefined && r.emitClose)) {
	    self.emit('close');
	  }
	}
	function emitErrorNT(self, err) {
	  const r = self._readableState;
	  const w = self._writableState;
	  if ((w !== null && w !== undefined && w.errorEmitted) || (r !== null && r !== undefined && r.errorEmitted)) {
	    return
	  }
	  if (w) {
	    w.errorEmitted = true;
	  }
	  if (r) {
	    r.errorEmitted = true;
	  }
	  self.emit('error', err);
	}
	function undestroy() {
	  const r = this._readableState;
	  const w = this._writableState;
	  if (r) {
	    r.constructed = true;
	    r.closed = false;
	    r.closeEmitted = false;
	    r.destroyed = false;
	    r.errored = null;
	    r.errorEmitted = false;
	    r.reading = false;
	    r.ended = r.readable === false;
	    r.endEmitted = r.readable === false;
	  }
	  if (w) {
	    w.constructed = true;
	    w.destroyed = false;
	    w.closed = false;
	    w.closeEmitted = false;
	    w.errored = null;
	    w.errorEmitted = false;
	    w.finalCalled = false;
	    w.prefinished = false;
	    w.ended = w.writable === false;
	    w.ending = w.writable === false;
	    w.finished = w.writable === false;
	  }
	}
	function errorOrDestroy(stream, err, sync) {
	  // We have tests that rely on errors being emitted
	  // in the same tick, so changing this is semver major.
	  // For now when you opt-in to autoDestroy we allow
	  // the error to be emitted nextTick. In a future
	  // semver major update we should change the default to this.

	  const r = stream._readableState;
	  const w = stream._writableState;
	  if ((w !== null && w !== undefined && w.destroyed) || (r !== null && r !== undefined && r.destroyed)) {
	    return this
	  }
	  if ((r !== null && r !== undefined && r.autoDestroy) || (w !== null && w !== undefined && w.autoDestroy))
	    stream.destroy(err);
	  else if (err) {
	    // Avoid V8 leak, https://github.com/nodejs/node/pull/34103#issuecomment-652002364
	    err.stack; // eslint-disable-line no-unused-expressions

	    if (w && !w.errored) {
	      w.errored = err;
	    }
	    if (r && !r.errored) {
	      r.errored = err;
	    }
	    if (sync) {
	      process.nextTick(emitErrorNT, stream, err);
	    } else {
	      emitErrorNT(stream, err);
	    }
	  }
	}
	function construct(stream, cb) {
	  if (typeof stream._construct !== 'function') {
	    return
	  }
	  const r = stream._readableState;
	  const w = stream._writableState;
	  if (r) {
	    r.constructed = false;
	  }
	  if (w) {
	    w.constructed = false;
	  }
	  stream.once(kConstruct, cb);
	  if (stream.listenerCount(kConstruct) > 1) {
	    // Duplex
	    return
	  }
	  process.nextTick(constructNT, stream);
	}
	function constructNT(stream) {
	  let called = false;
	  function onConstruct(err) {
	    if (called) {
	      errorOrDestroy(stream, err !== null && err !== undefined ? err : new ERR_MULTIPLE_CALLBACK());
	      return
	    }
	    called = true;
	    const r = stream._readableState;
	    const w = stream._writableState;
	    const s = w || r;
	    if (r) {
	      r.constructed = true;
	    }
	    if (w) {
	      w.constructed = true;
	    }
	    if (s.destroyed) {
	      stream.emit(kDestroy, err);
	    } else if (err) {
	      errorOrDestroy(stream, err, true);
	    } else {
	      process.nextTick(emitConstructNT, stream);
	    }
	  }
	  try {
	    stream._construct((err) => {
	      process.nextTick(onConstruct, err);
	    });
	  } catch (err) {
	    process.nextTick(onConstruct, err);
	  }
	}
	function emitConstructNT(stream) {
	  stream.emit(kConstruct);
	}
	function isRequest(stream) {
	  return (stream === null || stream === undefined ? undefined : stream.setHeader) && typeof stream.abort === 'function'
	}
	function emitCloseLegacy(stream) {
	  stream.emit('close');
	}
	function emitErrorCloseLegacy(stream, err) {
	  stream.emit('error', err);
	  process.nextTick(emitCloseLegacy, stream);
	}

	// Normalize destroy for legacy.
	function destroyer(stream, err) {
	  if (!stream || isDestroyed(stream)) {
	    return
	  }
	  if (!err && !isFinished(stream)) {
	    err = new AbortError();
	  }

	  // TODO: Remove isRequest branches.
	  if (isServerRequest(stream)) {
	    stream.socket = null;
	    stream.destroy(err);
	  } else if (isRequest(stream)) {
	    stream.abort();
	  } else if (isRequest(stream.req)) {
	    stream.req.abort();
	  } else if (typeof stream.destroy === 'function') {
	    stream.destroy(err);
	  } else if (typeof stream.close === 'function') {
	    // TODO: Don't lose err?
	    stream.close();
	  } else if (err) {
	    process.nextTick(emitErrorCloseLegacy, stream, err);
	  } else {
	    process.nextTick(emitCloseLegacy, stream);
	  }
	  if (!stream.destroyed) {
	    stream[kIsDestroyed] = true;
	  }
	}
	destroy_1 = {
	  construct,
	  destroyer,
	  destroy,
	  undestroy,
	  errorOrDestroy
	};
	return destroy_1;
}

var legacy;
var hasRequiredLegacy;

function requireLegacy () {
	if (hasRequiredLegacy) return legacy;
	hasRequiredLegacy = 1;

	const { ArrayIsArray, ObjectSetPrototypeOf } = requirePrimordials();
	const { EventEmitter: EE } = requireEvents();
	function Stream(opts) {
	  EE.call(this, opts);
	}
	ObjectSetPrototypeOf(Stream.prototype, EE.prototype);
	ObjectSetPrototypeOf(Stream, EE);
	Stream.prototype.pipe = function (dest, options) {
	  const source = this;
	  function ondata(chunk) {
	    if (dest.writable && dest.write(chunk) === false && source.pause) {
	      source.pause();
	    }
	  }
	  source.on('data', ondata);
	  function ondrain() {
	    if (source.readable && source.resume) {
	      source.resume();
	    }
	  }
	  dest.on('drain', ondrain);

	  // If the 'end' option is not supplied, dest.end() will be called when
	  // source gets the 'end' or 'close' events.  Only dest.end() once.
	  if (!dest._isStdio && (!options || options.end !== false)) {
	    source.on('end', onend);
	    source.on('close', onclose);
	  }
	  let didOnEnd = false;
	  function onend() {
	    if (didOnEnd) return
	    didOnEnd = true;
	    dest.end();
	  }
	  function onclose() {
	    if (didOnEnd) return
	    didOnEnd = true;
	    if (typeof dest.destroy === 'function') dest.destroy();
	  }

	  // Don't leave dangling pipes when there are errors.
	  function onerror(er) {
	    cleanup();
	    if (EE.listenerCount(this, 'error') === 0) {
	      this.emit('error', er);
	    }
	  }
	  prependListener(source, 'error', onerror);
	  prependListener(dest, 'error', onerror);

	  // Remove all the event listeners that were added.
	  function cleanup() {
	    source.removeListener('data', ondata);
	    dest.removeListener('drain', ondrain);
	    source.removeListener('end', onend);
	    source.removeListener('close', onclose);
	    source.removeListener('error', onerror);
	    dest.removeListener('error', onerror);
	    source.removeListener('end', cleanup);
	    source.removeListener('close', cleanup);
	    dest.removeListener('close', cleanup);
	  }
	  source.on('end', cleanup);
	  source.on('close', cleanup);
	  dest.on('close', cleanup);
	  dest.emit('pipe', source);

	  // Allow for unix-like usage: A.pipe(B).pipe(C)
	  return dest
	};
	function prependListener(emitter, event, fn) {
	  // Sadly this is not cacheable as some libraries bundle their own
	  // event emitter implementation with them.
	  if (typeof emitter.prependListener === 'function') return emitter.prependListener(event, fn)

	  // This is a hack to make sure that our error handler is attached before any
	  // userland ones.  NEVER DO THIS. This is here only because this code needs
	  // to continue to work with older versions of Node.js that do not include
	  // the prependListener() method. The goal is to eventually remove this hack.
	  if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);
	  else if (ArrayIsArray(emitter._events[event])) emitter._events[event].unshift(fn);
	  else emitter._events[event] = [fn, emitter._events[event]];
	}
	legacy = {
	  Stream,
	  prependListener
	};
	return legacy;
}

var addAbortSignal = {exports: {}};

var hasRequiredAddAbortSignal;

function requireAddAbortSignal () {
	if (hasRequiredAddAbortSignal) return addAbortSignal.exports;
	hasRequiredAddAbortSignal = 1;
	(function (module) {

		const { SymbolDispose } = requirePrimordials();
		const { AbortError, codes } = requireErrors();
		const { isNodeStream, isWebStream, kControllerErrorFunction } = requireUtils();
		const eos = requireEndOfStream();
		const { ERR_INVALID_ARG_TYPE } = codes;
		let addAbortListener;

		// This method is inlined here for readable-stream
		// It also does not allow for signal to not exist on the stream
		// https://github.com/nodejs/node/pull/36061#discussion_r533718029
		const validateAbortSignal = (signal, name) => {
		  if (typeof signal !== 'object' || !('aborted' in signal)) {
		    throw new ERR_INVALID_ARG_TYPE(name, 'AbortSignal', signal)
		  }
		};
		module.exports.addAbortSignal = function addAbortSignal(signal, stream) {
		  validateAbortSignal(signal, 'signal');
		  if (!isNodeStream(stream) && !isWebStream(stream)) {
		    throw new ERR_INVALID_ARG_TYPE('stream', ['ReadableStream', 'WritableStream', 'Stream'], stream)
		  }
		  return module.exports.addAbortSignalNoValidate(signal, stream)
		};
		module.exports.addAbortSignalNoValidate = function (signal, stream) {
		  if (typeof signal !== 'object' || !('aborted' in signal)) {
		    return stream
		  }
		  const onAbort = isNodeStream(stream)
		    ? () => {
		        stream.destroy(
		          new AbortError(undefined, {
		            cause: signal.reason
		          })
		        );
		      }
		    : () => {
		        stream[kControllerErrorFunction](
		          new AbortError(undefined, {
		            cause: signal.reason
		          })
		        );
		      };
		  if (signal.aborted) {
		    onAbort();
		  } else {
		    addAbortListener = addAbortListener || requireUtil().addAbortListener;
		    const disposable = addAbortListener(signal, onAbort);
		    eos(stream, disposable[SymbolDispose]);
		  }
		  return stream
		}; 
	} (addAbortSignal));
	return addAbortSignal.exports;
}

var buffer_list;
var hasRequiredBuffer_list;

function requireBuffer_list () {
	if (hasRequiredBuffer_list) return buffer_list;
	hasRequiredBuffer_list = 1;

	const { StringPrototypeSlice, SymbolIterator, TypedArrayPrototypeSet, Uint8Array } = requirePrimordials();
	const { Buffer } = requireBuffer();
	const { inspect } = requireUtil();
	buffer_list = class BufferList {
	  constructor() {
	    this.head = null;
	    this.tail = null;
	    this.length = 0;
	  }
	  push(v) {
	    const entry = {
	      data: v,
	      next: null
	    };
	    if (this.length > 0) this.tail.next = entry;
	    else this.head = entry;
	    this.tail = entry;
	    ++this.length;
	  }
	  unshift(v) {
	    const entry = {
	      data: v,
	      next: this.head
	    };
	    if (this.length === 0) this.tail = entry;
	    this.head = entry;
	    ++this.length;
	  }
	  shift() {
	    if (this.length === 0) return
	    const ret = this.head.data;
	    if (this.length === 1) this.head = this.tail = null;
	    else this.head = this.head.next;
	    --this.length;
	    return ret
	  }
	  clear() {
	    this.head = this.tail = null;
	    this.length = 0;
	  }
	  join(s) {
	    if (this.length === 0) return ''
	    let p = this.head;
	    let ret = '' + p.data;
	    while ((p = p.next) !== null) ret += s + p.data;
	    return ret
	  }
	  concat(n) {
	    if (this.length === 0) return Buffer.alloc(0)
	    const ret = Buffer.allocUnsafe(n >>> 0);
	    let p = this.head;
	    let i = 0;
	    while (p) {
	      TypedArrayPrototypeSet(ret, p.data, i);
	      i += p.data.length;
	      p = p.next;
	    }
	    return ret
	  }

	  // Consumes a specified amount of bytes or characters from the buffered data.
	  consume(n, hasStrings) {
	    const data = this.head.data;
	    if (n < data.length) {
	      // `slice` is the same for buffers and strings.
	      const slice = data.slice(0, n);
	      this.head.data = data.slice(n);
	      return slice
	    }
	    if (n === data.length) {
	      // First chunk is a perfect match.
	      return this.shift()
	    }
	    // Result spans more than one buffer.
	    return hasStrings ? this._getString(n) : this._getBuffer(n)
	  }
	  first() {
	    return this.head.data
	  }
	  *[SymbolIterator]() {
	    for (let p = this.head; p; p = p.next) {
	      yield p.data;
	    }
	  }

	  // Consumes a specified amount of characters from the buffered data.
	  _getString(n) {
	    let ret = '';
	    let p = this.head;
	    let c = 0;
	    do {
	      const str = p.data;
	      if (n > str.length) {
	        ret += str;
	        n -= str.length;
	      } else {
	        if (n === str.length) {
	          ret += str;
	          ++c;
	          if (p.next) this.head = p.next;
	          else this.head = this.tail = null;
	        } else {
	          ret += StringPrototypeSlice(str, 0, n);
	          this.head = p;
	          p.data = StringPrototypeSlice(str, n);
	        }
	        break
	      }
	      ++c;
	    } while ((p = p.next) !== null)
	    this.length -= c;
	    return ret
	  }

	  // Consumes a specified amount of bytes from the buffered data.
	  _getBuffer(n) {
	    const ret = Buffer.allocUnsafe(n);
	    const retLen = n;
	    let p = this.head;
	    let c = 0;
	    do {
	      const buf = p.data;
	      if (n > buf.length) {
	        TypedArrayPrototypeSet(ret, buf, retLen - n);
	        n -= buf.length;
	      } else {
	        if (n === buf.length) {
	          TypedArrayPrototypeSet(ret, buf, retLen - n);
	          ++c;
	          if (p.next) this.head = p.next;
	          else this.head = this.tail = null;
	        } else {
	          TypedArrayPrototypeSet(ret, new Uint8Array(buf.buffer, buf.byteOffset, n), retLen - n);
	          this.head = p;
	          p.data = buf.slice(n);
	        }
	        break
	      }
	      ++c;
	    } while ((p = p.next) !== null)
	    this.length -= c;
	    return ret
	  }

	  // Make sure the linked list only shows the minimal necessary information.
	  [Symbol.for('nodejs.util.inspect.custom')](_, options) {
	    return inspect(this, {
	      ...options,
	      // Only inspect one level.
	      depth: 0,
	      // It should not recurse.
	      customInspect: false
	    })
	  }
	};
	return buffer_list;
}

var state;
var hasRequiredState;

function requireState () {
	if (hasRequiredState) return state;
	hasRequiredState = 1;

	const { MathFloor, NumberIsInteger } = requirePrimordials();
	const { validateInteger } = requireValidators();
	const { ERR_INVALID_ARG_VALUE } = requireErrors().codes;
	let defaultHighWaterMarkBytes = 16 * 1024;
	let defaultHighWaterMarkObjectMode = 16;
	function highWaterMarkFrom(options, isDuplex, duplexKey) {
	  return options.highWaterMark != null ? options.highWaterMark : isDuplex ? options[duplexKey] : null
	}
	function getDefaultHighWaterMark(objectMode) {
	  return objectMode ? defaultHighWaterMarkObjectMode : defaultHighWaterMarkBytes
	}
	function setDefaultHighWaterMark(objectMode, value) {
	  validateInteger(value, 'value', 0);
	  if (objectMode) {
	    defaultHighWaterMarkObjectMode = value;
	  } else {
	    defaultHighWaterMarkBytes = value;
	  }
	}
	function getHighWaterMark(state, options, duplexKey, isDuplex) {
	  const hwm = highWaterMarkFrom(options, isDuplex, duplexKey);
	  if (hwm != null) {
	    if (!NumberIsInteger(hwm) || hwm < 0) {
	      const name = isDuplex ? `options.${duplexKey}` : 'options.highWaterMark';
	      throw new ERR_INVALID_ARG_VALUE(name, hwm)
	    }
	    return MathFloor(hwm)
	  }

	  // Default value
	  return getDefaultHighWaterMark(state.objectMode)
	}
	state = {
	  getHighWaterMark,
	  getDefaultHighWaterMark,
	  setDefaultHighWaterMark
	};
	return state;
}

var string_decoder = {};

var safeBuffer = {exports: {}};

/*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */

var hasRequiredSafeBuffer;

function requireSafeBuffer () {
	if (hasRequiredSafeBuffer) return safeBuffer.exports;
	hasRequiredSafeBuffer = 1;
	(function (module, exports$1) {
		/* eslint-disable node/no-deprecated-api */
		var buffer = requireBuffer();
		var Buffer = buffer.Buffer;

		// alternative to using Object.keys for old browsers
		function copyProps (src, dst) {
		  for (var key in src) {
		    dst[key] = src[key];
		  }
		}
		if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
		  module.exports = buffer;
		} else {
		  // Copy properties from require('buffer')
		  copyProps(buffer, exports$1);
		  exports$1.Buffer = SafeBuffer;
		}

		function SafeBuffer (arg, encodingOrOffset, length) {
		  return Buffer(arg, encodingOrOffset, length)
		}

		SafeBuffer.prototype = Object.create(Buffer.prototype);

		// Copy static methods from Buffer
		copyProps(Buffer, SafeBuffer);

		SafeBuffer.from = function (arg, encodingOrOffset, length) {
		  if (typeof arg === 'number') {
		    throw new TypeError('Argument must not be a number')
		  }
		  return Buffer(arg, encodingOrOffset, length)
		};

		SafeBuffer.alloc = function (size, fill, encoding) {
		  if (typeof size !== 'number') {
		    throw new TypeError('Argument must be a number')
		  }
		  var buf = Buffer(size);
		  if (fill !== undefined) {
		    if (typeof encoding === 'string') {
		      buf.fill(fill, encoding);
		    } else {
		      buf.fill(fill);
		    }
		  } else {
		    buf.fill(0);
		  }
		  return buf
		};

		SafeBuffer.allocUnsafe = function (size) {
		  if (typeof size !== 'number') {
		    throw new TypeError('Argument must be a number')
		  }
		  return Buffer(size)
		};

		SafeBuffer.allocUnsafeSlow = function (size) {
		  if (typeof size !== 'number') {
		    throw new TypeError('Argument must be a number')
		  }
		  return buffer.SlowBuffer(size)
		}; 
	} (safeBuffer, safeBuffer.exports));
	return safeBuffer.exports;
}

var hasRequiredString_decoder;

function requireString_decoder () {
	if (hasRequiredString_decoder) return string_decoder;
	hasRequiredString_decoder = 1;

	/*<replacement>*/

	var Buffer = requireSafeBuffer().Buffer;
	/*</replacement>*/

	var isEncoding = Buffer.isEncoding || function (encoding) {
	  encoding = '' + encoding;
	  switch (encoding && encoding.toLowerCase()) {
	    case 'hex':case 'utf8':case 'utf-8':case 'ascii':case 'binary':case 'base64':case 'ucs2':case 'ucs-2':case 'utf16le':case 'utf-16le':case 'raw':
	      return true;
	    default:
	      return false;
	  }
	};

	function _normalizeEncoding(enc) {
	  if (!enc) return 'utf8';
	  var retried;
	  while (true) {
	    switch (enc) {
	      case 'utf8':
	      case 'utf-8':
	        return 'utf8';
	      case 'ucs2':
	      case 'ucs-2':
	      case 'utf16le':
	      case 'utf-16le':
	        return 'utf16le';
	      case 'latin1':
	      case 'binary':
	        return 'latin1';
	      case 'base64':
	      case 'ascii':
	      case 'hex':
	        return enc;
	      default:
	        if (retried) return; // undefined
	        enc = ('' + enc).toLowerCase();
	        retried = true;
	    }
	  }
	}
	// Do not cache `Buffer.isEncoding` when checking encoding names as some
	// modules monkey-patch it to support additional encodings
	function normalizeEncoding(enc) {
	  var nenc = _normalizeEncoding(enc);
	  if (typeof nenc !== 'string' && (Buffer.isEncoding === isEncoding || !isEncoding(enc))) throw new Error('Unknown encoding: ' + enc);
	  return nenc || enc;
	}

	// StringDecoder provides an interface for efficiently splitting a series of
	// buffers into a series of JS strings without breaking apart multi-byte
	// characters.
	string_decoder.StringDecoder = StringDecoder;
	function StringDecoder(encoding) {
	  this.encoding = normalizeEncoding(encoding);
	  var nb;
	  switch (this.encoding) {
	    case 'utf16le':
	      this.text = utf16Text;
	      this.end = utf16End;
	      nb = 4;
	      break;
	    case 'utf8':
	      this.fillLast = utf8FillLast;
	      nb = 4;
	      break;
	    case 'base64':
	      this.text = base64Text;
	      this.end = base64End;
	      nb = 3;
	      break;
	    default:
	      this.write = simpleWrite;
	      this.end = simpleEnd;
	      return;
	  }
	  this.lastNeed = 0;
	  this.lastTotal = 0;
	  this.lastChar = Buffer.allocUnsafe(nb);
	}

	StringDecoder.prototype.write = function (buf) {
	  if (buf.length === 0) return '';
	  var r;
	  var i;
	  if (this.lastNeed) {
	    r = this.fillLast(buf);
	    if (r === undefined) return '';
	    i = this.lastNeed;
	    this.lastNeed = 0;
	  } else {
	    i = 0;
	  }
	  if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
	  return r || '';
	};

	StringDecoder.prototype.end = utf8End;

	// Returns only complete characters in a Buffer
	StringDecoder.prototype.text = utf8Text;

	// Attempts to complete a partial non-UTF-8 character using bytes from a Buffer
	StringDecoder.prototype.fillLast = function (buf) {
	  if (this.lastNeed <= buf.length) {
	    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
	    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
	  }
	  buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
	  this.lastNeed -= buf.length;
	};

	// Checks the type of a UTF-8 byte, whether it's ASCII, a leading byte, or a
	// continuation byte. If an invalid byte is detected, -2 is returned.
	function utf8CheckByte(byte) {
	  if (byte <= 0x7F) return 0;else if (byte >> 5 === 0x06) return 2;else if (byte >> 4 === 0x0E) return 3;else if (byte >> 3 === 0x1E) return 4;
	  return byte >> 6 === 0x02 ? -1 : -2;
	}

	// Checks at most 3 bytes at the end of a Buffer in order to detect an
	// incomplete multi-byte UTF-8 character. The total number of bytes (2, 3, or 4)
	// needed to complete the UTF-8 character (if applicable) are returned.
	function utf8CheckIncomplete(self, buf, i) {
	  var j = buf.length - 1;
	  if (j < i) return 0;
	  var nb = utf8CheckByte(buf[j]);
	  if (nb >= 0) {
	    if (nb > 0) self.lastNeed = nb - 1;
	    return nb;
	  }
	  if (--j < i || nb === -2) return 0;
	  nb = utf8CheckByte(buf[j]);
	  if (nb >= 0) {
	    if (nb > 0) self.lastNeed = nb - 2;
	    return nb;
	  }
	  if (--j < i || nb === -2) return 0;
	  nb = utf8CheckByte(buf[j]);
	  if (nb >= 0) {
	    if (nb > 0) {
	      if (nb === 2) nb = 0;else self.lastNeed = nb - 3;
	    }
	    return nb;
	  }
	  return 0;
	}

	// Validates as many continuation bytes for a multi-byte UTF-8 character as
	// needed or are available. If we see a non-continuation byte where we expect
	// one, we "replace" the validated continuation bytes we've seen so far with
	// a single UTF-8 replacement character ('\ufffd'), to match v8's UTF-8 decoding
	// behavior. The continuation byte check is included three times in the case
	// where all of the continuation bytes for a character exist in the same buffer.
	// It is also done this way as a slight performance increase instead of using a
	// loop.
	function utf8CheckExtraBytes(self, buf, p) {
	  if ((buf[0] & 0xC0) !== 0x80) {
	    self.lastNeed = 0;
	    return '\ufffd';
	  }
	  if (self.lastNeed > 1 && buf.length > 1) {
	    if ((buf[1] & 0xC0) !== 0x80) {
	      self.lastNeed = 1;
	      return '\ufffd';
	    }
	    if (self.lastNeed > 2 && buf.length > 2) {
	      if ((buf[2] & 0xC0) !== 0x80) {
	        self.lastNeed = 2;
	        return '\ufffd';
	      }
	    }
	  }
	}

	// Attempts to complete a multi-byte UTF-8 character using bytes from a Buffer.
	function utf8FillLast(buf) {
	  var p = this.lastTotal - this.lastNeed;
	  var r = utf8CheckExtraBytes(this, buf);
	  if (r !== undefined) return r;
	  if (this.lastNeed <= buf.length) {
	    buf.copy(this.lastChar, p, 0, this.lastNeed);
	    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
	  }
	  buf.copy(this.lastChar, p, 0, buf.length);
	  this.lastNeed -= buf.length;
	}

	// Returns all complete UTF-8 characters in a Buffer. If the Buffer ended on a
	// partial character, the character's bytes are buffered until the required
	// number of bytes are available.
	function utf8Text(buf, i) {
	  var total = utf8CheckIncomplete(this, buf, i);
	  if (!this.lastNeed) return buf.toString('utf8', i);
	  this.lastTotal = total;
	  var end = buf.length - (total - this.lastNeed);
	  buf.copy(this.lastChar, 0, end);
	  return buf.toString('utf8', i, end);
	}

	// For UTF-8, a replacement character is added when ending on a partial
	// character.
	function utf8End(buf) {
	  var r = buf && buf.length ? this.write(buf) : '';
	  if (this.lastNeed) return r + '\ufffd';
	  return r;
	}

	// UTF-16LE typically needs two bytes per character, but even if we have an even
	// number of bytes available, we need to check if we end on a leading/high
	// surrogate. In that case, we need to wait for the next two bytes in order to
	// decode the last character properly.
	function utf16Text(buf, i) {
	  if ((buf.length - i) % 2 === 0) {
	    var r = buf.toString('utf16le', i);
	    if (r) {
	      var c = r.charCodeAt(r.length - 1);
	      if (c >= 0xD800 && c <= 0xDBFF) {
	        this.lastNeed = 2;
	        this.lastTotal = 4;
	        this.lastChar[0] = buf[buf.length - 2];
	        this.lastChar[1] = buf[buf.length - 1];
	        return r.slice(0, -1);
	      }
	    }
	    return r;
	  }
	  this.lastNeed = 1;
	  this.lastTotal = 2;
	  this.lastChar[0] = buf[buf.length - 1];
	  return buf.toString('utf16le', i, buf.length - 1);
	}

	// For UTF-16LE we do not explicitly append special replacement characters if we
	// end on a partial character, we simply let v8 handle that.
	function utf16End(buf) {
	  var r = buf && buf.length ? this.write(buf) : '';
	  if (this.lastNeed) {
	    var end = this.lastTotal - this.lastNeed;
	    return r + this.lastChar.toString('utf16le', 0, end);
	  }
	  return r;
	}

	function base64Text(buf, i) {
	  var n = (buf.length - i) % 3;
	  if (n === 0) return buf.toString('base64', i);
	  this.lastNeed = 3 - n;
	  this.lastTotal = 3;
	  if (n === 1) {
	    this.lastChar[0] = buf[buf.length - 1];
	  } else {
	    this.lastChar[0] = buf[buf.length - 2];
	    this.lastChar[1] = buf[buf.length - 1];
	  }
	  return buf.toString('base64', i, buf.length - n);
	}

	function base64End(buf) {
	  var r = buf && buf.length ? this.write(buf) : '';
	  if (this.lastNeed) return r + this.lastChar.toString('base64', 0, 3 - this.lastNeed);
	  return r;
	}

	// Pass bytes on through for single-byte encodings (e.g. ascii, latin1, hex)
	function simpleWrite(buf) {
	  return buf.toString(this.encoding);
	}

	function simpleEnd(buf) {
	  return buf && buf.length ? this.write(buf) : '';
	}
	return string_decoder;
}

var from_1;
var hasRequiredFrom;

function requireFrom () {
	if (hasRequiredFrom) return from_1;
	hasRequiredFrom = 1;

	/* replacement start */

	const process = requireBrowser$1();

	/* replacement end */

	const { PromisePrototypeThen, SymbolAsyncIterator, SymbolIterator } = requirePrimordials();
	const { Buffer } = requireBuffer();
	const { ERR_INVALID_ARG_TYPE, ERR_STREAM_NULL_VALUES } = requireErrors().codes;
	function from(Readable, iterable, opts) {
	  let iterator;
	  if (typeof iterable === 'string' || iterable instanceof Buffer) {
	    return new Readable({
	      objectMode: true,
	      ...opts,
	      read() {
	        this.push(iterable);
	        this.push(null);
	      }
	    })
	  }
	  let isAsync;
	  if (iterable && iterable[SymbolAsyncIterator]) {
	    isAsync = true;
	    iterator = iterable[SymbolAsyncIterator]();
	  } else if (iterable && iterable[SymbolIterator]) {
	    isAsync = false;
	    iterator = iterable[SymbolIterator]();
	  } else {
	    throw new ERR_INVALID_ARG_TYPE('iterable', ['Iterable'], iterable)
	  }
	  const readable = new Readable({
	    objectMode: true,
	    highWaterMark: 1,
	    // TODO(ronag): What options should be allowed?
	    ...opts
	  });

	  // Flag to protect against _read
	  // being called before last iteration completion.
	  let reading = false;
	  readable._read = function () {
	    if (!reading) {
	      reading = true;
	      next();
	    }
	  };
	  readable._destroy = function (error, cb) {
	    PromisePrototypeThen(
	      close(error),
	      () => process.nextTick(cb, error),
	      // nextTick is here in case cb throws
	      (e) => process.nextTick(cb, e || error)
	    );
	  };
	  async function close(error) {
	    const hadError = error !== undefined && error !== null;
	    const hasThrow = typeof iterator.throw === 'function';
	    if (hadError && hasThrow) {
	      const { value, done } = await iterator.throw(error);
	      await value;
	      if (done) {
	        return
	      }
	    }
	    if (typeof iterator.return === 'function') {
	      const { value } = await iterator.return();
	      await value;
	    }
	  }
	  async function next() {
	    for (;;) {
	      try {
	        const { value, done } = isAsync ? await iterator.next() : iterator.next();
	        if (done) {
	          readable.push(null);
	        } else {
	          const res = value && typeof value.then === 'function' ? await value : value;
	          if (res === null) {
	            reading = false;
	            throw new ERR_STREAM_NULL_VALUES()
	          } else if (readable.push(res)) {
	            continue
	          } else {
	            reading = false;
	          }
	        }
	      } catch (err) {
	        readable.destroy(err);
	      }
	      break
	    }
	  }
	  return readable
	}
	from_1 = from;
	return from_1;
}

var readable;
var hasRequiredReadable;

function requireReadable () {
	if (hasRequiredReadable) return readable;
	hasRequiredReadable = 1;

	/* replacement start */

	const process = requireBrowser$1();

	/* replacement end */

	const {
	  ArrayPrototypeIndexOf,
	  NumberIsInteger,
	  NumberIsNaN,
	  NumberParseInt,
	  ObjectDefineProperties,
	  ObjectKeys,
	  ObjectSetPrototypeOf,
	  Promise,
	  SafeSet,
	  SymbolAsyncDispose,
	  SymbolAsyncIterator,
	  Symbol
	} = requirePrimordials();
	readable = Readable;
	Readable.ReadableState = ReadableState;
	const { EventEmitter: EE } = requireEvents();
	const { Stream, prependListener } = requireLegacy();
	const { Buffer } = requireBuffer();
	const { addAbortSignal } = requireAddAbortSignal();
	const eos = requireEndOfStream();
	let debug = requireUtil().debuglog('stream', (fn) => {
	  debug = fn;
	});
	const BufferList = requireBuffer_list();
	const destroyImpl = requireDestroy();
	const { getHighWaterMark, getDefaultHighWaterMark } = requireState();
	const {
	  aggregateTwoErrors,
	  codes: {
	    ERR_INVALID_ARG_TYPE,
	    ERR_METHOD_NOT_IMPLEMENTED,
	    ERR_OUT_OF_RANGE,
	    ERR_STREAM_PUSH_AFTER_EOF,
	    ERR_STREAM_UNSHIFT_AFTER_END_EVENT
	  },
	  AbortError
	} = requireErrors();
	const { validateObject } = requireValidators();
	const kPaused = Symbol('kPaused');
	const { StringDecoder } = requireString_decoder();
	const from = requireFrom();
	ObjectSetPrototypeOf(Readable.prototype, Stream.prototype);
	ObjectSetPrototypeOf(Readable, Stream);
	const nop = () => {};
	const { errorOrDestroy } = destroyImpl;
	const kObjectMode = 1 << 0;
	const kEnded = 1 << 1;
	const kEndEmitted = 1 << 2;
	const kReading = 1 << 3;
	const kConstructed = 1 << 4;
	const kSync = 1 << 5;
	const kNeedReadable = 1 << 6;
	const kEmittedReadable = 1 << 7;
	const kReadableListening = 1 << 8;
	const kResumeScheduled = 1 << 9;
	const kErrorEmitted = 1 << 10;
	const kEmitClose = 1 << 11;
	const kAutoDestroy = 1 << 12;
	const kDestroyed = 1 << 13;
	const kClosed = 1 << 14;
	const kCloseEmitted = 1 << 15;
	const kMultiAwaitDrain = 1 << 16;
	const kReadingMore = 1 << 17;
	const kDataEmitted = 1 << 18;

	// TODO(benjamingr) it is likely slower to do it this way than with free functions
	function makeBitMapDescriptor(bit) {
	  return {
	    enumerable: false,
	    get() {
	      return (this.state & bit) !== 0
	    },
	    set(value) {
	      if (value) this.state |= bit;
	      else this.state &= ~bit;
	    }
	  }
	}
	ObjectDefineProperties(ReadableState.prototype, {
	  objectMode: makeBitMapDescriptor(kObjectMode),
	  ended: makeBitMapDescriptor(kEnded),
	  endEmitted: makeBitMapDescriptor(kEndEmitted),
	  reading: makeBitMapDescriptor(kReading),
	  // Stream is still being constructed and cannot be
	  // destroyed until construction finished or failed.
	  // Async construction is opt in, therefore we start as
	  // constructed.
	  constructed: makeBitMapDescriptor(kConstructed),
	  // A flag to be able to tell if the event 'readable'/'data' is emitted
	  // immediately, or on a later tick.  We set this to true at first, because
	  // any actions that shouldn't happen until "later" should generally also
	  // not happen before the first read call.
	  sync: makeBitMapDescriptor(kSync),
	  // Whenever we return null, then we set a flag to say
	  // that we're awaiting a 'readable' event emission.
	  needReadable: makeBitMapDescriptor(kNeedReadable),
	  emittedReadable: makeBitMapDescriptor(kEmittedReadable),
	  readableListening: makeBitMapDescriptor(kReadableListening),
	  resumeScheduled: makeBitMapDescriptor(kResumeScheduled),
	  // True if the error was already emitted and should not be thrown again.
	  errorEmitted: makeBitMapDescriptor(kErrorEmitted),
	  emitClose: makeBitMapDescriptor(kEmitClose),
	  autoDestroy: makeBitMapDescriptor(kAutoDestroy),
	  // Has it been destroyed.
	  destroyed: makeBitMapDescriptor(kDestroyed),
	  // Indicates whether the stream has finished destroying.
	  closed: makeBitMapDescriptor(kClosed),
	  // True if close has been emitted or would have been emitted
	  // depending on emitClose.
	  closeEmitted: makeBitMapDescriptor(kCloseEmitted),
	  multiAwaitDrain: makeBitMapDescriptor(kMultiAwaitDrain),
	  // If true, a maybeReadMore has been scheduled.
	  readingMore: makeBitMapDescriptor(kReadingMore),
	  dataEmitted: makeBitMapDescriptor(kDataEmitted)
	});
	function ReadableState(options, stream, isDuplex) {
	  // Duplex streams are both readable and writable, but share
	  // the same options object.
	  // However, some cases require setting options to different
	  // values for the readable and the writable sides of the duplex stream.
	  // These options can be provided separately as readableXXX and writableXXX.
	  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof requireDuplex();

	  // Bit map field to store ReadableState more effciently with 1 bit per field
	  // instead of a V8 slot per field.
	  this.state = kEmitClose | kAutoDestroy | kConstructed | kSync;
	  // Object stream flag. Used to make read(n) ignore n and to
	  // make all the buffer merging and length checks go away.
	  if (options && options.objectMode) this.state |= kObjectMode;
	  if (isDuplex && options && options.readableObjectMode) this.state |= kObjectMode;

	  // The point at which it stops calling _read() to fill the buffer
	  // Note: 0 is a valid value, means "don't call _read preemptively ever"
	  this.highWaterMark = options
	    ? getHighWaterMark(this, options, 'readableHighWaterMark', isDuplex)
	    : getDefaultHighWaterMark(false);

	  // A linked list is used to store data chunks instead of an array because the
	  // linked list can remove elements from the beginning faster than
	  // array.shift().
	  this.buffer = new BufferList();
	  this.length = 0;
	  this.pipes = [];
	  this.flowing = null;
	  this[kPaused] = null;

	  // Should close be emitted on destroy. Defaults to true.
	  if (options && options.emitClose === false) this.state &= ~kEmitClose;

	  // Should .destroy() be called after 'end' (and potentially 'finish').
	  if (options && options.autoDestroy === false) this.state &= ~kAutoDestroy;

	  // Indicates whether the stream has errored. When true no further
	  // _read calls, 'data' or 'readable' events should occur. This is needed
	  // since when autoDestroy is disabled we need a way to tell whether the
	  // stream has failed.
	  this.errored = null;

	  // Crypto is kind of old and crusty.  Historically, its default string
	  // encoding is 'binary' so we have to make this configurable.
	  // Everything else in the universe uses 'utf8', though.
	  this.defaultEncoding = (options && options.defaultEncoding) || 'utf8';

	  // Ref the piped dest which we need a drain event on it
	  // type: null | Writable | Set<Writable>.
	  this.awaitDrainWriters = null;
	  this.decoder = null;
	  this.encoding = null;
	  if (options && options.encoding) {
	    this.decoder = new StringDecoder(options.encoding);
	    this.encoding = options.encoding;
	  }
	}
	function Readable(options) {
	  if (!(this instanceof Readable)) return new Readable(options)

	  // Checking for a Stream.Duplex instance is faster here instead of inside
	  // the ReadableState constructor, at least with V8 6.5.
	  const isDuplex = this instanceof requireDuplex();
	  this._readableState = new ReadableState(options, this, isDuplex);
	  if (options) {
	    if (typeof options.read === 'function') this._read = options.read;
	    if (typeof options.destroy === 'function') this._destroy = options.destroy;
	    if (typeof options.construct === 'function') this._construct = options.construct;
	    if (options.signal && !isDuplex) addAbortSignal(options.signal, this);
	  }
	  Stream.call(this, options);
	  destroyImpl.construct(this, () => {
	    if (this._readableState.needReadable) {
	      maybeReadMore(this, this._readableState);
	    }
	  });
	}
	Readable.prototype.destroy = destroyImpl.destroy;
	Readable.prototype._undestroy = destroyImpl.undestroy;
	Readable.prototype._destroy = function (err, cb) {
	  cb(err);
	};
	Readable.prototype[EE.captureRejectionSymbol] = function (err) {
	  this.destroy(err);
	};
	Readable.prototype[SymbolAsyncDispose] = function () {
	  let error;
	  if (!this.destroyed) {
	    error = this.readableEnded ? null : new AbortError();
	    this.destroy(error);
	  }
	  return new Promise((resolve, reject) => eos(this, (err) => (err && err !== error ? reject(err) : resolve(null))))
	};

	// Manually shove something into the read() buffer.
	// This returns true if the highWaterMark has not been hit yet,
	// similar to how Writable.write() returns true if you should
	// write() some more.
	Readable.prototype.push = function (chunk, encoding) {
	  return readableAddChunk(this, chunk, encoding, false)
	};

	// Unshift should *always* be something directly out of read().
	Readable.prototype.unshift = function (chunk, encoding) {
	  return readableAddChunk(this, chunk, encoding, true)
	};
	function readableAddChunk(stream, chunk, encoding, addToFront) {
	  debug('readableAddChunk', chunk);
	  const state = stream._readableState;
	  let err;
	  if ((state.state & kObjectMode) === 0) {
	    if (typeof chunk === 'string') {
	      encoding = encoding || state.defaultEncoding;
	      if (state.encoding !== encoding) {
	        if (addToFront && state.encoding) {
	          // When unshifting, if state.encoding is set, we have to save
	          // the string in the BufferList with the state encoding.
	          chunk = Buffer.from(chunk, encoding).toString(state.encoding);
	        } else {
	          chunk = Buffer.from(chunk, encoding);
	          encoding = '';
	        }
	      }
	    } else if (chunk instanceof Buffer) {
	      encoding = '';
	    } else if (Stream._isUint8Array(chunk)) {
	      chunk = Stream._uint8ArrayToBuffer(chunk);
	      encoding = '';
	    } else if (chunk != null) {
	      err = new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer', 'Uint8Array'], chunk);
	    }
	  }
	  if (err) {
	    errorOrDestroy(stream, err);
	  } else if (chunk === null) {
	    state.state &= ~kReading;
	    onEofChunk(stream, state);
	  } else if ((state.state & kObjectMode) !== 0 || (chunk && chunk.length > 0)) {
	    if (addToFront) {
	      if ((state.state & kEndEmitted) !== 0) errorOrDestroy(stream, new ERR_STREAM_UNSHIFT_AFTER_END_EVENT());
	      else if (state.destroyed || state.errored) return false
	      else addChunk(stream, state, chunk, true);
	    } else if (state.ended) {
	      errorOrDestroy(stream, new ERR_STREAM_PUSH_AFTER_EOF());
	    } else if (state.destroyed || state.errored) {
	      return false
	    } else {
	      state.state &= ~kReading;
	      if (state.decoder && !encoding) {
	        chunk = state.decoder.write(chunk);
	        if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);
	        else maybeReadMore(stream, state);
	      } else {
	        addChunk(stream, state, chunk, false);
	      }
	    }
	  } else if (!addToFront) {
	    state.state &= ~kReading;
	    maybeReadMore(stream, state);
	  }

	  // We can push more data if we are below the highWaterMark.
	  // Also, if we have no data yet, we can stand some more bytes.
	  // This is to work around cases where hwm=0, such as the repl.
	  return !state.ended && (state.length < state.highWaterMark || state.length === 0)
	}
	function addChunk(stream, state, chunk, addToFront) {
	  if (state.flowing && state.length === 0 && !state.sync && stream.listenerCount('data') > 0) {
	    // Use the guard to avoid creating `Set()` repeatedly
	    // when we have multiple pipes.
	    if ((state.state & kMultiAwaitDrain) !== 0) {
	      state.awaitDrainWriters.clear();
	    } else {
	      state.awaitDrainWriters = null;
	    }
	    state.dataEmitted = true;
	    stream.emit('data', chunk);
	  } else {
	    // Update the buffer info.
	    state.length += state.objectMode ? 1 : chunk.length;
	    if (addToFront) state.buffer.unshift(chunk);
	    else state.buffer.push(chunk);
	    if ((state.state & kNeedReadable) !== 0) emitReadable(stream);
	  }
	  maybeReadMore(stream, state);
	}
	Readable.prototype.isPaused = function () {
	  const state = this._readableState;
	  return state[kPaused] === true || state.flowing === false
	};

	// Backwards compatibility.
	Readable.prototype.setEncoding = function (enc) {
	  const decoder = new StringDecoder(enc);
	  this._readableState.decoder = decoder;
	  // If setEncoding(null), decoder.encoding equals utf8.
	  this._readableState.encoding = this._readableState.decoder.encoding;
	  const buffer = this._readableState.buffer;
	  // Iterate over current buffer to convert already stored Buffers:
	  let content = '';
	  for (const data of buffer) {
	    content += decoder.write(data);
	  }
	  buffer.clear();
	  if (content !== '') buffer.push(content);
	  this._readableState.length = content.length;
	  return this
	};

	// Don't raise the hwm > 1GB.
	const MAX_HWM = 0x40000000;
	function computeNewHighWaterMark(n) {
	  if (n > MAX_HWM) {
	    throw new ERR_OUT_OF_RANGE('size', '<= 1GiB', n)
	  } else {
	    // Get the next highest power of 2 to prevent increasing hwm excessively in
	    // tiny amounts.
	    n--;
	    n |= n >>> 1;
	    n |= n >>> 2;
	    n |= n >>> 4;
	    n |= n >>> 8;
	    n |= n >>> 16;
	    n++;
	  }
	  return n
	}

	// This function is designed to be inlinable, so please take care when making
	// changes to the function body.
	function howMuchToRead(n, state) {
	  if (n <= 0 || (state.length === 0 && state.ended)) return 0
	  if ((state.state & kObjectMode) !== 0) return 1
	  if (NumberIsNaN(n)) {
	    // Only flow one buffer at a time.
	    if (state.flowing && state.length) return state.buffer.first().length
	    return state.length
	  }
	  if (n <= state.length) return n
	  return state.ended ? state.length : 0
	}

	// You can override either this method, or the async _read(n) below.
	Readable.prototype.read = function (n) {
	  debug('read', n);
	  // Same as parseInt(undefined, 10), however V8 7.3 performance regressed
	  // in this scenario, so we are doing it manually.
	  if (n === undefined) {
	    n = NaN;
	  } else if (!NumberIsInteger(n)) {
	    n = NumberParseInt(n, 10);
	  }
	  const state = this._readableState;
	  const nOrig = n;

	  // If we're asking for more than the current hwm, then raise the hwm.
	  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
	  if (n !== 0) state.state &= ~kEmittedReadable;

	  // If we're doing read(0) to trigger a readable event, but we
	  // already have a bunch of data in the buffer, then just trigger
	  // the 'readable' event and move on.
	  if (
	    n === 0 &&
	    state.needReadable &&
	    ((state.highWaterMark !== 0 ? state.length >= state.highWaterMark : state.length > 0) || state.ended)
	  ) {
	    debug('read: emitReadable', state.length, state.ended);
	    if (state.length === 0 && state.ended) endReadable(this);
	    else emitReadable(this);
	    return null
	  }
	  n = howMuchToRead(n, state);

	  // If we've ended, and we're now clear, then finish it up.
	  if (n === 0 && state.ended) {
	    if (state.length === 0) endReadable(this);
	    return null
	  }

	  // All the actual chunk generation logic needs to be
	  // *below* the call to _read.  The reason is that in certain
	  // synthetic stream cases, such as passthrough streams, _read
	  // may be a completely synchronous operation which may change
	  // the state of the read buffer, providing enough data when
	  // before there was *not* enough.
	  //
	  // So, the steps are:
	  // 1. Figure out what the state of things will be after we do
	  // a read from the buffer.
	  //
	  // 2. If that resulting state will trigger a _read, then call _read.
	  // Note that this may be asynchronous, or synchronous.  Yes, it is
	  // deeply ugly to write APIs this way, but that still doesn't mean
	  // that the Readable class should behave improperly, as streams are
	  // designed to be sync/async agnostic.
	  // Take note if the _read call is sync or async (ie, if the read call
	  // has returned yet), so that we know whether or not it's safe to emit
	  // 'readable' etc.
	  //
	  // 3. Actually pull the requested chunks out of the buffer and return.

	  // if we need a readable event, then we need to do some reading.
	  let doRead = (state.state & kNeedReadable) !== 0;
	  debug('need readable', doRead);

	  // If we currently have less than the highWaterMark, then also read some.
	  if (state.length === 0 || state.length - n < state.highWaterMark) {
	    doRead = true;
	    debug('length less than watermark', doRead);
	  }

	  // However, if we've ended, then there's no point, if we're already
	  // reading, then it's unnecessary, if we're constructing we have to wait,
	  // and if we're destroyed or errored, then it's not allowed,
	  if (state.ended || state.reading || state.destroyed || state.errored || !state.constructed) {
	    doRead = false;
	    debug('reading, ended or constructing', doRead);
	  } else if (doRead) {
	    debug('do read');
	    state.state |= kReading | kSync;
	    // If the length is currently zero, then we *need* a readable event.
	    if (state.length === 0) state.state |= kNeedReadable;

	    // Call internal read method
	    try {
	      this._read(state.highWaterMark);
	    } catch (err) {
	      errorOrDestroy(this, err);
	    }
	    state.state &= ~kSync;

	    // If _read pushed data synchronously, then `reading` will be false,
	    // and we need to re-evaluate how much data we can return to the user.
	    if (!state.reading) n = howMuchToRead(nOrig, state);
	  }
	  let ret;
	  if (n > 0) ret = fromList(n, state);
	  else ret = null;
	  if (ret === null) {
	    state.needReadable = state.length <= state.highWaterMark;
	    n = 0;
	  } else {
	    state.length -= n;
	    if (state.multiAwaitDrain) {
	      state.awaitDrainWriters.clear();
	    } else {
	      state.awaitDrainWriters = null;
	    }
	  }
	  if (state.length === 0) {
	    // If we have nothing in the buffer, then we want to know
	    // as soon as we *do* get something into the buffer.
	    if (!state.ended) state.needReadable = true;

	    // If we tried to read() past the EOF, then emit end on the next tick.
	    if (nOrig !== n && state.ended) endReadable(this);
	  }
	  if (ret !== null && !state.errorEmitted && !state.closeEmitted) {
	    state.dataEmitted = true;
	    this.emit('data', ret);
	  }
	  return ret
	};
	function onEofChunk(stream, state) {
	  debug('onEofChunk');
	  if (state.ended) return
	  if (state.decoder) {
	    const chunk = state.decoder.end();
	    if (chunk && chunk.length) {
	      state.buffer.push(chunk);
	      state.length += state.objectMode ? 1 : chunk.length;
	    }
	  }
	  state.ended = true;
	  if (state.sync) {
	    // If we are sync, wait until next tick to emit the data.
	    // Otherwise we risk emitting data in the flow()
	    // the readable code triggers during a read() call.
	    emitReadable(stream);
	  } else {
	    // Emit 'readable' now to make sure it gets picked up.
	    state.needReadable = false;
	    state.emittedReadable = true;
	    // We have to emit readable now that we are EOF. Modules
	    // in the ecosystem (e.g. dicer) rely on this event being sync.
	    emitReadable_(stream);
	  }
	}

	// Don't emit readable right away in sync mode, because this can trigger
	// another read() call => stack overflow.  This way, it might trigger
	// a nextTick recursion warning, but that's not so bad.
	function emitReadable(stream) {
	  const state = stream._readableState;
	  debug('emitReadable', state.needReadable, state.emittedReadable);
	  state.needReadable = false;
	  if (!state.emittedReadable) {
	    debug('emitReadable', state.flowing);
	    state.emittedReadable = true;
	    process.nextTick(emitReadable_, stream);
	  }
	}
	function emitReadable_(stream) {
	  const state = stream._readableState;
	  debug('emitReadable_', state.destroyed, state.length, state.ended);
	  if (!state.destroyed && !state.errored && (state.length || state.ended)) {
	    stream.emit('readable');
	    state.emittedReadable = false;
	  }

	  // The stream needs another readable event if:
	  // 1. It is not flowing, as the flow mechanism will take
	  //    care of it.
	  // 2. It is not ended.
	  // 3. It is below the highWaterMark, so we can schedule
	  //    another readable later.
	  state.needReadable = !state.flowing && !state.ended && state.length <= state.highWaterMark;
	  flow(stream);
	}

	// At this point, the user has presumably seen the 'readable' event,
	// and called read() to consume some data.  that may have triggered
	// in turn another _read(n) call, in which case reading = true if
	// it's in progress.
	// However, if we're not ended, or reading, and the length < hwm,
	// then go ahead and try to read some more preemptively.
	function maybeReadMore(stream, state) {
	  if (!state.readingMore && state.constructed) {
	    state.readingMore = true;
	    process.nextTick(maybeReadMore_, stream, state);
	  }
	}
	function maybeReadMore_(stream, state) {
	  // Attempt to read more data if we should.
	  //
	  // The conditions for reading more data are (one of):
	  // - Not enough data buffered (state.length < state.highWaterMark). The loop
	  //   is responsible for filling the buffer with enough data if such data
	  //   is available. If highWaterMark is 0 and we are not in the flowing mode
	  //   we should _not_ attempt to buffer any extra data. We'll get more data
	  //   when the stream consumer calls read() instead.
	  // - No data in the buffer, and the stream is in flowing mode. In this mode
	  //   the loop below is responsible for ensuring read() is called. Failing to
	  //   call read here would abort the flow and there's no other mechanism for
	  //   continuing the flow if the stream consumer has just subscribed to the
	  //   'data' event.
	  //
	  // In addition to the above conditions to keep reading data, the following
	  // conditions prevent the data from being read:
	  // - The stream has ended (state.ended).
	  // - There is already a pending 'read' operation (state.reading). This is a
	  //   case where the stream has called the implementation defined _read()
	  //   method, but they are processing the call asynchronously and have _not_
	  //   called push() with new data. In this case we skip performing more
	  //   read()s. The execution ends in this method again after the _read() ends
	  //   up calling push() with more data.
	  while (
	    !state.reading &&
	    !state.ended &&
	    (state.length < state.highWaterMark || (state.flowing && state.length === 0))
	  ) {
	    const len = state.length;
	    debug('maybeReadMore read 0');
	    stream.read(0);
	    if (len === state.length)
	      // Didn't get any data, stop spinning.
	      break
	  }
	  state.readingMore = false;
	}

	// Abstract method.  to be overridden in specific implementation classes.
	// call cb(er, data) where data is <= n in length.
	// for virtual (non-string, non-buffer) streams, "length" is somewhat
	// arbitrary, and perhaps not very meaningful.
	Readable.prototype._read = function (n) {
	  throw new ERR_METHOD_NOT_IMPLEMENTED('_read()')
	};
	Readable.prototype.pipe = function (dest, pipeOpts) {
	  const src = this;
	  const state = this._readableState;
	  if (state.pipes.length === 1) {
	    if (!state.multiAwaitDrain) {
	      state.multiAwaitDrain = true;
	      state.awaitDrainWriters = new SafeSet(state.awaitDrainWriters ? [state.awaitDrainWriters] : []);
	    }
	  }
	  state.pipes.push(dest);
	  debug('pipe count=%d opts=%j', state.pipes.length, pipeOpts);
	  const doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;
	  const endFn = doEnd ? onend : unpipe;
	  if (state.endEmitted) process.nextTick(endFn);
	  else src.once('end', endFn);
	  dest.on('unpipe', onunpipe);
	  function onunpipe(readable, unpipeInfo) {
	    debug('onunpipe');
	    if (readable === src) {
	      if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
	        unpipeInfo.hasUnpiped = true;
	        cleanup();
	      }
	    }
	  }
	  function onend() {
	    debug('onend');
	    dest.end();
	  }
	  let ondrain;
	  let cleanedUp = false;
	  function cleanup() {
	    debug('cleanup');
	    // Cleanup event handlers once the pipe is broken.
	    dest.removeListener('close', onclose);
	    dest.removeListener('finish', onfinish);
	    if (ondrain) {
	      dest.removeListener('drain', ondrain);
	    }
	    dest.removeListener('error', onerror);
	    dest.removeListener('unpipe', onunpipe);
	    src.removeListener('end', onend);
	    src.removeListener('end', unpipe);
	    src.removeListener('data', ondata);
	    cleanedUp = true;

	    // If the reader is waiting for a drain event from this
	    // specific writer, then it would cause it to never start
	    // flowing again.
	    // So, if this is awaiting a drain, then we just call it now.
	    // If we don't know, then assume that we are waiting for one.
	    if (ondrain && state.awaitDrainWriters && (!dest._writableState || dest._writableState.needDrain)) ondrain();
	  }
	  function pause() {
	    // If the user unpiped during `dest.write()`, it is possible
	    // to get stuck in a permanently paused state if that write
	    // also returned false.
	    // => Check whether `dest` is still a piping destination.
	    if (!cleanedUp) {
	      if (state.pipes.length === 1 && state.pipes[0] === dest) {
	        debug('false write response, pause', 0);
	        state.awaitDrainWriters = dest;
	        state.multiAwaitDrain = false;
	      } else if (state.pipes.length > 1 && state.pipes.includes(dest)) {
	        debug('false write response, pause', state.awaitDrainWriters.size);
	        state.awaitDrainWriters.add(dest);
	      }
	      src.pause();
	    }
	    if (!ondrain) {
	      // When the dest drains, it reduces the awaitDrain counter
	      // on the source.  This would be more elegant with a .once()
	      // handler in flow(), but adding and removing repeatedly is
	      // too slow.
	      ondrain = pipeOnDrain(src, dest);
	      dest.on('drain', ondrain);
	    }
	  }
	  src.on('data', ondata);
	  function ondata(chunk) {
	    debug('ondata');
	    const ret = dest.write(chunk);
	    debug('dest.write', ret);
	    if (ret === false) {
	      pause();
	    }
	  }

	  // If the dest has an error, then stop piping into it.
	  // However, don't suppress the throwing behavior for this.
	  function onerror(er) {
	    debug('onerror', er);
	    unpipe();
	    dest.removeListener('error', onerror);
	    if (dest.listenerCount('error') === 0) {
	      const s = dest._writableState || dest._readableState;
	      if (s && !s.errorEmitted) {
	        // User incorrectly emitted 'error' directly on the stream.
	        errorOrDestroy(dest, er);
	      } else {
	        dest.emit('error', er);
	      }
	    }
	  }

	  // Make sure our error handler is attached before userland ones.
	  prependListener(dest, 'error', onerror);

	  // Both close and finish should trigger unpipe, but only once.
	  function onclose() {
	    dest.removeListener('finish', onfinish);
	    unpipe();
	  }
	  dest.once('close', onclose);
	  function onfinish() {
	    debug('onfinish');
	    dest.removeListener('close', onclose);
	    unpipe();
	  }
	  dest.once('finish', onfinish);
	  function unpipe() {
	    debug('unpipe');
	    src.unpipe(dest);
	  }

	  // Tell the dest that it's being piped to.
	  dest.emit('pipe', src);

	  // Start the flow if it hasn't been started already.

	  if (dest.writableNeedDrain === true) {
	    pause();
	  } else if (!state.flowing) {
	    debug('pipe resume');
	    src.resume();
	  }
	  return dest
	};
	function pipeOnDrain(src, dest) {
	  return function pipeOnDrainFunctionResult() {
	    const state = src._readableState;

	    // `ondrain` will call directly,
	    // `this` maybe not a reference to dest,
	    // so we use the real dest here.
	    if (state.awaitDrainWriters === dest) {
	      debug('pipeOnDrain', 1);
	      state.awaitDrainWriters = null;
	    } else if (state.multiAwaitDrain) {
	      debug('pipeOnDrain', state.awaitDrainWriters.size);
	      state.awaitDrainWriters.delete(dest);
	    }
	    if ((!state.awaitDrainWriters || state.awaitDrainWriters.size === 0) && src.listenerCount('data')) {
	      src.resume();
	    }
	  }
	}
	Readable.prototype.unpipe = function (dest) {
	  const state = this._readableState;
	  const unpipeInfo = {
	    hasUnpiped: false
	  };

	  // If we're not piping anywhere, then do nothing.
	  if (state.pipes.length === 0) return this
	  if (!dest) {
	    // remove all.
	    const dests = state.pipes;
	    state.pipes = [];
	    this.pause();
	    for (let i = 0; i < dests.length; i++)
	      dests[i].emit('unpipe', this, {
	        hasUnpiped: false
	      });
	    return this
	  }

	  // Try to find the right one.
	  const index = ArrayPrototypeIndexOf(state.pipes, dest);
	  if (index === -1) return this
	  state.pipes.splice(index, 1);
	  if (state.pipes.length === 0) this.pause();
	  dest.emit('unpipe', this, unpipeInfo);
	  return this
	};

	// Set up data events if they are asked for
	// Ensure readable listeners eventually get something.
	Readable.prototype.on = function (ev, fn) {
	  const res = Stream.prototype.on.call(this, ev, fn);
	  const state = this._readableState;
	  if (ev === 'data') {
	    // Update readableListening so that resume() may be a no-op
	    // a few lines down. This is needed to support once('readable').
	    state.readableListening = this.listenerCount('readable') > 0;

	    // Try start flowing on next tick if stream isn't explicitly paused.
	    if (state.flowing !== false) this.resume();
	  } else if (ev === 'readable') {
	    if (!state.endEmitted && !state.readableListening) {
	      state.readableListening = state.needReadable = true;
	      state.flowing = false;
	      state.emittedReadable = false;
	      debug('on readable', state.length, state.reading);
	      if (state.length) {
	        emitReadable(this);
	      } else if (!state.reading) {
	        process.nextTick(nReadingNextTick, this);
	      }
	    }
	  }
	  return res
	};
	Readable.prototype.addListener = Readable.prototype.on;
	Readable.prototype.removeListener = function (ev, fn) {
	  const res = Stream.prototype.removeListener.call(this, ev, fn);
	  if (ev === 'readable') {
	    // We need to check if there is someone still listening to
	    // readable and reset the state. However this needs to happen
	    // after readable has been emitted but before I/O (nextTick) to
	    // support once('readable', fn) cycles. This means that calling
	    // resume within the same tick will have no
	    // effect.
	    process.nextTick(updateReadableListening, this);
	  }
	  return res
	};
	Readable.prototype.off = Readable.prototype.removeListener;
	Readable.prototype.removeAllListeners = function (ev) {
	  const res = Stream.prototype.removeAllListeners.apply(this, arguments);
	  if (ev === 'readable' || ev === undefined) {
	    // We need to check if there is someone still listening to
	    // readable and reset the state. However this needs to happen
	    // after readable has been emitted but before I/O (nextTick) to
	    // support once('readable', fn) cycles. This means that calling
	    // resume within the same tick will have no
	    // effect.
	    process.nextTick(updateReadableListening, this);
	  }
	  return res
	};
	function updateReadableListening(self) {
	  const state = self._readableState;
	  state.readableListening = self.listenerCount('readable') > 0;
	  if (state.resumeScheduled && state[kPaused] === false) {
	    // Flowing needs to be set to true now, otherwise
	    // the upcoming resume will not flow.
	    state.flowing = true;

	    // Crude way to check if we should resume.
	  } else if (self.listenerCount('data') > 0) {
	    self.resume();
	  } else if (!state.readableListening) {
	    state.flowing = null;
	  }
	}
	function nReadingNextTick(self) {
	  debug('readable nexttick read 0');
	  self.read(0);
	}

	// pause() and resume() are remnants of the legacy readable stream API
	// If the user uses them, then switch into old mode.
	Readable.prototype.resume = function () {
	  const state = this._readableState;
	  if (!state.flowing) {
	    debug('resume');
	    // We flow only if there is no one listening
	    // for readable, but we still have to call
	    // resume().
	    state.flowing = !state.readableListening;
	    resume(this, state);
	  }
	  state[kPaused] = false;
	  return this
	};
	function resume(stream, state) {
	  if (!state.resumeScheduled) {
	    state.resumeScheduled = true;
	    process.nextTick(resume_, stream, state);
	  }
	}
	function resume_(stream, state) {
	  debug('resume', state.reading);
	  if (!state.reading) {
	    stream.read(0);
	  }
	  state.resumeScheduled = false;
	  stream.emit('resume');
	  flow(stream);
	  if (state.flowing && !state.reading) stream.read(0);
	}
	Readable.prototype.pause = function () {
	  debug('call pause flowing=%j', this._readableState.flowing);
	  if (this._readableState.flowing !== false) {
	    debug('pause');
	    this._readableState.flowing = false;
	    this.emit('pause');
	  }
	  this._readableState[kPaused] = true;
	  return this
	};
	function flow(stream) {
	  const state = stream._readableState;
	  debug('flow', state.flowing);
	  while (state.flowing && stream.read() !== null);
	}

	// Wrap an old-style stream as the async data source.
	// This is *not* part of the readable stream interface.
	// It is an ugly unfortunate mess of history.
	Readable.prototype.wrap = function (stream) {
	  let paused = false;

	  // TODO (ronag): Should this.destroy(err) emit
	  // 'error' on the wrapped stream? Would require
	  // a static factory method, e.g. Readable.wrap(stream).

	  stream.on('data', (chunk) => {
	    if (!this.push(chunk) && stream.pause) {
	      paused = true;
	      stream.pause();
	    }
	  });
	  stream.on('end', () => {
	    this.push(null);
	  });
	  stream.on('error', (err) => {
	    errorOrDestroy(this, err);
	  });
	  stream.on('close', () => {
	    this.destroy();
	  });
	  stream.on('destroy', () => {
	    this.destroy();
	  });
	  this._read = () => {
	    if (paused && stream.resume) {
	      paused = false;
	      stream.resume();
	    }
	  };

	  // Proxy all the other methods. Important when wrapping filters and duplexes.
	  const streamKeys = ObjectKeys(stream);
	  for (let j = 1; j < streamKeys.length; j++) {
	    const i = streamKeys[j];
	    if (this[i] === undefined && typeof stream[i] === 'function') {
	      this[i] = stream[i].bind(stream);
	    }
	  }
	  return this
	};
	Readable.prototype[SymbolAsyncIterator] = function () {
	  return streamToAsyncIterator(this)
	};
	Readable.prototype.iterator = function (options) {
	  if (options !== undefined) {
	    validateObject(options, 'options');
	  }
	  return streamToAsyncIterator(this, options)
	};
	function streamToAsyncIterator(stream, options) {
	  if (typeof stream.read !== 'function') {
	    stream = Readable.wrap(stream, {
	      objectMode: true
	    });
	  }
	  const iter = createAsyncIterator(stream, options);
	  iter.stream = stream;
	  return iter
	}
	async function* createAsyncIterator(stream, options) {
	  let callback = nop;
	  function next(resolve) {
	    if (this === stream) {
	      callback();
	      callback = nop;
	    } else {
	      callback = resolve;
	    }
	  }
	  stream.on('readable', next);
	  let error;
	  const cleanup = eos(
	    stream,
	    {
	      writable: false
	    },
	    (err) => {
	      error = err ? aggregateTwoErrors(error, err) : null;
	      callback();
	      callback = nop;
	    }
	  );
	  try {
	    while (true) {
	      const chunk = stream.destroyed ? null : stream.read();
	      if (chunk !== null) {
	        yield chunk;
	      } else if (error) {
	        throw error
	      } else if (error === null) {
	        return
	      } else {
	        await new Promise(next);
	      }
	    }
	  } catch (err) {
	    error = aggregateTwoErrors(error, err);
	    throw error
	  } finally {
	    if (
	      (error || (options === null || options === undefined ? undefined : options.destroyOnReturn) !== false) &&
	      (error === undefined || stream._readableState.autoDestroy)
	    ) {
	      destroyImpl.destroyer(stream, null);
	    } else {
	      stream.off('readable', next);
	      cleanup();
	    }
	  }
	}

	// Making it explicit these properties are not enumerable
	// because otherwise some prototype manipulation in
	// userland will fail.
	ObjectDefineProperties(Readable.prototype, {
	  readable: {
	    __proto__: null,
	    get() {
	      const r = this._readableState;
	      // r.readable === false means that this is part of a Duplex stream
	      // where the readable side was disabled upon construction.
	      // Compat. The user might manually disable readable side through
	      // deprecated setter.
	      return !!r && r.readable !== false && !r.destroyed && !r.errorEmitted && !r.endEmitted
	    },
	    set(val) {
	      // Backwards compat.
	      if (this._readableState) {
	        this._readableState.readable = !!val;
	      }
	    }
	  },
	  readableDidRead: {
	    __proto__: null,
	    enumerable: false,
	    get: function () {
	      return this._readableState.dataEmitted
	    }
	  },
	  readableAborted: {
	    __proto__: null,
	    enumerable: false,
	    get: function () {
	      return !!(
	        this._readableState.readable !== false &&
	        (this._readableState.destroyed || this._readableState.errored) &&
	        !this._readableState.endEmitted
	      )
	    }
	  },
	  readableHighWaterMark: {
	    __proto__: null,
	    enumerable: false,
	    get: function () {
	      return this._readableState.highWaterMark
	    }
	  },
	  readableBuffer: {
	    __proto__: null,
	    enumerable: false,
	    get: function () {
	      return this._readableState && this._readableState.buffer
	    }
	  },
	  readableFlowing: {
	    __proto__: null,
	    enumerable: false,
	    get: function () {
	      return this._readableState.flowing
	    },
	    set: function (state) {
	      if (this._readableState) {
	        this._readableState.flowing = state;
	      }
	    }
	  },
	  readableLength: {
	    __proto__: null,
	    enumerable: false,
	    get() {
	      return this._readableState.length
	    }
	  },
	  readableObjectMode: {
	    __proto__: null,
	    enumerable: false,
	    get() {
	      return this._readableState ? this._readableState.objectMode : false
	    }
	  },
	  readableEncoding: {
	    __proto__: null,
	    enumerable: false,
	    get() {
	      return this._readableState ? this._readableState.encoding : null
	    }
	  },
	  errored: {
	    __proto__: null,
	    enumerable: false,
	    get() {
	      return this._readableState ? this._readableState.errored : null
	    }
	  },
	  closed: {
	    __proto__: null,
	    get() {
	      return this._readableState ? this._readableState.closed : false
	    }
	  },
	  destroyed: {
	    __proto__: null,
	    enumerable: false,
	    get() {
	      return this._readableState ? this._readableState.destroyed : false
	    },
	    set(value) {
	      // We ignore the value if the stream
	      // has not been initialized yet.
	      if (!this._readableState) {
	        return
	      }

	      // Backward compatibility, the user is explicitly
	      // managing destroyed.
	      this._readableState.destroyed = value;
	    }
	  },
	  readableEnded: {
	    __proto__: null,
	    enumerable: false,
	    get() {
	      return this._readableState ? this._readableState.endEmitted : false
	    }
	  }
	});
	ObjectDefineProperties(ReadableState.prototype, {
	  // Legacy getter for `pipesCount`.
	  pipesCount: {
	    __proto__: null,
	    get() {
	      return this.pipes.length
	    }
	  },
	  // Legacy property for `paused`.
	  paused: {
	    __proto__: null,
	    get() {
	      return this[kPaused] !== false
	    },
	    set(value) {
	      this[kPaused] = !!value;
	    }
	  }
	});

	// Exposed for testing purposes only.
	Readable._fromList = fromList;

	// Pluck off n bytes from an array of buffers.
	// Length is the combined lengths of all the buffers in the list.
	// This function is designed to be inlinable, so please take care when making
	// changes to the function body.
	function fromList(n, state) {
	  // nothing buffered.
	  if (state.length === 0) return null
	  let ret;
	  if (state.objectMode) ret = state.buffer.shift();
	  else if (!n || n >= state.length) {
	    // Read it all, truncate the list.
	    if (state.decoder) ret = state.buffer.join('');
	    else if (state.buffer.length === 1) ret = state.buffer.first();
	    else ret = state.buffer.concat(state.length);
	    state.buffer.clear();
	  } else {
	    // read part of list.
	    ret = state.buffer.consume(n, state.decoder);
	  }
	  return ret
	}
	function endReadable(stream) {
	  const state = stream._readableState;
	  debug('endReadable', state.endEmitted);
	  if (!state.endEmitted) {
	    state.ended = true;
	    process.nextTick(endReadableNT, state, stream);
	  }
	}
	function endReadableNT(state, stream) {
	  debug('endReadableNT', state.endEmitted, state.length);

	  // Check that we didn't get one last unshift.
	  if (!state.errored && !state.closeEmitted && !state.endEmitted && state.length === 0) {
	    state.endEmitted = true;
	    stream.emit('end');
	    if (stream.writable && stream.allowHalfOpen === false) {
	      process.nextTick(endWritableNT, stream);
	    } else if (state.autoDestroy) {
	      // In case of duplex streams we need a way to detect
	      // if the writable side is ready for autoDestroy as well.
	      const wState = stream._writableState;
	      const autoDestroy =
	        !wState ||
	        (wState.autoDestroy &&
	          // We don't expect the writable to ever 'finish'
	          // if writable is explicitly set to false.
	          (wState.finished || wState.writable === false));
	      if (autoDestroy) {
	        stream.destroy();
	      }
	    }
	  }
	}
	function endWritableNT(stream) {
	  const writable = stream.writable && !stream.writableEnded && !stream.destroyed;
	  if (writable) {
	    stream.end();
	  }
	}
	Readable.from = function (iterable, opts) {
	  return from(Readable, iterable, opts)
	};
	let webStreamsAdapters;

	// Lazy to avoid circular references
	function lazyWebStreams() {
	  if (webStreamsAdapters === undefined) webStreamsAdapters = {};
	  return webStreamsAdapters
	}
	Readable.fromWeb = function (readableStream, options) {
	  return lazyWebStreams().newStreamReadableFromReadableStream(readableStream, options)
	};
	Readable.toWeb = function (streamReadable, options) {
	  return lazyWebStreams().newReadableStreamFromStreamReadable(streamReadable, options)
	};
	Readable.wrap = function (src, options) {
	  var _ref, _src$readableObjectMo;
	  return new Readable({
	    objectMode:
	      (_ref =
	        (_src$readableObjectMo = src.readableObjectMode) !== null && _src$readableObjectMo !== undefined
	          ? _src$readableObjectMo
	          : src.objectMode) !== null && _ref !== undefined
	        ? _ref
	        : true,
	    ...options,
	    destroy(err, callback) {
	      destroyImpl.destroyer(src, err);
	      callback(err);
	    }
	  }).wrap(src)
	};
	return readable;
}

var writable;
var hasRequiredWritable;

function requireWritable () {
	if (hasRequiredWritable) return writable;
	hasRequiredWritable = 1;

	/* replacement start */

	const process = requireBrowser$1();

	/* replacement end */

	const {
	  ArrayPrototypeSlice,
	  Error,
	  FunctionPrototypeSymbolHasInstance,
	  ObjectDefineProperty,
	  ObjectDefineProperties,
	  ObjectSetPrototypeOf,
	  StringPrototypeToLowerCase,
	  Symbol,
	  SymbolHasInstance
	} = requirePrimordials();
	writable = Writable;
	Writable.WritableState = WritableState;
	const { EventEmitter: EE } = requireEvents();
	const Stream = requireLegacy().Stream;
	const { Buffer } = requireBuffer();
	const destroyImpl = requireDestroy();
	const { addAbortSignal } = requireAddAbortSignal();
	const { getHighWaterMark, getDefaultHighWaterMark } = requireState();
	const {
	  ERR_INVALID_ARG_TYPE,
	  ERR_METHOD_NOT_IMPLEMENTED,
	  ERR_MULTIPLE_CALLBACK,
	  ERR_STREAM_CANNOT_PIPE,
	  ERR_STREAM_DESTROYED,
	  ERR_STREAM_ALREADY_FINISHED,
	  ERR_STREAM_NULL_VALUES,
	  ERR_STREAM_WRITE_AFTER_END,
	  ERR_UNKNOWN_ENCODING
	} = requireErrors().codes;
	const { errorOrDestroy } = destroyImpl;
	ObjectSetPrototypeOf(Writable.prototype, Stream.prototype);
	ObjectSetPrototypeOf(Writable, Stream);
	function nop() {}
	const kOnFinished = Symbol('kOnFinished');
	function WritableState(options, stream, isDuplex) {
	  // Duplex streams are both readable and writable, but share
	  // the same options object.
	  // However, some cases require setting options to different
	  // values for the readable and the writable sides of the duplex stream,
	  // e.g. options.readableObjectMode vs. options.writableObjectMode, etc.
	  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof requireDuplex();

	  // Object stream flag to indicate whether or not this stream
	  // contains buffers or objects.
	  this.objectMode = !!(options && options.objectMode);
	  if (isDuplex) this.objectMode = this.objectMode || !!(options && options.writableObjectMode);

	  // The point at which write() starts returning false
	  // Note: 0 is a valid value, means that we always return false if
	  // the entire buffer is not flushed immediately on write().
	  this.highWaterMark = options
	    ? getHighWaterMark(this, options, 'writableHighWaterMark', isDuplex)
	    : getDefaultHighWaterMark(false);

	  // if _final has been called.
	  this.finalCalled = false;

	  // drain event flag.
	  this.needDrain = false;
	  // At the start of calling end()
	  this.ending = false;
	  // When end() has been called, and returned.
	  this.ended = false;
	  // When 'finish' is emitted.
	  this.finished = false;

	  // Has it been destroyed
	  this.destroyed = false;

	  // Should we decode strings into buffers before passing to _write?
	  // this is here so that some node-core streams can optimize string
	  // handling at a lower level.
	  const noDecode = !!(options && options.decodeStrings === false);
	  this.decodeStrings = !noDecode;

	  // Crypto is kind of old and crusty.  Historically, its default string
	  // encoding is 'binary' so we have to make this configurable.
	  // Everything else in the universe uses 'utf8', though.
	  this.defaultEncoding = (options && options.defaultEncoding) || 'utf8';

	  // Not an actual buffer we keep track of, but a measurement
	  // of how much we're waiting to get pushed to some underlying
	  // socket or file.
	  this.length = 0;

	  // A flag to see when we're in the middle of a write.
	  this.writing = false;

	  // When true all writes will be buffered until .uncork() call.
	  this.corked = 0;

	  // A flag to be able to tell if the onwrite cb is called immediately,
	  // or on a later tick.  We set this to true at first, because any
	  // actions that shouldn't happen until "later" should generally also
	  // not happen before the first write call.
	  this.sync = true;

	  // A flag to know if we're processing previously buffered items, which
	  // may call the _write() callback in the same tick, so that we don't
	  // end up in an overlapped onwrite situation.
	  this.bufferProcessing = false;

	  // The callback that's passed to _write(chunk, cb).
	  this.onwrite = onwrite.bind(undefined, stream);

	  // The callback that the user supplies to write(chunk, encoding, cb).
	  this.writecb = null;

	  // The amount that is being written when _write is called.
	  this.writelen = 0;

	  // Storage for data passed to the afterWrite() callback in case of
	  // synchronous _write() completion.
	  this.afterWriteTickInfo = null;
	  resetBuffer(this);

	  // Number of pending user-supplied write callbacks
	  // this must be 0 before 'finish' can be emitted.
	  this.pendingcb = 0;

	  // Stream is still being constructed and cannot be
	  // destroyed until construction finished or failed.
	  // Async construction is opt in, therefore we start as
	  // constructed.
	  this.constructed = true;

	  // Emit prefinish if the only thing we're waiting for is _write cbs
	  // This is relevant for synchronous Transform streams.
	  this.prefinished = false;

	  // True if the error was already emitted and should not be thrown again.
	  this.errorEmitted = false;

	  // Should close be emitted on destroy. Defaults to true.
	  this.emitClose = !options || options.emitClose !== false;

	  // Should .destroy() be called after 'finish' (and potentially 'end').
	  this.autoDestroy = !options || options.autoDestroy !== false;

	  // Indicates whether the stream has errored. When true all write() calls
	  // should return false. This is needed since when autoDestroy
	  // is disabled we need a way to tell whether the stream has failed.
	  this.errored = null;

	  // Indicates whether the stream has finished destroying.
	  this.closed = false;

	  // True if close has been emitted or would have been emitted
	  // depending on emitClose.
	  this.closeEmitted = false;
	  this[kOnFinished] = [];
	}
	function resetBuffer(state) {
	  state.buffered = [];
	  state.bufferedIndex = 0;
	  state.allBuffers = true;
	  state.allNoop = true;
	}
	WritableState.prototype.getBuffer = function getBuffer() {
	  return ArrayPrototypeSlice(this.buffered, this.bufferedIndex)
	};
	ObjectDefineProperty(WritableState.prototype, 'bufferedRequestCount', {
	  __proto__: null,
	  get() {
	    return this.buffered.length - this.bufferedIndex
	  }
	});
	function Writable(options) {
	  // Writable ctor is applied to Duplexes, too.
	  // `realHasInstance` is necessary because using plain `instanceof`
	  // would return false, as no `_writableState` property is attached.

	  // Trying to use the custom `instanceof` for Writable here will also break the
	  // Node.js LazyTransform implementation, which has a non-trivial getter for
	  // `_writableState` that would lead to infinite recursion.

	  // Checking for a Stream.Duplex instance is faster here instead of inside
	  // the WritableState constructor, at least with V8 6.5.
	  const isDuplex = this instanceof requireDuplex();
	  if (!isDuplex && !FunctionPrototypeSymbolHasInstance(Writable, this)) return new Writable(options)
	  this._writableState = new WritableState(options, this, isDuplex);
	  if (options) {
	    if (typeof options.write === 'function') this._write = options.write;
	    if (typeof options.writev === 'function') this._writev = options.writev;
	    if (typeof options.destroy === 'function') this._destroy = options.destroy;
	    if (typeof options.final === 'function') this._final = options.final;
	    if (typeof options.construct === 'function') this._construct = options.construct;
	    if (options.signal) addAbortSignal(options.signal, this);
	  }
	  Stream.call(this, options);
	  destroyImpl.construct(this, () => {
	    const state = this._writableState;
	    if (!state.writing) {
	      clearBuffer(this, state);
	    }
	    finishMaybe(this, state);
	  });
	}
	ObjectDefineProperty(Writable, SymbolHasInstance, {
	  __proto__: null,
	  value: function (object) {
	    if (FunctionPrototypeSymbolHasInstance(this, object)) return true
	    if (this !== Writable) return false
	    return object && object._writableState instanceof WritableState
	  }
	});

	// Otherwise people can pipe Writable streams, which is just wrong.
	Writable.prototype.pipe = function () {
	  errorOrDestroy(this, new ERR_STREAM_CANNOT_PIPE());
	};
	function _write(stream, chunk, encoding, cb) {
	  const state = stream._writableState;
	  if (typeof encoding === 'function') {
	    cb = encoding;
	    encoding = state.defaultEncoding;
	  } else {
	    if (!encoding) encoding = state.defaultEncoding;
	    else if (encoding !== 'buffer' && !Buffer.isEncoding(encoding)) throw new ERR_UNKNOWN_ENCODING(encoding)
	    if (typeof cb !== 'function') cb = nop;
	  }
	  if (chunk === null) {
	    throw new ERR_STREAM_NULL_VALUES()
	  } else if (!state.objectMode) {
	    if (typeof chunk === 'string') {
	      if (state.decodeStrings !== false) {
	        chunk = Buffer.from(chunk, encoding);
	        encoding = 'buffer';
	      }
	    } else if (chunk instanceof Buffer) {
	      encoding = 'buffer';
	    } else if (Stream._isUint8Array(chunk)) {
	      chunk = Stream._uint8ArrayToBuffer(chunk);
	      encoding = 'buffer';
	    } else {
	      throw new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer', 'Uint8Array'], chunk)
	    }
	  }
	  let err;
	  if (state.ending) {
	    err = new ERR_STREAM_WRITE_AFTER_END();
	  } else if (state.destroyed) {
	    err = new ERR_STREAM_DESTROYED('write');
	  }
	  if (err) {
	    process.nextTick(cb, err);
	    errorOrDestroy(stream, err, true);
	    return err
	  }
	  state.pendingcb++;
	  return writeOrBuffer(stream, state, chunk, encoding, cb)
	}
	Writable.prototype.write = function (chunk, encoding, cb) {
	  return _write(this, chunk, encoding, cb) === true
	};
	Writable.prototype.cork = function () {
	  this._writableState.corked++;
	};
	Writable.prototype.uncork = function () {
	  const state = this._writableState;
	  if (state.corked) {
	    state.corked--;
	    if (!state.writing) clearBuffer(this, state);
	  }
	};
	Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
	  // node::ParseEncoding() requires lower case.
	  if (typeof encoding === 'string') encoding = StringPrototypeToLowerCase(encoding);
	  if (!Buffer.isEncoding(encoding)) throw new ERR_UNKNOWN_ENCODING(encoding)
	  this._writableState.defaultEncoding = encoding;
	  return this
	};

	// If we're already writing something, then just put this
	// in the queue, and wait our turn.  Otherwise, call _write
	// If we return false, then we need a drain event, so set that flag.
	function writeOrBuffer(stream, state, chunk, encoding, callback) {
	  const len = state.objectMode ? 1 : chunk.length;
	  state.length += len;

	  // stream._write resets state.length
	  const ret = state.length < state.highWaterMark;
	  // We must ensure that previous needDrain will not be reset to false.
	  if (!ret) state.needDrain = true;
	  if (state.writing || state.corked || state.errored || !state.constructed) {
	    state.buffered.push({
	      chunk,
	      encoding,
	      callback
	    });
	    if (state.allBuffers && encoding !== 'buffer') {
	      state.allBuffers = false;
	    }
	    if (state.allNoop && callback !== nop) {
	      state.allNoop = false;
	    }
	  } else {
	    state.writelen = len;
	    state.writecb = callback;
	    state.writing = true;
	    state.sync = true;
	    stream._write(chunk, encoding, state.onwrite);
	    state.sync = false;
	  }

	  // Return false if errored or destroyed in order to break
	  // any synchronous while(stream.write(data)) loops.
	  return ret && !state.errored && !state.destroyed
	}
	function doWrite(stream, state, writev, len, chunk, encoding, cb) {
	  state.writelen = len;
	  state.writecb = cb;
	  state.writing = true;
	  state.sync = true;
	  if (state.destroyed) state.onwrite(new ERR_STREAM_DESTROYED('write'));
	  else if (writev) stream._writev(chunk, state.onwrite);
	  else stream._write(chunk, encoding, state.onwrite);
	  state.sync = false;
	}
	function onwriteError(stream, state, er, cb) {
	  --state.pendingcb;
	  cb(er);
	  // Ensure callbacks are invoked even when autoDestroy is
	  // not enabled. Passing `er` here doesn't make sense since
	  // it's related to one specific write, not to the buffered
	  // writes.
	  errorBuffer(state);
	  // This can emit error, but error must always follow cb.
	  errorOrDestroy(stream, er);
	}
	function onwrite(stream, er) {
	  const state = stream._writableState;
	  const sync = state.sync;
	  const cb = state.writecb;
	  if (typeof cb !== 'function') {
	    errorOrDestroy(stream, new ERR_MULTIPLE_CALLBACK());
	    return
	  }
	  state.writing = false;
	  state.writecb = null;
	  state.length -= state.writelen;
	  state.writelen = 0;
	  if (er) {
	    // Avoid V8 leak, https://github.com/nodejs/node/pull/34103#issuecomment-652002364
	    er.stack; // eslint-disable-line no-unused-expressions

	    if (!state.errored) {
	      state.errored = er;
	    }

	    // In case of duplex streams we need to notify the readable side of the
	    // error.
	    if (stream._readableState && !stream._readableState.errored) {
	      stream._readableState.errored = er;
	    }
	    if (sync) {
	      process.nextTick(onwriteError, stream, state, er, cb);
	    } else {
	      onwriteError(stream, state, er, cb);
	    }
	  } else {
	    if (state.buffered.length > state.bufferedIndex) {
	      clearBuffer(stream, state);
	    }
	    if (sync) {
	      // It is a common case that the callback passed to .write() is always
	      // the same. In that case, we do not schedule a new nextTick(), but
	      // rather just increase a counter, to improve performance and avoid
	      // memory allocations.
	      if (state.afterWriteTickInfo !== null && state.afterWriteTickInfo.cb === cb) {
	        state.afterWriteTickInfo.count++;
	      } else {
	        state.afterWriteTickInfo = {
	          count: 1,
	          cb,
	          stream,
	          state
	        };
	        process.nextTick(afterWriteTick, state.afterWriteTickInfo);
	      }
	    } else {
	      afterWrite(stream, state, 1, cb);
	    }
	  }
	}
	function afterWriteTick({ stream, state, count, cb }) {
	  state.afterWriteTickInfo = null;
	  return afterWrite(stream, state, count, cb)
	}
	function afterWrite(stream, state, count, cb) {
	  const needDrain = !state.ending && !stream.destroyed && state.length === 0 && state.needDrain;
	  if (needDrain) {
	    state.needDrain = false;
	    stream.emit('drain');
	  }
	  while (count-- > 0) {
	    state.pendingcb--;
	    cb();
	  }
	  if (state.destroyed) {
	    errorBuffer(state);
	  }
	  finishMaybe(stream, state);
	}

	// If there's something in the buffer waiting, then invoke callbacks.
	function errorBuffer(state) {
	  if (state.writing) {
	    return
	  }
	  for (let n = state.bufferedIndex; n < state.buffered.length; ++n) {
	    var _state$errored;
	    const { chunk, callback } = state.buffered[n];
	    const len = state.objectMode ? 1 : chunk.length;
	    state.length -= len;
	    callback(
	      (_state$errored = state.errored) !== null && _state$errored !== undefined
	        ? _state$errored
	        : new ERR_STREAM_DESTROYED('write')
	    );
	  }
	  const onfinishCallbacks = state[kOnFinished].splice(0);
	  for (let i = 0; i < onfinishCallbacks.length; i++) {
	    var _state$errored2;
	    onfinishCallbacks[i](
	      (_state$errored2 = state.errored) !== null && _state$errored2 !== undefined
	        ? _state$errored2
	        : new ERR_STREAM_DESTROYED('end')
	    );
	  }
	  resetBuffer(state);
	}

	// If there's something in the buffer waiting, then process it.
	function clearBuffer(stream, state) {
	  if (state.corked || state.bufferProcessing || state.destroyed || !state.constructed) {
	    return
	  }
	  const { buffered, bufferedIndex, objectMode } = state;
	  const bufferedLength = buffered.length - bufferedIndex;
	  if (!bufferedLength) {
	    return
	  }
	  let i = bufferedIndex;
	  state.bufferProcessing = true;
	  if (bufferedLength > 1 && stream._writev) {
	    state.pendingcb -= bufferedLength - 1;
	    const callback = state.allNoop
	      ? nop
	      : (err) => {
	          for (let n = i; n < buffered.length; ++n) {
	            buffered[n].callback(err);
	          }
	        };
	    // Make a copy of `buffered` if it's going to be used by `callback` above,
	    // since `doWrite` will mutate the array.
	    const chunks = state.allNoop && i === 0 ? buffered : ArrayPrototypeSlice(buffered, i);
	    chunks.allBuffers = state.allBuffers;
	    doWrite(stream, state, true, state.length, chunks, '', callback);
	    resetBuffer(state);
	  } else {
	    do {
	      const { chunk, encoding, callback } = buffered[i];
	      buffered[i++] = null;
	      const len = objectMode ? 1 : chunk.length;
	      doWrite(stream, state, false, len, chunk, encoding, callback);
	    } while (i < buffered.length && !state.writing)
	    if (i === buffered.length) {
	      resetBuffer(state);
	    } else if (i > 256) {
	      buffered.splice(0, i);
	      state.bufferedIndex = 0;
	    } else {
	      state.bufferedIndex = i;
	    }
	  }
	  state.bufferProcessing = false;
	}
	Writable.prototype._write = function (chunk, encoding, cb) {
	  if (this._writev) {
	    this._writev(
	      [
	        {
	          chunk,
	          encoding
	        }
	      ],
	      cb
	    );
	  } else {
	    throw new ERR_METHOD_NOT_IMPLEMENTED('_write()')
	  }
	};
	Writable.prototype._writev = null;
	Writable.prototype.end = function (chunk, encoding, cb) {
	  const state = this._writableState;
	  if (typeof chunk === 'function') {
	    cb = chunk;
	    chunk = null;
	    encoding = null;
	  } else if (typeof encoding === 'function') {
	    cb = encoding;
	    encoding = null;
	  }
	  let err;
	  if (chunk !== null && chunk !== undefined) {
	    const ret = _write(this, chunk, encoding);
	    if (ret instanceof Error) {
	      err = ret;
	    }
	  }

	  // .end() fully uncorks.
	  if (state.corked) {
	    state.corked = 1;
	    this.uncork();
	  }
	  if (err) ; else if (!state.errored && !state.ending) {
	    // This is forgiving in terms of unnecessary calls to end() and can hide
	    // logic errors. However, usually such errors are harmless and causing a
	    // hard error can be disproportionately destructive. It is not always
	    // trivial for the user to determine whether end() needs to be called
	    // or not.

	    state.ending = true;
	    finishMaybe(this, state, true);
	    state.ended = true;
	  } else if (state.finished) {
	    err = new ERR_STREAM_ALREADY_FINISHED('end');
	  } else if (state.destroyed) {
	    err = new ERR_STREAM_DESTROYED('end');
	  }
	  if (typeof cb === 'function') {
	    if (err || state.finished) {
	      process.nextTick(cb, err);
	    } else {
	      state[kOnFinished].push(cb);
	    }
	  }
	  return this
	};
	function needFinish(state) {
	  return (
	    state.ending &&
	    !state.destroyed &&
	    state.constructed &&
	    state.length === 0 &&
	    !state.errored &&
	    state.buffered.length === 0 &&
	    !state.finished &&
	    !state.writing &&
	    !state.errorEmitted &&
	    !state.closeEmitted
	  )
	}
	function callFinal(stream, state) {
	  let called = false;
	  function onFinish(err) {
	    if (called) {
	      errorOrDestroy(stream, err !== null && err !== undefined ? err : ERR_MULTIPLE_CALLBACK());
	      return
	    }
	    called = true;
	    state.pendingcb--;
	    if (err) {
	      const onfinishCallbacks = state[kOnFinished].splice(0);
	      for (let i = 0; i < onfinishCallbacks.length; i++) {
	        onfinishCallbacks[i](err);
	      }
	      errorOrDestroy(stream, err, state.sync);
	    } else if (needFinish(state)) {
	      state.prefinished = true;
	      stream.emit('prefinish');
	      // Backwards compat. Don't check state.sync here.
	      // Some streams assume 'finish' will be emitted
	      // asynchronously relative to _final callback.
	      state.pendingcb++;
	      process.nextTick(finish, stream, state);
	    }
	  }
	  state.sync = true;
	  state.pendingcb++;
	  try {
	    stream._final(onFinish);
	  } catch (err) {
	    onFinish(err);
	  }
	  state.sync = false;
	}
	function prefinish(stream, state) {
	  if (!state.prefinished && !state.finalCalled) {
	    if (typeof stream._final === 'function' && !state.destroyed) {
	      state.finalCalled = true;
	      callFinal(stream, state);
	    } else {
	      state.prefinished = true;
	      stream.emit('prefinish');
	    }
	  }
	}
	function finishMaybe(stream, state, sync) {
	  if (needFinish(state)) {
	    prefinish(stream, state);
	    if (state.pendingcb === 0) {
	      if (sync) {
	        state.pendingcb++;
	        process.nextTick(
	          (stream, state) => {
	            if (needFinish(state)) {
	              finish(stream, state);
	            } else {
	              state.pendingcb--;
	            }
	          },
	          stream,
	          state
	        );
	      } else if (needFinish(state)) {
	        state.pendingcb++;
	        finish(stream, state);
	      }
	    }
	  }
	}
	function finish(stream, state) {
	  state.pendingcb--;
	  state.finished = true;
	  const onfinishCallbacks = state[kOnFinished].splice(0);
	  for (let i = 0; i < onfinishCallbacks.length; i++) {
	    onfinishCallbacks[i]();
	  }
	  stream.emit('finish');
	  if (state.autoDestroy) {
	    // In case of duplex streams we need a way to detect
	    // if the readable side is ready for autoDestroy as well.
	    const rState = stream._readableState;
	    const autoDestroy =
	      !rState ||
	      (rState.autoDestroy &&
	        // We don't expect the readable to ever 'end'
	        // if readable is explicitly set to false.
	        (rState.endEmitted || rState.readable === false));
	    if (autoDestroy) {
	      stream.destroy();
	    }
	  }
	}
	ObjectDefineProperties(Writable.prototype, {
	  closed: {
	    __proto__: null,
	    get() {
	      return this._writableState ? this._writableState.closed : false
	    }
	  },
	  destroyed: {
	    __proto__: null,
	    get() {
	      return this._writableState ? this._writableState.destroyed : false
	    },
	    set(value) {
	      // Backward compatibility, the user is explicitly managing destroyed.
	      if (this._writableState) {
	        this._writableState.destroyed = value;
	      }
	    }
	  },
	  writable: {
	    __proto__: null,
	    get() {
	      const w = this._writableState;
	      // w.writable === false means that this is part of a Duplex stream
	      // where the writable side was disabled upon construction.
	      // Compat. The user might manually disable writable side through
	      // deprecated setter.
	      return !!w && w.writable !== false && !w.destroyed && !w.errored && !w.ending && !w.ended
	    },
	    set(val) {
	      // Backwards compatible.
	      if (this._writableState) {
	        this._writableState.writable = !!val;
	      }
	    }
	  },
	  writableFinished: {
	    __proto__: null,
	    get() {
	      return this._writableState ? this._writableState.finished : false
	    }
	  },
	  writableObjectMode: {
	    __proto__: null,
	    get() {
	      return this._writableState ? this._writableState.objectMode : false
	    }
	  },
	  writableBuffer: {
	    __proto__: null,
	    get() {
	      return this._writableState && this._writableState.getBuffer()
	    }
	  },
	  writableEnded: {
	    __proto__: null,
	    get() {
	      return this._writableState ? this._writableState.ending : false
	    }
	  },
	  writableNeedDrain: {
	    __proto__: null,
	    get() {
	      const wState = this._writableState;
	      if (!wState) return false
	      return !wState.destroyed && !wState.ending && wState.needDrain
	    }
	  },
	  writableHighWaterMark: {
	    __proto__: null,
	    get() {
	      return this._writableState && this._writableState.highWaterMark
	    }
	  },
	  writableCorked: {
	    __proto__: null,
	    get() {
	      return this._writableState ? this._writableState.corked : 0
	    }
	  },
	  writableLength: {
	    __proto__: null,
	    get() {
	      return this._writableState && this._writableState.length
	    }
	  },
	  errored: {
	    __proto__: null,
	    enumerable: false,
	    get() {
	      return this._writableState ? this._writableState.errored : null
	    }
	  },
	  writableAborted: {
	    __proto__: null,
	    enumerable: false,
	    get: function () {
	      return !!(
	        this._writableState.writable !== false &&
	        (this._writableState.destroyed || this._writableState.errored) &&
	        !this._writableState.finished
	      )
	    }
	  }
	});
	const destroy = destroyImpl.destroy;
	Writable.prototype.destroy = function (err, cb) {
	  const state = this._writableState;

	  // Invoke pending callbacks.
	  if (!state.destroyed && (state.bufferedIndex < state.buffered.length || state[kOnFinished].length)) {
	    process.nextTick(errorBuffer, state);
	  }
	  destroy.call(this, err, cb);
	  return this
	};
	Writable.prototype._undestroy = destroyImpl.undestroy;
	Writable.prototype._destroy = function (err, cb) {
	  cb(err);
	};
	Writable.prototype[EE.captureRejectionSymbol] = function (err) {
	  this.destroy(err);
	};
	let webStreamsAdapters;

	// Lazy to avoid circular references
	function lazyWebStreams() {
	  if (webStreamsAdapters === undefined) webStreamsAdapters = {};
	  return webStreamsAdapters
	}
	Writable.fromWeb = function (writableStream, options) {
	  return lazyWebStreams().newStreamWritableFromWritableStream(writableStream, options)
	};
	Writable.toWeb = function (streamWritable) {
	  return lazyWebStreams().newWritableStreamFromStreamWritable(streamWritable)
	};
	return writable;
}

/* replacement start */

var duplexify;
var hasRequiredDuplexify;

function requireDuplexify () {
	if (hasRequiredDuplexify) return duplexify;
	hasRequiredDuplexify = 1;
	const process = requireBrowser$1()

	/* replacement end */

	;	const bufferModule = requireBuffer();
	const {
	  isReadable,
	  isWritable,
	  isIterable,
	  isNodeStream,
	  isReadableNodeStream,
	  isWritableNodeStream,
	  isDuplexNodeStream,
	  isReadableStream,
	  isWritableStream
	} = requireUtils();
	const eos = requireEndOfStream();
	const {
	  AbortError,
	  codes: { ERR_INVALID_ARG_TYPE, ERR_INVALID_RETURN_VALUE }
	} = requireErrors();
	const { destroyer } = requireDestroy();
	const Duplex = requireDuplex();
	const Readable = requireReadable();
	const Writable = requireWritable();
	const { createDeferredPromise } = requireUtil();
	const from = requireFrom();
	const Blob = globalThis.Blob || bufferModule.Blob;
	const isBlob =
	  typeof Blob !== 'undefined'
	    ? function isBlob(b) {
	        return b instanceof Blob
	      }
	    : function isBlob(b) {
	        return false
	      };
	const AbortController = globalThis.AbortController || requireBrowser$2().AbortController;
	const { FunctionPrototypeCall } = requirePrimordials();

	// This is needed for pre node 17.
	class Duplexify extends Duplex {
	  constructor(options) {
	    super(options);

	    // https://github.com/nodejs/node/pull/34385

	    if ((options === null || options === undefined ? undefined : options.readable) === false) {
	      this._readableState.readable = false;
	      this._readableState.ended = true;
	      this._readableState.endEmitted = true;
	    }
	    if ((options === null || options === undefined ? undefined : options.writable) === false) {
	      this._writableState.writable = false;
	      this._writableState.ending = true;
	      this._writableState.ended = true;
	      this._writableState.finished = true;
	    }
	  }
	}
	duplexify = function duplexify(body, name) {
	  if (isDuplexNodeStream(body)) {
	    return body
	  }
	  if (isReadableNodeStream(body)) {
	    return _duplexify({
	      readable: body
	    })
	  }
	  if (isWritableNodeStream(body)) {
	    return _duplexify({
	      writable: body
	    })
	  }
	  if (isNodeStream(body)) {
	    return _duplexify({
	      writable: false,
	      readable: false
	    })
	  }
	  if (isReadableStream(body)) {
	    return _duplexify({
	      readable: Readable.fromWeb(body)
	    })
	  }
	  if (isWritableStream(body)) {
	    return _duplexify({
	      writable: Writable.fromWeb(body)
	    })
	  }
	  if (typeof body === 'function') {
	    const { value, write, final, destroy } = fromAsyncGen(body);
	    if (isIterable(value)) {
	      return from(Duplexify, value, {
	        // TODO (ronag): highWaterMark?
	        objectMode: true,
	        write,
	        final,
	        destroy
	      })
	    }
	    const then = value === null || value === undefined ? undefined : value.then;
	    if (typeof then === 'function') {
	      let d;
	      const promise = FunctionPrototypeCall(
	        then,
	        value,
	        (val) => {
	          if (val != null) {
	            throw new ERR_INVALID_RETURN_VALUE('nully', 'body', val)
	          }
	        },
	        (err) => {
	          destroyer(d, err);
	        }
	      );
	      return (d = new Duplexify({
	        // TODO (ronag): highWaterMark?
	        objectMode: true,
	        readable: false,
	        write,
	        final(cb) {
	          final(async () => {
	            try {
	              await promise;
	              process.nextTick(cb, null);
	            } catch (err) {
	              process.nextTick(cb, err);
	            }
	          });
	        },
	        destroy
	      }))
	    }
	    throw new ERR_INVALID_RETURN_VALUE('Iterable, AsyncIterable or AsyncFunction', name, value)
	  }
	  if (isBlob(body)) {
	    return duplexify(body.arrayBuffer())
	  }
	  if (isIterable(body)) {
	    return from(Duplexify, body, {
	      // TODO (ronag): highWaterMark?
	      objectMode: true,
	      writable: false
	    })
	  }
	  if (
	    isReadableStream(body === null || body === undefined ? undefined : body.readable) &&
	    isWritableStream(body === null || body === undefined ? undefined : body.writable)
	  ) {
	    return Duplexify.fromWeb(body)
	  }
	  if (
	    typeof (body === null || body === undefined ? undefined : body.writable) === 'object' ||
	    typeof (body === null || body === undefined ? undefined : body.readable) === 'object'
	  ) {
	    const readable =
	      body !== null && body !== undefined && body.readable
	        ? isReadableNodeStream(body === null || body === undefined ? undefined : body.readable)
	          ? body === null || body === undefined
	            ? undefined
	            : body.readable
	          : duplexify(body.readable)
	        : undefined;
	    const writable =
	      body !== null && body !== undefined && body.writable
	        ? isWritableNodeStream(body === null || body === undefined ? undefined : body.writable)
	          ? body === null || body === undefined
	            ? undefined
	            : body.writable
	          : duplexify(body.writable)
	        : undefined;
	    return _duplexify({
	      readable,
	      writable
	    })
	  }
	  const then = body === null || body === undefined ? undefined : body.then;
	  if (typeof then === 'function') {
	    let d;
	    FunctionPrototypeCall(
	      then,
	      body,
	      (val) => {
	        if (val != null) {
	          d.push(val);
	        }
	        d.push(null);
	      },
	      (err) => {
	        destroyer(d, err);
	      }
	    );
	    return (d = new Duplexify({
	      objectMode: true,
	      writable: false,
	      read() {}
	    }))
	  }
	  throw new ERR_INVALID_ARG_TYPE(
	    name,
	    [
	      'Blob',
	      'ReadableStream',
	      'WritableStream',
	      'Stream',
	      'Iterable',
	      'AsyncIterable',
	      'Function',
	      '{ readable, writable } pair',
	      'Promise'
	    ],
	    body
	  )
	};
	function fromAsyncGen(fn) {
	  let { promise, resolve } = createDeferredPromise();
	  const ac = new AbortController();
	  const signal = ac.signal;
	  const value = fn(
	    (async function* () {
	      while (true) {
	        const _promise = promise;
	        promise = null;
	        const { chunk, done, cb } = await _promise;
	        process.nextTick(cb);
	        if (done) return
	        if (signal.aborted)
	          throw new AbortError(undefined, {
	            cause: signal.reason
	          })
	        ;({ promise, resolve } = createDeferredPromise());
	        yield chunk;
	      }
	    })(),
	    {
	      signal
	    }
	  );
	  return {
	    value,
	    write(chunk, encoding, cb) {
	      const _resolve = resolve;
	      resolve = null;
	      _resolve({
	        chunk,
	        done: false,
	        cb
	      });
	    },
	    final(cb) {
	      const _resolve = resolve;
	      resolve = null;
	      _resolve({
	        done: true,
	        cb
	      });
	    },
	    destroy(err, cb) {
	      ac.abort();
	      cb(err);
	    }
	  }
	}
	function _duplexify(pair) {
	  const r = pair.readable && typeof pair.readable.read !== 'function' ? Readable.wrap(pair.readable) : pair.readable;
	  const w = pair.writable;
	  let readable = !!isReadable(r);
	  let writable = !!isWritable(w);
	  let ondrain;
	  let onfinish;
	  let onreadable;
	  let onclose;
	  let d;
	  function onfinished(err) {
	    const cb = onclose;
	    onclose = null;
	    if (cb) {
	      cb(err);
	    } else if (err) {
	      d.destroy(err);
	    }
	  }

	  // TODO(ronag): Avoid double buffering.
	  // Implement Writable/Readable/Duplex traits.
	  // See, https://github.com/nodejs/node/pull/33515.
	  d = new Duplexify({
	    // TODO (ronag): highWaterMark?
	    readableObjectMode: !!(r !== null && r !== undefined && r.readableObjectMode),
	    writableObjectMode: !!(w !== null && w !== undefined && w.writableObjectMode),
	    readable,
	    writable
	  });
	  if (writable) {
	    eos(w, (err) => {
	      writable = false;
	      if (err) {
	        destroyer(r, err);
	      }
	      onfinished(err);
	    });
	    d._write = function (chunk, encoding, callback) {
	      if (w.write(chunk, encoding)) {
	        callback();
	      } else {
	        ondrain = callback;
	      }
	    };
	    d._final = function (callback) {
	      w.end();
	      onfinish = callback;
	    };
	    w.on('drain', function () {
	      if (ondrain) {
	        const cb = ondrain;
	        ondrain = null;
	        cb();
	      }
	    });
	    w.on('finish', function () {
	      if (onfinish) {
	        const cb = onfinish;
	        onfinish = null;
	        cb();
	      }
	    });
	  }
	  if (readable) {
	    eos(r, (err) => {
	      readable = false;
	      if (err) {
	        destroyer(r, err);
	      }
	      onfinished(err);
	    });
	    r.on('readable', function () {
	      if (onreadable) {
	        const cb = onreadable;
	        onreadable = null;
	        cb();
	      }
	    });
	    r.on('end', function () {
	      d.push(null);
	    });
	    d._read = function () {
	      while (true) {
	        const buf = r.read();
	        if (buf === null) {
	          onreadable = d._read;
	          return
	        }
	        if (!d.push(buf)) {
	          return
	        }
	      }
	    };
	  }
	  d._destroy = function (err, callback) {
	    if (!err && onclose !== null) {
	      err = new AbortError();
	    }
	    onreadable = null;
	    ondrain = null;
	    onfinish = null;
	    if (onclose === null) {
	      callback(err);
	    } else {
	      onclose = callback;
	      destroyer(w, err);
	      destroyer(r, err);
	    }
	  };
	  return d
	}
	return duplexify;
}

var duplex;
var hasRequiredDuplex;

function requireDuplex () {
	if (hasRequiredDuplex) return duplex;
	hasRequiredDuplex = 1;

	const {
	  ObjectDefineProperties,
	  ObjectGetOwnPropertyDescriptor,
	  ObjectKeys,
	  ObjectSetPrototypeOf
	} = requirePrimordials();
	duplex = Duplex;
	const Readable = requireReadable();
	const Writable = requireWritable();
	ObjectSetPrototypeOf(Duplex.prototype, Readable.prototype);
	ObjectSetPrototypeOf(Duplex, Readable);
	{
	  const keys = ObjectKeys(Writable.prototype);
	  // Allow the keys array to be GC'ed.
	  for (let i = 0; i < keys.length; i++) {
	    const method = keys[i];
	    if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
	  }
	}
	function Duplex(options) {
	  if (!(this instanceof Duplex)) return new Duplex(options)
	  Readable.call(this, options);
	  Writable.call(this, options);
	  if (options) {
	    this.allowHalfOpen = options.allowHalfOpen !== false;
	    if (options.readable === false) {
	      this._readableState.readable = false;
	      this._readableState.ended = true;
	      this._readableState.endEmitted = true;
	    }
	    if (options.writable === false) {
	      this._writableState.writable = false;
	      this._writableState.ending = true;
	      this._writableState.ended = true;
	      this._writableState.finished = true;
	    }
	  } else {
	    this.allowHalfOpen = true;
	  }
	}
	ObjectDefineProperties(Duplex.prototype, {
	  writable: {
	    __proto__: null,
	    ...ObjectGetOwnPropertyDescriptor(Writable.prototype, 'writable')
	  },
	  writableHighWaterMark: {
	    __proto__: null,
	    ...ObjectGetOwnPropertyDescriptor(Writable.prototype, 'writableHighWaterMark')
	  },
	  writableObjectMode: {
	    __proto__: null,
	    ...ObjectGetOwnPropertyDescriptor(Writable.prototype, 'writableObjectMode')
	  },
	  writableBuffer: {
	    __proto__: null,
	    ...ObjectGetOwnPropertyDescriptor(Writable.prototype, 'writableBuffer')
	  },
	  writableLength: {
	    __proto__: null,
	    ...ObjectGetOwnPropertyDescriptor(Writable.prototype, 'writableLength')
	  },
	  writableFinished: {
	    __proto__: null,
	    ...ObjectGetOwnPropertyDescriptor(Writable.prototype, 'writableFinished')
	  },
	  writableCorked: {
	    __proto__: null,
	    ...ObjectGetOwnPropertyDescriptor(Writable.prototype, 'writableCorked')
	  },
	  writableEnded: {
	    __proto__: null,
	    ...ObjectGetOwnPropertyDescriptor(Writable.prototype, 'writableEnded')
	  },
	  writableNeedDrain: {
	    __proto__: null,
	    ...ObjectGetOwnPropertyDescriptor(Writable.prototype, 'writableNeedDrain')
	  },
	  destroyed: {
	    __proto__: null,
	    get() {
	      if (this._readableState === undefined || this._writableState === undefined) {
	        return false
	      }
	      return this._readableState.destroyed && this._writableState.destroyed
	    },
	    set(value) {
	      // Backward compatibility, the user is explicitly
	      // managing destroyed.
	      if (this._readableState && this._writableState) {
	        this._readableState.destroyed = value;
	        this._writableState.destroyed = value;
	      }
	    }
	  }
	});
	let webStreamsAdapters;

	// Lazy to avoid circular references
	function lazyWebStreams() {
	  if (webStreamsAdapters === undefined) webStreamsAdapters = {};
	  return webStreamsAdapters
	}
	Duplex.fromWeb = function (pair, options) {
	  return lazyWebStreams().newStreamDuplexFromReadableWritablePair(pair, options)
	};
	Duplex.toWeb = function (duplex) {
	  return lazyWebStreams().newReadableWritablePairFromDuplex(duplex)
	};
	let duplexify;
	Duplex.from = function (body) {
	  if (!duplexify) {
	    duplexify = requireDuplexify();
	  }
	  return duplexify(body, 'body')
	};
	return duplex;
}

var transform;
var hasRequiredTransform;

function requireTransform () {
	if (hasRequiredTransform) return transform;
	hasRequiredTransform = 1;

	const { ObjectSetPrototypeOf, Symbol } = requirePrimordials();
	transform = Transform;
	const { ERR_METHOD_NOT_IMPLEMENTED } = requireErrors().codes;
	const Duplex = requireDuplex();
	const { getHighWaterMark } = requireState();
	ObjectSetPrototypeOf(Transform.prototype, Duplex.prototype);
	ObjectSetPrototypeOf(Transform, Duplex);
	const kCallback = Symbol('kCallback');
	function Transform(options) {
	  if (!(this instanceof Transform)) return new Transform(options)

	  // TODO (ronag): This should preferably always be
	  // applied but would be semver-major. Or even better;
	  // make Transform a Readable with the Writable interface.
	  const readableHighWaterMark = options ? getHighWaterMark(this, options, 'readableHighWaterMark', true) : null;
	  if (readableHighWaterMark === 0) {
	    // A Duplex will buffer both on the writable and readable side while
	    // a Transform just wants to buffer hwm number of elements. To avoid
	    // buffering twice we disable buffering on the writable side.
	    options = {
	      ...options,
	      highWaterMark: null,
	      readableHighWaterMark,
	      // TODO (ronag): 0 is not optimal since we have
	      // a "bug" where we check needDrain before calling _write and not after.
	      // Refs: https://github.com/nodejs/node/pull/32887
	      // Refs: https://github.com/nodejs/node/pull/35941
	      writableHighWaterMark: options.writableHighWaterMark || 0
	    };
	  }
	  Duplex.call(this, options);

	  // We have implemented the _read method, and done the other things
	  // that Readable wants before the first _read call, so unset the
	  // sync guard flag.
	  this._readableState.sync = false;
	  this[kCallback] = null;
	  if (options) {
	    if (typeof options.transform === 'function') this._transform = options.transform;
	    if (typeof options.flush === 'function') this._flush = options.flush;
	  }

	  // When the writable side finishes, then flush out anything remaining.
	  // Backwards compat. Some Transform streams incorrectly implement _final
	  // instead of or in addition to _flush. By using 'prefinish' instead of
	  // implementing _final we continue supporting this unfortunate use case.
	  this.on('prefinish', prefinish);
	}
	function final(cb) {
	  if (typeof this._flush === 'function' && !this.destroyed) {
	    this._flush((er, data) => {
	      if (er) {
	        if (cb) {
	          cb(er);
	        } else {
	          this.destroy(er);
	        }
	        return
	      }
	      if (data != null) {
	        this.push(data);
	      }
	      this.push(null);
	      if (cb) {
	        cb();
	      }
	    });
	  } else {
	    this.push(null);
	    if (cb) {
	      cb();
	    }
	  }
	}
	function prefinish() {
	  if (this._final !== final) {
	    final.call(this);
	  }
	}
	Transform.prototype._final = final;
	Transform.prototype._transform = function (chunk, encoding, callback) {
	  throw new ERR_METHOD_NOT_IMPLEMENTED('_transform()')
	};
	Transform.prototype._write = function (chunk, encoding, callback) {
	  const rState = this._readableState;
	  const wState = this._writableState;
	  const length = rState.length;
	  this._transform(chunk, encoding, (err, val) => {
	    if (err) {
	      callback(err);
	      return
	    }
	    if (val != null) {
	      this.push(val);
	    }
	    if (
	      wState.ended ||
	      // Backwards compat.
	      length === rState.length ||
	      // Backwards compat.
	      rState.length < rState.highWaterMark
	    ) {
	      callback();
	    } else {
	      this[kCallback] = callback;
	    }
	  });
	};
	Transform.prototype._read = function () {
	  if (this[kCallback]) {
	    const callback = this[kCallback];
	    this[kCallback] = null;
	    callback();
	  }
	};
	return transform;
}

var passthrough;
var hasRequiredPassthrough;

function requirePassthrough () {
	if (hasRequiredPassthrough) return passthrough;
	hasRequiredPassthrough = 1;

	const { ObjectSetPrototypeOf } = requirePrimordials();
	passthrough = PassThrough;
	const Transform = requireTransform();
	ObjectSetPrototypeOf(PassThrough.prototype, Transform.prototype);
	ObjectSetPrototypeOf(PassThrough, Transform);
	function PassThrough(options) {
	  if (!(this instanceof PassThrough)) return new PassThrough(options)
	  Transform.call(this, options);
	}
	PassThrough.prototype._transform = function (chunk, encoding, cb) {
	  cb(null, chunk);
	};
	return passthrough;
}

/* replacement start */

var pipeline_1;
var hasRequiredPipeline;

function requirePipeline () {
	if (hasRequiredPipeline) return pipeline_1;
	hasRequiredPipeline = 1;
	const process = requireBrowser$1()

	/* replacement end */
	// Ported from https://github.com/mafintosh/pump with
	// permission from the author, Mathias Buus (@mafintosh).

	;	const { ArrayIsArray, Promise, SymbolAsyncIterator, SymbolDispose } = requirePrimordials();
	const eos = requireEndOfStream();
	const { once } = requireUtil();
	const destroyImpl = requireDestroy();
	const Duplex = requireDuplex();
	const {
	  aggregateTwoErrors,
	  codes: {
	    ERR_INVALID_ARG_TYPE,
	    ERR_INVALID_RETURN_VALUE,
	    ERR_MISSING_ARGS,
	    ERR_STREAM_DESTROYED,
	    ERR_STREAM_PREMATURE_CLOSE
	  },
	  AbortError
	} = requireErrors();
	const { validateFunction, validateAbortSignal } = requireValidators();
	const {
	  isIterable,
	  isReadable,
	  isReadableNodeStream,
	  isNodeStream,
	  isTransformStream,
	  isWebStream,
	  isReadableStream,
	  isReadableFinished
	} = requireUtils();
	const AbortController = globalThis.AbortController || requireBrowser$2().AbortController;
	let PassThrough;
	let Readable;
	let addAbortListener;
	function destroyer(stream, reading, writing) {
	  let finished = false;
	  stream.on('close', () => {
	    finished = true;
	  });
	  const cleanup = eos(
	    stream,
	    {
	      readable: reading,
	      writable: writing
	    },
	    (err) => {
	      finished = !err;
	    }
	  );
	  return {
	    destroy: (err) => {
	      if (finished) return
	      finished = true;
	      destroyImpl.destroyer(stream, err || new ERR_STREAM_DESTROYED('pipe'));
	    },
	    cleanup
	  }
	}
	function popCallback(streams) {
	  // Streams should never be an empty array. It should always contain at least
	  // a single stream. Therefore optimize for the average case instead of
	  // checking for length === 0 as well.
	  validateFunction(streams[streams.length - 1], 'streams[stream.length - 1]');
	  return streams.pop()
	}
	function makeAsyncIterable(val) {
	  if (isIterable(val)) {
	    return val
	  } else if (isReadableNodeStream(val)) {
	    // Legacy streams are not Iterable.
	    return fromReadable(val)
	  }
	  throw new ERR_INVALID_ARG_TYPE('val', ['Readable', 'Iterable', 'AsyncIterable'], val)
	}
	async function* fromReadable(val) {
	  if (!Readable) {
	    Readable = requireReadable();
	  }
	  yield* Readable.prototype[SymbolAsyncIterator].call(val);
	}
	async function pumpToNode(iterable, writable, finish, { end }) {
	  let error;
	  let onresolve = null;
	  const resume = (err) => {
	    if (err) {
	      error = err;
	    }
	    if (onresolve) {
	      const callback = onresolve;
	      onresolve = null;
	      callback();
	    }
	  };
	  const wait = () =>
	    new Promise((resolve, reject) => {
	      if (error) {
	        reject(error);
	      } else {
	        onresolve = () => {
	          if (error) {
	            reject(error);
	          } else {
	            resolve();
	          }
	        };
	      }
	    });
	  writable.on('drain', resume);
	  const cleanup = eos(
	    writable,
	    {
	      readable: false
	    },
	    resume
	  );
	  try {
	    if (writable.writableNeedDrain) {
	      await wait();
	    }
	    for await (const chunk of iterable) {
	      if (!writable.write(chunk)) {
	        await wait();
	      }
	    }
	    if (end) {
	      writable.end();
	      await wait();
	    }
	    finish();
	  } catch (err) {
	    finish(error !== err ? aggregateTwoErrors(error, err) : err);
	  } finally {
	    cleanup();
	    writable.off('drain', resume);
	  }
	}
	async function pumpToWeb(readable, writable, finish, { end }) {
	  if (isTransformStream(writable)) {
	    writable = writable.writable;
	  }
	  // https://streams.spec.whatwg.org/#example-manual-write-with-backpressure
	  const writer = writable.getWriter();
	  try {
	    for await (const chunk of readable) {
	      await writer.ready;
	      writer.write(chunk).catch(() => {});
	    }
	    await writer.ready;
	    if (end) {
	      await writer.close();
	    }
	    finish();
	  } catch (err) {
	    try {
	      await writer.abort(err);
	      finish(err);
	    } catch (err) {
	      finish(err);
	    }
	  }
	}
	function pipeline(...streams) {
	  return pipelineImpl(streams, once(popCallback(streams)))
	}
	function pipelineImpl(streams, callback, opts) {
	  if (streams.length === 1 && ArrayIsArray(streams[0])) {
	    streams = streams[0];
	  }
	  if (streams.length < 2) {
	    throw new ERR_MISSING_ARGS('streams')
	  }
	  const ac = new AbortController();
	  const signal = ac.signal;
	  const outerSignal = opts === null || opts === undefined ? undefined : opts.signal;

	  // Need to cleanup event listeners if last stream is readable
	  // https://github.com/nodejs/node/issues/35452
	  const lastStreamCleanup = [];
	  validateAbortSignal(outerSignal, 'options.signal');
	  function abort() {
	    finishImpl(new AbortError());
	  }
	  addAbortListener = addAbortListener || requireUtil().addAbortListener;
	  let disposable;
	  if (outerSignal) {
	    disposable = addAbortListener(outerSignal, abort);
	  }
	  let error;
	  let value;
	  const destroys = [];
	  let finishCount = 0;
	  function finish(err) {
	    finishImpl(err, --finishCount === 0);
	  }
	  function finishImpl(err, final) {
	    var _disposable;
	    if (err && (!error || error.code === 'ERR_STREAM_PREMATURE_CLOSE')) {
	      error = err;
	    }
	    if (!error && !final) {
	      return
	    }
	    while (destroys.length) {
	      destroys.shift()(error);
	    }
(_disposable = disposable) === null || _disposable === undefined ? undefined : _disposable[SymbolDispose]();
	    ac.abort();
	    if (final) {
	      if (!error) {
	        lastStreamCleanup.forEach((fn) => fn());
	      }
	      process.nextTick(callback, error, value);
	    }
	  }
	  let ret;
	  for (let i = 0; i < streams.length; i++) {
	    const stream = streams[i];
	    const reading = i < streams.length - 1;
	    const writing = i > 0;
	    const end = reading || (opts === null || opts === undefined ? undefined : opts.end) !== false;
	    const isLastStream = i === streams.length - 1;
	    if (isNodeStream(stream)) {
	      if (end) {
	        const { destroy, cleanup } = destroyer(stream, reading, writing);
	        destroys.push(destroy);
	        if (isReadable(stream) && isLastStream) {
	          lastStreamCleanup.push(cleanup);
	        }
	      }

	      // Catch stream errors that occur after pipe/pump has completed.
	      function onError(err) {
	        if (err && err.name !== 'AbortError' && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
	          finish(err);
	        }
	      }
	      stream.on('error', onError);
	      if (isReadable(stream) && isLastStream) {
	        lastStreamCleanup.push(() => {
	          stream.removeListener('error', onError);
	        });
	      }
	    }
	    if (i === 0) {
	      if (typeof stream === 'function') {
	        ret = stream({
	          signal
	        });
	        if (!isIterable(ret)) {
	          throw new ERR_INVALID_RETURN_VALUE('Iterable, AsyncIterable or Stream', 'source', ret)
	        }
	      } else if (isIterable(stream) || isReadableNodeStream(stream) || isTransformStream(stream)) {
	        ret = stream;
	      } else {
	        ret = Duplex.from(stream);
	      }
	    } else if (typeof stream === 'function') {
	      if (isTransformStream(ret)) {
	        var _ret;
	        ret = makeAsyncIterable((_ret = ret) === null || _ret === undefined ? undefined : _ret.readable);
	      } else {
	        ret = makeAsyncIterable(ret);
	      }
	      ret = stream(ret, {
	        signal
	      });
	      if (reading) {
	        if (!isIterable(ret, true)) {
	          throw new ERR_INVALID_RETURN_VALUE('AsyncIterable', `transform[${i - 1}]`, ret)
	        }
	      } else {
	        var _ret2;
	        if (!PassThrough) {
	          PassThrough = requirePassthrough();
	        }

	        // If the last argument to pipeline is not a stream
	        // we must create a proxy stream so that pipeline(...)
	        // always returns a stream which can be further
	        // composed through `.pipe(stream)`.

	        const pt = new PassThrough({
	          objectMode: true
	        });

	        // Handle Promises/A+ spec, `then` could be a getter that throws on
	        // second use.
	        const then = (_ret2 = ret) === null || _ret2 === undefined ? undefined : _ret2.then;
	        if (typeof then === 'function') {
	          finishCount++;
	          then.call(
	            ret,
	            (val) => {
	              value = val;
	              if (val != null) {
	                pt.write(val);
	              }
	              if (end) {
	                pt.end();
	              }
	              process.nextTick(finish);
	            },
	            (err) => {
	              pt.destroy(err);
	              process.nextTick(finish, err);
	            }
	          );
	        } else if (isIterable(ret, true)) {
	          finishCount++;
	          pumpToNode(ret, pt, finish, {
	            end
	          });
	        } else if (isReadableStream(ret) || isTransformStream(ret)) {
	          const toRead = ret.readable || ret;
	          finishCount++;
	          pumpToNode(toRead, pt, finish, {
	            end
	          });
	        } else {
	          throw new ERR_INVALID_RETURN_VALUE('AsyncIterable or Promise', 'destination', ret)
	        }
	        ret = pt;
	        const { destroy, cleanup } = destroyer(ret, false, true);
	        destroys.push(destroy);
	        if (isLastStream) {
	          lastStreamCleanup.push(cleanup);
	        }
	      }
	    } else if (isNodeStream(stream)) {
	      if (isReadableNodeStream(ret)) {
	        finishCount += 2;
	        const cleanup = pipe(ret, stream, finish, {
	          end
	        });
	        if (isReadable(stream) && isLastStream) {
	          lastStreamCleanup.push(cleanup);
	        }
	      } else if (isTransformStream(ret) || isReadableStream(ret)) {
	        const toRead = ret.readable || ret;
	        finishCount++;
	        pumpToNode(toRead, stream, finish, {
	          end
	        });
	      } else if (isIterable(ret)) {
	        finishCount++;
	        pumpToNode(ret, stream, finish, {
	          end
	        });
	      } else {
	        throw new ERR_INVALID_ARG_TYPE(
	          'val',
	          ['Readable', 'Iterable', 'AsyncIterable', 'ReadableStream', 'TransformStream'],
	          ret
	        )
	      }
	      ret = stream;
	    } else if (isWebStream(stream)) {
	      if (isReadableNodeStream(ret)) {
	        finishCount++;
	        pumpToWeb(makeAsyncIterable(ret), stream, finish, {
	          end
	        });
	      } else if (isReadableStream(ret) || isIterable(ret)) {
	        finishCount++;
	        pumpToWeb(ret, stream, finish, {
	          end
	        });
	      } else if (isTransformStream(ret)) {
	        finishCount++;
	        pumpToWeb(ret.readable, stream, finish, {
	          end
	        });
	      } else {
	        throw new ERR_INVALID_ARG_TYPE(
	          'val',
	          ['Readable', 'Iterable', 'AsyncIterable', 'ReadableStream', 'TransformStream'],
	          ret
	        )
	      }
	      ret = stream;
	    } else {
	      ret = Duplex.from(stream);
	    }
	  }
	  if (
	    (signal !== null && signal !== undefined && signal.aborted) ||
	    (outerSignal !== null && outerSignal !== undefined && outerSignal.aborted)
	  ) {
	    process.nextTick(abort);
	  }
	  return ret
	}
	function pipe(src, dst, finish, { end }) {
	  let ended = false;
	  dst.on('close', () => {
	    if (!ended) {
	      // Finish if the destination closes before the source has completed.
	      finish(new ERR_STREAM_PREMATURE_CLOSE());
	    }
	  });
	  src.pipe(dst, {
	    end: false
	  }); // If end is true we already will have a listener to end dst.

	  if (end) {
	    // Compat. Before node v10.12.0 stdio used to throw an error so
	    // pipe() did/does not end() stdio destinations.
	    // Now they allow it but "secretly" don't close the underlying fd.

	    function endFn() {
	      ended = true;
	      dst.end();
	    }
	    if (isReadableFinished(src)) {
	      // End the destination if the source has already ended.
	      process.nextTick(endFn);
	    } else {
	      src.once('end', endFn);
	    }
	  } else {
	    finish();
	  }
	  eos(
	    src,
	    {
	      readable: true,
	      writable: false
	    },
	    (err) => {
	      const rState = src._readableState;
	      if (
	        err &&
	        err.code === 'ERR_STREAM_PREMATURE_CLOSE' &&
	        rState &&
	        rState.ended &&
	        !rState.errored &&
	        !rState.errorEmitted
	      ) {
	        // Some readable streams will emit 'close' before 'end'. However, since
	        // this is on the readable side 'end' should still be emitted if the
	        // stream has been ended and no error emitted. This should be allowed in
	        // favor of backwards compatibility. Since the stream is piped to a
	        // destination this should not result in any observable difference.
	        // We don't need to check if this is a writable premature close since
	        // eos will only fail with premature close on the reading side for
	        // duplex streams.
	        src.once('end', finish).once('error', finish);
	      } else {
	        finish(err);
	      }
	    }
	  );
	  return eos(
	    dst,
	    {
	      readable: false,
	      writable: true
	    },
	    finish
	  )
	}
	pipeline_1 = {
	  pipelineImpl,
	  pipeline
	};
	return pipeline_1;
}

var compose;
var hasRequiredCompose;

function requireCompose () {
	if (hasRequiredCompose) return compose;
	hasRequiredCompose = 1;

	const { pipeline } = requirePipeline();
	const Duplex = requireDuplex();
	const { destroyer } = requireDestroy();
	const {
	  isNodeStream,
	  isReadable,
	  isWritable,
	  isWebStream,
	  isTransformStream,
	  isWritableStream,
	  isReadableStream
	} = requireUtils();
	const {
	  AbortError,
	  codes: { ERR_INVALID_ARG_VALUE, ERR_MISSING_ARGS }
	} = requireErrors();
	const eos = requireEndOfStream();
	compose = function compose(...streams) {
	  if (streams.length === 0) {
	    throw new ERR_MISSING_ARGS('streams')
	  }
	  if (streams.length === 1) {
	    return Duplex.from(streams[0])
	  }
	  const orgStreams = [...streams];
	  if (typeof streams[0] === 'function') {
	    streams[0] = Duplex.from(streams[0]);
	  }
	  if (typeof streams[streams.length - 1] === 'function') {
	    const idx = streams.length - 1;
	    streams[idx] = Duplex.from(streams[idx]);
	  }
	  for (let n = 0; n < streams.length; ++n) {
	    if (!isNodeStream(streams[n]) && !isWebStream(streams[n])) {
	      // TODO(ronag): Add checks for non streams.
	      continue
	    }
	    if (
	      n < streams.length - 1 &&
	      !(isReadable(streams[n]) || isReadableStream(streams[n]) || isTransformStream(streams[n]))
	    ) {
	      throw new ERR_INVALID_ARG_VALUE(`streams[${n}]`, orgStreams[n], 'must be readable')
	    }
	    if (n > 0 && !(isWritable(streams[n]) || isWritableStream(streams[n]) || isTransformStream(streams[n]))) {
	      throw new ERR_INVALID_ARG_VALUE(`streams[${n}]`, orgStreams[n], 'must be writable')
	    }
	  }
	  let ondrain;
	  let onfinish;
	  let onreadable;
	  let onclose;
	  let d;
	  function onfinished(err) {
	    const cb = onclose;
	    onclose = null;
	    if (cb) {
	      cb(err);
	    } else if (err) {
	      d.destroy(err);
	    } else if (!readable && !writable) {
	      d.destroy();
	    }
	  }
	  const head = streams[0];
	  const tail = pipeline(streams, onfinished);
	  const writable = !!(isWritable(head) || isWritableStream(head) || isTransformStream(head));
	  const readable = !!(isReadable(tail) || isReadableStream(tail) || isTransformStream(tail));

	  // TODO(ronag): Avoid double buffering.
	  // Implement Writable/Readable/Duplex traits.
	  // See, https://github.com/nodejs/node/pull/33515.
	  d = new Duplex({
	    // TODO (ronag): highWaterMark?
	    writableObjectMode: !!(head !== null && head !== undefined && head.writableObjectMode),
	    readableObjectMode: !!(tail !== null && tail !== undefined && tail.readableObjectMode),
	    writable,
	    readable
	  });
	  if (writable) {
	    if (isNodeStream(head)) {
	      d._write = function (chunk, encoding, callback) {
	        if (head.write(chunk, encoding)) {
	          callback();
	        } else {
	          ondrain = callback;
	        }
	      };
	      d._final = function (callback) {
	        head.end();
	        onfinish = callback;
	      };
	      head.on('drain', function () {
	        if (ondrain) {
	          const cb = ondrain;
	          ondrain = null;
	          cb();
	        }
	      });
	    } else if (isWebStream(head)) {
	      const writable = isTransformStream(head) ? head.writable : head;
	      const writer = writable.getWriter();
	      d._write = async function (chunk, encoding, callback) {
	        try {
	          await writer.ready;
	          writer.write(chunk).catch(() => {});
	          callback();
	        } catch (err) {
	          callback(err);
	        }
	      };
	      d._final = async function (callback) {
	        try {
	          await writer.ready;
	          writer.close().catch(() => {});
	          onfinish = callback;
	        } catch (err) {
	          callback(err);
	        }
	      };
	    }
	    const toRead = isTransformStream(tail) ? tail.readable : tail;
	    eos(toRead, () => {
	      if (onfinish) {
	        const cb = onfinish;
	        onfinish = null;
	        cb();
	      }
	    });
	  }
	  if (readable) {
	    if (isNodeStream(tail)) {
	      tail.on('readable', function () {
	        if (onreadable) {
	          const cb = onreadable;
	          onreadable = null;
	          cb();
	        }
	      });
	      tail.on('end', function () {
	        d.push(null);
	      });
	      d._read = function () {
	        while (true) {
	          const buf = tail.read();
	          if (buf === null) {
	            onreadable = d._read;
	            return
	          }
	          if (!d.push(buf)) {
	            return
	          }
	        }
	      };
	    } else if (isWebStream(tail)) {
	      const readable = isTransformStream(tail) ? tail.readable : tail;
	      const reader = readable.getReader();
	      d._read = async function () {
	        while (true) {
	          try {
	            const { value, done } = await reader.read();
	            if (!d.push(value)) {
	              return
	            }
	            if (done) {
	              d.push(null);
	              return
	            }
	          } catch {
	            return
	          }
	        }
	      };
	    }
	  }
	  d._destroy = function (err, callback) {
	    if (!err && onclose !== null) {
	      err = new AbortError();
	    }
	    onreadable = null;
	    ondrain = null;
	    onfinish = null;
	    if (onclose === null) {
	      callback(err);
	    } else {
	      onclose = callback;
	      if (isNodeStream(tail)) {
	        destroyer(tail, err);
	      }
	    }
	  };
	  return d
	};
	return compose;
}

var hasRequiredOperators;

function requireOperators () {
	if (hasRequiredOperators) return operators;
	hasRequiredOperators = 1;

	const AbortController = globalThis.AbortController || requireBrowser$2().AbortController;
	const {
	  codes: { ERR_INVALID_ARG_VALUE, ERR_INVALID_ARG_TYPE, ERR_MISSING_ARGS, ERR_OUT_OF_RANGE },
	  AbortError
	} = requireErrors();
	const { validateAbortSignal, validateInteger, validateObject } = requireValidators();
	const kWeakHandler = requirePrimordials().Symbol('kWeak');
	const kResistStopPropagation = requirePrimordials().Symbol('kResistStopPropagation');
	const { finished } = requireEndOfStream();
	const staticCompose = requireCompose();
	const { addAbortSignalNoValidate } = requireAddAbortSignal();
	const { isWritable, isNodeStream } = requireUtils();
	const { deprecate } = requireUtil();
	const {
	  ArrayPrototypePush,
	  Boolean,
	  MathFloor,
	  Number,
	  NumberIsNaN,
	  Promise,
	  PromiseReject,
	  PromiseResolve,
	  PromisePrototypeThen,
	  Symbol
	} = requirePrimordials();
	const kEmpty = Symbol('kEmpty');
	const kEof = Symbol('kEof');
	function compose(stream, options) {
	  if (options != null) {
	    validateObject(options, 'options');
	  }
	  if ((options === null || options === undefined ? undefined : options.signal) != null) {
	    validateAbortSignal(options.signal, 'options.signal');
	  }
	  if (isNodeStream(stream) && !isWritable(stream)) {
	    throw new ERR_INVALID_ARG_VALUE('stream', stream, 'must be writable')
	  }
	  const composedStream = staticCompose(this, stream);
	  if (options !== null && options !== undefined && options.signal) {
	    // Not validating as we already validated before
	    addAbortSignalNoValidate(options.signal, composedStream);
	  }
	  return composedStream
	}
	function map(fn, options) {
	  if (typeof fn !== 'function') {
	    throw new ERR_INVALID_ARG_TYPE('fn', ['Function', 'AsyncFunction'], fn)
	  }
	  if (options != null) {
	    validateObject(options, 'options');
	  }
	  if ((options === null || options === undefined ? undefined : options.signal) != null) {
	    validateAbortSignal(options.signal, 'options.signal');
	  }
	  let concurrency = 1;
	  if ((options === null || options === undefined ? undefined : options.concurrency) != null) {
	    concurrency = MathFloor(options.concurrency);
	  }
	  let highWaterMark = concurrency - 1;
	  if ((options === null || options === undefined ? undefined : options.highWaterMark) != null) {
	    highWaterMark = MathFloor(options.highWaterMark);
	  }
	  validateInteger(concurrency, 'options.concurrency', 1);
	  validateInteger(highWaterMark, 'options.highWaterMark', 0);
	  highWaterMark += concurrency;
	  return async function* map() {
	    const signal = requireUtil().AbortSignalAny(
	      [options === null || options === undefined ? undefined : options.signal].filter(Boolean)
	    );
	    const stream = this;
	    const queue = [];
	    const signalOpt = {
	      signal
	    };
	    let next;
	    let resume;
	    let done = false;
	    let cnt = 0;
	    function onCatch() {
	      done = true;
	      afterItemProcessed();
	    }
	    function afterItemProcessed() {
	      cnt -= 1;
	      maybeResume();
	    }
	    function maybeResume() {
	      if (resume && !done && cnt < concurrency && queue.length < highWaterMark) {
	        resume();
	        resume = null;
	      }
	    }
	    async function pump() {
	      try {
	        for await (let val of stream) {
	          if (done) {
	            return
	          }
	          if (signal.aborted) {
	            throw new AbortError()
	          }
	          try {
	            val = fn(val, signalOpt);
	            if (val === kEmpty) {
	              continue
	            }
	            val = PromiseResolve(val);
	          } catch (err) {
	            val = PromiseReject(err);
	          }
	          cnt += 1;
	          PromisePrototypeThen(val, afterItemProcessed, onCatch);
	          queue.push(val);
	          if (next) {
	            next();
	            next = null;
	          }
	          if (!done && (queue.length >= highWaterMark || cnt >= concurrency)) {
	            await new Promise((resolve) => {
	              resume = resolve;
	            });
	          }
	        }
	        queue.push(kEof);
	      } catch (err) {
	        const val = PromiseReject(err);
	        PromisePrototypeThen(val, afterItemProcessed, onCatch);
	        queue.push(val);
	      } finally {
	        done = true;
	        if (next) {
	          next();
	          next = null;
	        }
	      }
	    }
	    pump();
	    try {
	      while (true) {
	        while (queue.length > 0) {
	          const val = await queue[0];
	          if (val === kEof) {
	            return
	          }
	          if (signal.aborted) {
	            throw new AbortError()
	          }
	          if (val !== kEmpty) {
	            yield val;
	          }
	          queue.shift();
	          maybeResume();
	        }
	        await new Promise((resolve) => {
	          next = resolve;
	        });
	      }
	    } finally {
	      done = true;
	      if (resume) {
	        resume();
	        resume = null;
	      }
	    }
	  }.call(this)
	}
	function asIndexedPairs(options = undefined) {
	  if (options != null) {
	    validateObject(options, 'options');
	  }
	  if ((options === null || options === undefined ? undefined : options.signal) != null) {
	    validateAbortSignal(options.signal, 'options.signal');
	  }
	  return async function* asIndexedPairs() {
	    let index = 0;
	    for await (const val of this) {
	      var _options$signal;
	      if (
	        options !== null &&
	        options !== undefined &&
	        (_options$signal = options.signal) !== null &&
	        _options$signal !== undefined &&
	        _options$signal.aborted
	      ) {
	        throw new AbortError({
	          cause: options.signal.reason
	        })
	      }
	      yield [index++, val];
	    }
	  }.call(this)
	}
	async function some(fn, options = undefined) {
	  for await (const unused of filter.call(this, fn, options)) {
	    return true
	  }
	  return false
	}
	async function every(fn, options = undefined) {
	  if (typeof fn !== 'function') {
	    throw new ERR_INVALID_ARG_TYPE('fn', ['Function', 'AsyncFunction'], fn)
	  }
	  // https://en.wikipedia.org/wiki/De_Morgan%27s_laws
	  return !(await some.call(
	    this,
	    async (...args) => {
	      return !(await fn(...args))
	    },
	    options
	  ))
	}
	async function find(fn, options) {
	  for await (const result of filter.call(this, fn, options)) {
	    return result
	  }
	  return undefined
	}
	async function forEach(fn, options) {
	  if (typeof fn !== 'function') {
	    throw new ERR_INVALID_ARG_TYPE('fn', ['Function', 'AsyncFunction'], fn)
	  }
	  async function forEachFn(value, options) {
	    await fn(value, options);
	    return kEmpty
	  }
	  // eslint-disable-next-line no-unused-vars
	  for await (const unused of map.call(this, forEachFn, options));
	}
	function filter(fn, options) {
	  if (typeof fn !== 'function') {
	    throw new ERR_INVALID_ARG_TYPE('fn', ['Function', 'AsyncFunction'], fn)
	  }
	  async function filterFn(value, options) {
	    if (await fn(value, options)) {
	      return value
	    }
	    return kEmpty
	  }
	  return map.call(this, filterFn, options)
	}

	// Specific to provide better error to reduce since the argument is only
	// missing if the stream has no items in it - but the code is still appropriate
	class ReduceAwareErrMissingArgs extends ERR_MISSING_ARGS {
	  constructor() {
	    super('reduce');
	    this.message = 'Reduce of an empty stream requires an initial value';
	  }
	}
	async function reduce(reducer, initialValue, options) {
	  var _options$signal2;
	  if (typeof reducer !== 'function') {
	    throw new ERR_INVALID_ARG_TYPE('reducer', ['Function', 'AsyncFunction'], reducer)
	  }
	  if (options != null) {
	    validateObject(options, 'options');
	  }
	  if ((options === null || options === undefined ? undefined : options.signal) != null) {
	    validateAbortSignal(options.signal, 'options.signal');
	  }
	  let hasInitialValue = arguments.length > 1;
	  if (
	    options !== null &&
	    options !== undefined &&
	    (_options$signal2 = options.signal) !== null &&
	    _options$signal2 !== undefined &&
	    _options$signal2.aborted
	  ) {
	    const err = new AbortError(undefined, {
	      cause: options.signal.reason
	    });
	    this.once('error', () => {}); // The error is already propagated
	    await finished(this.destroy(err));
	    throw err
	  }
	  const ac = new AbortController();
	  const signal = ac.signal;
	  if (options !== null && options !== undefined && options.signal) {
	    const opts = {
	      once: true,
	      [kWeakHandler]: this,
	      [kResistStopPropagation]: true
	    };
	    options.signal.addEventListener('abort', () => ac.abort(), opts);
	  }
	  let gotAnyItemFromStream = false;
	  try {
	    for await (const value of this) {
	      var _options$signal3;
	      gotAnyItemFromStream = true;
	      if (
	        options !== null &&
	        options !== undefined &&
	        (_options$signal3 = options.signal) !== null &&
	        _options$signal3 !== undefined &&
	        _options$signal3.aborted
	      ) {
	        throw new AbortError()
	      }
	      if (!hasInitialValue) {
	        initialValue = value;
	        hasInitialValue = true;
	      } else {
	        initialValue = await reducer(initialValue, value, {
	          signal
	        });
	      }
	    }
	    if (!gotAnyItemFromStream && !hasInitialValue) {
	      throw new ReduceAwareErrMissingArgs()
	    }
	  } finally {
	    ac.abort();
	  }
	  return initialValue
	}
	async function toArray(options) {
	  if (options != null) {
	    validateObject(options, 'options');
	  }
	  if ((options === null || options === undefined ? undefined : options.signal) != null) {
	    validateAbortSignal(options.signal, 'options.signal');
	  }
	  const result = [];
	  for await (const val of this) {
	    var _options$signal4;
	    if (
	      options !== null &&
	      options !== undefined &&
	      (_options$signal4 = options.signal) !== null &&
	      _options$signal4 !== undefined &&
	      _options$signal4.aborted
	    ) {
	      throw new AbortError(undefined, {
	        cause: options.signal.reason
	      })
	    }
	    ArrayPrototypePush(result, val);
	  }
	  return result
	}
	function flatMap(fn, options) {
	  const values = map.call(this, fn, options);
	  return async function* flatMap() {
	    for await (const val of values) {
	      yield* val;
	    }
	  }.call(this)
	}
	function toIntegerOrInfinity(number) {
	  // We coerce here to align with the spec
	  // https://github.com/tc39/proposal-iterator-helpers/issues/169
	  number = Number(number);
	  if (NumberIsNaN(number)) {
	    return 0
	  }
	  if (number < 0) {
	    throw new ERR_OUT_OF_RANGE('number', '>= 0', number)
	  }
	  return number
	}
	function drop(number, options = undefined) {
	  if (options != null) {
	    validateObject(options, 'options');
	  }
	  if ((options === null || options === undefined ? undefined : options.signal) != null) {
	    validateAbortSignal(options.signal, 'options.signal');
	  }
	  number = toIntegerOrInfinity(number);
	  return async function* drop() {
	    var _options$signal5;
	    if (
	      options !== null &&
	      options !== undefined &&
	      (_options$signal5 = options.signal) !== null &&
	      _options$signal5 !== undefined &&
	      _options$signal5.aborted
	    ) {
	      throw new AbortError()
	    }
	    for await (const val of this) {
	      var _options$signal6;
	      if (
	        options !== null &&
	        options !== undefined &&
	        (_options$signal6 = options.signal) !== null &&
	        _options$signal6 !== undefined &&
	        _options$signal6.aborted
	      ) {
	        throw new AbortError()
	      }
	      if (number-- <= 0) {
	        yield val;
	      }
	    }
	  }.call(this)
	}
	function take(number, options = undefined) {
	  if (options != null) {
	    validateObject(options, 'options');
	  }
	  if ((options === null || options === undefined ? undefined : options.signal) != null) {
	    validateAbortSignal(options.signal, 'options.signal');
	  }
	  number = toIntegerOrInfinity(number);
	  return async function* take() {
	    var _options$signal7;
	    if (
	      options !== null &&
	      options !== undefined &&
	      (_options$signal7 = options.signal) !== null &&
	      _options$signal7 !== undefined &&
	      _options$signal7.aborted
	    ) {
	      throw new AbortError()
	    }
	    for await (const val of this) {
	      var _options$signal8;
	      if (
	        options !== null &&
	        options !== undefined &&
	        (_options$signal8 = options.signal) !== null &&
	        _options$signal8 !== undefined &&
	        _options$signal8.aborted
	      ) {
	        throw new AbortError()
	      }
	      if (number-- > 0) {
	        yield val;
	      }

	      // Don't get another item from iterator in case we reached the end
	      if (number <= 0) {
	        return
	      }
	    }
	  }.call(this)
	}
	operators.streamReturningOperators = {
	  asIndexedPairs: deprecate(asIndexedPairs, 'readable.asIndexedPairs will be removed in a future version.'),
	  drop,
	  filter,
	  flatMap,
	  map,
	  take,
	  compose
	};
	operators.promiseReturningOperators = {
	  every,
	  forEach,
	  reduce,
	  toArray,
	  some,
	  find
	};
	return operators;
}

var promises;
var hasRequiredPromises;

function requirePromises () {
	if (hasRequiredPromises) return promises;
	hasRequiredPromises = 1;

	const { ArrayPrototypePop, Promise } = requirePrimordials();
	const { isIterable, isNodeStream, isWebStream } = requireUtils();
	const { pipelineImpl: pl } = requirePipeline();
	const { finished } = requireEndOfStream();
	requireStream();
	function pipeline(...streams) {
	  return new Promise((resolve, reject) => {
	    let signal;
	    let end;
	    const lastArg = streams[streams.length - 1];
	    if (
	      lastArg &&
	      typeof lastArg === 'object' &&
	      !isNodeStream(lastArg) &&
	      !isIterable(lastArg) &&
	      !isWebStream(lastArg)
	    ) {
	      const options = ArrayPrototypePop(streams);
	      signal = options.signal;
	      end = options.end;
	    }
	    pl(
	      streams,
	      (err, value) => {
	        if (err) {
	          reject(err);
	        } else {
	          resolve(value);
	        }
	      },
	      {
	        signal,
	        end
	      }
	    );
	  })
	}
	promises = {
	  finished,
	  pipeline
	};
	return promises;
}

var hasRequiredStream;

function requireStream () {
	if (hasRequiredStream) return stream.exports;
	hasRequiredStream = 1;

	/* replacement start */

	const { Buffer } = requireBuffer();

	/* replacement end */

	const { ObjectDefineProperty, ObjectKeys, ReflectApply } = requirePrimordials();
	const {
	  promisify: { custom: customPromisify }
	} = requireUtil();
	const { streamReturningOperators, promiseReturningOperators } = requireOperators();
	const {
	  codes: { ERR_ILLEGAL_CONSTRUCTOR }
	} = requireErrors();
	const compose = requireCompose();
	const { setDefaultHighWaterMark, getDefaultHighWaterMark } = requireState();
	const { pipeline } = requirePipeline();
	const { destroyer } = requireDestroy();
	const eos = requireEndOfStream();
	const promises = requirePromises();
	const utils = requireUtils();
	const Stream = (stream.exports = requireLegacy().Stream);
	Stream.isDestroyed = utils.isDestroyed;
	Stream.isDisturbed = utils.isDisturbed;
	Stream.isErrored = utils.isErrored;
	Stream.isReadable = utils.isReadable;
	Stream.isWritable = utils.isWritable;
	Stream.Readable = requireReadable();
	for (const key of ObjectKeys(streamReturningOperators)) {
	  const op = streamReturningOperators[key];
	  function fn(...args) {
	    if (new.target) {
	      throw ERR_ILLEGAL_CONSTRUCTOR()
	    }
	    return Stream.Readable.from(ReflectApply(op, this, args))
	  }
	  ObjectDefineProperty(fn, 'name', {
	    __proto__: null,
	    value: op.name
	  });
	  ObjectDefineProperty(fn, 'length', {
	    __proto__: null,
	    value: op.length
	  });
	  ObjectDefineProperty(Stream.Readable.prototype, key, {
	    __proto__: null,
	    value: fn,
	    enumerable: false,
	    configurable: true,
	    writable: true
	  });
	}
	for (const key of ObjectKeys(promiseReturningOperators)) {
	  const op = promiseReturningOperators[key];
	  function fn(...args) {
	    if (new.target) {
	      throw ERR_ILLEGAL_CONSTRUCTOR()
	    }
	    return ReflectApply(op, this, args)
	  }
	  ObjectDefineProperty(fn, 'name', {
	    __proto__: null,
	    value: op.name
	  });
	  ObjectDefineProperty(fn, 'length', {
	    __proto__: null,
	    value: op.length
	  });
	  ObjectDefineProperty(Stream.Readable.prototype, key, {
	    __proto__: null,
	    value: fn,
	    enumerable: false,
	    configurable: true,
	    writable: true
	  });
	}
	Stream.Writable = requireWritable();
	Stream.Duplex = requireDuplex();
	Stream.Transform = requireTransform();
	Stream.PassThrough = requirePassthrough();
	Stream.pipeline = pipeline;
	const { addAbortSignal } = requireAddAbortSignal();
	Stream.addAbortSignal = addAbortSignal;
	Stream.finished = eos;
	Stream.destroy = destroyer;
	Stream.compose = compose;
	Stream.setDefaultHighWaterMark = setDefaultHighWaterMark;
	Stream.getDefaultHighWaterMark = getDefaultHighWaterMark;
	ObjectDefineProperty(Stream, 'promises', {
	  __proto__: null,
	  configurable: true,
	  enumerable: true,
	  get() {
	    return promises
	  }
	});
	ObjectDefineProperty(pipeline, customPromisify, {
	  __proto__: null,
	  enumerable: true,
	  get() {
	    return promises.pipeline
	  }
	});
	ObjectDefineProperty(eos, customPromisify, {
	  __proto__: null,
	  enumerable: true,
	  get() {
	    return promises.finished
	  }
	});

	// Backwards-compat with node 0.4.x
	Stream.Stream = Stream;
	Stream._isUint8Array = function isUint8Array(value) {
	  return value instanceof Uint8Array
	};
	Stream._uint8ArrayToBuffer = function _uint8ArrayToBuffer(chunk) {
	  return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
	};
	return stream.exports;
}

var hasRequiredBrowser;

function requireBrowser () {
	if (hasRequiredBrowser) return browser$2.exports;
	hasRequiredBrowser = 1;
	(function (module) {

		const CustomStream = requireStream();
		const promises = requirePromises();
		const originalDestroy = CustomStream.Readable.destroy;
		module.exports = CustomStream.Readable;

		// Explicit export naming is needed for ESM
		module.exports._uint8ArrayToBuffer = CustomStream._uint8ArrayToBuffer;
		module.exports._isUint8Array = CustomStream._isUint8Array;
		module.exports.isDisturbed = CustomStream.isDisturbed;
		module.exports.isErrored = CustomStream.isErrored;
		module.exports.isReadable = CustomStream.isReadable;
		module.exports.Readable = CustomStream.Readable;
		module.exports.Writable = CustomStream.Writable;
		module.exports.Duplex = CustomStream.Duplex;
		module.exports.Transform = CustomStream.Transform;
		module.exports.PassThrough = CustomStream.PassThrough;
		module.exports.addAbortSignal = CustomStream.addAbortSignal;
		module.exports.finished = CustomStream.finished;
		module.exports.destroy = CustomStream.destroy;
		module.exports.destroy = originalDestroy;
		module.exports.pipeline = CustomStream.pipeline;
		module.exports.compose = CustomStream.compose;
		Object.defineProperty(CustomStream, 'promises', {
		  configurable: true,
		  enumerable: true,
		  get() {
		    return promises
		  }
		});
		module.exports.Stream = CustomStream.Stream;

		// Allow default importing
		module.exports.default = module.exports; 
	} (browser$2));
	return browser$2.exports;
}

var browserExports = requireBrowser();

// **N3Store** objects store N3 quads by graph in memory.

const ITERATOR = Symbol('iter');
const SIZE = Symbol('size');

// Neither a registration nor its cleanup record may keep a view or store alive.
// Initialize lazily so importing N3 and using lazy views needs no weak-reference APIs.
let observerRegistry;
function finalizeObserver({ store, observer }) {
  const target = store.deref();
  if (target)
    target._removeObserver(observer);
}

function hasInIndex(index0, key0, key1, key2) {
  const index1 = index0 && index0[key0];
  const index2 = index1 && index1[key1];
  return !!index2 && key2 in index2;
}

// Returns the key of a term in the entity index.
// Keys mark the term type by their first character, so the IRI of a named node
// that starts with such a marker (as relative IRIs can) is wrapped in < and >.
const markedIRI = /^[?_"[.<]/;
function entityKey(term) {
  // Strings are term ids, which only need wrapping when they are IRIs starting with < or .
  if (typeof term === 'string') {
    const first = term.charCodeAt(0);
    return first !== 0x3C && first !== 0x2E || term === '<>' ? term : `<${term}>`;
  }
  // IDs of IRIs usually start with a lowercase scheme letter, which never marks a term type
  const id = termToId(term);
  if (id.charCodeAt(0) >= 0x61 || !term)
    return id;
  // Keys of quoted triples are built from the keys of their components
  if (term.termType === 'Quad')
    return JSON.stringify(quadKeyParts(term));
  return term.termType !== 'NamedNode' || !markedIRI.test(term.value) ? id : `<${term.value}>`;
}

// Returns the keys of the components of a quad, nested like the parts of its internal id
function quadKeyParts(quad) {
  const parts = [nestedKey(quad.subject), nestedKey(quad.predicate), nestedKey(quad.object)];
  if (quad.graph && !isDefaultGraph(quad.graph))
    parts.push(nestedKey(quad.graph));
  return parts;
}
function nestedKey(term) {
  return term.termType === 'Quad' ? quadKeyParts(term) : entityKey(term);
}

// ## Constructor
class N3EntityIndex {
  constructor(options = {}) {
    this._id = 1;
    // `_ids` maps entities such as `http://xmlns.com/foaf/0.1/name` to numbers,
    // saving memory by using only numbers as keys in `_graphs`
    this._ids = Object.create(null);
    this._ids[''] = 1;
     // inverse of `_ids`
    this._entities = Object.create(null);
    this._entities[1] = '';
    // `_blankNodeIndex` is the index of the last automatically named blank node
    this._blankNodeIndex = 0;
    this._factory = options.factory || DataFactory;
  }

  _termFromId(id) {
    // A key in < and > is a named node
    if (id[0] === '<')
      return this._factory.namedNode(id.substring(1, id.length - 1));
    // A key starting with . is a quoted triple
    if (id[0] === '.') {
      const entities = this._entities;
      const terms = id.split('.');
      const q = this._factory.quad(
        this._termFromId(entities[terms[1]]),
        this._termFromId(entities[terms[2]]),
        this._termFromId(entities[terms[3]]),
        terms[4] && this._termFromId(entities[terms[4]]),
      );
      return q;
    }
    return termFromId(id, this._factory);
  }

  _termToNumericId(term) {
    if (term.termType === 'Quad') {
      const s = this._termToNumericId(term.subject),
          p = this._termToNumericId(term.predicate),
          o = this._termToNumericId(term.object);
      let g;

      return s && p && o && (isDefaultGraph(term.graph) || (g = this._termToNumericId(term.graph))) &&
        this._ids[g ? `.${s}.${p}.${o}.${g}` : `.${s}.${p}.${o}`];
    }
    return typeof term === 'string' ? this._stringToNumericId(term) : this._ids[entityKey(term)];
  }

  // Returns the numeric id of a term given as a string id
  _stringToNumericId(term) {
    // The string is the key unless it is an IRI starting with < (which starts the keys of
    // wrapped IRIs) or . (which starts the keys of quoted triples). Read the first character
    // from the stored key after a match, which is cheaper than from a concatenated string.
    const id = this._ids[term];
    const first = id ? this._entities[id].charCodeAt(0) : term.charCodeAt(0);
    if (first !== 0x3C && first !== 0x2E)
      return id;
    return term === '<>' ? id : this._ids[`<${term}>`];
  }

  _termToNewNumericId(term) {
    if (typeof term === 'string')
      return this._stringToNumericId(term) || this._addEntity(entityKey(term));
    // This assumes that no graph term is present - we may wish to error if there is one
    const str = term && term.termType === 'Quad' ?
      `.${this._termToNewNumericId(term.subject)}.${this._termToNewNumericId(term.predicate)}.${this._termToNewNumericId(term.object)}${
        isDefaultGraph(term.graph) ? '' : `.${this._termToNewNumericId(term.graph)}`
      }`
      : entityKey(term);

    return this._ids[str] || this._addEntity(str);
  }

  _addEntity(key) {
    return this._ids[this._entities[++this._id] = key] = this._id;
  }

  createBlankNode(suggestedName) {
    let name, index;
    // Generate a name based on the suggested name
    if (suggestedName) {
      name = suggestedName = `_:${suggestedName}`, index = 1;
      while (this._ids[name])
        name = suggestedName + index++;
    }
    // Generate a generic blank node name
    else {
      do { name = `_:b${this._blankNodeIndex++}`; }
      while (this._ids[name]);
    }
    // Add the blank node to the entities, avoiding the generation of duplicates
    this._ids[name] = ++this._id;
    this._entities[this._id] = name;
    return this._factory.blankNode(name.substr(2));
  }
}

// Returns the size of a store from this copy of N3 if it is known without counting,
// or null otherwise
function knownSize(dataset) {
  return dataset instanceof N3Store ? dataset._size : null;
}

// ## Constructor
class N3Store {
  constructor(quads, options) {
    // The number of quads is initially zero
    this._size = 0;
    // `_graphs` contains subject, predicate, and object indexes per graph
    this._graphs = Object.create(null);
    this._graphCount = 0;
    // `_observers` contains weak references to views notified before every mutation
    this._observers = null;

    // Shift parameters if `quads` is not given
    if (!options && quads && !quads[0] && !(typeof quads.match === 'function'))
      options = quads, quads = null;
    options = options || {};
    this._factory = options.factory || DataFactory;
    this._matchSemantics = validateMatchSemantics(options.matchSemantics);
    this._entityIndex = options.entityIndex || new N3EntityIndex({ factory: this._factory });
    this._entities = this._entityIndex._entities;
    this._termFromId = this._entityIndex._termFromId.bind(this._entityIndex);
    this._termToNumericId = this._entityIndex._termToNumericId.bind(this._entityIndex);
    this._termToNewNumericId = this._entityIndex._termToNewNumericId.bind(this._entityIndex);

    // Add quads if passed
    if (quads)
      this.addAll(quads);
  }

  // ## Public properties

  // ### `size` returns the number of quads in the store
  get size() {
    // The quad count is kept up to date by every change,
    // except by reasoners from earlier versions of N3, which set it to null
    if (this._size === null)
      this._size = this.countQuads();
    return this._size;
  }

  // ## Private methods

  // ### `_addToIndex` adds a quad to a three-layered index.
  // Returns if the index has changed, if the entry did not already exist.
  _addToIndex(index0, key0, key1, key2) {
    // Create layers as necessary, maintaining their entry counters
    let index1 = index0[key0];
    if (!index1) {
      index0[key0] = index1 = { [SIZE]: 0 };
      index0[SIZE]++;
    }
    let index2 = index1[key1];
    if (!index2) {
      index1[key1] = index2 = { [SIZE]: 0 };
      index1[SIZE]++;
    }
    // Setting the key to _any_ value signals the presence of the quad
    const existed = key2 in index2;
    if (!existed) {
      index2[key2] = null;
      index2[SIZE]++;
    }
    return !existed;
  }

  // ### `_removeFromIndex` removes a quad from a three-layered index
  _removeFromIndex(index0, key0, key1, key2) {
    // Remove the quad from the index
    const index1 = index0[key0], index2 = index1[key1];
    delete index2[key2];

    // Remove intermediary index layers if they are empty,
    // which the entry counters detect in constant time
    if (--index2[SIZE] !== 0) return;
    delete index1[key1];
    if (--index1[SIZE] !== 0) return;
    delete index0[key0];
    index0[SIZE]--;
  }

  // ### `_findInIndex` finds a set of quads in a three-layered index.
  // The index base is `index0` and the keys at each level are `key0`, `key1`, and `key2`.
  // A key and any keys after it can be null or undefined, which is interpreted as a wildcard.
  // `name0`, `name1`, and `name2` are the names of the keys at each level,
  // used when reconstructing the resulting quad
  // (for instance: _subject_, _predicate_, and _object_).
  // Finally, `graphId` will be the graph of the created quads.
  *_findInIndex(index0, key0, key1, key2, name0, name1, name2, graphId) {
    const entityKeys = this._entities;
    const graph = this._termFromId(entityKeys[graphId]);
    const parts = { subject: null, predicate: null, object: null };

    // Exact matches avoid allocating key arrays or entering generic loops.
    if (key2) {
      const index1 = index0[key0];
      const index2 = index1 && index1[key1];
      if (!index2 || !(key2 in index2))
        return;
      parts[name0] = this._termFromId(entityKeys[key0]);
      parts[name1] = this._termFromId(entityKeys[key1]);
      parts[name2] = this._termFromId(entityKeys[key2]);
      yield this._factory.quad(parts.subject, parts.predicate, parts.object, graph);
      return;
    }

    if (key0 && !(key0 in index0))
      return;
    // A null key list stops after visiting a bound key, avoiding a one-item array.
    const keys0 = key0 ? null : Object.keys(index0);
    for (let i0 = 0, value0 = key0 || keys0[0]; value0;
         value0 = keys0 && keys0[++i0]) {
      // Mutations can remove keys captured before an earlier yield.
      const index1 = index0[value0];
      if (!index1) continue; // eslint-disable-line no-continue
      parts[name0] = this._termFromId(entityKeys[value0]);

      if (key1 && !(key1 in index1))
        return;
      const keys1 = key1 ? null : Object.keys(index1);
      for (let i1 = 0, value1 = key1 || keys1[0]; value1;
           value1 = keys1 && keys1[++i1]) {
        const index2 = index1[value1];
        if (!index2) continue; // eslint-disable-line no-continue
        parts[name1] = this._termFromId(entityKeys[value1]);
        const values = Object.keys(index2);
        for (let l = 0; l < values.length; l++) {
          parts[name2] = this._termFromId(entityKeys[values[l]]);
          yield this._factory.quad(parts.subject, parts.predicate, parts.object, graph);
        }
      }
    }
  }

  // ### `_loop` executes the callback on all keys of index 0
  _loop(index0, callback) {
    for (const key0 in index0)
      callback(key0);
  }

  // ### `_loopByKey0` executes the callback on all keys of a certain entry in index 0
  _loopByKey0(index0, key0, callback) {
    let index1, key1;
    if (index1 = index0[key0]) {
      for (key1 in index1)
        callback(key1);
    }
  }

  // ### `_loopByKey1` executes the callback on given keys of all entries in index 0
  _loopByKey1(index0, key1, callback) {
    let key0, index1;
    for (key0 in index0) {
      index1 = index0[key0];
      if (index1[key1])
        callback(key0);
    }
  }

  // ### `_loopBy2Keys` executes the callback on given keys of certain entries in index 2
  _loopBy2Keys(index0, key0, key1, callback) {
    let index1, index2, key2;
    if ((index1 = index0[key0]) && (index2 = index1[key1])) {
      for (key2 in index2)
        callback(key2);
    }
  }

  // ### `_loopByKey0Deep` executes the callback on all keys of index 2
  // for a certain entry in index 0, possibly repeating keys
  _loopByKey0Deep(index0, key0, callback) {
    let index1, index2, key1, key2;
    if (index1 = index0[key0]) {
      for (key1 in index1) {
        index2 = index1[key1];
        for (key2 in index2)
          callback(key2);
      }
    }
  }

  // ### `_countInIndex` counts matching quads in a three-layered index.
  // The index base is `index0` and the keys at each level are `key0`, `key1`, and `key2`.
  // A key and any keys after it can be null or undefined, which is interpreted as a wildcard.
  _countInIndex(index0, key0, key1, key2) {
    let count = 0, index1, index2;

    // Bound outer keys can be looked up directly.
    if (key0) {
      if (!(index1 = index0[key0]))
        return 0;
      if (key1) {
        if (!(index2 = index1[key1]))
          return 0;
        return key2 ? (key2 in index2 ? 1 : 0) : index2[SIZE];
      }

      const keys1 = Object.keys(index1);
      for (let i1 = 0; i1 < keys1.length; i1++)
        count += index1[keys1[i1]][SIZE];
      return count;
    }

    const keys0 = Object.keys(index0);
    for (let i0 = 0; i0 < keys0.length; i0++) {
      index1 = index0[keys0[i0]];
      const keys1 = Object.keys(index1);
      for (let i1 = 0; i1 < keys1.length; i1++)
        count += index1[keys1[i1]][SIZE];
    }
    return count;
  }

  // ### `_getGraphs` returns an array with the given graph,
  // or all graphs if the argument is null or undefined.
  _getGraphs(graph) {
    graph = graph === '' ? 1 : (graph && (this._termToNumericId(graph) || -1));
    return typeof graph !== 'number' ? this._graphs : { [graph]: this._graphs[graph] };
  }

  // ### `_addObserver` registers a mutation observer.
  _addObserver(view) {
    const observer = new WeakRef(view);
    const registry = observerRegistry || (observerRegistry = new FinalizationRegistry(finalizeObserver));
    registry.register(view, { store: new WeakRef(this), observer }, observer);
    (this._observers || (this._observers = new Set())).add(observer);
    return observer;
  }

  // ### `_removeObserver` unregisters a mutation observer.
  _removeObserver(observer) {
    observerRegistry.unregister(observer);
    if (this._observers) {
      this._observers.delete(observer);
      if (this._observers.size === 0)
        this._observers = null;
    }
  }

  // ### `_notifyObservers` notifies observers of a mutation.
  _notifyObservers(subjectId, predicateId, objectId, graphId, added) {
    // Observers can remove themselves during Set iteration
    for (const observer of this._observers) {
      const view = observer.deref();
      if (view)
        view._onParentMutation(subjectId, predicateId, objectId, graphId, added);
      else
        // Finalization may be delayed; also prune collected views during notification.
        this._removeObserver(observer);
    }
  }

  // ### `_uniqueEntities` returns a function that accepts an entity ID
  // and passes the corresponding entity to callback if it hasn't occurred before.
  _uniqueEntities(callback) {
    const uniqueIds = Object.create(null);
    return id => {
      if (!(id in uniqueIds)) {
        uniqueIds[id] = true;
        callback(this._termFromId(this._entities[id], this._factory));
      }
    };
  }

  // ## Public methods

  // ### `add` adds the specified quad to the dataset.
  // Returns the dataset instance it was called on.
  // Existing quads, as defined in Quad.equals, will be ignored.
  add(quad) {
    this.addQuad(quad);
    return this;
  }

  // ### `addQuad` adds a new quad to the store.
  // Returns if the quad index has changed, if the quad did not already exist.
  addQuad(subject, predicate, object, graph) {
    // Shift arguments if a quad object is given instead of components
    if (!predicate)
      graph = subject.graph, object = subject.object,
        predicate = subject.predicate, subject = subject.subject;

    // Convert terms to internal string representation
    graph = graph ? this._termToNewNumericId(graph) : 1;

    // Map long IRIs to shared numeric identifiers before updating the indexes.
    subject   = this._termToNewNumericId(subject);
    predicate = this._termToNewNumericId(predicate);
    object    = this._termToNewNumericId(object);
    return this._addQuad(subject, predicate, object, graph);
  }

  // ### `_addQuad` adds a quad using identifiers from this store's entity index.
  _addQuad(subject, predicate, object, graph) {
    // Find the graph that will contain the triple
    let graphItem = this._graphs[graph];
    // Create the graph if it doesn't exist yet
    if (!graphItem) {
      graphItem = this._graphs[graph] = {
        subjects: { [SIZE]: 0 },
        predicates: { [SIZE]: 0 },
        objects: { [SIZE]: 0 },
      };
      // Freezing a graph helps subsequent `add` performance,
      // and properties will never be modified anyway
      Object.freeze(graphItem);
      this._graphCount++;
    }

    // Notify observers before inserting a new quad so snapshots retain their prior contents
    if (this._observers !== null) {
      if (hasInIndex(graphItem.subjects, subject, predicate, object))
        return false;
      this._notifyObservers(subject, predicate, object, graph, true);
    }

    if (!this._addToIndex(graphItem.subjects,   subject,   predicate, object))
      return false;
    this._addToIndex(graphItem.predicates, predicate, object,    subject);
    this._addToIndex(graphItem.objects,    object,    subject,   predicate);

    if (this._size !== null) this._size++;
    return true;
  }

  // ### `_addFromIndex` adds the quads in the given graph indexes of a store
  // that shares this store's entity index, so no terms need to be converted.
  // With `otherGraphs`, it only adds the quads that are not in those indexes.
  // Index keys are strings, so the ids are converted back to the numbers that
  // `addQuad` uses: forwarded views compare the ids they are notified with to
  // their own numeric ids.
  _addFromIndex(graphs, otherGraphs = null) {
    for (const graphKey in graphs) {
      const subjects = graphs[graphKey].subjects, other = otherGraphs && otherGraphs[graphKey];
      const otherSubjects = other ? other.subjects : null;
      for (const subjectKey in subjects) {
        const subject = Number(subjectKey), predicates = subjects[subjectKey];
        const otherPredicates = otherSubjects && otherSubjects[subjectKey];
        for (const predicateKey in predicates) {
          const predicate = Number(predicateKey), objects = predicates[predicateKey];
          const otherObjects = otherPredicates && otherPredicates[predicateKey];
          for (const objectKey in objects) {
            if (!otherObjects || !(objectKey in otherObjects))
              this._addQuad(subject, predicate, Number(objectKey), Number(graphKey));
          }
        }
      }
    }
  }

  // ### `_addIntersectionFromIndex` adds the quads that are in both of the
  // given graph indexes, walking the graphs of the first and, below them,
  // whichever index has fewer keys
  _addIntersectionFromIndex(graphs, otherGraphs) {
    for (const graphKey in graphs) {
      const other = otherGraphs[graphKey];
      if (other) {
        let subjects = graphs[graphKey].subjects, otherSubjects = other.subjects;
        if (otherSubjects[SIZE] < subjects[SIZE])
          [subjects, otherSubjects] = [otherSubjects, subjects];
        for (const subjectKey in subjects) {
          let predicates = subjects[subjectKey], otherPredicates = otherSubjects[subjectKey];
          if (otherPredicates) {
            if (otherPredicates[SIZE] < predicates[SIZE])
              [predicates, otherPredicates] = [otherPredicates, predicates];
            for (const predicateKey in predicates) {
              let objects = predicates[predicateKey], otherObjects = otherPredicates[predicateKey];
              if (otherObjects) {
                if (otherObjects[SIZE] < objects[SIZE])
                  [objects, otherObjects] = [otherObjects, objects];
                for (const objectKey in objects) {
                  if (objectKey in otherObjects)
                    this._addQuad(Number(subjectKey), Number(predicateKey), Number(objectKey), Number(graphKey));
                }
              }
            }
          }
        }
      }
    }
  }

  // ### `addQuads` adds multiple quads to the store
  addQuads(quads) {
    for (let i = 0; i < quads.length; i++)
      this.addQuad(quads[i]);
  }

  // ### `delete` removes the specified quad from the dataset.
  // Returns the dataset instance it was called on.
  delete(quad) {
    this.removeQuad(quad);
    return this;
  }

  // ### `has` determines whether a dataset includes a certain quad or quad pattern.
  has(subjectOrQuad, predicate, object, graph) {
    // A quad with no other bound terms is the whole quad; otherwise it is a quoted subject
    if (subjectOrQuad && subjectOrQuad.subject &&
        (predicate === undefined || predicate === null) &&
        (object === undefined || object === null) &&
        (graph === undefined || graph === null))
      ({ subject: subjectOrQuad, predicate, object, graph } = subjectOrQuad);
    // Fully bound quads can bypass the generator machinery of `readQuads`.
    if (subjectOrQuad && predicate && object && graph !== undefined && graph !== null) {
      const subjectId = this._termToNumericId(subjectOrQuad);
      const predicateId = this._termToNumericId(predicate);
      const objectId = this._termToNumericId(object);
      const graphId = graph === '' || isDefaultGraph(graph) ? 1 : this._termToNumericId(graph);
      const graphItem = graphId && this._graphs[graphId];
      return !!subjectId && !!predicateId && !!objectId && !!graphItem &&
        hasInIndex(graphItem.subjects, subjectId, predicateId, objectId);
    }
    return !this.readQuads(subjectOrQuad, predicate, object, graph).next().done;
  }

  // ### `import` adds a stream of quads to the store
  import(stream) {
    stream.on('data', quad => { this.addQuad(quad); });
    return stream;
  }

  // ### `removeQuad` removes a quad from the store if it exists
  removeQuad(subject, predicate, object, graph) {
    // Shift arguments if a quad object is given instead of components
    if (!predicate)
      ({ subject, predicate, object, graph } = subject);
    // Convert terms to internal string representation
    graph = graph ? this._termToNumericId(graph) : 1;

    if (!(subject   = subject && this._termToNumericId(subject)) ||
        !(predicate = predicate && this._termToNumericId(predicate)) ||
        !(object    = object && this._termToNumericId(object)))
      return false;
    return this._removeQuad(subject, predicate, object, graph);
  }

  // ### `_removeQuad` removes a quad using identifiers from this store's entity index.
  _removeQuad(subject, predicate, object, graph) {
    // Verify the quad exists before notifying observers or changing any indexes.
    const graphs = this._graphs;
    const graphItem = graphs[graph];
    if (!graphItem || !hasInIndex(graphItem.subjects, subject, predicate, object))
      return false;

    // Notify observers before the mutation
    if (this._observers !== null)
      this._notifyObservers(subject, predicate, object, graph, false);

    // Remove it from all indexes
    this._removeFromIndex(graphItem.subjects,   subject,   predicate, object);
    this._removeFromIndex(graphItem.predicates, predicate, object,    subject);
    this._removeFromIndex(graphItem.objects,    object,    subject,   predicate);
    if (this._size !== null) this._size--;

    // Remove the graph if it is empty
    if (graphItem.subjects[SIZE] === 0) {
      delete graphs[graph];
      this._graphCount--;
    }
    return true;
  }

  // ### `removeQuads` removes multiple quads from the store
  removeQuads(quads) {
    for (let i = 0; i < quads.length; i++)
      this.removeQuad(quads[i]);
  }

  // ### `remove` removes a stream of quads from the store
  remove(stream) {
    stream.on('data', quad => { this.removeQuad(quad); });
    return stream;
  }

  // ### `removeMatches` removes all matching quads from the store
  // Setting any field to `undefined` or `null` indicates a wildcard.
  removeMatches(subject, predicate, object, graph) {
    const stream = new browserExports.Readable({ objectMode: true });

    const iterable = this.readQuads(subject, predicate, object, graph);
    stream._read = size => {
      while (--size >= 0) {
        const { done, value } = iterable.next();
        if (done) {
          stream.push(null);
          return;
        }
        stream.push(value);
      }
    };

    return this.remove(stream);
  }

  // ### `deleteGraph` removes all triples with the given graph from the store
  deleteGraph(graph) {
    return this.removeMatches(null, null, null, graph);
  }

  // ### `getQuads` returns an array of quads matching a pattern.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  getQuads(subject, predicate, object, graph) {
    return [...this.readQuads(subject, predicate, object, graph)];
  }

  /**
   * `readQuads` returns a generator of quads matching a pattern.
   * Setting any field to `undefined` or `null` indicates a wildcard.
   * @deprecated Use `match` instead.
   */
  *readQuads(subject, predicate, object, graph) {
    const graphs = this._getGraphs(graph);
    let content, subjectId, predicateId, objectId;

    // Translate IRIs to internal index keys.
    if (subject   && !(subjectId   = this._termToNumericId(subject))   ||
        predicate && !(predicateId = this._termToNumericId(predicate)) ||
        object    && !(objectId    = this._termToNumericId(object)))
      return;

    for (const graphId in graphs) {
      // Only if the specified graph contains triples, there can be results
      if (content = graphs[graphId]) {
        // Choose the optimal index, based on what fields are present
        if (subjectId) {
          if (objectId)
            // If subject and object are given, the object index will be the fastest
            yield* this._findInIndex(content.objects, objectId, subjectId, predicateId,
                              'object', 'subject', 'predicate', graphId);
          else
            // If only subject and possibly predicate are given, the subject index will be the fastest
            yield* this._findInIndex(content.subjects, subjectId, predicateId, null,
                              'subject', 'predicate', 'object', graphId);
        }
        else if (predicateId)
          // If only predicate and possibly object are given, the predicate index will be the fastest
          yield* this._findInIndex(content.predicates, predicateId, objectId, null,
                            'predicate', 'object', 'subject', graphId);
        else if (objectId)
          // If only object is given, the object index will be the fastest
          yield* this._findInIndex(content.objects, objectId, null, null,
                            'object', 'subject', 'predicate', graphId);
        else
          // If nothing is given, iterate subjects and predicates first
          yield* this._findInIndex(content.subjects, null, null, null,
                            'subject', 'predicate', 'object', graphId);
      }
    }
  }

  // ### `match` returns a new dataset that is comprised of all quads in the current instance matching the given arguments.
  // The logic described in Quad Matching is applied for each quad in this dataset to check if it should be included in the output dataset.
  // Note: This method always returns a new DatasetCore, even if that dataset contains no quads.
  // Note: Since a DatasetCore is an unordered set, the order of the quads within the returned sequence is arbitrary.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  // For backwards compatibility, the object return also implements the Readable stream interface.
  // `options.matchSemantics` controls how the view reacts to later mutations.
  match(subject, predicate, object, graph, options = null) {
    return new DatasetCoreAndReadableStream(this, subject, predicate, object, graph, {
      entityIndex: this._entityIndex,
      matchSemantics: options && options.matchSemantics !== undefined ?
        options.matchSemantics : this._matchSemantics,
    });
  }

  // ### `countQuads` returns the number of quads matching a pattern.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  countQuads(subject, predicate, object, graph) {
    const graphs = this._getGraphs(graph);
    let count = 0, content, subjectId, predicateId, objectId;

    // Translate IRIs to internal index keys.
    if (subject   && !(subjectId   = this._termToNumericId(subject))   ||
        predicate && !(predicateId = this._termToNumericId(predicate)) ||
        object    && !(objectId    = this._termToNumericId(object)))
      return 0;

    for (const graphId in graphs) {
      // Only if the specified graph contains triples, there can be results
      if (content = graphs[graphId]) {
        // Choose the optimal index, based on what fields are present
        if (subject) {
          if (object)
            // If subject and object are given, the object index will be the fastest
            count += this._countInIndex(content.objects, objectId, subjectId, predicateId);
          else
            // If only subject and possibly predicate are given, the subject index will be the fastest
            count += this._countInIndex(content.subjects, subjectId, predicateId, objectId);
        }
        else if (predicate) {
          // If only predicate and possibly object are given, the predicate index will be the fastest
          count += this._countInIndex(content.predicates, predicateId, objectId, subjectId);
        }
        else if (object) {
          // If only object is given, the object index will be the fastest
          count += this._countInIndex(content.objects, objectId, subjectId, predicateId);
        }
        else {
          // Without a pattern, the subject index sums the fewest leaf counts
          count += this._countInIndex(content.subjects);
        }
      }
    }
    return count;
  }

  // ### `forEach` executes the callback on all quads.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  forEach(callback, subject, predicate, object, graph) {
    this.some(quad => {
      callback(quad, this);
      return false;
    }, subject, predicate, object, graph);
  }

  // ### `every` executes the callback on all quads,
  // and returns `true` if it returns truthy for all them.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  every(callback, subject, predicate, object, graph) {
    return !this.some(quad => !callback(quad, this), subject, predicate, object, graph);
  }

  // ### `some` executes the callback on all quads,
  // and returns `true` if it returns truthy for any of them.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  some(callback, subject, predicate, object, graph) {
    for (const quad of this.readQuads(subject, predicate, object, graph))
      if (callback(quad, this))
        return true;
    return false;
  }

  // ### `getSubjects` returns all subjects that match the pattern.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  getSubjects(predicate, object, graph) {
    const results = [];
    this.forSubjects(s => { results.push(s); }, predicate, object, graph);
    return results;
  }

  // ### `forSubjects` executes the callback on all subjects that match the pattern.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  forSubjects(callback, predicate, object, graph) {
    const graphs = this._getGraphs(graph);
    let content, predicateId, objectId;
    callback = this._uniqueEntities(callback);

    // Translate IRIs to internal index keys.
    if (predicate && !(predicateId = this._termToNumericId(predicate)) ||
        object    && !(objectId    = this._termToNumericId(object)))
      return;

    for (graph in graphs) {
      // Only if the specified graph contains triples, there can be results
      if (content = graphs[graph]) {
        // Choose optimal index based on which fields are wildcards
        if (predicateId) {
          if (objectId)
            // If predicate and object are given, the POS index is best.
            this._loopBy2Keys(content.predicates, predicateId, objectId, callback);
          else
            // If only predicate is given, the SPO index is best.
            this._loopByKey1(content.subjects, predicateId, callback);
        }
        else if (objectId)
          // If only object is given, the OSP index is best.
          this._loopByKey0(content.objects, objectId, callback);
        else
          // If no params given, iterate all the subjects
          this._loop(content.subjects, callback);
      }
    }
  }

  // ### `getPredicates` returns all predicates that match the pattern.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  getPredicates(subject, object, graph) {
    const results = [];
    this.forPredicates(p => { results.push(p); }, subject, object, graph);
    return results;
  }

  // ### `forPredicates` executes the callback on all predicates that match the pattern.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  forPredicates(callback, subject, object, graph) {
    const graphs = this._getGraphs(graph);
    let content, subjectId, objectId;
    callback = this._uniqueEntities(callback);

    // Translate IRIs to internal index keys.
    if (subject   && !(subjectId   = this._termToNumericId(subject))   ||
        object    && !(objectId    = this._termToNumericId(object)))
      return;

    for (graph in graphs) {
      // Only if the specified graph contains triples, there can be results
      if (content = graphs[graph]) {
        // Choose optimal index based on which fields are wildcards
        if (subjectId) {
          if (objectId)
            // If subject and object are given, the OSP index is best.
            this._loopBy2Keys(content.objects, objectId, subjectId, callback);
          else
            // If only subject is given, the SPO index is best.
            this._loopByKey0(content.subjects, subjectId, callback);
        }
        else if (objectId)
          // If only object is given, the POS index is best.
          this._loopByKey1(content.predicates, objectId, callback);
        else
          // If no params given, iterate all the predicates.
          this._loop(content.predicates, callback);
      }
    }
  }

  // ### `getObjects` returns all objects that match the pattern.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  getObjects(subject, predicate, graph) {
    const results = [];
    this.forObjects(o => { results.push(o); }, subject, predicate, graph);
    return results;
  }

  // ### `forObjects` executes the callback on all objects that match the pattern.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  forObjects(callback, subject, predicate, graph) {
    const graphs = this._getGraphs(graph);
    let content, subjectId, predicateId;
    callback = this._uniqueEntities(callback);

    // Translate IRIs to internal index keys.
    if (subject   && !(subjectId   = this._termToNumericId(subject))   ||
        predicate && !(predicateId = this._termToNumericId(predicate)))
      return;

    for (graph in graphs) {
      // Only if the specified graph contains triples, there can be results
      if (content = graphs[graph]) {
        // Choose optimal index based on which fields are wildcards
        if (subjectId) {
          if (predicateId)
            // If subject and predicate are given, the SPO index is best.
            this._loopBy2Keys(content.subjects, subjectId, predicateId, callback);
          else
            // If only subject is given, descending the SPO index
            // visits only the subject's own quads.
            this._loopByKey0Deep(content.subjects, subjectId, callback);
        }
        else if (predicateId)
          // If only predicate is given, the POS index is best.
          this._loopByKey0(content.predicates, predicateId, callback);
        else
          // If no params given, iterate all the objects.
          this._loop(content.objects, callback);
      }
    }
  }

  // ### `getGraphs` returns all graphs that match the pattern.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  getGraphs(subject, predicate, object) {
    const results = [];
    this.forGraphs(g => { results.push(g); }, subject, predicate, object);
    return results;
  }

  // ### `forGraphs` executes the callback on all graphs that match the pattern.
  // Setting any field to `undefined` or `null` indicates a wildcard.
  forGraphs(callback, subject, predicate, object) {
    for (const graph in this._graphs) {
      this.some(quad => {
        callback(quad.graph);
        return true; // Halt iteration of some()
      }, subject, predicate, object, this._termFromId(this._entities[graph]));
    }
  }

  // ### `createBlankNode` creates a new blank node, returning its name
  createBlankNode(suggestedName) {
    return this._entityIndex.createBlankNode(suggestedName);
  }

  // ### `extractLists` finds and removes all list triples
  // and returns the items per list.
  // With `allowExtraArcs`, lists whose nodes carry arcs other than
  // rdf:first/rdf:rest are returned as well,
  // but left intact when `remove` is set. Ambiguous unreferenced list heads
  // with multiple non-list arcs remain errors.
  extractLists({ remove = false, ignoreErrors = false, allowExtraArcs = false } = {}) {
    // Keys are the list heads' term values, so a null-prototype map keeps
    // them from colliding with inherited Object members such as `toString`
    const lists = Object.create(null);
    const onError = ignoreErrors ? (() => true) :
                  ((node, message) => { throw new Error(`${node.value} ${message}`); });

    // Traverse each list from its tail
    const tails = this.getQuads(null, namespaces.rdf.rest, namespaces.rdf.nil, null);
    const toRemove = [];
    tails.forEach(tailQuad => {
      const items = [];             // the members found as objects of rdf:first quads
      let malformed = false;      // signals whether the current list is malformed
      let extraArcs = false;      // signals whether the current list has extra arcs
      let head;                   // the head of the list (_:b1 in above example)
      let headPos;                // set to subject or object when head is set
      const graph = tailQuad.graph; // make sure list is in exactly one graph
      const listQuads = [];       // rdf:first/rdf:rest quads of this list

      // Traverse the list from tail to end
      let current = tailQuad.subject;
      while (current && !malformed) {
        const objectQuads = this.getQuads(null, null, current, null);
        const subjectQuads = this.getQuads(current, null, null, null);
        let quad, first = null, rest = null, parent = null;

        // Find the first and rest of this list node
        for (let i = 0; i < subjectQuads.length && !malformed; i++) {
          quad = subjectQuads[i];
          if (!quad.graph.equals(graph))
            malformed = onError(current, 'not confined to single graph');
          else if (head)
            malformed = onError(current, 'has non-list arcs out');

          // one rdf:first
          else if (quad.predicate.value === namespaces.rdf.first) {
            if (first)
              malformed = onError(current, 'has multiple rdf:first arcs');
            else
              first = quad;
            if (remove && first === quad)
              listQuads.push(quad);
          }

          // one rdf:rest
          else if (quad.predicate.value === namespaces.rdf.rest) {
            if (rest)
              malformed = onError(current, 'has multiple rdf:rest arcs');
            else
              rest = quad;
            if (remove && rest === quad)
              listQuads.push(quad);
          }

          // alien triple
          else if (objectQuads.length) {
            if (allowExtraArcs)
              extraArcs = true;
            else
              malformed = onError(current, `has non-list arc ${quad.predicate.value}`);
          }
          else {
            head = quad; // e.g. { (1 2 3) :p :o }
            headPos = 'subject';
          }
        }

        // { :s :p (1 2) } arrives here with no head
        // { (1 2) :p :o } arrives here with head set to the list.
        for (let i = 0; i < objectQuads.length && !malformed; ++i) {
          quad = objectQuads[i];
          if (head)
            malformed = onError(current, 'can\'t have coreferences');
          // one rdf:rest
          else if (quad.predicate.value === namespaces.rdf.rest) {
            if (parent)
              malformed = onError(current, 'has incoming rdf:rest arcs');
            else
              parent = quad;
          }
          else {
            head = quad; // e.g. { :s :p (1 2) }
            headPos = 'object';
          }
        }

        // Store the list item and continue with parent
        if (!first)
          malformed = onError(current, 'has no list head');
        else
          items.push(first.object);
        current = parent && parent.subject;
      }

      // Don't remove any quads if the list is malformed
      if (malformed)
        remove = false;
      else {
        // Items were collected from the tail to the head
        items.reverse();
        // Store the list under the value of its head
        if (head)
          lists[head[headPos].value] = items;
        // Leave lists with extra arcs fully intact; otherwise queue this list once.
        if (remove && !extraArcs) {
          for (let i = 0; i < listQuads.length; i++)
            toRemove.push(listQuads[i]);
        }
      }
    });

    // Remove list quads if requested
    if (remove)
      this.removeQuads(toRemove);
    return lists;
  }

  /**
   * Returns `true` if the current dataset is a superset of the given dataset; in other words, returns `true` if
   * the given dataset is a subset of, i.e., is contained within, the current dataset.
   *
   * Blank Nodes will be normalized.
   */
  addAll(quads) {
    if (quads instanceof DatasetCoreAndReadableStream)
      quads = quads.filtered;

    if (Array.isArray(quads))
      this.addQuads(quads);
    // A store with the same entity index can be copied by identifier
    else if (quads instanceof N3Store && quads._entityIndex === this._entityIndex)
      this._addFromIndex(quads._graphs);
    else {
      for (const quad of quads)
        this.add(quad);
    }
    return this;
  }

  /**
   * Returns `true` if the current dataset is a superset of the given dataset; in other words, returns `true` if
   * the given dataset is a subset of, i.e., is contained within, the current dataset.
   *
   * Blank Nodes will be normalized.
   */
  contains(other) {
    if (other instanceof DatasetCoreAndReadableStream)
      other = other.filtered;

    if (other === this)
      return true;

    if (!(other instanceof N3Store) || this._entityIndex !== other._entityIndex) {
      // A larger set cannot be a subset, but only compare sizes that are known without counting
      const otherSize = knownSize(other), thisSize = this._size;
      if (otherSize !== null && thisSize !== null && otherSize > thisSize)
        return false;
      return other.every(quad => this.has(quad));
    }

    // At every level, the index of the subset cannot have more entries
    const g1 = this._graphs, g2 = other._graphs;
    let s1, s2, p1, p2, o1, o2;
    for (const graph in g2) {
      if (!(s1 = g1[graph])) return false;
      s1 = s1.subjects;
      if ((s2 = g2[graph].subjects)[SIZE] > s1[SIZE]) return false;
      for (const subject in s2) {
        if (!(p1 = s1[subject]) || (p2 = s2[subject])[SIZE] > p1[SIZE]) return false;
        for (const predicate in p2) {
          if (!(o1 = p1[predicate]) || (o2 = p2[predicate])[SIZE] > o1[SIZE]) return false;
          for (const object in o2)
            if (!(object in o1)) return false;
        }
      }
    }
    return true;
  }

  /**
   * This method removes the quads in the current dataset that match the given arguments.
   *
   * The logic described in {@link https://rdf.js.org/dataset-spec/#quad-matching|Quad Matching} is applied for each
   * quad in this dataset, to select the quads which will be deleted.
   *
   * @param subject   The optional exact subject to match.
   * @param predicate The optional exact predicate to match.
   * @param object    The optional exact object to match.
   * @param graph     The optional exact graph to match.
   */
  deleteMatches(subject, predicate, object, graph) {
    for (const quad of this.match(subject, predicate, object, graph, { matchSemantics: 'lazy' }))
      this.removeQuad(quad);
    return this;
  }

  /**
   * Returns a new dataset that contains all quads from the current dataset that are not included in the given dataset.
   */
  difference(other) {
    if (other && other instanceof DatasetCoreAndReadableStream)
      other = other.filtered;

    if (other === this)
      return new N3Store({ entityIndex: this._entityIndex });

    if ((other instanceof N3Store) && other._entityIndex === this._entityIndex) {
      const store = new N3Store({ entityIndex: this._entityIndex });
      store._addFromIndex(this._graphs, other._graphs);
      return store;
    }

    return this.filter(quad => !other.has(quad));
  }

  /**
   * Returns true if the current dataset contains the same graph structure as the given dataset.
   *
   * Blank Nodes will be normalized.
   */
  equals(other) {
    if (other instanceof DatasetCoreAndReadableStream)
      other = other.filtered;

    return other === this || (this.size === other.size && this.contains(other));
  }

  /**
   * Creates a new dataset with all the quads that pass the test implemented by the provided `iteratee`.
   *
   * This method is aligned with Array.prototype.filter() in ECMAScript-262.
   */
  filter(iteratee) {
    const store = new N3Store({ entityIndex: this._entityIndex });
    for (const quad of this)
      if (iteratee(quad, this))
        store.add(quad);
    return store;
  }

  /**
   * Returns a new dataset containing all quads from the current dataset that are also included in the given dataset.
   */
  intersection(other) {
    if (other instanceof DatasetCoreAndReadableStream)
      other = other.filtered;

    if (other === this) {
      const store = new N3Store({ entityIndex: this._entityIndex });
      store._addFromIndex(this._graphs);
      return store;
    }
    else if ((other instanceof N3Store) && this._entityIndex === other._entityIndex) {
      const store = new N3Store({ entityIndex: this._entityIndex });
      // Starting a loop over no graphs costs more than checking for an empty store
      if (this._size !== 0 && other._size !== 0) {
        if (other._graphCount < this._graphCount)
          store._addIntersectionFromIndex(other._graphs, this._graphs);
        else
          store._addIntersectionFromIndex(this._graphs, other._graphs);
      }
      return store;
    }

    // Test the quads of the smaller dataset against the larger one
    // when both sizes are known without counting
    const otherSize = knownSize(other), thisSize = this._size;
    if (otherSize !== null && thisSize !== null && otherSize < thisSize && typeof other[Symbol.iterator] === 'function' &&
        // unless it is a store whose custom factories may not create RDF/JS quads,
        // either for its quads or, through its entity index, for their terms
        other._factory === DataFactory && other._entityIndex._factory === DataFactory) {
      const store = new N3Store({ entityIndex: this._entityIndex });
      for (const quad of other)
        if (this.has(quad))
          store.add(quad);
      return store;
    }
    return this.filter(quad => other.has(quad));
  }

  /**
   * Returns a new dataset containing all quads returned by applying `iteratee` to each quad in the current dataset.
   */
  map(iteratee) {
    const store = new N3Store({ entityIndex: this._entityIndex });
    for (const quad of this)
      store.add(iteratee(quad, this));
    return store;
  }

  /**
   * This method calls the `iteratee` method on each `quad` of the `Dataset`. The first time the `iteratee` method
   * is called, the `accumulator` value is the `initialValue`, or, if not given, equals the first quad of the `Dataset`.
   * The return value of each call to the `iteratee` method is used as the `accumulator` value for the next call.
   *
   * This method returns the return value of the last `iteratee` call.
   *
   * This method is aligned with `Array.prototype.reduce()` in ECMAScript-262.
   */
  reduce(callback, initialValue) {
    const iter = this.readQuads();
    let accumulator = initialValue === undefined ? iter.next().value : initialValue;
    for (const quad of iter)
      accumulator = callback(accumulator, quad, this);
    return accumulator;
  }

  /**
   * Returns the set of quads within the dataset as a host-language-native sequence, for example an `Array` in
   * ECMAScript-262.
   *
   * Since a `Dataset` is an unordered set, the order of the quads within the returned sequence is arbitrary.
   */
  toArray() {
    return this.getQuads();
  }

  /**
   * Returns an N-Quads string representation of the dataset, preprocessed with the
   * {@link https://json-ld.github.io/normalization/spec/|RDF Dataset Normalization} algorithm.
   */
  toCanonical() {
    throw new Error('not implemented');
  }

  /**
   * Returns a stream that contains all quads of the dataset.
   */
  toStream() {
    return this.match(null, null, null, null, { matchSemantics: 'lazy' });
  }

  /**
   * Returns an N-Quads string representation of the dataset.
   *
   * No prior normalization is required, therefore the results for the same quads may vary depending on the `Dataset`
   * implementation.
   */
  toString() {
    return (new N3Writer()).quadsToString(this);
  }

  /**
   * Returns a new `Dataset` that is a concatenation of this dataset and the quads given as an argument.
   */
  union(quads) {
    const store = new N3Store({ entityIndex: this._entityIndex });
    store._addFromIndex(this._graphs);
    store.addAll(quads);
    return store;
  }

  // ### Store is an iterable.
  // Returns the quad iterator directly; order is not guaranteed.
  [Symbol.iterator]() {
    return this.readQuads();
  }
}

/**
 * Returns a subset of the `index` with that part of the index
 * matching the `ids` array. `ids` contains 3 elements that are
 * either numerical ids; or `null`.
 *
 * `false` is returned when there are no matching indices; this should
 * *not* be set as the value for an index.
 */
function indexMatch(index, ids, depth = 0) {
  const ind = ids[depth];
  if (ind && !(ind in index))
    return false;

  let target = false, size = 0;
  for (const key in (ind ? { [ind]: index[ind] } : index)) {
    const result = depth === 2 ? null : indexMatch(index[key], ids, depth + 1);

    if (result !== false) {
      target = target || Object.create(null);
      target[key] = result;
      size++;
    }
  }
  if (target)
    target[SIZE] = size;
  return target;
}

// Capture a read in the same index order as readQuads, without constructing RDF terms.
// A flat list avoids allocating a Quad (and its terms) for every unread result.
function snapshotMatch(store, subject, predicate, object, graph) {
  const snapshot = { store, ids: [] };
  const subjectId = subject && store._termToNumericId(subject);
  const predicateId = predicate && store._termToNumericId(predicate);
  const objectId = object && store._termToNumericId(object);
  // Only active reads are frozen: bound terms and graphs have already resolved,
  // and notifications run before deletion. Entity IDs are never removed.

  // Keep this choice aligned with readQuads: changing order would repeat or skip
  // results when an iterator resumes partway through its snapshot.
  let indexName, key0, key1, key2, positions;
  if (objectId && (subjectId || !predicateId)) {
    indexName = 'objects';
    [key0, key1, key2] = [objectId, subjectId, predicateId];
    positions = [2, 0, 1];
  }
  else if (!subjectId && predicateId) {
    indexName = 'predicates';
    [key0, key1, key2] = [predicateId, objectId, subjectId];
    positions = [1, 2, 0];
  }
  else {
    indexName = 'subjects';
    [key0, key1, key2] = [subjectId, predicateId, objectId];
    positions = [0, 1, 2];
  }

  const graphs = store._getGraphs(graph), parts = [];
  for (const graphId in graphs) {
    const index = graphs[graphId][indexName];
    const graphKey = Number(graphId);
    for (const value0 in (key0 ? { [key0]: index[key0] } : index)) {
      const index1 = index[value0];
      if (!index1) continue; // eslint-disable-line no-continue
      parts[positions[0]] = Number(value0);
      for (const value1 in (key1 ? { [key1]: index1[key1] } : index1)) {
        const index2 = index1[value1];
        if (!index2) continue; // eslint-disable-line no-continue
        parts[positions[1]] = Number(value1);
        for (const value2 in (key2 ? (key2 in index2 ? { [key2]: null } : {}) : index2)) {
          parts[positions[2]] = Number(value2);
          snapshot.ids.push(parts[0], parts[1], parts[2], graphKey);
        }
      }
    }
  }
  return snapshot;
}

// Skip already-yielded IDs in constant time; only materialize the requested tail.
function* iterateSnapshot({ store, ids }, offset) {
  const entities = store._entities;
  let subject, predicate, object, graph;
  let subjectId, predicateId, objectId, graphId;
  for (let i = offset * 4; i < ids.length; i += 4) {
    if (subjectId !== ids[i])
      subject = store._termFromId(entities[subjectId = ids[i]]);
    if (predicateId !== ids[i + 1])
      predicate = store._termFromId(entities[predicateId = ids[i + 1]]);
    if (objectId !== ids[i + 2])
      object = store._termFromId(entities[objectId = ids[i + 2]]);
    if (graphId !== ids[i + 3])
      graph = store._termFromId(entities[graphId = ids[i + 3]]);
    yield store._factory.quad(subject, predicate, object, graph);
  }
}

function validateMatchSemantics(semantics = 'lazy') {
  if (semantics !== 'lazy' && semantics !== 'snapshot' && semantics !== 'forwarded')
    throw new Error(`Unknown matchSemantics: ${semantics}`);
  if (semantics !== 'lazy' && (typeof WeakRef !== 'function' || typeof FinalizationRegistry !== 'function'))
    throw new Error('Non-lazy matchSemantics requires WeakRef and FinalizationRegistry support');
  return semantics;
}

// Returns the intersection of two quad patterns, or false if they conflict.
function intersectMatchPatterns(left, right) {
  const result = new Array(4);
  for (let i = 0; i < 4; i++) {
    const leftTerm = left[i], rightTerm = right[i];
    if (leftTerm === null || leftTerm === undefined)
      result[i] = rightTerm;
    else if (rightTerm === null || rightTerm === undefined || entityKey(leftTerm) === entityKey(rightTerm))
      result[i] = leftTerm;
    else
      return false;
  }
  return result;
}

/**
 * A class that implements both DatasetCore and Readable.
 */
class DatasetCoreAndReadableStream extends browserExports.Readable {
  constructor(n3Store, subject, predicate, object, graph, options) {
    super({ objectMode: true });
    Object.assign(this, { n3Store, subject, predicate, object, graph, options });
    const semantics = this._semantics = validateMatchSemantics(options.matchSemantics);

    if (options.matchesNothing) {
      this._matchesNothing = true;
      this._filtered = new N3Store({ factory: n3Store._factory, entityIndex: options.entityIndex });
    }

    if (semantics !== 'lazy') {
      // Active reads share a snapshot only when their source changes.
      this._readers = null;
      // Cache pattern ids on first use
      this._subjectId = this._predicateId = this._objectId = this._graphId = undefined;
      if (!this._matchesNothing) {
        this._observer = n3Store._addObserver(this);
      }
    }
  }

  // ### `_matchesPattern` tests quad ids against this view.
  _matchesPattern(subjectId, predicateId, objectId, graphId) {
    const { subject, predicate, object, graph, n3Store } = this;
    if (subject && subjectId !== (this._subjectId || (this._subjectId = n3Store._termToNumericId(subject))))
      return false;
    if (predicate && predicateId !== (this._predicateId || (this._predicateId = n3Store._termToNumericId(predicate))))
      return false;
    if (object && objectId !== (this._objectId || (this._objectId = n3Store._termToNumericId(object))))
      return false;
    return graph === null || graph === undefined ||
      graphId === (this._graphId || (this._graphId =
        graph === '' || isDefaultGraph(graph) ? 1 : n3Store._termToNumericId(graph)));
  }

  // ### `_matchesQuad` tests a Quad against this view.
  _matchesQuad(quad) {
    const { subject, predicate, object, graph } = this;
    return !this._matchesNothing &&
      (subject === null || subject === undefined || entityKey(subject) === entityKey(quad.subject)) &&
      (predicate === null || predicate === undefined || entityKey(predicate) === entityKey(quad.predicate)) &&
      (object === null || object === undefined || entityKey(object) === entityKey(quad.object)) &&
      (graph === null || graph === undefined || entityKey(graph) === entityKey(quad.graph));
  }

  // ### `_assertMatchesPattern` rejects a Quad outside this view.
  _assertMatchesPattern(quad) {
    if (!this._matchesQuad(quad))
      throw new Error('Quad does not match the forwarded view pattern');
  }

  // ### `_sourceIterator` returns an iterator over the current backing store.
  _sourceIterator() {
    return this._filtered ? this._filtered[Symbol.iterator]() :
      this.n3Store.readQuads(this.subject, this.predicate, this.object, this.graph);
  }

  // ### `_freezeCurrentIterators` freezes only readers still using the live source.
  _freezeCurrentIterators() {
    if (this._readers) {
      this._readers.snapshot = this._filtered ? snapshotMatch(this._filtered) :
        snapshotMatch(this.n3Store, this.subject, this.predicate, this.object, this.graph);
      // Each iterator retains its own group. New reads must see the new source;
      // the view must not retain snapshots belonging to suspended or abandoned reads.
      this._readers = null;
    }
  }

  // ### `_onParentMutation` applies a parent mutation to this view.
  _onParentMutation(subjectId, predicateId, objectId, graphId, added) {
    if (!this._matchesPattern(subjectId, predicateId, objectId, graphId))
      return;

    this._freezeCurrentIterators();

    // Keep using the parent until materialization
    if (this._semantics === 'forwarded') {
      if (this._filtered) {
        if (added)
          this._filtered._addQuad(subjectId, predicateId, objectId, graphId);
        else
          this._filtered._removeQuad(subjectId, predicateId, objectId, graphId);
      }
      return;
    }

    // Capture the pre-mutation snapshot
    this._filtered = this.filtered;
  }

  get filtered() {
    if (!this._filtered) {
      const { n3Store, graph, object, predicate, subject } = this;
      if (this._semantics !== 'lazy')
        this._freezeCurrentIterators();
      const newStore = this._filtered = new N3Store({ factory: n3Store._factory, entityIndex: this.options.entityIndex });

      if (this._semantics === 'snapshot')
        this._detachObserver();

      let subjectId, predicateId, objectId;

      // Translate IRIs to internal index keys.
      if (subject   && !(subjectId   = newStore._termToNumericId(subject))   ||
          predicate && !(predicateId = newStore._termToNumericId(predicate)) ||
          object    && !(objectId    = newStore._termToNumericId(object)))
        return newStore;

      const graphs = n3Store._getGraphs(graph);
      for (const graphKey in graphs) {
        let subjects, predicates, objects, content;
        if (content = graphs[graphKey]) {
          if (!subjectId && predicateId) {
            if (predicates = indexMatch(content.predicates, [predicateId, objectId, subjectId])) {
              subjects = indexMatch(content.subjects, [subjectId, predicateId, objectId]);
              objects = indexMatch(content.objects, [objectId, subjectId, predicateId]);
            }
          }
          else if (objectId) {
            if (objects = indexMatch(content.objects, [objectId, subjectId, predicateId])) {
              subjects = indexMatch(content.subjects, [subjectId, predicateId, objectId]);
              predicates = indexMatch(content.predicates, [predicateId, objectId, subjectId]);
            }
          }
          else if (subjects = indexMatch(content.subjects, [subjectId, predicateId, objectId])) {
            predicates = indexMatch(content.predicates, [predicateId, objectId, subjectId]);
            objects = indexMatch(content.objects, [objectId, subjectId, predicateId]);
          }

          if (subjects) {
            newStore._graphs[graphKey] = { subjects, predicates, objects };
            newStore._graphCount++;
          }
        }
      }
      newStore._size = null;
    }
    return this._filtered;
  }

  get size() {
    return this.filtered.size;
  }

  _read(size) {
    if (size > 0 && !this[ITERATOR])
      this[ITERATOR] = this[Symbol.iterator]();
    const iterable = this[ITERATOR];
    while (--size >= 0) {
      const { done, value } = iterable.next();
      if (done) {
        this.push(null);
        return;
      }
      this.push(value);
    }
  }

  // ### `_destroy` closes the cached iterator.
  _destroy(error, callback) {
    if (this[ITERATOR]) {
      this[ITERATOR].return();
      this[ITERATOR] = null;
    }
    callback(error);
  }

  // ### `_detachObserver` stops observing the parent store.
  _detachObserver() {
    if (this._observer) {
      this.n3Store._removeObserver(this._observer);
      this._observer = null;
    }
  }

  // ### `_detach` freezes the view and stops observing the parent.
  _detach() {
    this._filtered = this.filtered;
    this._detachObserver();
    // Lazy views deferred this state
    if (this._semantics === 'lazy')
      this._readers = null;
    this._semantics = 'snapshot';
    return this;
  }

  addAll(quads) {
    if (this._semantics === 'forwarded') {
      for (const quad of quads) {
        this._assertMatchesPattern(quad);
        this.n3Store.addQuad(quad);
      }
      return this;
    }
    return this.filtered.addAll(quads);
  }

  contains(other) {
    return this.filtered.contains(other);
  }

  deleteMatches(subject, predicate, object, graph) {
    if (this._semantics === 'forwarded') {
      // No deletion pattern can match a view with conflicting ancestor patterns.
      if (this._matchesNothing)
        throw new Error('Cannot delete from a conflicting forwarded view pattern');
      const pattern = intersectMatchPatterns(
        [this.subject, this.predicate, this.object, this.graph],
        [subject, predicate, object, graph],
      );
      if (!pattern)
        throw new Error('Deletion pattern does not match the forwarded view pattern');
      this.n3Store.deleteMatches(...pattern);
      return this;
    }
    return this.filtered.deleteMatches(subject, predicate, object, graph);
  }

  difference(other) {
    return this.filtered.difference(other);
  }

  equals(other) {
    return this.filtered.equals(other);
  }

  every(callback, subject, predicate, object, graph) {
    return this.filtered.every(this._semantics === 'forwarded' ?
      quad => callback(quad, this) : callback, subject, predicate, object, graph);
  }

  filter(iteratee) {
    return this.filtered.filter(this._semantics === 'forwarded' ?
      quad => iteratee(quad, this) : iteratee);
  }

  forEach(callback, subject, predicate, object, graph) {
    return this.filtered.forEach(this._semantics === 'forwarded' ?
      quad => callback(quad, this) : callback, subject, predicate, object, graph);
  }

  import(stream) {
    if (this._semantics !== 'forwarded')
      return this.filtered.import(stream);

    const view = this;
    function onData(quad) {
      try {
        view._assertMatchesPattern(quad);
        view.n3Store.addQuad(quad);
      }
      catch (error) {
        // Stop this import; RDF/JS streams need not implement destroy()
        stream.removeListener('data', onData);
        if (typeof stream.destroy === 'function')
          stream.destroy(error);
        else
          stream.emit('error', error);
      }
    }
    stream.on('data', onData);
    return stream;
  }

  intersection(other) {
    return this.filtered.intersection(other);
  }

  map(iteratee) {
    return this.filtered.map(this._semantics === 'forwarded' ?
      quad => iteratee(quad, this) : iteratee);
  }

  some(callback, subject, predicate, object, graph) {
    return this.filtered.some(this._semantics === 'forwarded' ?
      quad => callback(quad, this) : callback, subject, predicate, object, graph);
  }

  toCanonical() {
    return this.filtered.toCanonical();
  }

  toStream() {
    if (this._semantics !== 'lazy')
      // Use a fresh sync iterator instead of consuming this view's own readable stream.
      return browserExports.Readable.from(this[Symbol.iterator]());
    return this._filtered ?
      this._filtered.toStream()
      : this.n3Store.match(this.subject, this.predicate, this.object, this.graph, { matchSemantics: 'lazy' });
  }

  union(quads) {
    return this._filtered ?
      this._filtered.union(quads)
      : this.n3Store.match(this.subject, this.predicate, this.object, this.graph, { matchSemantics: 'lazy' }).addAll(quads);
  }

  toArray() {
    if (this._semantics !== 'lazy')
      return [...this];
    return this._filtered ? this._filtered.toArray() : this.n3Store.getQuads(this.subject, this.predicate, this.object, this.graph);
  }

  reduce(callback, initialValue) {
    return this.filtered.reduce(this._semantics === 'forwarded' ?
      (accumulator, quad) => callback(accumulator, quad, this) : callback, initialValue);
  }

  toString() {
    return (new N3Writer()).quadsToString(this);
  }

  add(quad) {
    if (this._semantics === 'forwarded') {
      this._assertMatchesPattern(quad);
      this.n3Store.addQuad(quad);
      return this;
    }
    return this.filtered.add(quad);
  }

  delete(quad) {
    if (this._semantics === 'forwarded') {
      this._assertMatchesPattern(quad);
      this.n3Store.removeQuad(quad);
      return this;
    }
    return this.filtered.delete(quad);
  }

  has(quad) {
    return this.filtered.has(quad);
  }

  match(subject, predicate, object, graph, options = null) {
    const requestedSemantics = options && options.matchSemantics;
    if (options && requestedSemantics !== undefined) {
      validateMatchSemantics(requestedSemantics);
      if (requestedSemantics !== this._semantics)
        throw new Error(`Cannot override matchSemantics on a view: inherited "${this._semantics}", received "${requestedSemantics}"`);
    }

    if (this._semantics !== 'forwarded')
      return new DatasetCoreAndReadableStream(this.filtered, subject, predicate, object, graph, {
        entityIndex: this.options.entityIndex,
        matchSemantics: this._semantics,
      });

    const pattern = !this._matchesNothing && intersectMatchPatterns(
      [this.subject, this.predicate, this.object, this.graph],
      [subject, predicate, object, graph],
    );
    const [matchedSubject, matchedPredicate, matchedObject, matchedGraph] = pattern || [null, null, null, null];
    return new DatasetCoreAndReadableStream(
      this.n3Store, matchedSubject, matchedPredicate, matchedObject, matchedGraph, {
        entityIndex: this.options.entityIndex,
        matchSemantics: 'forwarded',
        matchesNothing: !pattern,
      });
  }

  [Symbol.iterator]() {
    return this._semantics === 'lazy' ? this._sourceIterator() : this._iterateStable();
  }

  *_iterateStable() {
    const readers = this._readers || (this._readers = { count: 0, snapshot: null });
    const source = this._sourceIterator();
    let yielded = 0;
    readers.count++;
    try {
      while (!readers.snapshot) {
        const { value, done } = source.next();
        // A custom factory can mutate the store inside next(), even on its first call.
        if (readers.snapshot || done)
          break;
        yielded++;
        yield value;
      }
      if (readers.snapshot)
        yield* iterateSnapshot(readers.snapshot, yielded);
    }
    finally {
      source.return();
      if (--readers.count === 0) {
        readers.snapshot = null;
        if (this._readers === readers)
          this._readers = null;
      }
    }
  }
}

class N3DatasetCoreFactory {
  dataset(quads) {
    return new N3Store(quads);
  }
}

/**
 * Gets rules from a dataset. This will only collect horn rules declared using log:implies.
 */
function getRulesFromDataset(dataset) {
  const rules = [];
  for (const { subject, object } of dataset.match(null, DataFactory.namedNode('http://www.w3.org/2000/10/swap/log#implies'), null, DataFactory.defaultGraph())) {
    const premise = [...dataset.match(null, null, null, subject)];
    const conclusion = [...dataset.match(null, null, null, object)];
    rules.push({ premise, conclusion });
  }
  return rules;
}

class N3Reasoner {
  constructor(store, options = {}) {
    this._store = store;
    // Optional safety budgets for reasoning over untrusted rules or data
    this._maxDerivations = options.maxDerivations === undefined ? Infinity : options.maxDerivations;
    // Caps a rule's premise count, as `_evaluatePremise` recurses once per premise
    this._maxPremiseDepth = options.maxPremiseDepth === undefined ? Infinity : options.maxPremiseDepth;
  }

  _add(subject, predicate, object, graphItem, c, cb) {
    const store = this._store;
    // Observing views must see each derivation before indexing
    // (stores from other N3 versions have no observers)
    if (store._observers) {
      if (!store._addQuad(subject, predicate, object, this._graphId)) return;
    }
    else {
      // Only add to the remaining indexes if there is not already a value in the index
      if (!store._addToIndex(graphItem.subjects,   subject,   predicate, object)) return;
      store._addToIndex(graphItem.predicates, predicate, object,    subject);
      store._addToIndex(graphItem.objects,    object,    subject,   predicate);
      this._indexed++;
    }
    // Count genuinely new derivations and fail past the budget. The check comes
    // after all three indexes are updated, so a caught error leaves the store
    // in a consistent state (the reasoning result is merely incomplete).
    if (++this._derivations > this._maxDerivations)
      throw new Error(`Reasoning exceeded the maximum of ${this._maxDerivations} derivations`);
    cb(c);
  }

  // Emit conclusions without allocating per-match callbacks
  _emit(rule, content, cb) {
    const conclusion = rule.conclusion;
    for (let k = 0; k < conclusion.length; k++) {
      const c = conclusion[k];
      this._add(c.subject.value, c.predicate.value, c.object.value, content, c, cb);
    }
  }

  // Bound values use direct lookups; unbound values scan the index
  _evaluatePremise(rule, content, cb, i = 0) {
    let value, index1;
    const [val0, val1, val2] = rule.premise[i].value, index = content[rule.premise[i].content];
    const last = i === rule.premise.length - 1;
    const v0 = !(value = val0.value);
    if (v0) {
      // Intermediate index entries are always non-empty
      for (value in index) {
        index1 = index[value];
        val0.value = Number(value);
        this._evaluateLevel1(rule, content, cb, i, last, val1, val2, index1);
      }
      val0.value = null;
    }
    else if (index1 = index[value]) {
      this._evaluateLevel1(rule, content, cb, i, last, val1, val2, index1);
    }
  }

  _evaluateLevel1(rule, content, cb, i, last, val1, val2, index1) {
    let value, index2;
    const v1 = !(value = val1.value);
    if (v1) {
      for (value in index1) {
        index2 = index1[value];
        val1.value = Number(value);
        this._evaluateLevel2(rule, content, cb, i, last, val2, index2);
      }
      val1.value = null;
    }
    else if (index2 = index1[value]) {
      this._evaluateLevel2(rule, content, cb, i, last, val2, index2);
    }
  }

  _evaluateLevel2(rule, content, cb, i, last, val2, index2) {
    let value;
    const v2 = !(value = val2.value);
    if (v2) {
      for (value in index2) {
        val2.value = Number(value);
        if (last) this._emit(rule, content, cb);
        else this._evaluatePremise(rule, content, cb, i + 1);
      }
      val2.value = null;
    }
    // A bound leaf only matches if the quad exists
    else if (value in index2) {
      if (last) this._emit(rule, content, cb);
      else this._evaluatePremise(rule, content, cb, i + 1);
    }
  }

  _evaluateRules(rules, content, cb) {
    for (let i = 0; i < rules.length; i++) {
      this._evaluatePremise(rules[i], content, cb);
    }
  }

  // A naive reasoning algorithm where rules are just applied by repeatedly applying rules
  // until no more evaluations are made
  _reasonGraphNaive(rules, content) {
    const newRules = [];

    function addRule(conclusion) {
      if (conclusion.next)
        conclusion.next.forEach(rule => {
          newRules.push([conclusion.subject.value, conclusion.predicate.value, conclusion.object.value, rule]);
        });
    }

    // Reuse addRule instead of allocating a callback per conclusion
    const addConclusions = conclusion => {
      for (let k = 0; k < conclusion.length; k++) {
        const c = conclusion[k];
        this._add(c.subject.value, c.predicate.value, c.object.value, content, c, addRule);
      }
    };

    this._evaluateRules(rules, content, addRule);

    let r;
    while ((r = newRules.pop()) !== undefined) {
      const [subject, predicate, object, rule] = r;
      const v1 = rule.basePremise.subject.value;
      if (!v1) rule.basePremise.subject.value = subject;
      const v2 = rule.basePremise.predicate.value;
      if (!v2) rule.basePremise.predicate.value = predicate;
      const v3 = rule.basePremise.object.value;
      if (!v3) rule.basePremise.object.value = object;

      // A repeated variable or a constant in the triggering premise must match the derived quad
      const { basePremise } = rule;
      if (basePremise.subject.value === subject && basePremise.predicate.value === predicate &&
          basePremise.object.value === object) {
        if (rule.premise.length === 0)
          addConclusions(rule.conclusion);
        else
          this._evaluatePremise(rule, content, addRule);
      }

      if (!v1) rule.basePremise.subject.value = null;
      if (!v2) rule.basePremise.predicate.value = null;
      if (!v3) rule.basePremise.object.value = null;
    }
  }

  _createRule({ premise, conclusion }) {
    const varMapping = Object.create(null);

    const toId = value => value.termType === 'Variable' ?
      // If the term is a variable, then create an empty object that values can be placed into
      (varMapping[value.value] = varMapping[value.value] || {}) :
      // If the term is not a variable, then set the ID value
      { value: this._store._termToNewNumericId(value) };

    // eslint-disable-next-line func-style
    const t = term => ({ subject: toId(term.subject), predicate: toId(term.predicate), object: toId(term.object) });

    return {
      premise: premise.map(p => t(p)),
      conclusion: conclusion.map(p => t(p)),
      variables: Object.values(varMapping),
    };
  }

  reason(rules) {
    this._derivations = this._indexed = 0;
    if (!Array.isArray(rules)) {
      rules = getRulesFromDataset(rules);
    }
    rules = rules.map(rule => this._createRule(rule));

    // Reject rules with more body triples than the configured premise depth:
    // `_evaluatePremise` recurses once per premise, so an over-long rule would
    // otherwise overflow the stack with an uncatchable RangeError.
    for (const rule of rules) {
      if (rule.premise.length > this._maxPremiseDepth)
        throw new Error(`Reasoning rule exceeds the maximum premise depth of ${this._maxPremiseDepth}`);
    }

    for (const r1 of rules) {
      for (const r2 of rules) {
        for (let i = 0; i < r2.premise.length; i++) {
          const p = r2.premise[i];
          for (const c of r1.conclusion) {
            if (termEq(p.subject, c.subject) && termEq(p.predicate, c.predicate) && termEq(p.object, c.object)) {
              const set = new Set();

              const premise = [];

              // Since these *will* be substituted when we apply the rule,
              // we need to do this, so that we index correctly in the subsequent section
              p.subject.value = p.subject.value || 1;
              p.object.value = p.object.value || 1;
              p.predicate.value = p.predicate.value || 1;

              for (let j = 0; j < r2.premise.length; j++) {
                if (j !== i) {
                  premise.push(getIndex(r2.premise[j], set));
                }
              }

              // eslint-disable-next-line no-warning-comments
              // TODO: Create new rule, with new indexing
              //       Future, 'collapse' the next statements when they share a premise/base-premise
              (c.next = c.next || []).push({
                premise,
                conclusion: r2.conclusion,
                // This is a single premise of the form { subject, predicate, object },
                // which we can use to instantiate the rule using the new data that was emitted
                basePremise: p,
              });
            }
            for (let k = 0; k < r2.variables.length; k++) r2.variables[k].value = null;
          }
        }
      }
    }

    for (const rule of rules) {
      const set = new Set();
      rule.premise = rule.premise.map(p => getIndex(p, set));
    }

    const graphs = this._store._getGraphs();
    try {
      for (const graphId in graphs) {
        // Observers compare numeric graph identifiers
        this._graphId = Number(graphId);
        this._reasonGraphNaive(rules, graphs[graphId]);
      }
    }
    finally {
      // Count the quads added directly to the indexes, even if a derivation
      // budget was exceeded, so a caught budget error leaves the store consistent
      if (this._store._size !== null)
        this._store._size += this._indexed;
    }
  }
}

function getIndex({ subject, predicate, object }, set) {
  const s = subject.value   || set.has(subject)   || (set.add(subject), false);
  const p = predicate.value || set.has(predicate) || (set.add(predicate), false);
  const o = object.value    || set.has(object)    || (set.add(object), false);

  return (!s && p) ? { content: 'predicates', value: [predicate, object, subject] } :
    o ? { content: 'objects', value: [object, subject, predicate] } :
        { content: 'subjects', value: [subject, predicate, object] };
}

function termEq(t1, t2) {
  if (t1.value === null) {
    t1.value = t2.value;
  }
  return t1.value === t2.value;
}

// **N3StreamParser** parses a text stream into a quad stream.

// ## Constructor
class N3StreamParser extends browserExports.Transform {
  constructor(options) {
    super({ decodeStrings: true, readableObjectMode: true });

    // Set up parser with dummy stream to obtain `data` and `end` callbacks
    const parser = new N3Parser(options);
    let onData, onEnd;

    const callbacks = {
        // Handle quads by pushing them down the pipeline
      onQuad: (error, quad) => { error && this.emit('error', error) || quad && this.push(quad); },
        // Emit prefixes through the `prefix` event
      onPrefix: (prefix, uri) => { this.emit('prefix', prefix, uri); },
        // Emit additional directives through the `directive` event
      onDirective: name => { this.emit('directive', name); },
    };

    if (options && options.comments)
      callbacks.onComment = comment => { this.emit('comment', comment); };

    parser.parse({
      on: (event, callback) => {
        switch (event) {
        case 'data': onData = callback; break;
        case 'end':   onEnd = callback; break;
        }
      },
    }, callbacks);

    // Implement Transform methods through parser callbacks
    this._transform = (chunk, encoding, done) => { onData(chunk); done(); };
    this._flush = done => { onEnd(); done(); };
  }

  // ### Parses a stream of strings
  import(stream) {
    stream.on('error', error => { this.emit('error', error); });
    if (typeof stream.pipe === 'function')
      stream.pipe(this);
    else {
      stream.on('data', chunk => { this.write(chunk); });
      stream.on('end',  ()    => { this.end(); });
    }
    return this;
  }
}

// **N3StreamWriter** serializes a quad stream into a text stream.

const MIN_CHUNK_SIZE = 16 * 1024;
const DEFAULT_FLUSH_DELAY_MS = 20;

// ## Constructor
class N3StreamWriter extends browserExports.Transform {
  constructor(options) {
    super({ encoding: 'utf8', writableObjectMode: true });

    // Coalesce serialized fragments into larger stream chunks
    this._buffer = '';

    // Flush partial chunks after a bounded delay
    this._flushTimer = null;
    this._flushDelay = options && options.flushDelay !== undefined ?
      options.flushDelay : DEFAULT_FLUSH_DELAY_MS;

    // Set up writer with a dummy stream object
    const writer = this._writer = new N3Writer({
      write: (chunk, encoding, callback) => {
        this._buffer += chunk;
        if (this._buffer.length >= MIN_CHUNK_SIZE)
          this._pushBuffer();
        else if (this._flushTimer === null)
          this._armFlushTimer();
        callback && callback();
      },
      end: callback => { this._pushBuffer(); this.push(null); callback && callback(); },
    }, options);

    // Flush buffered output before serialization errors
    let pendingDone = null;
    const quadDone = error => {
      const done = pendingDone;
      pendingDone = null;
      if (error)
        this._pushBuffer();
      done(error);
    };
    this._transform = (quad, encoding, done) => {
      pendingDone = done;
      writer.addQuad(quad, quadDone);
    };
    this._flush = done => { writer.end(done); };
  }

  // ### `_pushBuffer` flushes coalesced output to the stream queue
  _pushBuffer() {
    this._clearFlushTimer();
    if (this._buffer !== '') {
      this.push(this._buffer);
      this._buffer = '';
    }
  }

  // ### `_armFlushTimer` schedules a partial-chunk flush
  _armFlushTimer() {
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._pushBuffer();
    }, this._flushDelay);
    // Browser timers do not implement `unref`
    this._flushTimer.unref && this._flushTimer.unref();
  }

  // ### `_clearFlushTimer` cancels a scheduled flush
  _clearFlushTimer() {
    if (this._flushTimer !== null) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
  }

  // ### `_destroy` cancels a scheduled flush, so it cannot fire afterwards
  _destroy(error, callback) {
    this._clearFlushTimer();
    super._destroy(error, callback);
  }

// ### Serializes a stream of quads
  import(stream) {
    stream.on('data',   quad => { this.write(quad); });
    stream.on('end',    () => { this.end(); });
    stream.on('error',  error => { this._pushBuffer(); this.emit('error', error); });
    stream.on('prefix', (prefix, iri) => { this._writer.addPrefix(prefix, iri); });
    return this;
  }
}

// Export all named exports as a default object for backward compatibility
var index = {
  Lexer: N3Lexer,
  Parser: N3Parser,
  Writer: N3Writer,
  Store: N3Store,
  StoreFactory: N3DatasetCoreFactory,
  EntityIndex: N3EntityIndex,
  StreamParser: N3StreamParser,
  StreamWriter: N3StreamWriter,
  Util,
  Reasoner: N3Reasoner,
  BaseIRI,

  DataFactory,

  Term,
  NamedNode,
  Literal,
  BlankNode,
  Variable,
  DefaultGraph,
  Quad,
  Triple: Quad,

  termFromId,
  termToId,
};

export { BaseIRI, BlankNode, DataFactory, DefaultGraph, N3EntityIndex as EntityIndex, N3Lexer as Lexer, Literal, NamedNode, N3Parser as Parser, Quad, N3Reasoner as Reasoner, N3Store as Store, N3DatasetCoreFactory as StoreFactory, N3StreamParser as StreamParser, N3StreamWriter as StreamWriter, Term, Quad as Triple, Util, Variable, N3Writer as Writer, index as default, getRulesFromDataset, termFromId, termToId };
