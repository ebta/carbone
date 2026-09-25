var assert = require('assert');
var input  = require('../lib/input');
var helper = require('../lib/helper');

describe('input', function () {

  describe('parseOptions', function () {
    it('should accept null or undefined options', function (done) {
      input.parseOptions(null, function () {}, function (options) {
        helper.assert(options.lang, 'en');
        input.parseOptions(undefined, function () {}, function (options) {
          helper.assert(options.lang, 'en');
          done();
        });
      });
    });
  });

  describe('parseConvertTo', function () {
    it('should not crash if formatOptions is not defined for PDF, and should not modify the user object', function () {
      var _options = { extension : 'odt' };
      helper.assert(input.parseConvertTo(_options, { formatName : 'pdf' }), null);
      helper.assert(_options.convertTo.filters, { ReduceImageResolution : false });
      var _userFilters = { Quality : 80 };
      _options = { extension : 'odt' };
      helper.assert(input.parseConvertTo(_options, { formatName : 'pdf', formatOptions : _userFilters }), null);
      helper.assert(_options.convertTo.filters, { Quality : 80, ReduceImageResolution : false });
      helper.assert(_userFilters, { Quality : 80 });
      _options = { extension : 'odt' };
      helper.assert(input.parseConvertTo(_options, { formatName : 'pdf', formatOptions : null }), null);
      helper.assert(_options.convertTo.filters, { ReduceImageResolution : false });
    });
    it('should not crash if formatOptions is not defined for images', function () {
      var _options = { extension : 'odt' };
      helper.assert(input.parseConvertTo(_options, { formatName : 'png' }), null);
      helper.assert(_options.convertTo.filters, {});
    });
  });

  describe('checkAndSetOptionsForCSV', function () {
    it('should build the option string', function () {
      var _convertTo = {};
      helper.assert(input.checkAndSetOptionsForCSV({ fieldSeparator : ';', textDelimiter : '\'', characterSet : '76', numberOfFirstLine : 2, cellFormat : 1 }, _convertTo), null);
      helper.assert(_convertTo.optionsStr, '59,39,76,2,1');
    });
    it('should reject options which could inject arguments in the converter command', function () {
      var _convertTo = {};
      var _err = input.checkAndSetOptionsForCSV({ characterSet : '76" --output="/tmp/hack' }, _convertTo);
      assert.ok(/forbidden characters/.test(_err));
      _err = input.checkAndSetOptionsForCSV({ cellFormat : '1\n--input=x' }, _convertTo);
      assert.ok(/forbidden characters/.test(_err));
    });
  });
});
