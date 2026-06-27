# Bictochat

A Pictochat inspired web app where users join temporary online rooms to draw and send messages.
Built with Go and deployable anywhere.

## What it is

8 rooms (A–H), 4 users max per room. Pick a room, set a username, draw on the canvas, hit send. Messages appear as chat bubbles for everyone in the room. Rooms are temporary and they reset on inactivity.

## Stack

- **Backend** — Go, standard library only (`net/http`, `sync`, `encoding/json`)
- **Frontend** — Vanilla HTML, CSS, JS. No frameworks, no build step.
- **Hosting** — Google Cloud Run (scales to zero, single instance, in-memory state)

## How it works

- Clients /poll every 2 seconds to fetch new messages
- Drawings are exported from the canvas as base64 PNG and sent via /send
- Server evicts inactive clients after 60 seconds of missed polls
- No database, all room state lives in memory and resets on redeploy or idle timeout

## Running locally

```bash
go run main.go
# Open http://localhost:8080
```
