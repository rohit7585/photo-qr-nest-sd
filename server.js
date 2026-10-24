
'use strict';

const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const sharp = require('sharp');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'uploads');
const PUBLIC_DIR = __dirname;
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });

app.disable('x-powered-by');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://api.qrserver.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(express.static(PUBLIC_DIR, { etag: true, maxAge: '1h' }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Health checks are excluded from rate limiting.
// Other API endpoints remain rate-limited.
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.path === '/health'
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    cb(
      allowed.has(file.mimetype)
        ? null
        : new Error('Only JPEG, PNG, or WebP images are accepted.'),
      allowed.has(file.mimetype)
    );
  }
});

function safeExt(format) {
  return format === 'png' ? '.png' : format === 'webp' ? '.webp' : '.jpg';
}

async function cleanupExpired() {
  const now = Date.now();
  for (const name of await fs.promises.readdir(DATA_DIR).catch(() => [])) {
    if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) continue;
    const file = path.join(DATA_DIR, name);
    try {
      const st = await fs.promises.stat(file);
      if (now - st.mtimeMs > TTL_MS) await fs.promises.unlink(file);
    } catch (_) {}
  }
}

setInterval(cleanupExpired, 10 * 60 * 1000).unref();
cleanupExpired();

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uploadMaxBytes: MAX_BYTES,
    retentionHours: 24
  });
});

app.post('/api/upload', upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Choose a JPEG, PNG, or WebP image first.'
      });
    }

    // Re-encode images to remove EXIF/GPS metadata.
    const id = crypto.randomBytes(16).toString('hex');
    const image = sharp(req.file.buffer, {
      limitInputPixels: 25_000_000,
      failOn: 'error'
    });

    const meta = await image.metadata();
    let format;
    let output;

    if (meta.format === 'png') {
      format = 'png';
      output = await image.png({ compressionLevel: 8 }).toBuffer();
    } else if (meta.format === 'webp') {
      format = 'webp';
      output = await image.webp({ quality: 88 }).toBuffer();
    } else if (meta.format === 'jpeg') {
      format = 'jpeg';
      output = await image.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    } else {
      return res.status(415).json({
        error: 'Image contents must be JPEG, PNG, or WebP.'
      });
    }

    const filename = id + safeExt(format);
    await fs.promises.writeFile(
      path.join(DATA_DIR, filename),
      output,
      { flag: 'wx', mode: 0o600 }
    );

    const origin = BASE_URL || `${req.protocol}://${req.get('host')}`;

    res.status(201).json({
      url: `${origin}/photo/${id}`,
      expiresInHours: 24,
      message: 'Anyone with this link can view the photo; scheduled deletion is best-effort.'
    });
  } catch (e) {
    next(e);
  }
});

app.get('/photo/:id', async (req, res) => {
  if (!/^[a-f0-9]{32}$/.test(req.params.id)) {
    return res.status(404).send('Photo not found or expired.');
  }

  let found = null;

  for (const ext of ['.jpg', '.png', '.webp']) {
    const p = path.join(DATA_DIR, req.params.id + ext);

    try {
      const st = await fs.promises.stat(p);

      if (Date.now() - st.mtimeMs > TTL_MS) {
        await fs.promises.unlink(p).catch(() => {});
        return res.status(404).send('Photo expired.');
      }

      found = { p, ext };
      break;
    } catch (_) {}
  }

  if (!found) {
    return res.status(404).send('Photo not found or expired.');
  }

  res.set('Cache-Control', 'public, max-age=300');
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(found.ext === '.png' ? 'png' : found.ext === '.webp' ? 'webp' : 'jpg');
  res.sendFile(found.p);
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Image exceeds the 5 MB limit.' });
  }

  if (err) {
    return res.status(400).json({ error: err.message || 'Request failed.' });
  }

  return res.status(500).json({ error: 'Server error.' });
});

app.listen(PORT, () => {
  console.log(`Photo QR NEST SD backend listening on port ${PORT}`);
});

