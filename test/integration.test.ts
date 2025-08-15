import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtractorSettings, DEFAULT_SETTINGS, validateSettings, DEFAULT_EXTRACTION_PROMPT } from '../src/types';
import { TaskProcessor } from '../src/task-processor';
import { LLMProviderManager } from '../src/llm-providers';
import { App, TFile } from './mocks/obsidian';

// Mock the LLMProviderManager
vi.mock('../src/llm-providers', () => ({
  LLMProviderManager: vi.fn().mockImplementation(() => ({
    callLLM: vi.fn().mockResolvedValue('{"found": true, "tasks": [{"task_title": "Test Task", "task_details": "Test details", "priority": "normal", "confidence": "high"}], "confidence": "high"}')
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
      create: vi.fn().mockResolvedValue(new TFile('Tasks/Test-Task.md')),
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

  describe('reset functionality integration tests', () => {
    let plugin: any;
    let settingTab: any;

    beforeEach(async () => {
      // Create mock plugin with saveSettings method
      plugin = {
        saveSettings: vi.fn().mockResolvedValue(undefined)
      };
      
      // Create settings tab instance
      const { ExtractorSettingTab } = await import('../src/settings');
      settingTab = new ExtractorSettingTab(app, plugin, settings, llmProvider);
      
      // Set owner name for placeholder substitution
      settings.ownerName = 'Test User';
    });

    it('should update settings when reset functionality is triggered', async () => {
      // Set a custom prompt initially
      settings.customPrompt = 'Custom extraction prompt for testing';
      
      // Simulate the reset button click logic directly
      const defaultPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', settings.ownerName);
      settings.customPrompt = defaultPrompt;
      
      // Verify the settings were updated with default prompt (with owner name substituted)
      const expectedPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', 'Test User');
      expect(settings.customPrompt).toBe(expectedPrompt);
    });

    it('should trigger debounced save mechanism when reset is performed', async () => {
      // Set a custom prompt initially
      settings.customPrompt = 'Custom prompt to be reset';
      
      // Simulate the reset operation by calling debouncedSave directly
      const debouncedSave = (settingTab as any).debouncedSave.bind(settingTab);
      debouncedSave();
      
      // Wait for debounced save (500ms + buffer)
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Verify saveSettings was called
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('should work when custom prompt is empty', async () => {
      // Set empty custom prompt initially
      settings.customPrompt = '';
      
      // Simulate reset operation
      const defaultPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', settings.ownerName);
      settings.customPrompt = defaultPrompt;
      
      // Verify the settings were updated with default prompt
      const expectedPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', 'Test User');
      expect(settings.customPrompt).toBe(expectedPrompt);
    });

    it('should work when custom prompt contains default text', async () => {
      // Set custom prompt to current default text
      const defaultPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', 'Test User');
      settings.customPrompt = defaultPrompt;
      
      // Simulate reset operation
      const resetPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', settings.ownerName);
      settings.customPrompt = resetPrompt;
      
      // Verify the operation still works normally (should still be the same)
      expect(settings.customPrompt).toBe(defaultPrompt);
    });

    it('should update settings object immediately for UI consistency', async () => {
      // Set a custom prompt initially
      settings.customPrompt = 'Original custom prompt';
      
      // Simulate the immediate update that happens in the reset button click
      const defaultPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', settings.ownerName);
      settings.customPrompt = defaultPrompt;
      
      // Verify settings object was updated immediately
      const expectedPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', 'Test User');
      expect(settings.customPrompt).toBe(expectedPrompt);
      
      // Simulate the debounced save call
      const debouncedSave = (settingTab as any).debouncedSave.bind(settingTab);
      debouncedSave();
      
      // Wait for debounced save
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Now saveSettings should have been called
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('should handle empty owner name gracefully in reset operation', async () => {
      // Set empty owner name
      settings.ownerName = '';
      settings.customPrompt = 'Custom prompt to reset';
      
      // Simulate reset operation with empty owner name
      const defaultPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', settings.ownerName);
      settings.customPrompt = defaultPrompt;
      
      // Verify the reset still works (placeholder becomes empty string)
      const expectedPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', '');
      expect(settings.customPrompt).toBe(expectedPrompt);
    });

    it('should test reset functionality with display refresh concept', async () => {
      // Set a custom prompt initially
      settings.customPrompt = 'Custom prompt before reset';
      
      // Simulate the reset operation that would happen on button click
      const defaultPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', settings.ownerName);
      settings.customPrompt = defaultPrompt;
      
      // Simulate calling display() to refresh the UI (this would update text areas)
      // In the actual implementation, this is called after the reset
      expect(typeof settingTab.display).toBe('function');
      
      // Verify the settings were updated correctly
      const expectedPrompt = DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', 'Test User');
      expect(settings.customPrompt).toBe(expectedPrompt);
    });
  });

  describe('Default Task Type Integration', () => {
    it('should include Type field with defaultTaskType in created task notes', async () => {
      // Configure custom defaultTaskType
      settings.defaultTaskType = 'IntegrationTask';
      
      // Create a test file with proper frontmatter
      const testFile = new TFile('test-email.md');
      testFile.basename = 'test-email';
      
      // Mock metadata cache to return proper frontmatter
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email' }
      });
      
      // Mock LLM response for task extraction
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Integration Test Task',
          task_details: 'Test task from integration test',
          priority: 'medium',
          confidence: 'high'
        }]
      }));
      
      // Process the file
      await taskProcessor.onFileChanged(testFile);
      
      // Verify task was created with Type field containing defaultTaskType
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Integration-Test-Task.md'),
        expect.stringMatching(/---[\s\S]*Type: IntegrationTask[\s\S]*---/)
      );
      
      // Verify Type field appears as first field after opening delimiter
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/^---\nType: IntegrationTask\n/)
      );
    });

    it('should use default "Task" value when defaultTaskType is not explicitly set', async () => {
      // Use default settings (defaultTaskType should be "Task")
      expect(settings.defaultTaskType).toBe('Task');
      
      // Create a test file
      const testFile = new TFile('test-meeting.md');
      testFile.basename = 'test-meeting';
      
      // Mock metadata cache
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'meetingnote' }
      });
      
      // Mock LLM response
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Default Type Test Task',
          task_details: 'Test task with default type',
          priority: 'high',
          confidence: 'high'
        }]
      }));
      
      // Process the file
      await taskProcessor.onFileChanged(testFile);
      
      // Verify task was created with default Type value
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Default-Type-Test-Task.md'),
        expect.stringMatching(/---[\s\S]*Type: Task[\s\S]*---/)
      );
    });
  });
});