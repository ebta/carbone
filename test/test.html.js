var assert = require('assert');
var carbone = require('../lib');
var file = require('../lib/file');
var html = require('../lib/html');
var htmlFormatter = require('../formatters/html');
var helper = require('../lib/helper');

/** Check that all tags are balanced */
function assertWellFormed (xml) {
  var _stack = [];
  var _regex = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g;
  var _tag;
  while ((_tag = _regex.exec(xml)) !== null) {
    if (_tag[4] === '/') {
      continue;
    }
    if (_tag[1] === '/') {
      assert.strictEqual(_stack.pop(), _tag[2], 'unbalanced tag </' + _tag[2] + '> in ' + xml.slice(0, 300));
    }
    else {
      _stack.push(_tag[2]);
    }
  }
  assert.strictEqual(_stack.length, 0, 'unclosed tags: ' + _stack.join(','));
}

function texts (units) {
  return units.map(function (unit) {
    return unit.type === 'break' ? '|' : (unit.type === 'tab' ? '\t' : unit.text);
  }).join('');
}

function unzip (buffer, callback) {
  file.unzip(buffer, function (err, files) {
    var _res = {};
    (files || []).forEach(function (f) {
      _res[f.name] = f.data.toString();
    });
    callback(err, _res);
  });
}

describe('html formatter', function () {

  describe('decodeEntities', function () {
    it('should decode named and numeric entities, and keep unknown entities', function () {
      helper.assert(html.decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &nbsp;|&copy;&euro;&hellip;'), 'a & b <c> "d" \'e\'  |©€…');
      helper.assert(html.decodeEntities('&#x1F600;&#128512;&#9731;'), '😀😀☃');
      helper.assert(html.decodeEntities('&unknown; &amp'), '&unknown; &amp');
    });
    it('should remove characters which are not allowed in XML', function () {
      helper.assert(html.decodeEntities('a&#0;b&#8;c&#xFFFE;d&#1114112;e&#xD800;f'), 'abcdef');
      helper.assert(html.decodeEntities('a&#9;b&#10;c'), 'a\tb\nc');
    });
  });

  describe('parseHtml', function () {
    it('should read inline formatting, also nested', function () {
      var _units = html.parseHtml('a <b>b <i>c</i></b> <u>d</u><s>e</s><sup>f</sup><sub>g</sub>');
      helper.assert(_units.map(function (u) { return Object.keys(u.flags).filter(function (k) { return u.flags[k]; }).join(''); }), ['', 'b', 'bi', '', 'u', 's', 'x', 'y']);
      helper.assert(texts(_units), 'a b c defg');
    });
    it('should read tag aliases and inline styles', function () {
      var _flags = function (h) {
        var _u = html.parseHtml(h)[0];
        return Object.keys(_u.flags).filter(function (k) { return _u.flags[k]; }).join('');
      };
      helper.assert(_flags('<strong>a</strong>'), 'b');
      helper.assert(_flags('<em>a</em>'), 'i');
      helper.assert(_flags('<del>a</del>'), 's');
      helper.assert(_flags('<strike>a</strike>'), 's');
      helper.assert(_flags('<h3>a</h3>'), 'b');
      helper.assert(_flags('<span style="font-weight: bold; font-style:italic; text-decoration: underline">a</span>'), 'biu');
      helper.assert(_flags('<span style="FONT-WEIGHT:700">a</span>'), 'b');
      helper.assert(_flags('<span style="text-decoration:line-through">a</span>'), 's');
      helper.assert(_flags('<span style="font-weight:normal">a</span>'), '');
    });
    it('should separate blocks with line breaks, and trim the start and the end', function () {
      helper.assert(texts(html.parseHtml('<p>one</p><p>two</p>')), 'one||two');
      helper.assert(texts(html.parseHtml('<div>one</div><div>two</div>')), 'one|two');
      helper.assert(texts(html.parseHtml('<h1>title</h1>text')), 'title||text');
      helper.assert(texts(html.parseHtml('<p>one</p>')), 'one');
      helper.assert(texts(html.parseHtml('  <p>  one  </p>  ')), 'one');
      helper.assert(texts(html.parseHtml('one<br>two<br><br>three')), 'one|two||three');
      helper.assert(texts(html.parseHtml('<br>one')), '|one');
    });
    it('should collapse white spaces like a browser', function () {
      helper.assert(texts(html.parseHtml('a   b\n\n\tc <b> d </b> e')), 'a b c d e');
      helper.assert(texts(html.parseHtml('<b>a </b> <i> b</i>')), 'a b');
      helper.assert(texts(html.parseHtml('a<b> b</b>')), 'a b');
    });
    it('should print lists with bullets and numbers, and an indentation for nested lists', function () {
      helper.assert(texts(html.parseHtml('<ul><li>a</li><li>b</li></ul>')), '• a|• b');
      helper.assert(texts(html.parseHtml('<ol><li>a</li><li>b</li></ol>')), '1. a|2. b');
      helper.assert(texts(html.parseHtml('<ul><li>a<ul><li>b</li></ul></li></ul>')), '• a|    • b');
      helper.assert(texts(html.parseHtml('<ol><li>a</li></ol><ol><li>b</li></ol>')), '1. a||1. b');
      helper.assert(texts(html.parseHtml('before<ul><li>a</li></ul>after')), 'before||• a||after');
    });
    it('should separate cells with tabs and rows with line breaks', function () {
      helper.assert(texts(html.parseHtml('<table><tr><th>a</th><th>b</th></tr><tr><td>c</td><td>d</td></tr></table>')), 'a\tb|c\td');
    });
    it('should keep new lines and spaces in pre', function () {
      helper.assert(texts(html.parseHtml('<pre>a  b\nc</pre>')), 'a  b|c');
    });
    it('should keep links with a safe URL only', function () {
      var _units = html.parseHtml('<a href="https://a.b/?x=1&amp;y=2">ok</a><a href=\'mailto:a@b.c\'>mail</a><a href="javascript:alert(1)">bad</a><a href=" JaVaScRiPt:x">bad2</a><a href="data:text/html,x">bad3</a><a>none</a>');
      helper.assert(_units.map(function (u) { return u.link; }), ['https://a.b/?x=1&y=2', 'mailto:a@b.c', null, null, null, null]);
      helper.assert(texts(_units), 'okmailbadbad2bad3none');
    });
    it('should remove scripts, styles and comments, and ignore unknown tags but keep their text', function () {
      helper.assert(texts(html.parseHtml('a<script>alert("<b>x</b>")</script>b<style>p{}</style>c<!-- <b>no</b> -->d<custom-x>e</custom-x><span class="x">f</span><img src="x.png"><hr>g')), 'abcdefg');
    });
    it('should manage attributes which contain ">", unclosed tags, and wrong closing tags', function () {
      helper.assert(texts(html.parseHtml('<span title="a>b">x</span>y')), 'xy');
      var _units = html.parseHtml('<b>one<i>two');
      helper.assert(_units.map(function (u) { return Object.keys(u.flags).join(''); }), ['b', 'bi']);
      helper.assert(texts(html.parseHtml('a</b>b</div>c</ul></pre></li>d')), 'abcd');
      helper.assert(texts(html.parseHtml('1 < 2 and 3 > 2')), '1 < 2 and 3 > 2');
    });
    it('should not keep the formatting after the end of a tag', function () {
      var _units = html.parseHtml('<b>a</b>b<b><i>c</i></b>d');
      helper.assert(_units.map(function (u) { return Object.keys(u.flags).join(''); }), ['b', '', 'bi', '']);
    });
    it('should return no unit for empty content, and limit the size', function () {
      helper.assert(html.parseHtml(''), []);
      helper.assert(html.parseHtml('  <p> </p> '), []);
      helper.assert(texts(html.parseHtml('a'.repeat(1100000))).length, 1000000);
    });
  });

  describe('buildRunProperties', function () {
    it('should keep the properties of the original run, and write them in the order of the schema', function () {
      var _base = '<w:rFonts w:ascii="Georgia"/><w:color w:val="FF0000"/><w:sz w:val="28"/>';
      helper.assert(html.buildRunProperties(_base, { b : true, i : true }, false),
        '<w:rPr><w:rFonts w:ascii="Georgia"/><w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="FF0000"/><w:sz w:val="28"/></w:rPr>');
      helper.assert(html.buildRunProperties(_base, { u : true, s : true, x : true }, false),
        '<w:rPr><w:rFonts w:ascii="Georgia"/><w:strike/><w:color w:val="FF0000"/><w:sz w:val="28"/><w:u w:val="single"/><w:vertAlign w:val="superscript"/></w:rPr>');
    });
    it('should replace properties, and style links', function () {
      helper.assert(html.buildRunProperties('<w:b/><w:color w:val="FF0000"/>', { y : true }, true), '<w:rPr><w:b/><w:color w:val="0563C1"/><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr>');
    });
    it('should return nothing if there is no property', function () {
      helper.assert(html.buildRunProperties('', {}, false), '');
    });
  });

  describe('convert', function () {
    it('docx: should close the run, write runs with the properties of the original run, and open a run again', function () {
      var _xml = html.convert('a &lt;b&gt;b&lt;/b&gt;&lt;br&gt;c', 'docx', '<w:sz w:val="28"/>');
      helper.assert(_xml, '</w:t></w:r><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">a </w:t></w:r>'
        + '<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">b</w:t></w:r>'
        + '<w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:br/></w:r><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">c</w:t></w:r>'
        + '<w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">');
      assertWellFormed('<w:p><w:r><w:t>before' + _xml + 'after</w:t></w:r></w:p>');
    });
    it('should escape quotes of a URL, in an attribute', function () {
      var _docx = html.convert('&lt;a href=\'https://a.b/"x&amp;amp;y\'&gt;l&lt;/a&gt;', 'docx', '');
      assert.ok(_docx.indexOf('HYPERLINK &quot;https://a.b/%22x&amp;y&quot;') !== -1);
      assertWellFormed('<w:p><w:r><w:t>' + _docx + '</w:t></w:r></w:p>');
      var _odt = html.convert('&lt;a href=\'https://a.b/"x&amp;amp;y\'&gt;l&lt;/a&gt;', 'odt');
      assert.ok(_odt.indexOf('xlink:href="https://a.b/&quot;x&amp;y"') !== -1);
      assertWellFormed('<text:p>' + _odt + '</text:p>');
    });
    it('docx: should write a link as a field, escape the text and the URL, and use tabs', function () {
      var _xml = html.convert('&lt;a href="https://a.b/?x=1&amp;amp;y=%22"&gt;x &amp;amp; &amp;lt;y&amp;gt;&lt;/a&gt;&lt;table&gt;&lt;tr&gt;&lt;td&gt;a&lt;/td&gt;&lt;td&gt;b&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;', 'docx', '');
      assert.ok(_xml.indexOf('<w:fldSimple w:instr=" HYPERLINK &quot;https://a.b/?x=1&amp;y=%22&quot; ">') !== -1);
      assert.ok(_xml.indexOf('x &amp; &lt;y&gt;') !== -1);
      assert.ok(_xml.indexOf('<w:color w:val="0563C1"/><w:u w:val="single"/>') !== -1);
      assert.ok(_xml.indexOf('<w:tab/>') !== -1);
      assertWellFormed('<w:p><w:r><w:t>' + _xml + '</w:t></w:r></w:p>');
    });
    it('odt: should write spans, line breaks, and keep consecutive spaces of pre', function () {
      var _xml = html.convert('&lt;pre&gt;a   b&lt;/pre&gt;&lt;b&gt;c&lt;i&gt;d&lt;/i&gt;&lt;/b&gt;&lt;br&gt;e &lt;a href="https://a.b"&gt;f&lt;/a&gt;', 'odt');
      helper.assert(_xml, 'a <text:s text:c="2"/>b<text:line-break/><text:line-break/>'
        + '<text:span text:style-name="CarboneHtml_b">c</text:span><text:span text:style-name="CarboneHtml_bi">d</text:span>'
        + '<text:line-break/>e <text:a xlink:type="simple" xlink:href="https://a.b"><text:span text:style-name="CarboneHtml_u">f</text:span></text:a>');
      assertWellFormed('<text:p>' + _xml + '</text:p>');
    });
    it('should print the text for other formats, escaped', function () {
      helper.assert(html.convert('&lt;p&gt;a &amp;amp; b&lt;/p&gt;&lt;p&gt;&lt;b&gt;c&lt;/b&gt; &amp;lt;d&amp;gt;&lt;/p&gt;', 'xlsx'), 'a &amp; b\n\nc &lt;d&gt;');
      helper.assert(html.convert('&lt;b&gt;a&lt;/b&gt;', undefined), 'a');
    });
    it('should return nothing if there is no content', function () {
      helper.assert(html.convert('', 'docx'), '');
      helper.assert(html.convert('&lt;p&gt; &lt;/p&gt;', 'odt'), '');
    });
  });

  describe('expandHtmlMarkers', function () {
    it('should save the properties of the run, and add the identifier', function () {
      var _options = {};
      var _xml = '<w:p><w:r><w:rPr><w:sz w:val="28"/><w:b/></w:rPr><w:t>a {d.text:html} b</w:t></w:r><w:r><w:t>{d.other:html()}</w:t></w:r></w:p>';
      helper.assert(html.expandHtmlMarkers(_xml, _options), '<w:p><w:r><w:rPr><w:sz w:val="28"/><w:b/></w:rPr><w:t>a {d.text:html(\'0\')} b</w:t></w:r><w:r><w:t>{d.other:html(\'1\')}</w:t></w:r></w:p>');
      helper.assert(_options.htmlRunProperties, ['<w:sz w:val="28"/><w:b/>', '']);
    });
    it('should keep the other formatters, and not modify markers outside of a run or without options', function () {
      var _options = {};
      helper.assert(html.expandHtmlMarkers('<w:r><w:t>{d.t:upperCase:html:ifEM}</w:t></w:r>', _options), '<w:r><w:t>{d.t:upperCase:html(\'0\'):ifEM}</w:t></w:r>');
      helper.assert(html.expandHtmlMarkers('<text:p>{d.t:html}</text:p><w:p>{d.t:html}</w:p>', {}), '<text:p>{d.t:html}</text:p><w:p>{d.t:html}</w:p>');
      helper.assert(html.expandHtmlMarkers('<w:r><w:t>{d.t:html}</w:t></w:r>'), '<w:r><w:t>{d.t:html}</w:t></w:r>');
      helper.assert(html.expandHtmlMarkers(null, {}), null);
    });
  });

  describe('resolveOdfStyles', function () {
    it('should create styles which are used, once', function () {
      var _report = { files : [{ name : 'content.xml', data : '<office:automatic-styles><style:style style:name="T1" style:family="text"/></office:automatic-styles><text:p><text:span text:style-name="CarboneHtml_b"/><text:span text:style-name="CarboneHtml_bi"/><text:span text:style-name="CarboneHtml_b"/></text:p>' }] };
      html.resolveOdfStyles(_report);
      var _data = _report.files[0].data;
      helper.assert(_data.match(/<style:style style:name="CarboneHtml_/g).length, 2);
      assert.ok(_data.indexOf('<style:style style:name="CarboneHtml_bi" style:family="text"><style:text-properties fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold" fo:font-style="italic"') !== -1);
      assert.ok(_data.indexOf('</office:automatic-styles>') > _data.indexOf('CarboneHtml_bi" style:family'));
      // second call: nothing is added
      html.resolveOdfStyles(_report);
      helper.assert(_report.files[0].data, _data);
    });
    it('should do nothing without styles to create', function () {
      var _report = { files : [{ name : 'content.xml', data : '<office:automatic-styles/>' }] };
      html.resolveOdfStyles(_report);
      helper.assert(_report.files[0].data, '<office:automatic-styles/>');
      html.resolveOdfStyles(null);
    });
  });

  describe('formatter', function () {
    it('should return empty values untouched, and accept numbers', function () {
      helper.assert(htmlFormatter.html.call({ extension : 'docx' }, null), null);
      helper.assert(htmlFormatter.html.call({ extension : 'docx' }, undefined), undefined);
      helper.assert(htmlFormatter.html.call({ extension : 'docx' }, ''), '');
      helper.assert(htmlFormatter.html.call({ extension : 'xlsx' }, 12), '12');
      helper.assert(htmlFormatter.html.call({}, 'a'), 'a');
    });
    it('should be executed after the escaping of the data', function () {
      helper.assert(htmlFormatter.html.canInjectXML, true);
    });
  });

  describe('in a docx', function () {
    var RPR = '<w:rPr><w:rFonts w:ascii="Georgia"/><w:sz w:val="28"/></w:rPr>';
    function renderDocx (body, data, callback) {
      var _template = {
        isZipped   : true,
        filename   : 'test.docx',
        embeddings : [],
        files      : [
          { name : '[Content_Types].xml', isMarked : true, parent : '', data : '<Types/>' },
          { name : 'word/document.xml', isMarked : true, parent : '', data : '<w:document><w:body>' + body + '</w:body></w:document>' }
        ]
      };
      carbone.render(_template, data, {}, function (err, result) {
        if (err) {
          return callback(err);
        }
        unzip(result, function (errUnzip, files) {
          callback(errUnzip, files['word/document.xml']);
        });
      });
    }
    it('should convert HTML, keep the text around the marker and the properties of the run', function (done) {
      renderDocx('<w:p><w:r>' + RPR + '<w:t>Before {d.text:html} after</w:t></w:r></w:p>', { text : 'x <b>bold</b> y' }, function (err, xml) {
        helper.assert(err, null);
        assertWellFormed(xml);
        assert.ok(xml.indexOf('<w:t>Before </w:t></w:r>') !== -1, 'the text before is kept in the original run');
        assert.ok(xml.indexOf('<w:r><w:rPr><w:rFonts w:ascii="Georgia"/><w:b/><w:bCs/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">bold</w:t></w:r>') !== -1);
        assert.ok(xml.indexOf('<w:r>' + RPR + '<w:t xml:space="preserve"> after</w:t></w:r>') !== -1, 'the text after has the original properties');
        done();
      });
    });
    it('should convert HTML in each row of a loop, and in a table cell', function (done) {
      var _body = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>{d.items[i].t:html}</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>{d.items[i+1].t:html}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
      renderDocx(_body, { items : [{ t : '<b>a</b>' }, { t : '<i>b</i>' }, { t : 'c<br>d' }] }, function (err, xml) {
        helper.assert(err, null);
        assertWellFormed(xml);
        helper.assert(xml.match(/<w:tr>/g).length, 3);
        helper.assert(xml.match(/<w:bCs\/>/g).length, 1);
        helper.assert(xml.match(/<w:iCs\/>/g).length, 1);
        helper.assert(xml.match(/<w:br\/>/g).length, 1);
        done();
      });
    });
    it('should not allow injection in the document', function (done) {
      var _evil = '<script>alert(1)</script></w:t></w:r><w:evil/><a href="https://a.b/" onclick="x">l</a> & <![CDATA[x]]> <img src=x onerror=1>';
      renderDocx('<w:p><w:r><w:t>{d.t:html}</w:t></w:r></w:p>', { t : _evil }, function (err, xml) {
        helper.assert(err, null);
        assertWellFormed(xml);
        assert.ok(xml.indexOf('<w:evil') === -1 && xml.indexOf('<script') === -1 && xml.indexOf('onclick') === -1 && xml.indexOf('onerror') === -1);
        assert.ok(xml.indexOf('HYPERLINK &quot;https://a.b/&quot;') !== -1);
        assert.ok(xml.indexOf('&amp; &lt;![CDATA[x]]&gt;') !== -1, 'other characters are printed as text');
        done();
      });
    });
    it('should not create a link with an unsafe URL', function (done) {
      renderDocx('<w:p><w:r><w:t>{d.t:html}</w:t></w:r></w:p>', { t : '<a href="javascript:alert(1)">bad</a> <a href="data:text/html;base64,AAAA">bad2</a>' }, function (err, xml) {
        helper.assert(err, null);
        assertWellFormed(xml);
        assert.ok(xml.indexOf('fldSimple') === -1 && xml.indexOf('javascript') === -1 && xml.indexOf('data:') === -1);
        assert.ok(xml.indexOf('>bad<') !== -1);
        done();
      });
    });
    it('should be chainable with other formatters, and print nothing for an empty value', function (done) {
      renderDocx('<w:p><w:r><w:t>a{d.t:upperCase:html}b{d.empty:html}c</w:t></w:r></w:p>', { t : '<i>x</i>', empty : '' }, function (err, xml) {
        helper.assert(err, null);
        assertWellFormed(xml);
        assert.ok(xml.indexOf('<w:r><w:rPr><w:i/><w:iCs/></w:rPr><w:t xml:space="preserve">X</w:t></w:r>') !== -1);
        assert.ok(xml.indexOf('<w:t>a</w:t>') !== -1 && xml.indexOf('b') !== -1 && xml.indexOf('c</w:t>') !== -1);
        done();
      });
    });
  });

  describe('in an odt', function () {
    function renderOdt (body, data, callback) {
      var _template = {
        isZipped   : true,
        filename   : 'test.odt',
        embeddings : [],
        files      : [
          { name : 'mimetype', isMarked : false, parent : '', data : Buffer.from('application/vnd.oasis.opendocument.text') },
          { name : 'content.xml', isMarked : true, parent : '', data : '<office:document-content><office:automatic-styles/><office:body><office:text>' + body + '</office:text></office:body></office:document-content>' }
        ]
      };
      carbone.render(_template, data, {}, function (err, result) {
        if (err) {
          return callback(err);
        }
        unzip(result, function (errUnzip, files) {
          callback(errUnzip, files['content.xml']);
        });
      });
    }
    it('should convert HTML, and create the styles', function (done) {
      renderOdt('<text:p>Before <text:span text:style-name="T1">{d.t:html}</text:span> after</text:p>', { t : 'a <b>b</b> <i>c</i><br>d' }, function (err, xml) {
        helper.assert(err, null);
        assertWellFormed(xml);
        assert.ok(xml.indexOf('<text:span text:style-name="T1">a <text:span text:style-name="CarboneHtml_b">b</text:span> <text:span text:style-name="CarboneHtml_i">c</text:span><text:line-break/>d</text:span> after') !== -1);
        assert.ok(xml.indexOf('<style:style style:name="CarboneHtml_b" style:family="text">') !== -1);
        assert.ok(xml.indexOf('<style:style style:name="CarboneHtml_i" style:family="text">') !== -1);
        done();
      });
    });
    it('should not allow injection in the document', function (done) {
      renderOdt('<text:p>{d.t:html}</text:p>', { t : '</text:p><text:evil/><script>x</script><a href="javascript:alert(1)">l</a>' }, function (err, xml) {
        helper.assert(err, null);
        assertWellFormed(xml);
        assert.ok(xml.indexOf('<text:evil') === -1 && xml.indexOf('<script') === -1 && xml.indexOf('javascript') === -1);
        done();
      });
    });
  });

  describe('in other documents', function () {
    it('should print the text, with new lines', function (done) {
      carbone.renderXML('<t>{d.t:html}</t>', { t : '<p>a &amp; b</p><p><b>c</b></p>' }, { lang : 'en' }, function (err, result) {
        helper.assert(err+'', 'null');
        helper.assert(result, '<t>a &amp; b\n\nc</t>');
        done();
      });
    });
  });
});
