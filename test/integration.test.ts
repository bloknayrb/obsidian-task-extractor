import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtractorSettings, DEFAULT_SETTINGS, validateSettings } from '../src/types';
import { TaskProcessor } from '../src/task-processor';
import { LLMProviderManager } from '../src/llm-providers';
import { App, TFile } from 'obsidian';

// Mock the LLMProviderManager
vi.mock('../src/llm-providers', () => ({
  LLMProviderManager: vi.fn().mockImplementation(() => ({
    callLLM: vi.fn().mockResolvedValue('{"found": true, "task_title": "Test Task", "task_details": "Test details"}')
  }))
}));

describe('Integration Tests - Complete Workflow', () => {
  let app: App;
  let settings: ExtractorSettings;
  let llmProvider: LLMProviderManager;
  let taskProcessor: TaskProcessor;

  beforeEach(async () => {
    // Create mock app
    app = new App();
    
    // Mock vault
    app.vault = {
      read: vi.fn().mockResolvedValue('Test email content'),
      create: vi.fn().mockResolvedValue(undefined),
      getMarkdownFiles: vi.fn().mockReturnValue([]),
      getAbstractFileByPath: vi.fn().mockReturnValue(null)
    } as any;
    
    // Mock metadata cache
    app.metadataCache = {
      getFileCache: vi.fn()
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

  describe('end-to-end processing with custom frontmatter field', () => {
    it('should process file with custom frontmatter field configuration', async () => {
      // Configure custom frontmatter field
      settings.triggerFrontmatterField = 'Category';
      settings.triggerTypes = ['email'];
      settings.ownerName = 'Test User';
      
      const file = new TFile('test-email.md');
      
      // Mock frontmatter with custom field
      const mockCache = {
        frontmatter: {
          Category: 'email', // Using custom field
          'taskExtractor.processed': false
        }
      };
      
      vi.mocked(app.metadataCache.getFileCache).mockReturnValue(mockCache);
      
      await taskProcessor.onFileChanged(file);
      
      // Verify LLM was called
      expect(llmProvider.callLLM).toHaveBeenCalled();
      
      // Verify task note was created
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Test-Task.md'),
        expect.stringContaining('Test Task')
      );
    });

    it('should not process file when custom field does not match trigger types', async () => {
      settings.triggerFrontmatterField = 'Category';
      settings.triggerTypes = ['email'];
      settings.ownerName = 'Test User';
      
      const file = new TFile('test-note.md');
      
      // Mock frontmatter with non-matching field value
      const mockCache = {
        frontmatter: {
          Category: 'personal', // Does not match 'email'
          'taskExtractor.processed': false
        }
      };
      
      vi.mocked(app.metadataCache.getFileCache).mockReturnValue(mockCache);
      
      await taskProcessor.onFileChanged(file);
      
      // Verify LLM was not called
      expect(llmProvider.callLLM).not.toHaveBeenCalled();
      
      // Verify no task note was created
      expect(app.vault.create).not.toHaveBeenCalled();
    });
  });

  describe('settings persistence and loading', () => {
    it('should validate settings correctly', () => {
      const rawSettings = {
        triggerFrontmatterField: 'NoteType',
        maxTokens: 1500
      };
      
      const validated = validateSettings(rawSettings);
      
      expect(validated.triggerFrontmatterField).toBe('NoteType');
      expect(validated.maxTokens).toBe(1500);
    });

    it('should load settings with validation', () => {
      // Mock loaded data with invalid frontmatter field
      const rawSettings = {
        triggerFrontmatterField: '123invalid', // Invalid field name
        maxTokens: 5000 // Out of bounds value
      };
      
      const validated = validateSettings(rawSettings);
      
      // Verify settings were validated and corrected
      expect(validated.triggerFrontmatterField).toBe('Type'); // Should fallback
      expect(validated.maxTokens).toBe(2000); // Should be clamped
    });
  });

  describe('backward compatibility', () => {
    it('should work with existing configurations without custom frontmatter field', async () => {
      // Simulate existing configuration without triggerFrontmatterField
      const rawSettings = {
        provider: 'openai' as const,
        apiKey: 'sk-test',
        triggerTypes: ['email', 'meeting note']
        // No triggerFrontmatterField specified
      };
      
      const validated = validateSettings(rawSettings);
      
      // Should default to "Type" for backward compatibility
      expect(validated.triggerFrontmatterField).toBe('Type');
      
      // Test processing with default field
      settings.triggerFrontmatterField = validated.triggerFrontmatterField;
      settings.triggerTypes = validated.triggerTypes;
      settings.ownerName = 'Test User';
      
      const file = new TFile('test.md');
      const mockCache = {
        frontmatter: {
          Type: 'email', // Using default field
          'taskExtractor.processed': false
        }
      };
      
      vi.mocked(app.metadataCache.getFileCache).mockReturnValue(mockCache);
      
      await taskProcessor.onFileChanged(file);
      
      // Should process successfully
      expect(llmProvider.callLLM).toHaveBeenCalled();
    });
  });

  describe('error handling and validation', () => {
    it('should handle corrupted settings gracefully', () => {
      const corruptedSettings = {
        triggerTypes: null, // Invalid trigger types
        triggerFrontmatterField: '', // Empty field
        maxTokens: 'invalid' as any // Invalid type
      };
      
      const validated = validateSettings(corruptedSettings);
      
      // Should use defaults for invalid values
      expect(validated.triggerTypes).toEqual(DEFAULT_SETTINGS.triggerTypes);
      expect(validated.triggerFrontmatterField).toBe('Type');
      expect(validated.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
    });

    it('should handle missing owner name gracefully', async () => {
      settings.ownerName = ''; // Empty owner name
      settings.triggerFrontmatterField = 'Category';
      settings.triggerTypes = ['email'];
      
      const file = new TFile('test.md');
      const mockCache = {
        frontmatter: {
          Category: 'email',
          'taskExtractor.processed': false
        }
      };
      
      vi.mocked(app.metadataCache.getFileCache).mockReturnValue(mockCache);
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await taskProcessor.onFileChanged(file);
      
      // Should log warning and not process
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Owner name not configured')
      );
      expect(llmProvider.callLLM).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});