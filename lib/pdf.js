const PDFDocument = require('pdf-lib').PDFDocument;
const params = require('./params');
const loadFile = require('./download').loadFile;

/**
 * Operations on the generated PDF: append the pages of other PDF files (formatter `appendFile`), attach files (formatter `attachFile`).
 *
 * The formatters register the operations in `options.pdfActions`, and they are applied when the PDF is generated.
 */

function describe (source) {
  return '"' + source.slice(0, 60) + (source.length > 60 ? '...' : '') + '"';
}

function loadAll (actions, callback) {
  var _buffers = new Array(actions.length);
  var _pending = actions.length;
  var _error = null;
  if (_pending === 0) {
    return callback(null, _buffers);
  }
  actions.forEach(function (action, index) {
    loadFile(action.source, params.pdfAttachmentMaxSize, function (err, buffer) {
      if (err && !_error) {
        _error = new Error('Cannot load the file ' + describe(action.source) + ': ' + err.message);
      }
      _buffers[index] = buffer;
      if (--_pending === 0) {
        callback(_error, _buffers);
      }
    });
  });
}

var pdf = {

  /**
   * Is there an operation which changes the PDF?
   *
   * @param  {Object}  options  options of the report
   * @return {Boolean}
   */
  hasActions : function (options) {
    return !!options && options.pdfActions instanceof Array && options.pdfActions.length > 0;
  },

  /**
   * Check that operations can be done, before the conversion: the PDF cannot be encrypted
   *
   * @param  {Object} options  options of the report, where convertTo.filters are the export options
   * @return {String}          an error message, or null
   */
  check : function (options) {
    var _filters = (options.convertTo && options.convertTo.filters) || {};
    if (pdf.hasActions(options) === true && (_filters.EncryptFile === true || _filters.RestrictPermissions === true)) {
      return 'appendFile and attachFile cannot be used with the encryption of the PDF (EncryptFile, RestrictPermissions)';
    }
    return null;
  },

  /**
   * Apply operations on a PDF
   *
   * @param {Buffer}   pdfBuffer  generated PDF
   * @param {Array}    actions    [{ type : 'append', source, position }, { type : 'attach', source, filename, mimetype }]
   * @param {Function} callback(err, buffer)
   */
  apply : function (pdfBuffer, actions, callback) {
    loadAll(actions, function (errLoad, buffers) {
      if (errLoad) {
        return callback(errLoad);
      }
      (async function () {
        var _document;
        try {
          _document = await PDFDocument.load(pdfBuffer, { updateMetadata : false });
        }
        catch (e) {
          throw new Error('Cannot read the generated PDF: ' + e.message);
        }
        for (var i = 0; i < actions.length; i++) {
          var _action = actions[i];
          if (_action.type === 'attach') {
            await _document.attach(buffers[i], _action.filename, { mimeType : _action.mimetype });
            continue;
          }
          var _source;
          try {
            _source = await PDFDocument.load(buffers[i], { updateMetadata : false });
          }
          catch (e) {
            throw new Error('Cannot append the file ' + describe(_action.source) + ': it is not a valid PDF, or it is encrypted (' + e.message + ')');
          }
          var _pages = await _document.copyPages(_source, _source.getPageIndices());
          var _index = _action.position === 'end' ? _document.getPageCount() : (_action.position === 'start' ? 0 : Math.min(_action.position - 1, _document.getPageCount()));
          _pages.forEach(function (page, offset) {
            _document.insertPage(_index + offset, page);
          });
        }
        return Buffer.from(await _document.save());
      })().then(function (buffer) {
        process.nextTick(callback, null, buffer);
      }, function (err) {
        process.nextTick(callback, err && err.message ? err.message : err + '');
      });
    });
  }
};

module.exports = pdf;
