import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskProcessor } from '../src/task-processor';
import { ExtractorSettings, DEFAULT_SETTINGS, DEFAULT_EXTRACTION_PROMPT } from '../src/types';
import { LLMProviderManager } from '../src/llm-providers';
import { App, TFile } from 'obsidian';

// Mock the LLMProviderManager
vi.mock('../src/llm-providers', () => ({
  LLMProviderManager: vi.fn().mockImplementation(() => ({
    callLLM: vi.fn().mockResolvedValue('{"found": true, "task_title": "Test Task", "task_details": "Test details"}')
  }))
}));

describe('TaskProcessor - Frontmatter Field Configuration', () => {
  let app: App;
  let settings: ExtractorSettings;
  let llmProvider: LLMProviderManager;
  let taskProcessor: TaskProcessor;

  beforeEach(() => {
    // Create mock app
    app = new App();
    
    // Mock metadata cache
    app.metadataCache = {
      getFileCache: vi.fn()
    } as any;
    
    // Mock vault
    app.vault = {
      read: vi.fn().mockResolvedValue('Test content'),
      create: vi.fn().mockResolvedValue(undefined),
      getMarkdownFiles: vi.fn().mockReturnValue([]),
      getAbstractFileByPath: vi.fn().mockReturnValue(null)
    } as any;
    
    // Mock file manager
    app.fileManager = {
      processFrontMatter: vi.fn().mockImplementation((file, callback) => {
        const frontmatter = {};
        callback(frontmatter);
        return Promise.resolve();
      })
    } as any;

    settings = { ...DEFAULT_SETTINGS };
    llmProvider = new LLMProviderManager(settings);
    taskProcessor = new TaskProcessor(app, settings, llmProvider);
  });

  describe('configured frontmatter field usage', () => {
    it('should use configured frontmatter field instead of hardcoded "Type"', async () => {
      // Set custom frontmatter field
      settings.triggerFrontmatterField = 'Category';
      settings.triggerTypes = ['email'];
      settings.ownerName = 'Test User';
      
      const file = new TFile('test.md');
      
      // Mock frontmatter with custom field
      const mockCache = {
        frontmatter: {
          Category: 'email', // Using custom field instead of Type
          'taskExtractor.processed': false
        }
      };
      
      vi.mocked(app.metadataCache.getFileCache).mockReturnValue(mockCache);
      
      await taskProcessor.onFileChanged(file);
      
      // Verify LLM was called (meaning the file was processed)
      expect(llmProvider.callLLM).toHaveBeenCalled();
    });

    it('should not process files when custom field does not match', async () => {
      settings.triggerFrontmatterField = 'Category';
      settings.triggerTypes = ['email'];
      settings.ownerName = 'Test User';
      
      const file = new TFile('test.md');
      
      // Mock frontmatter with different field value
      const mockCache = {
        frontmatter: {
          Category: 'note', // Does not match trigger types
          'taskExtractor.processed': false
        }
      };
      
      vi.mocked(app.metadataCache.getFileCache).mockReturnValue(mockCache);
      
      await taskProcessor.onFileChanged(file);
      
      // Verify LLM was not called
      expect(llmProvider.callLLM).not.toHaveBeenCalled();
    });

    it('should fallback to "Type" field when configured field is invalid', async () => {
      settings.triggerFrontmatterField = ''; // Invalid empty field
      settings.triggerTypes = ['email'];
      settings.ownerName = 'Test User';
      
      const file = new TFile('test.md');
      
      // Mock frontmatter with Type field (fallback)
      const mockCache = {
        frontmatter: {
          Type: 'email', // Should use Type as fallback
          'taskExtractor.processed': false
        }
      };
      
      vi.mocked(app.metadataCache.getFileCache).mockReturnValue(mockCache);
      
      await taskProcessor.onFileChanged(file);
      
      // Verify LLM was called (meaning fallback worked)
      expect(llmProvider.callLLM).toHaveBeenCalled();
    });

    it('should handle case-insensitive comparison with custom field', async () => {
      settings.triggerFrontmatterField = 'NoteType';
      settings.triggerTypes = ['EMAIL']; // Uppercase in config
      settings.ownerName = 'Test User';
      
      const file = new TFile('test.md');
      
      // Mock frontmatter with lowercase value
      const mockCache = {
        frontmatter: {
          NoteType: 'email', // Lowercase in frontmatter
          'taskExtractor.processed': false
        }
      };
      
      vi.mocked(app.metadataCache.getFileCache).mockReturnValue(mockCache);
      
      await taskProcessor.onFileChanged(file);
      
      // Verify LLM was called (case-insensitive match worked)
      expect(llmProvider.callLLM).toHaveBeenCalled();
    });
  });

  describe('getUnprocessedFiles with custom frontmatter field', () => {
    it('should filter files using configured frontmatter field', () => {
      settings.triggerFrontmatterField = 'Category';
      settings.triggerTypes = ['email', 'meeting'];
      
      const files = [
        new TFile('email1.md'),
        new TFile('meeting1.md'),
        new TFile('note1.md')
      ];
      
      vi.mocked(app.vault.getMarkdownFiles).mockReturnValue(files);
      
      // Mock metadata cache for each file
      vi.mocked(app.metadataCache.getFileCache)
        .mockReturnValueOnce({
          frontmatter: { Category: 'email', 'taskExtractor.processed': false }
        })
        .mockReturnValueOnce({
          frontmatter: { Category: 'meeting', 'taskExtractor.processed': false }
        })
        .mockReturnValueOnce({
          frontmatter: { Category: 'personal', 'taskExtractor.processed': false }
        });
      
      // Access private method for testing
      const unprocessedFiles = (taskProcessor as any).getUnprocessedFiles();
      
      expect(unprocessedFiles).toHaveLength(2);
      expect(unprocessedFiles.map((f: TFile) => f.path)).toEqual(['email1.md', 'meeting1.md']);
    });
  });

  describe('frontmatter field validation', () => {
    it('should validate frontmatter field names', () => {
      // Access private method for testing
      const validateField = (taskProcessor as any).validateFrontmatterField.bind(taskProcessor);
      
      expect(validateField('ValidField')).toBe('ValidField');
      expect(validateField('valid_field')).toBe('valid_field');
      expect(validateField('valid-field')).toBe('valid-field');
      expect(validateField('valid.field')).toBe('valid.field');
      expect(validateField('')).toBe('Type');
      expect(validateField('123invalid')).toBe('Type');
      expect(validateField('field..name')).toBe('Type');
      expect(validateField('.field')).toBe('Type');
      expect(validateField('field.')).toBe('Type');
    });
  });

  describe('backward compatibility', () => {
    it('should work with existing configurations that do not specify frontmatter field', async () => {
      // Don't set triggerFrontmatterField, should default to "Type"
      settings.triggerTypes = ['email'];
      settings.ownerName = 'Test User';
      
      const file = new TFile('test.md');
      
      // Mock frontmatter with traditional Type field
      const mockCache = {
        frontmatter: {
          Type: 'email',
          'taskExtractor.processed': false
        }
      };
      
      vi.mocked(app.metadataCache.getFileCache).mockReturnValue(mockCache);
      
      await taskProcessor.onFileChanged(file);
      
      // Verify LLM was called (backward compatibility works)
      expect(llmProvider.callLLM).toHaveBeenCalled();
    });
  });
});

describe('TaskProcessor - Prompt Building Logic', () => {
  let app: App;
  let settings: ExtractorSettings;
  let llmProvider: LLMProviderManager;
  let taskProcessor: TaskProcessor;

  beforeEach(() => {
    // Create mock app
    app = new App();
    
    // Mock metadata cache
    app.metadataCache = {
      getFileCache: vi.fn()
    } as any;
    
    // Mock vault
    app.vault = {
      read: vi.fn().mockResolvedValue('Test content'),
      create: vi.fn().mockResolvedValue(undefined),
      getMarkdownFiles: vi.fn().mockReturnValue([]),
      getAbstractFileByPath: vi.fn().mockReturnValue(null)
    } as any;
    
    // Mock file manager
    app.fileManager = {
      processFrontMatter: vi.fn().mockImplementation((file, callback) => {
        const frontmatter = {};
        callback(frontmatter);
        return Promise.resolve();
      })
    } as any;

    settings = { ...DEFAULT_SETTINGS };
    llmProvider = new LLMProviderManager(settings);
    taskProcessor = new TaskProcessor(app, settings, llmProvider);
  });

  describe('buildExtractionPrompt method', () => {
    it('should use default prompt when customPrompt is empty', () => {
      // Set up settings with empty custom prompt
      settings.customPrompt = '';
      settings.ownerName = 'Test User';
      
      // Access private method for testing
      const buildPrompt = (taskProcessor as any).buildExtractionPrompt.bind(taskProcessor);
      const result = buildPrompt('test.md', 'Test content');
      
      // Should contain the default prompt with owner name substituted
      expect(result.system).toContain('task extraction specialist');
      expect(result.system).toContain('Test User');
      expect(result.system).not.toContain('{ownerName}');
      expect(result.user).toContain('SOURCE_PATH: test.md');
      expect(result.user).toContain('Test content');
    });

    it('should correctly substitute owner name placeholder in default prompt', () => {
      settings.customPrompt = '';
      settings.ownerName = 'John Doe';
      
      const buildPrompt = (taskProcessor as any).buildExtractionPrompt.bind(taskProcessor);
      const result = buildPrompt('meeting.md', 'Meeting notes');
      
      // Verify owner name is substituted correctly
      expect(result.system).toContain('John Doe');
      expect(result.system).not.toContain('{ownerName}');
      
      // Verify it contains the expected default prompt content
      expect(result.system).toContain('Extract tasks only for the specified person: John Doe');
    });

    it('should use custom prompt when provided', () => {
      const customPrompt = 'This is my custom extraction prompt for {ownerName}';
      settings.customPrompt = customPrompt;
      settings.ownerName = 'Custom User';
      
      const buildPrompt = (taskProcessor as any).buildExtractionPrompt.bind(taskProcessor);
      const result = buildPrompt('note.md', 'Note content');
      
      // Should use the custom prompt directly (no owner name substitution for custom prompts)
      expect(result.system).toContain('This is my custom extraction prompt for {ownerName}');
      expect(result.system).not.toContain('task extraction specialist');
      expect(result.user).toContain('SOURCE_PATH: note.md');
      expect(result.user).toContain('Note content');
    });

    it('should handle empty owner name gracefully', () => {
      settings.customPrompt = '';
      settings.ownerName = '';
      
      const buildPrompt = (taskProcessor as any).buildExtractionPrompt.bind(taskProcessor);
      const result = buildPrompt('test.md', 'Content');
      
      // Should still work with empty owner name
      expect(result.system).toContain('task extraction specialist');
      expect(result.system).toContain('Extract tasks only for the specified person:  (exact name)');
      expect(result.system).not.toContain('{ownerName}');
    });

    it('should handle whitespace-only owner name', () => {
      settings.customPrompt = '';
      settings.ownerName = '   ';
      
      const buildPrompt = (taskProcessor as any).buildExtractionPrompt.bind(taskProcessor);
      const result = buildPrompt('test.md', 'Content');
      
      // Should substitute whitespace owner name (note the extra spaces)
      expect(result.system).toContain('Extract tasks only for the specified person:     (exact name)');
      expect(result.system).not.toContain('{ownerName}');
    });

    it('should include frontmatter field descriptions in system prompt', () => {
      settings.customPrompt = '';
      settings.ownerName = 'Test User';
      
      const buildPrompt = (taskProcessor as any).buildExtractionPrompt.bind(taskProcessor);
      const result = buildPrompt('test.md', 'Content');
      
      // Should include field descriptions from frontmatter settings in the JSON format section
      expect(result.system).toContain('- task_title: short (6-100 words) actionable title');
      expect(result.system).toContain('- status: open');
      expect(result.system).toContain('- priority: low|normal|high (choose best match)');
      expect(result.system).toContain('"source_excerpt": "exact quote from source (max 150 chars)"');
      expect(result.system).toContain('When tasks are found, return JSON in this format:');
    });

    it('should format user prompt with source path and content', () => {
      settings.customPrompt = '';
      settings.ownerName = 'Test User';
      
      const buildPrompt = (taskProcessor as any).buildExtractionPrompt.bind(taskProcessor);
      const result = buildPrompt('path/to/file.md', 'This is the file content');
      
      // Verify user prompt format
      expect(result.user).toBe('SOURCE_PATH: path/to/file.md\n---BEGIN NOTE---\nThis is the file content\n---END NOTE---');
    });

    it('should handle special characters in owner name', () => {
      settings.customPrompt = '';
      settings.ownerName = 'José María O\'Connor-Smith';
      
      const buildPrompt = (taskProcessor as any).buildExtractionPrompt.bind(taskProcessor);
      const result = buildPrompt('test.md', 'Content');
      
      // Should handle special characters correctly
      expect(result.system).toContain('José María O\'Connor-Smith');
      expect(result.system).not.toContain('{ownerName}');
    });

    it('should preserve custom prompt exactly when provided', () => {
      const customPrompt = 'Custom prompt with {ownerName} and special chars: @#$%^&*()';
      settings.customPrompt = customPrompt;
      settings.ownerName = 'Test User';
      
      const buildPrompt = (taskProcessor as any).buildExtractionPrompt.bind(taskProcessor);
      const result = buildPrompt('test.md', 'Content');
      
      // Custom prompt should be used as-is, no substitution
      expect(result.system).toContain('Custom prompt with {ownerName} and special chars: @#$%^&*()');
    });
  });

  describe('Source Note Linking', () => {
    it('should always include source note link using filename without extension', async () => {
      const sourceFile = new TFile('path/to/source-note.md');
      sourceFile.basename = 'source-note'; // Mock the basename property
      
      const extraction = {
        task_title: 'Test Task',
        task_details: 'Test task details',
        source_excerpt: 'Test excerpt'
      };

      // Call the private createTaskNote method
      const createTaskNote = (taskProcessor as any).createTaskNote.bind(taskProcessor);
      await createTaskNote(extraction, sourceFile);

      // Verify task note was created with source link
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Test-Task.md'),
        expect.stringContaining('Source: [[source-note]]')
      );
    });

    it('should include both source link and full path when linkBack is enabled and paths differ', async () => {
      settings.linkBack = true;
      const sourceFile = new TFile('path/to/nested/source-note.md');
      sourceFile.basename = 'source-note'; // Mock the basename property
      
      const extraction = {
        task_title: 'Test Task',
        task_details: 'Test task details'
      };

      // Call the private createTaskNote method
      const createTaskNote = (taskProcessor as any).createTaskNote.bind(taskProcessor);
      await createTaskNote(extraction, sourceFile);

      // Verify task note was created with both source links
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Test-Task.md'),
        expect.stringMatching(/Source: \[\[source-note\]\][\s\S]*Source Path: \[\[path\/to\/nested\/source-note\.md\]\]/)
      );
    });

    it('should only include source link when linkBack is disabled', async () => {
      settings.linkBack = false;
      const sourceFile = new TFile('path/to/nested/source-note.md');
      sourceFile.basename = 'source-note'; // Mock the basename property
      
      const extraction = {
        task_title: 'Test Task',
        task_details: 'Test task details'
      };

      // Call the private createTaskNote method
      const createTaskNote = (taskProcessor as any).createTaskNote.bind(taskProcessor);
      await createTaskNote(extraction, sourceFile);

      // Verify task note was created with only the source link
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Test-Task.md'),
        expect.stringContaining('Source: [[source-note]]')
      );
      
      // Should not contain the full path link
      expect(app.vault.create).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Source Path:')
      );
    });

    it('should handle source files in root directory correctly', async () => {
      const sourceFile = new TFile('root-note.md');
      sourceFile.basename = 'root-note'; // Mock the basename property
      
      const extraction = {
        task_title: 'Test Task',
        task_details: 'Test task details'
      };

      // Call the private createTaskNote method
      const createTaskNote = (taskProcessor as any).createTaskNote.bind(taskProcessor);
      await createTaskNote(extraction, sourceFile);

      // Verify task note was created with source link
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Test-Task.md'),
        expect.stringContaining('Source: [[root-note]]')
      );
    });
  });

  describe('Default Task Type', () => {
    it('should add Type field with defaultTaskType value to task frontmatter', async () => {
      settings.defaultTaskType = 'CustomTask';
      const sourceFile = new TFile('test-note.md');
      sourceFile.basename = 'test-note';
      
      const extraction = {
        task_title: 'Test Task',
        task_details: 'Test task details'
      };

      // Call the private createTaskNote method
      const createTaskNote = (taskProcessor as any).createTaskNote.bind(taskProcessor);
      await createTaskNote(extraction, sourceFile);

      // Verify task note was created with Type field containing defaultTaskType value
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Test-Task.md'),
        expect.stringMatching(/---[\s\S]*Type: CustomTask[\s\S]*---/)
      );
    });

    it('should use default "Task" value when defaultTaskType is not configured', async () => {
      settings.defaultTaskType = 'Task'; // Default value
      const sourceFile = new TFile('test-note.md');
      sourceFile.basename = 'test-note';
      
      const extraction = {
        task_title: 'Test Task',
        task_details: 'Test task details'
      };

      // Call the private createTaskNote method
      const createTaskNote = (taskProcessor as any).createTaskNote.bind(taskProcessor);
      await createTaskNote(extraction, sourceFile);

      // Verify task note was created with default Type field value
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Test-Task.md'),
        expect.stringMatching(/---[\s\S]*Type: Task[\s\S]*---/)
      );
    });

    it('should add Type field as first frontmatter field after opening delimiter', async () => {
      settings.defaultTaskType = 'MyTask';
      const sourceFile = new TFile('test-note.md');
      sourceFile.basename = 'test-note';
      
      const extraction = {
        task_title: 'Test Task',
        task_details: 'Test task details'
      };

      // Call the private createTaskNote method
      const createTaskNote = (taskProcessor as any).createTaskNote.bind(taskProcessor);
      await createTaskNote(extraction, sourceFile);

      // Verify Type field appears immediately after opening frontmatter delimiter
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Test-Task.md'),
        expect.stringMatching(/^---\nType: MyTask\n/)
      );
    });
  });
});