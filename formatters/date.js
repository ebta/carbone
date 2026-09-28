var dayjs = require('dayjs');

// plugins needed by diffD and formatI. Extending twice is harmless, dayjs ignores plugins already installed
dayjs.extend(require('dayjs/plugin/duration'));
dayjs.extend(require('dayjs/plugin/relativeTime'));


/**
 * Format dates. It takes an output date pattern as an argument. Date patterns are available on [this section](#date-formats).
 * It is possible to change the timezone through the option `options.timezone` and the lang through `options.lang`.
 * List of timezones: [https://en.wikipedia.org/wiki/List_of_tz_database_time_zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).
 *
 * @version 3.0.0 updated
 *
 * @exampleContext {"lang":"en", "timezone":"Europe/Paris"}
 * @example ["20160131", "L"]
 * @example ["20160131", "LL"]
 * @example ["20160131", "LLLL"]
 * @example ["20160131", "dddd"]
 *
 * @exampleContext {"lang":"fr", "timezone":"Europe/Paris"}
 * @example ["2017-05-10T15:57:23.769561+03:00", "LLLL"]
 * @example ["2017-05-10 15:57:23.769561+03:00", "LLLL"]
 * @example ["20160131", "LLLL"]
 * @example ["20160131", "dddd"]
 *
 * @exampleContext {"lang":"fr", "timezone":"Europe/Paris"}
 * @example ["20160131", "dddd", "YYYYMMDD"]
 * @example [1410715640, "LLLL", "X" ]
 *
 * @exampleContext {"lang":"fr", "timezone": "Asia/Singapore"}
 * @example ["20160131", "dddd", "YYYYMMDD"]
 * @example [1410715640, "LLLL", "X" ]
 *
 * @param  {String|Number} d   date to format
 * @param  {String} patternOut output format
 * @param  {String} patternIn  [optional] input format, "ISO 8601" by default
 * @return {String}            return formatted date
 */
function formatD (d, patternOut, patternIn) {
  if (d !== null && typeof d !== 'undefined') {
    return parse(d, patternIn).tz(this.timezone).locale(this.lang).format(patternOut);
  }
  return d;
}

/**
 *
 * Add a time to a date. Available units: day, week,	month, quarter, year, hour, minute, second and millisecond.
 * Units are case insensitive, and support plural and short forms.
 *
 * @version 3.0.0 new
 *
 * @exampleContext {"lang":"fr", "timezone":"Europe/Paris"}
 * @example ["2017-05-10T15:57:23.769561+03:00", "3", "day"]
 * @example ["2017-05-10 15:57:23.769561+03:00", "3", "month"]
 * @example ["20160131", "3", "day"]
 * @example ["20160131", "3", "month"]
 * @example ["31-2016-01", "3", "month", "DD-YYYY-MM"]
 *
 * @param      {String|Number}  d   input date
 * @param      {Number}  amount     The amount
 * @param      {String}  unit       The unit
 * @param      {String}  patternIn  [optional] input format, ISO8601 by default
 * @return     {Date}               return a date, which can be formatted with formatD, or manipulated with other formatters
 */
function addD (d, amount, unit, patternIn) {
  if (d !== null && typeof d !== 'undefined') {
    return parse(d, patternIn).add(parseInt(amount, 10), unit || 'day');
  }
  return d;
}

/**
 *
 * Subtract a time to a date. Available units: day, week,	month, quarter, year, hour, minute, second and millisecond.
 * Units are case insensitive, and support plural and short forms.
 *
 * @version 3.0.0 new
 *
 * @exampleContext {"lang":"fr", "timezone":"Europe/Paris"}
 * @example ["2017-05-10T15:57:23.769561+03:00", "3", "day"]
 * @example ["2017-05-10 15:57:23.769561+03:00", "3", "month"]
 * @example ["20160131", "3", "day"]
 * @example ["20160131", "3", "month"]
 * @example ["31-2016-01", "3", "month", "DD-YYYY-MM"]
 *
 * @param      {String|Number}  d   input date
 * @param      {Number}  amount     The amount
 * @param      {String}  unit       The unit
 * @param      {String}  patternIn  [optional] input format, ISO8601 by default
 * @return     {Date}               return a date, which can be formatted with formatD, or manipulated with other formatters
 */
function subD (d, amount, unit, patternIn) {
  if (d !== null && typeof d !== 'undefined') {
    return parse(d, patternIn).subtract(parseInt(amount, 10), unit || 'day');
  }
  return d;
}

/**
 *
 * Create a date and set it to the start of a unit of time.
 *
 * @version 3.0.0 new
 *
 * @exampleContext {"lang":"fr", "timezone":"Europe/Paris"}
 * @example ["2017-05-10T15:57:23.769561+03:00", "day"]
 * @example ["2017-05-10 15:57:23.769561+03:00", "month"]
 * @example ["20160131", "day"]
 * @example ["20160131", "month"]
 * @example ["31-2016-01", "month", "DD-YYYY-MM"]
 *
 * @param      {String|Number}  d   input date
 * @param      {String}  unit       The unit
 * @param      {String}  patternIn  [optional] input format, ISO8601 by default
 * @return     {Date}               return a date, which can be formatted with formatD, or manipulated with other formatters
 */
function startOfD (d, unit, patternIn) {
  if (d !== null && typeof d !== 'undefined') {
    return parse(d, patternIn).startOf( unit || 'year');
  }
  return d;
}

/**
 *
 * Create a date and set it to the end of a unit of time.
 *
 * @version 3.0.0 new
 *
 * @exampleContext {"lang":"fr", "timezone":"Europe/Paris"}
 * @example ["2017-05-10T15:57:23.769561+03:00", "day"]
 * @example ["2017-05-10 15:57:23.769561+03:00", "month"]
 * @example ["20160131", "day"]
 * @example ["20160131", "month"]
 * @example ["31-2016-01", "month", "DD-YYYY-MM"]
 *
 * @param      {String|Number}  d   input date
 * @param      {String}  unit       The unit
 * @param      {String}  patternIn  [optional] input format, ISO8601 by default
 * @return     {Date}               return a date, which can be formatted with formatD, or manipulated with other formatters
 */
function endOfD (d, unit, patternIn) {
  if (d !== null && typeof d !== 'undefined') {
    return parse(d, patternIn).endOf(unit || 'year');
  }
  return d;
}


/**
 * Compute the difference between two dates, in the requested unit. The result is positive if `toDate` is after the date, negative otherwise.
 * `toDate` can be the string `now`, which is the current date of the report (`{c.now}`).
 * Available units: day, week, month, quarter, year, hour, minute, second and millisecond (default).
 * Units are case insensitive, and support plural and short forms. The result is truncated, not rounded.
 *
 * @version 3.5.7 new
 *
 * @exampleContext {"lang":"en", "timezone":"Europe/Paris"}
 * @example ["2020-01-01", "2020-01-31", "day"]
 * @example ["2020-01-31", "2020-01-01", "day"]
 * @example ["2020-01-01", "2021-03-01", "month"]
 * @example ["2020-01-01", "2020-01-01T12:00:00", "hour"]
 * @example ["01-2020-01", "31-2020-01", "day", "DD-YYYY-MM", "DD-YYYY-MM"]
 *
 * @param  {String|Number} d   start date
 * @param  {String|Number} toDate    end date, or "now"
 * @param  {String} unit       [optional] unit of the result, "millisecond" by default
 * @param  {String} patternFrom [optional] input format of the start date, ISO8601 by default
 * @param  {String} patternTo   [optional] input format of the end date, ISO8601 by default
 * @return {Number}            difference between the two dates
 */
function diffD (d, toDate, unit, patternFrom, patternTo) {
  if (d === null || typeof d === 'undefined' || toDate === null || typeof toDate === 'undefined') {
    return d;
  }
  var _from = parse(d, patternFrom);
  var _to   = null;
  if (toDate === 'now') {
    _to = dayjs((this && this.complement && this.complement.now) || undefined);
  }
  else {
    _to = parse(toDate, patternTo);
  }
  if (_from.isValid() === false || _to.isValid() === false) {
    return d;
  }
  // dayjs.diff truncates by default
  return _to.diff(_from, unit || 'millisecond');
}

/**
 * Format an interval or a duration. The value is a number, in milliseconds by default.
 * The output can be a unit (the value is converted, e.g. `minute`) or a human readable text (`human`, `human+`), translated in the `lang` of the report.
 * Available units: year, month, week, day, hour, minute, second and millisecond. Units are case insensitive, and support plural and short forms.
 *
 * @version 3.5.7 new
 *
 * @exampleContext {"lang":"en"}
 * @example [3600000, "second"]
 * @example [3600000, "minute"]
 * @example [3600000, "hour"]
 * @example [2, "hour", "day"]
 * @example [3600000, "human"]
 * @example [3600000, "human+"]
 * @example [-3600000, "human+"]
 *
 * @exampleContext {"lang":"fr"}
 * @example [3600000, "human"]
 * @example [172800000, "human+"]
 *
 * @param  {Number} d          interval or duration
 * @param  {String} patternOut output unit, or "human" or "human+" (with a suffix like "in an hour" or "an hour ago")
 * @param  {String} patternIn  [optional] unit of the input value, "millisecond" by default
 * @return {Number|String}     converted value, or a human readable text
 */
function formatI (d, patternOut, patternIn) {
  var _value = parseFloat(d);
  if (d === null || typeof d === 'undefined' || Number.isNaN(_value) === true || !patternOut) {
    return d;
  }
  var _duration = dayjs.duration(_value, patternIn || 'millisecond');
  var _lang = (this && this.lang) || 'en';
  switch (patternOut) {
    case 'human':
      return _duration.locale(_lang).humanize(false);
    case 'human+':
      return _duration.locale(_lang).humanize(true);
    default:
      // remove floating-point noise, e.g. 0.1 + 0.2
      return parseFloat(_duration.as(patternOut).toFixed(10));
  }
}

/**
 * Format dates
 *
 * @deprecated
 * @version 1.0.0 deprecated
 *
 * @exampleContext {"lang":"en", "timezone":"Europe/Paris"}
 * @example ["20160131", "YYYYMMDD", "L"]
 * @example ["20160131", "YYYYMMDD", "LL"]
 * @example ["20160131", "YYYYMMDD", "LLLL"]
 * @example ["20160131", "YYYYMMDD", "dddd"]
 * @example [1410715640, "X", "LLLL"]
 *
 * @exampleContext {"lang":"fr", "timezone":"Europe/Paris"}
 * @example ["20160131", "YYYYMMDD", "LLLL"]
 * @example ["20160131", "YYYYMMDD", "dddd"]
 *
 * @param  {String|Number} d   date to format
 * @param  {String} patternIn  input format
 * @param  {String} patternOut output format
 * @return {String}            return formatted date
 */
function convDate (d, patternIn, patternOut) {
  return formatD.call(this, d, patternOut, patternIn);
}


/**
 * Convert old MomentJS format to DayJS format
 *
 * @private
 * @param      {string}  d          not undefined/null date
 * @param      {string}  patternIn  The pattern
 * @return     {Object}             dayjs
 */
function parse (d, patternIn) {
  // if the date is already parsed
  if (typeof(d) === 'object' && d.isValid) {
    return d;
  }
  if (!patternIn) {
    return dayjs(d + '');
  }
  return dayjs(d, patternIn);
}



module.exports = {
  formatD,
  convDate,
  addD,
  subD,
  startOfD,
  endOfD,
  diffD,
  formatI
};
