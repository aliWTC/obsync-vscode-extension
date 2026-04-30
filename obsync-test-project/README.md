# Obsync Test Project

Small dummy project for validating Obsync behavior.

## Current scope (v4)

- Expanded TypeScript app structure (`features`, `services`, `workflows`, `utils`)
- Mixed-language files for sync coverage:
  - JavaScript (`src/services/cache.js`, `src/services/logger.js`, `scripts/seed_data.js`)
  - Python (`scripts/generate_report.py`, `scripts/check_health.py`)
  - JSON (`config/workflows.json`, `config/features.json`, `data/seed.json`)
  - Markdown docs (`docs/testing-notes.md`)
- One orchestrated app entrypoint (`src/index.ts`)
