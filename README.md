# Neon Journal App

A local-first personal journal app with a neon blue tech aesthetic, calendar navigation, mood tracking, rich text editing, and writing streaks.

## Features

- Neon blue, rounded, comfortable UI with gentle hover transitions
- Calendar view with day selection and note markers
- Mood tracking per note (`excited`, `happy`, `calm`, `focused`, `tired`, `sad`)
- Rich text editor (bold, italic, underline, list, H2, quote, links)
- Daily writing streaks (`current` and `longest`)
- Create, edit, delete, and save notes
- Share notes through local share links (`/shared/:token`)
- Local-only data storage (no cloud, no external DB)

## Tech

- Node.js (built-in `http`, `fs`, `crypto`, no external packages)
- Vanilla HTML/CSS/JS frontend
- JSON file storage in `data/`

## Project Structure

- `server.js` - Node backend (API + static file hosting)
- `public/index.html` - App UI
- `public/styles.css` - Neon styling and responsive layout
- `public/app.js` - Frontend app logic
- `data/notes.json` - Local note storage (created at runtime)
- `data/shares.json` - Local share token mapping (created at runtime)

## Run

1. Install Node.js (v18+ recommended).
2. Open terminal in `journal-app`.
3. Run:
   - `node server.js`
4. Open:
   - `http://127.0.0.1:3000`

## Local-Only Storage

All notes and share mappings are stored on the machine running the app inside `journal-app/data/`. Nothing is uploaded by default.
