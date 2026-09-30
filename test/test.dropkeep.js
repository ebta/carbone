var carbone = require('../lib');
var parser = require('../lib/parser');
var helper = require('../lib/helper');

describe('drop and keep', function () {

  describe('parser.expandDropKeepMarkers', function () {
    it('should do nothing if there is no drop or keep marker', function () {
      helper.assert(parser.expandDropKeepMarkers('<w:p>{d.id}</w:p>'), '<w:p>{d.id}</w:p>');
      helper.assert(parser.expandDropKeepMarkers(null), null);
      helper.assert(parser.expandDropKeepMarkers(undefined), undefined);
    });
    it('should surround the paragraph with a hide block', function () {
      helper.assert(parser.expandDropKeepMarkers('<w:p><w:r>a{d.x:ifEQ(1):drop(p)}b</w:r></w:p>'),
        '<w:p>{d.x:ifEQ(1):hideBegin}<w:r>ab</w:r></w:p>{d.x:hideEnd}');
    });
    it('should use a show block for keep', function () {
      helper.assert(parser.expandDropKeepMarkers('<w:p>a{d.x:keep(p)}</w:p>'), '<w:p>{d.x:showBegin}a</w:p>{d.x:showEnd}');
    });
    it('should find the closest element: row, then table', function () {
      var _xml = '<w:tbl><w:tr><w:tc><w:p>a{d.x:drop(row)}</w:p></w:tc></w:tr></w:tbl>';
      helper.assert(parser.expandDropKeepMarkers(_xml), '<w:tbl><w:tr>{d.x:hideBegin}<w:tc><w:p>a</w:p></w:tc></w:tr>{d.x:hideEnd}</w:tbl>');
      helper.assert(parser.expandDropKeepMarkers('<w:tbl><w:tr><w:tc><w:p>a{d.x:drop(table)}</w:p></w:tc></w:tr></w:tbl>'),
        '<w:tbl>{d.x:hideBegin}<w:tr><w:tc><w:p>a</w:p></w:tc></w:tr></w:tbl>{d.x:hideEnd}');
    });
    it('should manage nested elements of the same type: the closest parent is used', function () {
      helper.assert(parser.expandDropKeepMarkers('<w:tbl><w:tr><w:tc><w:tbl><w:tr><w:tc>a{d.x:drop(row)}</w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl>'),
        '<w:tbl><w:tr><w:tc><w:tbl><w:tr>{d.x:hideBegin}<w:tc>a</w:tc></w:tr>{d.x:hideEnd}</w:tbl></w:tc></w:tr></w:tbl>');
    });
    it('should ignore elements which are already closed before the marker', function () {
      helper.assert(parser.expandDropKeepMarkers('<w:tr><w:tc>1</w:tc></w:tr><w:tr><w:tc>{d.x:drop(row)}</w:tc></w:tr>'),
        '<w:tr><w:tc>1</w:tc></w:tr><w:tr>{d.x:hideBegin}<w:tc></w:tc></w:tr>{d.x:hideEnd}');
    });
    it('should accept quotes, upper case, and self-closing tags', function () {
      helper.assert(parser.expandDropKeepMarkers('<w:p><w:br/>{d.x:drop(\'P\')}</w:p>'), '<w:p>{d.x:hideBegin}<w:br/></w:p>{d.x:hideEnd}');
      helper.assert(parser.expandDropKeepMarkers('<w:p>{d.x:drop("p")}</w:p>'), '<w:p>{d.x:hideBegin}</w:p>{d.x:hideEnd}');
    });
    it('should support the count of elements, and stop when there are not enough siblings', function () {
      var _xml = '<w:tr>{d.x:drop(row, 2)}a</w:tr>\n<w:tr>b</w:tr><w:tr>c</w:tr>';
      helper.assert(parser.expandDropKeepMarkers(_xml), '<w:tr>{d.x:hideBegin}a</w:tr>\n<w:tr>b</w:tr>{d.x:hideEnd}<w:tr>c</w:tr>');
      helper.assert(parser.expandDropKeepMarkers('<w:tr>{d.x:drop(row, 5)}a</w:tr><w:p>b</w:p>'), '<w:tr>{d.x:hideBegin}a</w:tr>{d.x:hideEnd}<w:p>b</w:p>');
    });
    it('should only use the data path for the end marker, even with arguments in formatters', function () {
      helper.assert(parser.expandDropKeepMarkers('<w:p>{d.list[i].id:ifIN(\'a:b\'):drop(p)}</w:p>'),
        '<w:p>{d.list[i].id:ifIN(\'a:b\'):hideBegin}</w:p>{d.list[i].id:hideEnd}');
    });
    it('should manage many markers, even in the same element', function () {
      helper.assert(parser.expandDropKeepMarkers('<w:p>{d.a:drop(p)}{d.b:drop(p)}</w:p><w:p>{d.c:keep(p)}</w:p>'),
        '<w:p>{d.b:hideBegin}{d.a:hideBegin}</w:p>{d.b:hideEnd}{d.a:hideEnd}<w:p>{d.c:showBegin}</w:p>{d.c:showEnd}');
    });
    it('should not modify a marker which is not inside an element, or with an unknown element', function () {
      helper.assert(parser.expandDropKeepMarkers('text {d.x:drop(row)} x'), 'text {d.x:drop(row)} x');
      helper.assert(parser.expandDropKeepMarkers('<w:p>{d.x:drop(banana)}</w:p>'), '<w:p>{d.x:drop(banana)}</w:p>');
      helper.assert(parser.expandDropKeepMarkers('<w:tr>a</w:tr>{d.x:drop(row)}'), '<w:tr>a</w:tr>{d.x:drop(row)}');
    });
  });

  describe('in templates', function () {
    var _data = {
      hide  : true,
      show  : false,
      items : [{ n : 'a', h : false }, { n : 'b', h : true }, { n : 'c', h : false }, { n : 'd', h : true }]
    };
    function render (xml, expected, done, data) {
      carbone.renderXML(xml, data || _data, { lang : 'en' }, function (err, result) {
        helper.assert(err+'', 'null');
        helper.assert(result, expected);
        done();
      });
    }
    it('should drop a paragraph if the condition is true, and keep it otherwise', function (done) {
      render('<w:body><w:p>1</w:p><w:p><w:r><w:t>2{d.hide:drop(p)}</w:t></w:r></w:p><w:p>3</w:p></w:body>', '<w:body><w:p>1</w:p><w:p>3</w:p></w:body>', function () {
        render('<w:body><w:p>1</w:p><w:p><w:r><w:t>2{d.show:drop(p)}</w:t></w:r></w:p><w:p>3</w:p></w:body>',
          '<w:body><w:p>1</w:p><w:p><w:r><w:t>2</w:t></w:r></w:p><w:p>3</w:p></w:body>', done);
      });
    });
    it('should drop a row, with a condition', function (done) {
      render('<w:tbl><w:tr><w:tc><w:p>x{d.hide:ifEQ(true):drop(row)}</w:p></w:tc></w:tr><w:tr><w:tc><w:p>y{d.hide:ifEQ(false):drop(row)}</w:p></w:tc></w:tr></w:tbl>',
        '<w:tbl><w:tr><w:tc><w:p>y</w:p></w:tc></w:tr></w:tbl>', done);
    });
    it('should drop a table', function (done) {
      render('<w:body><w:p>a</w:p><w:tbl><w:tr><w:tc><w:p>x{d.hide:drop(table)}</w:p></w:tc></w:tr></w:tbl><w:p>b</w:p></w:body>', '<w:body><w:p>a</w:p><w:p>b</w:p></w:body>', done);
    });
    it('should drop rows of a loop (docx)', function (done) {
      render('<w:tbl><w:tr><w:tc><w:p>H</w:p></w:tc></w:tr><w:tr><w:tc><w:p>{d.items[i].n}{d.items[i].h:ifEQ(true):drop(row)}</w:p></w:tc></w:tr><w:tr><w:tc><w:p>{d.items[i+1].n}</w:p></w:tc></w:tr></w:tbl>',
        '<w:tbl><w:tr><w:tc><w:p>H</w:p></w:tc></w:tr><w:tr><w:tc><w:p>a</w:p></w:tc></w:tr><w:tr><w:tc><w:p>c</w:p></w:tc></w:tr></w:tbl>', done);
    });
    it('should drop rows of a loop (ods)', function (done) {
      render('<table:table><table:table-row><table:table-cell><text:p>{d.items[i].n}{d.items[i].h:ifEQ(true):drop(row)}</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell><text:p>{d.items[i+1].n}</text:p></table:table-cell></table:table-row></table:table>',
        '<table:table><table:table-row><table:table-cell><text:p>a</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell><text:p>c</text:p></table:table-cell></table:table-row></table:table>', done);
    });
    it('should drop rows of a loop (xlsx)', function (done) {
      render('<sheetData><row><c><is><t>{d.items[i].n}{d.items[i].h:ifEQ(true):drop(row)}</t></is></c></row><row><c><is><t>{d.items[i+1].n}</t></is></c></row></sheetData>',
        '<sheetData><row><c><is><t>a</t></is></c></row><row><c><is><t>c</t></is></c></row></sheetData>', done);
    });
    it('should drop paragraphs (odt) and html rows', function (done) {
      render('<office:text><text:p>a</text:p><text:p>b{d.hide:drop(p)}</text:p><text:p>c</text:p></office:text>', '<office:text><text:p>a</text:p><text:p>c</text:p></office:text>', function () {
        render('<table><tr><td>a{d.hide:drop(row)}</td></tr><tr><td>b</td></tr></table>', '<table><tr><td>b</td></tr></table>', done);
      });
    });
    it('should keep elements only if the condition is true', function (done) {
      render('<w:body><w:p>{d.show:keep(p)}S</w:p><w:p>{d.hide:keep(p)}T</w:p></w:body>', '<w:body><w:p>T</w:p></w:body>', done);
    });
    it('should use the truthiness of the value if there is no condition', function (done) {
      render('<w:body><w:p>a{d.hide:drop(p)}</w:p><w:p>b{d.show:drop(p)}</w:p><w:p>c{d.show:keep(p)}</w:p><w:p>d{d.hide:keep(p)}</w:p></w:body>', '<w:body><w:p>b</w:p><w:p>d</w:p></w:body>', done);
    });
    it('should drop consecutive rows with a count', function (done) {
      render('<w:tbl><w:tr><w:tc><w:p>1{d.hide:drop(row, 2)}</w:p></w:tc></w:tr><w:tr><w:tc><w:p>2</w:p></w:tc></w:tr><w:tr><w:tc><w:p>3</w:p></w:tc></w:tr></w:tbl>',
        '<w:tbl><w:tr><w:tc><w:p>3</w:p></w:tc></w:tr></w:tbl>', done);
    });
    it('should accept many drop markers in the same element, whatever the result of each condition', function (done) {
      var _xml = '<w:body><w:p>x</w:p><w:p>{d.a:drop(p)}{d.b:drop(p)}y</w:p><w:p>z</w:p></w:body>';
      render(_xml, '<w:body><w:p>x</w:p><w:p>z</w:p></w:body>', function () {
        render(_xml, '<w:body><w:p>x</w:p><w:p>z</w:p></w:body>', function () {
          render(_xml, '<w:body><w:p>x</w:p><w:p>z</w:p></w:body>', function () {
            render(_xml, '<w:body><w:p>x</w:p><w:p>y</w:p><w:p>z</w:p></w:body>', done, { a : false, b : false });
          }, { a : true, b : false });
        }, { a : false, b : true });
      }, { a : true, b : true });
    });
    it('should return a clear error if the marker is not inside the wanted element', function (done) {
      carbone.renderXML('<w:p>a{d.hide:drop(banana)}</w:p>', _data, { lang : 'en' }, function (err) {
        helper.assert(/must be inside a "row", "p" or "table"/.test(err.message), true);
        carbone.renderXML('text {d.hide:drop(row)}', _data, { lang : 'en' }, function (err) {
          helper.assert(/drop\(row\)/.test(err.message), true);
          done();
        });
      });
    });
    it('should work with other markers inside the dropped element, and with conditions of the data', function (done) {
      render('<w:body><w:p>{d.items[0].n}{d.items[0].h:ifEQ(false):drop(p)}</w:p><w:p>{d.items[1].n}{d.items[1].h:ifEQ(false):drop(p)}</w:p></w:body>', '<w:body><w:p>b</w:p></w:body>', done);
    });
  });
});
