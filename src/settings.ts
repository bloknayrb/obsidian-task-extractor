/*
 * Settings UI and management
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import { ExtractorSettings, LLMService, DEFAULT_EXTRACTION_PROMPT } from './types';
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
    this.addStyles();
  }

  /**
   * Add custom styles for the settings UI
   */
  private addStyles(): void {
    const styleId = 'task-extractor-settings-styles';
    
    // Remove existing styles if they exist
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // Add new styles
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .task-extractor-field-editor {
        margin-bottom: 20px !important;
        padding: 16px !important;
        background-color: var(--background-secondary) !important;
        border-radius: 8px !important;
        border: 1px solid var(--background-modifier-border) !important;
      }
      
      .task-extractor-field-editor .setting-item {
        border: none !important;
        padding: 8px 0 !important;
      }
      
      .task-extractor-field-editor .setting-item:last-child {
        border-bottom: none !important;
      }
      
      .task-extractor-status-success {
        color: var(--text-success) !important;
        font-weight: 500 !important;
        margin-bottom: 12px !important;
      }
      
      .task-extractor-status-error {
        color: var(--text-error) !important;
        font-weight: 500 !important;
        margin-bottom: 12px !important;
      }
      
      .task-extractor-examples {
        margin-top: 16px !important;
        padding: 12px !important;
        background-color: var(--background-secondary) !important;
        border-radius: 8px !important;
        font-size: 0.9em !important;
      }
      
      .task-extractor-slider-input-container {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        width: 100% !important;
      }
      
      .task-extractor-slider {
        flex: 1 !important;
        min-width: 120px !important;
        height: 20px !important;
      }
      
      .task-extractor-number-input {
        width: 80px !important;
        text-align: center !important;
        padding: 4px 8px !important;
        border: 1px solid var(--background-modifier-border) !important;
        border-radius: 4px !important;
        background-color: var(--background-primary) !important;
        color: var(--text-normal) !important;
        font-size: 13px !important;
      }
    `;
    
    document.head.appendChild(style);
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

  // Clean up timeout and styles on hide
  hide() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    
    // Clean up styles
    const styleElement = document.getElementById('task-extractor-settings-styles');
    if (styleElement) {
      styleElement.remove();
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
    
    // Exclusion Settings
    this.addExclusionSection(containerEl);
    
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

      if (this.settings.provider === 'anthropic') {
        new Setting(containerEl)
          .setName('Anthropic URL')
          .setDesc('Optional: URL for a proxy for the Anthropic API.')
          .addText(text => text
            .setPlaceholder('https://api.anthropic.com/v1/messages')
            .setValue(this.settings.anthropicUrl)
            .onChange((v) => { 
              this.settings.anthropicUrl = v.trim(); 
              this.debouncedSave();
            }));
      }
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
    if (this.settings.provider !== 'ollama' && this.settings.provider !== 'lmstudio') {
      return;
    }

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
  
  private addExclusionSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'File/Folder Exclusion Settings' });
    
    // Add description
    containerEl.createEl('p', {
      text: 'Exclude specific files or folders from being processed by the task extractor.',
      cls: 'setting-item-description'
    });
    
    new Setting(containerEl)
      .setName('Excluded Paths')
      .setDesc('Comma-separated list of exact file or folder paths to exclude. Examples: "Templates/", "Archive/Old Notes/", "Private/secrets.md"')
      .addTextArea(text => text
        .setPlaceholder('Templates/, Archive/, Private/secrets.md')
        .setValue(this.settings.excludedPaths.join(', '))
        .onChange((v) => { 
          this.settings.excludedPaths = v.split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          this.debouncedSave(); 
        }));
    
    new Setting(containerEl)
      .setName('Exclusion Patterns')
      .setDesc('Comma-separated list of glob patterns to exclude files. Supports wildcards: * (any characters except /), ** (any characters including /), ? (single character). Examples: "*.template.md", "**/drafts/**", "Archive/**"')
      .addTextArea(text => text
        .setPlaceholder('*.template.md, **/drafts/**, Archive/**')
        .setValue(this.settings.excludedPatterns.join(', '))
        .onChange((v) => { 
          this.settings.excludedPatterns = v.split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          this.debouncedSave(); 
        }));
    
    // Add examples section
    const examplesEl = containerEl.createDiv({ cls: 'task-extractor-examples' });
    examplesEl.createEl('h4', { text: 'Examples:' });
    
    const examplesList = examplesEl.createEl('ul');
    examplesList.createEl('li').createEl('strong').setText('Exact Paths: ');
    examplesList.lastChild?.createEl('code').setText('"Templates/"');
    examplesList.lastChild?.appendText(' - excludes entire Templates folder');
    
    examplesList.createEl('li').createEl('strong').setText('File Extensions: ');
    examplesList.lastChild?.createEl('code').setText('"*.tmp"');
    examplesList.lastChild?.appendText(' - excludes all .tmp files');
    
    examplesList.createEl('li').createEl('strong').setText('Nested Folders: ');
    examplesList.lastChild?.createEl('code').setText('"**/drafts/**"');
    examplesList.lastChild?.appendText(' - excludes any drafts folder and its contents');
    
    examplesList.createEl('li').createEl('strong').setText('Mixed: ');
    examplesList.lastChild?.createEl('code').setText('"Archive/**, *.template.md, Private/"');
    examplesList.lastChild?.appendText(' - excludes Archive folder, template files, and Private folder');
    
    // Add styling for better visual separation
    examplesEl.style.marginTop = '16px';
    examplesEl.style.padding = '12px';
    examplesEl.style.backgroundColor = 'var(--background-secondary)';
    examplesEl.style.borderRadius = '8px';
    examplesEl.style.fontSize = '0.9em';
  }
  
  private addFrontmatterSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Task Note Frontmatter' });
    
    // Add description
    containerEl.createEl('p', {
      text: 'Configure the frontmatter fields that will be added to created task notes. Each field can have a specific type, default value, and be marked as required.',
      cls: 'setting-item-description'
    });
    
    // Default Task Type setting
    new Setting(containerEl)
      .setName('Default Task Type')
      .setDesc('Default value for the "Type" field in created task notes. This helps categorize and filter your task notes.')
      .addText(text => text
        .setPlaceholder('Task')
        .setValue(this.settings.defaultTaskType)
        .onChange((v) => { 
          this.settings.defaultTaskType = v.trim() || 'Task'; 
          this.debouncedSave(); 
        }));
    
    // Frontmatter Fields Management
    containerEl.createEl('h4', { text: 'Frontmatter Fields' });
    
    // Add field button
    new Setting(containerEl)
      .setName('Add Field')
      .setDesc('Add a new frontmatter field to the template')
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
    
    // Display existing fields with enhanced editing
    this.settings.frontmatterFields.forEach((field, index) => {
      this.addFrontmatterFieldEditor(containerEl, field, index);
    });
    
    // Custom prompt section
    containerEl.createEl('h4', { text: 'Task Extraction Prompt' });
    
    new Setting(containerEl)
      .setName('Custom Prompt')
      .setDesc('Override the default task extraction prompt. Leave empty to use the built-in default prompt. Use the "Reset to Default" button below to restore the original prompt text.')
      .addTextArea(text => text
        .setPlaceholder('Enter custom prompt...')
        .setValue(this.settings.customPrompt)
        .onChange((v) => { this.settings.customPrompt = v; this.debouncedSave(); }));
    
    // Reset to default button
    new Setting(containerEl)
      .setName('Reset to Default')
      .setDesc('Restore the default task extraction prompt.')
      .addButton(button => button
        .setButtonText('Reset to Default')
        .onClick(() => {
          // Replace placeholder with actual owner name
          const defaultPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', this.settings.ownerName);
          
          // Update the settings immediately for UI consistency
          this.settings.customPrompt = defaultPrompt;
          
          // Trigger debounced save to persist changes
          this.debouncedSave();
          
          // Refresh the display to update the text area
          this.display();
        }));
  }

  /**
   * Creates an enhanced editor for a single frontmatter field
   */
  private addFrontmatterFieldEditor(containerEl: HTMLElement, field: any, index: number): void {
    const fieldContainer = containerEl.createDiv({ cls: 'task-extractor-field-editor' });
    
    // Field header with remove button
    const headerSetting = new Setting(fieldContainer)
      .setName(`Field ${index + 1}`)
      .setDesc(`Configure frontmatter field properties`)
      .addButton(button => button
        .setButtonText('Remove')
        .setTooltip('Remove this field from the template')
        .onClick(() => {
          this.settings.frontmatterFields.splice(index, 1);
          this.debouncedSave();
          this.display();
        }));
    
    // Field key (name)
    new Setting(fieldContainer)
      .setName('Field Name')
      .setDesc('The frontmatter key name (must be valid YAML key)')
      .addText(text => text
        .setPlaceholder('field_name')
        .setValue(field.key)
        .onChange((v) => {
          const validatedKey = this.validateFrontmatterFieldName(v.trim());
          field.key = validatedKey;
          this.debouncedSave();
          
          // Show validation feedback if key was changed
          if (validatedKey !== v.trim()) {
            this.showValidationFeedback(text.inputEl, 'Invalid field name. Must start with letter/underscore and contain only letters, numbers, underscores, hyphens, and dots.');
            text.setValue(validatedKey);
          }
        }));
    
    // Field type
    new Setting(fieldContainer)
      .setName('Field Type')
      .setDesc('The data type for this field')
      .addDropdown(dropdown => dropdown
        .addOption('text', 'Text')
        .addOption('date', 'Date')
        .addOption('select', 'Select (dropdown)')
        .addOption('boolean', 'Boolean (true/false)')
        .setValue(field.type)
        .onChange((v) => {
          field.type = v as 'text' | 'date' | 'select' | 'boolean';
          this.debouncedSave();
          this.display(); // Refresh to show/hide options field
        }));
    
    // Default value
    new Setting(fieldContainer)
      .setName('Default Value')
      .setDesc('Default value for this field (use {{date}} for current date)')
      .addText(text => text
        .setPlaceholder(this.getDefaultValuePlaceholder(field.type))
        .setValue(field.defaultValue)
        .onChange((v) => {
          field.defaultValue = v;
          this.debouncedSave();
        }));
    
    // Options for select type
    if (field.type === 'select') {
      new Setting(fieldContainer)
        .setName('Select Options')
        .setDesc('Comma-separated list of options for the dropdown')
        .addText(text => text
          .setPlaceholder('option1, option2, option3')
          .setValue(field.options ? field.options.join(', ') : '')
          .onChange((v) => {
            field.options = v.split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            this.debouncedSave();
          }));
    }
    
    // Required toggle
    new Setting(fieldContainer)
      .setName('Required Field')
      .setDesc('Whether this field must have a value')
      .addToggle(toggle => toggle
        .setValue(field.required)
        .onChange((v) => {
          field.required = v;
          this.debouncedSave();
        }));
    
    // Add visual separation between fields
    fieldContainer.style.marginBottom = '20px';
    fieldContainer.style.padding = '16px';
    fieldContainer.style.backgroundColor = 'var(--background-secondary)';
    fieldContainer.style.borderRadius = '8px';
    fieldContainer.style.border = '1px solid var(--background-modifier-border)';
  }

  /**
   * Validates frontmatter field name according to YAML key format
   */
  private validateFrontmatterFieldName(fieldName: string): string {
    // Check if empty
    if (!fieldName || fieldName.length === 0) {
      return 'field';
    }

    // YAML key validation: must start with letter or underscore, 
    // can contain letters, numbers, underscores, hyphens, and dots
    const yamlKeyPattern = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/;
    
    if (!yamlKeyPattern.test(fieldName)) {
      return 'field';
    }

    // Additional checks for problematic characters
    if (fieldName.includes('..') || fieldName.startsWith('.') || fieldName.endsWith('.')) {
      return 'field';
    }

    return fieldName;
  }

  /**
   * Gets appropriate placeholder text for default value based on field type
   */
  private getDefaultValuePlaceholder(type: string): string {
    switch (type) {
      case 'text':
        return 'Enter default text...';
      case 'date':
        return '{{date}} or YYYY-MM-DD';
      case 'select':
        return 'Choose from options above';
      case 'boolean':
        return 'true or false';
      default:
        return 'Enter default value...';
    }
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