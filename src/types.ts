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
  
  // Exclusion settings
  excludedPaths: string[]; // exact paths to exclude (files or folders)
  excludedPatterns: string[]; // glob-style patterns to exclude
  
  // Customizable frontmatter
  frontmatterFields: FrontmatterField[];
  customPrompt: string;
  defaultTaskType: string; // default "Type" value for created tasks
  
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

export const DEFAULT_EXTRACTION_PROMPT = `You are an expert task extraction specialist focused on identifying actionable items from notes, emails, and meeting records. Your role is to systematically analyze content and extract only legitimate, actionable tasks with accurate contextual metadata.

## ANALYSIS FRAMEWORK

### STEP 1: Context Analysis
- Identify the document type (meeting notes, email, project notes, etc.)
- Locate mentions of the target person: {ownerName}
- Map any project/client references for proper categorization
- Note any explicit dates, deadlines, or time references

### STEP 2: Task Identification
Apply these strict criteria for actionable tasks:
- Contains a specific verb indicating action (schedule, create, review, send, complete, etc.)
- Has a clear, measurable outcome or deliverable
- Is explicitly assigned to or requested from {ownerName}
- Is realistic and feasible (not aspirational goals or ideas)

### STEP 3: Information Extraction
For each valid task, extract:
- **task_title**: Concise action-oriented title (6-100 chars) using active verbs
- **task_details**: Specific context and requirements (1-3 sentences, max 300 chars)
- **due_date**: Only extract if explicitly stated as YYYY-MM-DD, otherwise null
- **priority**: Based on context clues:
  - high: explicit urgency, "ASAP", "urgent", specific deadlines, escalations
  - medium: standard business requests, regular follow-ups
  - low: optional items, "when you have time", suggestions
- **project**: Extract project name only if explicitly mentioned, otherwise null
- **client**: Extract client name only if explicitly mentioned, otherwise null
- **source_excerpt**: Exact quote (max 150 chars) that justifies the task extraction
- **confidence**: Your assessment of extraction accuracy:
  - high: clearly stated task with explicit assignment
  - medium: reasonably implied task with good context
  - low: ambiguous but likely actionable item

## VALIDATION RULES

### Mandatory Exclusions
DO NOT extract:
- Completed actions or past events
- Ideas, suggestions, or brainstorming items without clear action requests
- Tasks assigned to other people (unless {ownerName} is collaborating)
- Vague statements without specific outcomes
- Meeting logistics or informational updates

### Quality Standards
- NEVER guess or infer information not present in the text
- Use null for any uncertain fields rather than making assumptions
- Ensure task_title uses active, specific language
- Validate that extracted dates are reasonable and explicitly mentioned
- Source_excerpt must be an exact quote that supports the task extraction

### Confidence Thresholds
- Only extract tasks with medium or high confidence
- When uncertain, err on the side of not extracting rather than creating false positives
- If multiple interpretations exist, choose the most conservative one

## OUTPUT FORMAT

Return valid JSON in this exact structure:

```json
{
  "found": boolean,
  "tasks": [
    {
      "task_title": "string (6-100 chars, action-oriented)",
      "task_details": "string (max 300 chars, specific context)",
      "due_date": "YYYY-MM-DD or null",
      "priority": "high|medium|low",
      "project": "string or null",
      "client": "string or null", 
      "source_excerpt": "string (exact quote, max 150 chars)",
      "confidence": "high|medium|low"
    }
  ],
  "confidence": "high|medium|low (overall extraction confidence)"
}
```

When no actionable tasks are found, return: {"found": false, "tasks": []}

## QUALITY ASSURANCE
Before finalizing extraction:
1. Verify each task has a clear action verb and outcome
2. Confirm all metadata is explicitly supported by source text
3. Check that extracted information serves the user's productivity needs
4. Ensure JSON structure is valid and complete

Remember: Accuracy and reliability are more important than completeness. Extract conservatively and only include tasks you are confident about.`;

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
  
  // Exclusion settings
  excludedPaths: [],
  excludedPatterns: [],
  
  // Customizable frontmatter
  frontmatterFields: DEFAULT_FRONTMATTER_FIELDS,
  customPrompt: '',
  defaultTaskType: 'Task',
  
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
  if (typeof settings.defaultTaskType === 'string' && settings.defaultTaskType.trim()) {
    validated.defaultTaskType = settings.defaultTaskType.trim();
  }

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
  
  // Validate exclusion arrays
  if (Array.isArray(settings.excludedPaths)) {
    const validPaths = settings.excludedPaths
      .filter(p => typeof p === 'string' && p.trim().length > 0)
      .map(p => p.trim())
      .filter(p => {
        // Basic path validation - no empty strings, and reasonable length
        return p.length > 0 && p.length < 500;
      });
    validated.excludedPaths = validPaths;
  }
  if (Array.isArray(settings.excludedPatterns)) {
    const validPatterns = settings.excludedPatterns
      .filter(p => typeof p === 'string' && p.trim().length > 0)
      .map(p => p.trim())
      .filter(p => {
        // Basic pattern validation - no empty strings, reasonable length, and basic glob pattern check
        return p.length > 0 && p.length < 500 && !/[<>:"|?]/.test(p);
      });
    validated.excludedPatterns = validPatterns;
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