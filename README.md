# SEOAudit - AI-Powered SEO Audit Chatbot

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-brightgreen?logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-purple?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)
[![Anthropic API](https://img.shields.io/badge/Anthropic-API-orange)](https://www.anthropic.com/)

Paste a public URL and get a prioritized SEO audit, a structured report, and follow-up answers grounded in the latest audit.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Run Locally](#run-locally)
- [Available Scripts](#available-scripts)
- [How Audits Work](#how-audits-work)
- [Project Structure](#project-structure)
- [Current Limitations](#current-limitations)
- [Planned Features](#planned-features)
- [License](#license)

## Overview

SEOAudit is a React + Node application with two parts:

- A Vite frontend for the chat and report experience
- A Node HTTP API that fetches the target page, calls Anthropic, and stores audit history in SQLite

Results appear in two views:

- Chat: conversational summary and follow-up Q&A
- Report: score, issue breakdown, content stats, and saved audit comparisons

## Features

- On-page SEO checks for title, meta description, headings, canonical tag, and robots meta
- Content checks for word count, readability, image alt coverage, and keyword targeting notes
- AI-prioritized issues with severity and recommended fixes
- Saved audit history in SQLite with previous-audit comparisons
- Follow-up chat grounded in the selected audit report
- Explicit mock fallback mode when the live Anthropic request is unavailable

## Tech Stack

- **Frontend:** React 19 + Vite
- **Backend:** Node.js HTTP server
- **AI:** Anthropic Messages API
- **Storage:** SQLite via `node:sqlite`

## Prerequisites

- **Node.js** 22+
- **Anthropic API key** ([Get one here](https://console.anthropic.com/))

`node:sqlite` requires a modern Node runtime. If you are on an older version, upgrade Node before running the app.

## Setup

```bash
npm install
cp .env.example .env
```

Add values to `.env`:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
DATABASE_PATH=./data/seo-audit.sqlite
MOCK_AUDITS=false
```

## Run Locally

Start the API server in one terminal:

```bash
npm run api
```

Start the frontend in another terminal:

```bash
npm run dev
```

Open `http://localhost:5173`.

Vite proxies `/api` requests to `http://localhost:8787` during local development.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run api` | Start the Node API server |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Build the frontend for production |
| `npm run preview` | Preview the production frontend build |
| `npm run lint` | Run ESLint |

## How Audits Work

1. The frontend sends a URL to `/api/audit`
2. The backend validates the URL and blocks obvious local/private targets
3. The backend fetches the page HTML directly
4. The backend extracts a truncated HTML/text payload for the model
5. Anthropic returns a structured audit report
6. The report is saved to SQLite and shown in the UI

If the Anthropic request fails for supported fallback cases, the app returns a clearly marked mock audit so the interface still works during development.

## Project Structure

```text
seo-audit-chatbot/
|-- src/
|   |-- App.jsx
|   |-- seo-audit-chatbot.jsx
|   |-- main.jsx
|   `-- index.css
|-- data/
|-- public/
|-- server.mjs
|-- package.json
|-- vite.config.js
`-- README.md
```

## Current Limitations

- Single-page audits only
- No Core Web Vitals or PageSpeed integration yet
- No backlink analysis
- No authenticated-page support

## Planned Features

- PageSpeed Insights integration
- PDF or CSV export
- Single-audit deletion and richer history controls
- Bulk URL auditing
- Scheduled re-audits and alerts

## License

This project is licensed under the [MIT License](LICENSE).
