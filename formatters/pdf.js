const MAX_ACTIONS = 50;

function register (context, action) {
  if (!context.pdfActions) {
    context.pdfActions = [];
  }
  if (context.pdfActions.length >= MAX_ACTIONS) {
    throw new Error('A PDF can contain ' + MAX_ACTIONS + ' appended or attached files at most');
  }
  context.pdfActions.push(action);
}

function isEmpty (d) {
  return d === null || typeof d === 'undefined' || d === '';
}

/**
 * Append the pages of a PDF file to the generated PDF. It prints nothing: the marker can be anywhere in the template.
 * It is used only if the report is converted into PDF, and it cannot be used with the encryption of the PDF
 * (`EncryptFile`, `RestrictPermissions`). The file is a base64 data URI (`data:application/pdf;base64,...`) or a public URL (http, https).
 * If the value is empty, nothing is appended.
 *
 * @version 3.5.7 new
 * @example ["data:application/pdf;base64,JVBERi0=", "end"]
 * @example ["https://example.com/terms.pdf", "start"]
 *
 * @param  {String}         d         PDF file: data URI or URL
 * @param  {String|Integer} position  [optional] `end` (default), `start`, or a page number: the pages are inserted before this page
 * @return {String}                   an empty string
 */
function appendFile (d, position) {
  if (isEmpty(d)) {
    return '';
  }
  var _position = position === undefined || position === null || position === '' ? 'end' : position;
  if (_position !== 'end' && _position !== 'start' && (/^\d+$/.test(_position + '') === false || parseInt(_position, 10) < 1)) {
    throw new Error('Formatter "appendFile": the position must be "end", "start" or a page number from 1, not "' + position + '"');
  }
  register(this, { type : 'append', source : d + '', position : /^\d+$/.test(_position + '') ? parseInt(_position, 10) : _position });
  return '';
}

/**
 * Attach a file to the generated PDF (embedded file, visible in the attachments of the PDF reader). It prints nothing: the marker can be anywhere
 * in the template. It is used only if the report is converted into PDF, and it cannot be used with the encryption of the PDF
 * (`EncryptFile`, `RestrictPermissions`). The file is a base64 data URI or a public URL (http, https). If the value is empty, nothing is attached.
 *
 * @version 3.5.7 new
 * @example ["data:text/plain;base64,aGVsbG8=", "hello.txt", "text/plain"]
 * @example ["https://example.com/invoice.xml", "invoice.xml", "application/xml"]
 *
 * @param  {String} d         file: data URI or URL
 * @param  {String} filename  name of the file in the PDF
 * @param  {String} mimetype  [optional] type of the file, "application/octet-stream" by default
 * @return {String}           an empty string
 */
function attachFile (d, filename, mimetype) {
  if (isEmpty(d)) {
    return '';
  }
  // no path, no control characters
  var _filename = (filename === undefined || filename === null ? '' : filename + '').replace(/[\u0000-\u001F\u007F\\/:*?"<>|]/g, '_').trim().slice(0, 200);
  if (_filename === '' || _filename === '.' || _filename === '..') {
    throw new Error('Formatter "attachFile": the name of the file is required, ex. attachFile(\'invoice.xml\', \'application/xml\')');
  }
  var _mimetype = (mimetype === undefined || mimetype === null || mimetype === '') ? 'application/octet-stream' : mimetype + '';
  if (/^[\w.+-]+\/[\w.+-]+$/.test(_mimetype) === false) {
    throw new Error('Formatter "attachFile": the type of the file "' + mimetype + '" is not valid, ex. "application/xml"');
  }
  register(this, { type : 'attach', source : d + '', filename : _filename, mimetype : _mimetype });
  return '';
}

module.exports = {
  appendFile,
  attachFile
};
