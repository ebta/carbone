var assert = require('assert');
var http = require('http');
var zlib = require('zlib');
var carbone = require('../lib');
var file = require('../lib/file');
var params = require('../lib/params');
var image = require('../lib/image');
var download = require('../lib/download');
var imageFormatter = require('../formatters/image');
var helper = require('../lib/helper');

/** Build a PNG without dependency (solid color) */
function buildPng (width, height) {
  var _rows = Buffer.alloc((width * 3 + 1) * height, 0x7f);
  for (var y = 0; y < height; y++) {
    _rows[y * (width * 3 + 1)] = 0; // filter: none
  }
  function chunk (type, data) {
    var _len = Buffer.alloc(4);
    _len.writeUInt32BE(data.length);
    var _crc = Buffer.alloc(4);
    _crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(Buffer.concat([Buffer.from(type), data])) : 0);
    return Buffer.concat([_len, Buffer.from(type), data, _crc]);
  }
  var _header = Buffer.alloc(13);
  _header.writeUInt32BE(width, 0);
  _header.writeUInt32BE(height, 4);
  _header[8] = 8;
  _header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', _header), chunk('IDAT', zlib.deflateSync(_rows)), chunk('IEND', Buffer.alloc(0))]);
}

function buildGif (width, height) {
  var _buf = Buffer.alloc(30);
  _buf.write('GIF89a', 0, 'latin1');
  _buf.writeUInt16LE(width, 6);
  _buf.writeUInt16LE(height, 8);
  return _buf;
}

function buildJpeg (width, height) {
  var _buf = Buffer.alloc(32);
  Buffer.from([0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08]).copy(_buf, 0);
  _buf.writeUInt16BE(height, 7);
  _buf.writeUInt16BE(width, 9);
  return _buf;
}

function toUri (buffer, type) {
  return 'data:image/' + (type || 'png') + ';base64,' + buffer.toString('base64');
}

var PLACEHOLDER = buildPng(10, 10);

function picture (id, descr, cx, cy) {
  cx = cx || 1800000;
  cy = cy || 900000;
  return '<w:r><w:drawing><wp:inline><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="Picture ' + id + '" descr="' + descr + '"/>'
    + '<a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill>'
    + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}

/** Build a template, already unzipped (accepted by carbone.render for tests) */
function buildTemplate (body) {
  return {
    isZipped   : true,
    filename   : 'test.docx',
    embeddings : [],
    files      : [
      { name : '[Content_Types].xml', isMarked : true, parent : '', data : '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>' },
      { name : 'word/document.xml', isMarked : true, parent : '', data : '<w:document><w:body>' + body + '</w:body></w:document>' },
      { name : 'word/_rels/document.xml.rels', isMarked : true, parent : '', data : '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/placeholder.png"/></Relationships>' },
      { name : 'word/media/placeholder.png', isMarked : false, parent : '', data : PLACEHOLDER }
    ]
  };
}

function renderDocx (body, data, callback) {
  carbone.render(buildTemplate(body), data, {}, function (err, result) {
    if (err) {
      return callback(err);
    }
    file.unzip(result, function (errUnzip, files) {
      var _res = {};
      (files || []).forEach(function (f) {
        _res[f.name] = f.data;
      });
      callback(errUnzip, _res);
    });
  });
}

function frame (name, descTag, w, h) {
  return '<draw:frame draw:name="' + name + '" text:anchor-type="as-char" svg:width="' + w + '" svg:height="' + h + '">'
    + '<draw:image xlink:href="Pictures/placeholder.png" xlink:type="simple" loext:mime-type="image/png"/>' + descTag + '</draw:frame>';
}

function buildOdtTemplate (body) {
  return {
    isZipped   : true,
    filename   : 'test.odt',
    embeddings : [],
    files      : [
      { name : 'mimetype', isMarked : false, parent : '', data : Buffer.from('application/vnd.oasis.opendocument.text') },
      { name : 'content.xml', isMarked : true, parent : '', data : '<office:document-content><office:body><office:text>' + body + '</office:text></office:body></office:document-content>' },
      { name : 'META-INF/manifest.xml', isMarked : true, parent : '', data : '<manifest:manifest><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/></manifest:manifest>' },
      { name : 'Pictures/placeholder.png', isMarked : false, parent : '', data : PLACEHOLDER }
    ]
  };
}

function renderOdt (body, data, callback) {
  carbone.render(buildOdtTemplate(body), data, {}, function (err, result) {
    if (err) {
      return callback(err);
    }
    file.unzip(result, function (errUnzip, files) {
      var _res = {};
      (files || []).forEach(function (f) {
        _res[f.name] = f.data;
      });
      callback(errUnzip, _res);
    });
  });
}

describe('dynamic images', function () {

  var _paramsBackup = {};
  beforeEach(function () {
    _paramsBackup = { timeout : params.imageDownloadTimeout, size : params.imageMaxSize, priv : params.imageAllowPrivateNetwork };
  });
  afterEach(function () {
    params.imageDownloadTimeout = _paramsBackup.timeout;
    params.imageMaxSize = _paramsBackup.size;
    params.imageAllowPrivateNetwork = _paramsBackup.priv;
  });

  describe('getImageInfo', function () {
    it('should detect png, gif and jpeg, and their size', function () {
      helper.assert(image.getImageInfo(buildPng(160, 80)), { type : 'png', width : 160, height : 80 });
      helper.assert(image.getImageInfo(buildGif(30, 20)), { type : 'gif', width : 30, height : 20 });
      helper.assert(image.getImageInfo(buildJpeg(128, 64)), { type : 'jpg', width : 128, height : 64 });
    });
    it('should skip other JPEG segments before the size', function () {
      var _app0 = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      var _info = image.getImageInfo(Buffer.concat([_app0, Buffer.from([0xFF, 0xC2, 0x00, 0x11, 0x08, 0x01, 0x00, 0x02, 0x00]), Buffer.alloc(20)]));
      helper.assert(_info, { type : 'jpg', width : 512, height : 256 });
    });
    it('should return null for unsupported, truncated or invalid images', function () {
      helper.assert(image.getImageInfo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
      helper.assert(image.getImageInfo(Buffer.alloc(10)), null);
      helper.assert(image.getImageInfo(buildPng(0, 10)), null);
      helper.assert(image.getImageInfo(buildGif(0, 0)), null);
      helper.assert(image.getImageInfo('abc'), null);
      helper.assert(image.getImageInfo(null), null);
      helper.assert(image.getImageInfo(Buffer.from([0xFF, 0xD8, 0xFF, 0xC4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), null);
    });
  });

  describe('computeSize', function () {
    var _box = [1800000, 900000];
    it('contain: should fit in the placeholder, keeping the ratio', function () {
      helper.assert(image.computeSize(_box[0], _box[1], { width : 60, height : 120 }, 'contain'), { width : 450000, height : 900000 });
      helper.assert(image.computeSize(_box[0], _box[1], { width : 400, height : 100 }, 'contain'), { width : 1800000, height : 450000 });
      helper.assert(image.computeSize(_box[0], _box[1], { width : 160, height : 80 }, 'contain'), { width : 1800000, height : 900000 });
    });
    it('fillwidth: should use the width of the placeholder', function () {
      helper.assert(image.computeSize(_box[0], _box[1], { width : 60, height : 120 }, 'fillwidth'), { width : 1800000, height : 3600000 });
      helper.assert(image.computeSize(_box[0], _box[1], { width : 400, height : 100 }, 'fillwidth'), { width : 1800000, height : 450000 });
    });
    it('fill: should stretch to the placeholder', function () {
      helper.assert(image.computeSize(_box[0], _box[1], { width : 60, height : 120 }, 'fill'), { width : 1800000, height : 900000 });
    });
  });

  describe('imageFit and _image formatters', function () {
    it('imageFit should keep the value, and _image should register the image with the chosen fit', function () {
      var _ctx = {};
      helper.assert(imageFormatter.imageFit.call(_ctx, 'data:image/png;base64,AAA', 'fillWidth'), 'data:image/png;base64,AAA');
      helper.assert(imageFormatter._image.call(_ctx, ' data:image/png;base64,AAA '), 'CARBONE_IMG_0');
      helper.assert(imageFormatter._image.call(_ctx, 'https://a.b/c.png'), 'CARBONE_IMG_1');
      helper.assert(_ctx.images, [{ source : 'data:image/png;base64,AAA', fit : 'fillwidth' }, { source : 'https://a.b/c.png', fit : 'contain' }]);
    });
    it('should use contain for unknown fit modes, and return NONE for empty values', function () {
      var _ctx = {};
      imageFormatter.imageFit.call(_ctx, 'x', 'banana');
      helper.assert(imageFormatter._image.call(_ctx, 'a'), 'CARBONE_IMG_0');
      helper.assert(_ctx.images[0].fit, 'contain');
      helper.assert(imageFormatter._image.call(_ctx, ''), 'CARBONE_IMG_NONE');
      helper.assert(imageFormatter._image.call(_ctx, '   '), 'CARBONE_IMG_NONE');
      helper.assert(imageFormatter._image.call(_ctx, null), 'CARBONE_IMG_NONE');
      helper.assert(imageFormatter._image.call(_ctx, 12), 'CARBONE_IMG_NONE');
      helper.assert(_ctx.images.length, 1);
    });
  });

  describe('expandImageMarkers', function () {
    it('should move the marker from the alternative text to the picture', function () {
      var _xml = '<w:drawing><wp:docPr id="1" name="P" descr="{d.logo:imageFit(fill)}"/><a:blip r:embed="rId5"/></w:drawing>';
      helper.assert(image.expandImageMarkers(_xml), '<w:drawing><wp:docPr id="1" name="P" descr=""/><a:blip r:embed="{d.logo:imageFit(fill):_image}"/></w:drawing>');
    });
    it('should not modify pictures without marker, with a text which is not a marker, or other markup', function () {
      var _xml = '<w:drawing><wp:docPr id="1" name="P" descr="Company logo"/><a:blip r:embed="rId5"/></w:drawing><w:drawing><wp:docPr descr="{not a marker}"/><a:blip r:embed="rId6"/></w:drawing><w:drawing><wp:docPr id="3"/><a:blip r:embed="rId7"/></w:drawing>';
      helper.assert(image.expandImageMarkers(_xml), _xml);
      helper.assert(image.expandImageMarkers('<w:p>{d.logo}</w:p>'), '<w:p>{d.logo}</w:p>');
      helper.assert(image.expandImageMarkers(null), null);
    });
    it('should manage many pictures', function () {
      var _xml = '<w:drawing><wp:docPr descr="{d.a}"/><a:blip r:embed="rId1"/></w:drawing><w:drawing><wp:docPr descr="{d.b}"/><a:blip r:embed="rId2"/></w:drawing>';
      var _res = image.expandImageMarkers(_xml);
      assert.ok(_res.indexOf('r:embed="{d.a:_image}"') !== -1 && _res.indexOf('r:embed="{d.b:_image}"') !== -1);
    });
  });

  describe('expandImageMarkers for ODF', function () {
    it('should move the marker from svg:desc or svg:title to the picture', function () {
      helper.assert(image.expandImageMarkers('<draw:frame svg:width="1cm"><draw:image xlink:href="Pictures/a.png"/><svg:desc>{d.logo:imageFit(fill)}</svg:desc></draw:frame>'),
        '<draw:frame svg:width="1cm"><draw:image xlink:href="{d.logo:imageFit(fill):_image}"/><svg:desc></svg:desc></draw:frame>');
      helper.assert(image.expandImageMarkers('<draw:frame><draw:image xlink:href="Pictures/a.png"/><svg:title> {d.logo} </svg:title></draw:frame>'),
        '<draw:frame><draw:image xlink:href="{d.logo:_image}"/><svg:title></svg:title></draw:frame>');
    });
    it('should not modify frames without marker, or without picture', function () {
      var _xml = '<draw:frame><draw:image xlink:href="Pictures/a.png"/><svg:desc>Company logo</svg:desc></draw:frame><draw:frame><draw:text-box/><svg:desc>{d.logo}</svg:desc></draw:frame>';
      helper.assert(image.expandImageMarkers(_xml), _xml);
    });
  });

  describe('render an odt with dynamic images', function () {
    var DESC = function (marker) {
      return '<svg:desc>' + marker + '</svg:desc>';
    };
    it('should replace pictures, add files in Pictures and in the manifest, and use the real mime type', function (done) {
      var _png = buildPng(160, 80);
      var _jpg = buildJpeg(128, 64);
      renderOdt('<text:p>' + frame('I1', DESC('{d.a}'), '8cm', '4cm') + frame('I2', DESC('{d.b}'), '2cm', '1cm') + '</text:p>', { a : toUri(_png), b : toUri(_jpg, 'jpeg') }, function (err, files) {
        helper.assert(err, null);
        var _pictures = Object.keys(files).filter(function (name) {
          return /^Pictures\/carbone_/.test(name);
        });
        helper.assert(_pictures.length, 2);
        var _content = files['content.xml'].toString();
        assert.ok(_content.indexOf('CARBONE_IMG') === -1);
        assert.ok(_content.indexOf('<svg:desc></svg:desc>') !== -1);
        _pictures.forEach(function (name) {
          assert.ok(_content.indexOf('xlink:href="' + name + '"') !== -1);
          assert.ok(files['META-INF/manifest.xml'].toString().indexOf('manifest:full-path="' + name + '" manifest:media-type="' + (/\.jpg$/.test(name) ? 'image/jpeg' : 'image/png') + '"') !== -1);
        });
        assert.ok(/loext:mime-type="image\/jpeg"/.test(_content));
        assert.ok(/Pictures\/placeholder\.png/.test(Object.keys(files).join(',')));
        done();
      });
    });
    it('should resize the frame according to imageFit, keeping units', function (done) {
      var _uri = toUri(buildPng(60, 120));
      var _body = '<text:p>' + frame('I1', DESC('{d.img}'), '8cm', '4cm') + frame('I2', DESC('{d.img:imageFit(fillWidth)}'), '8cm', '4cm') + frame('I3', DESC('{d.img:imageFit(fill)}'), '3in', '2in') + '</text:p>';
      renderOdt(_body, { img : _uri }, function (err, files) {
        helper.assert(err, null);
        var _sizes = files['content.xml'].toString().match(/svg:width="[^"]*" svg:height="[^"]*"/g);
        helper.assert(_sizes, ['svg:width="2cm" svg:height="4cm"', 'svg:width="8cm" svg:height="16cm"', 'svg:width="3in" svg:height="2in"']);
        done();
      });
    });
    it('should remove the frame if the value is empty, and keep frames without dynamic image', function (done) {
      renderOdt('<text:p>a' + frame('I1', DESC('{d.missing}'), '1cm', '1cm') + frame('I2', DESC('Company logo'), '1cm', '1cm') + '</text:p>', {}, function (err, files) {
        helper.assert(err, null);
        var _content = files['content.xml'].toString();
        helper.assert(_content.match(/<draw:frame/g).length, 1);
        assert.ok(_content.indexOf('Company logo') !== -1);
        helper.assert(Object.keys(files).filter(function (n) { return /^Pictures\/carbone_/.test(n); }), []);
        done();
      });
    });
    it('should print different pictures in a loop', function (done) {
      var _body = '<text:p>{d.items[i].n}' + frame('I1', DESC('{d.items[i].img}'), '2cm', '2cm') + '</text:p><text:p>{d.items[i+1].n}' + frame('I2', DESC('{d.items[i+1].img}'), '2cm', '2cm') + '</text:p>';
      var _data = { items : [{ n : 'a', img : toUri(buildPng(20, 20)) }, { n : 'b', img : toUri(buildPng(30, 20)) }, { n : 'c', img : toUri(buildPng(20, 20)) }] };
      renderOdt(_body, _data, function (err, files) {
        helper.assert(err, null);
        var _hrefs = files['content.xml'].toString().match(/xlink:href="Pictures\/carbone_\w+\.png"/g);
        helper.assert(_hrefs.length, 3);
        helper.assert(_hrefs[0], _hrefs[2]);
        assert.notStrictEqual(_hrefs[0], _hrefs[1]);
        helper.assert(Object.keys(files).filter(function (n) { return /^Pictures\/carbone_/.test(n); }).length, 2);
        done();
      });
    });
    it('should return an error if an image is invalid', function (done) {
      renderOdt('<text:p>' + frame('I1', DESC('{d.img}'), '1cm', '1cm') + '</text:p>', { img : 'data:image/png;base64,AAAA' }, function (err) {
        assert.ok(/Cannot load the image/.test(err.message));
        done();
      });
    });
  });

  describe('PPTX and XLSX', function () {
    function pptxPicture (id, descr, cx, cy) {
      return '<p:pic><p:nvPicPr><p:cNvPr id="' + id + '" name="Picture ' + id + '" descr="' + descr + '"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill>'
        + '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm></p:spPr></p:pic>';
    }
    function renderPackage (partName, body, data, callback) {
      var _dir = partName.replace(/\/[^/]+$/, '');
      var _file = partName.replace(/^.*\//, '');
      var _template = {
        isZipped   : true,
        filename   : 'test',
        embeddings : [],
        files      : [
          { name : '[Content_Types].xml', isMarked : true, parent : '', data : '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>' },
          { name : partName, isMarked : true, parent : '', data : body },
          { name : _dir + '/_rels/' + _file + '.rels', isMarked : true, parent : '', data : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>' }
        ]
      };
      carbone.render(_template, data, {}, function (err, result) {
        if (err) {
          return callback(err);
        }
        file.unzip(result, function (errUnzip, files) {
          var _res = {};
          (files || []).forEach(function (f) {
            _res[f.name] = f.data;
          });
          callback(errUnzip, _res);
        });
      });
    }
    var PPTX = 'ppt/slides/slide1.xml';
    var XLSX = 'xl/drawings/drawing1.xml';

    it('should move the marker of pictures of PPTX and XLSX (with or without namespace prefix)', function () {
      helper.assert(image.expandImageMarkers('<p:pic><p:nvPicPr><p:cNvPr id="1" descr="{d.logo}"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>'),
        '<p:pic><p:nvPicPr><p:cNvPr id="1" descr=""/></p:nvPicPr><p:blipFill><a:blip r:embed="{d.logo:_image}"/></p:blipFill></p:pic>');
      helper.assert(image.expandImageMarkers('<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" descr="{d.logo}"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId2"/></xdr:blipFill></xdr:pic>'),
        '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" descr=""/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="{d.logo:_image}"/></xdr:blipFill></xdr:pic>');
      helper.assert(image.expandImageMarkers('<pic><nvPicPr><cNvPr id="1" descr="{d.logo}"/></nvPicPr><blipFill><a:blip r:embed="rId2"/></blipFill></pic>'),
        '<pic><nvPicPr><cNvPr id="1" descr=""/></nvPicPr><blipFill><a:blip r:embed="{d.logo:_image}"/></blipFill></pic>');
    });
    it('should not modify pictures with a normal alternative text', function () {
      var _xml = '<p:pic><p:nvPicPr><p:cNvPr id="1" descr="Logo"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic><pic><nvPicPr><cNvPr id="2" descr="Photo"/></nvPicPr><blipFill><a:blip r:embed="rId3"/></blipFill></pic>';
      helper.assert(image.expandImageMarkers(_xml), _xml);
    });

    it('should replace pictures of a slide, resize them, and remove pictures without image', function (done) {
      var _body = '<p:sld><p:cSld><p:spTree>' + pptxPicture(1, '{d.img}', 3000000, 1500000) + pptxPicture(2, '{d.portrait}', 2000000, 2000000)
        + pptxPicture(3, '{d.portrait:imageFit(fill)}', 2000000, 2000000) + pptxPicture(4, '{d.portrait:imageFit(fillWidth)}', 2000000, 1000000) + pptxPicture(5, '{d.missing}', 1000000, 1000000) + '</p:spTree></p:cSld></p:sld>';
      renderPackage(PPTX, _body, { img : toUri(buildPng(160, 80)), portrait : toUri(buildPng(60, 120)) }, function (err, files) {
        helper.assert(err, null);
        var _xml = files[PPTX].toString();
        helper.assert(_xml.match(/<a:ext cx="\d+" cy="\d+"\/>/g), [
          '<a:ext cx="3000000" cy="1500000"/>', '<a:ext cx="1000000" cy="2000000"/>', '<a:ext cx="2000000" cy="2000000"/>', '<a:ext cx="2000000" cy="4000000"/>'
        ]);
        helper.assert(_xml.match(/<p:pic>/g).length, 4);
        assert.ok(_xml.indexOf('CARBONE_IMG') === -1);
        helper.assert(Object.keys(files).filter(function (n) { return /^ppt\/media\/carbone_.*\.png$/.test(n); }).length, 2);
        // slide and media are in sibling directories
        assert.ok(/Target="\.\.\/media\/carbone_\w+\.png"/.test(files['ppt/slides/_rels/slide1.xml.rels'].toString()));
        done();
      });
    });

    function xlsxOneCell (id, descr, cx, cy, prefix) {
      var _p = prefix ? 'xdr:' : '';
      return '<' + _p + 'oneCellAnchor><' + _p + 'from><' + _p + 'col>1</' + _p + 'col><' + _p + 'row>2</' + _p + 'row></' + _p + 'from><' + _p + 'ext cx="' + cx + '" cy="' + cy + '"/>'
        + '<' + _p + 'pic><' + _p + 'nvPicPr><' + _p + 'cNvPr id="' + id + '" descr="' + descr + '"/></' + _p + 'nvPicPr><' + _p + 'blipFill><a:blip r:embed="rId1"/></' + _p + 'blipFill></' + _p + 'pic></' + _p + 'oneCellAnchor>';
    }
    function xlsxTwoCell (id, descr, cx, cy) {
      return '<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>1</xdr:col><xdr:row>2</xdr:row></xdr:from><xdr:to><xdr:col>5</xdr:col><xdr:row>9</xdr:row></xdr:to>'
        + '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + id + '" descr="' + descr + '"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill>'
        + '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>';
    }

    it('should replace pictures of a spreadsheet, with or without namespace prefix, and resize one cell anchors', function (done) {
      var _data = { portrait : toUri(buildPng(60, 120)) };
      var _plain = '<wsDr>' + xlsxOneCell(1, '{d.portrait}', 1905000, 952500, false) + xlsxOneCell(2, '{d.portrait:imageFit(fillWidth)}', 1000000, 500000, false) + '</wsDr>';
      renderPackage(XLSX, _plain, _data, function (err, files) {
        helper.assert(err, null);
        var _xml = files[XLSX].toString();
        helper.assert(_xml.match(/<ext cx="\d+" cy="\d+"\/>/g), ['<ext cx="476250" cy="952500"/>', '<ext cx="1000000" cy="2000000"/>']);
        assert.ok(/Target="\.\.\/media\/carbone_\w+\.png"/.test(files['xl/drawings/_rels/drawing1.xml.rels'].toString()));
        helper.assert(Object.keys(files).filter(function (n) { return /^xl\/media\/carbone_.*\.png$/.test(n); }).length, 1);
        var _prefixed = '<xdr:wsDr>' + xlsxOneCell(1, '{d.portrait}', 1905000, 952500, true) + '</xdr:wsDr>';
        renderPackage(XLSX, _prefixed, _data, function (err, files) {
          helper.assert(err, null);
          helper.assert(files[XLSX].toString().match(/<xdr:ext cx="\d+" cy="\d+"\/>/g), ['<xdr:ext cx="476250" cy="952500"/>']);
          done();
        });
      });
    });
    it('should convert a two cell anchor into a one cell anchor to resize it, and keep it with fill', function (done) {
      var _body = '<xdr:wsDr xmlns:xdr="x">' + xlsxTwoCell(1, '{d.portrait}', 1905000, 952500) + xlsxTwoCell(2, '{d.portrait:imageFit(fill)}', 1905000, 952500) + '</xdr:wsDr>';
      renderPackage(XLSX, _body, { portrait : toUri(buildPng(60, 120)) }, function (err, files) {
        helper.assert(err, null);
        var _xml = files[XLSX].toString();
        helper.assert(_xml.match(/<xdr:(oneCellAnchor|twoCellAnchor)\b[^>]*>/g), ['<xdr:oneCellAnchor>', '<xdr:twoCellAnchor editAs="oneCell">']);
        helper.assert(_xml.match(/<xdr:ext cx="\d+" cy="\d+"\/>/g), ['<xdr:ext cx="476250" cy="952500"/>']);
        helper.assert(_xml.match(/<xdr:to>/g).length, 1);
        helper.assert(_xml.match(/<\/xdr:oneCellAnchor>/g).length, 1);
        helper.assert(_xml.match(/<a:ext cx="\d+" cy="\d+"\/>/g), ['<a:ext cx="476250" cy="952500"/>', '<a:ext cx="1905000" cy="952500"/>']);
        done();
      });
    });
    it('should remove the whole anchor of a picture without image, and return errors for invalid images', function (done) {
      var _body = '<wsDr>' + xlsxOneCell(1, '{d.missing}', 100, 100, false) + xlsxOneCell(2, '{d.img}', 100, 100, false) + '</wsDr>';
      renderPackage(XLSX, _body, { img : toUri(buildPng(10, 10)) }, function (err, files) {
        helper.assert(err, null);
        helper.assert(files[XLSX].toString().match(/<oneCellAnchor>/g).length, 1);
        renderPackage(XLSX, _body, { img : 'data:image/png;base64,AAAA' }, function (err) {
          assert.ok(/Cannot load the image/.test(err.message));
          done();
        });
      });
    });
  });

  describe('isPrivateAddress', function () {
    it('should detect private, local and reserved addresses', function () {
      ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', 'not-an-ip'].forEach(function (ip) {
        helper.assert(ip + ' ' + download.isPrivateAddress(ip), ip + ' true');
      });
    });
    it('should accept public addresses', function () {
      ['8.8.8.8', '172.32.0.1', '172.15.255.255', '::ffff:8.8.8.8', '2606:4700::1111'].forEach(function (ip) {
        helper.assert(ip + ' ' + download.isPrivateAddress(ip), ip + ' false');
      });
    });
  });

  describe('download', function () {
    var _server = null;
    var _port = 0;
    var _png = buildPng(20, 10);
    before(function (done) {
      _server = http.createServer(function (req, res) {
        if (req.url === '/ok.png') {
          res.writeHead(200, { 'Content-Type' : 'image/png' });
          return res.end(_png);
        }
        if (req.url === '/redirect') {
          res.writeHead(302, { Location : '/ok.png' });
          return res.end();
        }
        if (req.url === '/loop') {
          res.writeHead(302, { Location : '/loop' });
          return res.end();
        }
        if (req.url === '/big') {
          res.writeHead(200);
          return res.end(Buffer.alloc(5000));
        }
        if (req.url === '/slow') {
          return; // never answers
        }
        res.writeHead(404);
        return res.end();
      });
      _server.listen(0, '127.0.0.1', function () {
        _port = _server.address().port;
        done();
      });
    });
    after(function (done) {
      _server.closeAllConnections();
      _server.close(done);
    });

    it('should refuse private addresses by default (SSRF protection)', function (done) {
      download.download('http://127.0.0.1:' + _port + '/ok.png', function (err) {
        assert.ok(/private or local/.test(err.message));
        download.download('http://localhost:' + _port + '/ok.png', function (err) {
          assert.ok(/private or local/.test(err.message));
          download.download('http://[::1]:' + _port + '/ok.png', function (err) {
            assert.ok(/private or local/.test(err.message));
            done();
          });
        });
      });
    });
    it('should download a file if private addresses are allowed, and follow redirections', function (done) {
      params.imageAllowPrivateNetwork = true;
      download.download('http://127.0.0.1:' + _port + '/ok.png', function (err, buffer) {
        helper.assert(err, null);
        helper.assert(buffer.equals(_png), true);
        download.download('http://127.0.0.1:' + _port + '/redirect', function (err, buffer) {
          helper.assert(err, null);
          helper.assert(buffer.equals(_png), true);
          done();
        });
      });
    });
    it('should refuse the metadata address of cloud providers, and too many redirections', function (done) {
      params.imageAllowPrivateNetwork = false;
      download.download('http://169.254.169.254/latest', function (err) {
        assert.ok(/private or local/.test(err.message));
        params.imageAllowPrivateNetwork = true;
        download.download('http://127.0.0.1:' + _port + '/loop', function (err) {
          assert.ok(/too many redirections/.test(err.message));
          done();
        });
      });
    });
    it('should return an error for a bad status, a big file, a timeout, a bad URL and other protocols', function (done) {
      params.imageAllowPrivateNetwork = true;
      params.imageMaxSize = 1000;
      params.imageDownloadTimeout = 300;
      download.download('http://127.0.0.1:' + _port + '/nope', function (err) {
        assert.ok(/HTTP status 404/.test(err.message));
        download.download('http://127.0.0.1:' + _port + '/big', function (err) {
          assert.ok(/too big/.test(err.message));
          download.download('http://127.0.0.1:' + _port + '/slow', function (err) {
            assert.ok(/timeout/.test(err.message));
            download.download('not a url', function (err) {
              assert.ok(/invalid URL/.test(err.message));
              download.download('file:///etc/passwd', function (err) {
                assert.ok(/only http and https/.test(err.message));
                done();
              });
            });
          });
        });
      });
    });
  });

  describe('loadImage', function () {
    it('should load a base64 data URI, whatever the declared type, and ignore white spaces', function (done) {
      var _png = buildPng(20, 10);
      var _b64 = _png.toString('base64');
      image.loadImage('data:image/png;base64,' + _b64.slice(0, 10) + '\n ' + _b64.slice(10), function (err, loaded) {
        helper.assert(err, null);
        helper.assert([loaded.type, loaded.width, loaded.height], ['png', 20, 10]);
        image.loadImage('data:;base64,' + _b64, function (err, loaded) {
          helper.assert(err, null);
          helper.assert(loaded.type, 'png');
          done();
        });
      });
    });
    it('should return clear errors', function (done) {
      image.loadImage('data:image/png;base64,AAAA', function (err) {
        assert.ok(/unsupported or invalid image/.test(err.message));
        image.loadImage('hello', function (err) {
          assert.ok(/base64 data URI or a public URL/.test(err.message));
          image.loadImage('data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64'), function (err) {
            assert.ok(/Supported formats: png, jpeg, gif/.test(err.message));
            done();
          });
        });
      });
    });
    it('should not print a huge value in error messages', function (done) {
      image.loadImage('data:image/png;base64,' + 'A'.repeat(5000), function (err) {
        assert.ok(err.message.length < 300);
        done();
      });
    });
  });

  describe('render a docx with dynamic images', function () {
    it('should replace a picture, add the media, the relationship and the content type', function (done) {
      var _png = buildPng(160, 80);
      renderDocx('<w:p>' + picture(1, '{d.img}') + '</w:p>', { img : toUri(_png) }, function (err, files) {
        helper.assert(err, null);
        var _media = Object.keys(files).filter(function (name) {
          return /^word\/media\/carbone_/.test(name);
        });
        helper.assert(_media.length, 1);
        helper.assert(files[_media[0]].equals(_png), true);
        var _relId = /r:embed="(rIdCarbone\w+)"/.exec(files['word/document.xml'])[1];
        assert.ok(files['word/_rels/document.xml.rels'].toString().indexOf('Id="' + _relId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + _media[0].replace('word/', '') + '"') !== -1);
        assert.ok(files['word/_rels/document.xml.rels'].toString().indexOf('Id="rId5"') !== -1); // placeholder relation is kept
        assert.ok(files['word/document.xml'].toString().indexOf('CARBONE_IMG') === -1);
        assert.ok(files['word/document.xml'].toString().indexOf('descr=""') !== -1);
        done();
      });
    });
    it('should add the content type of jpeg and gif', function (done) {
      renderDocx('<w:p>' + picture(1, '{d.a}') + picture(2, '{d.b}') + '</w:p>', { a : toUri(buildJpeg(128, 64), 'jpeg'), b : toUri(buildGif(30, 20), 'gif') }, function (err, files) {
        helper.assert(err, null);
        var _types = files['[Content_Types].xml'].toString();
        assert.ok(/<Default Extension="jpg" ContentType="image\/jpeg"\/>/.test(_types));
        assert.ok(/<Default Extension="gif" ContentType="image\/gif"\/>/.test(_types));
        assert.ok(/<Default Extension="png" ContentType="image\/png"\/>/.test(_types));
        helper.assert(_types.match(/Extension="png"/g).length, 1);
        done();
      });
    });
    it('should resize the picture according to imageFit', function (done) {
      var _data = { img : toUri(buildPng(60, 120)) };
      var _body = '<w:p>' + picture(1, '{d.img}') + picture(2, '{d.img:imageFit(fillWidth)}') + picture(3, '{d.img:imageFit(fill)}') + '</w:p>';
      renderDocx(_body, _data, function (err, files) {
        helper.assert(err, null);
        var _extents = files['word/document.xml'].toString().match(/<wp:extent cx="\d+" cy="\d+"\/>/g);
        helper.assert(_extents, ['<wp:extent cx="450000" cy="900000"/>', '<wp:extent cx="1800000" cy="3600000"/>', '<wp:extent cx="1800000" cy="900000"/>']);
        var _xfrm = files['word/document.xml'].toString().match(/<a:ext cx="\d+" cy="\d+"\/>/g);
        helper.assert(_xfrm, ['<a:ext cx="450000" cy="900000"/>', '<a:ext cx="1800000" cy="3600000"/>', '<a:ext cx="1800000" cy="900000"/>']);
        done();
      });
    });
    it('should store an identical image only once', function (done) {
      var _uri = toUri(buildPng(20, 20));
      renderDocx('<w:p>' + picture(1, '{d.a}') + picture(2, '{d.b}') + '</w:p>', { a : _uri, b : _uri }, function (err, files) {
        helper.assert(err, null);
        helper.assert(Object.keys(files).filter(function (n) { return /^word\/media\/carbone_/.test(n); }).length, 1);
        helper.assert(files['word/_rels/document.xml.rels'].toString().match(/rIdCarbone/g).length, 1);
        done();
      });
    });
    it('should remove the picture if the value is empty or missing', function (done) {
      renderDocx('<w:p><w:r><w:t>a</w:t></w:r>' + picture(1, '{d.missing}') + picture(2, '{d.empty}') + '</w:p>', { empty : '' }, function (err, files) {
        helper.assert(err, null);
        helper.assert(files['word/document.xml'].toString(), '<w:document><w:body><w:p><w:r><w:t>a</w:t></w:r><w:r></w:r><w:r></w:r></w:p></w:body></w:document>');
        done();
      });
    });
    it('should print different pictures in a loop', function (done) {
      var _body = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>{d.items[i].n}</w:t></w:r>' + picture(1, '{d.items[i].img}') + '</w:p></w:tc></w:tr>'
        + '<w:tr><w:tc><w:p><w:r><w:t>{d.items[i+1].n}</w:t></w:r>' + picture(2, '{d.items[i+1].img}') + '</w:p></w:tc></w:tr></w:tbl>';
      var _data = { items : [{ n : 'a', img : toUri(buildPng(20, 20)) }, { n : 'b', img : toUri(buildPng(30, 20)) }, { n : 'c', img : toUri(buildPng(20, 20)) }, { n : 'd' }] };
      renderDocx(_body, _data, function (err, files) {
        helper.assert(err, null);
        var _xml = files['word/document.xml'].toString();
        helper.assert(_xml.match(/<w:drawing>/g).length, 3); // the 4th picture has no image
        var _ids = _xml.match(/r:embed="(rIdCarbone\w+)"/g);
        helper.assert(_ids.length, 3);
        helper.assert(_ids[0], _ids[2]);
        assert.notStrictEqual(_ids[0], _ids[1]);
        helper.assert(Object.keys(files).filter(function (n) { return /^word\/media\/carbone_/.test(n); }).length, 2);
        done();
      });
    });
    it('should use a conditional value, with show/elseShow', function (done) {
      var _uri = toUri(buildPng(20, 20));
      renderDocx('<w:p>' + picture(1, '{d.ok:ifEQ(true):show(d.img):elseShow(\'\')}') + '</w:p>', { ok : false, img : _uri }, function (err, files) {
        helper.assert(err, null);
        assert.ok(files['word/document.xml'].toString().indexOf('<w:drawing>') === -1);
        done();
      });
    });
    it('should return an error if an image is invalid', function (done) {
      renderDocx('<w:p>' + picture(1, '{d.img}') + '</w:p>', { img : 'data:image/png;base64,AAAA' }, function (err) {
        assert.ok(/Cannot load the image/.test(err.message));
        renderDocx('<w:p>' + picture(1, '{d.img}') + '</w:p>', { img : 'just some text' }, function (err) {
          assert.ok(/base64 data URI or a public URL/.test(err.message));
          done();
        });
      });
    });
    it('should download an image from a URL, with the option of private networks (local server)', function (done) {
      var _png = buildPng(40, 20);
      var _server = http.createServer(function (req, res) {
        res.writeHead(200);
        res.end(_png);
      });
      _server.listen(0, '127.0.0.1', function () {
        params.imageAllowPrivateNetwork = true;
        renderDocx('<w:p>' + picture(1, '{d.img:imageFit(fillWidth)}') + '</w:p>', { img : 'http://127.0.0.1:' + _server.address().port + '/logo.png' }, function (err, files) {
          _server.close();
          helper.assert(err, null);
          var _media = Object.keys(files).filter(function (n) { return /^word\/media\/carbone_/.test(n); });
          helper.assert(_media.length, 1);
          helper.assert(files[_media[0]].equals(_png), true);
          helper.assert(files['word/document.xml'].toString().match(/<wp:extent cx="\d+" cy="\d+"\/>/)[0], '<wp:extent cx="1800000" cy="900000"/>');
          done();
        });
      });
    });
    it('should refuse a URL pointing to a private address', function (done) {
      renderDocx('<w:p>' + picture(1, '{d.img}') + '</w:p>', { img : 'http://169.254.169.254/latest/meta-data' }, function (err) {
        assert.ok(/private or local/.test(err.message));
        done();
      });
    });
    it('should not change documents without dynamic images', function (done) {
      renderDocx('<w:p>' + picture(1, 'Company logo') + '</w:p>', {}, function (err, files) {
        helper.assert(err, null);
        assert.ok(files['word/document.xml'].toString().indexOf('descr="Company logo"') !== -1);
        helper.assert(Object.keys(files).filter(function (n) { return /^word\/media\/carbone_/.test(n); }), []);
        done();
      });
    });
  });
});
