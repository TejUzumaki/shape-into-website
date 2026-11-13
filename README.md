# V2H Static Studio

V2H is a browser-native, single-owner website design workspace. It runs as plain HTML, CSS and JavaScript. There is no Node.js runtime, npm install, build process, API server or database server.

## Run locally

From this directory: `python -m http.server 8000` and open `http://127.0.0.1:8000`. Python is only a static file server. It does not run application logic.

## Features

- Visual multi-page website editor with shapes, text, images, layers, animation, undo/redo and HTML generation.
- Browser-local project persistence using localStorage.
- No-code collections, schema editor, records, search and configurable views.
- Export a website as a ZIP containing static HTML pages and assets.
- Export a data app as a self-contained HTML file.
- JSON workspace backup and restore.

## Deploy to Vercel

Import the GitHub repository and set the Root Directory to `./`. Choose the **Other** framework preset, leave Build Command and Output Directory empty (or use `.` as the output directory if prompted), and deploy. The repository root contains `index.html`. No `package.json`, Node runtime or serverless functions are required.

## Storage and publishing model

This is deliberately a personal, browser-local tool. Projects and app data are stored in the current browser's localStorage. They do not automatically sync between devices, browsers or users, and clearing browser storage can erase them. Use **Backup** on the dashboard regularly. The Studio's Publish action downloads a ZIP; upload the extracted files to Vercel (or another static host) to make the site public. The App Maker's Export HTML creates a portable standalone app file.

A static-only application cannot provide secure server-side authentication, shared persistent database writes, private multi-user accounts, or server-side publishing. Those require a backend or hosted service and are intentionally out of scope for this edition.
