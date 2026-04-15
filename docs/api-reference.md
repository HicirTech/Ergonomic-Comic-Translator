# API Reference

REST API served by Bun HTTP on `http://0.0.0.0:3000` (default). Start with `bun run api`.

> [中文版](api-reference.zh.md)

All responses are JSON unless otherwise noted. Error responses use `{ "error": string }`. Max request body: 1 GiB.

---

## Health & Configuration

### `GET /health`

Liveness probe.

**Response:** `200`

```json
{ "status": "ok" }
```

---

### `GET /api/config`

Returns full server configuration snapshot.

**Response:** `200`

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 3000,
    "endpoints": { "config": "/api/config", "files": "/api/files", "upload": "/api/upload", "health": "/health" }
  },
  "paths": {
    "projectRoot": "/path/to/project",
    "tempRootDir": ".tmp",
    "programDir": ".tmp/program",
    "filesRootDir": ".tmp/ocr",
    "apiUploadsRootDir": ".tmp/upload",
    "ocrPrepareRootDir": ".tmp/ocr_prepare",
    "ocrOutputRootDir": ".tmp/ocr_output",
    "textlessRootDir": ".tmp/textless",
    "translatedRootDir": ".tmp/translated",
    "ocrOutputFileName": "ocr_output.json",
    "defaultOcrOutputScope": "ocr",
    "ocrQueueFile": ".tmp/program/ocrQueue.json",
    "textlessQueueFile": ".tmp/program/textlessQueue.json",
    "translateQueueFile": ".tmp/program/translateQueue.json",
    "uploadRecordsFile": ".tmp/program/uploadRecord.json",
    "ocrSourceName": "ocr"
  },
  "ocr": {
    "current": { "model": "paddleocr-vl-1.5", "language": "japan", "device": "auto", "concurrency": 1 },
    "defaults": { "model": "paddleocr-vl-1.5", "language": "japan", "device": "auto", "concurrency": 1 },
    "configurableOptions": {
      "model": ["paddleocr", "paddleocr-vl-1.5"],
      "language": "japan",
      "device": ["auto", "gpu:0", "gpu:1", "cpu"],
      "concurrency": { "min": 1 }
    }
  },
  "uploads": {
    "targetDirectory": ".tmp/upload",
    "metadataStore": ".tmp/program/uploadRecord.json",
    "acceptedExtensions": [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif", ".gif", ".pdf", ".zip"],
    "archiveExtractExtensions": [".zip"],
    "acceptsZipExtraction": true
  },
  "persistence": {
    "uploadRecordRepository": "file",
    "databaseLayerReady": false
  }
}
```

---

## File Management

### `GET /api/files`

Lists all upload records with page counts.

**Response:** `200`

```json
{
  "records": [
    {
      "uploadId": "abc-123-...",
      "sourceType": "image",
      "originalName": "page1.png",
      "storedName": "page1.png",
      "storedPath": "/abs/path/.tmp/upload/abc-123-.../page1.png",
      "relativePath": "abc-123-.../page1.png",
      "contentType": "image/png",
      "size": 1048576,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "archiveName": null,
      "archiveEntryName": null
    }
  ],
  "pageCounts": {
    "abc-123-...": 5
  }
}
```

**`sourceType` values:** `"image"`, `"pdf"`, `"zip"`, `"zip-entry"`

**Behavior:** `pageCounts` maps each `uploadId` to the number of prepared page images in the OCR prepare directory. Only uploads with extracted images are included.

---

### `POST /api/upload`

Upload images, PDFs, or ZIP archives.

**Request:** `Content-Type: multipart/form-data` with one or more file fields.

**Response:**

| Status | Body | Condition |
|--------|------|-----------|
| `201` | `UploadBatchResult` | Files accepted |
| `415` | `{ "error": string }` | Content-Type is not `multipart/form-data` |
| `400` | `{ "error": string }` | No files provided or no supported files |

```json
{
  "uploadId": "abc-123-...",
  "storedRecords": [ /* UploadRecord[] */ ],
  "ocrReadyRecords": [ /* UploadRecord[] — files ready for OCR */ ],
  "skippedEntries": [
    { "name": "readme.txt", "reason": "Unsupported file extension" }
  ]
}
```

**Behavior:**
- Generates a unique `uploadId` (UUID) shared by all files in the upload
- ZIP archives are extracted; both the archive and entries share the same `uploadId`
- PDF files are split into per-page PNGs during OCR preparation
- Immediately prepares images in the OCR prepare directory (non-fatal on failure)

---

### `GET /api/uploads/:uploadId/cover`

Returns the first page image as a cover thumbnail.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |

**Response:**

| Status | Body | Headers |
|--------|------|---------|
| `200` | Binary image | `Content-Type: image/*`, `Cache-Control: public, max-age=3600` |
| `404` | Empty | No cover image found |

---

### `GET /api/uploads/:uploadId/pages`

Returns sorted list of page image filenames.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |

**Response:** `200`

```json
{ "pages": ["page_001.png", "page_002.png", "page_003.png"] }
```

Returns empty array if no prepared directory exists.

---

### `GET /api/uploads/:uploadId/pages/:page`

Serves a specific prepared page image.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `page` | path | integer | 0-based page index |

**Response:**

| Status | Body | Headers |
|--------|------|---------|
| `200` | Binary image | `Content-Type: image/*`, `Cache-Control: public, max-age=300` |
| `404` | Empty | Directory or page index not found |

---

### `GET /api/uploads/:uploadId/textless/pages/:page`

Serves the text-removed version of a page image. Also supports `HEAD` requests.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `page` | path | integer | 0-based page index |

**Response:**

| Status | Body | Headers |
|--------|------|---------|
| `200` | Binary image | `Content-Type`, `Content-Length`, `Last-Modified`, no-cache |
| `404` | Empty | OCR not complete, page not found, or textless image not generated |

**Behavior:** Looks up the OCR output JSON to find the original filename for the given page index, then serves the corresponding image from the textless output directory. Disables caching to reflect re-processed results.

---

### `DELETE /api/uploads/:uploadId`

Permanently deletes all data for an upload.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |

**Response:**

| Status | Body |
|--------|------|
| `200` | `{ "deleted": "abc-123-..." }` |
| `404` | `{ "error": "Upload not found." }` |

**Behavior:** Removes upload records, prepared images, OCR outputs, textless outputs, translations, and all queue entries. **Irreversible.**

---

## OCR Queue

All queues share the same state machine: `Ready → Queued → Processing → Completed`.

### `GET /api/ocr`

Returns the full OCR queue status.

**Response:** `200`

```json
{
  "activeUploadId": "abc-123-..." | null,
  "queuedUploadIds": ["def-456-..."],
  "records": [
    {
      "uploadId": "abc-123-...",
      "status": "Processing",
      "outputFile": ".tmp/ocr_output/abc-123-.../ocr_output.json",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:01:00.000Z",
      "startedAt": "2025-01-01T00:00:30.000Z",
      "completedAt": null,
      "lastError": null,
      "pagesCompleted": 3,
      "pagesTotal": 10
    }
  ]
}
```

**`status` values:** `"Ready"`, `"Queued"`, `"Processing"`, `"Completed"`

---

### `POST /api/ocr/:uploadId`

Enqueues an entire upload for OCR processing.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `force` | query | boolean | Re-enqueue even if already completed |
| `model` | body (JSON) | string | OCR model: `"paddleocr"` or `"paddleocr-vl-1.5"` |
| `language` | body (JSON) | string | Language hint for standard PaddleOCR |

**Response:** `201` on enqueue, `200` if already queued/completed, `400` on invalid model or JSON.

**Behavior:**
- If the upload is already `Completed`, returns without re-queueing unless `?force=true`
- Only one upload is processed at a time; others wait in queue
- `model` and `language` are optional — defaults to server configuration

```bash
# Default model
curl -X POST http://localhost:3000/api/ocr/abc-123-...

# Force re-run with specific model
curl -X POST 'http://localhost:3000/api/ocr/abc-123-...?force=true' \
  -H 'Content-Type: application/json' \
  -d '{"model": "paddleocr-vl-1.5"}'
```

---

### `POST /api/ocr/:uploadId/:page`

Re-runs OCR on a single page, patching the existing output JSON in-place.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `page` | path | integer | 0-based page index |
| `model` | body (JSON) | string | OCR model override |
| `language` | body (JSON) | string | Language hint |

**Response:** Status from queue service. `400` on invalid model or JSON.

```bash
curl -X POST http://localhost:3000/api/ocr/abc-123-.../5 \
  -H 'Content-Type: application/json' \
  -d '{"model": "paddleocr"}'
```

---

### `PUT /api/ocr/:uploadId/:page`

Replaces OCR line data for a specific page (manual editing).

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `page` | path | integer | 0-based page index |
| `lines` | body (JSON) | array | Line items to set |

**Request body:**

```json
{
  "lines": [
    {
      "text": "こんにちは",
      "box": [100, 200, 300, 50],
      "polygon": [[100, 200], [400, 200], [400, 250], [100, 250]],
      "orientation": "horizontal"
    }
  ]
}
```

| Line field | Type | Required | Description |
|------------|------|----------|-------------|
| `text` | string | yes | OCR text content |
| `box` | `[x, y, w, h]` or `null` | no | Bounding box |
| `polygon` | `[[x, y], ...]` or `null` | no | Polygon vertices |
| `orientation` | string or `null` | no | `"horizontal"` or `"vertical"` |

**Response:** `200` on success. `415` if not JSON. `400` if validation fails.

**Behavior:** Assigns sequential `lineIndex` values automatically. Validates each line item.

---

### `GET /api/ocr/:uploadId`

Returns OCR job status and output for an upload.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |

**Response:** `200` — includes full OCR output for completed jobs:

```json
{
  "record": { /* OcrJobRecord */ },
  "output": {
    "source": "ocr",
    "ocrEngine": "paddleocr-vl-1.5",
    "ocrModel": "paddleocr-vl-1.5",
    "language": "japan",
    "device": "gpu:0",
    "generatedAt": "2025-01-01T00:05:00.000Z",
    "pageCount": 3,
    "pages": [
      {
        "pageNumber": 0,
        "fileName": "page_001.png",
        "filePath": "/abs/path/page_001.png",
        "lines": [
          {
            "lineIndex": 0,
            "text": "こんにちは",
            "box": [100, 200, 300, 50],
            "polygon": [[100, 200], [400, 200], [400, 250], [100, 250]],
            "orientation": "vertical"
          }
        ]
      }
    ]
  }
}
```

---

### `GET /api/ocr/:uploadId/:page`

Returns OCR lines for a specific page.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `page` | path | integer | 0-based page index |

**Response:** Lines array for the requested page.

---

### `DELETE /api/ocr/:uploadId`

Removes the OCR job record from the queue.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |

---

## Textless Queue (Text Removal)

### `GET /api/textless`

Returns the full textless processing queue status.

**Response:** `200`

```json
{
  "activeUploadId": null,
  "queuedUploadIds": [],
  "records": [
    {
      "uploadId": "abc-123-...",
      "status": "Completed",
      "pages": [
        {
          "pageNumber": 0,
          "fileName": "page_001.png",
          "status": "completed",
          "lastError": null
        }
      ],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:05:00.000Z",
      "startedAt": "2025-01-01T00:01:00.000Z",
      "completedAt": "2025-01-01T00:05:00.000Z",
      "lastError": null
    }
  ]
}
```

**Per-page `status` values:** `"pending"`, `"completed"`, `"failed"`

---

### `POST /api/textless/:uploadId`

Enqueues all pages of an upload for text removal.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |

**Precondition:** OCR must be `Completed` for this upload.

**Behavior:** One upload is processed at a time. Pages are processed sequentially. Output images are written to `.tmp/textless/{uploadId}/` with the same filenames as the source.

---

### `POST /api/textless/:uploadId/:page`

Enqueues a single page for text removal.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `page` | path | integer | 0-based page index |

---

### `GET /api/textless/:uploadId`

Returns the textless job record for an upload.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |

---

## Translation Queue

### `GET /api/translate`

Returns the full translation queue status.

**Response:** `200`

```json
{
  "activeUploadId": null,
  "queuedUploadIds": [],
  "records": [
    {
      "uploadId": "abc-123-...",
      "status": "Completed",
      "targetLanguage": "Chinese",
      "outputFile": ".tmp/translated/abc-123-.../translated.json",
      "pages": [
        {
          "pageNumber": 0,
          "status": "completed",
          "lastError": null
        }
      ],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:10:00.000Z",
      "startedAt": "2025-01-01T00:05:00.000Z",
      "completedAt": "2025-01-01T00:10:00.000Z",
      "lastError": null
    }
  ]
}
```

---

### `POST /api/translate/:uploadId`

Enqueues all pages for translation.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `targetLanguage` | body (JSON) | string | Target language (e.g. `"Chinese"`, `"English"`, `"French"`) |
| `model` | body (JSON) | string | LLM model override |

**Precondition:** OCR must be `Completed` for this upload.

**Behavior:**
- Pages are translated sequentially
- Each page call receives the full OCR text + a sliding window of recently-translated pages as context (default: last 8 pages, configurable via `TRANSLATE_CONTEXT_PAGES`)
- If whole-page translation fails after 3 retries, falls back to per-line translation (2 retries per line)
- Output is saved incrementally to `.tmp/translated/{uploadId}/translated.json`
- Auto-extracted terms are saved as a side-output to `.tmp/translated/{uploadId}/extracted-terms.json`

```bash
# Default language
curl -X POST http://localhost:3000/api/translate/abc-123-...

# Translate to French
curl -X POST http://localhost:3000/api/translate/abc-123-... \
  -H 'Content-Type: application/json' \
  -d '{"targetLanguage": "French"}'
```

---

### `POST /api/translate/:uploadId/:page`

Re-translates a single page. Updates the existing `translated.json` in-place.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `page` | path | integer | 0-based page index |
| `targetLanguage` | body (JSON) | string | Target language |
| `model` | body (JSON) | string | LLM model override |

---

### `GET /api/translate/:uploadId`

Returns the translation job record for an upload.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |

---

### `GET /api/translate/:uploadId/:page`

Returns translated lines for a specific page.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `page` | path | integer | 0-based page index |

**Response:** `200`

```json
{
  "pageNumber": 0,
  "lines": [
    { "lineIndex": 0, "translated": "Hello" },
    { "lineIndex": 1, "translated": "World" }
  ]
}
```

---

### `PUT /api/translate/:uploadId/:page`

Saves user-edited translation for a specific page.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `page` | path | integer | 0-based page index |
| `lines` | body (JSON) | array | Translated line items |

**Request body:**

```json
{
  "lines": [
    { "lineIndex": 0, "translated": "你好" },
    { "lineIndex": 1, "translated": "世界" }
  ]
}
```

**Response:** `200` on success. `400` if `lines` is not an array or JSON is invalid.

**Behavior:** Replaces the translation for the specified page in `translated.json`.

---

## Context Queue (Glossary / Term Detection)

### `GET /api/context`

Returns the full context-detection queue status.

**Response:** `200`

```json
{
  "activeUploadId": null,
  "queuedUploadIds": [],
  "records": [
    {
      "uploadId": "abc-123-...",
      "status": "Completed",
      "pageNumbers": [0, 1, 2],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:10:00.000Z",
      "startedAt": "2025-01-01T00:05:00.000Z",
      "completedAt": "2025-01-01T00:10:00.000Z",
      "lastError": null,
      "chunksCompleted": 3,
      "chunksTotal": 3
    }
  ]
}
```

---

### `POST /api/context/:uploadId`

Enqueues all pages for context/glossary term detection.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `model` | body (JSON) | string | LLM model override |
| `targetLanguage` | body (JSON) | string | Target language |

---

### `POST /api/context/:uploadId/:page`

Enqueues a single page for context detection.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `page` | path | integer | 0-based page index |
| `model` | body (JSON) | string | LLM model override |
| `targetLanguage` | body (JSON) | string | Target language |

---

### `GET /api/context/:uploadId`

Returns the context job record for an upload.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |

---

### `GET /api/context/:uploadId/terms`

Returns the glossary/term list for an upload.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |

**Response:** `200`

```json
{
  "terms": [
    { "term": "鬼滅の刃", "context": "Demon Slayer — manga title" },
    { "term": "炭治郎", "context": "" }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `term` | string | Original term detected by AI |
| `context` | string | User-provided explanation (empty if not yet set) |

---

### `PUT /api/context/:uploadId/terms`

Saves user-edited glossary terms, replacing the existing term list.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `terms` | body (JSON) | array | Term items |

**Request body:**

```json
{
  "terms": [
    { "term": "鬼滅の刃", "context": "Demon Slayer — manga title" }
  ]
}
```

**Response:** `200` on success. `400` if `terms` is not an array or JSON is invalid.

---

## Polish Queue

### `GET /api/polish`

Returns the full polish queue status.

**Response:** `200`

```json
{
  "activeUploadId": null,
  "queuedUploadIds": [],
  "records": [
    {
      "uploadId": "abc-123-...",
      "status": "Completed",
      "targetLanguage": "Chinese",
      "outputFile": ".tmp/translated/abc-123-.../translated.json",
      "pages": [
        {
          "pageNumber": 1,
          "status": "completed",
          "lastError": null
        }
      ],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:15:00.000Z",
      "startedAt": "2025-01-01T00:10:00.000Z",
      "completedAt": "2025-01-01T00:15:00.000Z",
      "lastError": null
    }
  ]
}
```

---

### `POST /api/polish/:uploadId`

Enqueues all pages for translation polishing.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |
| `targetLanguage` | body (JSON) | string | Target language |
| `model` | body (JSON) | string | LLM model override |

**Precondition:** Translation must be `Completed` for this upload.

**Response:** `202` on enqueue or already processing, `200` if already completed.

---

### `GET /api/polish/:uploadId`

Returns the polish job record for an upload.

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `uploadId` | path | string | Upload batch ID |

**Response:** `200`

```json
{
  "uploadId": "abc-123-...",
  "status": "Completed",
  "targetLanguage": "Chinese",
  "outputFile": ".tmp/translated/abc-123-.../translated.json",
  "pages": [
    {
      "pageNumber": 1,
      "status": "completed",
      "lastError": null
    }
  ],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:15:00.000Z",
  "startedAt": "2025-01-01T00:10:00.000Z",
  "completedAt": "2025-01-01T00:15:00.000Z",
  "lastError": null
}
```

---

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/config` | Server configuration |
| `GET` | `/api/files` | List uploads with page counts |
| `POST` | `/api/upload` | Upload files (multipart) |
| `GET` | `/api/uploads/:uploadId/cover` | Cover image |
| `GET` | `/api/uploads/:uploadId/pages` | Page filename list |
| `GET` | `/api/uploads/:uploadId/pages/:page` | Serve page image |
| `GET/HEAD` | `/api/uploads/:uploadId/textless/pages/:page` | Textless page image |
| `DELETE` | `/api/uploads/:uploadId` | Delete all upload data |
| `GET` | `/api/ocr` | OCR queue status |
| `POST` | `/api/ocr/:uploadId` | Enqueue OCR |
| `POST` | `/api/ocr/:uploadId/:page` | Enqueue single-page OCR |
| `PUT` | `/api/ocr/:uploadId/:page` | Update page OCR lines |
| `GET` | `/api/ocr/:uploadId` | OCR job status + output |
| `GET` | `/api/ocr/:uploadId/:page` | Single page OCR lines |
| `DELETE` | `/api/ocr/:uploadId` | Remove OCR job |
| `GET` | `/api/textless` | Textless queue status |
| `POST` | `/api/textless/:uploadId` | Enqueue textless (all pages) |
| `POST` | `/api/textless/:uploadId/:page` | Enqueue textless (single page) |
| `GET` | `/api/textless/:uploadId` | Textless job status |
| `GET` | `/api/translate` | Translation queue status |
| `POST` | `/api/translate/:uploadId` | Enqueue translation |
| `POST` | `/api/translate/:uploadId/:page` | Enqueue single-page translation |
| `GET` | `/api/translate/:uploadId` | Translation job status + output |
| `GET` | `/api/translate/:uploadId/:page` | Single page translation |
| `PUT` | `/api/translate/:uploadId/:page` | Save edited translation |
| `GET` | `/api/context` | Context queue status |
| `POST` | `/api/context/:uploadId` | Enqueue context detection |
| `POST` | `/api/context/:uploadId/:page` | Enqueue single-page context |
| `GET` | `/api/context/:uploadId` | Context job status |
| `GET` | `/api/context/:uploadId/terms` | Get glossary terms |
| `PUT` | `/api/context/:uploadId/terms` | Save glossary terms |
| `GET` | `/api/polish` | Polish queue status |
| `POST` | `/api/polish/:uploadId` | Enqueue polish |
| `GET` | `/api/polish/:uploadId` | Polish job status |

## Global Error Handling

- **404** — `{ "error": "Not found." }` for unmatched routes
- **500** — `{ "error": string }` wrapping uncaught exceptions
