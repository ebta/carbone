const crypto = require('crypto');
const parser = require('./parser');
const ooxml = require('./ooxml');

/**
 * Dynamic hyperlinks: the address of a link in the editor is a marker: `{d.url}`.
 *
 * - ODF (ODT, ODS, ODP): `xlink:href="{d.url}"`. Editors can encode braces (`%7Bd.url%7D`). The marker is decoded and the internal
 *   formatter `_link` is added, which refuses unsafe URLs (javascript:, ...).
 * - DOCX and PPTX: the address is stored in the relationships file, so a link cannot be different in each row of a loop. So the marker
 *   is moved in the document (`r:id="{d.url:_hyperlink}"`), and after data injection, a relationship is created for each URL.
 */

const HYPERLINK_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

/**
 * Decode percent-encoded markers, which editors generate in addresses: `%7Bd.items%5Bi%5D.url%7D` -> `{d.items[i].url}`
 *
 * @param  {String} str
 * @return {String}
 */
function decodeMarkers (str) {
  return str.replace(/%7B[\s\S]*?%7D/gi, function (encoded) {
    try {
      return decodeURIComponent(encoded);
    }
    catch (e) {
      return encoded;
    }
  });
}

/**
 * Transform an address into the arguments of the formatter: `https://a.b/{d.id}?x=1` -> { marker : 'd.id', args : "('https://a.b/', '?x=1')" }
 *
 * @private
 * @param  {String} address  address, where markers are already decoded
 * @return {Object}          { marker, args }, or null if the address does not contain exactly one Carbone marker, or cannot be managed
 */
function parseAddress (address) {
  var _parts = /^([^{}]*)\{([^{}]+)\}([^{}]*)$/.exec(address);
  if (_parts === null || parser.isCarboneMarker(_parts[2]) === false || /['"]/.test(_parts[1] + _parts[3])) {
    return null;
  }
  var _args = '';
  if (_parts[1] !== '' || _parts[3] !== '') {
    _args = "('" + _parts[1] + "', '" + _parts[3] + "')";
  }
  return { marker : _parts[2], args : _args };
}

var link = {

  decodeMarkers,

  /**
   * Prepare markers of hyperlinks in ODF files (ODT, ODS, ODP)
   *
   * @param  {String} xml  xml
   * @return {String}      xml
   */
  expandOdfLinkMarkers : function (xml) {
    if (typeof xml !== 'string' || xml.indexOf('xlink:href="') === -1 || (xml.indexOf('{') === -1 && xml.search(/%7B/i) === -1)) {
      return xml;
    }
    return xml.replace(/(<text:a\b[^>]*?\bxlink:href=")([^"]*)(")/g, function (m, before, address, after) {
      var _parsed = parseAddress(decodeMarkers(address));
      if (_parsed === null) {
        return m;
      }
      return before + '{' + _parsed.marker + ':_link' + _parsed.args + '}' + after;
    });
  },

  /**
   * Prepare markers of hyperlinks in DOCX and PPTX files: they are read in relationships files, and moved in the part which uses them.
   * Relationships with a marker are removed.
   *
   * @param {Object} template  template returned by file.openTemplate (modified)
   */
  expandHyperlinkMarkers : function (template) {
    if (!template || !(template.files instanceof Array)) {
      return;
    }
    var _files = template.files;
    _files.forEach(function (rels) {
      var _relsMatch = /^(.*)\/_rels\/([^/]+)\.rels$/.exec(rels.name);
      if (_relsMatch === null || typeof rels.data !== 'string' || rels.data.indexOf('/hyperlink"') === -1) {
        return;
      }
      var _part = _files.filter(function (file) {
        return file.name === _relsMatch[1] + '/' + _relsMatch[2] && typeof file.data === 'string';
      })[0];
      if (!_part) {
        return;
      }
      rels.data = rels.data.replace(/<Relationship\b[^>]*?\/>/g, function (relationship) {
        var _id = /\bId="([^"]+)"/.exec(relationship);
        var _target = /\bTarget="([^"]*)"/.exec(relationship);
        if (_id === null || _target === null || /\bType="[^"]*\/hyperlink"/.test(relationship) === false) {
          return relationship;
        }
        var _parsed = parseAddress(decodeMarkers(_target[1]));
        if (_parsed === null) {
          return relationship;
        }
        var _newId = '{' + _parsed.marker + ':_hyperlink' + _parsed.args + '}';
        var _idRegex = new RegExp('(<(?:w:hyperlink|a:hlinkClick|hyperlink)\\b[^>]*?\\br:id=")' + _id[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(")', 'g');
        _part.data = _part.data.replace(_idRegex, function (m, before, after) {
          return before + _newId + after;
        });
        return '';
      });
    });
  },

  /**
   * Create relationships of hyperlinks and replace temporary identifiers. Links without valid URL are removed (the text is kept).
   *
   * @param {Object} report   report object: { files : [{ name, data }] }
   * @param {Object} options  options, where the formatter _hyperlink registered URLs: { links : ['https://...'] }
   */
  resolveLinks : function (report, options) {
    if (!options || !(options.links instanceof Array) || !report || !(report.files instanceof Array)) {
      return;
    }
    var _files = report.files;
    _files.forEach(function (part) {
      if (typeof part.data !== 'string' || part.data.indexOf('CARBONE_LINK_') === -1) {
        return;
      }
      // links without URL
      part.data = part.data
        .replace(/<w:hyperlink\b[^>]*?\br:id="CARBONE_LINK_NONE"[^>]*?>([\s\S]*?)<\/w:hyperlink>/g, '$1')
        .replace(/<a:hlinkClick\b[^>]*?\br:id="CARBONE_LINK_NONE"[^>]*?(?:\/>|>[\s\S]*?<\/a:hlinkClick>)/g, '');
      part.data = part.data.replace(/CARBONE_LINK_(\d+)/g, function (m, index) {
        var _url = options.links[parseInt(index, 10)];
        if (typeof _url !== 'string') {
          return '';
        }
        var _relId = 'rIdCarboneLink' + crypto.createHash('sha1').update(_url).digest('hex').slice(0, 12);
        ooxml.ensureRelationship(_files, part.name, _relId, HYPERLINK_RELATIONSHIP_TYPE, _url, true);
        return _relId;
      });
    });
  }
};

module.exports = link;
