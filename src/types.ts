/*
 * Type definitions for Task Extractor Plugin
 */

export interface FrontmatterField {
  key: string;
  defaultValue: string;
  type: 'text' | 'date' | 'select' | 'boolean';
  options?: string[]; // for select type
  required: boolean;
}

export interface LLMService {
  name: string;
  url: string;
  available: boolean;
  models: string[];
  lastChecked: number;
}

export interface ExtractorSettings {
  provider: 'openai' | 'anthropic' | 'ollama' | 'lmstudio';
  apiKey: string;
  model: string;
  
  // Local LLM settings
  ollamaUrl: string;
  lmstudioUrl: string;
  anthropicUrl: string;
  localModelRefreshInterval: number; // minutes
  
  // Processing settings
  tasksFolder: string;
  linkBack: boolean;
  processedFrontmatterKey: string;
  ownerName: string;
  processOnUpdate: boolean;
  triggerTypes: string[]; // customizable note types to process
  triggerFrontmatterField: string; // configurable frontmatter field for filtering
  
  // Customizable frontmatter
  frontmatterFields: FrontmatterField[];
  customPrompt: string;
  
  // Advanced settings
  maxTokens: number;
  temperature: number;
  timeout: number; // seconds
  retries: number;
  
  // Debug settings
  debugMode: boolean;
  debugMaxEntries: number;
}

export interface ExtractedTask {
  task_title: string;
  task_details: string;
  due_date?: string | null;
  priority?: 'high' | 'medium' | 'low';
  project?: string | null;
  client?: string | null;
  source_excerpt?: string;
  confidence?: 'high' | 'medium' | 'low';
  [key: string]: any; // Allow additional extracted fields
}

export interface TaskExtractionResult {
  found: boolean;
  tasks: ExtractedTask[];
  confidence?: 'high' | 'medium' | 'low';
}

// Backward compatibility type alias
export interface TaskExtraction {
  found: boolean;
  task_title?: string;
  task_details?: string;
  due_date?: string | null;
  priority?: string;
  source_excerpt?: string;
  [key: string]: any; // Allow additional extracted fields
}

export const DEFAULT_FRONTMATTER_FIELDS: FrontmatterField[] = [
  { key: 'task', defaultValue: '', type: 'text', required: true },
  { key: 'status', defaultValue: 'inbox', type: 'select', options: ['inbox', 'next', 'waiting', 'someday', 'done', 'cancelled'], required: true },
  { key: 'priority', defaultValue: 'medium', type: 'select', options: ['low', 'medium', 'high', 'urgent'], required: true },
  { key: 'due', defaultValue: '', type: 'date', required: false },
  { key: 'project', defaultValue: '', type: 'text', required: false },
  { key: 'client', defaultValue: '', type: 'text', required: false },
  { key: 'created', defaultValue: '{{date}}', type: 'date', required: true },
  { key: 'tags', defaultValue: 'task', type: 'text', required: false }
];

export const DEFAULT_SETTINGS: ExtractorSettings = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o-mini',
  
  // Local LLM settings
  ollamaUrl: 'http://localhost:11434',
  lmstudioUrl: 'http://localhost:1234',
  anthropicUrl: 'https://api.anthropic.com/v1/messages',
  localModelRefreshInterval: 5,
  
  // Processing settings
  tasksFolder: 'Tasks',
  linkBack: true,
  processedFrontmatterKey: 'taskExtractor.processed',
  ownerName: 'Bryan Kolb',
  processOnUpdate: false,
  triggerTypes: ['email', 'meetingnote', 'meeting note', 'meeting notes'],
  triggerFrontmatterField: 'Type', // default to "Type" for backward compatibility
  
  // Customizable frontmatter
  frontmatterFields: DEFAULT_FRONTMATTER_FIELDS,
  customPrompt: '',
  
  // Advanced settings
  maxTokens: 800,
  temperature: 0,
  timeout: 30,
  retries: 3,
  
  // Debug settings
  debugMode: false,
  debugMaxEntries: 1000,
};

/**
 * Validates and sanitizes settings object, ensuring all values are within acceptable ranges
 * Returns a new settings object with validated values
 */
export function validateSettings(settings: Partial<ExtractorSettings>, debugLogger?: import('./debug-logger').DebugLogger): ExtractorSettings {
  const correlationId = debugLogger ? `validate-settings-${Date.now()}` : undefined;
  const validated: ExtractorSettings = { ...DEFAULT_SETTINGS };

  // Validate provider
  if (settings.provider && ['openai', 'anthropic', 'ollama', 'lmstudio'].includes(settings.provider)) {
    validated.provider = settings.provider;
  }

  // Validate string fields
  if (typeof settings.apiKey === 'string') validated.apiKey = settings.apiKey;
  if (typeof settings.model === 'string') validated.model = settings.model;
  if (typeof settings.ollamaUrl === 'string') validated.ollamaUrl = settings.ollamaUrl;
  if (typeof settings.lmstudioUrl === 'string') validated.lmstudioUrl = settings.lmstudioUrl;
  if (typeof settings.anthropicUrl === 'string') validated.anthropicUrl = settings.anthropicUrl;
  if (typeof settings.tasksFolder === 'string' && settings.tasksFolder.trim()) {
    validated.tasksFolder = settings.tasksFolder.trim();
  }
  if (typeof settings.ownerName === 'string' && settings.ownerName.trim()) {
    validated.ownerName = settings.ownerName.trim();
  }
  if (typeof settings.customPrompt === 'string') validated.customPrompt = settings.customPrompt;

  // Validate processed frontmatter key (can be nested like "taskExtractor.processed")
  if (typeof settings.processedFrontmatterKey === 'string') {
    const key = settings.processedFrontmatterKey.trim();
    // Allow nested keys with dots, but validate each part
    const parts = key.split('.');
    const yamlKeyPattern = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
    const isValid = parts.every(part => part && yamlKeyPattern.test(part));
    if (isValid) {
      validated.processedFrontmatterKey = key;
    }
  }

  // Validate frontmatter field with YAML key validation
  if (typeof settings.triggerFrontmatterField === 'string') {
    const field = settings.triggerFrontmatterField.trim();
    const yamlKeyPattern = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/;
    if (field && yamlKeyPattern.test(field) && !field.includes('..') && !field.startsWith('.') && !field.endsWith('.')) {
      validated.triggerFrontmatterField = field;
    }
  }

  // Validate boolean fields
  if (typeof settings.linkBack === 'boolean') validated.linkBack = settings.linkBack;
  if (typeof settings.processOnUpdate === 'boolean') validated.processOnUpdate = settings.processOnUpdate;

  // Validate arrays
  if (Array.isArray(settings.triggerTypes)) {
    const validTypes = settings.triggerTypes
      .filter(t => typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim());
    if (validTypes.length > 0) {
      validated.triggerTypes = validTypes;
    }
  }
  if (Array.isArray(settings.frontmatterFields)) {
    const validFields = settings.frontmatterFields.filter(f => 
      f && typeof f.key === 'string' && f.key.trim().length > 0 &&
      typeof f.defaultValue === 'string' &&
      typeof f.type === 'string' && ['text', 'date', 'select', 'boolean'].includes(f.type) &&
      typeof f.required === 'boolean'
    );
    if (validFields.length > 0) {
      validated.frontmatterFields = validFields;
    }
  }

  // Validate numeric fields with bounds
  if (typeof settings.localModelRefreshInterval === 'number' && !isNaN(settings.localModelRefreshInterval)) {
    validated.localModelRefreshInterval = Math.max(1, Math.min(60, settings.localModelRefreshInterval));
  }
  if (typeof settings.maxTokens === 'number' && !isNaN(settings.maxTokens)) {
    validated.maxTokens = Math.max(100, Math.min(2000, settings.maxTokens));
  }
  if (typeof settings.temperature === 'number' && !isNaN(settings.temperature)) {
    validated.temperature = Math.max(0, Math.min(1, settings.temperature));
  }
  if (typeof settings.timeout === 'number' && !isNaN(settings.timeout)) {
    validated.timeout = Math.max(10, Math.min(120, settings.timeout));
  }
  if (typeof settings.retries === 'number' && !isNaN(settings.retries)) {
    validated.retries = Math.max(1, Math.min(5, settings.retries));
  }

  // Validate debug settings
  if (typeof settings.debugMode === 'boolean') {
    validated.debugMode = settings.debugMode;
    debugLogger?.logValidationSuccess('settings', 'debugMode', correlationId);
  }
  if (typeof settings.debugMaxEntries === 'number' && !isNaN(settings.debugMaxEntries)) {
    const originalValue = settings.debugMaxEntries;
    validated.debugMaxEntries = Math.max(100, Math.min(10000, settings.debugMaxEntries));
    if (originalValue !== validated.debugMaxEntries) {
      debugLogger?.logValidation('settings', 'debugMaxEntries', originalValue, '100-10000', `Value clamped from ${originalValue} to ${validated.debugMaxEntries}`, correlationId);
    } else {
      debugLogger?.logValidationSuccess('settings', 'debugMaxEntries', correlationId);
    }
  } else if (settings.debugMaxEntries !== undefined) {
    debugLogger?.logValidation('settings', 'debugMaxEntries', settings.debugMaxEntries, 'number between 100-10000', 'Invalid debug max entries value', correlationId);
  }

  // Log overall validation summary
  debugLogger?.log('info', 'validation', 'Settings validation completed', {
    validatedFieldCount: Object.keys(settings).length,
    correlationId
  }, correlationId);

  return validated;
}