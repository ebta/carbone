const barcodeLib = require('../lib/barcode');

/**
 * Generate a barcode as an image. It is used in the alternative text of a picture of a template (docx, odt), like a dynamic image:
 * `{d.code:barcode(qrcode)}`. The picture of the template is replaced by the barcode (see `imageFit` to choose the size).
 *
 * Available types: `qrcode` (QR code, any text), `code128` (ASCII characters from 32 to 126, numbers are compressed),
 * `ean13` (12 digits, the check digit is added, or 13 digits, the check digit is verified).
 * A value as text must be used for EAN-13: a number loses its leading zeros. If the value is empty, the picture is removed.
 *
 * @version 3.5.7 new
 * @example ["https://carbone.io", "qrcode"]
 * @example ["INV-2026-000123", "code128"]
 * @example ["5901234123457", "ean13"]
 *
 * @param  {String|Number} d                text to encode
 * @param  {String} type                    `qrcode`, `code128` or `ean13`
 * @param  {Integer} scale                  [optional] pixels of one module, from 1 to 30. 8 for QR codes, 3 for others
 * @param  {String} errorCorrection         [optional] only for QR codes: `L`, `M` (default), `Q` or `H`
 * @return {String}                         the barcode as base64 data URI (PNG)
 */
function barcode (d, type, scale, errorCorrection) {
  if (d === null || typeof d === 'undefined' || d === '') {
    return d;
  }
  if (typeof d !== 'string' && typeof d !== 'number') {
    throw new Error('Barcode: the value must be a text or a number');
  }
  var _png = barcodeLib.generate(type, d + '', { scale : scale, errorCorrection : errorCorrection });
  return 'data:image/png;base64,' + _png.toString('base64');
}

module.exports = {
  barcode
};
