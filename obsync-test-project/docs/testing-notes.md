# Testing Notes

## Sync scenarios

- baseline full-project sync
- targeted file update sync
- deletion and stale-node cleanup
- function sync off/on toggles

## Expected outputs

- `_index.md` should list all tracked files.
- `versions/` should increment only on content changes.
- `functions/` should appear only when function sync is enabled.
