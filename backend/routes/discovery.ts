import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

const discovery = new Hono();

// Topic -> Set of client send functions
const clients = new Map<string, Set<(data: string) => void>>();

discovery.post('/discovery/:topic', async (c) => {
  const topic = c.req.param('topic');
  const body = await c.req.json();
  const topicClients = clients.get(topic);
  
  if (topicClients) {
    // Wrap in ntfy-like structure: { message: JSON_STRING }
    const message = JSON.stringify({ 
      message: JSON.stringify(body),
      topic: topic,
      time: Math.floor(Date.now() / 1000)
    });
    
    topicClients.forEach((send) => send(message));
  }
  
  return c.json({ success: true });
});

discovery.get('/discovery/:topic/sse', (c) => {
  const topic = c.req.param('topic');
  
  return streamSSE(c, async (stream) => {
    const send = (data: string) => {
      stream.writeSSE({ data });
    };

    if (!clients.has(topic)) {
      clients.set(topic, new Set());
    }
    clients.get(topic)!.add(send);

    stream.onAbort(() => {
      const topicSet = clients.get(topic);
      if (topicSet) {
        topicSet.delete(send);
        if (topicSet.size === 0) {
          clients.delete(topic);
        }
      }
    });

    // Keep connection alive with pings
    while (true) {
      await stream.sleep(30000);
      try {
        await stream.writeSSE({ event: 'ping', data: 'heartbeat' });
      } catch (err) {
        break; // Connection closed
      }
    }
  });
});

export default discovery;
