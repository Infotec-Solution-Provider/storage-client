# Copilot Instructions for `storage-client`

## Purpose
`storage-client` is a **sub-service for file storage**. It runs on the tenant's own infrastructure or a remote location, and is called by `files-service` when a storage backend of type `client` is configured. `files-service` delegates the responsibility of physically saving and retrieving files to this service via HTTP.

It provides local filesystem storage backed by a SQLite metadata database, and also bridges WABA (WhatsApp Business API) media downloads/uploads. Other services never call this service directly — all access is proxied through `files-service`.

## Tech Stack
| Concern | Choice |
|---|---|
| Runtime | Node.js + TypeScript 5 |
| Framework | Express 5 |
| ORM/DB | Prisma 6 + **SQLite** (`DATABASE_URL`) |
| File upload | Multer 2 (memory storage) |
| HTTP client | Axios (for WABA Graph API calls) |
| Shared libs | `@in.pulse-crm/utils`, `@rgranatodutra/http-errors` |
| Language | TypeScript — `NodeNext` module, `es2022` target, maximally strict |
| Port | `3001` (configurable via `LISTEN_PORT`) |

## Folder Structure (`src/`)
```
src/
├── app.ts                        # Bootstrap: CORS, JSON, routes, error handler, listen
├── prisma.ts                     # PrismaClient singleton export
├── middlewares/
│   └── multer.middleware.ts      # Multer memory storage singleton
└── modules/
    ├── shared/
    │   ├── errors/               # Shared custom error types
    │   └── utils/                # Shared utility functions
    ├── storage/
    │   ├── storage.controller.ts # Route definitions, instantiated inline in app.ts
    │   ├── storage.service.ts    # Upload/download/register business logic + NanoID generation
    │   └── storages/
    │       ├── storage.ts        # Abstract base class for storage backends
    │       └── local.storage.ts  # Local filesystem implementation extending Storage
    └── waba/
        ├── waba.controller.ts    # WABA route definitions
        └── waba.service.ts       # WABA Graph API download + re-upload logic
```

## API Endpoints

### Storage (`/api/storage`)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/storage/` | Upload a file (`multipart/form-data`, field `file`; optional `folder` body param) |
| `GET` | `/api/storage/:fileId` | Download a file by its NanoID |
| `POST` | `/api/storage/register` | Register an already-existing file on disk into the DB |
| `POST` | `/api/storage/bulk` | Bulk-register multiple existing files into the DB |

### WABA (`/api/waba`)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/waba/media/:id` | Download WABA media by ID, store locally, return metadata |
| `POST` | `/api/waba/media` | Upload a stored file to WABA by `fileId`, return WABA `mediaId` |

## Build / Dev Commands
```bash
npm run dev      # ts-node-dev --transpile-only --respawn src/app.ts (hot reload)
npm run build    # tsc → dist/
npm start        # node dist/app.js
```

## Environment Variables
| Variable | Purpose |
|---|---|
| `LISTEN_PORT` | HTTP port (default: `3001`) |
| `DATABASE_URL` | SQLite connection string for Prisma |
| `STORAGE_PATH` | Root directory for local file storage |
| `WABA_ACCESS_TOKEN` | WhatsApp Business API Graph token |

## Inter-Service Communication
- **`files-service`** → calls this service's `/api/storage` when configured as a `client`-type storage backend. The URL and token are stored in `files-service`'s DB per `Storage` record.
- **WhatsApp Business API** (`https://graph.facebook.com/v16.0`) → `waba.service.ts` makes direct Graph API calls using `WABA_ACCESS_TOKEN`.
- This service is **never called directly** by frontend or other backend services — always proxied through `files-service`.

## Prisma Schema Overview
The schema is a single SQLite database tracking file metadata:
- **`File`** model: `id` (NanoID), `name`, `mime_type`, `size`, `path` (local filesystem path — omitted from API responses), `created_at`.
- NanoID uniqueness is re-verified in a loop before insertion to guarantee collision-free IDs.
- The `path` field is always omitted from Prisma query responses to prevent internal path exposure.

## Code Conventions
- **Controller instantiation**: `StorageController` is not a singleton export — it is instantiated inline in `app.ts` with `new StorageController(router)`. This differs from the rest of the platform.
- **Storage abstraction**: `local.storage.ts` extends abstract `Storage`. Future storage backends (e.g. S3) should follow the same extension pattern.
- **Error handling**: Manual try/catch in handlers (no `express-async-errors`). Checks `instanceof NotFoundError` before returning 404. Uses typed errors from `@rgranatodutra/http-errors`.
- **Path never exposed**: Prisma queries always use `omit: { path: true }` — file system paths are internal only.
- **Strict TypeScript**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals` — fully enabled. Avoid `any`; use `unknown` in catch blocks.
- **Module resolution**: `NodeNext` — use `.js` extensions in relative imports.
- **Naming**: `camelCase` variables/methods, `PascalCase` classes, `kebab-case` filenames.

## Critical Invariants
- Do **not** expose internal `path` values in API responses — always use `omit: { path: true }` in Prisma queries.
- File IDs are NanoIDs — never use numeric auto-increment IDs in public-facing responses.
- New storage backends must extend the abstract `Storage` class; never add backend-specific logic directly to the controller or service.
- The `STORAGE_PATH` directory must exist and be writable before the service starts.
