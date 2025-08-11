import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskProcessor } from '../src/task-processor';
import { ExtractorSettings, DEFAULT_SETTINGS } from '../src/types';
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