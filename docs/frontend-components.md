# Frontend Components

> [中文版](frontend-components.zh.md)

The web UI is a React 19 + Material UI 9 single-page app built by Vite and served by `bun run start`. It has two
pages: the library and the volume page with its reader. All text is Chinese (`src/frontend/i18n/zh.json`).

## Component pattern

```
ComponentName/
  index.tsx                  ← thin re-export
  ComponentNameContainer.tsx ← state, data loading, event handlers; no visual JSX of its own
  ComponentNameView.tsx      ← pure render from props
```

Components without state have only `index.tsx` and a View.

## Pages

### LibraryPage (`/`)

- `LibraryPageContainer.tsx`: loads the volume list and the resource status, listens to server events
  (refreshes the list after job events, shows model loading and waiting messages), starts a volume after the
  import confirmation and opens it.
- `LibraryPageView.tsx`: app bar, drop zone and status card side by side, messages, and the grid of volume cards.

### VolumePage (`/volumes/:id`)

- `VolumePageContainer.tsx`: loads the volume, follows task and job events of this volume (current step text,
  refresh of translated pages with a per-page version so re-rendered images reload), start and stop, and the
  keyboard: arrow keys, Space, PageUp and PageDown turn pages in the book's reading direction.
- `VolumePageView.tsx`: app bar with state, start/stop and CBZ/PDF downloads; progress and messages; a
  translated/original toggle; the page with previous and next buttons placed for the reading direction; and a
  strip of page thumbnails in reading order, marked by translation state and open review flags.

## Components

| Component | Role |
|---|---|
| `DropZone` | Drag and drop of files or folders, plus file and folder pickers; uploads and reports the import result |
| `ImportConfirmDialog` | The one-line confirmation after import: pages, blank pages, textless pages, skipped files; start or later |
| `StatusCard` | Governor light and reasons, loaded models, room left on each usable GPU, and missing downloads |
| `VolumeCard` | Cover, title, page count, job state and progress; open, and delete with confirmation |

## API and helpers

| File | Role |
|---|---|
| `api/client.ts` | Typed calls to the local server; writes carry the `x-comic-translator` header; errors become `ApiError` with the server's Chinese message |
| `api/use-server-events.ts` | `useServerEvents(handler)`: one `EventSource` on `/api/events` for status, task, job and model events |
| `reader/page-step.ts` | Which way a key turns the page for right-to-left and left-to-right books |
| `reader/collect-dropped-files.ts` | Files of a drop, descending into dropped folders, with their relative paths |

Response and event types come from the server (`src/server/interfaces`, `src/jobs/interfaces/runner-event.ts`);
those files import only plain type files so the UI type-checks without Bun types.
