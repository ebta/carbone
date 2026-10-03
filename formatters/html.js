const html = require('../lib/html');

/**
 * Convert HTML into the native formatting of the document: DOCX and ODT. For other formats, the text is printed without tags.
 *
 * Supported: bold (`b`, `strong`, `h1` to `h6`), italic (`i`, `em`), underline (`u`), strikethrough (`s`, `del`), superscript (`sup`),
 * subscript (`sub`), links (`a`), line breaks (`br`), lists (`ul`, `ol`, `li`), blocks (`p`, `div`, `blockquote`, `pre`, `table`)
 * and the inline styles `font-weight`, `font-style` and `text-decoration`. Blocks are separated by line breaks.
 * Other tags are ignored, but their text is kept. Scripts and styles are removed. Links are accepted only with
 * http, https, mailto, tel, ftp and sms. The font of the marker is used for the text.
 *
 * @version 3.5.7 new
 * @example ["<b>Hello</b> <i>world</i>"]
 * @example ["<p>First</p><ul><li>One</li><li>Two</li></ul>"]
 * @example ["Visit <a href=\"https://carbone.io\">Carbone</a>"]
 *
 * @param  {String} d  HTML
 * @return {String}    XML of the formatted text
 */
function htmlFormatter (d, contextId) {
  if (d === null || typeof d === 'undefined' || d === '') {
    return d;
  }
  var _properties = (this && this.htmlRunProperties && contextId !== undefined) ? this.htmlRunProperties[parseInt(contextId, 10)] : '';
  return html.convert(d + '', this && this.extension, _properties || '');
}

// the result is XML: it is executed after the escaping of the data
htmlFormatter.canInjectXML = true;

module.exports = {
  html : htmlFormatter
};
