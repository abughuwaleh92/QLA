'use strict';

/**
 * Canonical server.js — single declarations only
 * - One require for express
 * - One require for path
 * - One app instance
 * - Body parsers
 * - Static serving
 * - Single mount for /api/teacher/practice
 * - Safe optional mounts for other routers (won’t crash if missing)
 */

const express = require('express');           // declare ONCE
const path    = require('path');              // declare ONCE

const app = express();                        // create app ONCE

// ------------ middleware ------------
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ------------ static files ------------
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use(express.static(path.join(__dirname, 'public')));

// ------------ router mounting helpers ------------
function mountIfExists(routePath, mountPoint) {
  try {
    const r = require(routePath);
    if (typeof r === 'function') {
      app.use(mountPoint, r);
      console.log(`[mount] ${mountPoint} -> ${routePath}`);
    } else {
      console.warn(`[mount] ${routePath} did not export a router function; skipped.`);
    }
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.warn(`[mount] ${routePath} not found; skipping.`);
    } else {
      console.error(`[mount] error loading ${routePath}:`, err);
    }
  }
}

// ------------ API routers (each mounted ONCE) ------------
mountIfExists('./routes/teacher-practice', '/api/teacher/practice');  // Practice API
// Optional (safe): these will be mounted only if the files exist
mountIfExists('./routes/teacher', '/api/teacher');
mountIfExists('./routes/student', '/api/student');
mountIfExists('./routes/admin', '/api/admin');

// ------------ health & errors ------------
app.get('/health', (req, res) => res.status(200).json({ ok: true }));

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal_error' });
});

// ------------ start server ------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
