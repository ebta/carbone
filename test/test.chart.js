var assert = require('assert');
var carbone = require('../lib');
var chart = require('../lib/chart');
var helper = require('../lib/helper');
var file = require('../lib/file');

function chartXml (categoryA, categoryB, valueA, valueB) {
  return '<?xml version="1.0"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart><c:plotArea><c:barChart><c:ser>'
    + '<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>' + categoryA + '</c:v></c:pt><c:pt idx="1"><c:v>' + categoryB + '</c:v></c:pt></c:strCache></c:strRef></c:cat>'
    + '<c:val><c:numRef><c:f>Sheet1!$B$2:$B$3</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>' + valueA + '</c:v></c:pt><c:pt idx="1"><c:v>' + valueB + '</c:v></c:pt></c:numCache></c:numRef></c:val>'
    + '</c:ser></c:barChart></c:plotArea></c:chart><c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>';
}

function template (xml) {
  return {
    isZipped   : true,
    filename   : 'doc.docx',
    embeddings : [],
    files      : [
      { name : '[Content_Types].xml', isMarked : true, parent : '', data : '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
      { name : '_rels/.rels', isMarked : true, parent : '', data : '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name : 'word/document.xml', isMarked : true, parent : '', data : '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>' },
      { name : 'word/charts/chart1.xml', isMarked : true, parent : '', data : xml }
    ]
  };
}

function renderChart (xml, data, callback) {
  carbone.render(template(xml), data, {}, function (err, result) {
    helper.assert(err, null);
    file.unzip(result, function (errUnzip, files) {
      helper.assert(errUnzip, null);
      callback(files.filter(function (f) { return f.name === 'word/charts/chart1.xml'; })[0].data.toString());
    });
  });
}

describe('charts', function () {

  describe('resizeRange', function () {
    it('should resize ranges in a column or a row, and keep other ranges', function () {
      helper.assert(chart.resizeRange('Sheet1!$A$2:$A$3', 5), 'Sheet1!$A$2:$A$6');
      helper.assert(chart.resizeRange('Sheet1!$B$1:$D$1', 2), 'Sheet1!$B$1:$C$1');
      helper.assert(chart.resizeRange('Sheet1!$Z$1:$AB$1', 4), 'Sheet1!$Z$1:$AC$1');
      helper.assert(chart.resizeRange('Sheet1!$A$1:$B$3', 5), 'Sheet1!$A$1:$B$3');
      helper.assert(chart.resizeRange('Sheet1!$A$2:$A$3', 0), 'Sheet1!$A$2:$A$3');
      helper.assert(chart.resizeRange('Sheet1!$B$1', 3), 'Sheet1!$B$1');
    });
  });

  describe('render', function () {
    it('should repeat the points of a chart with a loop, renumber them and resize the ranges', function (done) {
      var _data = { items : [{ n : 'Jan', v : 10 }, { n : 'Feb', v : 25 }, { n : 'Mar', v : 15 }] };
      renderChart(chartXml('{d.items[i].n}', '{d.items[i+1].n}', '{d.items[i].v}', '{d.items[i+1].v}'), _data, function (_xml) {
        assert.ok(_xml.indexOf('<c:ptCount val="3"/><c:pt idx="0"><c:v>Jan</c:v></c:pt><c:pt idx="1"><c:v>Feb</c:v></c:pt><c:pt idx="2"><c:v>Mar</c:v></c:pt>') !== -1, _xml);
        assert.ok(_xml.indexOf('<c:formatCode>General</c:formatCode><c:ptCount val="3"/><c:pt idx="0"><c:v>10</c:v></c:pt><c:pt idx="1"><c:v>25</c:v></c:pt><c:pt idx="2"><c:v>15</c:v></c:pt>') !== -1, _xml);
        assert.ok(_xml.indexOf('Sheet1!$A$2:$A$4') !== -1 && _xml.indexOf('Sheet1!$B$2:$B$4') !== -1);
        assert.ok(_xml.indexOf('externalData') === -1);
        done();
      });
    });
    it('should remove points of a numeric cache which are not numbers, and keep the index of the others', function (done) {
      var _data = { items : [{ n : 'a', v : 1 }, { n : 'b', v : null }, { n : 'c', v : 3 }] };
      renderChart(chartXml('{d.items[i].n}', '{d.items[i+1].n}', '{d.items[i].v}', '{d.items[i+1].v}'), _data, function (_xml) {
        assert.ok(_xml.indexOf('<c:ptCount val="3"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="2"><c:v>3</c:v></c:pt>') !== -1, _xml);
        done();
      });
    });
    it('should not modify a chart without marker', function (done) {
      var _static = chartXml('a', 'b', '1', '2');
      renderChart(_static, {}, function (_xml) {
        helper.assert(_xml, _static);
        done();
      });
    });
  });
});
