var assert = require('assert');
var carbone = require('../lib');
var pdfLib = require('pdf-lib');
var pdfFile = require('../lib/pdf');
var helper = require('../lib/helper');

function makePdf (nbPages, label) {
  return pdfLib.PDFDocument.create().then(function (doc) {
    for (var i = 0; i < nbPages; i++) {
      doc.addPage([200, 200]).drawText(label + (i + 1));
    }
    return doc.save();
  });
}
function dataUri (bytes, mime) {
  return 'data:' + mime + ';base64,' + Buffer.from(bytes).toString('base64');
}
function attachmentNames (buffer) {
  return pdfLib.PDFDocument.load(buffer).then(function (doc) {
    var _names = [];
    doc.context.enumerateIndirectObjects().forEach(function (entry) {
      var _obj = entry[1];
      if (_obj instanceof pdfLib.PDFDict && _obj.get(pdfLib.PDFName.of('Type')) === pdfLib.PDFName.of('Filespec')) {
        _names.push(_obj.get(pdfLib.PDFName.of('F')).decodeText());
      }
    });
    return _names;
  });
}
function pageCount (buffer) {
  return pdfLib.PDFDocument.load(buffer).then(function (doc) { return doc.getPageCount(); });
}

describe('PDF actions (appendFile, attachFile)', function () {

  describe('formatters', function () {
    var formatters = require('../formatters/pdf');
    it('should register actions and print nothing', function () {
      var _ctx = {};
      helper.assert(formatters.appendFile.call(_ctx, 'data:application/pdf;base64,AAAA', 'start'), '');
      helper.assert(formatters.appendFile.call(_ctx, 'data:application/pdf;base64,AAAA', 3), '');
      helper.assert(formatters.appendFile.call(_ctx, 'data:application/pdf;base64,AAAA'), '');
      helper.assert(formatters.attachFile.call(_ctx, 'data:text/plain;base64,aGk=', 'a/b.txt', 'text/plain'), '');
      helper.assert(_ctx.pdfActions.length, 4);
      helper.assert(_ctx.pdfActions[0].position, 'start');
      helper.assert(_ctx.pdfActions[1].position, 3);
      helper.assert(_ctx.pdfActions[2].position, 'end');
      assert.ok(_ctx.pdfActions[3].filename.indexOf('/') === -1);
    });
    it('should ignore empty values', function () {
      var _ctx = {};
      helper.assert(formatters.appendFile.call(_ctx, ''), '');
      helper.assert(formatters.attachFile.call(_ctx, null, 'a.txt'), '');
      helper.assert(_ctx.pdfActions, undefined);
    });
    it('should refuse a wrong position or mimetype', function () {
      assert.throws(function () { formatters.appendFile.call({}, 'x', 'middle'); });
      assert.throws(function () { formatters.appendFile.call({}, 'x', 0); });
      assert.throws(function () { formatters.attachFile.call({}, 'x', 'a.txt', 'bad type'); });
    });
  });

  describe('pdf.apply', function () {
    it('should append at the end, at the start and before a page', function (done) {
      Promise.all([makePdf(3, 'M'), makePdf(2, 'X')]).then(function (res) {
        var _src = dataUri(res[1], 'application/pdf');
        pdfFile.apply(Buffer.from(res[0]), [
          { type : 'append', source : _src, position : 'end' },
          { type : 'append', source : _src, position : 'start' },
          { type : 'append', source : _src, position : 2 }
        ], function (err, out) {
          helper.assert(err, null);
          pageCount(out).then(function (n) {
            helper.assert(n, 3 + 6);
            done();
          }).catch(done);
        });
      }).catch(done);
    });
    it('should attach a file', function (done) {
      makePdf(1, 'M').then(function (pdf) {
        pdfFile.apply(Buffer.from(pdf), [
          { type : 'attach', source : dataUri(Buffer.from('hello'), 'text/plain'), filename : 'hello.txt', mimetype : 'text/plain' }
        ], function (err, out) {
          helper.assert(err, null);
          attachmentNames(out).then(function (names) {
            helper.assert(names, ['hello.txt']);
            done();
          }).catch(done);
        });
      }).catch(done);
    });
    it('should return an error if a source is invalid', function (done) {
      makePdf(1, 'M').then(function (pdf) {
        pdfFile.apply(Buffer.from(pdf), [{ type : 'append', source : 'not a file', position : 'end' }], function (err) {
          assert.ok(/Cannot load the file/.test(err), err);
          pdfFile.apply(Buffer.from(pdf), [{ type : 'append', source : dataUri(Buffer.from('not a pdf'), 'application/pdf'), position : 'end' }], function (err) {
            assert.ok(/Cannot append the file/.test(err), err);
            done();
          });
        });
      }).catch(done);
    });
    it('should refuse the encryption', function () {
      var _err = pdfFile.check({ pdfActions : [{ type : 'attach' }], convertTo : { filters : { EncryptFile : true } } });
      assert.ok(/cannot be used with the encryption/.test(_err));
      helper.assert(pdfFile.check({ pdfActions : [{ type : 'attach' }], convertTo : { filters : {} } }), null);
    });
  });

  describe('conversion with LibreOffice', function () {
    function template (content) {
      return {
        isZipped   : true,
        filename   : 'doc.docx',
        embeddings : [],
        files      : [
          { name : '[Content_Types].xml', isMarked : true, parent : '', data : '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
          { name : '_rels/.rels', isMarked : true, parent : '', data : '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
          { name : 'word/document.xml', isMarked : true, parent : '', data : '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' + content + '</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>' }
        ]
      };
    }
    it('should append and attach files in the generated PDF', function (done) {
      makePdf(2, 'X').then(function (extra) {
        var _data = {
          pdf  : dataUri(extra, 'application/pdf'),
          file : dataUri(Buffer.from('hello'), 'text/plain')
        };
        carbone.render(template('Hello{d.pdf:appendFile(end)}{d.file:attachFile(data.txt, text/plain)}'), _data, { convertTo : 'pdf' }, function (err, result) {
          helper.assert(err, null);
          Promise.all([pageCount(result), attachmentNames(result)]).then(function (res) {
            helper.assert(res[0], 3);
            helper.assert(res[1], ['data.txt']);
            done();
          }).catch(done);
        });
      }).catch(done);
    });
    it('should return an error with the encryption', function (done) {
      var _data = { file : dataUri(Buffer.from('hello'), 'text/plain') };
      carbone.render(template('Hello{d.file:attachFile(data.txt)}'), _data, { convertTo : { formatName : 'pdf', formatOptions : { EncryptFile : true, DocumentOpenPassword : 'x' } } }, function (err) {
        assert.ok(/cannot be used with the encryption/.test(err), err);
        done();
      });
    });
    it('should ignore the actions if the output is not a PDF', function (done) {
      var _data = { file : dataUri(Buffer.from('hello'), 'text/plain') };
      carbone.render(template('Hello{d.file:attachFile(data.txt)}'), _data, { convertTo : 'txt' }, function (err, result) {
        helper.assert(err, null);
        assert.ok(result.toString().indexOf('Hello') !== -1);
        done();
      });
    });
  });
});
