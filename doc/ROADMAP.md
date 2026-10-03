# Roadmap: features inspired by Carbone Enterprise

This fork (`dev-itg`) adds, step by step, features that exist in Carbone Enterprise Edition. Every feature is written
independently from the **public documentation** (behavior and syntax), without any Enterprise source code.

Licence reminder: this fork is covered by the Carbone Community License (see `LICENSE.md`). It may be used internally or
inside a value-added product, but **not** offered to third parties as a document-generator service.

Status: `[x]` done, `[ ]` todo.

## Phase 1: pure formatters (no change in the template engine)
- [x] `append`, `replace`, `ellipsis`
- [x] `mod`, `abs`, `ceil`, `floor`
- [x] `diffD`, `formatI`
- [x] `ifTE`

## Phase 2: computation on arrays
- [x] Aggregators: `aggSum`, `aggAvg`, `aggMin`, `aggMax`, `aggCount`, `aggCountD`, `aggStr`, `aggStrD`
- [x] Cumulative: `cumSum`, `cumCount` (alias of `count`), `cumCountD`
- [x] `arrayJoin(separator, index, count)`: extra parameters
- [x] In-template options: `{o.lang=fr}`, `{o.timezone=Asia/Jakarta}`
- [ ] `set`: store a computed value and reuse it. Not started: the exact syntax and behavior must be confirmed first

### Usage

| Template | Result |
|---|---|
| `{d.items[].price:aggSum}` | sum of `price` of all items |
| `{d.items[].price:aggAvg:formatN(2)}` | average, then formatted |
| `{d.items[]:aggCount}` | number of items |
| `{d.items[].type:aggCountD}` | number of distinct types |
| `{d.kids[].name:aggStr(' / ')}` | `homer / bart` (`aggStrD` for distinct values) |
| `{d.cars[i].wheels[].size:aggSum}` | one sum for each car, inside a loop |
| `{d.cars[].wheels[].size:aggSum}` | sum of all wheels of all cars |
| `{d.items[i].price:cumSum}` | running total, row after row |
| `{d.items[i].type:cumCountD}` | running number of distinct types |
| `{d.names:arrayJoin(', ', 1, 2)}` | join 2 items, starting at index 1 (negative index: from the end) |
| `{o.lang=fr}` | language of the whole report (also `{o.timezone=...}`). The last declaration wins |

Behavior: values which are not numbers are ignored by `aggSum/Avg/Min/Max`. `aggSum` and `aggCount` return 0 on an
empty array, `aggAvg/Min/Max` print nothing. Filters inside brackets (`[price>5]`) are not supported with empty
brackets yet: use them in the loop (`d.items[i, price>5].price:cumSum`).

## Phase 3: document-format dependent features (DOCX, ODT, XLSX, ODS, PPTX, ODP)
- [x] `drop`, `keep`: remove/keep a `row`, `p` (paragraph) or `table`. Example: `{d.hide:ifEQ(true):drop(row)}`, `{d.visible:ifEQ(true):keep(p)}`, `drop(row, 2)` for 2 consecutive rows.
  The marker can be anywhere inside the element, also in a loop. It is rewritten into a `hideBegin/hideEnd` (or `showBegin/showEnd`) block.
  Not done yet: other elements (slide, page, image, shape, list item, sheet)
- [x] `color` (DOCX and ODT): `{d.c:color(scope, type)}` with scope `p` (paragraph), `cell`, `row`, and type `text` or `background`.
  The value can be `#RRGGBB`, `RRGGBB`, `#RGB`, `rgb(255,0,0)` or a basic color name (an invalid color gives the default color). It can be
  computed by other formatters: `{d.status:ifEQ('late'):show('red'):elseShow('green'):color(p, text)}`.
  ODT: a style is created for each color after data injection, as a copy of the original style of the paragraph or cell (borders, padding, alignment are kept).
  Not done yet: ODS, XLSX, PPTX, ODP (the styles of spreadsheets and presentations are organized differently), shapes, borders
- [x] `html`: `{d.richText:html}` renders HTML as native formatting in DOCX and ODT. Supported: `b`, `strong`, `i`, `em`, `u`, `s`, `del`, `sup`, `sub`, `a` (http, https, mailto, tel, ftp, sms),
  `br`, `p`, `div`, `h1`-`h6` (bold), `ul`, `ol`, `li` (nested lists are indented), `table` (cells separated by tabs), `pre`, and the inline styles font-weight, font-style and text-decoration.
  Blocks are separated by line breaks (it works anywhere, also in a table cell), the font of the marker is kept. Other formats receive the text without tags.
  Not done yet: colors and sizes (`color`, `font-size`), images, real paragraphs, real lists (numbering of Word), real tables, other formats (ODS, XLSX, PPTX, HTML, Markdown)
- [x] Dynamic images (DOCX, ODT, PPTX and XLSX; same code for ODS and ODP but not tested) and `imageFit`. Put a picture in the template as a placeholder, and write the marker in its alternative text
  (Word: right click > View Alt Text): `{d.logo}` or `{d.logo:imageFit(fillWidth)}`. The value is a public URL or a base64 data URI (png, jpeg, gif).
  `imageFit`: `contain` (default, whole image, ratio kept), `fillWidth` (width of the placeholder, ratio kept), `fill` (stretched). An empty value removes the picture.
  Options of `carbone.set`: `imageDownloadTimeout` (ms, 10000), `imageMaxSize` (bytes, 10 MB), `imageAllowPrivateNetwork` (false: URLs of local/private networks are refused).
  In ODF files, write the marker in the description of the picture (LibreOffice: right click > Properties > Description).
  PPTX: marker in the alternative text of the picture. XLSX: same, a picture is anchored on cells, so it is not repeated in a loop (one picture, one marker);
  with `contain` and `fillWidth` a two cell anchor is converted into a one cell anchor, with `fill` the picture fills the cells.
  Not done yet: SVG and WebP images, pictures repeated in a loop in a spreadsheet
- [x] Barcodes: `{d.code:barcode(type, scale, errorCorrection)}` in the alternative text of a picture (DOCX, ODT, PPTX, XLSX: same code as dynamic images).
  Types: `qrcode` (any text, UTF-8), `code128` (ASCII 32 to 126, digits are compressed), `ean13` (12 digits: check digit added, 13 digits: check digit verified).
  `scale`: pixels by module (1 to 30, default 8 for QR codes and 3 for others), `errorCorrection`: `L`, `M` (default), `Q`, `H` for QR codes.
  Chain `imageFit` after it to choose the size: `{d.code:barcode(qrcode):imageFit(contain)}`. An empty value removes the picture.
  Not done yet: other types (the Enterprise Edition has more than 100: Code 39, EAN-8, Data Matrix, PDF417, ...)
- [x] Dynamic hyperlinks: the address of the link is a marker, `{d.url}` or `https://shop.com/{d.id}` (an editor can store it as `%7Bd.url%7D`, it is decoded).
  DOCX and PPTX (relationships are created for each URL, so each row of a loop can have its own link) and ODF (ODT, ODS, ODP). Only `http`, `https`, `mailto`, `tel`, `ftp`, `sms`
  and relative links are accepted, other schemes (`javascript:`, `data:`, ...) remove the link and keep the text. Tested: DOCX, ODT. PPTX, ODS, ODP: same code, unit tests only.
  Not done yet: XLSX (links are outside of the rows, a link per row needs another mechanism), fields `HYPERLINK "..."` of Word
- [ ] Charts, PDF options (append/attach files, forms)

Order inside a phase may change; each step ends with unit tests and a CHANGELOG entry.
