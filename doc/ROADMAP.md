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
- [ ] `drop`, `keep` (remove/keep a document element: row, paragraph, page, table, ...)
- [ ] `color`: inject colors in cells, rows, shapes
- [ ] `html`: render HTML as native formatting (ODT, DOCX)
- [ ] Dynamic images (URL / base64) and `imageFit`
- [ ] Barcodes (`barcode`)
- [ ] Charts, hyperlinks, PDF options (append/attach files, forms)

Order inside a phase may change; each step ends with unit tests and a CHANGELOG entry.
