import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as os from 'node:os';

const network = new Hono();

type Device = {
  ip: string;
  hostname?: string;
  mac?: string;
  services: string[];
  lastSeen: number;
  status: 'online' | 'offline';
};

const discoveredDevices = new Map<string, Device>();
let isScanning = false;
let scanProgress = 0;
let shouldStopScan = false;

// Topic -> Set of client send functions
const sseClients = new Set<(data: string) => void>();

function broadcast(event: string, data: any) {
  const message = JSON.stringify({ event, data });
  sseClients.forEach((send) => send(message));
}

// Helper to get local subnets
function getLocalSubnets() {
  const interfaces = os.networkInterfaces();
  const subnets: { ip: string; netmask: string; family: string | number; address: string }[] = [];

  for (const [name, infos] of Object.entries(interfaces)) {
    if (!infos) continue;
    for (const info of infos) {
      if (info.internal) continue;
      subnets.push({
        ip: info.address,
        netmask: info.netmask,
        family: info.family,
        address: info.address
      });
    }
  }
  return subnets;
}

async function scanSubnet(ip: string, netmask: string) {
  if (isScanning) return;
  isScanning = true;
  shouldStopScan = false;
  scanProgress = 0;
  broadcast('status', { scanning: true, progress: 0, currentIp: 'Starting...' });

  const parts = ip.split('.').map(Number);
  const maskParts = netmask.split('.').map(Number);
  
  if (parts.length === 4 && maskParts[0] === 255 && maskParts[1] === 255 && maskParts[2] === 255) {
    const base = parts.slice(0, 3).join('.');
    const total = 254;
    
    const ports = [80, 443, 8080, 22, 21, 53, 5000, 3000, 8123]; // Common services
    const chunkSize = 15;

    for (let i = 1; i < 255; i += chunkSize) {
      if (shouldStopScan) break;

      const chunk = [];
      const currentChunkIp = `${base}.${i}`;
      broadcast('status', { scanning: true, progress: scanProgress, currentIp: currentChunkIp });

      for (let j = 0; j < chunkSize && (i + j) < 255; j++) {
        const targetIp = `${base}.${i + j}`;
        if (targetIp === ip) continue;

        chunk.push((async () => {
          // Try multiple common ports
          for (const port of ports) {
            if (shouldStopScan) break;
            try {
              const socket = await Promise.race([
                Bun.connect({
                  hostname: targetIp,
                  port,
                  socket: {
                    data() {},
                    open() { this.end(); },
                    error() {},
                  }
                }),
                new Promise((_, reject) => setTimeout(() => reject('timeout'), 600))
              ]) as any;
              
              if (socket) {
                const service = port === 22 ? 'SSH' : port === 443 ? 'HTTPS' : 'HTTP';
                const device = updateDevice(targetIp, { status: 'online', services: [service] });
                broadcast('device', device);
                break; // Found a service, move to next IP
              }
            } catch (e) {}
          }
        })());
      }
      
      await Promise.allSettled(chunk);
      scanProgress = Math.round((i / total) * 100);
    }
  }

  isScanning = false;
  broadcast('status', { scanning: false, progress: 100, currentIp: 'Done' });
}

function updateDevice(ip: string, data: Partial<Device>) {
  const existing = discoveredDevices.get(ip) || {
    ip,
    services: [],
    lastSeen: Date.now(),
    status: 'online'
  };
  
  const updated = {
    ...existing,
    ...data,
    services: [...new Set([...existing.services, ...(data.services || [])])],
    lastSeen: Date.now()
  };
  
  discoveredDevices.set(ip, updated);
  return updated;
}

network.get('/devices', (c) => {
  return c.json(Array.from(discoveredDevices.values()));
});

network.post('/discover', (c) => {
  if (isScanning) return c.json({ error: 'Scan already in progress' }, 400);
  
  const subnets = getLocalSubnets();
  console.log(`[Network] Starting discovery. Found subnets:`, subnets.map(s => `${s.address}/${s.netmask}`));
  
  const ipv4 = subnets.find(s => s.family === 'IPv4' || s.family === 4);
  
  if (ipv4) {
    console.log(`[Network] Scanning IPv4 subnet: ${ipv4.address}/${ipv4.netmask}`);
    scanSubnet(ipv4.address, ipv4.netmask);
    return c.json({ message: 'Discovery started' });
  }
  
  console.warn(`[Network] No suitable IPv4 subnet found for scanning.`);
  return c.json({ error: 'No suitable network interface found' }, 400);
});

network.post('/stop', (c) => {
  shouldStopScan = true;
  return c.json({ message: 'Stop requested' });
});

network.get('/events', (c) => {
  return streamSSE(c, async (stream) => {
    const send = (data: string) => {
      stream.writeSSE({ data });
    };

    sseClients.add(send);
    
    // Send initial state
    stream.writeSSE({ 
      data: JSON.stringify({ event: 'status', data: { scanning: isScanning, progress: scanProgress } }) 
    });

    stream.onAbort(() => {
      sseClients.delete(send);
    });

    // Keep alive
    while (true) {
      await stream.sleep(30000);
      try {
        await stream.writeSSE({ event: 'ping', data: 'heartbeat' });
      } catch {
        break;
      }
    }
  });
});

export default network;
