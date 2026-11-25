# Changelog

## 1.0.0 — 2026-11-25

Initial public Firefox release.

- Right-click **Insert blurb** submenu on editable fields in any frame.
- Manage labeled text snippets: add, edit, delete, and reorder.
- Blurbs stored locally in Firefox extension storage; nothing is uploaded.
- JSON backup/restore with labels, plus a one-line-per-blurb TXT export.
- Import JSON or TXT files, with automatic duplicate detection.
- Sample snippets for quick onboarding.
- Automatic content-script injection for tabs that were open before installation.
- Targeted insertion into input, textarea, and contenteditable fields, with a native-setter/InputEvent fallback for React-style inputs.
- Local error notification if insertion fails.
- English and Turkish interface, following the Firefox interface language.
- Dark and light themes.
- No telemetry, no analytics, no network requests.
