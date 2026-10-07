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
    it('should use the style of the cell for the text color in a spreadsheet, and the paragraphs in a text document', function () {
      var _cell = '<table:table-cell table:style-name="ce1"><text:p>a{d.c:color(cell, text)}</text:p></table:table-cell>';
      helper.assert(color.expandOdfColorMarkers('<office:spreadsheet><table:table-row>' + _cell + '</table:table-row></office:spreadsheet>'),
        '<office:spreadsheet><table:table-row><table:table-cell table:style-name="ce1' + T('text') + '"><text:p>a</text:p></table:table-cell></table:table-row></office:spreadsheet>');
      helper.assert(color.expandOdfColorMarkers('<office:spreadsheet><table:table-row><table:table-cell><text:p>a{d.c:color(row, text)}</text:p></table:table-cell><table:table-cell/></table:table-row></office:spreadsheet>'),
        '<office:spreadsheet><table:table-row><table:table-cell table:style-name="' + T('text') + '"><text:p>a</text:p></table:table-cell><table:table-cell table:style-name="' + T('text') + '"/></table:table-row></office:spreadsheet>');
      helper.assert(color.expandOdfColorMarkers('<office:text>' + _cell + '</office:text>'),
        '<office:text><table:table-cell table:style-name="ce1"><text:p text:style-name="' + T('text') + '">a</text:p></table:table-cell></office:text>');
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
        assert.ok(/only available for docx, odt, ods, xlsx and pptx templates/.test(err.message));
        done();
      });
    });
  });

  describe('expandXlsxColorMarkers', function () {
    var T = function (kind, marker) {
      return '{' + (marker || 'd.c') + ':_xlsxColor(\'' + kind + '\')}';
    };
    function expand (xml, parent) {
      var _template = { files : [{ name : 'xl/worksheets/sheet1.xml', data : xml, parent : parent || '' }, { name : 'xl/styles.xml', data : 'a{d.c:color(cell, text)}', parent : '' }] };
      color.expandXlsxColorMarkers(_template, parent || '');
      return _template;
    }
    it('should add an identifier in the style of the cell, or create the attribute', function () {
      helper.assert(expand('<row><c s="3" t="inlineStr"><is><t>a{d.c:color(cell, background)}</t></is></c></row>').files[0].data,
        '<row><c s="3' + T('background') + '" t="inlineStr"><is><t>a</t></is></c></row>');
      helper.assert(expand('<row><c t="inlineStr"><is><t>a{d.c:color(cell, text)}</t></is></c></row>').files[0].data,
        '<row><c s="' + T('text') + '" t="inlineStr"><is><t>a</t></is></c></row>');
    });
    it('should add identifiers of many markers in the same cell', function () {
      helper.assert(expand('<c s="1"><is><t>a{d.t:color(cell, text)}{d.b:color(cell, background)}</t></is></c>').files[0].data,
        '<c s="1' + T('text', 'd.t') + T('background', 'd.b') + '"><is><t>a</t></is></c>');
    });
    it('should add identifiers in all cells of a row, and not in other rows', function () {
      var _xml = '<sheetData><row r="1"><c s="1"><is><t>x</t></is></c></row><row><c s="2"><is><t>a{d.c:color(row, background)}</t></is></c><c/><c s="4"/></row></sheetData>';
      helper.assert(expand(_xml).files[0].data, '<sheetData><row r="1"><c s="1"><is><t>x</t></is></c></row><row><c s="2' + T('background') + '"><is><t>a</t></is></c><c s="' + T('background') + '"/><c s="4' + T('background') + '"/></row></sheetData>');
    });
    it('should not modify the markers which are not supported, or in other files', function () {
      var _xml = '<row><c><is><t>a{d.c:color(p, text)}</t></is></c><c><is><t>b{d.c:color(cell, border)}</t></is></c><c><is><t>c{d.c:color(banana, text)}</t></is></c></row>';
      helper.assert(expand(_xml).files[0].data, _xml);
      helper.assert(expand('<c><is><t>a{d.c:color(cell, text)}</t></is></c>', 'embedded.xlsx').files[0].data.indexOf('_xlsxColor') !== -1, true);
      helper.assert(expand('<c><is><t>a{d.c:color(cell, text)}</t></is></c>').files[1].data, 'a{d.c:color(cell, text)}');
      color.expandXlsxColorMarkers(null, '');
      color.expandXlsxColorMarkers({}, '');
    });
    it('should not confuse the cells with other tags starting with c', function () {
      var _xml = '<cols><col min="1" max="1"/></cols><row><c><is><t>a{d.c:color(row, text)}</t></is></c></row><cfRule/>';
      helper.assert(expand(_xml).files[0].data, '<cols><col min="1" max="1"/></cols><row><c s="' + T('text') + '"><is><t>a</t></is></c></row><cfRule/>');
    });
  });

  describe('resolveXlsxColors', function () {
    var STYLES = '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><color theme="1"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Arial"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border/></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="right"/></xf></cellXfs>'
      + '</styleSheet>';
    function resolve (sheet, colors, styles) {
      var _report = { files : [{ name : 'xl/worksheets/sheet1.xml', data : sheet, parent : '' }, { name : 'xl/styles.xml', data : styles === undefined ? STYLES : styles, parent : '' }] };
      color.resolveXlsxColors(_report, { xlsxColors : colors });
      return { sheet : _report.files[0].data, styles : _report.files[1].data };
    }
    it('should create a font, a fill and a cell format, which keep the properties of the original format', function () {
      var _res = resolve('<c s="1CARBONE_XC_0CARBONE_XC_1"/>', [{ kind : 'text', color : 'FF0000' }, { kind : 'background', color : '00FF00' }]);
      helper.assert(_res.sheet, '<c s="2"/>');
      assert.ok(_res.styles.indexOf('<fonts count="3">') !== -1 && _res.styles.indexOf('<fills count="3">') !== -1 && _res.styles.indexOf('<cellXfs count="3">') !== -1);
      assert.ok(_res.styles.indexOf('<font><b/><sz val="12"/><color rgb="FFFF0000"/><name val="Arial"/></font>') !== -1, 'the font is a copy, with the color at the right place');
      assert.ok(_res.styles.indexOf('<fill><patternFill patternType="solid"><fgColor rgb="FF00FF00"/><bgColor indexed="64"/></patternFill></fill>') !== -1);
      assert.ok(/<xf numFmtId="4" fontId="2" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"><alignment horizontal="right"\/><\/xf><\/cellXfs>/.test(_res.styles));
      assert.ok(_res.styles.indexOf('<borders count="1"><border/></borders>') !== -1, 'other lists are not modified');
    });
    it('should replace the color of the font, and use the default format if the cell has no style', function () {
      var _res = resolve('<c s="CARBONE_XC_0"/>', [{ kind : 'text', color : '0000FF' }]);
      helper.assert(_res.sheet, '<c s="2"/>');
      assert.ok(_res.styles.indexOf('<font><sz val="11"/><color rgb="FF0000FF"/><name val="Calibri"/></font>') !== -1, 'the color of the theme is replaced');
      assert.ok(_res.styles.indexOf('<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>') !== -1);
    });
    it('should create one format for identical styles and colors', function () {
      var _res = resolve('<c s="CARBONE_XC_0"/><c s="CARBONE_XC_1"/><c s="CARBONE_XC_2"/>', [{ kind : 'background', color : 'FF0000' }, { kind : 'background', color : 'FF0000' }, { kind : 'background', color : '00FF00' }]);
      helper.assert(_res.sheet, '<c s="2"/><c s="2"/><c s="3"/>');
      assert.ok(_res.styles.indexOf('<cellXfs count="4">') !== -1 && _res.styles.indexOf('<fills count="4">') !== -1);
    });
    it('should keep the original style for invalid colors, and remove the attribute if there is no style', function () {
      var _res = resolve('<c s="1CARBONE_XC_0"/><c s="CARBONE_XC_1"/>', [{ kind : 'text', color : null }, { kind : 'background', color : null }]);
      helper.assert(_res.sheet, '<c s="1"/><c/>');
      helper.assert(_res.styles, STYLES);
    });
    it('should not fail without styles, or with other attributes in cells, and should not modify cells without identifier', function () {
      helper.assert(resolve('<c s="1CARBONE_XC_0"/>', [{ kind : 'text', color : 'FF0000' }], '<styleSheet/>').sheet, '<c s="1"/>');
      helper.assert(resolve('<c r="A1" t="inlineStr" s="1CARBONE_XC_0"><is/></c><c s="3" t="n"/>', [{ kind : 'text', color : 'FF0000' }]).sheet, '<c r="A1" t="inlineStr" s="2"><is/></c><c s="3" t="n"/>');
      color.resolveXlsxColors(null, {});
      color.resolveXlsxColors({ files : [] }, {});
    });
    it('should accept a self-closing font, and a style index out of range', function () {
      var _styles = STYLES.replace('<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>', '<font/>');
      var _res = resolve('<c s="CARBONE_XC_0"/><c s="99CARBONE_XC_0"/>', [{ kind : 'text', color : 'FF0000' }], _styles);
      assert.ok(_res.styles.indexOf('<font><color rgb="FFFF0000"/></font>') !== -1);
      helper.assert(_res.sheet, '<c s="2"/><c s="2"/>', 'same default format, so the same new format');
    });
  });

  describe('in a xlsx', function () {
    var STYLES = '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0"><alignment horizontal="right"/></xf></cellXfs></styleSheet>';
    function render (sheet, strings, data, callback) {
      var _template = {
        isZipped   : true,
        filename   : 'test.xlsx',
        embeddings : [],
        files      : [
          { name : '[Content_Types].xml', isMarked : true, parent : '', data : '<Types/>' },
          { name : 'xl/worksheets/sheet1.xml', isMarked : true, parent : '', data : '<worksheet><sheetData>' + sheet + '</sheetData></worksheet>' },
          { name : 'xl/sharedStrings.xml', isMarked : true, parent : '', data : '<sst>' + strings + '</sst>' },
          { name : 'xl/styles.xml', isMarked : true, parent : '', data : STYLES }
        ]
      };
      carbone.render(_template, data, {}, function (err, result) {
        if (err) {
          return callback(err);
        }
        file.unzip(result, function (errUnzip, files) {
          var _res = {};
          files.forEach(function (f) {
            _res[f.name] = f.data.toString();
          });
          callback(errUnzip, _res);
        });
      });
    }
    it('should color cells with markers written in shared strings, and in a loop', function (done) {
      var _sheet = '<row r="1"><c r="A1" s="1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>';
      var _strings = '<si><t>{d.items[i].n}{d.items[i].bg:color(row, background)}</t></si><si><t>{d.items[i].s}{d.items[i].tc:color(cell, text)}</t></si><si><t>{d.items[i+1].n}</t></si><si><t>{d.items[i+1].s}</t></si>';
      var _data = { items : [{ n : 'a', s : 'x', bg : '#FF0000', tc : '#0000FF' }, { n : 'b', s : 'y', bg : 'invalid', tc : '#0000FF' }, { n : 'c', s : 'z', bg : '#FF0000', tc : 'invalid' }] };
      render(_sheet, _strings, _data, function (err, files) {
        helper.assert(err, null);
        var _xml = files['xl/worksheets/sheet1.xml'];
        assert.ok(_xml.indexOf('CARBONE_XC') === -1 && _xml.indexOf('color(') === -1);
        var _cellStyles = _xml.match(/<c\b[^>]*>/g).map(function (tag) { return (/\ss="(\d+)"/.exec(tag) || [0, ''])[1]; });
        // 3 rows of 2 cells. The first cell of the first and the third rows have the same style, the second row has an invalid background
        helper.assert(_cellStyles.length, 6);
        helper.assert(_cellStyles[0], _cellStyles[4]);
        assert.notStrictEqual(_cellStyles[0], _cellStyles[2]);
        helper.assert(_cellStyles[2], '1');
        var _styles = files['xl/styles.xml'];
        helper.assert(_styles.match(/<fill>/g).length, 3);
        assert.ok(_styles.indexOf('<fgColor rgb="FFFF0000"/>') !== -1);
        assert.ok(_styles.indexOf('<color rgb="FF0000FF"/>') !== -1);
        done();
      });
    });
    it('should return a clear error if the marker is not in a xlsx cell or row', function (done) {
      carbone.renderXML('<c>a{d.c:color(banana, text)}</c>', { c : 'red' }, { lang : 'en' }, function (err) {
        assert.ok(/only available for docx, odt, ods, xlsx and pptx templates/.test(err.message));
        done();
      });
    });
  });

  describe('expandPptxColorMarkers', function () {
    var FILL = function (marker, id) {
      return '<a:solidFill><a:srgbClr val="{' + marker + ':_pptxColor(\'' + id + '\')}"/></a:solidFill>';
    };
    it('should do nothing without color marker or options', function () {
      helper.assert(color.expandPptxColorMarkers('<a:p>{d.id}</a:p>', {}), '<a:p>{d.id}</a:p>');
      helper.assert(color.expandPptxColorMarkers('<a:p><a:r><a:t>a{d.c:color(p, text)}</a:t></a:r></a:p>'), '<a:p><a:r><a:t>a{d.c:color(p, text)}</a:t></a:r></a:p>');
      helper.assert(color.expandPptxColorMarkers(null, {}), null);
    });
    it('should set the color of all runs of a paragraph, create or update the properties of the run, and keep the order of the schema', function () {
      var _options = {};
      var _xml = '<a:p><a:r><a:t>a{d.c:color(p, text)}</a:t></a:r><a:r><a:rPr lang="en-US"/><a:t>b</a:t></a:r><a:r><a:rPr sz="2800" b="1"><a:latin typeface="Arial"/></a:rPr><a:t>c</a:t></a:r><a:r><a:rPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr><a:t>d</a:t></a:r></a:p>';
      helper.assert(color.expandPptxColorMarkers(_xml, _options),
        '<a:p><a:r><a:rPr>' + FILL('d.c', 0) + '</a:rPr><a:t>a</a:t></a:r><a:r><a:rPr lang="en-US">' + FILL('d.c', 1) + '</a:rPr><a:t>b</a:t></a:r>'
        + '<a:r><a:rPr sz="2800" b="1">' + FILL('d.c', 2) + '<a:latin typeface="Arial"/></a:rPr><a:t>c</a:t></a:r><a:r><a:rPr>' + FILL('d.c', 3) + '</a:rPr><a:t>d</a:t></a:r></a:p>');
      helper.assert(_options.pptxFills, ['', '', '', '<a:solidFill><a:srgbClr val="000000"/></a:solidFill>']);
    });
    it('should set the fill of a cell, after the borders, and create the properties of the cell at the end', function () {
      var _options = {};
      helper.assert(color.expandPptxColorMarkers('<a:tc><a:txBody><a:p><a:r><a:t>a{d.c:color(cell, background)}</a:t></a:r></a:p></a:txBody><a:tcPr marL="1"><a:lnL w="1"/><a:lnR w="1"/></a:tcPr></a:tc>', _options),
        '<a:tc><a:txBody><a:p><a:r><a:t>a</a:t></a:r></a:p></a:txBody><a:tcPr marL="1"><a:lnL w="1"/><a:lnR w="1"/>' + FILL('d.c', 0) + '</a:tcPr></a:tc>');
      helper.assert(color.expandPptxColorMarkers('<a:tc><a:txBody><a:p><a:r><a:t>a{d.c:color(cell, background)}</a:t></a:r></a:p></a:txBody></a:tc>', {}),
        '<a:tc><a:txBody><a:p><a:r><a:t>a</a:t></a:r></a:p></a:txBody><a:tcPr>' + FILL('d.c', 0) + '</a:tcPr></a:tc>');
      helper.assert(color.expandPptxColorMarkers('<a:tc><a:txBody><a:p><a:r><a:t>a{d.c:color(cell, background)}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>', {}),
        '<a:tc><a:txBody><a:p><a:r><a:t>a</a:t></a:r></a:p></a:txBody><a:tcPr>' + FILL('d.c', 0) + '</a:tcPr></a:tc>');
    });
    it('should replace the existing fill of a cell and save it', function () {
      var _options = {};
      var _xml = color.expandPptxColorMarkers('<a:tc><a:txBody><a:p><a:r><a:t>a{d.c:color(cell, background)}</a:t></a:r></a:p></a:txBody><a:tcPr><a:gradFill/><a:headers/></a:tcPr></a:tc>', _options);
      assert.ok(_xml.indexOf('<a:tcPr>' + FILL('d.c', 0) + '<a:headers/></a:tcPr>') !== -1);
      helper.assert(_options.pptxFills, ['<a:gradFill/>']);
    });
    it('should set the fill of all cells of a row, the text of a row and the text of a cell', function () {
      var _row = '<a:tr><a:tc><a:txBody><a:p><a:r><a:t>a{d.c:color(row, background)}</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>b</a:t></a:r></a:p></a:txBody></a:tc></a:tr>';
      var _xml = color.expandPptxColorMarkers(_row, {});
      helper.assert(_xml.match(/<a:tcPr>/g).length, 2);
      _xml = color.expandPptxColorMarkers(_row.replace('color(row, background)', 'color(row, text)'), {});
      helper.assert(_xml.match(/<a:rPr>/g).length, 2);
      _xml = color.expandPptxColorMarkers('<a:tc><a:txBody><a:p><a:r><a:t>a{d.c:color(cell, text)}</a:t></a:r></a:p><a:p><a:r><a:t>b</a:t></a:r></a:p></a:txBody></a:tc>', {});
      helper.assert(_xml.match(/<a:rPr>/g).length, 2);
    });
    it('should set the fill of a shape, after the geometry and before the border', function () {
      var _options = {};
      helper.assert(color.expandPptxColorMarkers('<p:sp><p:spPr><a:xfrm/><a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill><a:ln/></p:spPr><p:txBody><a:p><a:r><a:t>a{d.c:color(shape, background)}</a:t></a:r></a:p></p:txBody></p:sp>', _options),
        '<p:sp><p:spPr><a:xfrm/><a:prstGeom prst="rect"/>' + FILL('d.c', 0) + '<a:ln/></p:spPr><p:txBody><a:p><a:r><a:t>a</a:t></a:r></a:p></p:txBody></p:sp>');
      helper.assert(_options.pptxFills, ['<a:solidFill><a:srgbClr val="4472C4"/></a:solidFill>']);
      var _text = color.expandPptxColorMarkers('<p:sp><p:spPr/><p:txBody><a:p><a:r><a:t>a{d.c:color(shape, text)}</a:t></a:r></a:p></p:txBody></p:sp>', {});
      assert.ok(_text.indexOf('<a:rPr>' + FILL('d.c', 0) + '</a:rPr>') !== -1);
    });
    it('should not modify unsupported markers', function () {
      var _xml = '<a:p><a:r><a:t>a{d.c:color(p, background)}</a:t></a:r></a:p><a:p><a:r><a:t>b{d.c:color(banana, text)}</a:t></a:r></a:p><a:p><a:r><a:t>c{d.c:color(cell, border)}</a:t></a:r></a:p>';
      helper.assert(color.expandPptxColorMarkers(_xml, {}), _xml);
      var _noProps = '<p:sp><p:txBody><a:p><a:r><a:t>a{d.c:color(shape, background)}</a:t></a:r></a:p></p:txBody></p:sp>';
      helper.assert(color.expandPptxColorMarkers(_noProps, {}), _noProps);
    });
  });

  describe('resolvePptxColors', function () {
    it('should put back the original fill where the color is not valid, and remove the fill if there is no original fill', function () {
      var _report = { files : [{ name : 'ppt/slides/slide1.xml', data : '<a:rPr><a:solidFill><a:srgbClr val="CARBONE_PC_0"/></a:solidFill></a:rPr><a:rPr><a:solidFill><a:srgbClr val="CARBONE_PC_1"/></a:solidFill></a:rPr><a:rPr><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr>' }] };
      color.resolvePptxColors(_report, { pptxFills : ['<a:solidFill><a:srgbClr val="000000"/></a:solidFill>', ''] });
      helper.assert(_report.files[0].data, '<a:rPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr><a:rPr></a:rPr><a:rPr><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr>');
      color.resolvePptxColors(null, {});
      color.resolvePptxColors({ files : [] }, {});
    });
  });

  describe('in a pptx', function () {
    function render (body, data, callback) {
      var _template = {
        isZipped   : true,
        filename   : 'test.pptx',
        embeddings : [],
        files      : [
          { name : '[Content_Types].xml', isMarked : true, parent : '', data : '<Types/>' },
          { name : 'ppt/slides/slide1.xml', isMarked : true, parent : '', data : '<p:sld><p:cSld><p:spTree>' + body + '</p:spTree></p:cSld></p:sld>' }
        ]
      };
      carbone.render(_template, data, {}, function (err, result) {
        if (err) {
          return callback(err);
        }
        file.unzip(result, function (errUnzip, files) {
          callback(errUnzip, files.filter(function (f) { return f.name === 'ppt/slides/slide1.xml'; })[0].data.toString());
        });
      });
    }
    var SHAPE = '<p:sp><p:spPr><a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="FFC000"/></a:solidFill></p:spPr><p:txBody><a:p><a:r><a:rPr b="1"/><a:t>text{d.bg:color(shape, background)}{d.tc:color(shape, text)}</a:t></a:r></a:p></p:txBody></p:sp>';
    it('should print colors, keep the other properties of runs, and replace the fill of the shape', function (done) {
      render(SHAPE, { bg : '#00B050', tc : 'white' }, function (err, xml) {
        helper.assert(err, null);
        assert.ok(xml.indexOf('<a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="00B050"/></a:solidFill></p:spPr>') !== -1);
        assert.ok(xml.indexOf('<a:rPr b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr>') !== -1);
        assert.ok(xml.indexOf('FFC000') === -1 && xml.indexOf('CARBONE_PC') === -1);
        done();
      });
    });
    it('should keep the original fill for invalid or missing colors', function (done) {
      render(SHAPE.replace('<a:rPr b="1"/>', '<a:rPr b="1"><a:solidFill><a:srgbClr val="123456"/></a:solidFill></a:rPr>'), { bg : 'invalid' }, function (err, xml) {
        helper.assert(err, null);
        assert.ok(xml.indexOf('<a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="FFC000"/></a:solidFill></p:spPr>') !== -1);
        assert.ok(xml.indexOf('<a:rPr b="1"><a:solidFill><a:srgbClr val="123456"/></a:solidFill></a:rPr>') !== -1);
        assert.ok(xml.indexOf('CARBONE_PC') === -1);
        done();
      });
    });
    it('should not allow XML injection through the color', function (done) {
      render(SHAPE, { bg : '00B050"/><a:evil/><a:x val="', tc : '#FF0000' }, function (err, xml) {
        helper.assert(err, null);
        assert.ok(xml.indexOf('evil') === -1);
        done();
      });
    });
  });

  describe('in an ods', function () {
    var AUTO = '<office:automatic-styles><style:style style:name="ce1" style:family="table-cell" style:parent-style-name="Default"><style:table-cell-properties fo:border="0.74pt solid #000000"/><style:text-properties fo:font-style="italic"/></style:style></office:automatic-styles>';
    function render (body, data, callback) {
      var _template = {
        isZipped   : true,
        filename   : 'test.ods',
        embeddings : [],
        files      : [
          { name : 'mimetype', isMarked : false, parent : '', data : Buffer.from('application/vnd.oasis.opendocument.spreadsheet') },
          { name : 'content.xml', isMarked : true, parent : '', data : '<office:document-content xmlns:office="o" xmlns:text="t" xmlns:table="b" xmlns:style="s" xmlns:fo="f">' + AUTO + '<office:body><office:spreadsheet>' + body + '</office:spreadsheet></office:body></office:document-content>' }
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
    it('should put the text color and the background in the style of the cell, and keep its other properties', function (done) {
      var _body = '<table:table><table:table-row><table:table-cell table:style-name="ce1"><text:p>{d.n}{d.bg:color(cell, background)}{d.tc:color(cell, text)}</text:p></table:table-cell></table:table-row></table:table>';
      render(_body, { n : 'a', bg : '#00FF00', tc : '#FF0000' }, function (err, xml) {
        helper.assert(err, null);
        var _name = /<table:table-cell table:style-name="(CarboneC\w+)"/.exec(xml)[1];
        var _style = new RegExp('<style:style style:name="' + _name + '"[\\s\\S]*?</style:style>').exec(xml)[0];
        assert.ok(_style.indexOf('fo:border="0.74pt solid #000000"') !== -1 && _style.indexOf('fo:background-color="#00FF00"') !== -1);
        assert.ok(_style.indexOf('fo:font-style="italic"') !== -1 && _style.indexOf('fo:color="#FF0000"') !== -1);
        assert.ok(_style.indexOf('style:parent-style-name="Default"') !== -1);
        assert.ok(xml.indexOf('<text:p>a</text:p>') !== -1, 'the paragraph is not modified');
        done();
      });
    });
    it('should color all cells of a row, in a loop', function (done) {
      var _body = '<table:table><table:table-row><table:table-cell table:style-name="ce1"><text:p>{d.items[i].n}{d.items[i].c:color(row, background)}</text:p></table:table-cell><table:table-cell table:style-name="ce1"><text:p>{d.items[i].s}</text:p></table:table-cell></table:table-row>'
        + '<table:table-row><table:table-cell><text:p>{d.items[i+1].n}</text:p></table:table-cell><table:table-cell><text:p>{d.items[i+1].s}</text:p></table:table-cell></table:table-row></table:table>';
      render(_body, { items : [{ n : 'a', s : 'x', c : '#FF0000' }, { n : 'b', s : 'y', c : 'invalid' }] }, function (err, xml) {
        helper.assert(err, null);
        var _names = xml.match(/<table:table-cell table:style-name="([^"]*)"/g).map(function (m) { return /"([^"]*)"/.exec(m)[1]; });
        helper.assert(_names.length, 4);
        helper.assert(_names[0], _names[1]);
        assert.ok(/^CarboneC/.test(_names[0]));
        helper.assert([_names[2], _names[3]], ['ce1', 'ce1']);
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
        helper.assert(/only available for docx, odt, ods, xlsx and pptx templates/.test(err.message), true);
        carbone.renderXML('<w:p>a{d.c:color(banana, text)}</w:p>', _data, { lang : 'en' }, function (err) {
          helper.assert(/color\(banana, text\)/.test(err.message), true);
          done();
        });
      });
    });
  });
});
