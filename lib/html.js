const parser = require('./parser');
const ooxml = require('./ooxml');
const isSafeUrl = require('../formatters/link').isSafeUrl;

/**
 * Convert HTML into the native formatting of a document (formatter `html`): DOCX and ODT. Other formats receive the text.
 *
 * Supported: bold (b, strong, h1-h6), italic (i, em), underline (u), strikethrough (s, strike, del), superscript (sup), subscript (sub),
 * links (a), line breaks (br), blocks (p, div, h1-h6, ul, ol, li, tr, td, th, blockquote, pre), and simple inline styles
 * (font-weight, font-style, text-decoration). Blocks are separated by line breaks, so the HTML can be used anywhere,
 * for example in a table cell. Everything else is ignored, but the text is kept. Nothing of the HTML can be injected in the document:
 * the document is built from the text and from a fixed list of properties.
 */

const MAX_LENGTH = 1000000;

const ENTITIES = {
  amp : '&', lt : '<', gt : '>', quot : '"', apos : '\'', nbsp : ' ', copy : '©', reg : '®', euro : '€', pound : '£',
  yen : '¥', cent : '¢', hellip : '…', mdash : '—', ndash : '–', lsquo : '‘', rsquo : '’', ldquo : '“',
  rdquo : '”', bull : '•', middot : '·', times : '×', divide : '÷', deg : '°', plusmn : '±', laquo : '«',
  raquo : '»', trade : '™', sect : '§', para : '¶', frac12 : '½', frac14 : '¼', frac34 : '¾'
};

const BLOCK_TAGS = { p : 2, h1 : 2, h2 : 2, h3 : 2, h4 : 2, h5 : 2, h6 : 2, blockquote : 2, pre : 2, div : 1, li : 1, tr : 1, table : 1 };
const RPR_ORDER = ['w:rStyle', 'w:rFonts', 'w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:caps', 'w:smallCaps', 'w:strike', 'w:dstrike', 'w:outline', 'w:shadow',
  'w:emboss', 'w:imprint', 'w:noProof', 'w:snapToGrid', 'w:vanish', 'w:webHidden', 'w:color', 'w:spacing', 'w:w', 'w:kern', 'w:position', 'w:sz',
  'w:szCs', 'w:highlight', 'w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout',
  'w:specVanish', 'w:oMath'];

/** ****************************************************************************************************************/
/* Text                                                                                                           */
/** ****************************************************************************************************************/

function decodeEntities (str) {
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, function (m, entity) {
    if (entity[0] === '#') {
      var _code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      // only characters allowed in XML
      var _valid = _code === 9 || _code === 10 || _code === 13 || (_code >= 0x20 && _code <= 0xD7FF) || (_code >= 0xE000 && _code <= 0xFFFD) || (_code >= 0x10000 && _code <= 0x10FFFF);
      return _valid ? String.fromCodePoint(_code) : '';
    }
    var _decoded = ENTITIES[entity.toLowerCase()];
    return _decoded === undefined ? m : _decoded;
  });
}

function escapeXml (str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // characters which are not allowed in XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

function escapeAttribute (str) {
  return escapeXml(str).replace(/"/g, '&quot;');
}

/**
 * The formatter runs after the data are escaped for XML, so the HTML arrives escaped: &lt;b&gt;
 */
function unescapeXml (str) {
  return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** ****************************************************************************************************************/
/* HTML -> units                                                                                                  */
/** ****************************************************************************************************************/

function parseInlineStyle (style, flags) {
  var _flags = Object.assign({}, flags);
  if (typeof style !== 'string') {
    return _flags;
  }
  var _lower = style.toLowerCase();
  if (/font-weight\s*:\s*(bold|bolder|[6-9]00)/.test(_lower)) {
    _flags.b = true;
  }
  if (/font-style\s*:\s*(italic|oblique)/.test(_lower)) {
    _flags.i = true;
  }
  if (/text-decoration[a-z-]*\s*:[^;]*underline/.test(_lower)) {
    _flags.u = true;
  }
  if (/text-decoration[a-z-]*\s*:[^;]*line-through/.test(_lower)) {
    _flags.s = true;
  }
  return _flags;
}

/**
 * Transform HTML into a list of units: text with its formatting, line breaks and tabs
 *
 * @param  {String} html  HTML
 * @return {Array}        [{ type : 'text', text, flags : { b, i, u, s, x, y }, link }, { type : 'break' }, { type : 'tab' }]
 */
function parseHtml (html) {
  var _units = [];
  var _stack = [{ tag : '', flags : {}, link : null }];
  var _lists = [];
  var _pendingBreaks = 0;
  var _lineEmpty = true;
  var _preDepth = 0;
  var _skipUntil = null; // script and style: content ignored
  var _cellIndex = 0;

  function top () {
    return _stack[_stack.length - 1];
  }
  function trimEnd () {
    var _last = _units[_units.length - 1];
    if (_last && _last.type === 'text' && _preDepth === 0) {
      _last.text = _last.text.replace(/ +$/, '');
    }
  }
  function flushBreaks () {
    if (_units.length > 0 && _pendingBreaks > 0) {
      trimEnd();
      for (var i = 0; i < _pendingBreaks; i++) {
        _units.push({ type : 'break' });
      }
    }
    _pendingBreaks = 0;
  }
  function block (count) {
    _pendingBreaks = Math.max(_pendingBreaks, count);
    _lineEmpty = true;
  }
  function emitText (text) {
    if (_preDepth > 0) {
      text.split(/\r\n|\r|\n/).forEach(function (line, index) {
        if (index > 0) {
          flushBreaks();
          _units.push({ type : 'break' });
          _lineEmpty = true;
        }
        if (line !== '') {
          emitText2(line);
        }
      });
      return;
    }
    text = text.replace(/[ \t\r\n\f]+/g, ' ');
    var _previous = _units[_units.length - 1];
    // like a browser, a space after another space is ignored, even if there is a tag between them
    if (_lineEmpty === true || (_previous && _previous.type === 'text' && / $/.test(_previous.text))) {
      text = text.replace(/^ /, '');
    }
    if (text !== '') {
      emitText2(text);
    }
  }
  function emitText2 (text) {
    flushBreaks();
    _units.push({ type : 'text', text : text, flags : Object.assign({}, top().flags), link : top().link });
    _lineEmpty = false;
  }

  var _tagRegex = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  var _position = 0;
  var _tag;
  var _source = html.slice(0, MAX_LENGTH);
  while ((_tag = _tagRegex.exec(_source)) !== null) {
    if (_skipUntil === null && _tag.index > _position) {
      emitText(decodeEntities(_source.slice(_position, _tag.index)));
    }
    _position = _tag.index + _tag[0].length;
    if (_tag[2] === undefined) {
      continue; // comment
    }
    var _name = _tag[2].toLowerCase();
    var _isClosing = _tag[1] === '/';
    if (_skipUntil !== null) {
      if (_isClosing === true && _name === _skipUntil) {
        _skipUntil = null;
      }
      continue;
    }
    if (_isClosing === false && (_name === 'script' || _name === 'style')) {
      _skipUntil = _name;
      continue;
    }
    if (_name === 'br') {
      flushBreaks();
      _units.push({ type : 'break' });
      _lineEmpty = true;
      continue;
    }
    if (_isClosing === true) {
      // close the last opened tag with the same name. A closing tag without opening tag is ignored
      var _isOpened = false;
      for (var s = _stack.length - 1; s > 0; s--) {
        if (_stack[s].tag === _name) {
          _stack.length = s;
          _isOpened = true;
          break;
        }
      }
      if (_isOpened === false) {
        continue;
      }
      if (_name === 'ul' || _name === 'ol') {
        _lists.pop();
        block(_lists.length > 0 ? 1 : 2);
      }
      else if (_name === 'pre') {
        _preDepth = Math.max(_preDepth - 1, 0);
        block(BLOCK_TAGS.pre);
      }
      else if (BLOCK_TAGS[_name]) {
        block(BLOCK_TAGS[_name]);
      }
      continue;
    }
    if (_tag[3].replace(/\/\s*$/, '').trim() !== _tag[3].trim() && /^(img|hr|input|meta|link)$/.test(_name)) {
      continue;
    }
    // opening tag
    var _attributes = _tag[3];
    var _flags = Object.assign({}, top().flags);
    var _link = top().link;
    switch (_name) {
      case 'b': case 'strong':
        _flags.b = true;
        break;
      case 'i': case 'em': case 'cite': case 'dfn':
        _flags.i = true;
        break;
      case 'u': case 'ins':
        _flags.u = true;
        break;
      case 's': case 'strike': case 'del':
        _flags.s = true;
        break;
      case 'sup':
        _flags.x = true;
        _flags.y = false;
        break;
      case 'sub':
        _flags.y = true;
        _flags.x = false;
        break;
      case 'a':
        var _href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(_attributes);
        var _url = _href === null ? '' : decodeEntities(_href[1] || _href[2] || _href[3] || '').trim();
        _link = (_url !== '' && isSafeUrl(_url) === true) ? _url : null;
        break;
      default:
        break;
    }
    if (/^h[1-6]$/.test(_name)) {
      _flags.b = true;
    }
    var _style = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(_attributes);
    if (_style !== null) {
      _flags = parseInlineStyle(decodeEntities(_style[1] || _style[2] || ''), _flags);
    }
    if (_name === 'ul' || _name === 'ol') {
      block(_lists.length > 0 ? 1 : 2);
      _lists.push({ type : _name, counter : 0 });
    }
    else if (_name === 'li') {
      block(1);
      var _list = _lists[_lists.length - 1];
      var _indent = '    '.repeat(Math.max(_lists.length - 1, 0));
      emitText2(_indent + (_list && _list.type === 'ol' ? (++_list.counter) + '. ' : '• '));
    }
    else if (_name === 'pre') {
      block(BLOCK_TAGS.pre);
      _preDepth++;
    }
    else if (_name === 'tr') {
      block(1);
      _cellIndex = 0;
    }
    else if (_name === 'td' || _name === 'th') {
      if (_cellIndex++ > 0) {
        flushBreaks();
        _units.push({ type : 'tab' });
        _lineEmpty = false;
      }
      if (_name === 'th') {
        _flags.b = true;
      }
    }
    else if (BLOCK_TAGS[_name]) {
      block(BLOCK_TAGS[_name]);
    }
    if (/^(img|hr|input|meta|link)$/.test(_name) === false) {
      _stack.push({ tag : _name, flags : _flags, link : _link });
    }
  }
  if (_skipUntil === null && _position < _source.length) {
    emitText(decodeEntities(_source.slice(_position)));
  }
  trimEnd();
  return _units;
}

/** ****************************************************************************************************************/
/* Units -> document                                                                                              */
/** ****************************************************************************************************************/

function styleKey (flags) {
  return ['b', 'i', 'u', 's', 'x', 'y'].filter(function (flag) {
    return flags[flag] === true;
  }).join('');
}

/**
 * Build the properties of a run (DOCX): the properties of the run which contains the marker, and the formatting of the HTML
 *
 * @param  {String} baseXml   content of `w:rPr` of the run which contains the marker, or ''
 * @param  {Object} flags     b, i, u, s, x, y
 * @param  {Boolean} isLink   true for a link
 * @return {String}           `w:rPr` or ''
 */
function buildRunProperties (baseXml, flags, isLink) {
  var _properties = {};
  var _unknown = [];
  ooxml.getChildren(baseXml).forEach(function (child) {
    if (RPR_ORDER.indexOf(child.name) === -1) {
      _unknown.push(baseXml.slice(child.start, child.end));
    }
    else {
      _properties[child.name] = baseXml.slice(child.start, child.end);
    }
  });
  if (flags.b === true) {
    _properties['w:b'] = '<w:b/>';
    _properties['w:bCs'] = '<w:bCs/>';
  }
  if (flags.i === true) {
    _properties['w:i'] = '<w:i/>';
    _properties['w:iCs'] = '<w:iCs/>';
  }
  if (flags.s === true) {
    _properties['w:strike'] = '<w:strike/>';
  }
  if (flags.u === true || isLink === true) {
    _properties['w:u'] = '<w:u w:val="single"/>';
  }
  if (isLink === true) {
    _properties['w:color'] = '<w:color w:val="0563C1"/>';
  }
  if (flags.x === true) {
    _properties['w:vertAlign'] = '<w:vertAlign w:val="superscript"/>';
  }
  if (flags.y === true) {
    _properties['w:vertAlign'] = '<w:vertAlign w:val="subscript"/>';
  }
  var _content = RPR_ORDER.filter(function (name) {
    return _properties[name] !== undefined;
  }).map(function (name) {
    return _properties[name];
  }).join('') + _unknown.join('');
  return _content === '' ? '' : '<w:rPr>' + _content + '</w:rPr>';
}

/**
 * XML to insert inside a `w:t` of a DOCX. The run is closed, then runs are written, then a run is opened again to receive
 * the end of the text of the template, with the properties of the original run.
 */
function toDocx (units, baseRunProperties) {
  var _base = baseRunProperties || '';
  var _out = '</w:t></w:r>';
  units.forEach(function (unit) {
    if (unit.type === 'break') {
      _out += '<w:r>' + buildRunProperties(_base, {}, false) + '<w:br/></w:r>';
    }
    else if (unit.type === 'tab') {
      _out += '<w:r>' + buildRunProperties(_base, {}, false) + '<w:tab/></w:r>';
    }
    else {
      var _run = '<w:r>' + buildRunProperties(_base, unit.flags, unit.link !== null) + '<w:t xml:space="preserve">' + escapeXml(unit.text) + '</w:t></w:r>';
      if (unit.link !== null) {
        _run = '<w:fldSimple w:instr=" HYPERLINK &quot;' + escapeAttribute(unit.link.replace(/"/g, '%22')) + '&quot; ">' + _run + '</w:fldSimple>';
      }
      _out += _run;
    }
  });
  return _out + '<w:r>' + (_base === '' ? '' : '<w:rPr>' + _base + '</w:rPr>') + '<w:t xml:space="preserve">';
}

/**
 * XML to insert in a paragraph or a span of an ODT. Styles `CarboneHtml_<flags>` are created after data injection (see resolveOdfStyles)
 */
function toOdt (units) {
  return units.map(function (unit) {
    if (unit.type === 'break') {
      return '<text:line-break/>';
    }
    if (unit.type === 'tab') {
      return '<text:tab/>';
    }
    // consecutive spaces are not displayed in ODF, they must be written with text:s
    var _text = escapeXml(unit.text).replace(/ {2,}/g, function (spaces) {
      return ' <text:s text:c="' + (spaces.length - 1) + '"/>';
    });
    var _key = styleKey(unit.flags);
    var _span = _key === '' ? _text : '<text:span text:style-name="CarboneHtml_' + _key + '">' + _text + '</text:span>';
    if (unit.link !== null) {
      _span = '<text:a xlink:type="simple" xlink:href="' + escapeAttribute(unit.link) + '"><text:span text:style-name="CarboneHtml_u">' + _span + '</text:span></text:a>';
    }
    return _span;
  }).join('');
}

function toText (units) {
  return units.map(function (unit) {
    return unit.type === 'break' ? '\n' : (unit.type === 'tab' ? '\t' : escapeXml(unit.text));
  }).join('');
}

var html = {

  parseHtml,
  decodeEntities,
  buildRunProperties,

  /**
   * Convert HTML (already escaped for XML, as it is when a formatter which injects XML receives it)
   *
   * @param  {String} escapedHtml  html, escaped for XML
   * @param  {String} extension    extension of the template: docx, odt, ...
   * @param  {String} runProperties [only for docx] content of `w:rPr` of the run which contains the marker
   * @return {String}              XML to inject
   */
  convert : function (escapedHtml, extension, runProperties) {
    var _units = parseHtml(unescapeXml(escapedHtml));
    if (_units.length === 0) {
      return '';
    }
    if (extension === 'docx') {
      return toDocx(_units, runProperties);
    }
    if (extension === 'odt') {
      return toOdt(_units);
    }
    return toText(_units);
  },

  /**
   * Save the properties of the run which contains each `html` marker (DOCX), to keep the font and the size of the text.
   * `{d.text:html}` becomes `{d.text:html('<id>')}`. A marker which is not inside a run is not modified.
   *
   * @param  {String} xml      xml without XML inside markers
   * @param  {Object} options  options (modified): options.htmlRunProperties is an array of `w:rPr` contents
   * @return {String}          xml
   */
  expandHtmlMarkers : function (xml, options) {
    if (typeof xml !== 'string' || xml.indexOf(':html') === -1 || !options || xml.indexOf('<w:r') === -1) {
      return xml;
    }
    var _regex = /\{[^{}]*?(:html)(?:\(\s*\))?(?=[:}])/g;
    var _result = xml;
    var _from = 0;
    for (var _guard = 0; _guard < 10000; _guard++) {
      _regex.lastIndex = _from;
      var _match = _regex.exec(_result);
      if (_match === null) {
        break;
      }
      var _start = _match.index;
      var _end = _start + _match[0].length;
      _from = _end;
      var _run = parser.findElementAroundMarker(_result, _start, _match[0].length, ['w:r'], 1);
      if (_run === null) {
        continue;
      }
      var _closeStart = _result.lastIndexOf('</w:r', _run.closeEnd);
      var _properties = /^\s*<w:rPr>/.exec(_result.slice(_run.openEnd, _closeStart));
      var _content = '';
      if (_properties !== null) {
        var _rPrOpen = _run.openEnd + _properties[0].length;
        var _rPrEnd = parser.findClosingTagEnd(_result, _rPrOpen, 'w:rPr');
        if (_rPrEnd !== -1) {
          _content = _result.slice(_rPrOpen, _result.lastIndexOf('</w:rPr', _rPrEnd));
        }
      }
      if (!options.htmlRunProperties) {
        options.htmlRunProperties = [];
      }
      options.htmlRunProperties.push(_content);
      var _id = options.htmlRunProperties.length - 1;
      var _call = ":html('" + _id + "')";
      _result = _result.slice(0, _start) + _match[0].replace(/:html(?:\(\s*\))?$/, _call) + _result.slice(_end);
      _from = _start + _match[0].length + _call.length;
    }
    return _result;
  },

  /**
   * Create styles used by the HTML converted in ODF files: CarboneHtml_<flags>, where flags are b, i, u, s, x (superscript), y (subscript)
   *
   * @param {Object} report  report object: { files : [{ name, data }] }
   */
  resolveOdfStyles : function (report) {
    if (!report || !(report.files instanceof Array)) {
      return;
    }
    var PROPERTIES = {
      b : 'fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"',
      i : 'fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"',
      u : 'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"',
      s : 'style:text-line-through-style="solid" style:text-line-through-type="single"',
      x : 'style:text-position="super 58%"',
      y : 'style:text-position="sub 58%"'
    };
    report.files.forEach(function (part) {
      if (typeof part.data !== 'string' || part.data.indexOf('CarboneHtml_') === -1) {
        return;
      }
      var _names = {};
      part.data.replace(/text:style-name="CarboneHtml_([biusxy]+)"/g, function (m, key) {
        _names[key] = true;
        return m;
      });
      var _styles = Object.keys(_names).filter(function (key) {
        return part.data.indexOf('style:name="CarboneHtml_' + key + '"') === -1;
      }).map(function (key) {
        return '<style:style style:name="CarboneHtml_' + key + '" style:family="text"><style:text-properties ' + key.split('').map(function (flag) {
          return PROPERTIES[flag];
        }).join(' ') + '/></style:style>';
      }).join('');
      if (_styles === '') {
        return;
      }
      if (part.data.indexOf('</office:automatic-styles>') !== -1) {
        part.data = part.data.replace('</office:automatic-styles>', function () {
          return _styles + '</office:automatic-styles>';
        });
      }
      else if (part.data.indexOf('<office:automatic-styles/>') !== -1) {
        part.data = part.data.replace('<office:automatic-styles/>', function () {
          return '<office:automatic-styles>' + _styles + '</office:automatic-styles>';
        });
      }
    });
  }
};

module.exports = html;
