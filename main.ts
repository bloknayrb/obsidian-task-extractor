/*
Obsidian Plugin: Task Extractor for Emails & Meeting Notes
Enhanced version with local LLM support and customizable frontmatter

Features:
- Multi-provider LLM support: OpenAI, Anthropic, Ollama, LM Studio
- Auto-detection of local LLM services
- Customizable frontmatter templates for task creation
- Advanced settings with real-time service monitoring
- Robust error handling and fallback strategies
*/

import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

interface FrontmatterField {
  key: string;
  defaultValue: string;
  type: 'text' | 'date' | 'select' | 'boolean';
  options?: string[]; // for select type
  required: boolean;
}

interface LLMService {
  name: string;
  url: string;
  available: boolean;
  models: string[];
  lastChecked: number;
}

interface ExtractorSettings {
  provider: 'openai' | 'anthropic' | 'ollama' | 'lmstudio';
  apiKey: string;
  model: string;
  
  // Local LLM settings
  ollamaUrl: string;
  lmstudioUrl: string;
  localModelRefreshInterval: number; // minutes
  
  // Processing settings
  tasksFolder: string;
  linkBack: boolean;
  processedFrontmatterKey: string;
  ownerName: string;
  processOnUpdate: boolean;
  triggerTypes: string[]; // customizable note types to process
  
  // Customizable frontmatter
  frontmatterFields: FrontmatterField[];
  customPrompt: string;
  
  // Advanced settings
  maxTokens: number;
  temperature: number;
  timeout: number; // seconds
  retries: number;
}

const DEFAULT_FRONTMATTER_FIELDS: FrontmatterField[] = [
  { key: 'task', defaultValue: '', type: 'text', required: true },
  { key: 'status', defaultValue: 'todo', type: 'select', options: ['todo', 'doing', 'done', 'cancelled'], required: true },
  { key: 'priority', defaultValue: 'medium', type: 'select', options: ['low', 'medium', 'high', 'urgent'], required: true },
  { key: 'due', defaultValue: '', type: 'date', required: false },
  { key: 'project', defaultValue: '', type: 'text', required: false },
  { key: 'client', defaultValue: '', type: 'text', required: false },
  { key: 'created', defaultValue: '{{date}}', type: 'date', required: false },
  { key: 'tags', defaultValue: 'task', type: 'text', required: false }
];

const DEFAULT_SETTINGS: ExtractorSettings = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o-mini',
  
  // Local LLM settings
  ollamaUrl: 'http://localhost:11434',
  lmstudioUrl: 'http://localhost:1234',
  localModelRefreshInterval: 5,
  
  // Processing settings
  tasksFolder: 'Tasks',
  linkBack: true,
  processedFrontmatterKey: 'taskExtractor.processed',
  ownerName: 'Bryan Kolb',
  processOnUpdate: false,
  triggerTypes: ['email', 'meetingnote', 'meeting note', 'meeting notes'],
  
  // Customizable frontmatter
  frontmatterFields: DEFAULT_FRONTMATTER_FIELDS,
  customPrompt: '',
  
  // Advanced settings
  maxTokens: 800,
  temperature: 0,
  timeout: 30,
  retries: 3,
};

export default class TaskExtractorPlugin extends Plugin {
  settings: ExtractorSettings;
  processingFiles: Set<string> = new Set();
  serviceCache: Map<string, LLMService> = new Map();
  serviceCheckInterval: NodeJS.Timeout | null = null;

  async onload() {
    console.log('Loading Task Extractor plugin...');
    await this.loadSettings();

    // Register settings tab
    this.addSettingTab(new ExtractorSettingTab(this.app, this));

    // Hook into metadata changes (file created/updated)
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile) {
          this.onFileChanged(file);
        }
      })
    );

    if (this.settings.processOnUpdate) {
      this.registerEvent(
        this.app.vault.on('modify', (file) => {
          if (file instanceof TFile) {
            this.onFileChanged(file);
          }
        })
      );
    }

    // Initialize service detection
    await this.initializeServices();
    
    // Set up periodic service checking
    this.setupServiceMonitoring();
    
    // Also scan existing unprocessed files once on load (non-blocking)
    this.scanExistingFiles();
  }

  onunload() {
    console.log('Unloading Task Extractor plugin...');
    if (this.serviceCheckInterval) {
      clearInterval(this.serviceCheckInterval);
      this.serviceCheckInterval = null;
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // When a file is created or modified
  async onFileChanged(file: TFile) {
    try {
      if (file.extension !== 'md') return;
      if (this.processingFiles.has(file.path)) return;
      this.processingFiles.add(file.path);

      const cache = this.app.metadataCache.getFileCache(file);
      const front = cache?.frontmatter;
      if (!front) return;

      // check already processed
      const processedValue = this.getFrontmatterValue(front, this.settings.processedFrontmatterKey);
      if (processedValue === true || processedValue === 'true') {
        // already processed
        this.processingFiles.delete(file.path);
        return;
      }

      const typeRaw = this.getFrontmatterValue(front, 'Type') || '';
      const type = ('' + typeRaw).toLowerCase();
      const accepted = this.settings.triggerTypes.map(t => t.toLowerCase());
      if (!accepted.includes(type)) {
        this.processingFiles.delete(file.path);
        return;
      }

      // read file content
      const content = await this.app.vault.read(file);

      // call LLM
      const extraction = await this.extractTaskFromContent(content, file.path);

      if (extraction && extraction.found) {
        // create task note
        await this.createTaskNote(extraction, file);
      }

      // mark as processed if configured
      await this.markFileProcessed(file);

      this.processingFiles.delete(file.path);
    } catch (err) {
      console.error('TaskExtractor error', err);
      new Notice('Task Extractor: error processing file — see console');
      try { this.processingFiles.delete(file.path); } catch {}
    }
  }

  // scan vault once on load for unprocessed matching notes
  async scanExistingFiles() {
    const files = this.app.vault.getMarkdownFiles();
    for (const f of files) {
      const cache = this.app.metadataCache.getFileCache(f);
      const front = cache?.frontmatter;
      if (!front) continue;
      const typeRaw = this.getFrontmatterValue(front, 'Type') || '';
      const type = ('' + typeRaw).toLowerCase();
      const accepted = this.settings.triggerTypes.map(t => t.toLowerCase());
      const processedValue = this.getFrontmatterValue(front, this.settings.processedFrontmatterKey);
      if (accepted.includes(type) && !(processedValue === true || processedValue === 'true')) {
        // lightweight throttle
        await this.onFileChanged(f);
      }
    }
  }

  getFrontmatterValue(front: any, key: string) {
    // Support nested keys like "taskExtractor.processed"
    if (!front) return undefined;
    if (key.includes('.')) {
      const parts = key.split('.');
      let cur = front;
      for (const p of parts) {
        if (!cur) return undefined;
        cur = cur[p];
      }
      return cur;
    }
    return front[key];
  }

  async markFileProcessed(file: TFile) {
    if (!this.settings.processedFrontmatterKey) return;
    try {
      const content = await this.app.vault.read(file);
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let newContent = content;
      if (fmMatch) {
        const fm = fmMatch[1];
        // naive append processed key
        const lines = fm.split('\n');
        const processedKey = this.settings.processedFrontmatterKey;
        // if already present, skip
        if (!new RegExp('^' + processedKey.replace('.', '\.') + ':', 'm').test(fm)) {
          lines.push(`${processedKey}: true`);
          const updatedFm = lines.join('\n');
          newContent = content.replace(fmMatch[0], `---\n${updatedFm}\n---`);
          await this.app.vault.modify(file, newContent);
        }
      } else {
        // no frontmatter — create one
        const processedKey = this.settings.processedFrontmatterKey;
        newContent = `---\n${processedKey}: true\n---\n\n` + content;
        await this.app.vault.modify(file, newContent);
      }
    } catch (e) {
      console.warn('Failed to mark file processed', e);
    }
  }

  // Service Detection and Management
  async initializeServices() {
    await this.detectServices();
  }

  setupServiceMonitoring() {
    if (this.serviceCheckInterval) {
      clearInterval(this.serviceCheckInterval);
    }
    
    const intervalMs = this.settings.localModelRefreshInterval * 60 * 1000;
    this.serviceCheckInterval = setInterval(async () => {
      await this.detectServices();
    }, intervalMs);
  }

  async detectServices(): Promise<Map<string, LLMService>> {
    const services = new Map<string, LLMService>();
    const now = Date.now();
    
    // Check Ollama
    const ollamaService: LLMService = {
      name: 'ollama',
      url: this.settings.ollamaUrl,
      available: false,
      models: [],
      lastChecked: now
    };
    
    try {
      const ollamaResponse = await fetch(`${this.settings.ollamaUrl}/api/tags`, {
        signal: this.createTimeoutSignal(5000)
      });
      
      if (ollamaResponse.ok) {
        const data = await ollamaResponse.json();
        ollamaService.available = true;
        ollamaService.models = data.models?.map((m: any) => m.name) || [];
      }
    } catch (error) {
      console.log('Ollama not available:', error.message);
    }
    
    services.set('ollama', ollamaService);
    
    // Check LM Studio
    const lmstudioService: LLMService = {
      name: 'lmstudio',
      url: this.settings.lmstudioUrl,
      available: false,
      models: [],
      lastChecked: now
    };
    
    try {
      const lmstudioResponse = await fetch(`${this.settings.lmstudioUrl}/v1/models`, {
        signal: this.createTimeoutSignal(5000)
      });
      
      if (lmstudioResponse.ok) {
        const data = await lmstudioResponse.json();
        lmstudioService.available = true;
        lmstudioService.models = data.data?.map((m: any) => m.id) || [];
      }
    } catch (error) {
      console.log('LM Studio not available:', error.message);
    }
    
    services.set('lmstudio', lmstudioService);
    
    this.serviceCache = services;
    return services;
  }

  getAvailableServices(): LLMService[] {
    return Array.from(this.serviceCache.values()).filter(s => s.available);
  }

  // Compose prompt, call LLM, and parse response
  async extractTaskFromContent(content: string, sourcePath: string) {
    // Use custom prompt if provided, otherwise use default
    const basePrompt = this.settings.customPrompt || 
      `You are a task extraction assistant. You will be given the full text of an email or meeting note. Determine if there is an explicit or implied actionable task for ${this.settings.ownerName} (exact name). If there is a task, output a single JSON object and nothing else. If there is no task, output {"found": false}.`;
    
    // Generate field descriptions from frontmatter settings
    const fieldDescriptions = this.settings.frontmatterFields
      .filter(f => f.required || f.key === 'task_title' || f.key === 'task_details')
      .map(f => {
        if (f.key === 'task' || f.key === 'task_title') return '- task_title: short (6-12 words) actionable title';
        if (f.key === 'task_details') return '- task_details: 1-3 sentences describing what to do and any context';
        if (f.key === 'due') return '- due_date: ISO date YYYY-MM-DD if explicitly present in the text, otherwise null';
        if (f.key === 'priority') return `- priority: ${f.options?.join('|') || 'high|medium|low'} (choose best match)`;
        if (f.key === 'project') return '- project: project name if mentioned, otherwise null';
        if (f.key === 'client') return '- client: client name if mentioned, otherwise null';
        return `- ${f.key}: ${f.defaultValue || 'appropriate value based on context'}`;
      });
    
    const system = `${basePrompt} The JSON, when found, must include these keys:\n${fieldDescriptions.join('\n')}\n- source_excerpt: a short quoted excerpt from the note that justifies the decision (max 3 lines)\nReturn valid JSON only.`;

    const user = `SOURCE_PATH: ${sourcePath}\n---BEGIN NOTE---\n${content}\n---END NOTE---`;

    try {
      const raw = await this.callLLM(system, user);
      const parsed = this.safeParseJSON(raw);
      if (!parsed) return { found: false };
      // normalize
      if (!parsed.found) return { found: false };
      return {
        found: true,
        task_title: parsed.task_title || parsed.title || 'Unspecified task',
        task_details: parsed.task_details || parsed.details || '',
        due_date: parsed.due_date || null,
        priority: parsed.priority || 'medium',
        source_excerpt: parsed.source_excerpt || '',
      };
    } catch (e) {
      console.error('extractTaskFromContent error', e);
      return { found: false };
    }
  }

  safeParseJSON(text: string | null) {
    if (!text) return null;
    // try direct parse
    try {
      return JSON.parse(text);
    } catch {}
    // extract first {...}
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch {}
    }
    // try to fix common issues: single quotes -> double
    const fixed = text.replace(/'/g, '"');
    try { return JSON.parse(fixed); } catch {}
    return null;
  }

  // Create TaskNotes–compatible note in tasksFolder
  async createTaskNote(extraction: any, sourceFile: TFile) {
    const safeTitle = this.makeFilenameSafe(extraction.task_title || 'task');
    let filename = `${safeTitle}.md`;
    let folder = this.settings.tasksFolder.trim() || 'Tasks';
    let path = `${folder}/${filename}`;

    // If file exists, append counter
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = `${folder}/${safeTitle}-${counter}.md`;
      counter++;
    }

    // Generate frontmatter using customizable fields
    const lines: string[] = [];
    lines.push('---');
    
    for (const field of this.settings.frontmatterFields) {
      let value = extraction[field.key] || extraction[field.key.replace('_', '')] || field.defaultValue;
      
      // Handle special value replacements
      if (value === '{{date}}') {
        value = new Date().toISOString().split('T')[0];
      }
      
      // Map common extraction keys to field keys
      if (field.key === 'task' && !value && extraction.task_title) {
        value = extraction.task_title;
      }
      
      if (value) {
        // Quote string values appropriately
        if (field.type === 'text' && typeof value === 'string' && value.includes(' ')) {
          lines.push(`${field.key}: "${value}"`);
        } else {
          lines.push(`${field.key}: ${value}`);
        }
      }
    }
    
    lines.push('---');
    lines.push('');
    lines.push(extraction.task_details || '');
    lines.push('');
    
    if (this.settings.linkBack) {
      const link = `[[${sourceFile.path}]]`;
      lines.push(`Source: ${link}`);
    }
    
    if (extraction.source_excerpt) {
      lines.push('');
      lines.push('> Justification excerpt:');
      lines.push('> ' + extraction.source_excerpt.replace(/\n/g, ' '));
    }

    const final = lines.join('\n');

    try {
      await this.app.vault.create(path, final);
      new Notice(`Task Extractor: created task "${extraction.task_title}"`);
    } catch (e) {
      console.error('Failed to create task note', e);
      new Notice('Task Extractor: failed to create task note — see console');
    }
  }

  makeFilenameSafe(title: string) {
    return title.replace(/[\\/:*?"<>|#%{}\\^~\[\]`;'@&=+]/g, '').replace(/\s+/g, '-').slice(0, 120);
  }

  // Provider-agnostic LLM call with fallback support
  async callLLM(systemPrompt: string, userPrompt: string): Promise<string | null> {
    const provider = this.settings.provider;
    
    // Check if API key is required for cloud providers
    if (['openai', 'anthropic'].includes(provider) && !this.settings.apiKey) {
      new Notice('Task Extractor: API key not configured in plugin settings');
      return null;
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
          // Wait before retry with exponential backoff
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }
    
    return null;
  }
  
  async tryLocalFallback(systemPrompt: string, userPrompt: string): Promise<string | null> {
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
    
    new Notice('Task Extractor: All LLM services failed. Check your configuration.');
    return null;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private createTimeoutSignal(ms: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  }

  async callOpenAI(systemPrompt: string, userPrompt: string) {
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

  async callAnthropic(systemPrompt: string, userPrompt: string) {
    // Updated to use Anthropic Messages API (current format)
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
  
  async callOllama(systemPrompt: string, userPrompt: string): Promise<string | null> {
    const service = this.serviceCache.get('ollama');
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
  
  async callLMStudio(systemPrompt: string, userPrompt: string): Promise<string | null> {
    const service = this.serviceCache.get('lmstudio');
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
}

class ExtractorSettingTab extends PluginSettingTab {
  plugin: TaskExtractorPlugin;

  constructor(app: App, plugin: TaskExtractorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Task Extractor Settings' });

    // Provider Selection
    this.addProviderSection(containerEl);
    
    // Local LLM Configuration
    this.addLocalLLMSection(containerEl);
    
    // Processing Settings
    this.addProcessingSection(containerEl);
    
    // Frontmatter Customization
    this.addFrontmatterSection(containerEl);
    
    // Advanced Settings
    this.addAdvancedSection(containerEl);
  }
  
  addProviderSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'LLM Provider Configuration' });
    
    // Service status indicator
    const statusEl = containerEl.createEl('div', { cls: 'task-extractor-status' });
    this.updateServiceStatus(statusEl);
    
    new Setting(containerEl)
      .setName('Provider')
      .setDesc('Choose LLM provider. Local providers (Ollama/LM Studio) require the service to be running.')
      .addDropdown(cb => cb
        .addOption('openai', 'OpenAI')
        .addOption('anthropic', 'Anthropic')
        .addOption('ollama', 'Ollama (Local)')
        .addOption('lmstudio', 'LM Studio (Local)')
        .setValue(this.plugin.settings.provider)
        .onChange(async (v) => { 
          this.plugin.settings.provider = v as any; 
          await this.plugin.saveSettings();
          this.updateServiceStatus(statusEl);
          this.display(); // Refresh to show/hide relevant settings
        }));

    // API Key (only for cloud providers)
    if (['openai', 'anthropic'].includes(this.plugin.settings.provider)) {
      new Setting(containerEl)
        .setName('API Key')
        .setDesc('Your API key for the selected provider.')
        .addText(text => text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (v) => { this.plugin.settings.apiKey = v.trim(); await this.plugin.saveSettings(); }));
    }

    // Model selection
    this.addModelSetting(containerEl);
  }
  
  addModelSetting(containerEl: HTMLElement): void {
    const provider = this.plugin.settings.provider;
    const service = this.plugin.serviceCache.get(provider);
    
    if (['ollama', 'lmstudio'].includes(provider) && service?.available && service.models.length > 0) {
      // Show dropdown for available local models
      new Setting(containerEl)
        .setName('Model')
        .setDesc(`Select from ${service.models.length} available ${provider} models.`)
        .addDropdown(cb => {
          service.models.forEach(model => cb.addOption(model, model));
          cb.setValue(this.plugin.settings.model || service.models[0])
            .onChange(async (v) => { this.plugin.settings.model = v; await this.plugin.saveSettings(); });
        });
    } else {
      // Text input for cloud providers or when local service unavailable
      const defaultModels = {
        openai: 'gpt-4o-mini',
        anthropic: 'claude-3-sonnet-20240229',
        ollama: 'llama3.2',
        lmstudio: 'local-model'
      };
      
      new Setting(containerEl)
        .setName('Model')
        .setDesc(`Model name for ${provider}. ${['ollama', 'lmstudio'].includes(provider) ? 'Make sure the model is loaded in ' + provider + '.' : ''}`)
        .addText(text => text
          .setPlaceholder(defaultModels[provider as keyof typeof defaultModels])
          .setValue(this.plugin.settings.model)
          .onChange(async (v) => { this.plugin.settings.model = v.trim(); await this.plugin.saveSettings(); }));
    }
  }
  
  addLocalLLMSection(containerEl: HTMLElement): void {
    if (!['ollama', 'lmstudio'].includes(this.plugin.settings.provider)) return;
    
    containerEl.createEl('h3', { text: 'Local LLM Configuration' });
    
    if (this.plugin.settings.provider === 'ollama') {
      new Setting(containerEl)
        .setName('Ollama URL')
        .setDesc('URL for your Ollama instance.')
        .addText(text => text
          .setValue(this.plugin.settings.ollamaUrl)
          .onChange(async (v) => { 
            this.plugin.settings.ollamaUrl = v.trim(); 
            await this.plugin.saveSettings();
            await this.plugin.detectServices();
          }));
    }
    
    if (this.plugin.settings.provider === 'lmstudio') {
      new Setting(containerEl)
        .setName('LM Studio URL')
        .setDesc('URL for your LM Studio instance.')
        .addText(text => text
          .setValue(this.plugin.settings.lmstudioUrl)
          .onChange(async (v) => { 
            this.plugin.settings.lmstudioUrl = v.trim(); 
            await this.plugin.saveSettings();
            await this.plugin.detectServices();
          }));
    }
    
    new Setting(containerEl)
      .setName('Model Refresh Interval')
      .setDesc('How often to check for available models (minutes).')
      .addSlider(slider => slider
        .setLimits(1, 60, 1)
        .setValue(this.plugin.settings.localModelRefreshInterval)
        .setDynamicTooltip()
        .onChange(async (v) => { 
          this.plugin.settings.localModelRefreshInterval = v; 
          await this.plugin.saveSettings();
          this.plugin.setupServiceMonitoring();
        }));
  }
  
  addProcessingSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Processing Settings' });
    
    new Setting(containerEl)
      .setName('Owner name')
      .setDesc('Exact name the LLM should look for when deciding tasks.')
      .addText(text => text
        .setPlaceholder('Bryan Kolb')
        .setValue(this.plugin.settings.ownerName)
        .onChange(async (v) => { this.plugin.settings.ownerName = v.trim(); await this.plugin.saveSettings(); }));
    
    new Setting(containerEl)
      .setName('Tasks folder')
      .setDesc('Folder where generated task notes will be created.')
      .addText(text => text
        .setValue(this.plugin.settings.tasksFolder)
        .onChange(async (v) => { this.plugin.settings.tasksFolder = v.trim(); await this.plugin.saveSettings(); }));
    
    new Setting(containerEl)
      .setName('Trigger note types')
      .setDesc('Comma-separated list of note types to process (from frontmatter Type field).')
      .addText(text => text
        .setValue(this.plugin.settings.triggerTypes.join(', '))
        .onChange(async (v) => { 
          this.plugin.settings.triggerTypes = v.split(',').map(s => s.trim()).filter(s => s.length > 0);
          await this.plugin.saveSettings(); 
        }));
    
    new Setting(containerEl)
      .setName('Process edits as well as new files')
      .setDesc('If enabled, modifications to matching notes will be processed too.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.processOnUpdate)
        .onChange(async (v) => { this.plugin.settings.processOnUpdate = v; await this.plugin.saveSettings(); }));
    
    new Setting(containerEl)
      .setName('Link back to source')
      .setDesc('Insert a link back to the source note in generated task notes.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.linkBack)
        .onChange(async (v) => { this.plugin.settings.linkBack = v; await this.plugin.saveSettings(); }));
    
    new Setting(containerEl)
      .setName('Processed marker key')
      .setDesc('Frontmatter key to mark processed notes.')
      .addText(text => text
        .setValue(this.plugin.settings.processedFrontmatterKey)
        .onChange(async (v) => { this.plugin.settings.processedFrontmatterKey = v.trim(); await this.plugin.saveSettings(); }));
  }
  
  addFrontmatterSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Task Note Frontmatter' });
    containerEl.createEl('p', { text: 'Customize the frontmatter fields for generated task notes:' });
    
    // Add field button
    new Setting(containerEl)
      .setName('Add Field')
      .setDesc('Add a new frontmatter field')
      .addButton(btn => btn
        .setButtonText('Add Field')
        .onClick(() => {
          this.plugin.settings.frontmatterFields.push({
            key: 'new_field',
            defaultValue: '',
            type: 'text',
            required: false
          });
          this.plugin.saveSettings();
          this.display();
        }));
    
    // Display existing fields
    this.plugin.settings.frontmatterFields.forEach((field, index) => {
      const fieldContainer = containerEl.createDiv({ cls: 'task-extractor-field' });
      
      new Setting(fieldContainer)
        .setName(`Field ${index + 1}: ${field.key}`)
        .setDesc(`Type: ${field.type}, Required: ${field.required ? 'Yes' : 'No'}`)
        .addButton(btn => btn
          .setButtonText('Edit')
          .onClick(() => this.editField(index)))
        .addButton(btn => btn
          .setButtonText('Remove')
          .onClick(() => {
            this.plugin.settings.frontmatterFields.splice(index, 1);
            this.plugin.saveSettings();
            this.display();
          }));
    });
    
    // Custom prompt
    new Setting(containerEl)
      .setName('Custom Prompt')
      .setDesc('Override the default task extraction prompt. Leave empty to use default.')
      .addTextArea(text => text
        .setPlaceholder('Enter custom prompt...')
        .setValue(this.plugin.settings.customPrompt)
        .onChange(async (v) => { this.plugin.settings.customPrompt = v; await this.plugin.saveSettings(); }));
  }
  
  addAdvancedSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Advanced Settings' });
    
    new Setting(containerEl)
      .setName('Max Tokens')
      .setDesc('Maximum tokens to generate.')
      .addSlider(slider => slider
        .setLimits(100, 2000, 50)
        .setValue(this.plugin.settings.maxTokens)
        .setDynamicTooltip()
        .onChange(async (v) => { this.plugin.settings.maxTokens = v; await this.plugin.saveSettings(); }));
    
    new Setting(containerEl)
      .setName('Temperature')
      .setDesc('Creativity level (0 = deterministic, 1 = creative).')
      .addSlider(slider => slider
        .setLimits(0, 1, 0.1)
        .setValue(this.plugin.settings.temperature)
        .setDynamicTooltip()
        .onChange(async (v) => { this.plugin.settings.temperature = v; await this.plugin.saveSettings(); }));
    
    new Setting(containerEl)
      .setName('Timeout (seconds)')
      .setDesc('Request timeout for LLM calls.')
      .addSlider(slider => slider
        .setLimits(10, 120, 5)
        .setValue(this.plugin.settings.timeout)
        .setDynamicTooltip()
        .onChange(async (v) => { this.plugin.settings.timeout = v; await this.plugin.saveSettings(); }));
    
    new Setting(containerEl)
      .setName('Retry Attempts')
      .setDesc('Number of retry attempts for failed requests.')
      .addSlider(slider => slider
        .setLimits(1, 5, 1)
        .setValue(this.plugin.settings.retries)
        .setDynamicTooltip()
        .onChange(async (v) => { this.plugin.settings.retries = v; await this.plugin.saveSettings(); }));
  }
  
  updateServiceStatus(statusEl: HTMLElement): void {
    statusEl.empty();
    
    const provider = this.plugin.settings.provider;
    const service = this.plugin.serviceCache.get(provider);
    
    if (['ollama', 'lmstudio'].includes(provider)) {
      const status = service?.available ? '🟢 Available' : '🔴 Not Available';
      const models = service?.models?.length || 0;
      statusEl.createEl('div', { 
        text: `${provider.toUpperCase()} Status: ${status} (${models} models)`,
        cls: service?.available ? 'task-extractor-status-ok' : 'task-extractor-status-error'
      });
    } else {
      statusEl.createEl('div', { 
        text: `${provider.toUpperCase()}: Cloud service`,
        cls: 'task-extractor-status-cloud'
      });
    }
  }
  
  editField(index: number): void {
    // This would open a modal to edit the field - simplified for now
    const field = this.plugin.settings.frontmatterFields[index];
    const newKey = prompt('Enter field key:', field.key);
    if (newKey) {
      field.key = newKey;
      this.plugin.saveSettings();
      this.display();
    }
  }
}
