# Sync API

The generic sync API stores records by `toolId` and `recordId`.

## Metadata Cursor

`GET /api/sync/:toolId/metadata` supports an optional `cursor` query parameter.

- Without `cursor`, the response contains full metadata. This is the legacy-compatible behavior used for initial syncs and by existing clients.
- With a valid current cursor, the response contains only records changed after that cursor.
- `cursor` is a server-issued monotonically increasing revision. Clients must not create or modify it.
- The response includes `cursor` and `full`. Persist the cursor only after the whole sync finishes successfully.
- The backend retains the newest 100,000 changes per tool. A malformed or expired cursor returns `full: true` and complete metadata, with a fresh cursor.

Every accepted push, including tombstones, writes a revision. Historical edits and deletions are therefore included in later incremental responses.

Example response:

```json
{
  "success": true,
  "records": [{ "id": "record-1", "updatedAt": 1760000000000, "deleted": false }],
  "cursor": "142",
  "full": false
}
```
