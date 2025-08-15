import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_FRONTMATTER_FIELDS, DEFAULT_SETTINGS, ExtractorSettings, validateSettings, FrontmatterField } from '../src/types';
import { TaskProcessor } from '../src/task-processor';
import { LLMProviderManager } from '../src/llm-providers';
import { App, TFile } from './mocks/obsidian';

// Mock the LLMProviderManager
vi.mock('../src/llm-providers', () => ({
  LLMProviderManager: vi.fn().mockImplementation(() => ({
    callLLM: vi.fn().mockResolvedValue('{"found": true, "task_title": "Legacy Task", "task_details": "Legacy task details", "priority": "medium", "confidence": "high"}')
  }))
}));

describe('TaskNotes Backward Compatibility Tests', () => {
  let app: App;
  let settings: ExtractorSettings;
  let llmProvider: LLMProviderManager;
  let taskProcessor: TaskProcessor;

  beforeEach(() => {
    // Create mock app
    app = new App();
    
    // Mock vault
    app.vault = {
      read: vi.fn().mockResolvedValue('Test content'),
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

  describe('Legacy Frontmatter Field Preservation', () => {
    it('should preserve existing custom frontmatter fields exactly', () => {
      const legacyFields: FrontmatterField[] = [
        { key: 'task', defaultValue: '', type: 'text', required: true },
        { key: 'status', defaultValue: 'inbox', type: 'select', options: ['inbox', 'next', 'waiting', 'done'], required: true },
        { key: 'priority', defaultValue: 'medium', type: 'select', options: ['low', 'medium', 'high', 'urgent'], required: true },
        { key: 'due_date', defaultValue: '', type: 'date', required: false },
        { key: 'project', defaultValue: '', type: 'text', required: false },
        { key: 'client', defaultValue: '', type: 'text', required: false }
      ];

      const customSettings: Partial<ExtractorSettings> = {
        frontmatterFields: legacyFields
      };

      const validated = validateSettings(customSettings);

      // Should preserve legacy fields exactly as they were
      expect(validated.frontmatterFields).toEqual(legacyFields);
      expect(validated.frontmatterFields.length).toBe(6);
      
      // Verify specific legacy field characteristics
      const taskField = validated.frontmatterFields.find(f => f.key === 'task');
      expect(taskField).toBeDefined();
      expect(taskField?.key).toBe('task'); // Not 'title'
      
      const statusField = validated.frontmatterFields.find(f => f.key === 'status');
      expect(statusField?.defaultValue).toBe('inbox'); // Not 'open'
      expect(statusField?.options).toContain('inbox');
      expect(statusField?.options).toContain('waiting');
      
      const priorityField = validated.frontmatterFields.find(f => f.key === 'priority');
      expect(priorityField?.defaultValue).toBe('medium'); // Not 'normal'
      expect(priorityField?.options).toContain('urgent');
      expect(priorityField?.options).toContain('medium');
    });

    it('should not override existing custom fields with TaskNotes defaults', () => {
      const existingSettings: Partial<ExtractorSettings> = {
        provider: 'openai',
        apiKey: 'sk-existing123',
        model: 'gpt-4',
        ownerName: 'Existing User',
        tasksFolder: 'MyTasks',
        frontmatterFields: [
          { key: 'task', defaultValue: '', type: 'text', required: true },
          { key: 'status', defaultValue: 'todo', type: 'select', options: ['todo', 'doing', 'done'], required: true },
          { key: 'priority', defaultValue: 'normal', type: 'select', options: ['low', 'normal', 'high'], required: true }
        ]
      };

      const validated = validateSettings(existingSettings);

      // Should preserve all existing settings
      expect(validated.provider).toBe('openai');
      expect(validated.apiKey).toBe('sk-existing123');
      expect(validated.model).toBe('gpt-4');
      expect(validated.ownerName).toBe('Existing User');
      expect(validated.tasksFolder).toBe('MyTasks');
      
      // Should preserve custom frontmatter fields
      expect(validated.frontmatterFields).toEqual(existingSettings.frontmatterFields);
      expect(validated.frontmatterFields[0].key).toBe('task');
      expect(validated.frontmatterFields[1].defaultValue).toBe('todo');
      expect(validated.frontmatterFields[1].options).toEqual(['todo', 'doing', 'done']);
    });

    it('should work with mixed legacy and new field configurations', () => {
      const mixedFields: FrontmatterField[] = [
        { key: 'task', defaultValue: '', type: 'text', required: true }, // Legacy
        { key: 'status', defaultValue: 'open', type: 'select', options: ['open', 'in-progress', 'done'], required: true }, // TaskNotes
        { key: 'priority', defaultValue: 'medium', type: 'select', options: ['low', 'medium', 'high', 'urgent'], required: true }, // Legacy
        { key: 'contexts', defaultValue: '', type: 'text', required: false }, // TaskNotes
        { key: 'project', defaultValue: '', type: 'text', required: false } // Legacy
      ];

      const mixedSettings: Partial<ExtractorSettings> = {
        frontmatterFields: mixedFields
      };

      const validated = validateSettings(mixedSettings);

      // Should preserve mixed configuration exactly
      expect(validated.frontmatterFields).toEqual(mixedFields);
      expect(validated.frontmatterFields.find(f => f.key === 'task')).toBeDefined();
      expect(validated.frontmatterFields.find(f => f.key === 'contexts')).toBeDefined();
      expect(validated.frontmatterFields.find(f => f.key === 'project')).toBeDefined();
    });
  });

  describe('Legacy Task Processing', () => {
    it('should process tasks with legacy field configuration', async () => {
      // Configure with legacy fields
      settings.frontmatterFields = [
        { key: 'task', defaultValue: '', type: 'text', required: true },
        { key: 'status', defaultValue: 'inbox', type: 'select', options: ['inbox', 'next', 'waiting', 'done'], required: true },
        { key: 'priority', defaultValue: 'medium', type: 'select', options: ['low', 'medium', 'high', 'urgent'], required: true },
        { key: 'due_date', defaultValue: '', type: 'date', required: false },
        { key: 'project', defaultValue: '', type: 'text', required: false }
      ];

      // Mock LLM response in legacy format
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        task_title: 'Legacy Format Task',
        task_details: 'Task using legacy field names',
        priority: 'urgent',
        project: 'legacy-project',
        confidence: 'high'
      }));

      const file = new TFile('legacy-test.md');
      file.basename = 'legacy-test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Should create task successfully with legacy format
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Legacy-Format-Task.md'),
        expect.stringContaining('Legacy Format Task')
      );

      // Verify legacy field names are used in created task
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/task: Legacy Format Task/); // Not 'title'
      expect(createdContent).toMatch(/status: inbox/); // Legacy default
      expect(createdContent).toMatch(/priority: high/); // urgent maps to high for TaskNotes compatibility
      expect(createdContent).toMatch(/project: legacy-project/); // Not 'projects'
    });

    it('should work with existing trigger types and frontmatter field configurations', async () => {
      // Configure with existing user settings
      settings.triggerTypes = ['email', 'meeting note', 'call notes', 'standup'];
      settings.triggerFrontmatterField = 'NoteType'; // Custom field name
      
      const file = new TFile('standup-notes.md');
      file.basename = 'standup-notes';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { NoteType: 'standup', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Should process file with existing configuration
      expect(llmProvider.callLLM).toHaveBeenCalled();
      expect(app.vault.create).toHaveBeenCalled();
    });

    it('should preserve existing custom prompt configurations', async () => {
      const customPrompt = `Extract action items for {ownerName} from this content.
Focus on:
- Specific tasks assigned to {ownerName}
- Deadlines and due dates
- Project context

Return JSON with: task_title, task_details, priority, due_date, project`;

      settings.customPrompt = customPrompt;
      
      const file = new TFile('custom-prompt-test.md');
      file.basename = 'custom-prompt-test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify custom prompt was used
      const llmCall = (llmProvider.callLLM as any).mock.calls[0];
      expect(llmCall[0]).toContain('Extract action items for');
      expect(llmCall[0]).toContain('Focus on:');
      expect(llmCall[0]).toContain('Specific tasks assigned to');
      expect(llmCall[0]).not.toContain('task extraction specialist'); // TaskNotes default prompt
    });

    it('should handle legacy single-task extraction format', async () => {
      // Mock legacy single-task response format
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        task_title: 'Single Legacy Task',
        task_details: 'Legacy single task format',
        priority: 'high',
        due_date: '2024-12-31',
        project: 'legacy-project',
        confidence: 'high'
      }));

      const file = new TFile('single-task-legacy.md');
      file.basename = 'single-task-legacy';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Should handle legacy format correctly
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Single-Legacy-Task.md'),
        expect.stringContaining('Single Legacy Task')
      );
    });
  });

  describe('Settings Migration and Validation', () => {
    it('should handle missing TaskNotes fields gracefully', () => {
      const incompleteSettings: Partial<ExtractorSettings> = {
        provider: 'openai',
        apiKey: 'sk-test123',
        // Missing frontmatterFields - should use defaults
      };

      const validated = validateSettings(incompleteSettings);

      // Should use TaskNotes defaults when fields are missing
      expect(validated.frontmatterFields).toEqual(DEFAULT_FRONTMATTER_FIELDS);
      expect(validated.provider).toBe('openai');
      expect(validated.apiKey).toBe('sk-test123');
    });

    it('should validate corrupted settings and provide safe defaults', () => {
      const corruptedSettings: Partial<ExtractorSettings> = {
        frontmatterFields: null as any, // Corrupted
        triggerTypes: 'invalid' as any, // Wrong type
        maxTokens: 'not-a-number' as any, // Wrong type
        temperature: -5, // Out of bounds
      };

      const validated = validateSettings(corruptedSettings);

      // Should provide safe defaults for corrupted values
      expect(validated.frontmatterFields).toEqual(DEFAULT_FRONTMATTER_FIELDS);
      expect(validated.triggerTypes).toEqual(DEFAULT_SETTINGS.triggerTypes);
      expect(validated.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
      expect(validated.temperature).toBe(0); // Clamped to valid range
    });

    it('should preserve valid legacy settings during validation', () => {
      const legacyValidSettings: Partial<ExtractorSettings> = {
        provider: 'anthropic',
        apiKey: 'sk-ant-legacy123',
        model: 'claude-3-sonnet-20240229',
        ownerName: 'Legacy User',
        tasksFolder: 'ActionItems',
        triggerTypes: ['email', 'meeting note'],
        triggerFrontmatterField: 'DocumentType',
        processOnUpdate: true,
        linkBack: false,
        maxTokens: 1500,
        temperature: 0.3,
        frontmatterFields: [
          { key: 'action', defaultValue: '', type: 'text', required: true },
          { key: 'state', defaultValue: 'new', type: 'select', options: ['new', 'active', 'complete'], required: true }
        ]
      };

      const validated = validateSettings(legacyValidSettings);

      // Should preserve all valid legacy settings
      expect(validated.provider).toBe('anthropic');
      expect(validated.apiKey).toBe('sk-ant-legacy123');
      expect(validated.model).toBe('claude-3-sonnet-20240229');
      expect(validated.ownerName).toBe('Legacy User');
      expect(validated.tasksFolder).toBe('ActionItems');
      expect(validated.triggerTypes).toEqual(['email', 'meeting note']);
      expect(validated.triggerFrontmatterField).toBe('DocumentType');
      expect(validated.processOnUpdate).toBe(true);
      expect(validated.linkBack).toBe(false);
      expect(validated.maxTokens).toBe(1500);
      expect(validated.temperature).toBe(0.3);
      expect(validated.frontmatterFields).toEqual(legacyValidSettings.frontmatterFields);
    });
  });

  describe('Default Behavior for New Installations', () => {
    it('should use TaskNotes defaults for fresh installations', () => {
      const freshSettings: Partial<ExtractorSettings> = {};

      const validated = validateSettings(freshSettings);

      // Should use TaskNotes-compatible defaults
      expect(validated.frontmatterFields).toEqual(DEFAULT_FRONTMATTER_FIELDS);
      
      // Verify TaskNotes field characteristics
      const titleField = validated.frontmatterFields.find(f => f.key === 'title');
      expect(titleField).toBeDefined();
      
      const statusField = validated.frontmatterFields.find(f => f.key === 'status');
      expect(statusField?.defaultValue).toBe('open');
      expect(statusField?.options).toEqual(['open', 'in-progress', 'done']);
      
      const priorityField = validated.frontmatterFields.find(f => f.key === 'priority');
      expect(priorityField?.defaultValue).toBe('normal');
      expect(priorityField?.options).toEqual(['low', 'normal', 'high']);
    });

    it('should create TaskNotes-compatible tasks for new users', async () => {
      // Use default settings (TaskNotes-compatible)
      const file = new TFile('new-user-test.md');
      file.basename = 'new-user-test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      // Mock TaskNotes-compatible LLM response
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'New User Task',
          task_details: 'Task for new user with TaskNotes defaults',
          priority: 'normal',
          contexts: ['work'],
          projects: ['onboarding'],
          confidence: 'high'
        }]
      }));

      await taskProcessor.onFileChanged(file);

      // Should create TaskNotes-compatible task
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/New-User-Task.md'),
        expect.stringMatching(/title: New User Task/)
      );

      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/status: open/);
      expect(createdContent).toMatch(/priority: normal/);
      expect(createdContent).toMatch(/contexts: \[work\]/);
      expect(createdContent).toMatch(/projects: \[onboarding\]/);
      expect(createdContent).toMatch(/archived: false/);
    });
  });

  describe('Upgrade Path Validation', () => {
    it('should handle upgrade from pre-TaskNotes version smoothly', async () => {
      // Simulate settings from before TaskNotes compatibility
      const preTaskNotesSettings: Partial<ExtractorSettings> = {
        provider: 'openai',
        apiKey: 'sk-old123',
        model: 'gpt-3.5-turbo',
        ownerName: 'Upgrade User',
        tasksFolder: 'Tasks',
        triggerTypes: ['email', 'meetingnote'],
        // No frontmatterFields specified - would use old defaults
      };

      const validated = validateSettings(preTaskNotesSettings);

      // Should preserve user settings and add TaskNotes defaults
      expect(validated.provider).toBe('openai');
      expect(validated.apiKey).toBe('sk-old123');
      expect(validated.model).toBe('gpt-3.5-turbo');
      expect(validated.ownerName).toBe('Upgrade User');
      expect(validated.triggerTypes).toEqual(['email', 'meetingnote']);
      
      // Should use TaskNotes defaults for frontmatter fields
      expect(validated.frontmatterFields).toEqual(DEFAULT_FRONTMATTER_FIELDS);
    });

    it('should maintain functionality during upgrade process', async () => {
      // Test that upgraded settings still work for task processing
      settings.provider = 'openai';
      settings.ownerName = 'Upgraded User';
      settings.triggerTypes = ['email', 'meeting note'];
      // frontmatterFields will be TaskNotes defaults

      const file = new TFile('upgrade-test.md');
      file.basename = 'upgrade-test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Should process successfully with upgraded settings
      expect(llmProvider.callLLM).toHaveBeenCalled();
      expect(app.vault.create).toHaveBeenCalled();
    });
  });
});