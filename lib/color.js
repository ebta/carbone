const crypto = require('crypto');
const parser = require('./parser');
const ooxml = require('./ooxml');
const getChildren = ooxml.getChildren;

/**
 * Color markers for DOCX templates: `{d.color:color(scope, type)}`
 *
 * The marker is removed from the document, and Carbone generates other markers `{d.color:_color}` in XML attributes
 * (`w:color` for the text, `w:shd` for the background). The element order defined by the OOXML schema is respected,
 * otherwise Microsoft Word could consider the file as corrupted.
 */

// elements of the docx XML, for each scope
const SCOPES = {
  p    : 'w:p',
  cell : 'w:tc',
  row  : 'w:tr'
};

// elements which must be after the inserted element in their parent (OOXML schema order)
const AFTER_COLOR_IN_RPR = ['w:spacing', 'w:w', 'w:kern', 'w:position', 'w:sz', 'w:szCs', 'w:highlight', 'w:u', 'w:effect', 'w:bdr', 'w:shd',
  'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout', 'w:specVanish', 'w:oMath', 'w:rPrChange'];
const AFTER_SHD_IN_PPR = ['w:tabs', 'w:suppressAutoHyphens', 'w:kinsoku', 'w:wordWrap', 'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE',
  'w:autoSpaceDN', 'w:bidi', 'w:adjustRightInd', 'w:snapToGrid', 'w:spacing', 'w:ind', 'w:contextualSpacing', 'w:mirrorIndents',
  'w:suppressOverlap', 'w:jc', 'w:textDirection', 'w:textAlignment', 'w:textboxTightWrap', 'w:outlineLvl', 'w:divId', 'w:cnfStyle',
  'w:rPr', 'w:sectPr', 'w:pPrChange'];
const AFTER_SHD_IN_TCPR = ['w:noWrap', 'w:tcMar', 'w:textDirection', 'w:tcFitText', 'w:vAlign', 'w:hideMark', 'w:headers', 'w:cellIns',
  'w:cellDel', 'w:cellMerge', 'w:tcPrChange'];

/**
 * Set a child in a parent XML fragment. The child is replaced if it already exists, or inserted before the first
 * element which must be after it, or at the end.
 *
 * @private
 */
function setChild (content, name, childXml, afterTags) {
  var _children = getChildren(content);
  for (var i = 0; i < _children.length; i++) {
    if (_children[i].name === name) {
      return content.slice(0, _children[i].start) + childXml + content.slice(_children[i].end);
    }
  }
  var _position = content.length;
  for (var j = 0; j < _children.length; j++) {
    if (afterTags.indexOf(_children[j].name) !== -1) {
      _position = _children[j].start;
      break;
    }
  }
  return content.slice(0, _position) + childXml + content.slice(_position);
}

/**
 * Set a property in the properties element (pPr, rPr, tcPr), which must be the first child of an element.
 * The properties element is created if it does not exist.
 *
 * @private
 * @param  {String} inner      content of the element (paragraph, run, cell), without its own tags
 * @param  {String} propsName  ex. "w:pPr"
 * @param  {String} childName  ex. "w:shd"
 * @param  {String} childXml   ex. "<w:shd w:fill="FF0000"/>"
 * @param  {Array}  afterTags  elements which must be after the child
 * @return {String}            updated `inner`
 */
function setProperty (inner, propsName, childName, childXml, afterTags) {
  var _open = new RegExp('^\\s*<' + propsName + '(?:\\s[^>]*?)?(\\/?)>').exec(inner);
  if (_open === null) {
    return '<' + propsName + '>' + childXml + '</' + propsName + '>' + inner;
  }
  if (_open[1] === '/') {
    return '<' + propsName + '>' + childXml + '</' + propsName + '>' + inner.slice(_open[0].length);
  }
  var _contentStart = _open[0].length;
  var _closeEnd = parser.findClosingTagEnd(inner, _contentStart, propsName);
  if (_closeEnd === -1) {
    return inner;
  }
  var _closeStart = inner.lastIndexOf('</' + propsName, _closeEnd);
  return inner.slice(0, _contentStart) + setChild(inner.slice(_contentStart, _closeStart), childName, childXml, afterTags) + inner.slice(_closeStart);
}

/**
 * Change the color of the text of all runs of an XML fragment
 *
 * @private
 */
function setTextColor (inner, marker) {
  var _regex = /<w:r(?=[\s>\/])(?:\s[^>]*?)?(\/?)>/g;
  var _runs = [];
  var _tag;
  while ((_tag = _regex.exec(inner)) !== null) {
    if (_tag[1] !== '/') {
      _runs.push({ start : _tag.index, openEnd : _tag.index + _tag[0].length });
    }
  }
  var _childXml = '<w:color w:val="' + marker + '"/>';
  // from the last to the first, to keep positions valid
  for (var i = _runs.length - 1; i >= 0; i--) {
    var _closeEnd = parser.findClosingTagEnd(inner, _runs[i].openEnd, 'w:r');
    if (_closeEnd === -1) {
      continue;
    }
    var _closeStart = inner.lastIndexOf('</w:r', _closeEnd);
    inner = inner.slice(0, _runs[i].openEnd) + setProperty(inner.slice(_runs[i].openEnd, _closeStart), 'w:rPr', 'w:color', _childXml, AFTER_COLOR_IN_RPR) + inner.slice(_closeStart);
  }
  return inner;
}

function setShading (inner, propsName, afterTags, marker) {
  return setProperty(inner, propsName, 'w:shd', '<w:shd w:val="clear" w:color="auto" w:fill="' + marker + '"/>', afterTags);
}

/**
 * Change the background of all cells of a row
 *
 * @private
 */
function setRowBackground (inner, marker) {
  var _cells = getChildren(inner).filter(function (child) {
    return child.name === 'w:tc';
  });
  for (var i = _cells.length - 1; i >= 0; i--) {
    var _cell = _cells[i];
    var _openEnd = /^<w:tc(?:\s[^>]*?)?>/.exec(inner.slice(_cell.start, _cell.end))[0].length + _cell.start;
    var _closeStart = inner.lastIndexOf('</w:tc', _cell.end);
    inner = inner.slice(0, _openEnd) + setShading(inner.slice(_openEnd, _closeStart), 'w:tcPr', AFTER_SHD_IN_TCPR, marker) + inner.slice(_closeStart);
  }
  return inner;
}

/** ****************************************************************************************************************/
/* ODF (ODT)                                                                                                      */
/** ****************************************************************************************************************/

// elements of the ODF XML, for each scope
const ODF_SCOPES = {
  p    : ['text:p', 'text:h'],
  cell : ['table:table-cell'],
  row  : ['table:table-row']
};
const ODF_TOKEN_REGEX = /((?:CARBONE_ODC_\d+)+)$/;

/**
 * Add tokens at the end of the style name of an opening tag. The attribute is created if it does not exist.
 *
 * @private
 */
function addTokensToTag (tag, attribute, tokens) {
  var _regex = new RegExp('(\\s' + attribute + '=")([^"]*)(")');
  if (_regex.test(tag) === true) {
    return tag.replace(_regex, function (m, before, value, after) {
      return before + value + tokens + after;
    });
  }
  return tag.replace(/^<([\w:.-]+)/, function (m, name) {
    return '<' + name + ' ' + attribute + '="' + tokens + '"';
  });
}

/**
 * Add tokens in the opening tags of paragraphs found in a fragment
 *
 * @private
 */
function addTokensToParagraphs (inner, tokens) {
  return inner.replace(/<(?:text:p|text:h)\b[^>]*>/g, function (tag) {
    return addTokensToTag(tag, 'text:style-name', tokens);
  });
}

/**
 * Update or add an attribute in a property element (ex. style:text-properties) of the XML of a style
 *
 * @private
 */
function setStyleProperty (styleXml, element, attribute, value) {
  var _regex = new RegExp('<' + element + '\\b([^>]*?)(\\/?)>');
  var _found = _regex.exec(styleXml);
  if (_found === null) {
    return styleXml.replace('</style:style>', '<' + element + ' ' + attribute + '="' + value + '"/></style:style>');
  }
  var _attributes = _found[1];
  var _attributeRegex = new RegExp('(\\s' + attribute + ')="[^"]*"');
  _attributes = _attributeRegex.test(_attributes) ? _attributes.replace(_attributeRegex, '$1="' + value + '"') : _attributes + ' ' + attribute + '="' + value + '"';
  return styleXml.replace(_regex, '<' + element + _attributes + _found[2] + '>');
}

/**
 * Get the XML of a style defined in a part, or null
 *
 * @private
 */
function findStyle (xml, name, family) {
  var _escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var _open = new RegExp('<style:style\\b(?=[^>]*\\bstyle:name="' + _escaped + '")(?=[^>]*\\bstyle:family="' + family + '")[^>]*?(\\/?)>').exec(xml);
  if (_open === null) {
    return null;
  }
  if (_open[1] === '/') {
    return _open[0].replace(/\/>$/, '></style:style>');
  }
  var _end = xml.indexOf('</style:style>', _open.index);
  return _end === -1 ? null : xml.slice(_open.index, _end + '</style:style>'.length);
}

/**
 * Create the XML of a style, which is a copy of an existing style with colors, or a child of a common style
 *
 * @private
 */
function buildStyle (xml, newName, originalName, family, colors) {
  var _style = originalName === '' ? null : findStyle(xml, originalName, family);
  if (_style !== null) {
    _style = _style.replace(/(<style:style\b[^>]*?\bstyle:name=")[^"]*(")/, function (m, before, after) {
      return before + newName + after;
    });
  }
  else {
    _style = '<style:style style:name="' + newName + '" style:family="' + family + '"' + (originalName !== '' ? ' style:parent-style-name="' + originalName + '"' : '') + '></style:style>';
  }
  colors.forEach(function (entry) {
    if (family === 'paragraph' && entry.kind === 'text') {
      _style = setStyleProperty(_style, 'style:text-properties', 'fo:color', '#' + entry.color);
    }
    else if (family === 'paragraph') {
      _style = setStyleProperty(_style, 'style:paragraph-properties', 'fo:background-color', '#' + entry.color);
    }
    else if (entry.kind === 'background') {
      _style = setStyleProperty(_style, 'style:table-cell-properties', 'fo:background-color', '#' + entry.color);
    }
    else {
      // text color of a cell of a spreadsheet
      _style = setStyleProperty(_style, 'style:text-properties', 'fo:color', '#' + entry.color);
    }
  });
  return _style;
}

/** ****************************************************************************************************************/
/* XLSX                                                                                                           */
/** ****************************************************************************************************************/

const XLSX_TOKEN_REGEX = /^(\d*)((?:CARBONE_XC_\d+)+)$/;
// order of children of `font` in a styles.xml (OOXML schema)
const XLSX_FONT_ORDER = ['b', 'i', 'strike', 'condense', 'extend', 'outline', 'shadow', 'u', 'vertAlign', 'sz', 'color', 'name', 'family', 'charset', 'scheme'];

function setAttribute (tag, name, value) {
  var _regex = new RegExp('(\\s' + name + ')="[^"]*"');
  if (_regex.test(tag) === true) {
    return tag.replace(_regex, '$1="' + value + '"');
  }
  // new attributes are added at the end of the tag
  return tag.replace(/(\/?>)$/, ' ' + name + '="' + value + '"$1');
}

/**
 * Get the elements of a list of a styles.xml (fonts, fills, cellXfs)
 *
 * @private
 * @return {Object} { start, end, open, items }, where start and end are the positions of the whole list, `open` is its opening tag
 */
function readXlsxList (xml, listName) {
  var _open = new RegExp('<' + listName + '\\b[^>]*?(\\/?)>').exec(xml);
  if (_open === null || _open[1] === '/') {
    return null;
  }
  var _contentStart = _open.index + _open[0].length;
  var _close = xml.indexOf('</' + listName + '>', _contentStart);
  if (_close === -1) {
    return null;
  }
  var _content = xml.slice(_contentStart, _close);
  return {
    start : _open.index,
    end   : _close + listName.length + 3,
    open  : _open[0],
    items : ooxml.getChildren(_content).map(function (child) {
      return _content.slice(child.start, child.end);
    })
  };
}

function writeXlsxList (xml, list, listName) {
  return xml.slice(0, list.start) + setAttribute(list.open, 'count', list.items.length) + list.items.join('') + '</' + listName + '>' + xml.slice(list.end);
}

/**
 * Add an item at the end of a list of styles, if it does not already exist
 *
 * @private
 * @return {Integer} index of the item
 */
function indexOfOrPush (items, item) {
  var _index = items.lastIndexOf(item);
  if (_index === -1) {
    items.push(item);
    _index = items.length - 1;
  }
  return _index;
}

function xlsxFontWithColor (fontXml, rgb) {
  var _inner = '';
  var _open = /^<font\b[^>]*?(\/?)>/.exec(fontXml);
  if (_open !== null && _open[1] !== '/') {
    _inner = fontXml.slice(_open[0].length, fontXml.lastIndexOf('</font>'));
  }
  var _children = {};
  var _unknown = [];
  ooxml.getChildren(_inner).forEach(function (child) {
    if (XLSX_FONT_ORDER.indexOf(child.name) === -1) {
      _unknown.push(_inner.slice(child.start, child.end));
    }
    else {
      _children[child.name] = _inner.slice(child.start, child.end);
    }
  });
  _children.color = '<color rgb="FF' + rgb + '"/>';
  return '<font>' + XLSX_FONT_ORDER.filter(function (name) {
    return _children[name] !== undefined;
  }).map(function (name) {
    return _children[name];
  }).join('') + _unknown.join('') + '</font>';
}

var color = {

  /**
   * Replace `color` markers by identifiers in style names of an ODF file (ODT).
   *
   * `{d.color:color(p, text)}`: the paragraph. `color(cell, text)`: all paragraphs of the cell. `color(row, background)`: all cells of the row.
   * A marker which is not inside the wanted element, or with unknown scope or type, is not modified.
   *
   * @param  {String} xml  xml without XML inside markers (see parser.removeXMLInsideMarkers)
   * @return {String}      xml where `color` markers are replaced
   */
  expandOdfColorMarkers : function (xml) {
    if (typeof xml !== 'string' || xml.indexOf(':color(') === -1) {
      return xml;
    }
    var _markerRegex = /\{([^{}]*?):color\(\s*(?:'|")?(\w+)(?:'|")?\s*,\s*(?:'|")?(\w+)(?:'|")?\s*\)[^{}]*\}/g;
    var _result = xml;
    var _searchFrom = 0;
    // in a spreadsheet, the color of the text is a property of the style of the cell, a paragraph cannot change it
    var _isSpreadsheet = xml.indexOf('<office:spreadsheet') !== -1;
    for (var _guard = 0; _guard < 10000; _guard++) {
      _markerRegex.lastIndex = _searchFrom;
      var _match = _markerRegex.exec(_result);
      if (_match === null) {
        break;
      }
      var _scope = _match[2].toLowerCase();
      var _type = _match[3].toLowerCase();
      var _element = (ODF_SCOPES[_scope] && (_type === 'text' || _type === 'background')) ?
        parser.findElementAroundMarker(_result, _match.index, _match[0].length, ODF_SCOPES[_scope], 1) : null;
      if (_element === null) {
        _searchFrom = _match.index + _match[0].length;
        continue;
      }
      var _tokens = '{' + _match[1] + ":_odfColor('" + _type + "')}";
      var _without = _result.slice(0, _match.index) + _result.slice(_match.index + _match[0].length);
      var _closeStart = _without.lastIndexOf('</' + _element.name, _element.closeEnd - _match[0].length);
      var _openStart = _without.lastIndexOf('<' + _element.name, _element.openEnd - 1);
      var _openTag = _without.slice(_openStart, _element.openEnd);
      var _inner = _without.slice(_element.openEnd, _closeStart);
      if (_type === 'text' && _scope === 'p') {
        _openTag = addTokensToTag(_openTag, 'text:style-name', _tokens);
      }
      else if (_type === 'text' && _isSpreadsheet === false) {
        // in a text document, the color of the text of a cell is the color of its paragraphs
        _inner = addTokensToParagraphs(_inner, _tokens);
      }
      else if (_scope === 'p') {
        _openTag = addTokensToTag(_openTag, 'text:style-name', _tokens);
      }
      else if (_scope === 'cell') {
        _openTag = addTokensToTag(_openTag, 'table:style-name', _tokens);
      }
      else {
        // all cells of the row, but not the cells of nested tables
        var _cells = getChildren(_inner).filter(function (child) {
          return child.name === 'table:table-cell';
        });
        for (var c = _cells.length - 1; c >= 0; c--) {
          var _cellOpen = /^<table:table-cell\b[^>]*>/.exec(_inner.slice(_cells[c].start))[0];
          _inner = _inner.slice(0, _cells[c].start) + addTokensToTag(_cellOpen, 'table:style-name', _tokens) + _inner.slice(_cells[c].start + _cellOpen.length);
        }
      }
      _result = _without.slice(0, _openStart) + _openTag + _inner + _without.slice(_closeStart);
      _searchFrom = _openStart;
    }
    return _result;
  },

  /**
   * Replace `color` markers by identifiers in the style index of cells, in the worksheets of a XLSX.
   * It must be called after shared strings are converted into inline strings, because markers are in the cells.
   *
   * `{d.color:color(cell, background)}`: the cell. `color(row, text)`: all cells of the row. Types: `text` and `background`.
   *
   * @param {Object} template      template returned by file.openTemplate (modified)
   * @param {String} parentFilter  '' for the main file, or the name of an embedded xlsx
   */
  expandXlsxColorMarkers : function (template, parentFilter) {
    if (!template || !(template.files instanceof Array)) {
      return;
    }
    template.files.forEach(function (sheet) {
      if (sheet.parent !== parentFilter || typeof sheet.data !== 'string' || /\.xml$/.test(sheet.name) === false || sheet.name.indexOf('sheet') === -1 || sheet.data.indexOf(':color(') === -1) {
        return;
      }
      var _markerRegex = /\{([^{}]*?):color\(\s*(?:'|")?(\w+)(?:'|")?\s*,\s*(?:'|")?(\w+)(?:'|")?\s*\)[^{}]*\}/g;
      var _xml = sheet.data;
      var _searchFrom = 0;
      for (var _guard = 0; _guard < 10000; _guard++) {
        _markerRegex.lastIndex = _searchFrom;
        var _match = _markerRegex.exec(_xml);
        if (_match === null) {
          break;
        }
        var _scope = _match[2].toLowerCase();
        var _type = _match[3].toLowerCase();
        var _element = ((_scope === 'cell' || _scope === 'row') && (_type === 'text' || _type === 'background')) ?
          parser.findElementAroundMarker(_xml, _match.index, _match[0].length, [_scope === 'cell' ? 'c' : 'row'], 1) : null;
        if (_element === null) {
          _searchFrom = _match.index + _match[0].length;
          continue;
        }
        var _tokens = '{' + _match[1] + ":_xlsxColor('" + _type + "')}";
        var _without = _xml.slice(0, _match.index) + _xml.slice(_match.index + _match[0].length);
        var _closeStart = _without.lastIndexOf('</' + _element.name, _element.closeEnd - _match[0].length);
        var _openStart = _without.lastIndexOf('<' + _element.name, _element.openEnd - 1);
        var _openTag = _without.slice(_openStart, _element.openEnd);
        var _inner = _without.slice(_element.openEnd, _closeStart);
        if (_scope === 'cell') {
          _openTag = addTokensToTag(_openTag, 's', _tokens);
        }
        else {
          _inner = _inner.replace(/<c\b[^>]*>/g, function (cellTag) {
            return addTokensToTag(cellTag, 's', _tokens);
          });
        }
        _xml = _without.slice(0, _openStart) + _openTag + _inner + _without.slice(_closeStart);
        _searchFrom = _openStart;
      }
      sheet.data = _xml;
    });
  },

  /**
   * Create fonts, fills and cell formats which contain colors in the styles.xml of a XLSX, and replace identifiers by the new style indexes.
   *
   * @param {Object} report   report object: { files : [{ name, data, parent }] }
   * @param {Object} options  options, where the formatter _xlsxColor registered colors: { xlsxColors : [{ kind, color }] }
   */
  resolveXlsxColors : function (report, options) {
    if (!options || !(options.xlsxColors instanceof Array) || !report || !(report.files instanceof Array)) {
      return;
    }
    var _files = report.files;
    var _stylesByParent = {};
    _files.forEach(function (sheet) {
      if (typeof sheet.data !== 'string' || sheet.data.indexOf('CARBONE_XC_') === -1) {
        return;
      }
      var _styles = _files.filter(function (file) {
        return file.parent === sheet.parent && /(^|\/)xl\/styles\.xml$/.test(file.name) && typeof file.data === 'string';
      })[0];
      var _state = null;
      if (_styles) {
        _state = _stylesByParent[sheet.parent] = _stylesByParent[sheet.parent] || {
          file   : _styles,
          fonts  : readXlsxList(_styles.data, 'fonts'),
          fills  : readXlsxList(_styles.data, 'fills'),
          xfs    : readXlsxList(_styles.data, 'cellXfs'),
          cache  : {}
        };
      }
      sheet.data = sheet.data.replace(/<c\b[^>]*>/g, function (tag) {
        var _style = /(\ss=")([^"]*)(")/.exec(tag);
        var _parsed = _style === null ? null : XLSX_TOKEN_REGEX.exec(_style[2]);
        if (_parsed === null) {
          return tag;
        }
        var _colors = [];
        _parsed[2].split('CARBONE_XC_').slice(1).forEach(function (index) {
          var _entry = options.xlsxColors[parseInt(index, 10)];
          if (_entry && _entry.color) {
            _colors.push(_entry);
          }
        });
        var _original = _parsed[1];
        var _newIndex = _original;
        if (_colors.length > 0 && _state !== null && _state.fonts && _state.fills && _state.xfs) {
          var _key = _original + '|' + _colors.map(function (entry) { return entry.kind + entry.color; }).join(',');
          if (_state.cache[_key] === undefined) {
            var _xf = _state.xfs.items[_original === '' ? 0 : parseInt(_original, 10)] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
            _colors.forEach(function (entry) {
              var _open = /^<xf\b[^>]*>/.exec(_xf)[0];
              var _newOpen = _open;
              if (entry.kind === 'text') {
                var _font = _state.fonts.items[parseInt((/\sfontId="(\d+)"/.exec(_open) || [0, 0])[1], 10)] || '<font/>';
                _newOpen = setAttribute(setAttribute(_newOpen, 'fontId', indexOfOrPush(_state.fonts.items, xlsxFontWithColor(_font, entry.color))), 'applyFont', '1');
              }
              else {
                _newOpen = setAttribute(setAttribute(_newOpen, 'fillId', indexOfOrPush(_state.fills.items, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + entry.color + '"/><bgColor indexed="64"/></patternFill></fill>')), 'applyFill', '1');
              }
              _xf = _newOpen + _xf.slice(_open.length);
            });
            _state.cache[_key] = String(indexOfOrPush(_state.xfs.items, _xf));
          }
          _newIndex = _state.cache[_key];
        }
        if (_newIndex === '') {
          return tag.replace(/\ss="[^"]*"/, '');
        }
        return tag.replace(/(\ss=")[^"]*(")/, function (m, before, after) {
          return before + _newIndex + after;
        });
      });
    });
    // write the new styles. Lists are written from the end to keep positions valid
    Object.keys(_stylesByParent).forEach(function (parent) {
      var _state = _stylesByParent[parent];
      if (!_state.fonts || !_state.fills || !_state.xfs) {
        return;
      }
      var _data = _state.file.data;
      [[_state.xfs, 'cellXfs'], [_state.fills, 'fills'], [_state.fonts, 'fonts']].sort(function (a, b) {
        return b[0].start - a[0].start;
      }).forEach(function (entry) {
        _data = writeXlsxList(_data, entry[0], entry[1]);
      });
      _state.file.data = _data;
    });
  },

  /**
   * Create styles which contain colors, and replace identifiers by their names. It does nothing if there is no color to resolve.
   *
   * @param {Object} report   report object: { files : [{ name, data }] }
   * @param {Object} options  options, where the formatter _odfColor registered colors: { odfColors : [{ kind, color }] }
   */
  resolveOdfColors : function (report, options) {
    if (!options || !(options.odfColors instanceof Array) || !report || !(report.files instanceof Array)) {
      return;
    }
    report.files.forEach(function (part) {
      if (typeof part.data !== 'string' || part.data.indexOf('CARBONE_ODC_') === -1) {
        return;
      }
      var _xml = part.data;
      var _newStyles = {};
      _xml = _xml.replace(/<(text:p|text:h|table:table-cell)\b[^>]*>/g, function (tag, name) {
        var _attribute = name === 'table:table-cell' ? 'table:style-name' : 'text:style-name';
        var _family = name === 'table:table-cell' ? 'table-cell' : 'paragraph';
        var _attributeRegex = new RegExp('(\\s' + _attribute + '=")([^"]*)(")');
        var _found = _attributeRegex.exec(tag);
        if (_found === null) {
          return tag;
        }
        var _tokens = ODF_TOKEN_REGEX.exec(_found[2]);
        if (_tokens === null) {
          return tag;
        }
        var _original = _found[2].slice(0, _tokens.index);
        var _colors = [];
        _tokens[1].split('CARBONE_ODC_').slice(1).forEach(function (index) {
          var _entry = options.odfColors[parseInt(index, 10)];
          // invalid colors are ignored
          if (_entry && _entry.color) {
            _colors.push(_entry);
          }
        });
        var _newName = _original;
        if (_colors.length > 0) {
          var _key = _family + '|' + _original + '|' + _colors.map(function (entry) { return entry.kind + entry.color; }).join(',');
          _newName = 'CarboneC' + crypto.createHash('sha1').update(_key).digest('hex').slice(0, 10);
          _newStyles[_newName] = _newStyles[_newName] || buildStyle(part.data, _newName, _original, _family, _colors);
        }
        if (_newName === '') {
          return tag.replace(_attributeRegex, '');
        }
        return tag.replace(_attributeRegex, function (m, before, value, after) {
          return before + _newName + after;
        });
      });
      var _styles = Object.keys(_newStyles).map(function (name) {
        return _newStyles[name];
      }).join('');
      if (_styles !== '') {
        if (_xml.indexOf('</office:automatic-styles>') !== -1) {
          _xml = _xml.replace('</office:automatic-styles>', function () {
            return _styles + '</office:automatic-styles>';
          });
        }
        else if (_xml.indexOf('<office:automatic-styles/>') !== -1) {
          _xml = _xml.replace('<office:automatic-styles/>', function () {
            return '<office:automatic-styles>' + _styles + '</office:automatic-styles>';
          });
        }
      }
      part.data = _xml;
    });
  },

  /**
   * Replace `color` markers by markers in XML attributes of a DOCX file.
   *
   * `{d.color:color(p, text)}`, `{d.color:color(cell, background)}`, `{d.color:color(row, background)}`
   * A marker which is not inside the wanted element, or with unknown scope or type, is not modified.
   *
   * @param  {String} xml  xml without XML inside markers (see parser.removeXMLInsideMarkers)
   * @return {String}      xml where `color` markers are replaced
   */
  expandColorMarkers : function (xml) {
    if (typeof xml !== 'string' || xml.indexOf(':color(') === -1) {
      return xml;
    }
    var _markerRegex = /\{([^{}]*?):color\(\s*(?:'|")?(\w+)(?:'|")?\s*,\s*(?:'|")?(\w+)(?:'|")?\s*\)[^{}]*\}/g;
    var _result = xml;
    var _searchFrom = 0;
    for (var _guard = 0; _guard < 10000; _guard++) {
      _markerRegex.lastIndex = _searchFrom;
      var _match = _markerRegex.exec(_result);
      if (_match === null) {
        break;
      }
      var _scope = _match[2].toLowerCase();
      var _type = _match[3].toLowerCase();
      var _element = (SCOPES[_scope] && (_type === 'text' || _type === 'background')) ?
        parser.findElementAroundMarker(_result, _match.index, _match[0].length, [SCOPES[_scope]], 1) : null;
      if (_element === null) {
        _searchFrom = _match.index + _match[0].length;
        continue;
      }
      var _marker = '{' + _match[1] + ':_color}';
      // remove the original marker, then update the element
      var _without = _result.slice(0, _match.index) + _result.slice(_match.index + _match[0].length);
      var _removedLength = _match[0].length;
      var _closeStart = _without.lastIndexOf('</' + _element.name, _element.closeEnd - _removedLength);
      var _inner = _without.slice(_element.openEnd, _closeStart);
      if (_type === 'text') {
        _inner = setTextColor(_inner, _marker);
      }
      else if (_scope === 'p') {
        _inner = setShading(_inner, 'w:pPr', AFTER_SHD_IN_PPR, _marker);
      }
      else if (_scope === 'cell') {
        _inner = setShading(_inner, 'w:tcPr', AFTER_SHD_IN_TCPR, _marker);
      }
      else {
        _inner = setRowBackground(_inner, _marker);
      }
      _result = _without.slice(0, _element.openEnd) + _inner + _without.slice(_closeStart);
      _searchFrom = _element.openEnd;
    }
    return _result;
  }
};

module.exports = color;
