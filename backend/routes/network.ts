import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as os from 'node:os';
import * as dgram from 'node:dgram';

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

// Read Linux ARP table
async function getArpTable(): Promise<Map<string, string>> {
  const arpMap = new Map<string, string>();
  if (process.platform !== 'linux') return arpMap;

  try {
    const content = await Bun.file('/proc/net/arp').text();
    const lines = content.split('\n').slice(1); // skip header
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const ip = parts[0];
        const mac = parts[3];
        if (mac !== '00:00:00:00:00:00') {
          arpMap.set(ip, mac);
        }
      }
    }
  } catch (e) {}
  return arpMap;
}

// mDNS Discovery (finds smart devices)
function startMdnsDiscovery() {
  try {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    
    socket.on('message', (msg, rinfo) => {
      // Basic detection that something is alive and talking mDNS
      updateDevice(rinfo.address, { services: ['mDNS'] });
      broadcast('device', discoveredDevices.get(rinfo.address));
    });

    socket.bind(5353, () => {
      socket.addMembership('224.0.0.251');
    });

    // Stop after 10 seconds
    setTimeout(() => {
      socket.close();
    }, 10000);
  } catch (e) {
    console.error('[Network] mDNS Discovery failed:', e);
  }
}

async function scanSubnet(ip: string, netmask: string) {
  if (isScanning) return;
  isScanning = true;
  shouldStopScan = false;
  scanProgress = 0;
  broadcast('status', { scanning: true, progress: 0, currentIp: 'Initializing...' });

  // Start mDNS in parallel
  startMdnsDiscovery();

  const parts = ip.split('.').map(Number);
  const maskParts = netmask.split('.').map(Number);
  
  if (parts.length === 4 && maskParts[0] === 255 && maskParts[1] === 255 && maskParts[2] === 255) {
    const base = parts.slice(0, 3).join('.');
    const total = 254;
    
    const ports = [80, 443, 8080, 22, 5000, 3000, 8123]; 
    const chunkSize = 15;
    const arpTable = await getArpTable();

    for (let i = 1; i < 255; i += chunkSize) {
      if (shouldStopScan) break;

      const chunk = [];
      const currentChunkIp = `${base}.${i}`;
      broadcast('status', { scanning: true, progress: scanProgress, currentIp: currentChunkIp });

      for (let j = 0; j < chunkSize && (i + j) < 255; j++) {
        const targetIp = `${base}.${i + j}`;
        if (targetIp === ip) continue;

        chunk.push((async () => {
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
                new Promise((_, reject) => setTimeout(() => reject('timeout'), 500))
              ]) as any;
              
              if (socket) {
                const mac = arpTable.get(targetIp);
                const service = port === 22 ? 'SSH' : port === 443 ? 'HTTPS' : 'HTTP';
                const device = updateDevice(targetIp, { status: 'online', services: [service], mac });
                broadcast('device', device);
                break; 
              }
            } catch (e) {}
          }
        })());
      }
      
      await Promise.allSettled(chunk);
      scanProgress = Math.round((i / total) * 100);
      
      // Refresh ARP table periodically during scan
      if (i % 60 === 0) {
        const freshArp = await getArpTable();
        for (const [ip, mac] of freshArp) {
          if (discoveredDevices.has(ip)) {
            const dev = discoveredDevices.get(ip)!;
            if (!dev.mac) {
              dev.mac = mac;
              broadcast('device', dev);
            }
          }
        }
      }
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
  const ipv4 = subnets.find(s => s.family === 'IPv4' || s.family === 4);
  
  if (ipv4) {
    scanSubnet(ipv4.address, ipv4.netmask);
    return c.json({ message: 'Discovery started' });
  }
  
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
    
    stream.writeSSE({ 
      data: JSON.stringify({ event: 'status', data: { scanning: isScanning, progress: scanProgress } }) 
    });

    stream.onAbort(() => {
      sseClients.delete(send);
    });

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
