/**
 * Native charts (DOCX, PPTX, XLSX: `charts/chart*.xml`).
 *
 * A chart stores its data in caches (`c:strCache`, `c:numCache`): a list of `c:pt` with an index. Markers and loops can be written in the values of
 * the points like in any other part of the template, the data are injected by the builder. After that, this module repairs the structure of the chart:
 * indexes of points, number of points (`c:ptCount`), ranges of cells (`c:f`), and it removes points of numbers which are not numbers.
 * The embedded workbook of a chart which contains markers is not updated (`c:externalData` is removed), so the editor does not restore the data of the template.
 */

const CHART_FILE_REGEX = /(^|\/)charts\/chart[^/]*\.xml$/;
const REF_REGEX = /(<c:(?:strRef|numRef)\b[^>]*>\s*<c:f>)([^<]*)(<\/c:f>)(\s*)(<c:(?:strCache|numCache)\b[^>]*>[\s\S]*?<\/c:(?:strCache|numCache)>)/g;

function isChartFile (name) {
  return typeof name === 'string' && CHART_FILE_REGEX.test(name);
}

function columnToNumber (letters) {
  var _number = 0;
  for (var i = 0; i < letters.length; i++) {
    _number = _number * 26 + (letters.charCodeAt(i) - 64);
  }
  return _number;
}

function numberToColumn (number) {
  var _letters = '';
  while (number > 0) {
    var _mod = (number - 1) % 26;
    _letters = String.fromCharCode(65 + _mod) + _letters;
    number = Math.floor((number - 1) / 26);
  }
  return _letters;
}

/**
 * Change the size of a range `Sheet1!$A$2:$A$3` to contain `count` cells. The direction (column or row) is kept.
 * Ranges which are not a simple line of cells (or `count` = 0) are not modified.
 */
function resizeRange (formula, count) {
  var _match = /^(.*!)?\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)$/.exec(formula.trim());
  if (_match === null || count < 1) {
    return formula;
  }
  var _prefix = _match[1] || '';
  var _col1 = columnToNumber(_match[2]);
  var _row1 = parseInt(_match[3], 10);
  var _col2 = columnToNumber(_match[4]);
  var _row2 = parseInt(_match[5], 10);
  if (_col1 === _col2) {
    return _prefix + '$' + _match[2] + '$' + _row1 + ':$' + _match[2] + '$' + (_row1 + count - 1);
  }
  if (_row1 === _row2) {
    return _prefix + '$' + _match[2] + '$' + _row1 + ':$' + numberToColumn(_col1 + count - 1) + '$' + _row1;
  }
  return formula;
}

/**
 * Renumber the points of a cache. The points of a numeric cache which are not numbers are removed (they are gaps in the chart)
 *
 * @return {Object} { xml, count }
 */
function fixCache (xml, kind) {
  var _count = 0;
  var _result = xml.replace(/(<c:(?:strCache|numCache)\b[^>]*>)([\s\S]*?)(<\/c:(?:strCache|numCache)>)/, function (all, open, inner, close) {
    var _header = '';
    var _formatCode = /<c:formatCode>[\s\S]*?<\/c:formatCode>/.exec(inner);
    if (_formatCode !== null) {
      _header = _formatCode[0];
    }
    var _points = [];
    var _pointRegex = /<c:pt\b[^>]*>([\s\S]*?)<\/c:pt>/g;
    var _found;
    while ((_found = _pointRegex.exec(inner)) !== null) {
      _points.push(_found[1]);
    }
    var _rest = inner.replace(/<c:formatCode>[\s\S]*?<\/c:formatCode>/, '').replace(/<c:ptCount\b[^>]*\/>/, '').replace(/<c:pt\b[^>]*>[\s\S]*?<\/c:pt>/g, '');
    _count = _points.length;
    var _body = '';
    _points.forEach(function (point, index) {
      if (kind === 'numCache') {
        var _value = />([^<]*)<\/c:v>/.exec(point);
        var _text = _value === null ? '' : _value[1].trim();
        if (_text === '' || /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(_text) === false) {
          return;
        }
      }
      _body += '<c:pt idx="' + index + '">' + point + '</c:pt>';
    });
    return open + _header + '<c:ptCount val="' + _count + '"/>' + _body + _rest + close;
  });
  return { xml : _result, count : _count };
}

var chart = {

  isChartFile,
  resizeRange,

  /**
   * Remember charts which contain markers
   *
   * @param {Object} template  template with `files`
   * @param {Object} options   options of the report: `dynamicCharts` is created
   */
  detectDynamicCharts : function (template, options) {
    if (!template || !(template.files instanceof Array) || !options) {
      return;
    }
    template.files.forEach(function (file) {
      if (isChartFile(file.name) && typeof file.data === 'string' && /\{[dc]\.[^}]*\}/.test(file.data)) {
        options.dynamicCharts = options.dynamicCharts || [];
        options.dynamicCharts.push(file.name);
      }
    });
  },

  /**
   * Repair the charts which contained markers, after data injection
   *
   * @param {Object} report   report: { files : [{ name, data }] }
   * @param {Object} options  options of the report, with `dynamicCharts`
   */
  resolveCharts : function (report, options) {
    if (!options || !(options.dynamicCharts instanceof Array) || !report || !(report.files instanceof Array)) {
      return;
    }
    report.files.forEach(function (file) {
      if (typeof file.data !== 'string' || options.dynamicCharts.indexOf(file.name) === -1) {
        return;
      }
      file.data = file.data.replace(REF_REGEX, function (all, before, formula, afterFormula, space, cache) {
        var _kind = /^<c:numCache/.test(cache) ? 'numCache' : 'strCache';
        var _fixed = fixCache(cache, _kind);
        return before + resizeRange(formula, _fixed.count) + afterFormula + space + _fixed.xml;
      });
      file.data = file.data.replace(/<c:externalData\b[^>]*>[\s\S]*?<\/c:externalData>|<c:externalData\b[^>]*\/>/g, '');
    });
  }
};

module.exports = chart;
