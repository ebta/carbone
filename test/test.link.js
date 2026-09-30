var assert = require('assert');
var carbone = require('../lib');
var file = require('../lib/file');
var link = require('../lib/link');
var linkFormatter = require('../formatters/link');
var helper = require('../lib/helper');

var HL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

function buildDocx (body, relationships) {
  return {
    isZipped   : true,
    filename   : 'test.docx',
    embeddings : [],
    files      : [
      { name : '[Content_Types].xml', isMarked : true, parent : '', data : '<Types/>' },
      { name : 'word/document.xml', isMarked : true, parent : '', data : '<w:document><w:body>' + body + '</w:body></w:document>' },
      { name : 'word/_rels/document.xml.rels', isMarked : true, parent : '', data : '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + relationships + '</Relationships>' }
    ]
  };
}

function relationship (id, target) {
  return '<Relationship Id="' + id + '" Type="' + HL + '" Target="' + target + '" TargetMode="External"/>';
}

function hyperlink (id, text) {
  return '<w:hyperlink r:id="' + id + '" w:history="1"><w:r><w:t>' + text + '</w:t></w:r></w:hyperlink>';
}

function unzipped (buffer, callback) {
  file.unzip(buffer, function (err, files) {
    var _res = {};
    (files || []).forEach(function (f) {
      _res[f.name] = f.data.toString();
    });
    callback(err, _res);
  });
}

function renderDocx (body, relationships, data, callback) {
  carbone.render(buildDocx(body, relationships), data, {}, function (err, result) {
    if (err) {
      return callback(err);
    }
    unzipped(result, callback);
  });
}

function renderOdt (body, data, callback) {
  var _template = {
    isZipped   : true,
    filename   : 'test.odt',
    embeddings : [],
    files      : [
      { name : 'mimetype', isMarked : false, parent : '', data : Buffer.from('application/vnd.oasis.opendocument.text') },
      { name : 'content.xml', isMarked : true, parent : '', data : '<office:document-content><office:body><office:text>' + body + '</office:text></office:body></office:document-content>' }
    ]
  };
  carbone.render(_template, data, {}, function (err, result) {
    if (err) {
      return callback(err);
    }
    unzipped(result, callback);
  });
}

describe('dynamic hyperlinks', function () {

  describe('isSafeUrl', function () {
    it('should accept web, mail and phone links, and relative links', function () {
      ['https://a.b/c?d=1', 'HTTP://A.B', 'mailto:a@b.c', 'tel:+33123', 'ftp://a.b', 'sms:123', '#anchor', '/path/a', 'a/b', 'example.com', '//cdn.example.com/a'].forEach(function (url) {
        helper.assert(url + ' ' + linkFormatter.isSafeUrl(url), url + ' true');
      });
    });
    it('should refuse other schemes, even hidden by spaces or upper case', function () {
      ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\nscript:alert(1)', 'java\tscript:alert(1)', 'data:text/html;base64,AAAA', 'vbscript:x', 'file:///etc/passwd'].forEach(function (url) {
        helper.assert(url + ' ' + linkFormatter.isSafeUrl(url), url + ' false');
      });
    });
  });

  describe('_link and _hyperlink formatters', function () {
    it('_link should print the url with its prefix and suffix, or nothing', function () {
      helper.assert(linkFormatter._link('https://a.b'), 'https://a.b');
      helper.assert(linkFormatter._link('7', 'https://a.b/', '?x=1'), 'https://a.b/7?x=1');
      helper.assert(linkFormatter._link('javascript:alert(1)'), '');
      helper.assert(linkFormatter._link('alert(1)', 'javascript:'), '');
      helper.assert(linkFormatter._link(''), '');
      helper.assert(linkFormatter._link(null, 'https://a.b/'), '');
      helper.assert(linkFormatter._link(undefined), '');
      helper.assert(linkFormatter._link(12, 'https://a.b/'), 'https://a.b/12');
    });
    it('_hyperlink should register urls and print identifiers', function () {
      var _ctx = {};
      helper.assert(linkFormatter._hyperlink.call(_ctx, 'https://a.b'), 'CARBONE_LINK_0');
      helper.assert(linkFormatter._hyperlink.call(_ctx, '7', 'https://c.d/'), 'CARBONE_LINK_1');
      helper.assert(linkFormatter._hyperlink.call(_ctx, 'javascript:x'), 'CARBONE_LINK_NONE');
      helper.assert(linkFormatter._hyperlink.call(_ctx, ''), 'CARBONE_LINK_NONE');
      helper.assert(linkFormatter._hyperlink.call(_ctx, null), 'CARBONE_LINK_NONE');
      helper.assert(_ctx.links, ['https://a.b', 'https://c.d/7']);
    });
  });

  describe('decodeMarkers', function () {
    it('should decode percent-encoded markers only', function () {
      helper.assert(link.decodeMarkers('%7Bd.url%7D'), '{d.url}');
      helper.assert(link.decodeMarkers('https://a.b/%7Bd.items%5Bi%5D.u%7D?x=%20y'), 'https://a.b/{d.items[i].u}?x=%20y');
      helper.assert(link.decodeMarkers('%7bd.a%3Aprepend(%27x%27)%7d'), '{d.a:prepend(\'x\')}');
      helper.assert(link.decodeMarkers('https://a.b/%20c'), 'https://a.b/%20c');
      helper.assert(link.decodeMarkers('%7B%E0%A4%A%7D'), '%7B%E0%A4%A%7D');
    });
  });

  describe('expandOdfLinkMarkers', function () {
    it('should add the formatter, decode encoded markers, and keep static text', function () {
      helper.assert(link.expandOdfLinkMarkers('<text:a xlink:type="simple" xlink:href="%7Bd.url%7D">a</text:a>'), '<text:a xlink:type="simple" xlink:href="{d.url:_link}">a</text:a>');
      helper.assert(link.expandOdfLinkMarkers('<text:a xlink:href="{d.url}">a</text:a>'), '<text:a xlink:href="{d.url:_link}">a</text:a>');
      helper.assert(link.expandOdfLinkMarkers('<text:a xlink:href="https://a.b/%7Bd.id%7D?x=1">a</text:a>'), '<text:a xlink:href="{d.id:_link(\'https://a.b/\', \'?x=1\')}">a</text:a>');
      helper.assert(link.expandOdfLinkMarkers('<text:a xlink:href="{d.url:prepend(\'a\')}">a</text:a>'), '<text:a xlink:href="{d.url:prepend(\'a\'):_link}">a</text:a>');
    });
    it('should not modify static links, or unknown markers, or addresses which cannot be managed', function () {
      var _xml = '<text:a xlink:href="https://a.b">a</text:a><text:a xlink:href="{unknown}">b</text:a><text:a xlink:href="{d.a}{d.b}">c</text:a><text:a xlink:href="it\'s/{d.a}">d</text:a>';
      helper.assert(link.expandOdfLinkMarkers(_xml), _xml);
      helper.assert(link.expandOdfLinkMarkers(null), null);
    });
  });

  describe('expandHyperlinkMarkers', function () {
    it('should move markers of relationships in the part, and remove these relationships', function () {
      var _template = buildDocx(hyperlink('rId7', 'a') + hyperlink('rId8', 'b') + hyperlink('rId9', 'c'),
        relationship('rId7', '%7Bd.url%7D') + relationship('rId8', 'https://static.org') + relationship('rId9', 'https://a.b/%7Bd.id%7D'));
      link.expandHyperlinkMarkers(_template);
      helper.assert(_template.files[1].data.indexOf('<w:hyperlink r:id="{d.url:_hyperlink}" w:history="1">') !== -1, true);
      helper.assert(_template.files[1].data.indexOf('<w:hyperlink r:id="rId8" w:history="1">') !== -1, true);
      helper.assert(_template.files[1].data.indexOf('<w:hyperlink r:id="{d.id:_hyperlink(\'https://a.b/\', \'\')}" w:history="1">') !== -1, true);
      helper.assert(_template.files[2].data.indexOf('rId7') === -1 && _template.files[2].data.indexOf('rId9') === -1, true);
      helper.assert(_template.files[2].data.indexOf('Id="rId8"') !== -1, true);
    });
    it('should manage pptx hyperlinks, and not confuse rId1 and rId10', function () {
      var _template = buildDocx('', relationship('rId1', '{d.a}') + relationship('rId10', 'https://static.org'));
      _template.files[1].name = 'ppt/slides/slide1.xml';
      _template.files[1].data = '<a:hlinkClick r:id="rId1"/><a:hlinkClick r:id="rId10"/>';
      _template.files[2].name = 'ppt/slides/_rels/slide1.xml.rels';
      link.expandHyperlinkMarkers(_template);
      helper.assert(_template.files[1].data, '<a:hlinkClick r:id="{d.a:_hyperlink}"/><a:hlinkClick r:id="rId10"/>');
    });
    it('should not modify other relationships, and should not crash without template', function () {
      var _template = buildDocx(hyperlink('rId7', 'a'), '<Relationship Id="rId7" Type="other/image" Target="{d.url}"/>');
      var _before = JSON.stringify(_template);
      link.expandHyperlinkMarkers(_template);
      helper.assert(JSON.stringify(_template), _before);
      link.expandHyperlinkMarkers(null);
      link.expandHyperlinkMarkers({});
    });
  });

  describe('resolveLinks', function () {
    it('should remove links without URL and keep their text, for docx and pptx', function () {
      var _report = { files : [
        { name : 'word/document.xml', data : '<w:p><w:hyperlink r:id="CARBONE_LINK_NONE" w:history="1"><w:r><w:t>text</w:t></w:r></w:hyperlink></w:p>' },
        { name : 'ppt/slides/slide1.xml', data : '<a:r><a:rPr><a:hlinkClick r:id="CARBONE_LINK_NONE"/></a:rPr></a:r><a:r><a:rPr><a:hlinkClick r:id="CARBONE_LINK_NONE" action="x"></a:hlinkClick></a:rPr></a:r>' }
      ] };
      link.resolveLinks(_report, { links : [] });
      helper.assert(_report.files[0].data, '<w:p><w:r><w:t>text</w:t></w:r></w:p>');
      helper.assert(_report.files[1].data, '<a:r><a:rPr></a:rPr></a:r><a:r><a:rPr></a:rPr></a:r>');
    });
    it('should do nothing without registered links', function () {
      var _report = { files : [{ name : 'word/document.xml', data : 'CARBONE_LINK_0' }] };
      link.resolveLinks(_report, {});
      link.resolveLinks(_report, null);
      helper.assert(_report.files[0].data, 'CARBONE_LINK_0');
    });
  });

  describe('render a docx', function () {
    it('should create a relationship for a link, and remove the one of the template', function (done) {
      renderDocx(hyperlink('rId7', '{d.label}'), relationship('rId7', '%7Bd.url%7D'), { url : 'https://example.org/a?x=1&y=2', label : 'go' }, function (err, files) {
        helper.assert(err, null);
        var _rels = files['word/_rels/document.xml.rels'];
        helper.assert(_rels.match(/<Relationship /g).length, 1);
        assert.ok(/Target="https:\/\/example\.org\/a\?x=1&amp;y=2" TargetMode="External"/.test(_rels));
        var _id = /Id="(rIdCarboneLink\w+)"/.exec(_rels)[1];
        assert.ok(files['word/document.xml'].indexOf('<w:hyperlink r:id="' + _id + '"') !== -1);
        assert.ok(files['word/document.xml'].indexOf('CARBONE_LINK') === -1);
        done();
      });
    });
    it('should print a different link for each row of a loop, and store identical URLs once', function (done) {
      var _body = '<w:tbl><w:tr><w:tc><w:p>' + hyperlink('rId8', '{d.items[i].n}') + '</w:p></w:tc></w:tr><w:tr><w:tc><w:p>' + hyperlink('rId9', '{d.items[i+1].n}') + '</w:p></w:tc></w:tr></w:tbl>';
      var _rels = relationship('rId8', '%7Bd.items%5Bi%5D.u%7D') + relationship('rId9', '%7Bd.items%5Bi%2B1%5D.u%7D');
      var _data = { items : [{ n : 'a', u : 'https://a.test' }, { n : 'b', u : 'https://b.test' }, { n : 'c', u : 'https://a.test' }] };
      renderDocx(_body, _rels, _data, function (err, files) {
        helper.assert(err, null);
        var _ids = files['word/document.xml'].match(/r:id="(rIdCarboneLink\w+)"/g);
        helper.assert(_ids.length, 3);
        helper.assert(_ids[0], _ids[2]);
        assert.notStrictEqual(_ids[0], _ids[1]);
        helper.assert(files['word/_rels/document.xml.rels'].match(/<Relationship /g).length, 2);
        done();
      });
    });
    it('should support a static prefix before the marker, and keep static links', function (done) {
      renderDocx(hyperlink('rId7', 'a') + hyperlink('rId8', 'b'), relationship('rId7', 'https://shop.test/item/%7Bd.id%7D?ref=doc') + relationship('rId8', 'https://static.test'), { id : 42 }, function (err, files) {
        helper.assert(err, null);
        assert.ok(files['word/_rels/document.xml.rels'].indexOf('Target="https://shop.test/item/42?ref=doc"') !== -1);
        assert.ok(files['word/_rels/document.xml.rels'].indexOf('Id="rId8" Type="' + HL + '" Target="https://static.test"') !== -1);
        done();
      });
    });
    it('should remove links with an unsafe or missing URL, and keep their text', function (done) {
      var _body = '<w:p>' + hyperlink('rId7', 'evil') + hyperlink('rId8', 'missing') + '</w:p>';
      renderDocx(_body, relationship('rId7', '%7Bd.evil%7D') + relationship('rId8', '%7Bd.nope%7D'), { evil : 'javascript:alert(1)' }, function (err, files) {
        helper.assert(err, null);
        helper.assert(files['word/document.xml'], '<w:document><w:body><w:p><w:r><w:t>evil</w:t></w:r><w:r><w:t>missing</w:t></w:r></w:p></w:body></w:document>');
        helper.assert(files['word/_rels/document.xml.rels'].indexOf('Relationship ') === -1, true);
        done();
      });
    });
    it('should not allow XML injection through the URL', function (done) {
      renderDocx(hyperlink('rId7', 'a'), relationship('rId7', '%7Bd.url%7D'), { url : 'https://a.test/"/><Relationship Id="x" Target="http://evil' }, function (err, files) {
        helper.assert(err, null);
        helper.assert(files['word/_rels/document.xml.rels'].match(/<Relationship /g).length, 1);
        done();
      });
    });
    it('should use the result of conditional formatters', function (done) {
      renderDocx(hyperlink('rId7', 'a'), relationship('rId7', '%7Bd.ok:ifEQ(true):show(%27https://yes.test%27):elseShow(%27javascript:no%27)%7D'), { ok : false }, function (err, files) {
        helper.assert(err, null);
        helper.assert(files['word/_rels/document.xml.rels'].indexOf('Relationship ') === -1, true);
        done();
      });
    });
  });

  describe('render an odt', function () {
    it('should print links, refuse unsafe URLs, and manage loops and encoded markers', function (done) {
      var _a = function (href, text) {
        return '<text:a xlink:type="simple" xlink:href="' + href + '">' + text + '</text:a>';
      };
      var _body = '<text:p>' + _a('%7Bd.url%7D', '{d.label}') + _a('{d.evil}', 'evil') + _a('https://shop.test/item/%7Bd.id%7D', 'item') + '</text:p>'
        + '<text:p>' + _a('%7Bd.items%5Bi%5D.u%7D', '{d.items[i].n}') + '</text:p><text:p>' + _a('%7Bd.items%5Bi%2B1%5D.u%7D', '{d.items[i+1].n}') + '</text:p>';
      var _data = { url : 'https://example.org/a?x=1&y=2', label : 'go', evil : 'javascript:alert(1)', id : 7, items : [{ n : 'a', u : 'https://a.test' }, { n : 'b', u : 'mailto:b@test' }] };
      renderOdt(_body, _data, function (err, files) {
        helper.assert(err, null);
        helper.assert(files['content.xml'].match(/xlink:href="[^"]*"/g), [
          'xlink:href="https://example.org/a?x=1&amp;y=2"', 'xlink:href=""', 'xlink:href="https://shop.test/item/7"', 'xlink:href="https://a.test"', 'xlink:href="mailto:b@test"'
        ]);
        done();
      });
    });
  });
});
