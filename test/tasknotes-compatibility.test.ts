import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_FRONTMATTER_FIELDS, DEFAULT_EXTRACTION_PROMPT, ExtractorSettings, DEFAULT_SETTINGS, validateSettings } from '../src/types';
import { TaskProcessor } from '../src/task-processor';
import { LLMProviderManager } from '../src/llm-providers';
import { App, TFile } from './mocks/obsidian';

// Mock the LLMProviderManager
vi.mock('../src/llm-providers', () => ({
  LLMProviderManager: vi.fn().mockImplementation(() => ({
    callLLM: vi.fn().mockResolvedValue('{"found": true, "tasks": [{"task_title": "Test Task", "task_details": "Test details", "priority": "normal", "contexts": ["work"], "projects": ["test-project"], "confidence": "high"}], "confidence": "high"}')
  }))
}));

describe('TaskNotes Compatibility Tests', () => {
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

  describe('Unit Tests - Default TaskNotes Fields', () => {
    it('should have TaskNotes-compatible default frontmatter fields', () => {
      const fields = DEFAULT_FRONTMATTER_FIELDS;
      
      // Check required TaskNotes fields exist
      const fieldKeys = fields.map(f => f.key);
      expect(fieldKeys).toContain('title');
      expect(fieldKeys).toContain('status');
      expect(fieldKeys).toContain('priority');
      expect(fieldKeys).toContain('due');
      expect(fieldKeys).toContain('scheduled');
      expect(fieldKeys).toContain('contexts');
      expect(fieldKeys).toContain('projects');
      expect(fieldKeys).toContain('tags');
      expect(fieldKeys).toContain('archived');
      expect(fieldKeys).toContain('dateCreated');
      expect(fieldKeys).toContain('dateModified');
    });

    it('should use "title" instead of "task" for task name field', () => {
      const titleField = DEFAULT_FRONTMATTER_FIELDS.find(f => f.key === 'title');
      expect(titleField).toBeDefined();
      expect(titleField?.type).toBe('text');
      expect(titleField?.required).toBe(true);
      
      // Should not have old "task" field
      const taskField = DEFAULT_FRONTMATTER_FIELDS.find(f => f.key === 'task');
      expect(taskField).toBeUndefined();
    });

    it('should have TaskNotes-compatible status values', () => {
      const statusField = DEFAULT_FRONTMATTER_FIELDS.find(f => f.key === 'status');
      expect(statusField).toBeDefined();
      expect(statusField?.defaultValue).toBe('open');
      expect(statusField?.options).toEqual(['open', 'in-progress', 'done']);
      expect(statusField?.type).toBe('select');
      expect(statusField?.required).toBe(true);
    });

    it('should have TaskNotes-compatible priority values', () => {
      const priorityField = DEFAULT_FRONTMATTER_FIELDS.find(f => f.key === 'priority');
      expect(priorityField).toBeDefined();
      expect(priorityField?.defaultValue).toBe('normal');
      expect(priorityField?.options).toEqual(['low', 'normal', 'high']);
      expect(priorityField?.type).toBe('select');
      expect(priorityField?.required).toBe(true);
    });

    it('should have TaskNotes-specific fields with correct types', () => {
      const contextsField = DEFAULT_FRONTMATTER_FIELDS.find(f => f.key === 'contexts');
      expect(contextsField).toBeDefined();
      expect(contextsField?.type).toBe('text');
      expect(contextsField?.required).toBe(false);

      const projectsField = DEFAULT_FRONTMATTER_FIELDS.find(f => f.key === 'projects');
      expect(projectsField).toBeDefined();
      expect(projectsField?.type).toBe('text');
      expect(projectsField?.required).toBe(false);

      const scheduledField = DEFAULT_FRONTMATTER_FIELDS.find(f => f.key === 'scheduled');
      expect(scheduledField).toBeDefined();
      expect(scheduledField?.type).toBe('date');
      expect(scheduledField?.required).toBe(false);

      const archivedField = DEFAULT_FRONTMATTER_FIELDS.find(f => f.key === 'archived');
      expect(archivedField).toBeDefined();
      expect(archivedField?.type).toBe('boolean');
      expect(archivedField?.defaultValue).toBe('false');
      expect(archivedField?.required).toBe(false);
    });

    it('should have date fields with TaskNotes format', () => {
      const dateCreatedField = DEFAULT_FRONTMATTER_FIELDS.find(f => f.key === 'dateCreated');
      expect(dateCreatedField).toBeDefined();
      expect(dateCreatedField?.type).toBe('date');
      expect(dateCreatedField?.defaultValue).toBe('{{date}}');
      expect(dateCreatedField?.required).toBe(true);

      const dateModifiedField = DEFAULT_FRONTMATTER_FIELDS.find(f => f.key === 'dateModified');
      expect(dateModifiedField).toBeDefined();
      expect(dateModifiedField?.type).toBe('date');
      expect(dateModifiedField?.defaultValue).toBe('{{date}}');
      expect(dateModifiedField?.required).toBe(true);
    });
  });

  describe('Unit Tests - TaskNotes LLM Prompt', () => {
    it('should include TaskNotes-specific field extraction instructions', () => {
      const prompt = DEFAULT_EXTRACTION_PROMPT;
      
      // Should instruct LLM to extract TaskNotes fields
      expect(prompt).toContain('projects');
      expect(prompt).toContain('contexts');
      expect(prompt).toContain('scheduled_date');
      expect(prompt).toContain('priority');
    });

    it('should specify TaskNotes-compatible priority values in prompt', () => {
      const prompt = DEFAULT_EXTRACTION_PROMPT;
      
      // Should specify TaskNotes priority values in output format
      expect(prompt).toContain('high|normal|low');
      // Note: The prompt may contain "urgent" in context descriptions but should use TaskNotes values in output
      expect(prompt).toContain('"priority": "high|normal|low"');
    });

    it('should instruct LLM to return arrays for contexts and projects', () => {
      const prompt = DEFAULT_EXTRACTION_PROMPT;
      
      // Should specify array format for contexts and projects
      expect(prompt).toContain('Array of contexts');
      expect(prompt).toContain('Array of project names');
      expect(prompt).toContain('otherwise empty array');
    });

    it('should include scheduled_date separate from due_date', () => {
      const prompt = DEFAULT_EXTRACTION_PROMPT;
      
      // Should distinguish between due and scheduled dates
      expect(prompt).toContain('scheduled_date');
      expect(prompt).toContain('due_date');
      expect(prompt).toContain('when task should be worked on');
    });
  });

  describe('Unit Tests - Value Mapping', () => {
    it('should map medium priority to normal', async () => {
      // Mock LLM response with medium priority
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Test Task',
          task_details: 'Test details',
          priority: 'medium', // Old value
          confidence: 'high'
        }]
      }));

      const file = new TFile('test.md');
      file.basename = 'test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify task was created with mapped priority
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Test-Task.md'),
        expect.stringMatching(/priority: normal/)
      );
    });

    it('should map urgent priority to high', async () => {
      // Mock LLM response with urgent priority
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Urgent Task',
          task_details: 'Urgent task details',
          priority: 'urgent', // Old value
          confidence: 'high'
        }]
      }));

      const file = new TFile('test.md');
      file.basename = 'test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify task was created with mapped priority
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Urgent-Task.md'),
        expect.stringMatching(/priority: high/)
      );
    });

    it('should handle array fields for contexts and projects', async () => {
      // Mock LLM response with array fields
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Array Test Task',
          task_details: 'Task with arrays',
          priority: 'normal',
          contexts: ['work', 'office'],
          projects: ['project-a', 'project-b'],
          confidence: 'high'
        }]
      }));

      const file = new TFile('test.md');
      file.basename = 'test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify task was created with array fields
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Array-Test-Task.md'),
        expect.stringMatching(/contexts:\s*\[.*work.*office.*\]/)
      );
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Array-Test-Task.md'),
        expect.stringMatching(/projects:\s*\[.*project-a.*project-b.*\]/)
      );
    });

    it('should handle boolean archived field', async () => {
      // Mock LLM response with boolean field
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Boolean Test Task',
          task_details: 'Task with boolean',
          priority: 'normal',
          archived: false,
          confidence: 'high'
        }]
      }));

      const file = new TFile('test.md');
      file.basename = 'test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify task was created with boolean field
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Boolean-Test-Task.md'),
        expect.stringMatching(/archived: false/)
      );
    });
  });

  describe('Integration Tests - End-to-End TaskNotes Task Creation', () => {
    it('should create TaskNotes-compatible task with all required fields', async () => {
      // Mock comprehensive LLM response
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Complete TaskNotes Integration',
          task_details: 'Implement full TaskNotes compatibility with all required fields',
          priority: 'high',
          due_date: '2024-12-31',
          scheduled_date: '2024-12-15',
          contexts: ['development', 'obsidian'],
          projects: ['task-extractor'],
          confidence: 'high'
        }]
      }));

      const file = new TFile('meeting-notes.md');
      file.basename = 'meeting-notes';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'meetingnote', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify task was created with TaskNotes schema
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Complete-TaskNotes-Integration.md'),
        expect.stringMatching(/---[\s\S]*title: Complete TaskNotes Integration[\s\S]*---/)
      );
      
      // Verify all TaskNotes fields are present
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/title: Complete TaskNotes Integration/);
      expect(createdContent).toMatch(/status: open/);
      expect(createdContent).toMatch(/priority: high/);
      expect(createdContent).toMatch(/due: 2024-12-31/);
      expect(createdContent).toMatch(/scheduled: 2024-12-15/);
      expect(createdContent).toMatch(/contexts: \[development, obsidian\]/);
      expect(createdContent).toMatch(/projects: \[task-extractor\]/);
      expect(createdContent).toMatch(/archived: false/);
      expect(createdContent).toMatch(/dateCreated: \d{4}-\d{2}-\d{2}/);
      expect(createdContent).toMatch(/dateModified: \d{4}-\d{2}-\d{2}/);
    });

    it('should handle multiple tasks in single extraction (legacy compatibility)', async () => {
      // Reset mocks to ensure clean state
      vi.clearAllMocks();
      
      // Mock multi-task LLM response
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [
          {
            task_title: 'First Task',
            task_details: 'First task details',
            priority: 'high',
            contexts: ['work'],
            projects: ['project-1'],
            confidence: 'high'
          },
          {
            task_title: 'Second Task',
            task_details: 'Second task details',
            priority: 'normal',
            contexts: ['personal'],
            projects: ['project-2'],
            confidence: 'medium'
          }
        ],
        confidence: 'high'
      }));

      const file = new TFile('multi-task-email.md');
      file.basename = 'multi-task-email';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Note: The current implementation uses extractTaskFromContent which only returns the first task
      // for backward compatibility, so only one task will be created
      expect(app.vault.create).toHaveBeenCalledTimes(1);
      
      // Check that the first task was created with correct title
      const createCalls = (app.vault.create as any).mock.calls;
      expect(createCalls[0][1]).toMatch(/title: First Task/);
    });

    it('should support multi-task extraction via extractMultipleTasksFromContent method', async () => {
      // Reset mocks to ensure clean state
      vi.clearAllMocks();
      
      // Mock multi-task LLM response
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [
          {
            task_title: 'Multi Task One',
            task_details: 'First task in multi-task extraction',
            priority: 'high',
            contexts: ['work'],
            projects: ['project-1'],
            confidence: 'high'
          },
          {
            task_title: 'Multi Task Two',
            task_details: 'Second task in multi-task extraction',
            priority: 'normal',
            contexts: ['personal'],
            projects: ['project-2'],
            confidence: 'medium'
          }
        ],
        confidence: 'high'
      }));

      // Test the multi-task extraction method directly
      const result = await (taskProcessor as any).extractMultipleTasksFromContent('Test content', 'test.md');
      
      // Verify the result contains both tasks
      expect(result.found).toBe(true);
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0].task_title).toBe('Multi Task One');
      expect(result.tasks[1].task_title).toBe('Multi Task Two');
      expect(result.tasks[0].priority).toBe('high');
      expect(result.tasks[1].priority).toBe('normal');
    });

    it('should create tasks with proper YAML date format', async () => {
      // Mock LLM response with dates
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Date Format Task',
          task_details: 'Task to test date formatting',
          priority: 'normal',
          due_date: '2024-12-25',
          scheduled_date: '2024-12-20',
          confidence: 'high'
        }]
      }));

      const file = new TFile('date-test.md');
      file.basename = 'date-test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify dates are in YYYY-MM-DD format
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/due: 2024-12-25/);
      expect(createdContent).toMatch(/scheduled: 2024-12-20/);
      expect(createdContent).toMatch(/dateCreated: \d{4}-\d{2}-\d{2}/);
      expect(createdContent).toMatch(/dateModified: \d{4}-\d{2}-\d{2}/);
    });

    it('should handle empty arrays for contexts and projects', async () => {
      // Mock LLM response with empty arrays
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Empty Arrays Task',
          task_details: 'Task with empty context and project arrays',
          priority: 'normal',
          contexts: [],
          projects: [],
          confidence: 'high'
        }]
      }));

      const file = new TFile('empty-arrays.md');
      file.basename = 'empty-arrays';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify empty arrays are handled correctly
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/contexts: \[\]/);
      expect(createdContent).toMatch(/projects: \[\]/);
    });
  });

  describe('Backward Compatibility Tests', () => {
    it('should preserve existing custom frontmatter fields', () => {
      const customSettings: Partial<ExtractorSettings> = {
        frontmatterFields: [
          { key: 'task', defaultValue: '', type: 'text', required: true },
          { key: 'status', defaultValue: 'inbox', type: 'select', options: ['inbox', 'next', 'done'], required: true },
          { key: 'priority', defaultValue: 'medium', type: 'select', options: ['low', 'medium', 'high', 'urgent'], required: true }
        ]
      };

      const validated = validateSettings(customSettings);

      // Should preserve custom fields exactly
      expect(validated.frontmatterFields).toEqual(customSettings.frontmatterFields);
      expect(validated.frontmatterFields[0].key).toBe('task');
      expect(validated.frontmatterFields[1].defaultValue).toBe('inbox');
      expect(validated.frontmatterFields[2].options).toContain('urgent');
    });

    it('should work with existing configurations without TaskNotes fields', async () => {
      // Simulate existing user with old configuration
      settings.frontmatterFields = [
        { key: 'task', defaultValue: '', type: 'text', required: true },
        { key: 'status', defaultValue: 'inbox', type: 'select', options: ['inbox', 'next', 'done'], required: true },
        { key: 'priority', defaultValue: 'medium', type: 'select', options: ['low', 'medium', 'high', 'urgent'], required: true }
      ];

      // Mock LLM response using old field names
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        task_title: 'Legacy Task',
        task_details: 'Task using legacy format',
        priority: 'urgent',
        confidence: 'high'
      }));

      const file = new TFile('legacy-test.md');
      file.basename = 'legacy-test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Should still create task successfully with legacy format
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Legacy-Task.md'),
        expect.stringContaining('Legacy Task')
      );
    });

    it('should not break existing trigger types configuration', async () => {
      // Test with existing trigger types
      settings.triggerTypes = ['email', 'meeting note', 'call notes'];
      
      const file = new TFile('call-notes.md');
      file.basename = 'call-notes';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'call notes', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Should process file with existing trigger type
      expect(llmProvider.callLLM).toHaveBeenCalled();
    });

    it('should preserve existing custom prompt configurations', async () => {
      const customPrompt = 'Extract tasks for {ownerName} using my custom format';
      settings.customPrompt = customPrompt;
      
      const file = new TFile('custom-prompt-test.md');
      file.basename = 'custom-prompt-test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify custom prompt was used (not TaskNotes default)
      const llmCall = (llmProvider.callLLM as any).mock.calls[0];
      expect(llmCall[0]).toContain('Extract tasks for {ownerName} using my custom format');
      expect(llmCall[0]).not.toContain('task extraction specialist'); // Default prompt text
    });
  });

  describe('TaskNotes Plugin Expectations', () => {
    it('should create tasks that match TaskNotes file structure', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'TaskNotes Compatible Task',
          task_details: 'This task should work with TaskNotes plugin',
          priority: 'high',
          due_date: '2024-12-31',
          contexts: ['work', 'urgent'],
          projects: ['compatibility-test'],
          confidence: 'high'
        }]
      }));

      const file = new TFile('tasknotes-test.md');
      file.basename = 'tasknotes-test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      const createdContent = (app.vault.create as any).mock.calls[0][1];
      
      // Verify TaskNotes-expected structure
      expect(createdContent).toMatch(/^---\n/); // Starts with frontmatter
      expect(createdContent).toMatch(/title: TaskNotes Compatible Task/);
      expect(createdContent).toMatch(/status: open/); // Default TaskNotes status
      expect(createdContent).toMatch(/priority: high/); // TaskNotes priority values
      expect(createdContent).toMatch(/due: 2024-12-31/); // YYYY-MM-DD format
      expect(createdContent).toMatch(/contexts: \[work, urgent\]/); // Array format
      expect(createdContent).toMatch(/projects: \[compatibility-test\]/); // Array format
      expect(createdContent).toMatch(/archived: false/); // Boolean format
      expect(createdContent).toMatch(/---\n\n/); // Proper frontmatter closing
    });

    it('should use TaskNotes-compatible field names throughout', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Field Names Test',
          task_details: 'Testing TaskNotes field names',
          priority: 'normal',
          confidence: 'high'
        }]
      }));

      const file = new TFile('field-names-test.md');
      file.basename = 'field-names-test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      const createdContent = (app.vault.create as any).mock.calls[0][1];
      
      // Should use 'title' not 'task'
      expect(createdContent).toMatch(/title: Field Names Test/);
      expect(createdContent).not.toMatch(/task: Field Names Test/);
      
      // Should include TaskNotes field names (even if empty)
      expect(createdContent).toMatch(/title:/);
      expect(createdContent).toMatch(/status:/);
      expect(createdContent).toMatch(/priority:/);
      expect(createdContent).toMatch(/archived:/);
      expect(createdContent).toMatch(/dateCreated:/);
      expect(createdContent).toMatch(/dateModified:/);
    });

    it('should handle TaskNotes status workflow correctly', async () => {
      // Test different status scenarios
      const testCases = [
        { input: 'open', expected: 'open' },
        { input: 'in-progress', expected: 'in-progress' },
        { input: 'done', expected: 'done' }
      ];

      for (const testCase of testCases) {
        (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
          found: true,
          tasks: [{
            task_title: `Status Test ${testCase.input}`,
            task_details: `Testing ${testCase.input} status`,
            status: testCase.input,
            priority: 'normal',
            confidence: 'high'
          }]
        }));

        const file = new TFile(`status-test-${testCase.input}.md`);
        file.basename = `status-test-${testCase.input}`;
        
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({
          frontmatter: { Type: 'email', 'taskExtractor.processed': false }
        });

        await taskProcessor.onFileChanged(file);

        const createdContent = (app.vault.create as any).mock.calls[0][1];
        expect(createdContent).toMatch(new RegExp(`status: ${testCase.expected}`));
        
        // Reset mocks for next iteration
        vi.clearAllMocks();
      }
    });

    it('should create valid YAML frontmatter that TaskNotes can parse', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'YAML Validation Test',
          task_details: 'Task with special characters: quotes "test", apostrophes \'test\', and symbols @#$%',
          priority: 'high',
          contexts: ['work', 'test-context'],
          projects: ['yaml-test'],
          confidence: 'high'
        }]
      }));

      const file = new TFile('yaml-test.md');
      file.basename = 'yaml-test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      const createdContent = (app.vault.create as any).mock.calls[0][1];
      
      // Verify proper YAML structure
      expect(createdContent).toMatch(/^---\n[\s\S]*\n---\n\n/);
      
      // Verify arrays are properly formatted
      expect(createdContent).toMatch(/contexts: \[work, test-context\]/);
      expect(createdContent).toMatch(/projects: \[yaml-test\]/);
      
      // Verify boolean is not quoted
      expect(createdContent).toMatch(/archived: false/);
      expect(createdContent).not.toMatch(/archived: "false"/);
      
      // Verify dates are not quoted (YAML date format)
      expect(createdContent).toMatch(/dateCreated: \d{4}-\d{2}-\d{2}/);
      expect(createdContent).not.toMatch(/dateCreated: "\d{4}-\d{2}-\d{2}"/);
    });
  });
});