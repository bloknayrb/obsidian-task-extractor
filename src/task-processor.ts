/*
 * Task processing and extraction logic
 */

import { App, TFile, Notice } from 'obsidian';
import { ExtractorSettings, TaskExtraction, TaskExtractionResult, ExtractedTask } from './types';
import { LLMProviderManager } from './llm-providers';
import { DebugLogger } from './debug-logger';

interface ProcessingStatus {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  startTime: number;
  timeout?: NodeJS.Timeout;
}

export class TaskProcessor {
  private processingFiles: Set<string> = new Set();
  private fileChangeDebouncer: Map<string, NodeJS.Timeout> = new Map();
  private processingQueue: Map<string, ProcessingStatus> = new Map();

  constructor(
    private app: App,
    private settings: ExtractorSettings,
    private llmProvider: LLMProviderManager,
    private debugLogger?: DebugLogger
  ) {}

  /**
   * Conditional logging helper to ensure zero overhead when debug mode is disabled
   */
  private log(
    level: 'info' | 'warn' | 'error',
    category: 'file-processing' | 'llm-call' | 'task-creation' | 'service-detection' | 'validation' | 'error',
    message: string,
    data?: any,
    correlationId?: string
  ): void {
    if (this.debugLogger?.isEnabled()) {
      this.debugLogger.log(level, category, message, data, correlationId);
    }
  }

  /**
   * Start a new operation for correlation tracking
   */
  private startOperation(
    category: 'file-processing' | 'llm-call' | 'task-creation' | 'service-detection' | 'validation' | 'error',
    message: string,
    data?: any
  ): string | undefined {
    if (this.debugLogger?.isEnabled()) {
      return this.debugLogger.startOperation(category, message, data);
    }
    return undefined;
  }

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
    // Atomic file processing with guaranteed cleanup and queue management
    if (file.extension !== 'md') {
      this.log('info', 'file-processing', 'File skipped: not a markdown file', { 
        filePath: file.path, 
        extension: file.extension 
      });
      return;
    }

    // Start operation tracking for correlation
    const correlationId = this.startOperation('file-processing', 'Processing file', { 
      filePath: file.path 
    });
    
    // Check if already in processing queue or set
    const queueStatus = this.processingQueue.get(file.path);
    if (queueStatus?.status === 'processing' || this.processingFiles.has(file.path)) {
      this.log('info', 'file-processing', 'File skipped: already being processed', { 
        filePath: file.path,
        queueStatus: queueStatus?.status,
        inProcessingSet: this.processingFiles.has(file.path)
      }, correlationId);
      return;
    }
    
    // Add to queue with status tracking
    const processingStatus: ProcessingStatus = {
      status: 'queued',
      startTime: Date.now()
    };
    
    // Add processing timeout mechanism
    processingStatus.timeout = setTimeout(() => {
      console.warn(`TaskExtractor: File processing timeout for ${file.path}`);
      this.cleanupFileProcessing(file.path);
    }, 30000); // 30 second timeout
    
    this.processingQueue.set(file.path, processingStatus);
    this.processingFiles.add(file.path);
    
    // Update status to processing
    processingStatus.status = 'processing';
    
    try {
      const cache = this.app.metadataCache.getFileCache(file);
      const front = cache?.frontmatter;
      if (!front) {
        this.log('info', 'file-processing', 'File skipped: no frontmatter found', { 
          filePath: file.path 
        }, correlationId);
        return;
      }

      this.log('info', 'file-processing', 'File has frontmatter, validating', { 
        filePath: file.path,
        frontmatterKeys: Object.keys(front)
      }, correlationId);

      // Validate settings at runtime to handle corrupted configurations
      if (!this.settings.triggerTypes || !Array.isArray(this.settings.triggerTypes) || this.settings.triggerTypes.length === 0) {
        console.warn('TaskExtractor: Invalid trigger types configuration, skipping processing');
        this.log('error', 'validation', 'Invalid trigger types configuration', { 
          filePath: file.path,
          triggerTypes: this.settings.triggerTypes
        }, correlationId);
        this.processingFiles.delete(file.path);
        return;
      }

      // check already processed
      const processedKey = this.settings.processedFrontmatterKey || 'taskExtractor.processed';
      const processedValue = this.getFrontmatterValue(front, processedKey);
      if (processedValue === true || processedValue === 'true') {
        // already processed
        this.log('info', 'file-processing', 'File skipped: already processed', { 
          filePath: file.path,
          processedKey,
          processedValue
        }, correlationId);
        return;
      }

      // Use validated frontmatter field with fallback to "Type"
      const frontmatterField = this.validateFrontmatterField(this.settings.triggerFrontmatterField, correlationId);
      const typeRaw = this.getFrontmatterValue(front, frontmatterField) || '';
      
      // Log frontmatter field validation
      if (typeRaw) {
        this.debugLogger?.logValidationSuccess('frontmatter', `${frontmatterField}`, correlationId);
      } else {
        this.debugLogger?.logValidation(
          'frontmatter',
          frontmatterField,
          typeRaw,
          'non-empty value',
          'Frontmatter field is empty or missing',
          correlationId
        );
      }
      
      const type = ('' + typeRaw).toLowerCase();
      const accepted = this.settings.triggerTypes.map(t => t.toLowerCase());
      
      this.log('info', 'file-processing', 'Checking trigger type match', { 
        filePath: file.path,
        frontmatterField,
        typeFound: type,
        acceptedTypes: accepted,
        matches: accepted.includes(type)
      }, correlationId);
      
      if (!accepted.includes(type)) {
        this.log('info', 'file-processing', 'File skipped: trigger type not matched', { 
          filePath: file.path,
          typeFound: type,
          acceptedTypes: accepted
        }, correlationId);
        
        // Log detailed validation context
        this.debugLogger?.logValidation(
          'frontmatter',
          `${frontmatterField}.triggerMatch`,
          type,
          `one of: ${accepted.join(', ')}`,
          `Value '${type}' does not match any trigger types`,
          correlationId
        );
        return;
      } else {
        // Log successful trigger type match
        this.debugLogger?.logValidationSuccess('frontmatter', `${frontmatterField}.triggerMatch`, correlationId);
      }

      // Validate owner name is configured
      if (!this.settings.ownerName || this.settings.ownerName.trim().length === 0) {
        console.warn('TaskExtractor: Owner name not configured, skipping processing');
        this.log('error', 'validation', 'Owner name not configured', { 
          filePath: file.path,
          ownerName: this.settings.ownerName
        }, correlationId);
        this.processingFiles.delete(file.path);
        return;
      }

      // read file content
      const content = await this.app.vault.read(file);
      this.log('info', 'file-processing', 'File content read, proceeding to task extraction', { 
        filePath: file.path,
        contentLength: content.length
      }, correlationId);

      // call LLM
      const extraction = await this.extractTaskFromContent(content, file.path, correlationId);

      if (extraction && extraction.found) {
        this.log('info', 'file-processing', 'Tasks found, proceeding to task creation', { 
          filePath: file.path,
          tasksFound: 'tasks' in extraction ? extraction.tasks?.length : 1
        }, correlationId);
        // Handle both single task and multi-task results
        await this.handleTaskExtraction(extraction, file, correlationId);
      } else {
        this.log('info', 'file-processing', 'No tasks found in file', { 
          filePath: file.path
        }, correlationId);
      }

      // mark as processed if configured
      await this.markFileProcessed(file, correlationId);
      
      // Mark as completed
      if (this.processingQueue.has(file.path)) {
        this.processingQueue.get(file.path)!.status = 'completed';
      }

      this.log('info', 'file-processing', 'File processing completed successfully', { 
        filePath: file.path,
        processingTime: Date.now() - (this.processingQueue.get(file.path)?.startTime || Date.now())
      }, correlationId);

    } catch (err) {
      console.error('TaskExtractor error', err);
      new Notice('Task Extractor: error processing file — see console');
      
      this.log('error', 'error', 'File processing failed with error', { 
        filePath: file.path,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        processingTime: Date.now() - (this.processingQueue.get(file.path)?.startTime || Date.now())
      }, correlationId);
      
      // Mark as failed
      if (this.processingQueue.has(file.path)) {
        this.processingQueue.get(file.path)!.status = 'failed';
      }
    } finally {
      // Guaranteed cleanup - always executes regardless of errors or early returns
      this.cleanupFileProcessing(file.path);
    }
  }

  // Centralized cleanup method for atomic processing
  private cleanupFileProcessing(filePath: string) {
    const status = this.processingQueue.get(filePath);
    if (status?.timeout) {
      clearTimeout(status.timeout);
    }
    this.processingQueue.delete(filePath);
    this.processingFiles.delete(filePath);
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

  private async markFileProcessed(file: TFile, correlationId?: string) {
    if (!this.settings.processedFrontmatterKey) {
      this.log('info', 'file-processing', 'Skipping processed marker: no processed frontmatter key configured', { 
        filePath: file.path 
      }, correlationId);
      return;
    }
    
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
      
      this.log('info', 'file-processing', 'File marked as processed successfully', { 
        filePath: file.path,
        processedKey: this.settings.processedFrontmatterKey
      }, correlationId);
    } catch (e) {
      console.warn('Failed to mark file processed with official API:', e);
      this.log('warn', 'file-processing', 'Failed to mark file processed with official API, trying fallback', { 
        filePath: file.path,
        error: e instanceof Error ? e.message : String(e)
      }, correlationId);
      // Fallback to previous method if the official API fails
      await this.markFileProcessedFallback(file, correlationId);
    }
  }

  // Fallback method using the previous implementation
  private async markFileProcessedFallback(file: TFile, correlationId?: string) {
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
      this.log('info', 'file-processing', 'File marked as processed using fallback method', { 
        filePath: file.path,
        processedKey: this.settings.processedFrontmatterKey
      }, correlationId);
    } catch (e) {
      console.warn('Failed to mark file processed with fallback method:', e);
      this.log('error', 'file-processing', 'Failed to mark file processed with fallback method', { 
        filePath: file.path,
        error: e instanceof Error ? e.message : String(e)
      }, correlationId);
    }
  }

  // Shared method for constructing prompts
  private buildExtractionPrompt(sourcePath: string, content: string): { system: string, user: string } {
    // Use custom prompt if provided, otherwise use enhanced default
    const basePrompt = this.settings.customPrompt || 
      `You are a task extraction specialist. Extract actionable tasks from emails and meeting notes following these strict rules:

EXTRACTION RULES:
- Extract ONLY concrete, actionable tasks explicitly stated or clearly implied
- Use null for uncertain/missing information - DO NOT GUESS
- Extract tasks only for the specified person: ${this.settings.ownerName} (exact name)
- If no clear tasks exist, return {"found": false, "tasks": []}

PRIORITY GUIDELINES:
- high: explicit urgency/deadline mentioned
- medium: standard requests without time pressure  
- low: optional/background items

VALIDATION CONSTRAINTS:
- task_title: 6-100 characters, actionable phrasing
- task_details: max 300 characters, concrete description
- due_date: YYYY-MM-DD format only if explicitly mentioned
- source_excerpt: exact quote (max 150 chars) justifying extraction

Return valid JSON only. Be conservative - accuracy over completeness.`;
    
    // Generate field descriptions from frontmatter settings
    const fieldDescriptions = this.settings.frontmatterFields
      .filter(f => f.required || f.key === 'task_title' || f.key === 'task_details')
      .map(f => {
        if (f.key === 'task' || f.key === 'task_title') return '- task_title: short (6-100 words) actionable title';
        if (f.key === 'task_details') return '- task_details: 1-3 sentences describing what to do and any context';
        if (f.key === 'due') return '- due_date: ISO date YYYY-MM-DD if explicitly present in the text, otherwise null';
        if (f.key === 'priority') return `- priority: ${f.options?.join('|') || 'high|medium|low'} (choose best match)`;
        if (f.key === 'project') return '- project: project name if mentioned, otherwise null';
        if (f.key === 'client') return '- client: client name if mentioned, otherwise null';
        return `- ${f.key}: ${f.defaultValue || 'appropriate value based on context'}`;
      });
    
    const system = `${basePrompt}

When tasks are found, return JSON in this format:
{
  "found": true,
  "tasks": [
    {
      ${fieldDescriptions.join(',\n      ')},
      "source_excerpt": "exact quote from source (max 150 chars)",
      "confidence": "high|medium|low"
    }
  ],
  "confidence": "high|medium|low"
}

When no tasks found, return: {"found": false, "tasks": []}`;

    const user = `SOURCE_PATH: ${sourcePath}\n---BEGIN NOTE---\n${content}\n---END NOTE---`;

    return { system, user };
  }

  // New method for multi-task extraction
  async extractMultipleTasksFromContent(content: string, sourcePath: string, correlationId?: string): Promise<TaskExtractionResult> {
    const { system, user } = this.buildExtractionPrompt(sourcePath, content);

    this.log('info', 'llm-call', 'LLM prompt constructed for multi-task extraction', { 
      filePath: sourcePath,
      systemPromptLength: system.length,
      userPromptLength: user.length,
      contentLength: content.length
    }, correlationId);

    try {
      const raw = await this.llmProvider.callLLM(system, user);
      
      this.log('info', 'llm-call', 'LLM response received for multi-task extraction', { 
        filePath: sourcePath,
        responseLength: raw?.length || 0,
        responsePreview: raw?.substring(0, 200) || 'null'
      }, correlationId);

      const parsed = this.safeParseJSON(raw);
      
      if (!parsed) {
        this.log('warn', 'llm-call', 'Failed to parse LLM response as JSON for multi-task extraction', { 
          filePath: sourcePath,
          rawResponse: raw
        }, correlationId);
        return { found: false, tasks: [] };
      }

      this.log('info', 'llm-call', 'LLM response parsed successfully for multi-task extraction', { 
        filePath: sourcePath,
        parsedStructure: Object.keys(parsed),
        found: parsed.found || false,
        tasksCount: parsed.tasks?.length || 0
      }, correlationId);
      
      // If it's already in the new format, return it
      if ('tasks' in parsed && Array.isArray(parsed.tasks)) {
        return parsed as TaskExtractionResult;
      }
      
      // Convert legacy format to new format
      if ('found' in parsed && parsed.found) {
        return {
          found: true,
          tasks: [{
            task_title: parsed.task_title || 'Unspecified task',
            task_details: parsed.task_details || '',
            due_date: parsed.due_date || null,
            priority: parsed.priority || 'medium',
            project: parsed.project || null,
            client: parsed.client || null,
            source_excerpt: parsed.source_excerpt || '',
            confidence: parsed.confidence || 'medium'
          }]
        };
      }
      
      return { found: false, tasks: [] };
    } catch (e) {
      console.error('extractMultipleTasksFromContent error', e);
      this.log('error', 'llm-call', 'Multi-task extraction failed with error', { 
        filePath: sourcePath,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined
      }, correlationId);
      return { found: false, tasks: [] };
    }
  }

  // Handle task extraction results (both single and multi-task)
  private async handleTaskExtraction(extraction: TaskExtraction | TaskExtractionResult, sourceFile: TFile, correlationId?: string) {
    try {
      // Check if it's the new multi-task format
      if ('tasks' in extraction && Array.isArray(extraction.tasks)) {
        this.log('info', 'task-creation', 'Processing multi-task extraction result', { 
          filePath: sourceFile.path,
          tasksCount: extraction.tasks.length
        }, correlationId);

        let createdCount = 0;
        for (const task of extraction.tasks) {
          try {
            await this.createTaskNote(task, sourceFile, correlationId);
            createdCount++;
          } catch (error) {
            console.error(`Failed to create task note for: ${task.task_title}`, error);
            this.log('error', 'task-creation', 'Failed to create individual task note', { 
              filePath: sourceFile.path,
              taskTitle: task.task_title,
              error: error instanceof Error ? error.message : String(error)
            }, correlationId);
          }
        }
        
        this.log('info', 'task-creation', 'Multi-task creation completed', { 
          filePath: sourceFile.path,
          totalTasks: extraction.tasks.length,
          createdCount,
          failedCount: extraction.tasks.length - createdCount
        }, correlationId);
        
        if (createdCount > 0) {
          new Notice(`Task Extractor: created ${createdCount} task note${createdCount !== 1 ? 's' : ''}`);
        }
      } else {
        // Handle legacy single-task format
        this.log('info', 'task-creation', 'Processing single-task extraction result', { 
          filePath: sourceFile.path,
          taskTitle: (extraction as TaskExtraction).task_title
        }, correlationId);

        await this.createTaskNote(extraction as TaskExtraction, sourceFile, correlationId);
        new Notice(`Task Extractor: created task "${(extraction as TaskExtraction).task_title}"`);
      }
    } catch (error) {
      console.error('Error handling task extraction:', error);
      this.log('error', 'task-creation', 'Task extraction handling failed', { 
        filePath: sourceFile.path,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, correlationId);
      new Notice('Task Extractor: error creating task notes — see console');
    }
  }

  // Compose prompt, call LLM, and parse response (legacy method for backward compatibility)
  private async extractTaskFromContent(content: string, sourcePath: string, correlationId?: string): Promise<TaskExtraction> {
    const { system, user } = this.buildExtractionPrompt(sourcePath, content);

    this.log('info', 'llm-call', 'LLM prompt constructed for task extraction', { 
      filePath: sourcePath,
      systemPromptLength: system.length,
      userPromptLength: user.length,
      contentLength: content.length
    }, correlationId);

    try {
      const raw = await this.llmProvider.callLLM(system, user);
      
      this.log('info', 'llm-call', 'LLM response received for task extraction', { 
        filePath: sourcePath,
        responseLength: raw?.length || 0,
        responsePreview: raw?.substring(0, 200) || 'null'
      }, correlationId);

      const parsed = this.safeParseJSON(raw);
      if (!parsed) {
        this.log('warn', 'llm-call', 'Failed to parse LLM response as JSON', { 
          filePath: sourcePath,
          rawResponse: raw
        }, correlationId);
        return { found: false };
      }

      this.log('info', 'llm-call', 'LLM response parsed successfully', { 
        filePath: sourcePath,
        parsedStructure: Object.keys(parsed),
        found: parsed.found || false,
        tasksCount: parsed.tasks?.length || (parsed.found ? 1 : 0)
      }, correlationId);
      
      // Handle new multi-task format
      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        // Return first task for backward compatibility
        if (parsed.tasks.length > 0) {
          const firstTask = parsed.tasks[0];
          return {
            found: true,
            task_title: firstTask.task_title || 'Unspecified task',
            task_details: firstTask.task_details || '',
            due_date: firstTask.due_date || null,
            priority: firstTask.priority || 'medium',
            source_excerpt: firstTask.source_excerpt || '',
            ...firstTask // Include any additional extracted fields
          };
        } else {
          return { found: false };
        }
      }
      
      // Handle legacy single-task format
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
      this.log('error', 'llm-call', 'Task extraction failed with error', { 
        filePath: sourcePath,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined
      }, correlationId);
      return { found: false };
    }
  }

  private safeParseJSON(text: string | null): any {
    if (!text) return null;
    
    let parsed: any = null;
    
    // try direct parse
    try {
      parsed = JSON.parse(text);
    } catch {
      // extract first {...}
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try { 
          parsed = JSON.parse(m[0]); 
        } catch {
          // try to fix common issues: single quotes -> double
          const fixed = m[0].replace(/'/g, '"');
          try { 
            parsed = JSON.parse(fixed); 
          } catch {
            return null;
          }
        }
      } else {
        return null;
      }
    }
    
    if (!parsed || typeof parsed !== 'object') return null;
    
    // Validate and normalize the parsed result
    return this.validateAndNormalizeParsedResult(parsed);
  }
  
  private validateAndNormalizeParsedResult(data: any): TaskExtractionResult | TaskExtraction | null {
    if (typeof data !== 'object' || data === null) {
      this.log('warn', 'validation', 'Parsed data is not an object', { 
        dataType: typeof data,
        data: data
      });
      return null;
    }
    
    // Check for new multi-task format
    if (data.hasOwnProperty('tasks') && Array.isArray(data.tasks)) {
      const validTasks: ExtractedTask[] = [];
      
      for (const task of data.tasks) {
        if (this.isValidTask(task)) {
          validTasks.push({
            task_title: task.task_title || 'Unspecified task',
            task_details: task.task_details || '',
            due_date: task.due_date || null,
            priority: task.priority || 'medium',
            project: task.project || null,
            client: task.client || null,
            source_excerpt: task.source_excerpt || '',
            confidence: task.confidence || 'medium',
            ...task
          });
        } else {
          this.log('warn', 'validation', 'Invalid task found in multi-task result', { 
            task: task,
            taskTitle: task?.task_title
          });
        }
      }

      this.log('info', 'validation', 'Multi-task validation completed', { 
        totalTasks: data.tasks.length,
        validTasks: validTasks.length,
        invalidTasks: data.tasks.length - validTasks.length
      });
      
      return {
        found: data.found === true && validTasks.length > 0,
        tasks: validTasks,
        confidence: data.confidence || 'medium'
      };
    }
    
    // Handle legacy single-task format
    if (data.hasOwnProperty('found')) {
      this.log('info', 'validation', 'Processing legacy single-task format', { 
        found: data.found,
        taskTitle: data.task_title || data.title
      });
      
      return {
        found: data.found === true,
        task_title: data.task_title || data.title || '',
        task_details: data.task_details || data.details || '',
        due_date: data.due_date || null,
        priority: data.priority || 'medium',
        source_excerpt: data.source_excerpt || '',
        ...data
      };
    }
    
    this.log('warn', 'validation', 'Parsed data does not match expected format', { 
      dataKeys: Object.keys(data),
      hasFound: data.hasOwnProperty('found'),
      hasTasks: data.hasOwnProperty('tasks')
    });
    
    return null;
  }
  
  private isValidTask(task: any): boolean {
    if (typeof task !== 'object' || !task) return false;
    
    // Must have a task title
    if (!task.task_title || typeof task.task_title !== 'string' || task.task_title.trim().length === 0) {
      return false;
    }
    
    // Validate confidence if present
    if (task.confidence && !['high', 'medium', 'low'].includes(task.confidence)) {
      return false;
    }
    
    // Validate priority if present
    if (task.priority && !['high', 'medium', 'low'].includes(task.priority)) {
      return false;
    }
    
    // Validate due_date format if present
    if (task.due_date && typeof task.due_date === 'string') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(task.due_date)) {
        return false;
      }
    }
    
    return true;
  }

  // Create TaskNotes–compatible note in tasksFolder
  private async createTaskNote(extraction: TaskExtraction | ExtractedTask, sourceFile: TFile, correlationId?: string) {
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

    this.log('info', 'task-creation', 'Creating task note', { 
      sourceFile: sourceFile.path,
      taskTitle: extraction.task_title,
      taskPath: path,
      folder,
      filename: path.split('/').pop()
    }, correlationId);

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
      this.log('info', 'task-creation', 'Task note created successfully', { 
        sourceFile: sourceFile.path,
        taskTitle: extraction.task_title,
        taskPath: path,
        contentLength: final.length
      }, correlationId);
      new Notice(`Task Extractor: created task "${extraction.task_title}"`);
    } catch (e) {
      console.error('Failed to create task note', e);
      this.log('error', 'task-creation', 'Failed to create task note', { 
        sourceFile: sourceFile.path,
        taskTitle: extraction.task_title,
        taskPath: path,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined
      }, correlationId);
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
  private validateFrontmatterField(fieldName: string, correlationId?: string): string {
    // Check if empty or undefined
    if (!fieldName || typeof fieldName !== 'string' || fieldName.trim().length === 0) {
      console.warn('TaskExtractor: Empty frontmatter field name, falling back to "Type"');
      this.debugLogger?.logValidation(
        'frontmatter',
        'fieldName',
        fieldName,
        'non-empty string',
        'Empty frontmatter field name, using fallback "Type"',
        correlationId
      );
      return 'Type';
    }

    const trimmed = fieldName.trim();

    // YAML key validation: must start with letter or underscore, 
    // can contain letters, numbers, underscores, hyphens, and dots
    const yamlKeyPattern = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/;
    
    if (!yamlKeyPattern.test(trimmed)) {
      console.warn(`TaskExtractor: Invalid frontmatter field name "${trimmed}", falling back to "Type"`);
      this.debugLogger?.logValidation(
        'frontmatter',
        'fieldName',
        trimmed,
        'valid YAML key pattern (^[a-zA-Z_][a-zA-Z0-9_.-]*$)',
        'Invalid YAML key format, using fallback "Type"',
        correlationId
      );
      return 'Type';
    }

    // Additional checks for problematic patterns
    if (trimmed.includes('..') || trimmed.startsWith('.') || trimmed.endsWith('.')) {
      console.warn(`TaskExtractor: Problematic frontmatter field name "${trimmed}", falling back to "Type"`);
      this.debugLogger?.logValidation(
        'frontmatter',
        'fieldName',
        trimmed,
        'valid YAML key without problematic dot patterns',
        'Problematic dot pattern in field name, using fallback "Type"',
        correlationId
      );
      return 'Type';
    }

    // Log successful validation
    this.debugLogger?.logValidationSuccess('frontmatter', 'fieldName', correlationId);
    return trimmed;
  }

  // Enhanced cleanup method with processing queue management
  cleanup() {
    // Clear debounce timers
    this.fileChangeDebouncer.forEach(timeout => clearTimeout(timeout));
    this.fileChangeDebouncer.clear();
    
    // Clear processing queue timers
    this.processingQueue.forEach(status => {
      if (status.timeout) {
        clearTimeout(status.timeout);
      }
    });
    this.processingQueue.clear();
    
    // Clear processing files set
    this.processingFiles.clear();
  }

  // Methods for backward compatibility
  getProcessingFiles() { return this.processingFiles; }
}