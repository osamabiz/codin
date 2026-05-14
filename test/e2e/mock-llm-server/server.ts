import express from 'express';
import path from 'path';
import fs from 'fs';

interface ResponseEvent {
  delayMs?: number;
  data: unknown;
}

interface ResponseScript {
  description: string;
  events: ResponseEvent[];
}

const app = express();
app.use(express.json());

let activeScript: ResponseScript | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

app.post('/set-script', (req, res) => {
  activeScript = req.body as ResponseScript;
  res.json({ ok: true });
});

// Load script by name from the scripts/ directory
app.get('/load-script/:name', (req, res) => {
  const scriptPath = path.join(__dirname, 'scripts', `${req.params['name']}.json`);
  try {
    const raw = fs.readFileSync(scriptPath, 'utf-8');
    activeScript = JSON.parse(raw) as ResponseScript;
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ ok: false, error: String(err) });
  }
});

// Mimics Anthropic Messages API with streaming
app.post('/v1/messages', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!activeScript) {
    res.write('data: {"type":"error","error":{"type":"api_error","message":"No script loaded"}}\n\n');
    res.end();
    return;
  }

  for (const event of activeScript.events) {
    await sleep(event.delayMs ?? 20);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  }
  res.end();
});

// Mimics OpenAI Chat Completions API (streaming)
app.post('/v1/chat/completions', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  if (!activeScript) {
    res.write('data: {"error":"No script loaded"}\n\ndata: [DONE]\n\n');
    res.end();
    return;
  }

  for (const event of activeScript.events) {
    await sleep(event.delayMs ?? 20);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

const PORT = 3399;
app.listen(PORT, () => {
  console.log(`Mock LLM server on :${PORT}`);
});
