import { GoogleGenAI } from '@google/genai';

/**
 * Service to handle Google Gemini LLM API calls with multi-turn chat and streaming support.
 */
class GeminiService {
  constructor() {
    this.defaultModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  }

  /**
   * Resolve the active Gemini API key from request headers or environment variables.
   * @param {string} [headerKey] Optional API key provided in request headers.
   * @returns {string} The active API key.
   */
  getApiKey(headerKey) {
    return (headerKey && headerKey.trim()) || process.env.GEMINI_API_KEY || '';
  }

  /**
   * Check if Gemini API key is configured.
   * @param {string} [headerKey]
   * @returns {boolean}
   */
  isConfigured(headerKey) {
    const key = this.getApiKey(headerKey);
    return Boolean(key && key.trim().length > 0 && key !== 'your_gemini_api_key_here');
  }

  /**
   * Format client conversation history into Gemini's expected contents array format.
   * Ensures roles are properly mapped ('assistant' -> 'model') and consecutive roles are merged.
   * @param {Array<{role: string, content: string}>} history
   * @param {string} newMessage
   * @returns {Array<{role: string, parts: Array<{text: string}>}>}
   */
  formatContents(history = [], newMessage = '') {
    const contents = [];

    // Map existing history
    for (const msg of history) {
      if (!msg || !msg.content || typeof msg.content !== 'string') continue;
      const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
      const text = msg.content.trim();
      if (!text) continue;

      // Merge with previous if role is identical (Gemini requires alternating roles)
      const lastItem = contents[contents.length - 1];
      if (lastItem && lastItem.role === role) {
        lastItem.parts[0].text += `\n\n${text}`;
      } else {
        contents.push({
          role,
          parts: [{ text }]
        });
      }
    }

    // Append current new message
    if (newMessage && newMessage.trim()) {
      const text = newMessage.trim();
      const lastItem = contents[contents.length - 1];
      if (lastItem && lastItem.role === 'user') {
        lastItem.parts[0].text += `\n\n${text}`;
      } else {
        contents.push({
          role: 'user',
          parts: [{ text }]
        });
      }
    }

    // Gemini requires the first item to have role 'user'
    if (contents.length > 0 && contents[0].role !== 'user') {
      contents.unshift({
        role: 'user',
        parts: [{ text: 'Hello' }]
      });
    }

    return contents;
  }

  /**
   * Generate a non-streaming response from Gemini.
   */
  async generateResponse({ message, history = [], model, systemInstruction, apiKey: headerKey }) {
    const apiKey = this.getApiKey(headerKey);
    if (!this.isConfigured(headerKey)) {
      throw new Error('GEMINI_API_KEY is not configured. Please set your key in backend/.env or in the UI.');
    }

    const selectedModel = model || this.defaultModel;
    const contents = this.formatContents(history, message);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const config = {};
      if (systemInstruction && systemInstruction.trim()) {
        config.systemInstruction = systemInstruction.trim();
      }

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config
      });

      const replyText = response.text || '';
      return {
        text: replyText,
        model: selectedModel
      };
    } catch (sdkError) {
      console.warn('SDK error, attempting REST fallback:', sdkError.message);
      return await this.generateViaRestFallback({
        apiKey,
        model: selectedModel,
        contents,
        systemInstruction
      });
    }
  }

  /**
   * Stream response from Gemini using Server-Sent Events (SSE).
   */
  async streamResponse({ message, history = [], model, systemInstruction, apiKey: headerKey, res }) {
    const apiKey = this.getApiKey(headerKey);
    if (!this.isConfigured(headerKey)) {
      res.write(`data: ${JSON.stringify({ error: 'GEMINI_API_KEY is not configured. Please set your key in backend/.env or the UI.' })}\n\n`);
      res.end();
      return;
    }

    const selectedModel = model || this.defaultModel;
    const contents = this.formatContents(history, message);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const config = {};
      if (systemInstruction && systemInstruction.trim()) {
        config.systemInstruction = systemInstruction.trim();
      }

      const responseStream = await ai.models.generateContentStream({
        model: selectedModel,
        contents,
        config
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err) {
      console.error('Error during streaming generation:', err);
      res.write(`data: ${JSON.stringify({ error: err.message || 'Error communicating with Gemini API' })}\n\n`);
      res.end();
    }
  }

  /**
   * Fallback using direct REST API call if the SDK fails or has environment discrepancies.
   */
  async generateViaRestFallback({ apiKey, model, contents, systemInstruction }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = { contents };

    if (systemInstruction && systemInstruction.trim()) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction.trim() }]
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      const message = errorJson.error?.message || `Gemini REST API error: HTTP ${res.status}`;
      throw new Error(message);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map(p => p.text).join('') || '';

    return {
      text,
      model
    };
  }
}

export const geminiService = new GeminiService();
