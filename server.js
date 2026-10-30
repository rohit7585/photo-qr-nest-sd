
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
const BASE_URL = (
  process.env.PUBLIC_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  'https://photo-qr-nest-sd.onrender.com'
).replace(/\/$/, '');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'uploads');
const PUBLIC_DIR = __dirname;
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;
const SITE_URL = 'https://photo-qr-nest-sd.onrender.com';

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

// Robots.txt
app.get('/robots.txt', (_req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Content-Type-Options': 'nosniff'
  });

    res.type('text/plain').send(
    'User-agent: *\n' +
    'Allow: /\n' +
    'Allow: /sitemap.xml\n' +
    'Disallow: /api/\n' +
    
    'Disallow: /photo-file/\n\n' +
    `Sitemap: ${SITE_URL}/sitemap.xml\n`
  );
});

// Sitemap XML
app.get('/sitemap.xml', (_req, res) => {
  res.set({
    'Cache-Control': 'no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  });

  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `  <url><loc>${SITE_URL}/</loc></url>\n` +
    '</urlset>\n'
  );
});

// SEO homepage: metadata and structured data
app.get('/', async (_req, res, next) => {
  try {
    let html = await fs.promises.readFile(
      path.join(PUBLIC_DIR, 'index.html'),
      'utf8'
    );

    const title =
     'Photo QR Code Generator – Share Photos with QR | Photo QR NEST SD';

    const description =
     'Create a QR code for your photo online for free. Upload a JPG, PNG or WebP image, share it with a scannable QR code, and access it for up to 24 hours.';

    // Update the existing title.
    if (/<title>[\s\S]*?<\/title>/i.test(html)) {
      html = html.replace(
        /<title>[\s\S]*?<\/title>/i,
        `<title>${title}</title>`
      );
    } else {
      html = html.replace(
        /<head[^>]*>/i,
        `$&\n<title>${title}</title>`
      );
    }

    // Update or add the description.
    if (/<meta\s+name=["']description["'][^>]*>/i.test(html)) {
      html = html.replace(
        /<meta\s+name=["']description["'][^>]*>/i,
        `<meta name="description" content="${description}">`
      );
    } else {
      html = html.replace(
        /<\/head>/i,
        `<meta name="description" content="${description}">\n</head>`
      );
    }

    // Avoid duplicate tags when the page is requested.
    const seoTags = `
<link rel="canonical" href="${SITE_URL}/">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Photo QR NEST SD",
  "url": "${SITE_URL}/",
  "description": "${description}",
  "applicationCategory": "UtilitiesApplication",
  "operatingSystem": "Any",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "INR"
  }
}
</script>`;

    // Remove older copies of tags this route manages, then add one copy.
    html = html
      .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, '')
      .replace(/<meta\s+name=["']robots["'][^>]*>\s*/gi, '')
      .replace(/<meta\s+property=["']og:type["'][^>]*>\s*/gi, '')
      .replace(/<meta\s+property=["']og:url["'][^>]*>\s*/gi, '')
      .replace(/<meta\s+property=["']og:title["'][^>]*>\s*/gi, '')
      .replace(/<meta\s+property=["']og:description["'][^>]*>\s*/gi, '')
      .replace(/<meta\s+name=["']twitter:card["'][^>]*>\s*/gi, '')
      .replace(/<meta\s+name=["']twitter:title["'][^>]*>\s*/gi, '')
      .replace(/<meta\s+name=["']twitter:description["'][^>]*>\s*/gi, '')
      .replace(/<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');

    html = html.replace(/<\/head>/i, `${seoTags}\n</head>`);

    res.set('Cache-Control', 'no-cache');
    res.type('html').send(html);
  } catch (err) {
    next(err);
  }
});

app.use(express.static(PUBLIC_DIR, {
  etag: true,
  maxAge: '1h',
  index: false
}));

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.path === '/health'
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_BYTES,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'image/webp'
    ]);

    cb(
      allowed.has(file.mimetype)
        ? null
        : new Error('Only JPEG, PNG, or WebP images are accepted.'),
      allowed.has(file.mimetype)
    );
  }
});

function safeExt(format) {
  return format === 'png'
    ? '.png'
    : format === 'webp'
      ? '.webp'
      : '.jpg';
}

async function cleanupExpired() {
  const now = Date.now();
  const names = await fs.promises.readdir(DATA_DIR).catch(() => []);

  for (const name of names) {
    if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) {
      continue;
    }

    const file = path.join(DATA_DIR, name);

    try {
      const st = await fs.promises.stat(file);

      if (now - st.mtimeMs > TTL_MS) {
        await fs.promises.unlink(file);
      }
    } catch (_) {}
  }
}

setInterval(cleanupExpired, 10 * 60 * 1000).unref();
cleanupExpired();

// API health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uploadMaxBytes: MAX_BYTES,
    retentionHours: 24
  });
});

// Upload and process photo
app.post('/api/upload', upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Choose a JPEG, PNG, or WebP image first.'
      });
    }

    const id = crypto.randomBytes(16).toString('hex');

    const image = sharp(req.file.buffer, {
      limitInputPixels: 25000000,
      failOn: 'error'
    });

    const meta = await image.metadata();
    let format;
    let output;

    if (meta.format === 'png') {
      format = 'png';
      output = await image.png({
        compressionLevel: 8
      }).toBuffer();
    } else if (meta.format === 'webp') {
      format = 'webp';
      output = await image.webp({
        quality: 88
      }).toBuffer();
    } else if (meta.format === 'jpeg') {
      format = 'jpeg';
      output = await image.jpeg({
        quality: 88,
        mozjpeg: true
      }).toBuffer();
    } else {
      return res.status(415).json({
        error: 'Image contents must be JPEG, PNG, or WebP.'
      });
    }

    const filename = id + safeExt(format);

    await fs.promises.writeFile(
      path.join(DATA_DIR, filename),
      output,
      {
        flag: 'wx',
        mode: 0o600
      }
    );

    const origin = BASE_URL || `${req.protocol}://${req.get('host')}`;

    return res.status(201).json({
      url: `${origin}/photo/${id}`,
      expiresInHours: 24,
      message: 'Anyone with this link can view the photo; scheduled deletion is best-effort.'
    });
  } catch (e) {
    next(e);
  }
});

// QR scan opens a photo page
app.get('/photo/:id', async (req, res) => {
  if (!/^[a-f0-9]{32}$/.test(req.params.id)) {
    return res.status(404).send('Photo not found or expired.');
  }

  const id = req.params.id;
  let found = false;

  for (const ext of ['.jpg', '.png', '.webp']) {
    const file = path.join(DATA_DIR, id + ext);

    try {
      const st = await fs.promises.stat(file);

      if (Date.now() - st.mtimeMs > TTL_MS) {
        await fs.promises.unlink(file).catch(() => {});
        return res.status(404).send('Photo expired.');
      }

      found = true;
      break;
    } catch (_) {}
  }

  if (!found) {
    return res.status(404).send('Photo not found or expired.');
  }

  res.set('Cache-Control', 'no-store');

  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photo QR NEST SD</title>
<meta name="robots" content="noindex, follow">
<style>
*{box-sizing:border-box}
body{margin:0;padding:12px;background:#f5f7fb;font-family:Arial,sans-serif;text-align:center}
.card{max-width:720px;margin:0 auto;background:#fff;padding:10px;border-radius:12px}
.photo{display:block;width:100%;height:auto;max-height:82vh;object-fit:contain;margin:auto}
.brand{font-size:14px;font-weight:700;color:#2446a8;margin-top:9px}
.address{font-size:11px;color:#687386;margin-top:3px;overflow-wrap:anywhere}
</style>
</head>
<body>
<main class="card">
<img class="photo" src="/photo-file/${id}" alt="Shared photo">
<div class="brand">Photo QR NEST SD</div>
<div class="address">photo-qr-nest-sd.onrender.com</div>
</main>
</body>
</html>`);
});

// Serve the actual uploaded image
app.get('/photo-file/:id', async (req, res) => {
  if (!/^[a-f0-9]{32}$/.test(req.params.id)) {
    return res.status(404).send('Photo not found or expired.');
  }

  for (const ext of ['.jpg', '.png', '.webp']) {
    const file = path.join(DATA_DIR, req.params.id + ext);

    try {
      const st = await fs.promises.stat(file);

      if (Date.now() - st.mtimeMs > TTL_MS) {
        await fs.promises.unlink(file).catch(() => {});
        return res.status(404).send('Photo expired.');
      }

      res.set('Cache-Control', 'public, max-age=300');
      res.set('X-Content-Type-Options', 'nosniff');

      res.type(
        ext === '.png'
          ? 'png'
          : ext === '.webp'
            ? 'webp'
            : 'jpg'
      );

      return res.sendFile(file);
    } catch (_) {}
  }

  return res.status(404).send('Photo not found or expired.');
});

// Error handling
app.use((err, _req, res, _next) => {
  if (
    err instanceof multer.MulterError &&
    err.code === 'LIMIT_FILE_SIZE'
  ) {
    return res.status(413).json({
      error: 'Image exceeds the 5 MB limit.'
    });
  }

  if (err) {
    return res.status(400).json({
      error: err.message || 'Request failed.'
    });
  }

  return res.status(500).json({
    error: 'Server error.'
  });
});

app.listen(PORT, () => {
  console.log(`Photo QR NEST SD backend listening on port ${PORT}`);
});
