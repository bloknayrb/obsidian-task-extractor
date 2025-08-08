/*
 * Settings UI and management
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import { ExtractorSettings, LLMService } from './types';
import { LLMProviderManager } from './llm-providers';

export class ExtractorSettingTab extends PluginSettingTab {
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(
    app: App,
    private plugin: any, // Main plugin instance
    private settings: ExtractorSettings,
    private llmProvider: LLMProviderManager
  ) {
    super(app, plugin);
  }

  // Debounced save to reduce save frequency
  private debouncedSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(async () => {
      await this.plugin.saveSettings();
      this.saveTimeout = null;
    }, 500);
  }

  // Clean up timeout on hide
  hide() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    super.hide();
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
  
  private addProviderSection(containerEl: HTMLElement): void {
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
        .setValue(this.settings.provider)
        .onChange((v) => { 
          this.settings.provider = v as any; 
          this.debouncedSave();
          
          // Clear API key notification when switching providers
          this.llmProvider.getApiKeyMissingNotified().clear();
          
          this.updateServiceStatus(statusEl);
          this.display(); // Refresh to show/hide relevant settings
        }));

    // API Key (only for cloud providers)
    if (['openai', 'anthropic'].includes(this.settings.provider)) {
      new Setting(containerEl)
        .setName('API Key')
        .setDesc('Your API key for the selected provider. Models will be loaded automatically once entered.')
        .addText(text => text
          .setPlaceholder('sk-... or claude-...')
          .setValue(this.settings.apiKey)
          .onChange((v) => { 
            this.settings.apiKey = v.trim(); 
            this.debouncedSave();
            
            // Clear model cache when API key changes
            const oldCacheKeys = Array.from(this.llmProvider.getCloudModelCache().keys())
              .filter(key => key.startsWith(this.settings.provider));
            oldCacheKeys.forEach(key => this.llmProvider.getCloudModelCache().delete(key));
            
            // Clear notification flag
            this.llmProvider.getApiKeyMissingNotified().clear();
            
            // Refresh model dropdown
            this.display();
          }));
    }

    // Model selection (async)
    this.addModelSetting(containerEl);
  }
  
  private async addModelSetting(containerEl: HTMLElement): Promise<void> {
    const modelContainer = containerEl.createDiv();
    const provider = this.settings.provider;
    const service = this.llmProvider.getServiceCache().get(provider);
    
    // Create a container for the model setting that we can update
    
    if (['ollama', 'lmstudio'].includes(provider) && service?.available && service.models.length > 0) {
      // Show dropdown for available local models
      new Setting(modelContainer)
        .setName('Model')
        .setDesc(`Select from ${service.models.length} available ${provider} models.`)
        .addDropdown(cb => {
          service.models.forEach(model => cb.addOption(model, model));
          cb.setValue(this.settings.model || service.models[0])
            .onChange((v) => { this.settings.model = v; this.debouncedSave(); });
        });
    } else if (['openai', 'anthropic'].includes(provider) && this.settings.apiKey) {
      // Show loading state while fetching models
      const loadingSetting = new Setting(modelContainer)
        .setName('Model')
        .setDesc('Loading available models...');
      
      try {
        const availableModels = await this.llmProvider.fetchCloudModels(provider as 'openai' | 'anthropic');
        
        // Clear loading state and show actual dropdown
        modelContainer.empty();
        
        new Setting(modelContainer)
          .setName('Model')
          .setDesc(`Select from ${availableModels.length} available ${provider} models.`)
          .addDropdown(cb => {
            availableModels.forEach(model => cb.addOption(model, model));
            const currentModel = this.settings.model;
            const defaultModel = availableModels.includes(currentModel) ? currentModel : availableModels[0];
            cb.setValue(defaultModel)
              .onChange((v) => { this.settings.model = v; this.debouncedSave(); });
          });
          
        // Add refresh button
        new Setting(modelContainer)
          .setName('Refresh Models')
          .setDesc('Reload the list of available models from the API.')
          .addButton(button => button
            .setButtonText('Refresh')
            .onClick(async () => {
              this.llmProvider.getCloudModelCache().clear();
              this.display();
            }));
      } catch (error) {
        modelContainer.empty();
        this.addFallbackModelSetting(modelContainer, provider);
      }
    } else {
      // Fallback to text input
      this.addFallbackModelSetting(modelContainer, provider);
    }
  }
  
  private addFallbackModelSetting(container: HTMLElement, provider: string) {
    const defaultModels = {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-3-haiku-20240307',
      ollama: 'llama3.2',
      lmstudio: 'local-model'
    };
    
    const description = ['ollama', 'lmstudio'].includes(provider) 
      ? `Enter model name. Service not detected or no models available.`
      : `Enter model name manually.`;
    
    new Setting(container)
      .setName('Model')
      .setDesc(description)
      .addText(text => text
        .setPlaceholder(defaultModels[provider as keyof typeof defaultModels] || '')
        .setValue(this.settings.model)
        .onChange((v) => { this.settings.model = v.trim(); this.debouncedSave(); }));
  }
  
  private addLocalLLMSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Local LLM Configuration' });
    
    if (this.settings.provider === 'ollama') {
      new Setting(containerEl)
        .setName('Ollama URL')
        .setDesc('URL for your Ollama instance.')
        .addText(text => text
          .setValue(this.settings.ollamaUrl)
          .onChange((v) => { 
            this.settings.ollamaUrl = v.trim(); 
            this.debouncedSave();
            // Service will be re-detected on next use due to URL change
          }));
    }
    
    if (this.settings.provider === 'lmstudio') {
      new Setting(containerEl)
        .setName('LM Studio URL')
        .setDesc('URL for your LM Studio instance.')
        .addText(text => text
          .setValue(this.settings.lmstudioUrl)
          .onChange((v) => { 
            this.settings.lmstudioUrl = v.trim(); 
            this.debouncedSave();
            // Service will be re-detected on next use due to URL change
          }));
    }
    
    new Setting(containerEl)
      .setName('Model Refresh Interval')
      .setDesc('How often to check for available models (minutes).')
      .addSlider(slider => slider
        .setLimits(1, 60, 1)
        .setValue(this.settings.localModelRefreshInterval)
        .setDynamicTooltip()
        .onChange((v) => { 
          this.settings.localModelRefreshInterval = v; 
          this.debouncedSave();
          // Note: Service monitoring now uses on-demand detection
        }));
  }
  
  private addProcessingSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Processing Settings' });
    
    new Setting(containerEl)
      .setName('Owner name')
      .setDesc('Exact name the LLM should look for when deciding tasks.')
      .addText(text => text
        .setPlaceholder('Bryan Kolb')
        .setValue(this.settings.ownerName)
        .onChange((v) => { this.settings.ownerName = v.trim(); this.debouncedSave(); }));
    
    new Setting(containerEl)
      .setName('Tasks folder')
      .setDesc('Folder where generated task notes will be created.')
      .addText(text => text
        .setValue(this.settings.tasksFolder)
        .onChange((v) => { this.settings.tasksFolder = v.trim(); this.debouncedSave(); }));
    
    new Setting(containerEl)
      .setName('Trigger note types')
      .setDesc('Comma-separated list of note types to process (from frontmatter Type field).')
      .addText(text => text
        .setValue(this.settings.triggerTypes.join(', '))
        .onChange((v) => { 
          this.settings.triggerTypes = v.split(',').map(s => s.trim()).filter(s => s.length > 0);
          this.debouncedSave(); 
        }));
    
    new Setting(containerEl)
      .setName('Process edits as well as new files')
      .setDesc('If enabled, modifications to matching notes will be processed too.')
      .addToggle(toggle => toggle
        .setValue(this.settings.processOnUpdate)
        .onChange((v) => { this.settings.processOnUpdate = v; this.debouncedSave(); }));
    
    new Setting(containerEl)
      .setName('Link back to source')
      .setDesc('Insert a link back to the source note in generated task notes.')
      .addToggle(toggle => toggle
        .setValue(this.settings.linkBack)
        .onChange((v) => { this.settings.linkBack = v; this.debouncedSave(); }));
    
    new Setting(containerEl)
      .setName('Processed marker key')
      .setDesc('Frontmatter key to mark processed notes.')
      .addText(text => text
        .setValue(this.settings.processedFrontmatterKey)
        .onChange((v) => { this.settings.processedFrontmatterKey = v.trim(); this.debouncedSave(); }));
  }
  
  private addFrontmatterSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Task Note Frontmatter' });
    
    // Add field button
    new Setting(containerEl)
      .setName('Add Field')
      .setDesc('Add a new frontmatter field')
      .addButton(button => button
        .setButtonText('Add Field')
        .onClick(() => {
          this.settings.frontmatterFields.push({
            key: 'new_field',
            defaultValue: '',
            type: 'text',
            required: false
          });
          this.debouncedSave();
          this.display();
        }));
    
    // Display existing fields
    this.settings.frontmatterFields.forEach((field, index) => {
      const fieldContainer = containerEl.createDiv({ cls: 'task-extractor-field' });
      
      new Setting(fieldContainer)
        .setName(`Field ${index + 1}: ${field.key}`)
        .setDesc(`Type: ${field.type}, Required: ${field.required ? 'Yes' : 'No'}`)
        .addButton(button => button
          .setButtonText('Remove')
          .onClick(() => {
            this.settings.frontmatterFields.splice(index, 1);
            this.debouncedSave();
            this.display();
          }));
    });
    
    // Custom prompt
    new Setting(containerEl)
      .setName('Custom Prompt')
      .setDesc('Override the default task extraction prompt. Leave empty to use default.')
      .addTextArea(text => text
        .setPlaceholder('Enter custom prompt...')
        .setValue(this.settings.customPrompt)
        .onChange((v) => { this.settings.customPrompt = v; this.debouncedSave(); }));
  }
  
  private addAdvancedSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Advanced Settings' });
    
    new Setting(containerEl)
      .setName('Max Tokens')
      .setDesc('Maximum tokens to generate.')
      .addSlider(slider => slider
        .setLimits(100, 2000, 50)
        .setValue(this.settings.maxTokens)
        .setDynamicTooltip()
        .onChange((v) => { this.settings.maxTokens = v; this.debouncedSave(); }));
    
    new Setting(containerEl)
      .setName('Temperature')
      .setDesc('Creativity level (0 = deterministic, 1 = creative).')
      .addSlider(slider => slider
        .setLimits(0, 1, 0.1)
        .setValue(this.settings.temperature)
        .setDynamicTooltip()
        .onChange((v) => { this.settings.temperature = v; this.debouncedSave(); }));
    
    new Setting(containerEl)
      .setName('Timeout (seconds)')
      .setDesc('Request timeout for LLM calls.')
      .addSlider(slider => slider
        .setLimits(10, 120, 5)
        .setValue(this.settings.timeout)
        .setDynamicTooltip()
        .onChange((v) => { this.settings.timeout = v; this.debouncedSave(); }));
    
    new Setting(containerEl)
      .setName('Retry Attempts')
      .setDesc('Number of retry attempts for failed requests.')
      .addSlider(slider => slider
        .setLimits(1, 5, 1)
        .setValue(this.settings.retries)
        .setDynamicTooltip()
        .onChange((v) => { this.settings.retries = v; this.debouncedSave(); }));
  }
  
  private updateServiceStatus(statusEl: HTMLElement): void {
    statusEl.empty();
    
    const provider = this.settings.provider;
    const service = this.llmProvider.getServiceCache().get(provider);
    
    if (['ollama', 'lmstudio'].includes(provider)) {
      if (service?.available) {
        statusEl.createEl('div', { 
          text: `✅ ${provider} connected (${service.models.length} models)`,
          cls: 'task-extractor-status-success'
        });
      } else {
        statusEl.createEl('div', { 
          text: `❌ ${provider} not available`,
          cls: 'task-extractor-status-error'
        });
      }
    } else {
      if (this.settings.apiKey) {
        statusEl.createEl('div', { 
          text: `✅ ${provider} API key configured`,
          cls: 'task-extractor-status-success'
        });
      } else {
        statusEl.createEl('div', { 
          text: `❌ ${provider} API key required`,
          cls: 'task-extractor-status-error'
        });
      }
    }
  }
}