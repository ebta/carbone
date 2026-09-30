var aggregate = require('../formatters/aggregate');
var carbone = require('../lib');
var helper = require('../lib/helper');

describe('aggregators and cumulative formatters', function () {

  describe('_pluck', function () {
    it('should extract an attribute of each item, and keep undefined for missing attributes', function () {
      helper.assert(aggregate._pluck([{ p : 1 }, { p : 2 }, {}], 'p'), [1, 2, null]);
      helper.assert(aggregate._pluck([{ a : { b : 3 } }, { a : { b : 4 } }], 'a.b'), [3, 4]);
    });
    it('should return items if there is no path', function () {
      helper.assert(aggregate._pluck([1, 2]), [1, 2]);
      helper.assert(aggregate._pluck([1, 2], ''), [1, 2]);
    });
    it('should flatten nested arrays', function () {
      var _data = [{ w : [{ s : 1 }, { s : 2 }] }, { w : [{ s : 5 }] }, {}];
      helper.assert(aggregate._pluck(_data, 'w[].s'), [1, 2, 5]);
    });
    it('should return an empty array if the input is not an array', function () {
      helper.assert(aggregate._pluck(undefined, 'p'), []);
      helper.assert(aggregate._pluck(null, 'p'), []);
      helper.assert(aggregate._pluck({ p : 1 }, 'p'), []);
    });
    it('should not read inherited attributes (prototype pollution)', function () {
      helper.assert(aggregate._pluck([{}], '__proto__'), [null]);
      helper.assert(aggregate._pluck([{}], 'constructor.name'), [null]);
      helper.assert(aggregate._pluck([{}], 'toString'), [null]);
    });
  });

  describe('aggSum', function () {
    it('should sum numbers and ignore other values', function () {
      helper.assert(aggregate.aggSum([10, 20.5, 5]), 35.5);
      helper.assert(aggregate.aggSum([10, null, undefined, 'abc', '5', true, {}]), 15);
      helper.assert(aggregate.aggSum([]), 0);
    });
    it('should return the value if it is not an array', function () {
      helper.assert(aggregate.aggSum(12), 12);
      helper.assert(aggregate.aggSum(null), null);
      helper.assert(aggregate.aggSum(undefined), undefined);
    });
  });

  describe('aggAvg, aggMin, aggMax', function () {
    it('should compute the average', function () {
      helper.assert(aggregate.aggAvg([10, 20, 30]), 20);
      helper.assert(aggregate.aggAvg([10, null, '20', 'abc']), 15);
      helper.assert(aggregate.aggAvg([]), null);
      helper.assert(aggregate.aggAvg(['abc']), null);
    });
    it('should find the minimum', function () {
      helper.assert(aggregate.aggMin([10, 3, 20]), 3);
      helper.assert(aggregate.aggMin([-5, null, 'abc', '2']), -5);
      helper.assert(aggregate.aggMin([]), null);
    });
    it('should find the maximum', function () {
      helper.assert(aggregate.aggMax([10, 3, 20]), 20);
      helper.assert(aggregate.aggMax([-5, null, 'abc', '2']), 2);
      helper.assert(aggregate.aggMax([-5, -3]), -3);
      helper.assert(aggregate.aggMax([]), null);
    });
    it('should return the value if it is not an array', function () {
      helper.assert(aggregate.aggAvg(3), 3);
      helper.assert(aggregate.aggMin('a'), 'a');
      helper.assert(aggregate.aggMax(null), null);
    });
  });

  describe('aggCount, aggCountD', function () {
    it('should count items', function () {
      helper.assert(aggregate.aggCount([10, 3, null]), 3);
      helper.assert(aggregate.aggCount([]), 0);
      helper.assert(aggregate.aggCount('abc'), 'abc');
    });
    it('should count distinct values, ignoring null and undefined, and considering 1 and "1" as different', function () {
      helper.assert(aggregate.aggCountD(['a', 'b', 'a']), 2);
      helper.assert(aggregate.aggCountD([1, '1', 1, null, undefined]), 2);
      helper.assert(aggregate.aggCountD([{ a : 1 }, { a : 1 }, { a : 2 }]), 2);
      helper.assert(aggregate.aggCountD([]), 0);
      helper.assert(aggregate.aggCountD(undefined), undefined);
    });
  });

  describe('aggStr, aggStrD', function () {
    it('should join values', function () {
      helper.assert(aggregate.aggStr(['homer', 'bart', null, 'lisa']), 'homer, bart, lisa');
      helper.assert(aggregate.aggStr(['homer', 'bart'], ' / '), 'homer / bart');
      helper.assert(aggregate.aggStr(['a', 'b'], '\\n'), 'a\nb');
      helper.assert(aggregate.aggStr(['a', 'b'], '\\r\\n'), 'a\r\nb');
      helper.assert(aggregate.aggStr([]), '');
      helper.assert(aggregate.aggStr(null), null);
    });
    it('should join distinct values', function () {
      helper.assert(aggregate.aggStrD(['homer', 'bart', 'homer']), 'homer, bart');
      helper.assert(aggregate.aggStrD(['homer', 'bart', 'homer'], ' / '), 'homer / bart');
      helper.assert(aggregate.aggStrD(undefined), undefined);
    });
  });

  describe('cumSum, cumCountD', function () {
    it('cumSum should accumulate row after row, with one state for each id', function () {
      var _ctx = {};
      helper.assert(aggregate.cumSum.call(_ctx, 10, 'a'), 10);
      helper.assert(aggregate.cumSum.call(_ctx, 5, 'b'), 5);
      helper.assert(aggregate.cumSum.call(_ctx, '20.5', 'a'), 30.5);
      helper.assert(aggregate.cumSum.call(_ctx, 'abc', 'a'), 30.5);
      helper.assert(aggregate.cumSum.call(_ctx, null, 'a'), 30.5);
      helper.assert(aggregate.cumSum.call(_ctx, 1, 'b'), 6);
    });
    it('cumSum and cumCountD should ignore hidden rows', function () {
      var _ctx = { isRowShown : true };
      helper.assert(aggregate.cumSum.call(_ctx, 10, 'a'), 10);
      _ctx.isRowShown = false;
      helper.assert(aggregate.cumSum.call(_ctx, 100, 'a'), 10);
      helper.assert(aggregate.cumCountD.call(_ctx, 'x', 'b'), 0);
      _ctx.isRowShown = true;
      helper.assert(aggregate.cumSum.call(_ctx, 5, 'a'), 15);
      helper.assert(aggregate.cumCountD.call(_ctx, 'x', 'b'), 1);
    });
    it('cumCountD should count distinct values', function () {
      var _ctx = {};
      helper.assert(aggregate.cumCountD.call(_ctx, 'a', 'id'), 1);
      helper.assert(aggregate.cumCountD.call(_ctx, 'b', 'id'), 2);
      helper.assert(aggregate.cumCountD.call(_ctx, 'a', 'id'), 2);
      helper.assert(aggregate.cumCountD.call(_ctx, null, 'id'), 2);
      helper.assert(aggregate.cumCountD.call(_ctx, 'c', 'id'), 3);
    });
  });

  describe('in templates', function () {
    var _data = {
      items : [{ price : 10, q : 1, t : 'a' }, { price : 20.5, q : 2, t : 'b' }, { price : 5, q : 3, t : 'a' }, { price : 99, q : 4, t : 'c' }],
      cars  : [{ n : 'a', wheels : [{ s : 1 }, { s : 2 }] }, { n : 'b', wheels : [{ s : 5 }] }],
      names : ['homer', 'bart', 'lisa']
    };
    function render (xml, expected, done, options, data) {
      carbone.renderXML(xml, data || _data, options || { lang : 'en' }, function (err, result) {
        helper.assert(err+'', 'null');
        helper.assert(result, expected);
        done();
      });
    }
    it('should aggregate an array with empty brackets', function (done) {
      render('<xml>{d.items[].price:aggSum}|{d.items[].price:aggAvg}|{d.items[].price:aggMin}|{d.items[].price:aggMax}|{d.items[]:aggCount}|{d.items[].t:aggCountD}|{d.items[].t:aggStr(\' / \')}|{d.items[].t:aggStrD}</xml>',
        '<xml>134.5|33.625|5|99|4|3|a / b / a / c|a, b, c</xml>', done);
    });
    it('should chain aggregators with other formatters', function (done) {
      render('<xml>{d.items[].price:aggSum:formatN(2)}|{d.items[].price:aggSum:ifGT(30):show(\'big\')}</xml>', '<xml>134.50|big</xml>', done);
    });
    it('should aggregate an array of values', function (done) {
      render('<xml>{d.names[]:aggStr(\'-\')}|{d.names[]:aggCount}</xml>', '<xml>homer-bart-lisa|3</xml>', done);
    });
    it('should aggregate nested arrays inside a loop, and flatten arrays', function (done) {
      render('<xml><r>{d.cars[i].n}:{d.cars[i].wheels[].s:aggSum}:{d.cars[i].wheels[]:aggCount}</r><r>{d.cars[i+1].n}</r></xml>',
        '<xml><r>a:3:2</r><r>b:5:1</r></xml>', function () {
          render('<xml>{d.cars[].wheels[].s:aggSum}</xml>', '<xml>8</xml>', done);
        });
    });
    it('should aggregate a missing array without crashing', function (done) {
      render('<xml>{d.nope[].x:aggSum}|{d.nope[].x:aggAvg}|{d.nope[].x:aggCount}</xml>', '<xml>0||0</xml>', done);
    });
    it('should print a total next to a loop on the same array', function (done) {
      render('<xml><r>{d.items[i].price}</r><r>{d.items[i+1].price}</r>T={d.items[].price:aggSum}</xml>', '<xml><r>10</r><r>20.5</r><r>5</r><r>99</r>T=134.5</xml>', done);
    });
    it('should accumulate values with cumSum', function (done) {
      render('<xml><r>{d.items[i].price:cumSum}</r><r>{d.items[i+1].price}</r></xml>', '<xml><r>10</r><r>30.5</r><r>35.5</r><r>134.5</r></xml>', done);
    });
    it('should accept other formatters after cumSum', function (done) {
      render('<xml><r>{d.items[i].price:cumSum:formatN(1)}</r><r>{d.items[i+1].price}</r></xml>', '<xml><r>10.0</r><r>30.5</r><r>35.5</r><r>134.5</r></xml>'.replace(/<r>(\d+\.?\d*)<\/r>/g, function (m, n) {
        return '<r>' + parseFloat(n).toFixed(1) + '</r>';
      }), done);
    });
    it('should not accumulate rows which are filtered', function (done) {
      render('<xml><r>{d.items[i, price>5].price:cumSum}</r><r>{d.items[i+1, price>5].price}</r></xml>', '<xml><r>10</r><r>30.5</r><r>129.5</r></xml>', done);
    });
    it('should have an independent state for each cumulative marker', function (done) {
      render('<xml><r>{d.items[i].price:cumSum}/{d.items[i].q:cumSum}</r><r>{d.items[i+1].price}</r></xml>', '<xml><r>10/1</r><r>30.5/3</r><r>35.5/6</r><r>134.5/10</r></xml>', done);
    });
    it('should reset cumulative values for each render', function (done) {
      var _xml = '<xml><r>{d.items[i].price:cumSum}</r><r>{d.items[i+1].price}</r></xml>';
      render(_xml, '<xml><r>10</r><r>30.5</r><r>35.5</r><r>134.5</r></xml>', function () {
        render(_xml, '<xml><r>10</r><r>30.5</r><r>35.5</r><r>134.5</r></xml>', done);
      });
    });
    it('should count distinct values row after row with cumCountD', function (done) {
      render('<xml><r>{d.items[i].t:cumCountD}</r><r>{d.items[i+1].t}</r></xml>', '<xml><r>1</r><r>2</r><r>2</r><r>3</r></xml>', done);
    });
    it('cumCount should be the same as count', function (done) {
      render('<xml><r>{d.items[i].price:cumCount}</r><r>{d.items[i+1].price}</r></xml>', '<xml><r>1</r><r>2</r><r>3</r><r>4</r></xml>', done);
    });
    it('should use arrayJoin with index and count', function (done) {
      render('<xml>{d.names:arrayJoin(\'-\', 1)}|{d.names:arrayJoin(\'-\', 1, 1)}|{d.names:arrayJoin(\'-\', -2)}|{d.names:arrayJoin(\'-\', 0, 2)}</xml>', '<xml>bart-lisa|bart|bart-lisa|homer-bart</xml>', done);
    });
  });
});
