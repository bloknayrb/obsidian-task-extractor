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

import { App, Plugin, TFile } from 'obsidian';
import { ExtractorSettings, DEFAULT_SETTINGS, LLMService, validateSettings } from './src/types';
import { LLMProviderManager } from './src/llm-providers';
import { TaskProcessor } from './src/task-processor';
import { ExtractorSettingTab } from './src/settings';

export default class TaskExtractorPlugin extends Plugin {
  settings: ExtractorSettings;
  processingFiles: Set<string> = new Set();
  serviceCache: Map<string, LLMService> = new Map();
  serviceCheckInterval: NodeJS.Timeout | null = null;
  cloudModelCache: Map<string, string[]> = new Map();
  apiKeyMissingNotified: Set<string> = new Set();
  fileChangeDebouncer: Map<string, NodeJS.Timeout> = new Map();

  private llmProvider: LLMProviderManager;
  private taskProcessor: TaskProcessor;

  async onload() {
    console.log('Loading Task Extractor plugin...');
    await this.loadSettings();

    // Initialize modular components
    this.llmProvider = new LLMProviderManager(this.settings);
    this.taskProcessor = new TaskProcessor(this.app, this.settings, this.llmProvider);

    // Sync the references for backward compatibility
    this.serviceCache = this.llmProvider.getServiceCache();
    this.cloudModelCache = this.llmProvider.getCloudModelCache();
    this.apiKeyMissingNotified = this.llmProvider.getApiKeyMissingNotified();
    this.processingFiles = this.taskProcessor.getProcessingFiles();

    // Register settings tab
    this.addSettingTab(new ExtractorSettingTab(this.app, this, this.settings, this.llmProvider));

    // Hook into metadata changes (file created/updated)
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile) {
          this.debounceFileChange(file);
        }
      })
    );

    if (this.settings.processOnUpdate) {
      this.registerEvent(
        this.app.vault.on('modify', (file) => {
          if (file instanceof TFile) {
            this.debounceFileChange(file);
          }
        })
      );
    }

    // Initialize service detection
    await this.initializeServices();
    
    // Also scan existing unprocessed files once on load (non-blocking)
    this.scanExistingFiles();
  }

  onunload() {
    console.log('Unloading Task Extractor plugin...');
    if (this.serviceCheckInterval) {
      clearInterval(this.serviceCheckInterval);
      this.serviceCheckInterval = null;
    }
    // Clear pending file change timeouts
    this.fileChangeDebouncer.forEach(timeout => clearTimeout(timeout));
    this.fileChangeDebouncer.clear();
    // Clear caches
    this.cloudModelCache.clear();
    this.apiKeyMissingNotified.clear();
  }

  async loadSettings() {
    const rawSettings = await this.loadData();
    // Validate and sanitize loaded settings to ensure all values are within acceptable ranges
    this.settings = validateSettings(Object.assign({}, DEFAULT_SETTINGS, rawSettings));
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Debounce file changes to prevent rapid processing
  private debounceFileChange(file: TFile) {
    const existing = this.fileChangeDebouncer.get(file.path);
    if (existing) {
      clearTimeout(existing);
    }
    
    this.fileChangeDebouncer.set(file.path, setTimeout(() => {
      this.onFileChanged(file);
      this.fileChangeDebouncer.delete(file.path);
    }, 2000));
  }

  // Delegate to task processor
  async onFileChanged(file: TFile) {
    return this.taskProcessor.onFileChanged(file);
  }

  async scanExistingFiles() {
    return this.taskProcessor.scanExistingFiles();
  }

  // Service Detection and Management - delegate to LLM provider
  async initializeServices() {
    // No longer do upfront detection - use lazy loading
  }

  async detectServices(): Promise<Map<string, LLMService>> {
    return this.llmProvider.detectServices();
  }

  getAvailableServices(): LLMService[] {
    return this.llmProvider.getAvailableServices();
  }

  // LLM calls - delegate to provider
  async callLLM(systemPrompt: string, userPrompt: string): Promise<string | null> {
    return this.llmProvider.callLLM(systemPrompt, userPrompt);
  }

  async fetchCloudModels(provider: 'openai' | 'anthropic'): Promise<string[]> {
    return this.llmProvider.fetchCloudModels(provider);
  }

  getDefaultModels(provider: string): string[] {
    return this.llmProvider.getDefaultModels(provider);
  }
}

