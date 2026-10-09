const zlib = require('zlib');
const qrcode = require('qrcode-generator');

/**
 * Barcodes: QR code, Code 128, EAN-13, EAN-8, UPC-A, Code 39 and ITF (Interleaved 2 of 5), generated as PNG images.
 *
 * `generate(type, text, options)` returns a PNG (Buffer), which is used as a dynamic image (see formatters/barcode.js)
 */

const TYPES = ['qrcode', 'code128', 'ean13', 'ean8', 'upca', 'code39', 'itf'];
const MAX_TEXT_LENGTH = 4000;

// QR codes can contain any character, use UTF-8 and not latin1
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

/** ****************************************************************************************************************/
/* PNG                                                                                                            */
/** ****************************************************************************************************************/

const CRC_TABLE = (function () {
  var _table = new Int32Array(256);
  for (var n = 0; n < 256; n++) {
    var _c = n;
    for (var k = 0; k < 8; k++) {
      _c = (_c & 1) ? (0xEDB88320 ^ (_c >>> 1)) : (_c >>> 1);
    }
    _table[n] = _c;
  }
  return _table;
})();

// zlib.crc32 does not exist in old versions of NodeJS
function crc32 (buffer) {
  var _crc = -1;
  for (var i = 0; i < buffer.length; i++) {
    _crc = CRC_TABLE[(_crc ^ buffer[i]) & 0xFF] ^ (_crc >>> 8);
  }
  return (_crc ^ -1) >>> 0;
}

function pngChunk (type, data) {
  var _length = Buffer.alloc(4);
  _length.writeUInt32BE(data.length, 0);
  var _body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  var _crc = Buffer.alloc(4);
  _crc.writeUInt32BE(crc32(_body), 0);
  return Buffer.concat([_length, _body, _crc]);
}

/**
 * Create a black and white PNG (8-bit grayscale)
 *
 * @param  {Integer} width   in pixels
 * @param  {Integer} height  in pixels
 * @param  {Function} isBlack function(x, y) returns true if the pixel is black
 * @return {Buffer}          PNG file
 */
function createPng (width, height, isBlack) {
  var _raw = Buffer.alloc((width + 1) * height, 0xFF);
  for (var y = 0; y < height; y++) {
    var _offset = y * (width + 1);
    _raw[_offset] = 0; // filter: none
    for (var x = 0; x < width; x++) {
      if (isBlack(x, y) === true) {
        _raw[_offset + 1 + x] = 0;
      }
    }
  }
  var _header = Buffer.alloc(13);
  _header.writeUInt32BE(width, 0);
  _header.writeUInt32BE(height, 4);
  _header[8] = 8; // bit depth
  _header[9] = 0; // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', _header),
    pngChunk('IDAT', zlib.deflateSync(_raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

/** ****************************************************************************************************************/
/* QR code                                                                                                        */
/** ****************************************************************************************************************/

function encodeQr (text, errorCorrection) {
  var _level = (errorCorrection || 'M').toUpperCase();
  if (['L', 'M', 'Q', 'H'].indexOf(_level) === -1) {
    throw new Error('Barcode qrcode: unknown error correction level "' + errorCorrection + '". Available levels: L, M, Q, H');
  }
  var _qr = qrcode(0, _level);
  _qr.addData(text);
  try {
    _qr.make();
  }
  catch (e) {
    throw new Error('Barcode qrcode: the text is too long for a QR code (' + text.length + ' characters, level ' + _level + ')');
  }
  var _size = _qr.getModuleCount();
  var _matrix = [];
  for (var row = 0; row < _size; row++) {
    var _line = [];
    for (var col = 0; col < _size; col++) {
      _line.push(_qr.isDark(row, col));
    }
    _matrix.push(_line);
  }
  return _matrix;
}

/** ****************************************************************************************************************/
/* Code 128                                                                                                       */
/** ****************************************************************************************************************/

// widths of bars and spaces, for each value. 106 is the stop pattern
const CODE128_PATTERNS = [
  '212222', '222122', '222222', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231',
  '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131',
  '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211',
  '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214',
  '211232', '2331112'
];
const CODE128_START_B = 104;
const CODE128_START_C = 105;
const CODE128_SWITCH_B = 100;
const CODE128_SWITCH_C = 99;
const CODE128_STOP = 106;

function countDigits (text, index) {
  var _count = 0;
  while (index + _count < text.length && text.charCodeAt(index + _count) >= 48 && text.charCodeAt(index + _count) <= 57) {
    _count++;
  }
  return _count;
}

/**
 * Encode a text in Code 128. Set C is used for long series of digits, set B for other characters (ASCII 32 to 126)
 *
 * @param  {String} text
 * @return {Array}       bars: array of widths, starting with a bar (black), then a space (white), ...
 */
function encodeCode128 (text) {
  for (var c = 0; c < text.length; c++) {
    if (text.charCodeAt(c) < 32 || text.charCodeAt(c) > 126) {
      throw new Error('Barcode code128: the character "' + text[c] + '" is not supported. Only ASCII characters from 32 to 126 are accepted');
    }
  }
  var _codes = [];
  var _mode = null;
  var _i = 0;
  while (_i < text.length) {
    var _digits = countDigits(text, _i);
    if (_mode === 'C' && _digits >= 2) {
      _codes.push(parseInt(text.substr(_i, 2), 10));
      _i += 2;
      continue;
    }
    if (_mode !== 'C' && _digits >= 4) {
      // switch to set C, after one character in set B if the number of digits is odd
      if (_mode === null && _digits % 2 === 0) {
        _codes.push(CODE128_START_C);
        _mode = 'C';
        continue;
      }
      if (_mode === null) {
        _codes.push(CODE128_START_B);
        _mode = 'B';
      }
      if (_digits % 2 === 1) {
        _codes.push(text.charCodeAt(_i) - 32);
        _i++;
      }
      _codes.push(CODE128_SWITCH_C);
      _mode = 'C';
      continue;
    }
    if (_mode === null) {
      _codes.push(CODE128_START_B);
      _mode = 'B';
    }
    else if (_mode === 'C') {
      _codes.push(CODE128_SWITCH_B);
      _mode = 'B';
    }
    _codes.push(text.charCodeAt(_i) - 32);
    _i++;
  }
  if (_codes.length === 0) {
    _codes.push(CODE128_START_B);
  }
  var _checksum = _codes[0];
  for (var k = 1; k < _codes.length; k++) {
    _checksum += _codes[k] * k;
  }
  _codes.push(_checksum % 103);
  _codes.push(CODE128_STOP);
  var _bars = [];
  _codes.forEach(function (code) {
    CODE128_PATTERNS[code].split('').forEach(function (width) {
      _bars.push(parseInt(width, 10));
    });
  });
  return _bars;
}

/** ****************************************************************************************************************/
/* EAN-13                                                                                                         */
/** ****************************************************************************************************************/

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
// R is the complement of L, and G is R reversed
const EAN_R = EAN_L.map(function (pattern) {
  return pattern.split('').map(function (bit) { return bit === '0' ? '1' : '0'; }).join('');
});
const EAN_G = EAN_R.map(function (pattern) {
  return pattern.split('').reverse().join('');
});
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function eanCheckDigit (digits12) {
  var _sum = 0;
  for (var i = 0; i < 12; i++) {
    _sum += parseInt(digits12[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (_sum % 10)) % 10;
}

/**
 * Encode an EAN-13. 12 digits are accepted (the check digit is added), or 13 digits (the check digit is verified)
 *
 * @param  {String} text
 * @return {String}      modules, a string of "0" and "1"
 */
function encodeEan13 (text) {
  if (/^\d{12,13}$/.test(text) === false) {
    throw new Error('Barcode ean13: the value must contain 12 or 13 digits');
  }
  var _digits = text.slice(0, 12);
  var _check = eanCheckDigit(_digits);
  if (text.length === 13 && parseInt(text[12], 10) !== _check) {
    throw new Error('Barcode ean13: the check digit of "' + text + '" is wrong, it should be ' + _check);
  }
  _digits += _check;
  var _parity = EAN_PARITY[parseInt(_digits[0], 10)];
  var _modules = '101';
  for (var i = 1; i <= 6; i++) {
    _modules += (_parity[i - 1] === 'L' ? EAN_L : EAN_G)[parseInt(_digits[i], 10)];
  }
  _modules += '01010';
  for (var j = 7; j <= 12; j++) {
    _modules += EAN_R[parseInt(_digits[j], 10)];
  }
  return _modules + '101';
}

/** ****************************************************************************************************************/
/* EAN-8, UPC-A                                                                                                   */
/** ****************************************************************************************************************/

/**
 * Encode an EAN-8. 7 digits are accepted (the check digit is added), or 8 digits (the check digit is verified)
 */
function encodeEan8 (text) {
  if (/^\d{7,8}$/.test(text) === false) {
    throw new Error('Barcode ean8: the value must contain 7 or 8 digits');
  }
  var _sum = 0;
  for (var i = 0; i < 7; i++) {
    _sum += parseInt(text[i], 10) * (i % 2 === 0 ? 3 : 1);
  }
  var _check = (10 - (_sum % 10)) % 10;
  if (text.length === 8 && parseInt(text[7], 10) !== _check) {
    throw new Error('Barcode ean8: the check digit of "' + text + '" is wrong, it should be ' + _check);
  }
  var _digits = text.slice(0, 7) + _check;
  var _modules = '101';
  for (var j = 0; j < 4; j++) {
    _modules += EAN_L[parseInt(_digits[j], 10)];
  }
  _modules += '01010';
  for (var k = 4; k < 8; k++) {
    _modules += EAN_R[parseInt(_digits[k], 10)];
  }
  return _modules + '101';
}

/**
 * Encode a UPC-A. 11 digits are accepted (the check digit is added), or 12 digits (the check digit is verified).
 * A UPC-A is an EAN-13 with a leading 0
 */
function encodeUpcA (text) {
  if (/^\d{11,12}$/.test(text) === false) {
    throw new Error('Barcode upca: the value must contain 11 or 12 digits');
  }
  if (text.length === 12) {
    var _check = eanCheckDigit('0' + text.slice(0, 11));
    if (parseInt(text[11], 10) !== _check) {
      throw new Error('Barcode upca: the check digit of "' + text + '" is wrong, it should be ' + _check);
    }
  }
  return encodeEan13('0' + text);
}

/** ****************************************************************************************************************/
/* Code 39, ITF                                                                                                   */
/** ****************************************************************************************************************/

// n: narrow, w: wide. Elements alternate bar, space, bar, ...
const CODE39_PATTERNS = {
  '0' : 'nnnwwnwnn', '1' : 'wnnwnnnnw', '2' : 'nnwwnnnnw', '3' : 'wnwwnnnnn', '4' : 'nnnwwnnnw', '5' : 'wnnwwnnnn', '6' : 'nnwwwnnnn',
  '7' : 'nnnwnnwnw', '8' : 'wnnwnnwnn', '9' : 'nnwwnnwnn', 'A' : 'wnnnnwnnw', 'B' : 'nnwnnwnnw', 'C' : 'wnwnnwnnn', 'D' : 'nnnnwwnnw',
  'E' : 'wnnnwwnnn', 'F' : 'nnwnwwnnn', 'G' : 'nnnnnwwnw', 'H' : 'wnnnnwwnn', 'I' : 'nnwnnwwnn', 'J' : 'nnnnwwwnn', 'K' : 'wnnnnnnww',
  'L' : 'nnwnnnnww', 'M' : 'wnwnnnnwn', 'N' : 'nnnnwnnww', 'O' : 'wnnnwnnwn', 'P' : 'nnwnwnnwn', 'Q' : 'nnnnnnwww', 'R' : 'wnnnnnwwn',
  'S' : 'nnwnnnwwn', 'T' : 'nnnnwnwwn', 'U' : 'wwnnnnnnw', 'V' : 'nwwnnnnnw', 'W' : 'wwwnnnnnn', 'X' : 'nwnnwnnnw', 'Y' : 'wwnnwnnnn',
  'Z' : 'nwwnwnnnn', '-' : 'nwnnnnwnw', '.' : 'wwnnnnwnn', ' ' : 'nwwnnnwnn', '*' : 'nwnnwnwnn', '$' : 'nwnwnwnnn', '/' : 'nwnwnnnwn',
  '+' : 'nwnnnwnwn', '%' : 'nnnwnwnwn'
};
const ITF_PATTERNS = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];
const WIDE_RATIO = 3;

function patternToWidths (pattern) {
  return pattern.split('').map(function (element) {
    return element === 'w' ? WIDE_RATIO : 1;
  });
}

/**
 * Encode a Code 39: digits, capital letters (lowercase letters are converted), and - . space $ / + %
 */
function encodeCode39 (text) {
  var _text = text.toUpperCase();
  var _widths = [];
  var _chars = '*' + _text + '*';
  for (var i = 0; i < _chars.length; i++) {
    if (i > 0 && i < _chars.length - 1 && _chars[i] === '*' || !CODE39_PATTERNS[_chars[i]]) {
      throw new Error('Barcode code39: the character "' + _chars[i] + '" is not supported. Accepted: 0-9 A-Z - . space $ / + %');
    }
    if (i > 0) {
      _widths.push(1); // space between characters
    }
    _widths = _widths.concat(patternToWidths(CODE39_PATTERNS[_chars[i]]));
  }
  return _widths;
}

/**
 * Encode an ITF (Interleaved 2 of 5): an even number of digits. A "0" is added at the beginning if the number of digits is odd
 */
function encodeItf (text) {
  if (/^\d+$/.test(text) === false) {
    throw new Error('Barcode itf: the value must contain digits only');
  }
  var _text = text.length % 2 === 1 ? '0' + text : text;
  var _widths = [1, 1, 1, 1]; // start
  for (var i = 0; i < _text.length; i += 2) {
    var _bars = ITF_PATTERNS[parseInt(_text[i], 10)];
    var _spaces = ITF_PATTERNS[parseInt(_text[i + 1], 10)];
    for (var k = 0; k < 5; k++) {
      _widths.push(_bars[k] === 'w' ? WIDE_RATIO : 1);
      _widths.push(_spaces[k] === 'w' ? WIDE_RATIO : 1);
    }
  }
  return _widths.concat([WIDE_RATIO, 1, 1]); // stop
}

/** ****************************************************************************************************************/
/* Public                                                                                                         */
/** ****************************************************************************************************************/

/**
 * Convert widths [bar, space, bar, ...] into modules: a string of "0" and "1"
 */
function barsToModules (widths) {
  var _modules = '';
  widths.forEach(function (width, index) {
    _modules += (index % 2 === 0 ? '1' : '0').repeat(width);
  });
  return _modules;
}

var barcode = {

  TYPES,
  encodeQr,
  encodeCode128,
  encodeEan13,
  encodeEan8,
  encodeUpcA,
  encodeCode39,
  encodeItf,
  eanCheckDigit,
  createPng,

  /**
   * Generate a barcode
   *
   * @param  {String}  type     one of TYPES (case insensitive)
   * @param  {String}  text     text to encode
   * @param  {Object}  options  { scale : pixels of one module (1 to 30), errorCorrection : L, M, Q or H, only for QR codes }
   * @return {Buffer}           PNG image
   */
  generate : function (type, text, options) {
    var _type = (type + '').toLowerCase();
    var _options = options || {};
    if (TYPES.indexOf(_type) === -1) {
      throw new Error('Barcode: unknown type "' + type + '". Available types: ' + TYPES.join(', '));
    }
    if (typeof text !== 'string' || text === '') {
      throw new Error('Barcode ' + _type + ': the value is empty');
    }
    if (text.length > MAX_TEXT_LENGTH) {
      throw new Error('Barcode ' + _type + ': the value is too long (max ' + MAX_TEXT_LENGTH + ' characters)');
    }
    var _scale = parseInt(_options.scale, 10);
    if (Number.isNaN(_scale) === true) {
      _scale = _type === 'qrcode' ? 8 : 3;
    }
    _scale = Math.min(Math.max(_scale, 1), 30);
    if (_type === 'qrcode') {
      var _matrix = encodeQr(text, _options.errorCorrection);
      var _quiet = 4; // modules of white around the code
      var _pixels = (_matrix.length + _quiet * 2) * _scale;
      return createPng(_pixels, _pixels, function (x, y) {
        var _col = Math.floor(x / _scale) - _quiet;
        var _row = Math.floor(y / _scale) - _quiet;
        return _row >= 0 && _col >= 0 && _row < _matrix.length && _col < _matrix.length && _matrix[_row][_col];
      });
    }
    var _encoders = {
      code128 : function (t) { return barsToModules(encodeCode128(t)); },
      ean13   : encodeEan13,
      ean8    : encodeEan8,
      upca    : encodeUpcA,
      code39  : function (t) { return barsToModules(encodeCode39(t)); },
      itf     : function (t) { return barsToModules(encodeItf(t)); }
    };
    var _modules = _encoders[_type](text);
    var _quietLinear = 10;
    var _width = (_modules.length + _quietLinear * 2) * _scale;
    var _height = 30 * _scale;
    return createPng(_width, _height, function (x) {
      var _index = Math.floor(x / _scale) - _quietLinear;
      return _index >= 0 && _index < _modules.length && _modules[_index] === '1';
    });
  }
};

module.exports = barcode;
