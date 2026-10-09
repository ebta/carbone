var assert = require('assert');
var zlib = require('zlib');
var crypto = require('crypto');
var carbone = require('../lib');
var file = require('../lib/file');
var barcodeLib = require('../lib/barcode');
var barcodeFormatter = require('../formatters/barcode');
var helper = require('../lib/helper');

/** Read the chunks of a PNG, and check them */
function readPng (buffer) {
  assert.ok(buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), 'PNG signature');
  var _pos = 8;
  var _chunks = {};
  while (_pos < buffer.length) {
    var _length = buffer.readUInt32BE(_pos);
    var _type = buffer.toString('latin1', _pos + 4, _pos + 8);
    var _data = buffer.slice(_pos + 8, _pos + 8 + _length);
    if (typeof zlib.crc32 === 'function') {
      helper.assert(buffer.readUInt32BE(_pos + 8 + _length), zlib.crc32(buffer.slice(_pos + 4, _pos + 8 + _length)));
    }
    _chunks[_type] = _data;
    _pos += 12 + _length;
  }
  return {
    width  : _chunks.IHDR.readUInt32BE(0),
    height : _chunks.IHDR.readUInt32BE(4),
    raw    : zlib.inflateSync(_chunks.IDAT)
  };
}

function matrixHash (matrix) {
  return crypto.createHash('sha1').update(matrix.map(function (row) {
    return row.map(function (bit) { return bit ? 1 : 0; }).join('');
  }).join('')).digest('hex');
}

/** Template (already unzipped) with pictures, accepted by carbone.render for tests */
function picture (id, descr) {
  return '<w:r><w:drawing><wp:inline><wp:extent cx="1800000" cy="900000"/><wp:docPr id="' + id + '" name="Picture ' + id + '" descr="' + descr + '"/>'
    + '<a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill>'
    + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1800000" cy="900000"/></a:xfrm></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}

function renderDocx (body, data, callback) {
  var _template = {
    isZipped   : true,
    filename   : 'test.docx',
    embeddings : [],
    files      : [
      { name : '[Content_Types].xml', isMarked : true, parent : '', data : '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>' },
      { name : 'word/document.xml', isMarked : true, parent : '', data : '<w:document><w:body>' + body + '</w:body></w:document>' },
      { name : 'word/_rels/document.xml.rels', isMarked : true, parent : '', data : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>' }
    ]
  };
  carbone.render(_template, data, {}, function (err, result) {
    if (err) {
      return callback(err);
    }
    file.unzip(result, function (errUnzip, files) {
      var _res = {};
      (files || []).forEach(function (f) {
        _res[f.name] = f.data;
      });
      callback(errUnzip, _res);
    });
  });
}

describe('barcode', function () {

  describe('PNG generation', function () {
    it('should generate a valid PNG, with the size of the code and its quiet zone', function () {
      var _png = readPng(barcodeLib.generate('qrcode', 'hello'));
      // version 1 = 21 modules, 4 modules of quiet zone on each side, 8 pixels by module
      helper.assert([_png.width, _png.height], [232, 232]);
      helper.assert(_png.raw.length, (232 + 1) * 232);
      var _small = readPng(barcodeLib.generate('qrcode', 'hello', { scale : 2 }));
      helper.assert(_small.width, 58);
    });
    it('should limit the scale between 1 and 30', function () {
      helper.assert(readPng(barcodeLib.generate('qrcode', 'hello', { scale : 0 })).width, 29);
      helper.assert(readPng(barcodeLib.generate('qrcode', 'hello', { scale : -5 })).width, 29);
      helper.assert(readPng(barcodeLib.generate('qrcode', 'hello', { scale : 500 })).width, 870);
      helper.assert(readPng(barcodeLib.generate('qrcode', 'hello', { scale : '4' })).width, 116);
    });
    it('should have black modules on white, and a white quiet zone', function () {
      var _png = readPng(barcodeLib.generate('qrcode', 'hello', { scale : 1 }));
      helper.assert(_png.width, 29);
      var _pixel = function (x, y) {
        return _png.raw[y * (_png.width + 1) + 1 + x];
      };
      helper.assert(_pixel(0, 0), 255);
      helper.assert(_pixel(3, 3), 255);
      helper.assert(_pixel(4, 4), 0); // top-left finder pattern
    });
    it('should generate linear barcodes with a height of 30 modules', function () {
      var _png = readPng(barcodeLib.generate('ean13', '590123412345'));
      // 95 modules + 2 * 10 modules of quiet zone, 3 pixels by module
      helper.assert([_png.width, _png.height], [(95 + 20) * 3, 90]);
    });
  });

  describe('QR code', function () {
    it('should generate known matrices (verified with a decoder)', function () {
      var _matrix = barcodeLib.encodeQr('hello', 'M');
      helper.assert(_matrix.length, 21);
      helper.assert(matrixHash(_matrix), '63298cda221a9ac6a4d91a910d99464ae5cca4bc');
      var _unicode = barcodeLib.encodeQr('Résumé ☕', 'H');
      helper.assert(_unicode.length, 25);
      helper.assert(matrixHash(_unicode), '5827d3009f39097b74b3b636baca8f9d82646c28');
    });
    it('should get bigger with the error correction level and the length of the text', function () {
      var _l = barcodeLib.encodeQr('x'.repeat(100), 'L').length;
      var _h = barcodeLib.encodeQr('x'.repeat(100), 'H').length;
      assert.ok(_h > _l);
      assert.ok(barcodeLib.encodeQr('x'.repeat(500), 'M').length > barcodeLib.encodeQr('x'.repeat(50), 'M').length);
    });
    it('should return clear errors', function () {
      assert.throws(function () { barcodeLib.generate('qrcode', 'x'.repeat(3500)); }, /too long for a QR code/);
      assert.throws(function () { barcodeLib.generate('qrcode', 'hello', { errorCorrection : 'Z' }); }, /unknown error correction level "Z"/);
    });
  });

  describe('Code 128', function () {
    it('should generate known bars (verified with a decoder)', function () {
      var _bars = function (text) {
        return barcodeLib.encodeCode128(text).join('');
      };
      helper.assert(_bars('A'), '2112141113231311232331112');
      helper.assert(_bars('ABC-123'), '2112141113231311231313211221321232212232112211321124122331112');
      // only digits: set C
      helper.assert(_bars('123456'), '2112321122321311233311211321312331112');
      // odd number of digits: one character in set B, then set C
      helper.assert(_bars('12345'), '2112141232211131413121311131232131312331112');
      helper.assert(_bars('AB1234CD'), '2112141113231311231131411122321311231141311313211123134111312331112');
      helper.assert(_bars('AB12345CD'), '2112141113231311231232211131413121311131231141311313211123132412112331112');
      // 2 digits: set B is used
      helper.assert(_bars('12'), '2112141232212232113111232331112');
    });
    it('should have 11 modules for each symbol and 13 for the stop, even in a long text', function () {
      ['A', '123456', 'INV-2026-000123', '0123456789012345678901234567890123456789', 'AB12345CD'].forEach(function (text) {
        var _total = barcodeLib.encodeCode128(text).reduce(function (sum, w) { return sum + w; }, 0);
        helper.assert((_total - 13) % 11, 0);
      });
    });
    it('should return clear errors for unsupported characters', function () {
      assert.throws(function () { barcodeLib.generate('code128', 'café'); }, /character "é" is not supported/);
      assert.throws(function () { barcodeLib.generate('code128', 'a\nb'); }, /not supported/);
    });
  });

  describe('EAN-13', function () {
    it('should compute check digits', function () {
      helper.assert([barcodeLib.eanCheckDigit('590123412345'), barcodeLib.eanCheckDigit('400638133393'), barcodeLib.eanCheckDigit('000000000000'), barcodeLib.eanCheckDigit('978020137962')], [7, 1, 0, 4]);
    });
    it('should generate known modules (verified with a decoder), with or without the check digit', function () {
      helper.assert(barcodeLib.encodeEan13('4006381333931'), '10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101');
      helper.assert(barcodeLib.encodeEan13('400638133393'), barcodeLib.encodeEan13('4006381333931'));
      helper.assert(barcodeLib.encodeEan13('590123412345'), '10100010110100111011001100100110111101001110101010110011011011001000010101110010011101000100101');
    });
    it('should have 95 modules with the guards at the right places', function () {
      var _modules = barcodeLib.encodeEan13('978020137962');
      helper.assert(_modules.length, 95);
      helper.assert([_modules.slice(0, 3), _modules.slice(45, 50), _modules.slice(92)], ['101', '01010', '101']);
    });
    it('should return clear errors', function () {
      assert.throws(function () { barcodeLib.generate('ean13', '12345'); }, /12 or 13 digits/);
      assert.throws(function () { barcodeLib.generate('ean13', '59012341234AB'); }, /12 or 13 digits/);
      assert.throws(function () { barcodeLib.generate('ean13', '5901234123450'); }, /check digit of "5901234123450" is wrong, it should be 7/);
    });
  });

  describe('EAN-8, UPC-A, Code 39, ITF (verified with a decoder)', function () {
    it('should encode EAN-8 and add or verify the check digit', function () {
      var _modules = barcodeLib.encodeEan8('1234567');
      helper.assert(_modules.length, 67);
      helper.assert(barcodeLib.encodeEan8('12345670'), _modules);
      assert.throws(function () { barcodeLib.encodeEan8('12345671'); }, /check digit of "12345671" is wrong, it should be 0/);
      assert.throws(function () { barcodeLib.encodeEan8('123'); }, /7 or 8 digits/);
    });
    it('should encode UPC-A as an EAN-13 with a leading 0', function () {
      helper.assert(barcodeLib.encodeUpcA('03600029145'), barcodeLib.encodeEan13('003600029145'));
      helper.assert(barcodeLib.encodeUpcA('036000291452').length, 95);
      assert.throws(function () { barcodeLib.encodeUpcA('036000291453'); }, /Barcode upca: the check digit of "036000291453" is wrong, it should be 2/);
      assert.throws(function () { barcodeLib.encodeUpcA('123'); }, /11 or 12 digits/);
    });
    it('should encode Code 39 (lowercase letters are converted)', function () {
      helper.assert(barcodeLib.encodeCode39('abc'), barcodeLib.encodeCode39('ABC'));
      // 3 characters + start + stop = 5 characters of 9 elements + 4 spaces
      helper.assert(barcodeLib.encodeCode39('ABC').length, 5 * 9 + 4);
      assert.throws(function () { barcodeLib.encodeCode39('A*B'); }, /character "\*" is not supported/);
      assert.throws(function () { barcodeLib.encodeCode39('é'); }, /not supported/);
    });
    it('should encode ITF and add a leading 0 if the number of digits is odd', function () {
      helper.assert(barcodeLib.encodeItf('123'), barcodeLib.encodeItf('0123'));
      helper.assert(barcodeLib.encodeItf('1234').length, 4 + 20 + 3);
      assert.throws(function () { barcodeLib.encodeItf('12A4'); }, /digits only/);
    });
    it('should generate PNG for each type', function () {
      [['ean8', '1234567'], ['upca', '03600029145'], ['code39', 'HELLO-1'], ['itf', '1234567890']].forEach(function (c) {
        assert.ok(Buffer.isBuffer(barcodeLib.generate(c[0], c[1])), c[0]);
      });
    });
  });

  describe('generate', function () {
    it('should accept types in upper case, and refuse unknown types and empty values', function () {
      assert.ok(Buffer.isBuffer(barcodeLib.generate('QRCode', 'a')));
      assert.throws(function () { barcodeLib.generate('datamatrix', 'a'); }, /unknown type "datamatrix". Available types: qrcode, code128, ean13, ean8, upca, code39, itf/);
      assert.throws(function () { barcodeLib.generate(undefined, 'a'); }, /unknown type/);
      assert.throws(function () { barcodeLib.generate('qrcode', ''); }, /the value is empty/);
      assert.throws(function () { barcodeLib.generate('qrcode', 12); }, /the value is empty/);
      assert.throws(function () { barcodeLib.generate('code128', 'a'.repeat(4001)); }, /too long \(max 4000/);
    });
  });

  describe('barcode formatter', function () {
    it('should return a PNG as data URI, and accept numbers', function () {
      var _uri = barcodeFormatter.barcode('hello', 'qrcode');
      assert.ok(/^data:image\/png;base64,/.test(_uri));
      helper.assert(readPng(Buffer.from(_uri.split(',')[1], 'base64')).width, 232);
      helper.assert(readPng(Buffer.from(barcodeFormatter.barcode(123456, 'code128').split(',')[1], 'base64')).height, 90);
    });
    it('should use scale and error correction', function () {
      helper.assert(readPng(Buffer.from(barcodeFormatter.barcode('hello', 'qrcode', '2').split(',')[1], 'base64')).width, 58);
      var _l = readPng(Buffer.from(barcodeFormatter.barcode('x'.repeat(100), 'qrcode', 1, 'L').split(',')[1], 'base64')).width;
      var _h = readPng(Buffer.from(barcodeFormatter.barcode('x'.repeat(100), 'qrcode', 1, 'h').split(',')[1], 'base64')).width;
      assert.ok(_h > _l);
    });
    it('should return empty values untouched, and refuse other types of values', function () {
      helper.assert(barcodeFormatter.barcode(null, 'qrcode'), null);
      helper.assert(barcodeFormatter.barcode(undefined, 'qrcode'), undefined);
      helper.assert(barcodeFormatter.barcode('', 'qrcode'), '');
      assert.throws(function () { barcodeFormatter.barcode({ a : 1 }, 'qrcode'); }, /must be a text or a number/);
      assert.throws(function () { barcodeFormatter.barcode([1], 'qrcode'); }, /must be a text or a number/);
    });
  });

  describe('in a docx', function () {
    function media (files) {
      return Object.keys(files).filter(function (name) {
        return /^word\/media\/carbone_.*\.png$/.test(name);
      });
    }
    it('should replace a picture by a barcode', function (done) {
      renderDocx('<w:p>' + picture(1, '{d.code:barcode(qrcode)}') + '</w:p>', { code : 'https://carbone.io' }, function (err, files) {
        helper.assert(err, null);
        helper.assert(media(files).length, 1);
        var _png = readPng(files[media(files)[0]]);
        helper.assert(_png.width, _png.height);
        // 1800000 x 900000 placeholder, contain: the square QR code has the height of the placeholder
        helper.assert(files['word/document.xml'].toString().match(/<wp:extent cx="\d+" cy="\d+"\/>/)[0], '<wp:extent cx="900000" cy="900000"/>');
        done();
      });
    });
    it('should accept imageFit after the barcode, and options', function (done) {
      renderDocx('<w:p>' + picture(1, '{d.code:barcode(ean13, 4):imageFit(fillWidth)}') + '</w:p>', { code : '590123412345' }, function (err, files) {
        helper.assert(err, null);
        var _png = readPng(files[media(files)[0]]);
        helper.assert([_png.width, _png.height], [(95 + 20) * 4, 120]);
        var _extent = files['word/document.xml'].toString().match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/);
        helper.assert(_extent[1], '1800000');
        done();
      });
    });
    it('should print a different barcode for each row of a loop, and remove the picture if the value is empty', function (done) {
      var _body = '<w:tbl><w:tr><w:tc><w:p>' + picture(1, '{d.items[i].code:barcode(code128)}') + '</w:p></w:tc></w:tr><w:tr><w:tc><w:p>' + picture(2, '{d.items[i+1].code:barcode(code128)}') + '</w:p></w:tc></w:tr></w:tbl>';
      renderDocx(_body, { items : [{ code : 'A-1' }, { code : 'B-2' }, { code : '' }, { code : 'A-1' }] }, function (err, files) {
        helper.assert(err, null);
        helper.assert(files['word/document.xml'].toString().match(/<w:drawing>/g).length, 3);
        helper.assert(media(files).length, 2);
        done();
      });
    });
    it('should return a clear error if the value cannot be encoded', function (done) {
      renderDocx('<w:p>' + picture(1, '{d.code:barcode(ean13)}') + '</w:p>', { code : '123' }, function (err) {
        assert.ok(/Barcode ean13: the value must contain 12 or 13 digits/.test(err.message));
        renderDocx('<w:p>' + picture(1, '{d.code:barcode(banana)}') + '</w:p>', { code : '123' }, function (err) {
          assert.ok(/unknown type "banana"/.test(err.message));
          done();
        });
      });
    });
  });
});
