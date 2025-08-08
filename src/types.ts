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
  { key: 'status', defaultValue: 'todo', type: 'select', options: ['todo', 'doing', 'done', 'cancelled'], required: true },
  { key: 'priority', defaultValue: 'medium', type: 'select', options: ['low', 'medium', 'high', 'urgent'], required: true },
  { key: 'due', defaultValue: '', type: 'date', required: false },
  { key: 'project', defaultValue: '', type: 'text', required: false },
  { key: 'client', defaultValue: '', type: 'text', required: false },
  { key: 'created', defaultValue: '{{date}}', type: 'date', required: false },
  { key: 'tags', defaultValue: 'task', type: 'text', required: false }
];

export const DEFAULT_SETTINGS: ExtractorSettings = {
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