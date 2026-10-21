# Plant Identifier — Web + Pl@ntNet Proxy

This repository contains the web frontend (`web/`) and hardened Node/Express proxy (`server.js` / `api/server.js`) to call the **Pl@ntNet API (`my.plantnet.org`)** safely without exposing credentials or user EXIF metadata.

## Structure
- `web/`: Static frontend (`index.html`, `script.js`, `style.css`)
- `server.js` & `api/`: Node/Express proxy that converts sanitized uploads to `multipart/form-data`, queries `https://my-api.plantnet.org/v2/identify/all`, enriches descriptions via Wikipedia REST API, and returns normalized results.

## Quick Start
1. Copy `.env.example` to `.env` and set `PLANTNET_API_KEY` from [my.plantnet.org](https://my.plantnet.org/).
2. Run:
   ```bash
   npm install
   npm start
   ```
3. Open `http://localhost:3000` in your browser.
