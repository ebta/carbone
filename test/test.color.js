var assert = require('assert');
var carbone = require('../lib');
var file = require('../lib/file');
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

  describe('expandOdfColorMarkers', function () {
    var T = function (kind, marker) {
      return '{' + (marker || 'd.c') + ':_odfColor(\'' + kind + '\')}';
    };
    it('should do nothing without color marker', function () {
      helper.assert(color.expandOdfColorMarkers('<text:p>{d.id}</text:p>'), '<text:p>{d.id}</text:p>');
      helper.assert(color.expandOdfColorMarkers(null), null);
    });
    it('should add an identifier in the style of the paragraph, or create the attribute', function () {
      helper.assert(color.expandOdfColorMarkers('<text:p text:style-name="P1">a{d.c:color(p, text)}</text:p>'), '<text:p text:style-name="P1' + T('text') + '">a</text:p>');
      helper.assert(color.expandOdfColorMarkers('<text:p>a{d.c:color(p, background)}</text:p>'), '<text:p text:style-name="' + T('background') + '">a</text:p>');
      helper.assert(color.expandOdfColorMarkers('<text:h text:outline-level="1">a{d.c:color(p, text)}</text:h>'), '<text:h text:style-name="' + T('text') + '" text:outline-level="1">a</text:h>');
    });
    it('should add identifiers of many markers in the same element', function () {
      helper.assert(color.expandOdfColorMarkers('<text:p text:style-name="P1">a{d.t:color(p, text)}{d.b:color(p, background)}</text:p>'),
        '<text:p text:style-name="P1' + T('text', 'd.t') + T('background', 'd.b') + '">a</text:p>');
    });
    it('should set the background of a cell', function () {
      helper.assert(color.expandOdfColorMarkers('<table:table-cell table:style-name="A1"><text:p>a{d.c:color(cell, background)}</text:p></table:table-cell>'),
        '<table:table-cell table:style-name="A1' + T('background') + '"><text:p>a</text:p></table:table-cell>');
    });
    it('should set the text color of all paragraphs of a cell', function () {
      var _xml = color.expandOdfColorMarkers('<table:table-cell><text:p text:style-name="P1">a{d.c:color(cell, text)}</text:p><text:p/></table:table-cell>');
      helper.assert(_xml, '<table:table-cell><text:p text:style-name="P1' + T('text') + '">a</text:p><text:p text:style-name="' + T('text') + '"/></table:table-cell>');
    });
    it('should set the background of all cells of a row, but not cells of nested tables', function () {
      var _xml = color.expandOdfColorMarkers('<table:table-row><table:table-cell table:style-name="A"><text:p>a{d.c:color(row, background)}</text:p></table:table-cell><table:table-cell><table:table><table:table-row><table:table-cell table:style-name="N"/></table:table-row></table:table></table:table-cell></table:table-row>');
      helper.assert(_xml, '<table:table-row><table:table-cell table:style-name="A' + T('background') + '"><text:p>a</text:p></table:table-cell><table:table-cell table:style-name="' + T('background')
        + '"><table:table><table:table-row><table:table-cell table:style-name="N"/></table:table-row></table:table></table:table-cell></table:table-row>');
    });
    it('should not modify a marker with an unknown scope or type, or outside of the element', function () {
      var _xml = '<text:p>a{d.c:color(banana, text)}</text:p><text:p>{d.c:color(p, border)}</text:p>text {d.c:color(row, text)}';
      helper.assert(color.expandOdfColorMarkers(_xml), _xml);
    });
    it('should not modify a docx marker', function () {
      var _xml = '<w:p><w:r><w:t>a{d.c:color(p, text)}</w:t></w:r></w:p>';
      helper.assert(color.expandOdfColorMarkers(_xml), _xml);
    });
  });

  describe('in an odt', function () {
    var NS = 'xmlns:office="o" xmlns:text="t" xmlns:table="b" xmlns:style="s" xmlns:fo="f"';
    var AUTO = '<office:automatic-styles>'
      + '<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="16pt"/></style:style>'
      + '<style:style style:name="C1" style:family="table-cell"><style:table-cell-properties fo:padding="0.2cm" fo:border="1pt solid #000000" fo:background-color="#EEEEEE"/></style:style>'
      + '</office:automatic-styles>';
    function render (body, data, callback, automaticStyles) {
      var _template = {
        isZipped   : true,
        filename   : 'test.odt',
        embeddings : [],
        files      : [
          { name : 'mimetype', isMarked : false, parent : '', data : Buffer.from('application/vnd.oasis.opendocument.text') },
          { name : 'content.xml', isMarked : true, parent : '', data : '<office:document-content ' + NS + '>' + (automaticStyles === undefined ? AUTO : automaticStyles) + '<office:body><office:text>' + body + '</office:text></office:body></office:document-content>' }
        ]
      };
      carbone.render(_template, data, {}, function (err, result) {
        if (err) {
          return callback(err);
        }
        file.unzip(result, function (errUnzip, files) {
          callback(errUnzip, files.filter(function (f) { return f.name === 'content.xml'; })[0].data.toString());
        });
      });
    }
    function styleOf (xml, tagStart) {
      var _name = new RegExp('<' + tagStart + '[^>]*?style-name="([^"]*)"').exec(xml);
      return _name === null ? null : _name[1];
    }
    function styleXml (xml, name) {
      return new RegExp('<style:style style:name="' + name + '"[\\s\\S]*?</style:style>').exec(xml)[0];
    }
    it('should create a style which keeps the properties of the original style, and add the text color', function (done) {
      render('<text:p text:style-name="P1">a{d.c:color(p, text)}</text:p>', { c : '#C00000' }, function (err, xml) {
        helper.assert(err, null);
        var _name = styleOf(xml, 'text:p');
        assert.ok(/^CarboneC\w{10}$/.test(_name));
        var _style = styleXml(xml, _name);
        assert.ok(_style.indexOf('style:parent-style-name="Standard"') !== -1);
        assert.ok(_style.indexOf('fo:text-align="center"') !== -1);
        assert.ok(/<style:text-properties fo:font-size="16pt" fo:color="#C00000"\/>/.test(_style));
        assert.ok(xml.indexOf('CARBONE_ODC') === -1);
        // the original style is kept
        assert.ok(xml.indexOf('style:name="P1"') !== -1);
        done();
      });
    });
    it('should set the background of a cell, and keep its border and padding', function (done) {
      render('<table:table-cell table:style-name="C1"><text:p>a{d.c:color(cell, background)}</text:p></table:table-cell>', { c : 'rgb(255, 200, 0)' }, function (err, xml) {
        helper.assert(err, null);
        var _style = styleXml(xml, styleOf(xml, 'table:table-cell'));
        assert.ok(_style.indexOf('fo:padding="0.2cm"') !== -1 && _style.indexOf('fo:border="1pt solid #000000"') !== -1);
        assert.ok(_style.indexOf('fo:background-color="#FFC800"') !== -1);
        assert.ok(_style.indexOf('#EEEEEE') === -1, 'the previous background is replaced');
        helper.assert(_style.match(/fo:background-color/g).length, 1);
        done();
      });
    });
    it('should create a child of a common style if the style is not defined in the file, and a new style if there is no style', function (done) {
      render('<text:p text:style-name="Standard">a{d.c:color(p, background)}</text:p><text:p>b{d.c:color(p, text)}</text:p>', { c : 'red' }, function (err, xml) {
        helper.assert(err, null);
        var _styles = xml.match(/<style:style style:name="CarboneC\w+"[^>]*>/g);
        helper.assert(_styles.length, 2);
        assert.ok(_styles[0].indexOf('style:parent-style-name="Standard"') !== -1);
        assert.ok(_styles[1].indexOf('parent-style-name') === -1);
        done();
      });
    });
    it('should merge text and background in a single style', function (done) {
      render('<text:p text:style-name="P1">a{d.t:color(p, text)}{d.b:color(p, background)}</text:p>', { t : '#FF0000', b : '#00FF00' }, function (err, xml) {
        helper.assert(err, null);
        var _style = styleXml(xml, styleOf(xml, 'text:p'));
        assert.ok(_style.indexOf('fo:color="#FF0000"') !== -1 && _style.indexOf('fo:background-color="#00FF00"') !== -1);
        helper.assert(xml.match(/<style:style style:name="CarboneC/g).length, 1);
        done();
      });
    });
    it('should ignore invalid colors, and keep the original style or remove the attribute', function (done) {
      render('<text:p text:style-name="P1">a{d.bad:color(p, text)}</text:p><text:p>b{d.nope:color(p, background)}</text:p>', { bad : 'not a color' }, function (err, xml) {
        helper.assert(err, null);
        helper.assert(xml.indexOf('CarboneC'), -1);
        assert.ok(xml.indexOf('<text:p text:style-name="P1">a</text:p><text:p>b</text:p>') !== -1);
        done();
      });
    });
    it('should create one style for the same color, and different styles for different colors, in a loop', function (done) {
      var _body = '<table:table><table:table-row><table:table-cell table:style-name="C1"><text:p>{d.items[i].n}{d.items[i].c:color(row, background)}</text:p></table:table-cell></table:table-row>'
        + '<table:table-row><table:table-cell table:style-name="C1"><text:p>{d.items[i+1].n}</text:p></table:table-cell></table:table-row></table:table>';
      render(_body, { items : [{ n : 'a', c : '#FF0000' }, { n : 'b', c : '#00FF00' }, { n : 'c', c : '#FF0000' }, { n : 'd', c : 'invalid' }] }, function (err, xml) {
        helper.assert(err, null);
        var _names = xml.match(/<table:table-cell table:style-name="([^"]*)"/g).map(function (m) { return /"([^"]*)"/.exec(m)[1]; });
        helper.assert(_names.length, 4);
        helper.assert(_names[0], _names[2]);
        assert.notStrictEqual(_names[0], _names[1]);
        helper.assert(_names[3], 'C1');
        helper.assert(xml.match(/<style:style style:name="CarboneC/g).length, 2);
        done();
      });
    });
    it('should color all paragraphs of a cell', function (done) {
      render('<table:table-cell table:style-name="C1"><text:p>a{d.c:color(cell, text)}</text:p><text:p text:style-name="P1">b</text:p></table:table-cell>', { c : '#0000FF' }, function (err, xml) {
        helper.assert(err, null);
        var _names = xml.match(/<text:p text:style-name="(CarboneC\w+)"/g);
        helper.assert(_names.length, 2);
        assert.ok(styleXml(xml, /"(CarboneC\w+)"/.exec(_names[1])[1]).indexOf('fo:font-size="16pt"') !== -1, 'the style of the second paragraph is kept');
        done();
      });
    });
    it('should not allow XML injection through the color', function (done) {
      render('<text:p>a{d.c:color(p, text)}</text:p>', { c : '#FF0000"/><style:evil x="' }, function (err, xml) {
        helper.assert(err, null);
        assert.ok(xml.indexOf('evil') === -1);
        done();
      });
    });
    it('should return a clear error if the marker is not inside a paragraph, a cell or a row', function (done) {
      render('text {d.c:color(row, text)}', { c : 'red' }, function (err) {
        assert.ok(/only available for docx and odt templates/.test(err.message));
        done();
      });
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
      carbone.renderXML('<text:span>a{d.c:color(p, text)}</text:span>', _data, { lang : 'en' }, function (err) {
        helper.assert(/only available for docx and odt templates/.test(err.message), true);
        carbone.renderXML('<w:p>a{d.c:color(banana, text)}</w:p>', _data, { lang : 'en' }, function (err) {
          helper.assert(/color\(banana, text\)/.test(err.message), true);
          done();
        });
      });
    });
  });
});
