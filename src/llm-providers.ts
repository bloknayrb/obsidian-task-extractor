/*
 * LLM Provider implementations and service detection
 */

import { ExtractorSettings, LLMService } from './types';

export class LLMProviderManager {
  private serviceCache: Map<string, LLMService> = new Map();
  private cloudModelCache: Map<string, string[]> = new Map();
  private apiKeyMissingNotified: Set<string> = new Set();

  constructor(private settings: ExtractorSettings) {}

  // Get service with 30-minute cache TTL
  async getService(provider: string): Promise<LLMService | null> {
    const cached = this.serviceCache.get(provider);
    const now = Date.now();
    const cacheValidMs = 30 * 60 * 1000; // 30 minutes
    
    if (cached && (now - cached.lastChecked) < cacheValidMs) {
      return cached;
    }
    
    return await this.detectSingleService(provider);
  }

  // Detect a single service instead of all services
  private async detectSingleService(provider: string): Promise<LLMService | null> {
    const now = Date.now();
    
    if (provider === 'ollama') {
      const service: LLMService = {
        name: 'ollama',
        url: this.settings.ollamaUrl,
        available: false,
        models: [],
        lastChecked: now
      };
      
      try {
        const response = await fetch(`${this.settings.ollamaUrl}/api/tags`, {
          signal: this.createTimeoutSignal(5000)
        });
        
        if (response.ok) {
          const data = await response.json();
          service.available = true;
          service.models = data.models?.map((m: any) => m.name) || [];
        }
      } catch (error) {
        console.log('Ollama not available:', error.message);
      }
      
      this.serviceCache.set('ollama', service);
      return service;
    }
    
    if (provider === 'lmstudio') {
      const service: LLMService = {
        name: 'lmstudio',
        url: this.settings.lmstudioUrl,
        available: false,
        models: [],
        lastChecked: now
      };
      
      try {
        const response = await fetch(`${this.settings.lmstudioUrl}/v1/models`, {
          signal: this.createTimeoutSignal(5000)
        });
        
        if (response.ok) {
          const data = await response.json();
          service.available = true;
          service.models = data.data?.map((m: any) => m.id) || [];
        }
      } catch (error) {
        console.log('LM Studio not available:', error.message);
      }
      
      this.serviceCache.set('lmstudio', service);
      return service;
    }
    
    return null;
  }

  // Legacy method for backward compatibility
  async detectServices(): Promise<Map<string, LLMService>> {
    await this.getService('ollama');
    await this.getService('lmstudio');
    return this.serviceCache;
  }

  getAvailableServices(): LLMService[] {
    return Array.from(this.serviceCache.values()).filter(s => s.available);
  }

  // Provider-agnostic LLM call with fallback support
  async callLLM(systemPrompt: string, userPrompt: string): Promise<string | null> {
    const provider = this.settings.provider;
    
    // Check if API key is required for cloud providers (only notify once per provider)
    if (['openai', 'anthropic'].includes(provider) && !this.settings.apiKey) {
      const notificationKey = `${provider}-no-api-key`;
      if (!this.apiKeyMissingNotified.has(notificationKey)) {
        // Note: Notice would need to be passed in or handled by caller
        console.warn(`Task Extractor: ${provider.toUpperCase()} API key not configured in plugin settings`);
        this.apiKeyMissingNotified.add(notificationKey);
      }
      return null;
    }
    
    // Clear notification flag if API key is present
    if (this.settings.apiKey) {
      this.apiKeyMissingNotified.delete(`${provider}-no-api-key`);
    }
    
    // Try primary provider with retries
    for (let attempt = 0; attempt < this.settings.retries; attempt++) {
      try {
        let result: string | null = null;
        
        switch (provider) {
          case 'openai':
            result = await this.callOpenAI(systemPrompt, userPrompt);
            break;
          case 'anthropic':
            result = await this.callAnthropic(systemPrompt, userPrompt);
            break;
          case 'ollama':
            result = await this.callOllama(systemPrompt, userPrompt);
            break;
          case 'lmstudio':
            result = await this.callLMStudio(systemPrompt, userPrompt);
            break;
          default:
            throw new Error(`Unsupported provider: ${provider}`);
        }
        
        if (result) return result;
        
      } catch (error) {
        console.warn(`Attempt ${attempt + 1} failed for ${provider}:`, error.message);
        
        if (attempt === this.settings.retries - 1) {
          // Last attempt failed, try fallback for local providers
          if (['ollama', 'lmstudio'].includes(provider)) {
            return await this.tryLocalFallback(systemPrompt, userPrompt);
          }
        } else {
          // Wait before retry with linear backoff
          await this.delay(1000 * (attempt + 1));
        }
      }
    }
    
    return null;
  }

  private async tryLocalFallback(systemPrompt: string, userPrompt: string): Promise<string | null> {
    const availableServices = this.getAvailableServices();
    
    for (const service of availableServices) {
      if (service.name === this.settings.provider) continue; // Skip primary that already failed
      
      try {
        console.log(`Trying fallback to ${service.name}`);
        
        if (service.name === 'ollama') {
          return await this.callOllama(systemPrompt, userPrompt);
        } else if (service.name === 'lmstudio') {
          return await this.callLMStudio(systemPrompt, userPrompt);
        }
      } catch (error) {
        console.warn(`Fallback to ${service.name} failed:`, error.message);
      }
    }
    
    console.warn('Task Extractor: All LLM services failed. Check your configuration.');
    return null;
  }

  private async callOpenAI(systemPrompt: string, userPrompt: string): Promise<string | null> {
    const endpoint = 'https://api.openai.com/v1/chat/completions';
    const body = {
      model: this.settings.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: this.settings.temperature,
      max_tokens: this.settings.maxTokens
    };

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: this.createTimeoutSignal(this.settings.timeout * 1000)
      });
      
      if (!resp.ok) {
        const text = await resp.text();
        console.error('OpenAI error', resp.status, text);
        throw new Error(`OpenAI API error: ${resp.status} ${resp.statusText}`);
      }
      
      const json = await resp.json();
      return json?.choices?.[0]?.message?.content || null;
    } catch (e) {
      console.error('callOpenAI error', e);
      throw e;
    }
  }

  private async callAnthropic(systemPrompt: string, userPrompt: string): Promise<string | null> {
    const endpoint = 'https://api.anthropic.com/v1/messages';
    
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': this.settings.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.settings.model || 'claude-3-sonnet-20240229',
          max_tokens: this.settings.maxTokens,
          temperature: this.settings.temperature,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: userPrompt
          }]
        }),
        signal: this.createTimeoutSignal(this.settings.timeout * 1000)
      });
      
      if (!resp.ok) {
        const text = await resp.text();
        console.error('Anthropic error', resp.status, text);
        throw new Error(`Anthropic API error: ${resp.status} ${resp.statusText}`);
      }
      
      const json = await resp.json();
      return json?.content?.[0]?.text || null;
    } catch (e) {
      console.error('callAnthropic error', e);
      throw e;
    }
  }

  private async callOllama(systemPrompt: string, userPrompt: string): Promise<string | null> {
    const service = await this.getService('ollama');
    if (!service?.available || !service.models.length) {
      throw new Error('Ollama service not available or no models loaded');
    }
    
    // Use configured model or first available model
    const model = service.models.includes(this.settings.model) 
      ? this.settings.model 
      : service.models[0];
    
    const endpoint = `${this.settings.ollamaUrl}/api/chat`;
    
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          stream: false,
          options: {
            temperature: this.settings.temperature,
            num_predict: this.settings.maxTokens
          }
        }),
        signal: this.createTimeoutSignal(this.settings.timeout * 1000)
      });
      
      if (!resp.ok) {
        const text = await resp.text();
        console.error('Ollama error', resp.status, text);
        throw new Error(`Ollama API error: ${resp.status} ${resp.statusText}`);
      }
      
      const json = await resp.json();
      return json?.message?.content || null;
    } catch (e) {
      console.error('callOllama error', e);
      throw e;
    }
  }

  private async callLMStudio(systemPrompt: string, userPrompt: string): Promise<string | null> {
    const service = await this.getService('lmstudio');
    if (!service?.available || !service.models.length) {
      throw new Error('LM Studio service not available or no models loaded');
    }
    
    // Use configured model or first available model
    const model = service.models.includes(this.settings.model) 
      ? this.settings.model 
      : service.models[0];
    
    const endpoint = `${this.settings.lmstudioUrl}/v1/chat/completions`;
    
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer lm-studio', // Placeholder auth
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: this.settings.temperature,
          max_tokens: this.settings.maxTokens
        }),
        signal: this.createTimeoutSignal(this.settings.timeout * 1000)
      });
      
      if (!resp.ok) {
        const text = await resp.text();
        console.error('LM Studio error', resp.status, text);
        throw new Error(`LM Studio API error: ${resp.status} ${resp.statusText}`);
      }
      
      const json = await resp.json();
      return json?.choices?.[0]?.message?.content || null;
    } catch (e) {
      console.error('callLMStudio error', e);
      throw e;
    }
  }

  // Fetch available models for cloud providers
  async fetchCloudModels(provider: 'openai' | 'anthropic'): Promise<string[]> {
    if (!this.settings.apiKey) {
      return [];
    }
    
    // Check cache first
    const cacheKey = `${provider}-${this.settings.apiKey.slice(-4)}`; // Use last 4 chars for cache key
    if (this.cloudModelCache.has(cacheKey)) {
      return this.cloudModelCache.get(cacheKey) || [];
    }
    
    try {
      if (provider === 'openai') {
        return await this.fetchOpenAIModels();
      } else if (provider === 'anthropic') {
        return await this.fetchAnthropicModels();
      }
    } catch (error) {
      console.warn(`Failed to fetch ${provider} models:`, error.message);
      return this.getDefaultModels(provider);
    }
    
    return [];
  }

  private async fetchOpenAIModels(): Promise<string[]> {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${this.settings.apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: this.createTimeoutSignal(10000)
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const models = data.data
      ?.filter((model: any) => model.id.includes('gpt') && !model.id.includes('instruct'))
      ?.map((model: any) => model.id)
      ?.sort() || [];
    
    // Cache the results
    const cacheKey = `openai-${this.settings.apiKey.slice(-4)}`;
    this.cloudModelCache.set(cacheKey, models);
    
    return models.length > 0 ? models : this.getDefaultModels('openai');
  }

  private async fetchAnthropicModels(): Promise<string[]> {
    // Anthropic doesn't have a models endpoint, so return known models
    const knownModels = [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022', 
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
    
    // Cache the results
    const cacheKey = `anthropic-${this.settings.apiKey.slice(-4)}`;
    this.cloudModelCache.set(cacheKey, knownModels);
    
    return knownModels;
  }

  getDefaultModels(provider: string): string[] {
    const defaults = {
      openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
      ollama: ['llama3.2', 'mistral', 'codellama'],
      lmstudio: ['local-model']
    };
    
    return defaults[provider as keyof typeof defaults] || [];
  }

  // Utility methods
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private createTimeoutSignal(ms: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  }

  // Cleanup method
  cleanup() {
    this.cloudModelCache.clear();
    this.apiKeyMissingNotified.clear();
    this.serviceCache.clear();
  }

  // Methods for backward compatibility
  getServiceCache() { return this.serviceCache; }
  getCloudModelCache() { return this.cloudModelCache; }
  getApiKeyMissingNotified() { return this.apiKeyMissingNotified; }
}