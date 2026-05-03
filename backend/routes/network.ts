import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as os from 'node:os';
import * as dgram from 'node:dgram';
import * as dns from 'node:dns/promises';

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

// mDNS & SSDP Discovery (finds smart devices, routers, etc.)
function startServiceDiscovery() {
  const mdnsSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const ssdpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  
  // mDNS Discovery
  mdnsSocket.on('message', (msg, rinfo) => {
    updateDevice(rinfo.address, { services: ['mDNS'] });
    broadcast('device', discoveredDevices.get(rinfo.address));
  });

  // SSDP Discovery
  ssdpSocket.on('message', (msg, rinfo) => {
    const s = msg.toString();
    if (s.includes('HTTP/1.1 200 OK') || s.includes('NOTIFY * HTTP/1.1')) {
      updateDevice(rinfo.address, { services: ['UPnP'] });
      broadcast('device', discoveredDevices.get(rinfo.address));
    }
  });

  try {
    mdnsSocket.bind(5353, () => {
      mdnsSocket.addMembership('224.0.0.251');
      // Send a "discovery" query to nudge devices to respond
      const query = Buffer.from([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x09, 0x5f, 0x73, 0x65, 0x72, 0x76, 0x69, 0x63, 0x65, 0x73, 0x07, 0x5f, 0x64, 0x6e, 0x73, 0x2d, 0x73, 0x64, 0x04, 0x5f, 0x75, 0x64, 0x70, 0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, 0x00,
        0x00, 0x0c, 0x00, 0x01
      ]);
      mdnsSocket.send(query, 5353, '224.0.0.251');
    });

    ssdpSocket.bind(0, () => {
      const query = Buffer.from(
        'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: 239.255.255.250:1900\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 1\r\n' +
        'ST: ssdp:all\r\n' +
        '\r\n'
      );
      ssdpSocket.send(query, 1900, '239.255.255.250');
    });

    setTimeout(() => {
      mdnsSocket.close();
      ssdpSocket.close();
    }, 15000);
  } catch (e) {
    console.error('[Network] Service Discovery failed:', e);
  }
}

async function scanSubnet(ip: string, netmask: string) {
  if (isScanning) return;
  isScanning = true;
  shouldStopScan = false;
  scanProgress = 0;
  broadcast('status', { scanning: true, progress: 0, currentIp: 'Initializing...' });

  // Start mDNS/SSDP in parallel
  startServiceDiscovery();

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

  // Try to resolve hostname in background if not already known
  if (!updated.hostname) {
    dns.reverse(ip)
      .then(hostnames => {
        if (hostnames && hostnames.length > 0) {
          updated.hostname = hostnames[0];
          broadcast('device', updated);
        }
      })
      .catch(() => {
        // Many local IPs won't have reverse DNS, ignore errors
      });
  }

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
