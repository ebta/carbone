var assert = require('assert');
var carbone = require('../lib');
var exportFilters = require('../lib/filters');
var input = require('../lib/input');
var helper = require('../lib/helper');

describe('export options (PDF, PNG, JPG)', function () {

  describe('filters.check', function () {
    it('should accept known options with a valid type and copy them', function () {
      var _user = { Watermark : 'DRAFT', Quality : 80, EncryptFile : true, DocumentOpenPassword : 'pwd', SelectPdfVersion : 2, MaxImageResolution : 300, PageRange : '1-3, 5' };
      var _res = exportFilters.check('pdf', _user);
      helper.assert(_res.error, null);
      helper.assert(_res.filters, _user);
      assert.notStrictEqual(_res.filters, _user);
    });
    it('should accept no options, and ignore null and undefined values', function () {
      helper.assert(exportFilters.check('pdf', undefined), { error : null, filters : {} });
      helper.assert(exportFilters.check('pdf', null), { error : null, filters : {} });
      helper.assert(exportFilters.check('pdf', { Watermark : null, Quality : undefined }), { error : null, filters : {} });
    });
    it('should refuse unknown options and list the available options', function () {
      var _res = exportFilters.check('pdf', { Banana : 1 });
      assert.ok(/Unknown option "Banana" for the format "pdf". Available options: ReduceImageResolution/.test(_res.error));
      assert.ok(/Unknown option "ViewPDFAfterExport"/.test(exportFilters.check('pdf', { ViewPDFAfterExport : true }).error));
      assert.ok(/Unknown option "__proto__"/.test(exportFilters.check('pdf', JSON.parse('{"__proto__": true}')).error));
      assert.ok(/Unknown option "toString"/.test(exportFilters.check('pdf', { toString : 1 }).error));
      assert.ok(/Unknown option "Quality" for the format "png"/.test(exportFilters.check('png', { Quality : 1 }).error));
    });
    it('should refuse values with a wrong type or out of range', function () {
      [
        [{ Quality : 0 }, /"Quality" must be an integer between 1 and 100/],
        [{ Quality : 101 }, /"Quality"/],
        [{ Quality : '80' }, /"Quality"/],
        [{ Quality : 80.5 }, /"Quality"/],
        [{ EncryptFile : 'yes' }, /"EncryptFile" must be true or false/],
        [{ MaxImageResolution : 100 }, /"MaxImageResolution" must be one of: 75, 150, 300, 600, 1200/],
        [{ SelectPdfVersion : 4 }, /"SelectPdfVersion" must be one of/],
        [{ Watermark : 12 }, /"Watermark" must be a text of 500 characters at most/],
        [{ Watermark : 'x'.repeat(501) }, /"Watermark"/],
        [{ PageRange : '1-3; rm -rf' }, /"PageRange" contains forbidden characters/],
        [{ Printing : 3 }, /"Printing"/],
        [{ WatermarkColor : -1 }, /"WatermarkColor"/]
      ].forEach(function (testCase) {
        var _res = exportFilters.check('pdf', testCase[0]);
        assert.ok(testCase[1].test(_res.error), JSON.stringify(testCase[0]) + ' -> ' + _res.error);
        helper.assert(_res.filters, {});
      });
    });
    it('should refuse non-object options', function () {
      assert.ok(/formatOptions must be an object/.test(exportFilters.check('pdf', 'DRAFT').error));
      assert.ok(/formatOptions must be an object/.test(exportFilters.check('pdf', ['a']).error));
    });
    it('should require a password with encryption and with restricted permissions', function () {
      assert.ok(/"EncryptFile" needs the option "DocumentOpenPassword"/.test(exportFilters.check('pdf', { EncryptFile : true }).error));
      assert.ok(/"RestrictPermissions" needs the option "PermissionPassword"/.test(exportFilters.check('pdf', { RestrictPermissions : true }).error));
      helper.assert(exportFilters.check('pdf', { EncryptFile : false }).error, null);
    });
    it('should accept options of images', function () {
      helper.assert(exportFilters.check('png', { Compression : 9, PixelWidth : 800 }).error, null);
      helper.assert(exportFilters.check('jpg', { Quality : 50, ColorMode : 1 }).error, null);
      assert.ok(/"Compression"/.test(exportFilters.check('png', { Compression : 10 }).error));
    });
  });

  describe('parseConvertTo', function () {
    it('should set the filters of a PDF, with ReduceImageResolution deactivated by default', function () {
      var _options = { extension : 'odt' };
      helper.assert(input.parseConvertTo(_options, { formatName : 'pdf', formatOptions : { Watermark : 'A' } }), null);
      helper.assert(_options.convertTo.filters, { Watermark : 'A', ReduceImageResolution : false });
      _options = { extension : 'odt' };
      helper.assert(input.parseConvertTo(_options, { formatName : 'pdf', formatOptions : { ReduceImageResolution : true } }), null);
      helper.assert(_options.convertTo.filters, { ReduceImageResolution : true });
    });
    it('should return the error of an invalid option', function () {
      assert.ok(/Unknown option "Banana"/.test(input.parseConvertTo({ extension : 'odt' }, { formatName : 'pdf', formatOptions : { Banana : 1 } })));
      assert.ok(/"Quality" must be an integer/.test(input.parseConvertTo({ extension : 'odt' }, { formatName : 'jpg', formatOptions : { Quality : 1000 } })));
    });
    it('should set the filters of images', function () {
      var _options = { extension : 'odt' };
      helper.assert(input.parseConvertTo(_options, { formatName : 'png', formatOptions : { Compression : 5 } }), null);
      helper.assert(_options.convertTo.filters, { Compression : 5 });
    });
  });

  describe('conversion with LibreOffice', function () {
    function template () {
      function paragraph (text, pageBreak) {
        return '<w:p>' + (pageBreak ? '<w:pPr><w:pageBreakBefore/></w:pPr>' : '') + '<w:r><w:t>' + text + '</w:t></w:r></w:p>';
      }
      return {
        isZipped   : true,
        filename   : 'pages.docx',
        embeddings : [],
        files      : [
          { name : '[Content_Types].xml', isMarked : true, parent : '', data : '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
          { name : '_rels/.rels', isMarked : true, parent : '', data : '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
          { name : 'word/document.xml', isMarked : true, parent : '', data : '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paragraph('Page one') + paragraph('Page two', true) + paragraph('Page three', true) + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>' }
        ]
      };
    }
    function toPdf (formatOptions, callback) {
      carbone.render(template(), {}, { convertTo : { formatName : 'pdf', formatOptions : formatOptions } }, callback);
    }
    function pages (pdf) {
      return (pdf.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
    }
    it('should convert without options', function (done) {
      toPdf(undefined, function (err, pdf) {
        helper.assert(err, null);
        helper.assert(pages(pdf), 3);
        assert.ok(pdf.toString('latin1').indexOf('/Encrypt') === -1);
        done();
      });
    });
    it('should export a page range', function (done) {
      toPdf({ PageRange : '2-3' }, function (err, pdf) {
        helper.assert(err, null);
        helper.assert(pages(pdf), 2);
        toPdf({ PageRange : '1' }, function (err, pdf) {
          helper.assert(err, null);
          helper.assert(pages(pdf), 1);
          done();
        });
      });
    });
    it('should encrypt the PDF with a password', function (done) {
      toPdf({ EncryptFile : true, DocumentOpenPassword : 'secret' }, function (err, pdf) {
        helper.assert(err, null);
        assert.ok(/\/Encrypt\b/.test(pdf.toString('latin1')));
        done();
      });
    });
    it('should restrict permissions with a password', function (done) {
      toPdf({ RestrictPermissions : true, PermissionPassword : 'owner', Printing : 0, Changes : 0 }, function (err, pdf) {
        helper.assert(err, null);
        assert.ok(/\/Encrypt\b/.test(pdf.toString('latin1')));
        done();
      });
    });
    it('should create a PDF/A', function (done) {
      toPdf({ SelectPdfVersion : 2 }, function (err, pdf) {
        helper.assert(err, null);
        helper.assert(/pdfaid:part>(\d)</.exec(pdf.toString('latin1'))[1], '2');
        done();
      });
    });
    it('should return an error without conversion if an option is invalid', function (done) {
      toPdf({ EncryptFile : true }, function (err, pdf) {
        assert.ok(/needs the option "DocumentOpenPassword"/.test(err));
        helper.assert(pdf, undefined);
        done();
      });
    });
  });
});
