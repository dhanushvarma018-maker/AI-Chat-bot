import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { geminiService } from './geminiService.js';
import { supabaseService } from './supabaseService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-gemini-api-key']
}));
app.use(express.json({ limit: '10mb' }));

// Serve frontend static files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Available Gemini models for client selection
const AVAILABLE_MODELS = [
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', description: 'Recommended: Latest high-speed intelligence', recommended: true },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', description: 'Ultra-fast low-latency responses' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Capable multimodal model' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Deep reasoning, complex coding, and analysis' }
];

/**
 * Public client configuration endpoint (supplies public keys to frontend)
 */
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    supabaseConfigured: supabaseService.isConfigured(),
    defaultModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  });
});

/**
 * Health check & configuration status endpoint
 */
app.get('/api/status', (req, res) => {
  const customKey = req.headers['x-gemini-api-key'];
  const hasGeminiKey = geminiService.isConfigured(customKey);
  const hasSupabase = supabaseService.isConfigured();

  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    apiKeyConfigured: hasGeminiKey,
    supabaseConfigured: hasSupabase,
    defaultModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    nodeVersion: process.version
  });
});

/**
 * Return list of available Gemini models
 */
app.get('/api/models', (req, res) => {
  res.json({
    models: AVAILABLE_MODELS,
    defaultModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  });
});

/**
 * Supabase Conversations API: List all conversations
 */
app.get('/api/conversations', async (req, res) => {
  try {
    const conversations = await supabaseService.getConversations();
    res.json({ success: true, conversations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Supabase Conversations API: Create a new conversation
 */
app.post('/api/conversations', async (req, res) => {
  try {
    const { title, model } = req.body;
    const conversation = await supabaseService.createConversation(title, model);
    res.json({ success: true, conversation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Supabase Conversations API: Get messages for a conversation
 */
app.get('/api/conversations/:id/messages', async (req, res) => {
  try {
    const messages = await supabaseService.getMessages(req.params.id);
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Supabase Conversations API: Delete a conversation
 */
app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const ok = await supabaseService.deleteConversation(req.params.id);
    res.json({ success: ok });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Chat endpoint handling both streaming and standard JSON responses with Supabase database persistence
 */
app.post('/api/chat', async (req, res) => {
  try {
    let { message, history = [], model, systemInstruction, stream = true, conversationId } = req.body;
    const apiKey = req.headers['x-gemini-api-key'];

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message text is required.' });
    }

    // Check if API key is configured
    if (!geminiService.isConfigured(apiKey)) {
      return res.status(401).json({
        error: 'Gemini API Key is missing. Please configure GEMINI_API_KEY in backend/.env or enter it in the app settings.'
      });
    }

    const selectedModel = model || process.env.GEMINI_MODEL || 'gemini-3.5-flash';

    // If Supabase is configured and no conversationId provided, create one
    if (supabaseService.isConfigured() && !conversationId) {
      const title = message.slice(0, 35).trim() + (message.length > 35 ? '...' : '');
      const newConv = await supabaseService.createConversation(title, selectedModel);
      if (newConv) conversationId = newConv.id;
    }

    // Persist user message to Supabase
    if (conversationId && supabaseService.isConfigured()) {
      await supabaseService.saveMessage({
        conversationId,
        role: 'user',
        content: message.trim()
      });
    }

    const wantsStream = stream === true || req.headers.accept?.includes('text/event-stream');

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      // Emit conversationId to client if created
      if (conversationId) {
        res.write(`data: ${JSON.stringify({ conversationId })}\n\n`);
      }

      // Stream accumulator for database storage
      let fullAssistantText = '';
      const customRes = {
        write: (chunk) => {
          try {
            const raw = chunk.replace(/^data:\s*/, '').trim();
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed.text) fullAssistantText += parsed.text;
            }
          } catch (e) {}
          return res.write(chunk);
        },
        end: async () => {
          // Save complete bot response to Supabase
          if (conversationId && fullAssistantText && supabaseService.isConfigured()) {
            await supabaseService.saveMessage({
              conversationId,
              role: 'model',
              content: fullAssistantText
            });
          }
          res.end();
        }
      };

      await geminiService.streamResponse({
        message,
        history,
        model: selectedModel,
        systemInstruction,
        apiKey,
        res: customRes
      });
    } else {
      // Standard JSON response
      const result = await geminiService.generateResponse({
        message,
        history,
        model: selectedModel,
        systemInstruction,
        apiKey
      });

      // Save bot response to Supabase
      if (conversationId && result.text && supabaseService.isConfigured()) {
        await supabaseService.saveMessage({
          conversationId,
          role: 'model',
          content: result.text
        });
      }

      res.json({
        success: true,
        text: result.text,
        model: result.model,
        conversationId
      });
    }
  } catch (error) {
    console.error('API /api/chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || 'Internal Server Error while communicating with Gemini.'
      });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

// Fallback middleware to serve frontend index.html for SPA client routing
app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'Endpoint not found' });
  }
});

// Start Express server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Gemini Chatbot Backend Server Running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔑 Gemini API Key: ${geminiService.isConfigured() ? '✅ Configured (.env)' : '⚠️ Not configured yet'}`);
  console.log(`📦 Supabase DB:     ${supabaseService.isConfigured() ? '✅ Connected' : '⚠️ Not configured yet (.env)'}`);
  console.log(`📁 Frontend:        ${frontendPath}`);
  console.log(`======================================================\n`);
});
