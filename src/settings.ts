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

  /**
   * Validates frontmatter field name according to YAML key format
   * Returns a valid field name or defaults to "Type"
   */
  private validateFrontmatterField(fieldName: string): string {
    // Check if empty
    if (!fieldName || fieldName.length === 0) {
      return 'Type';
    }

    // YAML key validation: must start with letter or underscore, 
    // can contain letters, numbers, underscores, hyphens, and dots
    const yamlKeyPattern = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/;
    
    if (!yamlKeyPattern.test(fieldName)) {
      return 'Type';
    }

    // Additional checks for problematic characters
    if (fieldName.includes('..') || fieldName.startsWith('.') || fieldName.endsWith('.')) {
      return 'Type';
    }

    return fieldName;
  }

  /**
   * Shows validation feedback to the user
   */
  private showValidationFeedback(inputEl: HTMLInputElement, message: string): void {
    // Visual feedback
    inputEl.style.borderColor = '#ff6b6b';
    inputEl.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
    
    // Create tooltip or use title attribute
    inputEl.title = message;
    
    // Reset styling after delay
    setTimeout(() => {
      inputEl.style.borderColor = '';
      inputEl.style.backgroundColor = '';
      inputEl.title = '';
    }, 3000);
  }

  /**
   * Validates and clamps numeric values with enhanced error handling
   */
  private validateNumericInput(value: number, min: number, max: number, defaultValue: number): { value: number; isValid: boolean; message?: string } {
    // Check for NaN
    if (isNaN(value)) {
      return { 
        value: defaultValue, 
        isValid: false, 
        message: `Invalid number. Using default value ${defaultValue}.` 
      };
    }

    // Check bounds
    if (value < min) {
      return { 
        value: min, 
        isValid: false, 
        message: `Value too low. Minimum is ${min}.` 
      };
    }

    if (value > max) {
      return { 
        value: max, 
        isValid: false, 
        message: `Value too high. Maximum is ${max}.` 
      };
    }

    return { value, isValid: true };
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
    
    // Debug Settings
    this.addDebugSection(containerEl);
    
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
    
    this.addSliderWithInput(
      containerEl,
      'Model Refresh Interval',
      'How often to check for available models (minutes).',
      this.settings.localModelRefreshInterval,
      1,
      60,
      1,
      (v) => { 
        this.settings.localModelRefreshInterval = v; 
        this.debouncedSave();
        // Note: Service monitoring now uses on-demand detection
      }
    );
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
      .setName('Frontmatter field for filtering')
      .setDesc('The frontmatter field name to use for filtering notes (e.g., "Type", "Category", "NoteType").')
      .addText(text => text
        .setPlaceholder('Type')
        .setValue(this.settings.triggerFrontmatterField)
        .onChange((v) => { 
          const validatedField = this.validateFrontmatterField(v.trim());
          this.settings.triggerFrontmatterField = validatedField; 
          this.debouncedSave(); 
          
          // Update the input field if validation changed the value
          if (validatedField !== v.trim()) {
            text.setValue(validatedField);
            this.showValidationFeedback(text.inputEl, 'Invalid field name. Using default "Type".');
          }
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
  
  private addDebugSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Debug Settings' });
    
    new Setting(containerEl)
      .setName('Debug Mode')
      .setDesc('Enable debug logging to monitor plugin activities. Logs are stored in memory only and cleared when Obsidian restarts.')
      .addToggle(toggle => toggle
        .setValue(this.settings.debugMode)
        .onChange((v) => { 
          this.settings.debugMode = v; 
          this.debouncedSave();
          // Refresh display to show/hide debug max entries setting
          this.display();
        }));
    
    // Only show max entries setting when debug mode is enabled
    if (this.settings.debugMode) {
      this.addSliderWithInput(
        containerEl,
        'Max Debug Entries',
        'Maximum number of debug log entries to keep in memory. Older entries are automatically removed.',
        this.settings.debugMaxEntries,
        100,
        10000,
        100,
        (v) => { this.settings.debugMaxEntries = v; this.debouncedSave(); }
      );
    }
  }
  
  private addAdvancedSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Advanced Settings' });
    
    this.addSliderWithInput(
      containerEl,
      'Max Tokens',
      'Maximum tokens to generate.',
      this.settings.maxTokens,
      100,
      2000,
      50,
      (v) => { this.settings.maxTokens = v; this.debouncedSave(); }
    );
    
    this.addSliderWithInput(
      containerEl,
      'Temperature',
      'Creativity level (0 = deterministic, 1 = creative).',
      this.settings.temperature,
      0,
      1,
      0.1,
      (v) => { this.settings.temperature = v; this.debouncedSave(); }
    );
    
    this.addSliderWithInput(
      containerEl,
      'Timeout (seconds)',
      'Request timeout for LLM calls.',
      this.settings.timeout,
      10,
      120,
      5,
      (v) => { this.settings.timeout = v; this.debouncedSave(); }
    );
    
    this.addSliderWithInput(
      containerEl,
      'Retry Attempts',
      'Number of retry attempts for failed requests.',
      this.settings.retries,
      1,
      5,
      1,
      (v) => { this.settings.retries = v; this.debouncedSave(); }
    );
  }
  
  /**
   * Helper method to create an enhanced slider with input field
   * Provides bidirectional synchronization between slider and number input
   */
  private addSliderWithInput(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void
  ): void {
    const setting = new Setting(containerEl)
      .setName(name)
      .setDesc(desc);

    // Create container for slider and input
    const controlContainer = setting.controlEl.createDiv({ cls: 'task-extractor-slider-input-container' });
    
    // Create slider element
    const sliderEl = controlContainer.createEl('input', {
      type: 'range',
      cls: 'task-extractor-slider'
    }) as HTMLInputElement;
    
    sliderEl.min = min.toString();
    sliderEl.max = max.toString();
    sliderEl.step = step.toString();
    sliderEl.value = value.toString();
    
    // Create number input element
    const inputEl = controlContainer.createEl('input', {
      type: 'number',
      cls: 'task-extractor-number-input'
    }) as HTMLInputElement;
    
    inputEl.min = min.toString();
    inputEl.max = max.toString();
    inputEl.step = step.toString();
    inputEl.value = value.toString();
    
    // Slider change handler
    sliderEl.addEventListener('input', () => {
      const newValue = parseFloat(sliderEl.value);
      const validation = this.validateNumericInput(newValue, min, max, value);
      
      // Update input field to match slider
      inputEl.value = validation.value.toString();
      
      // Call onChange callback
      onChange(validation.value);
    });
    
    // Input field change handler
    inputEl.addEventListener('input', () => {
      const newValue = parseFloat(inputEl.value);
      const validation = this.validateNumericInput(newValue, min, max, value);
      
      // Update input field if value was clamped or invalid
      if (!validation.isValid) {
        inputEl.value = validation.value.toString();
        
        // Show validation feedback with message
        this.showValidationFeedback(inputEl, validation.message || 'Invalid value');
      }
      
      // Update slider to match input
      sliderEl.value = validation.value.toString();
      
      // Call onChange callback
      onChange(validation.value);
    });
    
    // Input field blur handler for final validation
    inputEl.addEventListener('blur', () => {
      const newValue = parseFloat(inputEl.value);
      const validation = this.validateNumericInput(newValue, min, max, value);
      
      // Ensure final value is valid
      inputEl.value = validation.value.toString();
      sliderEl.value = validation.value.toString();
      
      // Show feedback if value was corrected
      if (!validation.isValid) {
        this.showValidationFeedback(inputEl, validation.message || 'Value corrected');
      }
    });
    
    // Add styling for better visual layout
    controlContainer.style.display = 'flex';
    controlContainer.style.alignItems = 'center';
    controlContainer.style.gap = '12px';
    controlContainer.style.width = '100%';
    
    sliderEl.style.flex = '1';
    sliderEl.style.minWidth = '120px';
    sliderEl.style.height = '20px';
    
    inputEl.style.width = '80px';
    inputEl.style.textAlign = 'center';
    inputEl.style.padding = '4px 8px';
    inputEl.style.border = '1px solid var(--background-modifier-border)';
    inputEl.style.borderRadius = '4px';
    inputEl.style.backgroundColor = 'var(--background-primary)';
    inputEl.style.color = 'var(--text-normal)';
    inputEl.style.fontSize = '13px';
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