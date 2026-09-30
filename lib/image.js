const crypto = require('crypto');
const path = require('path');
const parser = require('./parser');
const download = require('./download').download;

/**
 * Dynamic images for DOCX templates.
 *
 * In the template, a picture is used as a placeholder, and the marker is written in its alternative text:
 * `{d.logo}` or `{d.logo:imageFit(fillWidth)}`. The value is a public URL or a base64 data URI (png, jpeg, gif).
 *
 * 1. expandImageMarkers (before parsing): the marker is moved from the alternative text to the attribute `r:embed` of the picture,
 *    with the internal formatter `_image`, which prints a temporary identifier `CARBONE_IMG_<n>`
 * 2. resolveImages (after data injection, before zipping): images are loaded, added in the document (media file, relationship and
 *    content type), and identifiers are replaced by the relationship id. The size is computed from the `imageFit` option.
 */

const EMU_PER_PIXEL = 9525;
const IMAGE_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const CONTENT_TYPES = { png : 'image/png', jpg : 'image/jpeg', gif : 'image/gif' };

/**
 * Detect the type and the size of an image, without any dependency
 *
 * @param  {Buffer} buffer  file
 * @return {Object}         { type : 'png'|'jpg'|'gif', width, height }, or null if the image is not supported or invalid
 */
function getImageInfo (buffer) {
  if (Buffer.isBuffer(buffer) === false || buffer.length < 24) {
    return null;
  }
  var _info = null;
  if (buffer[0] === 0x89 && buffer.toString('latin1', 1, 4) === 'PNG') {
    _info = { type : 'png', width : buffer.readUInt32BE(16), height : buffer.readUInt32BE(20) };
  }
  else if (buffer.toString('latin1', 0, 4) === 'GIF8') {
    _info = { type : 'gif', width : buffer.readUInt16LE(6), height : buffer.readUInt16LE(8) };
  }
  else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    var _i = 2;
    while (_i + 9 < buffer.length) {
      if (buffer[_i] !== 0xFF) {
        break;
      }
      var _marker = buffer[_i + 1];
      if (_marker === 0xFF) { // padding
        _i++;
        continue;
      }
      // Start Of Frame markers contain the size
      if (_marker >= 0xC0 && _marker <= 0xCF && _marker !== 0xC4 && _marker !== 0xC8 && _marker !== 0xCC) {
        _info = { type : 'jpg', width : buffer.readUInt16BE(_i + 7), height : buffer.readUInt16BE(_i + 5) };
        break;
      }
      _i += 2 + buffer.readUInt16BE(_i + 2);
    }
  }
  if (_info === null || _info.width <= 0 || _info.height <= 0) {
    return null;
  }
  return _info;
}

/**
 * Load an image from a base64 data URI or a public URL
 *
 * @param {String}   source
 * @param {Function} callback(err, { buffer, type, width, height })
 */
function loadImage (source, callback) {
  function analyze (err, buffer) {
    if (err) {
      return callback(new Error('Cannot load the image "' + source.slice(0, 60) + (source.length > 60 ? '...' : '') + '": ' + err.message));
    }
    var _info = getImageInfo(buffer);
    if (_info === null) {
      return callback(new Error('Cannot load the image "' + source.slice(0, 60) + (source.length > 60 ? '...' : '') + '": unsupported or invalid image. Supported formats: png, jpeg, gif'));
    }
    return callback(null, { buffer : buffer, type : _info.type, width : _info.width, height : _info.height });
  }
  var _dataUri = /^data:[^;,]*(?:;[^;,]*)*;base64,([\s\S]*)$/i.exec(source);
  if (_dataUri !== null) {
    return process.nextTick(function () {
      analyze(null, Buffer.from(_dataUri[1].replace(/\s/g, ''), 'base64'));
    });
  }
  if (/^https?:\/\//i.test(source) === true) {
    return download(source, analyze);
  }
  return process.nextTick(function () {
    analyze(new Error('the value must be a base64 data URI or a public URL (http, https)'));
  });
}

/**
 * Compute the new size of a picture, in EMU
 *
 * @param  {Integer} boxWidth     width of the placeholder
 * @param  {Integer} boxHeight    height of the placeholder
 * @param  {Object}  image        { width, height } of the new image, in pixels
 * @param  {String}  fit          contain, fillwidth or fill
 * @return {Object}               { width, height }
 */
function computeSize (boxWidth, boxHeight, image, fit) {
  var _ratio = image.width / image.height;
  if (fit === 'fill') {
    return { width : boxWidth, height : boxHeight };
  }
  if (fit === 'fillwidth' || boxWidth / boxHeight <= _ratio) {
    return { width : boxWidth, height : Math.round(boxWidth / _ratio) };
  }
  return { width : Math.round(boxHeight * _ratio), height : boxHeight };
}

function getRelationshipsFileName (partName) {
  return path.posix.join(path.posix.dirname(partName), '_rels', path.posix.basename(partName) + '.rels');
}

var image = {

  getImageInfo,
  loadImage,
  computeSize,

  /**
   * Move the marker of a picture from its alternative text to the picture itself (DOCX)
   *
   * `<wp:docPr descr="{d.logo:imageFit(fill)}"/> ... <a:blip r:embed="rId5"/>` becomes
   * `<wp:docPr descr=""/> ... <a:blip r:embed="{d.logo:imageFit(fill):_image}"/>`
   *
   * @param  {String} xml  xml without XML inside markers
   * @return {String}      xml
   */
  expandImageMarkers : function (xml) {
    if (typeof xml !== 'string' || xml.indexOf('<w:drawing') === -1 || xml.indexOf('descr="') === -1) {
      return xml;
    }
    return xml.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, function (drawing) {
      var _docPr = /<wp:docPr\b[^>]*?\bdescr="([^"]*)"[^>]*>/.exec(drawing);
      if (_docPr === null) {
        return drawing;
      }
      var _marker = /\{([^{}]+)\}/.exec(_docPr[1]);
      if (_marker === null || parser.isCarboneMarker(_marker[1]) === false || /<a:blip\b[^>]*?\br:embed="[^"]*"/.test(drawing) === false) {
        return drawing;
      }
      var _newDocPr = _docPr[0].replace(_docPr[1], '');
      return drawing
        .replace(_docPr[0], function () {
          return _newDocPr;
        })
        .replace(/(<a:blip\b[^>]*?\br:embed=")[^"]*(")/, function (m, before, after) {
          return before + '{' + _marker[1] + ':_image}' + after;
        });
    });
  },

  /**
   * Load images, add them in the DOCX, and replace temporary identifiers. It does nothing if there is no dynamic image.
   *
   * @param {Object}   report    report object returned by the parsing of all files: { files : [{ name, data, parent }] }
   * @param {Object}   options   options, where the formatter _image registered images: { images : [{ source, fit }] }
   * @param {Function} callback(err)
   */
  resolveImages : function (report, options, callback) {
    if (!options || !(options.images instanceof Array) || !report || !(report.files instanceof Array)) {
      return callback(null);
    }
    var _entries = options.images;
    var _loaded = {}; // by source
    var _sources = [];
    _entries.forEach(function (entry) {
      if (_sources.indexOf(entry.source) === -1) {
        _sources.push(entry.source);
      }
    });
    var _pending = _sources.length;
    var _error = null;
    function assemble () {
      if (_error) {
        return callback(_error);
      }
      try {
        replaceTokens(report, _entries, _loaded);
      }
      catch (e) {
        return callback(e);
      }
      return callback(null);
    }
    if (_pending === 0) {
      return assemble();
    }
    _sources.forEach(function (source) {
      loadImage(source, function (err, loadedImage) {
        if (err && !_error) {
          _error = err;
        }
        _loaded[source] = loadedImage;
        if (--_pending === 0) {
          assemble();
        }
      });
    });
  }
};

/**
 * Replace identifiers by the real images in all parts of the report
 *
 * @private
 */
function replaceTokens (report, entries, loaded) {
  var _files = report.files;
  var _addedMedia = {};
  for (var f = 0; f < _files.length; f++) {
    var _part = _files[f];
    if (typeof _part.data !== 'string' || _part.data.indexOf('CARBONE_IMG_') === -1) {
      continue;
    }
    var _partName = _part.name;
    _part.data = _part.data.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, function (drawing) {
      var _token = /CARBONE_IMG_(NONE|\d+)/.exec(drawing);
      if (_token === null) {
        return drawing;
      }
      if (_token[1] === 'NONE') {
        return ''; // no image, remove the picture
      }
      var _entry = entries[parseInt(_token[1], 10)];
      var _image = _entry && loaded[_entry.source];
      if (!_image) {
        return '';
      }
      var _hash = crypto.createHash('sha1').update(_image.buffer).digest('hex').slice(0, 12);
      var _mediaName = 'word/media/carbone_' + _hash + '.' + _image.type;
      if (_addedMedia[_mediaName] === undefined) {
        _addedMedia[_mediaName] = true;
        if (_files.some(function (file) { return file.name === _mediaName; }) === false) {
          _files.push({ name : _mediaName, data : _image.buffer, isMarked : false, parent : '' });
        }
        ensureContentType(_files, _image.type);
      }
      var _relId = 'rIdCarbone' + _hash;
      ensureRelationship(_files, _partName, _relId, path.posix.relative(path.posix.dirname(_partName), _mediaName));
      drawing = drawing.replace(_token[0], _relId);
      // resize the picture
      var _extent = /<wp:extent\s+cx="(\d+)"\s+cy="(\d+)"/.exec(drawing);
      if (_extent !== null && parseInt(_extent[1], 10) > 0 && parseInt(_extent[2], 10) > 0) {
        var _size = computeSize(parseInt(_extent[1], 10), parseInt(_extent[2], 10), _image, _entry.fit);
        drawing = drawing.replace(/(<(?:wp:extent|a:ext)\s+)cx="\d+"\s+cy="\d+"/g, function (m, tag) {
          return tag + 'cx="' + _size.width + '" cy="' + _size.height + '"';
        });
      }
      return drawing;
    });
  }
}

function ensureRelationship (files, partName, relId, target) {
  var _relsName = getRelationshipsFileName(partName);
  var _rels = files.filter(function (file) {
    return file.name === _relsName;
  })[0];
  if (!_rels) {
    _rels = {
      name     : _relsName,
      data     : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
      isMarked : true,
      parent   : ''
    };
    files.push(_rels);
  }
  if (_rels.data.indexOf('Id="' + relId + '"') === -1) {
    _rels.data = _rels.data.replace('</Relationships>', '<Relationship Id="' + relId + '" Type="' + IMAGE_RELATIONSHIP_TYPE + '" Target="' + target + '"/></Relationships>');
  }
}

function ensureContentType (files, type) {
  var _types = files.filter(function (file) {
    return file.name === '[Content_Types].xml';
  })[0];
  if (!_types || typeof _types.data !== 'string') {
    return;
  }
  if (new RegExp('<Default\\s[^>]*Extension="' + type + '"', 'i').test(_types.data) === false) {
    _types.data = _types.data.replace(/(<Types\b[^>]*>)/, '$1<Default Extension="' + type + '" ContentType="' + CONTENT_TYPES[type] + '"/>');
  }
}

module.exports = image;
