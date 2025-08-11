/*
 * Task processing and extraction logic
 */

import { App, TFile, Notice } from 'obsidian';
import { ExtractorSettings, TaskExtraction } from './types';
import { LLMProviderManager } from './llm-providers';

export class TaskProcessor {
  private processingFiles: Set<string> = new Set();
  private fileChangeDebouncer: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private app: App,
    private settings: ExtractorSettings,
    private llmProvider: LLMProviderManager
  ) {}

  // Debounce file changes to prevent rapid processing
  debounceFileChange(file: TFile, callback: (file: TFile) => void) {
    const existing = this.fileChangeDebouncer.get(file.path);
    if (existing) {
      clearTimeout(existing);
    }
    
    this.fileChangeDebouncer.set(file.path, setTimeout(() => {
      callback(file);
      this.fileChangeDebouncer.delete(file.path);
    }, 2000));
  }

  // When a file is created or modified
  async onFileChanged(file: TFile) {
    try {
      if (file.extension !== 'md') return;
      if (this.processingFiles.has(file.path)) return;
      this.processingFiles.add(file.path);

      const cache = this.app.metadataCache.getFileCache(file);
      const front = cache?.frontmatter;
      if (!front) {
        this.processingFiles.delete(file.path);
        return;
      }

      // Validate settings at runtime to handle corrupted configurations
      if (!this.settings.triggerTypes || !Array.isArray(this.settings.triggerTypes) || this.settings.triggerTypes.length === 0) {
        console.warn('TaskExtractor: Invalid trigger types configuration, skipping processing');
        this.processingFiles.delete(file.path);
        return;
      }

      // check already processed
      const processedKey = this.settings.processedFrontmatterKey || 'taskExtractor.processed';
      const processedValue = this.getFrontmatterValue(front, processedKey);
      if (processedValue === true || processedValue === 'true') {
        // already processed
        this.processingFiles.delete(file.path);
        return;
      }

      // Use validated frontmatter field with fallback to "Type"
      const frontmatterField = this.validateFrontmatterField(this.settings.triggerFrontmatterField);
      const typeRaw = this.getFrontmatterValue(front, frontmatterField) || '';
      const type = ('' + typeRaw).toLowerCase();
      const accepted = this.settings.triggerTypes.map(t => t.toLowerCase());
      if (!accepted.includes(type)) {
        this.processingFiles.delete(file.path);
        return;
      }

      // Validate owner name is configured
      if (!this.settings.ownerName || this.settings.ownerName.trim().length === 0) {
        console.warn('TaskExtractor: Owner name not configured, skipping processing');
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
    const files = this.getUnprocessedFiles();
    const batches = this.chunkArray(files, 5);
    
    for (const batch of batches) {
      await Promise.all(batch.map(f => this.onFileChanged(f)));
      await this.delay(100); // Prevent UI blocking
    }
  }

  // Get list of unprocessed files that match trigger criteria
  private getUnprocessedFiles(): TFile[] {
    const files = this.app.vault.getMarkdownFiles();
    const unprocessedFiles: TFile[] = [];
    
    for (const f of files) {
      const cache = this.app.metadataCache.getFileCache(f);
      const front = cache?.frontmatter;
      if (!front) continue;
      
      // Use validated frontmatter field with fallback to "Type"
      const frontmatterField = this.validateFrontmatterField(this.settings.triggerFrontmatterField);
      const typeRaw = this.getFrontmatterValue(front, frontmatterField) || '';
      const type = ('' + typeRaw).toLowerCase();
      const accepted = this.settings.triggerTypes.map(t => t.toLowerCase());
      const processedValue = this.getFrontmatterValue(front, this.settings.processedFrontmatterKey);
      
      if (accepted.includes(type) && !(processedValue === true || processedValue === 'true')) {
        unprocessedFiles.push(f);
      }
    }
    
    return unprocessedFiles;
  }

  // Utility function to chunk array into smaller batches
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // Utility function for delays
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getFrontmatterValue(front: any, key: string) {
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

  private async markFileProcessed(file: TFile) {
    if (!this.settings.processedFrontmatterKey) return;
    
    try {
      // Use Obsidian's official API for atomic frontmatter processing
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        // Handle nested keys (e.g., "taskExtractor.processed")
        const keys = this.settings.processedFrontmatterKey.split('.');
        let current = frontmatter;
        
        // Navigate to the nested property, creating objects as needed
        for (let i = 0; i < keys.length - 1; i++) {
          const key = keys[i];
          if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
          }
          current = current[key];
        }
        
        // Set the final property
        current[keys[keys.length - 1]] = true;
      });
    } catch (e) {
      console.warn('Failed to mark file processed with official API:', e);
      // Fallback to previous method if the official API fails
      await this.markFileProcessedFallback(file);
    }
  }

  // Fallback method using the previous implementation
  private async markFileProcessedFallback(file: TFile) {
    try {
      const content = await this.app.vault.read(file);
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let newContent = content;
      if (fmMatch) {
        const fm = fmMatch[1];
        const processedKey = this.settings.processedFrontmatterKey;
        // if already present, skip
        if (!new RegExp('^' + processedKey.replace('.', '\\.') + ':', 'm').test(fm)) {
          const lines = fm.split('\n');
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
      console.warn('Failed to mark file processed with fallback method:', e);
    }
  }

  // Compose prompt, call LLM, and parse response
  private async extractTaskFromContent(content: string, sourcePath: string): Promise<TaskExtraction> {
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
      const raw = await this.llmProvider.callLLM(system, user);
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
        ...parsed // Include any additional extracted fields
      };
    } catch (e) {
      console.error('extractTaskFromContent error', e);
      return { found: false };
    }
  }

  private safeParseJSON(text: string | null) {
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
  private async createTaskNote(extraction: TaskExtraction, sourceFile: TFile) {
    const safeTitle = this.makeFilenameSafe(extraction.task_title || 'task');
    let filename = `${safeTitle}.md`;
    
    // Validate and sanitize tasks folder
    let folder = this.settings.tasksFolder?.trim() || 'Tasks';
    if (!folder || folder.length === 0) {
      folder = 'Tasks';
    }
    // Remove any potentially problematic characters from folder name
    folder = folder.replace(/[\\/:*?"<>|]/g, '');
    
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

  private makeFilenameSafe(title: string) {
    return title.replace(/[\\/:*?"<>|#%{}\\^~\[\]`;'@&=+]/g, '').replace(/\s+/g, '-').slice(0, 120);
  }

  /**
   * Validates frontmatter field name with graceful fallback to "Type"
   * Ensures the field name is valid for YAML and safe to use
   */
  private validateFrontmatterField(fieldName: string): string {
    // Check if empty or undefined
    if (!fieldName || typeof fieldName !== 'string' || fieldName.trim().length === 0) {
      console.warn('TaskExtractor: Empty frontmatter field name, falling back to "Type"');
      return 'Type';
    }

    const trimmed = fieldName.trim();

    // YAML key validation: must start with letter or underscore, 
    // can contain letters, numbers, underscores, hyphens, and dots
    const yamlKeyPattern = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/;
    
    if (!yamlKeyPattern.test(trimmed)) {
      console.warn(`TaskExtractor: Invalid frontmatter field name "${trimmed}", falling back to "Type"`);
      return 'Type';
    }

    // Additional checks for problematic patterns
    if (trimmed.includes('..') || trimmed.startsWith('.') || trimmed.endsWith('.')) {
      console.warn(`TaskExtractor: Problematic frontmatter field name "${trimmed}", falling back to "Type"`);
      return 'Type';
    }

    return trimmed;
  }

  // Cleanup method
  cleanup() {
    this.fileChangeDebouncer.forEach(timeout => clearTimeout(timeout));
    this.fileChangeDebouncer.clear();
    this.processingFiles.clear();
  }

  // Methods for backward compatibility
  getProcessingFiles() { return this.processingFiles; }
}