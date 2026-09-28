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

## Phase 2: computation on arrays (needs changes in `lib/builder.js` / `lib/extracter.js`)
- [ ] Aggregators: `aggSum`, `aggAvg`, `aggMin`, `aggMax`, `aggCount`, `aggCountD`, `aggStr`, `aggStrD`
- [ ] Cumulative: `cumSum`, `cumCount` (replaces `count`), `cumCountD`
- [ ] `arrayJoin(separator, index, count)`: extra parameters
- [ ] `set`: store a computed value and reuse it
- [ ] In-template options: `{o.lang=fr}`, `{o.timezone=Asia/Jakarta}`

## Phase 3: document-format dependent features (DOCX, ODT, XLSX, ODS, PPTX, ODP)
- [ ] `drop`, `keep` (remove/keep a document element: row, paragraph, page, table, ...)
- [ ] `color`: inject colors in cells, rows, shapes
- [ ] `html`: render HTML as native formatting (ODT, DOCX)
- [ ] Dynamic images (URL / base64) and `imageFit`
- [ ] Barcodes (`barcode`)
- [ ] Charts, hyperlinks, PDF options (append/attach files, forms)

Order inside a phase may change; each step ends with unit tests and a CHANGELOG entry.
