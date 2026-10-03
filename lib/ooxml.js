const path = require('path');

/**
 * Helpers for OOXML files (docx, pptx, xlsx): relationships between a part and other files or URLs
 */

const RELATIONSHIPS_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

/**
 * Name of the relationships file of a part. Ex. word/document.xml -> word/_rels/document.xml.rels
 *
 * @param  {String} partName
 * @return {String}
 */
function getRelationshipsFileName (partName) {
  return path.posix.join(path.posix.dirname(partName), '_rels', path.posix.basename(partName) + '.rels');
}

/**
 * Add a relationship in the relationships file of a part. The file is created if it does not exist. Nothing is done if the id already exists.
 *
 * @param {Array}   files       report files: [{ name, data, isMarked, parent }]
 * @param {String}  partName    part which uses the relationship. Ex. word/document.xml
 * @param {String}  relId       relationship id
 * @param {String}  type        relationship type (URL)
 * @param {String}  target      path (relative to the part) or URL. It must be already escaped for XML
 * @param {Boolean} isExternal  true if the target is a URL
 */
function ensureRelationship (files, partName, relId, type, target, isExternal) {
  var _relsName = getRelationshipsFileName(partName);
  var _rels = files.filter(function (file) {
    return file.name === _relsName;
  })[0];
  if (!_rels) {
    _rels = { name : _relsName, data : RELATIONSHIPS_HEADER, isMarked : true, parent : '' };
    files.push(_rels);
  }
  if (_rels.data.indexOf('Id="' + relId + '"') === -1) {
    _rels.data = _rels.data.replace('</Relationships>', '<Relationship Id="' + relId + '" Type="' + type + '" Target="' + target + '"' + (isExternal === true ? ' TargetMode="External"' : '') + '/></Relationships>');
  }
}

const TAG_SOURCE = '<(\\/?)([A-Za-z_][\\w:.-]*)(?:\\s[^>]*?)?(\\/?)>';

/**
 * Get the direct children of an XML fragment
 *
 * @private
 * @param  {String} content  xml fragment
 * @return {Array}           [{ name, start, end }, ...], positions are relative to `content`
 */
function getChildren (content) {
  var _regex = new RegExp(TAG_SOURCE, 'g');
  var _children = [];
  var _depth = 0;
  var _current = null;
  var _tag;
  while ((_tag = _regex.exec(content)) !== null) {
    var _end = _tag.index + _tag[0].length;
    if (_tag[1] === '/') {
      _depth--;
      if (_depth === 0 && _current !== null) {
        _current.end = _end;
        _children.push(_current);
        _current = null;
      }
    }
    else if (_tag[3] === '/') {
      if (_depth === 0) {
        _children.push({ name : _tag[2], start : _tag.index, end : _end });
      }
    }
    else {
      if (_depth === 0) {
        _current = { name : _tag[2], start : _tag.index };
      }
      _depth++;
    }
  }
  return _children;
}

module.exports = {
  getRelationshipsFileName,
  ensureRelationship,
  getChildren
};
