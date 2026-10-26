import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cloudflaredPath = path.join(__dirname, 'cloudflared.exe');

async function ensureCloudflared() {
  if (fs.existsSync(cloudflaredPath)) return true;

  console.log('\n⬇️ cloudflared.exe not found in scripts/. Downloading official Cloudflare binary (~55MB)...');
  const url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

  return new Promise((resolve) => {
    const file = fs.createWriteStream(cloudflaredPath);
    const getWithRedirect = (reqUrl) => {
      https.get(reqUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          getWithRedirect(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          console.warn(`Download returned status ${res.statusCode}.`);
          file.close();
          fs.unlink(cloudflaredPath, () => {});
          resolve(false);
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('✅ cloudflared.exe downloaded successfully!\n');
          resolve(true);
        });
      }).on('error', (err) => {
        file.close();
        fs.unlink(cloudflaredPath, () => {});
        console.error('Failed to download cloudflared:', err.message);
        resolve(false);
      });
    };
    getWithRedirect(url);
  });
}

console.log('🚀 Starting Vite Dev Server...');

process.env.VITE_REMOTE = 'true';

const vite = spawn('npx', ['vite', '--host', '0.0.0.0'], {
  shell: true,
  env: { ...process.env, VITE_REMOTE: 'true' }
});

let boundPort = null;
let tunnelSpawned = false;

vite.stdout.on('data', async (d) => {
  const raw = d.toString();
  process.stdout.write(raw);

  // Strip ANSI color codes to cleanly match port
  const clean = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  const portMatch = clean.match(/localhost:(\d+)/i) || clean.match(/192\.168\.\d+\.\d+:(\d+)/i);
  if (portMatch && !boundPort) {
    boundPort = parseInt(portMatch[1], 10);
    await spawnTunnel(boundPort);
  }
});

vite.stderr.on('data', (d) => process.stderr.write(d));

// Fallback: If port not matched within 3s, default to 5173
setTimeout(async () => {
  if (!tunnelSpawned) {
    await spawnTunnel(5173);
  }
}, 3000);

async function spawnTunnel(port) {
  if (tunnelSpawned) return;
  tunnelSpawned = true;

  const hasBinary = await ensureCloudflared();
  if (!hasBinary) {
    console.warn('⚠️ Could not launch Cloudflare tunnel binary. You can access via local IP: http://localhost:' + port);
    return;
  }

  console.log(`\n🌐 Spawning Cloudflare Secure Tunnel for port ${port}...`);

  const tunnel = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${port}`], {
    shell: false
  });

  let foundUrl = false;
  const handleOutput = (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !foundUrl) {
      foundUrl = true;
      const url = match[0];

      console.log('\n=============================================================');
      console.log(' 🥽 META QUEST CLOUDFLARE LINK READY! (NO 503, 100% RELIABLE)');
      console.log('=============================================================');
      console.log(`\n 👉 Headset URL: \x1b[36m\x1b[1m${url}\x1b[0m\n`);
      console.log(' ✨ Backed by Cloudflare with valid SSL.');
      console.log(' ✨ Meta Quest Browser will launch WebXR without any security blocks!');
      console.log('=============================================================\n');
    }
  };

  tunnel.stdout.on('data', handleOutput);
  tunnel.stderr.on('data', handleOutput);

  process.on('SIGINT', () => {
    try { tunnel.kill(); } catch (e) {}
    try { vite.kill(); } catch (e) {}
    process.exit();
  });
}
