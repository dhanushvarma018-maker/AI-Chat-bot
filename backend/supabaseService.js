import { createClient } from '@supabase/supabase-js';

/**
 * Service to manage Supabase database persistence for conversations and messages.
 */
class SupabaseService {
  constructor() {
    this.client = null;
    this.initClient();
  }

  /**
   * Initialize Supabase client if environment variables exist
   */
  initClient() {
    const url = process.env.SUPABASE_URL?.trim();
    // Prefer service role key if available for backend operations, else anon key
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim());

    if (url && key && url !== 'https://your-project-ref.supabase.co' && !url.includes('placeholder')) {
      try {
        this.client = createClient(url, key, {
          auth: { persistSession: false }
        });
        console.log('📦 Supabase Client initialized successfully.');
      } catch (err) {
        console.error('Failed to initialize Supabase client:', err.message);
        this.client = null;
      }
    } else {
      this.client = null;
    }
  }

  /**
   * Check if Supabase connection is active and configured
   */
  isConfigured() {
    if (!this.client) {
      this.initClient();
    }
    return Boolean(this.client);
  }

  /**
   * Create a new conversation record
   * @param {string} [title] 
   * @param {string} [model] 
   * @returns {Promise<object|null>}
   */
  async createConversation(title = 'New Chat', model = 'gemini-2.5-flash') {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client
        .from('conversations')
        .insert([{ title, model }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('Supabase createConversation error:', err.message);
      return null;
    }
  }

  /**
   * List all conversations ordered by creation date
   */
  async getConversations() {
    if (!this.isConfigured()) return [];
    try {
      const { data, error } = await this.client
        .from('conversations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('Supabase getConversations error:', err.message);
      return [];
    }
  }

  /**
   * Get all messages for a given conversation ID
   * @param {string} conversationId 
   */
  async getMessages(conversationId) {
    if (!this.isConfigured() || !conversationId) return [];
    try {
      const { data, error } = await this.client
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('Supabase getMessages error:', err.message);
      return [];
    }
  }

  /**
   * Insert a message into the database
   * @param {object} param0 
   * @param {string} param0.conversationId
   * @param {'user'|'model'|'system'} param0.role
   * @param {string} param0.content
   */
  async saveMessage({ conversationId, role, content }) {
    if (!this.isConfigured() || !conversationId || !content) return null;
    try {
      const { data, error } = await this.client
        .from('messages')
        .insert([{
          conversation_id: conversationId,
          role: role === 'assistant' ? 'model' : role,
          content
        }])
        .select()
        .single();

      if (error) throw error;

      // Update conversation updated_at timestamp
      await this.client
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      return data;
    } catch (err) {
      console.warn('Supabase saveMessage error:', err.message);
      return null;
    }
  }

  /**
   * Update a conversation's title
   */
  async updateTitle(conversationId, title) {
    if (!this.isConfigured() || !conversationId) return false;
    try {
      const { error } = await this.client
        .from('conversations')
        .update({ title })
        .eq('id', conversationId);
      return !error;
    } catch (err) {
      console.warn('Supabase updateTitle error:', err.message);
      return false;
    }
  }

  /**
   * Delete a conversation and its messages (cascades)
   */
  async deleteConversation(conversationId) {
    if (!this.isConfigured() || !conversationId) return false;
    try {
      const { error } = await this.client
        .from('conversations')
        .delete()
        .eq('id', conversationId);
      return !error;
    } catch (err) {
      console.warn('Supabase deleteConversation error:', err.message);
      return false;
    }
  }
}

export const supabaseService = new SupabaseService();
