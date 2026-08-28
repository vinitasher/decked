# Sandbox API routes

This directory contains nested Cloudflare Pages Functions for Concept Sandbox
maintenance operations. `prewarm.js` exposes the token-protected
`POST /api/sandbox/prewarm` route and processes accepted topics sequentially.
The learner-facing `GET /api/sandbox` route remains in the sibling
`functions/api/sandbox.js` file.
