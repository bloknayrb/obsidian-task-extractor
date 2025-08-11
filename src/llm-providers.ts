/*
 * LLM Provider implementations and service detection
 */

import { requestUrl } from 'obsidian';
import { ExtractorSettings, LLMService } from './types';
import { DebugLogger } from './debug-logger';

export class LLMProviderManager {
  private serviceCache: Map<string, LLMService> = new Map();
  private cloudModelCache: Map<string, string[]> = new Map();
  private apiKeyMissingNotified: Set<string> = new Set();

  constructor(private settings: ExtractorSettings, private debugLogger?: DebugLogger) {}

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
    const correlationId = this.debugLogger?.startOperation('service-detection', `Detecting service: ${provider}`, {
      provider,
      timestamp: now
    });
    
    if (provider === 'ollama') {
      const service: LLMService = {
        name: 'ollama',
        url: this.settings.ollamaUrl,
        available: false,
        models: [],
        lastChecked: now
      };
      
      this.debugLogger?.log('info', 'service-detection', 'Checking Ollama availability', {
        provider: 'ollama',
        url: this.settings.ollamaUrl,
        endpoint: `${this.settings.ollamaUrl}/api/tags`
      }, correlationId);
      
      try {
        const startTime = Date.now();
        const rawResponse = await requestUrl({
          url: `${this.settings.ollamaUrl}/api/tags`,
          method: 'GET'
        });
        const response = this.adaptRequestUrlResponse(rawResponse);
        const connectionTime = Date.now() - startTime;
        
        if (response.ok) {
          const data = await response.json();
          service.available = true;
          service.models = data.models?.map((m: any) => m.name) || [];
          
          this.debugLogger?.log('info', 'service-detection', 'Ollama service detected successfully', {
            provider: 'ollama',
            url: this.settings.ollamaUrl,
            available: true,
            modelCount: service.models.length,
            models: service.models,
            connectionTime,
            status: response.status
          }, correlationId);
        } else {
          this.debugLogger?.log('warn', 'service-detection', `Ollama service responded with error: ${response.status}`, {
            provider: 'ollama',
            url: this.settings.ollamaUrl,
            available: false,
            status: response.status,
            connectionTime
          }, correlationId);
        }
      } catch (error) {
        console.log('Ollama not available:', error.message);
        this.debugLogger?.log('warn', 'service-detection', 'Ollama service not available', {
          provider: 'ollama',
          url: this.settings.ollamaUrl,
          available: false,
          error: error.message,
          errorType: error.name
        }, correlationId);
      }
      
      this.serviceCache.set('ollama', service);
      this.debugLogger?.log('info', 'service-detection', 'Ollama service cache updated', {
        provider: 'ollama',
        available: service.available,
        modelCount: service.models.length,
        lastChecked: service.lastChecked
      }, correlationId);
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
      
      this.debugLogger?.log('info', 'service-detection', 'Checking LM Studio availability', {
        provider: 'lmstudio',
        url: this.settings.lmstudioUrl,
        endpoint: `${this.settings.lmstudioUrl}/v1/models`
      }, correlationId);
      
      try {
        const startTime = Date.now();
        const rawResponse = await requestUrl({
          url: `${this.settings.lmstudioUrl}/v1/models`,
          method: 'GET'
        });
        const response = this.adaptRequestUrlResponse(rawResponse);
        const connectionTime = Date.now() - startTime;
        
        if (response.ok) {
          const data = await response.json();
          service.available = true;
          service.models = data.data?.map((m: any) => m.id) || [];
          
          this.debugLogger?.log('info', 'service-detection', 'LM Studio service detected successfully', {
            provider: 'lmstudio',
            url: this.settings.lmstudioUrl,
            available: true,
            modelCount: service.models.length,
            models: service.models,
            connectionTime,
            status: response.status
          }, correlationId);
        } else {
          this.debugLogger?.log('warn', 'service-detection', `LM Studio service responded with error: ${response.status}`, {
            provider: 'lmstudio',
            url: this.settings.lmstudioUrl,
            available: false,
            status: response.status,
            connectionTime
          }, correlationId);
        }
      } catch (error) {
        console.log('LM Studio not available:', error.message);
        this.debugLogger?.log('warn', 'service-detection', 'LM Studio service not available', {
          provider: 'lmstudio',
          url: this.settings.lmstudioUrl,
          available: false,
          error: error.message,
          errorType: error.name
        }, correlationId);
      }
      
      this.serviceCache.set('lmstudio', service);
      this.debugLogger?.log('info', 'service-detection', 'LM Studio service cache updated', {
        provider: 'lmstudio',
        available: service.available,
        modelCount: service.models.length,
        lastChecked: service.lastChecked
      }, correlationId);
      return service;
    }
    
    this.debugLogger?.log('warn', 'service-detection', `Unknown provider requested: ${provider}`, {
      provider,
      supportedProviders: ['ollama', 'lmstudio']
    }, correlationId);
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
    const correlationId = this.debugLogger?.startOperation('llm-call', `Starting LLM call with provider: ${provider}`, {
      provider,
      model: this.settings.model
    });
    
    // Check if API key is required for cloud providers (only notify once per provider)
    if (['openai', 'anthropic'].includes(provider) && (!this.settings.apiKey || this.settings.apiKey.trim().length === 0)) {
      const notificationKey = `${provider}-no-api-key`;
      if (!this.apiKeyMissingNotified.has(notificationKey)) {
        // Note: Notice would need to be passed in or handled by caller
        console.warn(`Task Extractor: ${provider.toUpperCase()} API key not configured in plugin settings`);
        this.apiKeyMissingNotified.add(notificationKey);
        this.debugLogger?.log('error', 'llm-call', `API key missing for ${provider}`, {
          provider,
          notificationKey
        }, correlationId);
      }
      return null;
    }
    
    // Clear notification flag if API key is present
    if (this.settings.apiKey && this.settings.apiKey.trim().length > 0) {
      this.apiKeyMissingNotified.delete(`${provider}-no-api-key`);
    }
    
    // Validate configuration before making requests
    const configValidation = this.validateProviderConfig(provider);
    if (!configValidation.valid) {
      this.debugLogger?.log('error', 'llm-call', `Configuration validation failed for ${provider}`, {
        provider,
        errors: configValidation.errors
      }, correlationId);
      console.error(`Task Extractor: ${provider} configuration errors:`, configValidation.errors.join(', '));
      return null;
    }
    
    // Try primary provider with retries
    for (let attempt = 0; attempt < this.settings.retries; attempt++) {
      const startTime = Date.now();
      this.debugLogger?.log('info', 'llm-call', `Attempt ${attempt + 1}/${this.settings.retries} for ${provider}`, {
        provider,
        model: this.settings.model,
        retryAttempt: attempt + 1
      }, correlationId);
      
      try {
        let result: string | null = null;
        
        switch (provider) {
          case 'openai':
            result = await this.callOpenAI(systemPrompt, userPrompt, correlationId);
            break;
          case 'anthropic':
            result = await this.callAnthropic(systemPrompt, userPrompt, correlationId);
            break;
          case 'ollama':
            result = await this.callOllama(systemPrompt, userPrompt, correlationId);
            break;
          case 'lmstudio':
            result = await this.callLMStudio(systemPrompt, userPrompt, correlationId);
            break;
          default:
            throw new Error(`Unsupported provider: ${provider}`);
        }
        
        if (result) {
          const processingTime = Date.now() - startTime;
          this.debugLogger?.log('info', 'llm-call', `LLM call successful on attempt ${attempt + 1}`, {
            provider,
            model: this.settings.model,
            processingTime,
            retryAttempt: attempt + 1,
            responseLength: result.length
          }, correlationId);
          return result;
        }
        
      } catch (error) {
        const processingTime = Date.now() - startTime;
        console.warn(`Attempt ${attempt + 1} failed for ${provider}:`, error.message);
        this.debugLogger?.log('warn', 'llm-call', `Attempt ${attempt + 1} failed for ${provider}`, {
          provider,
          model: this.settings.model,
          error: error.message,
          processingTime,
          retryAttempt: attempt + 1
        }, correlationId);
        
        if (attempt === this.settings.retries - 1) {
          // Last attempt failed, try fallback for local providers
          if (['ollama', 'lmstudio'].includes(provider)) {
            this.debugLogger?.log('info', 'llm-call', `All attempts failed, trying local fallback`, {
              provider,
              totalAttempts: this.settings.retries
            }, correlationId);
            return await this.tryLocalFallback(systemPrompt, userPrompt, correlationId);
          }
        } else {
          // Wait before retry with linear backoff
          const backoffDelay = 1000 * (attempt + 1);
          this.debugLogger?.log('info', 'llm-call', `Waiting ${backoffDelay}ms before retry`, {
            provider,
            backoffDelay,
            nextAttempt: attempt + 2
          }, correlationId);
          await this.delay(backoffDelay);
        }
      }
    }
    
    return null;
  }

  private async tryLocalFallback(systemPrompt: string, userPrompt: string, correlationId?: string): Promise<string | null> {
    const availableServices = this.getAvailableServices();
    this.debugLogger?.log('info', 'llm-call', `Trying local fallback with ${availableServices.length} available services`, {
      availableServices: availableServices.map(s => s.name),
      primaryProvider: this.settings.provider
    }, correlationId);
    
    for (const service of availableServices) {
      if (service.name === this.settings.provider) continue; // Skip primary that already failed
      
      try {
        console.log(`Trying fallback to ${service.name}`);
        this.debugLogger?.log('info', 'llm-call', `Attempting fallback to ${service.name}`, {
          fallbackProvider: service.name,
          availableModels: service.models
        }, correlationId);
        
        if (service.name === 'ollama') {
          return await this.callOllama(systemPrompt, userPrompt, correlationId);
        } else if (service.name === 'lmstudio') {
          return await this.callLMStudio(systemPrompt, userPrompt, correlationId);
        }
      } catch (error) {
        console.warn(`Fallback to ${service.name} failed:`, error.message);
        this.debugLogger?.log('warn', 'llm-call', `Fallback to ${service.name} failed`, {
          fallbackProvider: service.name,
          error: error.message
        }, correlationId);
      }
    }
    
    console.warn('Task Extractor: All LLM services failed. Check your configuration.');
    this.debugLogger?.log('error', 'llm-call', 'All LLM services failed including fallbacks', {
      primaryProvider: this.settings.provider,
      availableServices: availableServices.map(s => s.name)
    }, correlationId);
    return null;
  }

  private async callOpenAI(systemPrompt: string, userPrompt: string, correlationId?: string): Promise<string | null> {
    const endpoint = 'https://api.openai.com/v1/chat/completions';
    const model = this.settings.model || 'gpt-4o-mini';
    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: this.settings.temperature,
      max_tokens: this.settings.maxTokens
    };

    // Log request with masked API key
    const maskedApiKey = this.settings.apiKey ? `...${this.settings.apiKey.slice(-4)}` : 'none';
    this.debugLogger?.log('info', 'llm-call', 'Sending OpenAI API request', {
      provider: 'openai',
      model,
      endpoint,
      apiKey: maskedApiKey,
      requestPayload: {
        ...body,
        messages: body.messages.map(m => ({ role: m.role, contentLength: m.content.length }))
      }
    }, correlationId);

    try {
      const startTime = Date.now();
      const rawResp = await requestUrl({
        url: endpoint,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const resp = this.adaptRequestUrlResponse(rawResp);
      const processingTime = Date.now() - startTime;
      
      if (!resp.ok) {
        const text = await resp.text();
        console.error('OpenAI error', resp.status, text);
        
        // Provide specific error messages based on status codes  
        let errorMessage = `OpenAI API error: ${resp.status} ${resp.statusText}`;
        if (resp.status === 401) {
          errorMessage += '. Check that your OpenAI API key is valid and properly configured.';
        } else if (resp.status === 400) {
          errorMessage += '. Request format may be invalid - check model name and request parameters.';
        } else if (resp.status === 429) {
          errorMessage += '. Rate limit exceeded - please try again later.';
        } else if (resp.status === 403) {
          errorMessage += '. Access denied - check API key permissions.';
        }
        
        this.debugLogger?.log('error', 'llm-call', `OpenAI API error: ${resp.status}`, {
          provider: 'openai',
          model,
          endpoint,
          status: resp.status,
          statusText: resp.statusText,
          error: text,
          processingTime,
          requestBody: {
            model,
            temperature: this.settings.temperature,
            max_tokens: this.settings.maxTokens
          }
        }, correlationId);
        throw new Error(errorMessage);
      }
      
      const json = await resp.json();
      const content = json?.choices?.[0]?.message?.content || null;
      const tokenUsage = json?.usage?.total_tokens || 0;
      
      this.debugLogger?.log('info', 'llm-call', 'OpenAI API response received', {
        provider: 'openai',
        model,
        status: resp.status,
        tokenUsage,
        responseLength: content?.length || 0,
        processingTime,
        responseData: {
          choices: json?.choices?.length || 0,
          usage: json?.usage
        }
      }, correlationId);
      
      return content;
    } catch (e) {
      console.error('callOpenAI error', e);
      this.debugLogger?.log('error', 'llm-call', 'OpenAI API call failed', {
        provider: 'openai',
        model,
        error: e.message
      }, correlationId);
      throw e;
    }
  }

  private async callAnthropic(systemPrompt: string, userPrompt: string, correlationId?: string): Promise<string | null> {
    // Validate and sanitize Anthropic URL - ensure it's the correct endpoint
    let endpoint = this.settings.anthropicUrl || 'https://api.anthropic.com/v1/messages';
    
    // Fix common endpoint mistakes
    if (endpoint.includes('anthropic.com') && !endpoint.includes('/v1/messages')) {
      endpoint = 'https://api.anthropic.com/v1/messages';
      console.warn('Task Extractor: Fixed invalid Anthropic URL to use correct /v1/messages endpoint');
      this.debugLogger?.log('warn', 'llm-call', 'Fixed invalid Anthropic URL', {
        provider: 'anthropic',
        originalUrl: this.settings.anthropicUrl,
        fixedUrl: endpoint
      }, correlationId);
    }
    
    const model = this.settings.model || 'claude-3-5-haiku-20241022';
    const requestBody = {
      model,
      max_tokens: this.settings.maxTokens,
      temperature: this.settings.temperature,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    };

    // Log request with masked API key
    const maskedApiKey = this.settings.apiKey ? `...${this.settings.apiKey.slice(-4)}` : 'none';
    this.debugLogger?.log('info', 'llm-call', 'Sending Anthropic API request', {
      provider: 'anthropic',
      model,
      endpoint,
      apiKey: maskedApiKey,
      requestPayload: {
        ...requestBody,
        system: `${systemPrompt.length} chars`,
        messages: requestBody.messages.map(m => ({ role: m.role, contentLength: m.content.length }))
      }
    }, correlationId);
    
    try {
      const startTime = Date.now();
      const rawResp = await requestUrl({
        url: endpoint,
        method: 'POST',
        headers: {
          'x-api-key': this.settings.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      });
      const resp = this.adaptRequestUrlResponse(rawResp);
      const processingTime = Date.now() - startTime;
      
      if (!resp.ok) {
        const text = await resp.text();
        console.error('Anthropic error', resp.status, text);
        
        // Provide specific error messages based on status codes
        let errorMessage = `Anthropic API error: ${resp.status} ${resp.statusText}`;
        if (resp.status === 404) {
          errorMessage += '. Check that anthropicUrl setting uses the correct endpoint: https://api.anthropic.com/v1/messages';
        } else if (resp.status === 401 || resp.status === 403) {
          errorMessage += '. Check that your Anthropic API key is valid and has proper permissions.';
        } else if (resp.status === 400) {
          errorMessage += '. Request format may be invalid - check model name and request parameters.';
        }
        
        this.debugLogger?.log('error', 'llm-call', `Anthropic API error: ${resp.status}`, {
          provider: 'anthropic',
          model,
          endpoint,
          status: resp.status,
          statusText: resp.statusText,
          error: text,
          processingTime,
          requestBody: {
            model,
            max_tokens: this.settings.maxTokens,
            temperature: this.settings.temperature
          }
        }, correlationId);
        throw new Error(errorMessage);
      }
      
      const json = await resp.json();
      const content = json?.content?.[0]?.text || null;
      const tokenUsage = json?.usage?.input_tokens + json?.usage?.output_tokens || 0;
      
      this.debugLogger?.log('info', 'llm-call', 'Anthropic API response received', {
        provider: 'anthropic',
        model,
        status: resp.status,
        tokenUsage,
        responseLength: content?.length || 0,
        processingTime,
        responseData: {
          contentBlocks: json?.content?.length || 0,
          usage: json?.usage
        }
      }, correlationId);
      
      return content;
    } catch (e) {
      console.error('callAnthropic error', e);
      this.debugLogger?.log('error', 'llm-call', 'Anthropic API call failed', {
        provider: 'anthropic',
        model,
        error: e.message
      }, correlationId);
      throw e;
    }
  }

  private async callOllama(systemPrompt: string, userPrompt: string, correlationId?: string): Promise<string | null> {
    const service = await this.getService('ollama');
    if (!service?.available || !service.models.length) {
      this.debugLogger?.log('error', 'llm-call', 'Ollama service not available or no models loaded', {
        provider: 'ollama',
        serviceAvailable: service?.available || false,
        modelCount: service?.models?.length || 0,
        url: this.settings.ollamaUrl
      }, correlationId);
      throw new Error('Ollama service not available or no models loaded');
    }
    
    // Use configured model or first available model
    const model = service.models.includes(this.settings.model) 
      ? this.settings.model 
      : service.models[0];
    
    const endpoint = `${this.settings.ollamaUrl}/api/chat`;
    const requestBody = {
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
    };

    this.debugLogger?.log('info', 'llm-call', 'Sending Ollama API request', {
      provider: 'ollama',
      model,
      endpoint,
      url: this.settings.ollamaUrl,
      availableModels: service.models,
      requestPayload: {
        ...requestBody,
        messages: requestBody.messages.map(m => ({ role: m.role, contentLength: m.content.length }))
      }
    }, correlationId);
    
    try {
      const startTime = Date.now();
      const rawResp = await requestUrl({
        url: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      const resp = this.adaptRequestUrlResponse(rawResp);
      const processingTime = Date.now() - startTime;
      
      if (!resp.ok) {
        const text = await resp.text();
        console.error('Ollama error', resp.status, text);
        this.debugLogger?.log('error', 'llm-call', `Ollama API error: ${resp.status}`, {
          provider: 'ollama',
          model,
          status: resp.status,
          statusText: resp.statusText,
          error: text,
          processingTime,
          url: this.settings.ollamaUrl
        }, correlationId);
        throw new Error(`Ollama API error: ${resp.status} ${resp.statusText}`);
      }
      
      const json = await resp.json();
      const content = json?.message?.content || null;
      
      this.debugLogger?.log('info', 'llm-call', 'Ollama API response received', {
        provider: 'ollama',
        model,
        status: resp.status,
        responseLength: content?.length || 0,
        processingTime,
        responseData: {
          hasMessage: !!json?.message,
          messageRole: json?.message?.role
        }
      }, correlationId);
      
      return content;
    } catch (e) {
      console.error('callOllama error', e);
      this.debugLogger?.log('error', 'llm-call', 'Ollama API call failed', {
        provider: 'ollama',
        model,
        error: e.message,
        url: this.settings.ollamaUrl
      }, correlationId);
      throw e;
    }
  }

  private async callLMStudio(systemPrompt: string, userPrompt: string, correlationId?: string): Promise<string | null> {
    const service = await this.getService('lmstudio');
    if (!service?.available || !service.models.length) {
      this.debugLogger?.log('error', 'llm-call', 'LM Studio service not available or no models loaded', {
        provider: 'lmstudio',
        serviceAvailable: service?.available || false,
        modelCount: service?.models?.length || 0,
        url: this.settings.lmstudioUrl
      }, correlationId);
      throw new Error('LM Studio service not available or no models loaded');
    }
    
    // Use configured model or first available model
    const model = service.models.includes(this.settings.model) 
      ? this.settings.model 
      : service.models[0];
    
    const endpoint = `${this.settings.lmstudioUrl}/v1/chat/completions`;
    const requestBody = {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: this.settings.temperature,
      max_tokens: this.settings.maxTokens
    };

    this.debugLogger?.log('info', 'llm-call', 'Sending LM Studio API request', {
      provider: 'lmstudio',
      model,
      endpoint,
      url: this.settings.lmstudioUrl,
      availableModels: service.models,
      requestPayload: {
        ...requestBody,
        messages: requestBody.messages.map(m => ({ role: m.role, contentLength: m.content.length }))
      }
    }, correlationId);
    
    try {
      const startTime = Date.now();
      const rawResp = await requestUrl({
        url: endpoint,
        method: 'POST',
        headers: {
          'Authorization': 'Bearer lm-studio', // Placeholder auth
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      const resp = this.adaptRequestUrlResponse(rawResp);
      const processingTime = Date.now() - startTime;
      
      if (!resp.ok) {
        const text = await resp.text();
        console.error('LM Studio error', resp.status, text);
        this.debugLogger?.log('error', 'llm-call', `LM Studio API error: ${resp.status}`, {
          provider: 'lmstudio',
          model,
          status: resp.status,
          statusText: resp.statusText,
          error: text,
          processingTime,
          url: this.settings.lmstudioUrl
        }, correlationId);
        throw new Error(`LM Studio API error: ${resp.status} ${resp.statusText}`);
      }
      
      const json = await resp.json();
      const content = json?.choices?.[0]?.message?.content || null;
      const tokenUsage = json?.usage?.total_tokens || 0;
      
      this.debugLogger?.log('info', 'llm-call', 'LM Studio API response received', {
        provider: 'lmstudio',
        model,
        status: resp.status,
        tokenUsage,
        responseLength: content?.length || 0,
        processingTime,
        responseData: {
          choices: json?.choices?.length || 0,
          usage: json?.usage
        }
      }, correlationId);
      
      return content;
    } catch (e) {
      console.error('callLMStudio error', e);
      this.debugLogger?.log('error', 'llm-call', 'LM Studio API call failed', {
        provider: 'lmstudio',
        model,
        error: e.message,
        url: this.settings.lmstudioUrl
      }, correlationId);
      throw e;
    }
  }

  // Fetch available models for cloud providers
  async fetchCloudModels(provider: 'openai' | 'anthropic'): Promise<string[]> {
    const correlationId = this.debugLogger?.startOperation('service-detection', `Fetching cloud models for provider: ${provider}`, {
      provider,
      hasApiKey: !!this.settings.apiKey
    });
    
    if (!this.settings.apiKey) {
      this.debugLogger?.log('warn', 'service-detection', `No API key available for ${provider}`, {
        provider
      }, correlationId);
      return [];
    }
    
    // Check cache first
    const cacheKey = `${provider}-${this.settings.apiKey.slice(-4)}`; // Use last 4 chars for cache key
    if (this.cloudModelCache.has(cacheKey)) {
      const cachedModels = this.cloudModelCache.get(cacheKey) || [];
      this.debugLogger?.log('info', 'service-detection', `Using cached models for ${provider}`, {
        provider,
        cacheKey: cacheKey.replace(/-.*$/, '-****'), // Mask API key in logs
        modelCount: cachedModels.length,
        models: cachedModels
      }, correlationId);
      return cachedModels;
    }
    
    this.debugLogger?.log('info', 'service-detection', `Cache miss, fetching fresh models for ${provider}`, {
      provider,
      cacheKey: cacheKey.replace(/-.*$/, '-****')
    }, correlationId);
    
    try {
      if (provider === 'openai') {
        return await this.fetchOpenAIModels(correlationId);
      } else if (provider === 'anthropic') {
        return await this.fetchAnthropicModels(correlationId);
      }
    } catch (error) {
      console.warn(`Failed to fetch ${provider} models:`, error.message);
      const defaultModels = this.getDefaultModels(provider);
      this.debugLogger?.log('error', 'service-detection', `Failed to fetch ${provider} models, using defaults`, {
        provider,
        error: error.message,
        errorType: error.name,
        defaultModels,
        defaultModelCount: defaultModels.length
      }, correlationId);
      return defaultModels;
    }
    
    return [];
  }

  private async fetchOpenAIModels(correlationId?: string): Promise<string[]> {
    const endpoint = 'https://api.openai.com/v1/models';
    const maskedApiKey = this.settings.apiKey ? `...${this.settings.apiKey.slice(-4)}` : 'none';
    
    this.debugLogger?.log('info', 'service-detection', 'Fetching OpenAI models', {
      provider: 'openai',
      endpoint,
      apiKey: maskedApiKey
    }, correlationId);
    
    try {
      const startTime = Date.now();
      const rawResponse = await requestUrl({
        url: endpoint,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      const response = this.adaptRequestUrlResponse(rawResponse);
      const processingTime = Date.now() - startTime;
      
      if (!response.ok) {
        this.debugLogger?.log('error', 'service-detection', `OpenAI models API error: ${response.status}`, {
          provider: 'openai',
          endpoint,
          status: response.status,
          statusText: response.statusText,
          processingTime
        }, correlationId);
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      
      const data = await response.json();
      const allModels = data.data || [];
      const models = allModels
        ?.filter((model: any) => model.id.includes('gpt') && !model.id.includes('instruct'))
        ?.map((model: any) => model.id)
        ?.sort() || [];
      
      this.debugLogger?.log('info', 'service-detection', 'OpenAI models fetched successfully', {
        provider: 'openai',
        endpoint,
        status: response.status,
        processingTime,
        totalModelsReceived: allModels.length,
        filteredModelCount: models.length,
        models: models
      }, correlationId);
      
      // Cache the results
      const cacheKey = `openai-${this.settings.apiKey.slice(-4)}`;
      this.cloudModelCache.set(cacheKey, models);
      
      this.debugLogger?.log('info', 'service-detection', 'OpenAI models cached successfully', {
        provider: 'openai',
        cacheKey: cacheKey.replace(/-.*$/, '-****'), // Mask API key in logs
        modelCount: models.length
      }, correlationId);
      
      return models.length > 0 ? models : this.getDefaultModels('openai');
    } catch (e) {
      this.debugLogger?.log('error', 'service-detection', 'OpenAI models fetch failed', {
        provider: 'openai',
        endpoint,
        error: e.message,
        errorType: e.name
      }, correlationId);
      return this.getDefaultModels('openai');
    }
  }

  private async fetchAnthropicModels(correlationId?: string): Promise<string[]> {
    // Anthropic doesn't have a models endpoint, so return known models
    this.debugLogger?.log('info', 'service-detection', 'Fetching Anthropic models (using known model list)', {
      provider: 'anthropic',
      reason: 'no-public-models-api'
    }, correlationId);
    
    const knownModels = [
      // Current generation (2025) - Recommended
      'claude-opus-4-1-20250805',     // Latest and most capable
      'claude-opus-4-20250514',       // Previous Opus 4
      'claude-sonnet-4-20250514',     // High-performance Sonnet 4
      'claude-3-7-sonnet-20250219',   // Hybrid reasoning model
      
      // Claude 3.5 series
      'claude-3-5-sonnet-20241022',   // Sonnet 3.5 v2
      'claude-3-5-sonnet-20240620',   // Original Sonnet 3.5
      'claude-3-5-haiku-20241022',    // Fast Haiku 3.5
      
      // Claude 3 series (legacy)
      'claude-3-opus-20240229',       // Legacy Opus 3
      'claude-3-sonnet-20240229',     // Legacy Sonnet 3
      'claude-3-haiku-20240307'       // Legacy Haiku 3
    ];
    
    this.debugLogger?.log('info', 'service-detection', 'Anthropic models retrieved successfully', {
      provider: 'anthropic',
      modelCount: knownModels.length,
      models: knownModels,
      source: 'hardcoded-known-models'
    }, correlationId);
    
    // Cache the results
    const cacheKey = `anthropic-${this.settings.apiKey.slice(-4)}`;
    this.cloudModelCache.set(cacheKey, knownModels);
    
    this.debugLogger?.log('info', 'service-detection', 'Anthropic models cached successfully', {
      provider: 'anthropic',
      cacheKey: cacheKey.replace(/-.*$/, '-****'), // Mask API key in logs
      modelCount: knownModels.length
    }, correlationId);
    
    return knownModels;
  }

  getDefaultModels(provider: string): string[] {
    const defaults = {
      openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      anthropic: ['claude-opus-4-1-20250805', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
      ollama: ['llama3.2', 'mistral', 'codellama'],
      lmstudio: ['local-model']
    };
    
    return defaults[provider as keyof typeof defaults] || [];
  }

  // Configuration validation method
  private validateProviderConfig(provider: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    switch (provider) {
      case 'openai':
        if (!this.settings.apiKey || this.settings.apiKey.trim().length === 0) {
          errors.push('OpenAI API key is missing');
        } else if (!this.settings.apiKey.startsWith('sk-')) {
          errors.push('OpenAI API key should start with "sk-"');
        }
        
        if (!this.settings.model || this.settings.model.trim().length === 0) {
          errors.push('OpenAI model is not specified');
        }
        break;
        
      case 'anthropic':
        if (!this.settings.apiKey || this.settings.apiKey.trim().length === 0) {
          errors.push('Anthropic API key is missing');
        }
        
        const anthropicUrl = this.settings.anthropicUrl || 'https://api.anthropic.com/v1/messages';
        if (!anthropicUrl.includes('api.anthropic.com/v1/messages')) {
          errors.push('Anthropic URL must point to https://api.anthropic.com/v1/messages');
        }
        
        if (!this.settings.model || this.settings.model.trim().length === 0) {
          errors.push('Anthropic model is not specified');
        }
        break;
        
      case 'ollama':
        if (!this.settings.ollamaUrl || this.settings.ollamaUrl.trim().length === 0) {
          errors.push('Ollama URL is missing');
        }
        break;
        
      case 'lmstudio':
        if (!this.settings.lmstudioUrl || this.settings.lmstudioUrl.trim().length === 0) {
          errors.push('LM Studio URL is missing');
        }
        break;
        
      default:
        errors.push(`Unsupported provider: ${provider}`);
    }
    
    return { valid: errors.length === 0, errors };
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

  // Helper to adapt requestUrl response to fetch-like interface
  private adaptRequestUrlResponse(response: any) {
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.status.toString(),
      json: async () => response.json,
      text: async () => response.text
    };
  }

  // Methods for backward compatibility
  getServiceCache() { return this.serviceCache; }
  getCloudModelCache() { return this.cloudModelCache; }
  getApiKeyMissingNotified() { return this.apiKeyMissingNotified; }
}
''