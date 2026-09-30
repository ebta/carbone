var carbone = require('../lib');
var color = require('../lib/color');
var colorFormatter = require('../formatters/color');
var helper = require('../lib/helper');

describe('color', function () {

  describe('normalizeColor', function () {
    it('should accept hexadecimal colors, with or without "#", and short version', function () {
      helper.assert(colorFormatter.normalizeColor('#ff0000'), 'FF0000');
      helper.assert(colorFormatter.normalizeColor('00aaBB'), '00AABB');
      helper.assert(colorFormatter.normalizeColor('#f80'), 'FF8800');
      helper.assert(colorFormatter.normalizeColor('  #FFFFFF '), 'FFFFFF');
    });
    it('should accept rgb() and rgba()', function () {
      helper.assert(colorFormatter.normalizeColor('rgb(255, 200, 0)'), 'FFC800');
      helper.assert(colorFormatter.normalizeColor('rgba(0,0,5,0.5)'), '000005');
      helper.assert(colorFormatter.normalizeColor('rgb(999,0,0)'), 'FF0000');
    });
    it('should accept basic color names', function () {
      helper.assert(colorFormatter.normalizeColor('Red'), 'FF0000');
      helper.assert(colorFormatter.normalizeColor('grey'), '808080');
    });
    it('should return null for invalid colors', function () {
      helper.assert(colorFormatter.normalizeColor('notacolor'), null);
      helper.assert(colorFormatter.normalizeColor('#12345'), null);
      helper.assert(colorFormatter.normalizeColor('#GGGGGG'), null);
      helper.assert(colorFormatter.normalizeColor(''), null);
      helper.assert(colorFormatter.normalizeColor(null), null);
      helper.assert(colorFormatter.normalizeColor(undefined), null);
      helper.assert(colorFormatter.normalizeColor(123456), null);
      helper.assert(colorFormatter.normalizeColor('FF0000"/><w:evil'), null);
    });
  });

  describe('_color', function () {
    it('should return the color, or "auto" if it is invalid', function () {
      helper.assert(colorFormatter._color('#ff0000'), 'FF0000');
      helper.assert(colorFormatter._color('nope'), 'auto');
      helper.assert(colorFormatter._color(undefined), 'auto');
      helper.assert(colorFormatter._color('"><w:evil/>'), 'auto');
    });
  });

  describe('expandColorMarkers', function () {
    var M = '{d.c:_color}';
    it('should do nothing without color marker', function () {
      helper.assert(color.expandColorMarkers('<w:p>{d.id}</w:p>'), '<w:p>{d.id}</w:p>');
      helper.assert(color.expandColorMarkers(null), null);
      helper.assert(color.expandColorMarkers(undefined), undefined);
    });
    it('should color the text of all runs of a paragraph, in the right order of the run properties', function () {
      var _xml = '<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>a{d.c:color(p, text)}</w:t></w:r><w:r><w:t>b</w:t></w:r></w:p>';
      helper.assert(color.expandColorMarkers(_xml),
        '<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="' + M + '"/><w:sz w:val="20"/></w:rPr><w:t>a</w:t></w:r>'
        + '<w:r><w:rPr><w:color w:val="' + M + '"/></w:rPr><w:t>b</w:t></w:r></w:p>');
    });
    it('should replace an existing color, and manage empty rPr, run attributes and self-closing runs', function () {
      helper.assert(color.expandColorMarkers('<w:p><w:r><w:rPr><w:color w:val="00FF00"/></w:rPr><w:t>a{d.c:color(p, text)}</w:t></w:r></w:p>'),
        '<w:p><w:r><w:rPr><w:color w:val="' + M + '"/></w:rPr><w:t>a</w:t></w:r></w:p>');
      helper.assert(color.expandColorMarkers('<w:p><w:r w:rsidR="00A1"><w:rPr/><w:t>a{d.c:color(p, text)}</w:t></w:r><w:r/></w:p>'),
        '<w:p><w:r w:rsidR="00A1"><w:rPr><w:color w:val="' + M + '"/></w:rPr><w:t>a</w:t></w:r><w:r/></w:p>');
    });
    it('should color the text of all runs of a cell and of a row', function () {
      var _cell = color.expandColorMarkers('<w:tc><w:p><w:r><w:t>a{d.c:color(cell, text)}</w:t></w:r></w:p><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc>');
      helper.assert((_cell.match(/<w:color /g) || []).length, 2);
      var _row = color.expandColorMarkers('<w:tr><w:tc><w:p><w:r><w:t>a{d.c:color(row, text)}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc></w:tr>');
      helper.assert((_row.match(/<w:color /g) || []).length, 2);
    });
    it('should color the text of nested runs (text boxes)', function () {
      var _xml = color.expandColorMarkers('<w:p><w:r><w:drawing><w:txbxContent><w:p><w:r><w:t>in</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r><w:r><w:t>a{d.c:color(p, text)}</w:t></w:r></w:p>');
      helper.assert((_xml.match(/<w:color /g) || []).length, 3);
      helper.assert(_xml.indexOf('<w:r><w:rPr><w:color w:val="' + M + '"/></w:rPr><w:drawing>') !== -1, true);
    });
    it('should set the background of a paragraph, after pStyle and before jc', function () {
      helper.assert(color.expandColorMarkers('<w:p><w:pPr><w:pStyle w:val="x"/><w:jc w:val="left"/></w:pPr><w:r><w:t>a{d.c:color(p, background)}</w:t></w:r></w:p>'),
        '<w:p><w:pPr><w:pStyle w:val="x"/><w:shd w:val="clear" w:color="auto" w:fill="' + M + '"/><w:jc w:val="left"/></w:pPr><w:r><w:t>a</w:t></w:r></w:p>');
      helper.assert(color.expandColorMarkers('<w:p><w:r><w:t>a{d.c:color(p, background)}</w:t></w:r></w:p>'),
        '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="' + M + '"/></w:pPr><w:r><w:t>a</w:t></w:r></w:p>');
      helper.assert(color.expandColorMarkers('<w:p><w:pPr/><w:r><w:t>a{d.c:color(p, background)}</w:t></w:r></w:p>'),
        '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="' + M + '"/></w:pPr><w:r><w:t>a</w:t></w:r></w:p>');
    });
    it('should set the background of a cell, before vAlign', function () {
      helper.assert(color.expandColorMarkers('<w:tc><w:tcPr><w:tcW w:w="1"/><w:vAlign w:val="top"/></w:tcPr><w:p>a{d.c:color(cell, background)}</w:p></w:tc>'),
        '<w:tc><w:tcPr><w:tcW w:w="1"/><w:shd w:val="clear" w:color="auto" w:fill="' + M + '"/><w:vAlign w:val="top"/></w:tcPr><w:p>a</w:p></w:tc>');
    });
    it('should set the background of all cells of a row, but not cells of nested tables', function () {
      helper.assert(color.expandColorMarkers('<w:tr><w:trPr/><w:tc><w:tcPr><w:tcW w:w="1"/></w:tcPr><w:p>a{d.c:color(row, background)}</w:p></w:tc><w:tc><w:p>b</w:p></w:tc></w:tr>'),
        '<w:tr><w:trPr/><w:tc><w:tcPr><w:tcW w:w="1"/><w:shd w:val="clear" w:color="auto" w:fill="' + M + '"/></w:tcPr><w:p>a</w:p></w:tc>'
        + '<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="' + M + '"/></w:tcPr><w:p>b</w:p></w:tc></w:tr>');
      var _nested = color.expandColorMarkers('<w:tr><w:tc><w:tbl><w:tr><w:tc><w:p>x</w:p></w:tc></w:tr></w:tbl><w:p>a{d.c:color(row, background)}</w:p></w:tc></w:tr>');
      helper.assert((_nested.match(/<w:shd /g) || []).length, 1);
    });
    it('should keep previous formatters in the generated marker', function () {
      helper.assert(color.expandColorMarkers('<w:p><w:r><w:t>a{d.s:ifEQ(1):show(\'red\'):elseShow(\'blue\'):color(p, text)}</w:t></w:r></w:p>'),
        '<w:p><w:r><w:rPr><w:color w:val="{d.s:ifEQ(1):show(\'red\'):elseShow(\'blue\'):_color}"/></w:rPr><w:t>a</w:t></w:r></w:p>');
    });
    it('should manage many color markers in the same element', function () {
      var _xml = color.expandColorMarkers('<w:tr><w:tc><w:p><w:r><w:t>a{d.a:color(row, background)}{d.b:color(cell, text)}{d.c:color(p, background)}</w:t></w:r></w:p></w:tc></w:tr>');
      helper.assert(_xml.indexOf(':color(') === -1, true);
      helper.assert((_xml.match(/<w:shd /g) || []).length, 2);
      helper.assert(_xml.indexOf('{d.b:_color}') !== -1 && _xml.indexOf('{d.a:_color}') !== -1 && _xml.indexOf('{d.c:_color}') !== -1, true);
    });
    it('should not modify a marker with an unknown scope or type, or outside of the element', function () {
      var _xml = '<w:p>a{d.c:color(banana, text)}</w:p><w:p>{d.c:color(p, border)}</w:p>text {d.c:color(row, text)}';
      helper.assert(color.expandColorMarkers(_xml), _xml);
    });
  });

  describe('in templates', function () {
    var _data = { c : '#FF0000', bg : 'yellow', bad : 'nope', rgb : 'rgb(1,2,3)', items : [{ n : 'a', c : '#00FF00' }, { n : 'b', c : 'blue' }] };
    function render (xml, expected, done) {
      carbone.renderXML(xml, _data, { lang : 'en' }, function (err, result) {
        helper.assert(err+'', 'null');
        helper.assert(result, expected);
        done();
      });
    }
    it('should print colors in attributes', function (done) {
      render('<w:p><w:r><w:t>a{d.c:color(p, text)}</w:t></w:r></w:p>', '<w:p><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>a</w:t></w:r></w:p>', function () {
        render('<w:p><w:r><w:t>a{d.bg:color(p, background)}</w:t></w:r></w:p>', '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/></w:pPr><w:r><w:t>a</w:t></w:r></w:p>', done);
      });
    });
    it('should accept rgb() colors coming from the data', function (done) {
      render('<w:p><w:r><w:t>a{d.rgb:color(p, text)}</w:t></w:r></w:p>', '<w:p><w:r><w:rPr><w:color w:val="010203"/></w:rPr><w:t>a</w:t></w:r></w:p>', done);
    });
    it('should use "auto" if the color is invalid or missing', function (done) {
      render('<w:p><w:r><w:t>a{d.bad:color(p, text)}</w:t></w:r></w:p>', '<w:p><w:r><w:rPr><w:color w:val="auto"/></w:rPr><w:t>a</w:t></w:r></w:p>', function () {
        render('<w:p><w:r><w:t>a{d.nope:color(p, text)}</w:t></w:r></w:p>', '<w:p><w:r><w:rPr><w:color w:val="auto"/></w:rPr><w:t>a</w:t></w:r></w:p>', done);
      });
    });
    it('should compute the color with other formatters', function (done) {
      render('<w:p><w:r><w:t>a{d.c:ifEQ(\'#FF0000\'):show(\'green\'):elseShow(\'blue\'):color(p, text)}</w:t></w:r></w:p>',
        '<w:p><w:r><w:rPr><w:color w:val="008000"/></w:rPr><w:t>a</w:t></w:r></w:p>', done);
    });
    it('should normalize colors printed by show/elseShow, and use "auto" for an invalid one', function (done) {
      render('<w:p><w:r><w:t>a{d.c:ifEQ(\'#00FF00\'):show(\'green\'):elseShow(\'blue\'):color(p, text)}</w:t></w:r></w:p>',
        '<w:p><w:r><w:rPr><w:color w:val="0000FF"/></w:rPr><w:t>a</w:t></w:r></w:p>', function () {
          render('<w:p><w:r><w:t>a{d.c:ifEQ(\'#FF0000\'):show(\'not a color\'):color(p, text)}</w:t></w:r></w:p>',
            '<w:p><w:r><w:rPr><w:color w:val="auto"/></w:rPr><w:t>a</w:t></w:r></w:p>', done);
        });
    });
    it('should color rows of a loop', function (done) {
      render('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>{d.items[i].n}{d.items[i].c:color(row, background)}</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>{d.items[i+1].n}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
        '<w:tbl><w:tr><w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="00FF00"/></w:tcPr><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc></w:tr>'
        + '<w:tr><w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="0000FF"/></w:tcPr><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc></w:tr></w:tbl>', done);
    });
    it('should not allow XML injection through the color', function (done) {
      carbone.renderXML('<w:p><w:r><w:t>a{d.evil:color(p, text)}</w:t></w:r></w:p>', { evil : 'FF0000"/><w:evil w:x="' }, { lang : 'en' }, function (err, result) {
        helper.assert(err+'', 'null');
        helper.assert(result, '<w:p><w:r><w:rPr><w:color w:val="auto"/></w:rPr><w:t>a</w:t></w:r></w:p>');
        done();
      });
    });
    it('should return a clear error if the marker is not inside a paragraph, a cell or a row of a docx', function (done) {
      carbone.renderXML('<text:p>a{d.c:color(p, text)}</text:p>', _data, { lang : 'en' }, function (err) {
        helper.assert(/only available for docx templates/.test(err.message), true);
        carbone.renderXML('<w:p>a{d.c:color(banana, text)}</w:p>', _data, { lang : 'en' }, function (err) {
          helper.assert(/color\(banana, text\)/.test(err.message), true);
          done();
        });
      });
    });
  });
});
