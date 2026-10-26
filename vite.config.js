import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';
import path from 'path';

/**
 * PC Video Library & Streaming Plugin:
 * - Scans `videos/` folder on your PC
 * - Serves videos over HTTP Range requests (HTTP 206) for smooth VR buffering
 * - Provides /api/videos to list all PC dance videos
 * - Provides /api/save-choreo to cache extracted AI choreography directly onto the PC
 */
function pcVideoLibraryPlugin() {
  const rootDir = typeof import.meta.dirname !== 'undefined' ? import.meta.dirname : process.cwd();
  const videosDir = path.resolve(rootDir, 'videos');
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }

  return {
    name: 'pc-video-library-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];

        // 1. API: List all videos in videos/ folder
        if (url === '/api/videos' && req.method === 'GET') {
          try {
            const files = fs.readdirSync(videosDir);
            const videoExts = new Set(['.mp4', '.webm', '.mov', '.mkv']);
            const items = [];

            for (const file of files) {
              const ext = path.extname(file).toLowerCase();
              if (videoExts.has(ext)) {
                const baseName = path.basename(file, ext);
                const choreoName = `${baseName}.json`;
                const hasChoreo = fs.existsSync(path.join(videosDir, choreoName));
                const stats = fs.statSync(path.join(videosDir, file));
                const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);

                const title = baseName
                  .replace(/[_-]+/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase());

                items.push({
                  filename: file,
                  title,
                  url: `/videos/${encodeURIComponent(file)}`,
                  hasChoreo,
                  choreoUrl: hasChoreo ? `/videos/${encodeURIComponent(choreoName)}` : null,
                  sizeMb
                });
              }
            }

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify({ success: true, videos: items }));
            return;
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
        }

        // 2. API: Save AI-extracted choreography to videos/ folder on PC
        if (url === '/api/save-choreo' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const { filename, choreoData } = data;
              if (!filename || !choreoData) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Missing filename or choreoData' }));
                return;
              }

              const baseName = path.basename(filename, path.extname(filename));
              const targetPath = path.join(videosDir, `${baseName}.json`);
              fs.writeFileSync(targetPath, JSON.stringify(choreoData, null, 2), 'utf-8');

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: `Choreography saved to videos/${baseName}.json`,
                choreoUrl: `/videos/${encodeURIComponent(`${baseName}.json`)}`
              }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // 3. Static Video Streaming with HTTP 206 Partial Content (Range Requests)
        if (url.startsWith('/videos/')) {
          const rawFileName = decodeURIComponent(url.slice(8));
          const filePath = path.join(videosDir, rawFileName);

          if (!fs.existsSync(filePath)) {
            next();
            return;
          }

          const stat = fs.statSync(filePath);
          const ext = path.extname(filePath).toLowerCase();

          // Handle JSON files
          if (ext === '.json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache');
            fs.createReadStream(filePath).pipe(res);
            return;
          }

          // Handle Video Stream
          const mimeTypes = {
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mov': 'video/quicktime',
            '.mkv': 'video/x-matroska'
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          const range = req.headers.range;

          if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });

            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': contentType
            });
            file.pipe(res);
          } else {
            res.writeHead(200, {
              'Content-Length': stat.size,
              'Content-Type': contentType,
              'Accept-Ranges': 'bytes'
            });
            fs.createReadStream(filePath).pipe(res);
          }
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const isHttp = process.env.VITE_HTTP === 'true' || process.env.VITE_REMOTE === 'true';

  return {
    plugins: [
      pcVideoLibraryPlugin(),
      ...(isHttp ? [] : [basicSsl()])
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      https: !isHttp,
      allowedHosts: true,
      cors: true
    }
  };
});
