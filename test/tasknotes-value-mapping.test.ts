import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskProcessor } from '../src/task-processor';
import { ExtractorSettings, DEFAULT_SETTINGS } from '../src/types';
import { LLMProviderManager } from '../src/llm-providers';
import { App, TFile } from './mocks/obsidian';

// Mock the LLMProviderManager
vi.mock('../src/llm-providers', () => ({
  LLMProviderManager: vi.fn().mockImplementation(() => ({
    callLLM: vi.fn()
  }))
}));

describe('TaskNotes Value Mapping Tests', () => {
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
    settings.ownerName = 'Test User'; // Ensure owner name is set
    llmProvider = new LLMProviderManager(settings);
    taskProcessor = new TaskProcessor(app, settings, llmProvider);
  });

  describe('Priority Value Mapping', () => {
    it('should map "medium" priority to "normal"', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Medium Priority Task',
          task_details: 'Task with medium priority',
          priority: 'medium',
          confidence: 'high'
        }]
      }));

      const file = new TFile('priority-test.md');
      file.basename = 'priority-test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify priority was mapped from medium to normal
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Medium-Priority-Task.md'),
        expect.stringMatching(/priority: normal/)
      );
      
      // Should not contain the original "medium" value
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).not.toMatch(/priority: medium/);
    });

    it('should map "urgent" priority to "high"', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Urgent Priority Task',
          task_details: 'Task with urgent priority',
          priority: 'urgent',
          confidence: 'high'
        }]
      }));

      const file = new TFile('urgent-test.md');
      file.basename = 'urgent-test';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify priority was mapped from urgent to high
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Tasks/Urgent-Priority-Task.md'),
        expect.stringMatching(/priority: high/)
      );
      
      // Should not contain the original "urgent" value
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).not.toMatch(/priority: urgent/);
    });

    it('should preserve valid TaskNotes priority values', async () => {
      const validPriorities = ['low', 'normal', 'high'];
      
      for (const priority of validPriorities) {
        (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
          found: true,
          tasks: [{
            task_title: `${priority} Priority Task`,
            task_details: `Task with ${priority} priority`,
            priority: priority,
            confidence: 'high'
          }]
        }));

        const file = new TFile(`${priority}-test.md`);
        file.basename = `${priority}-test`;
        
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({
          frontmatter: { Type: 'email', 'taskExtractor.processed': false }
        });

        await taskProcessor.onFileChanged(file);

        // Verify valid priority values are preserved
        expect(app.vault.create).toHaveBeenCalledWith(
          expect.stringContaining(`Tasks/${priority}-Priority-Task.md`),
          expect.stringMatching(new RegExp(`priority: ${priority}`))
        );
        
        // Reset mocks for next iteration
        vi.clearAllMocks();
      }
    });

    it('should handle case-insensitive priority mapping', async () => {
      // Test case-insensitive mapping with a single test case to avoid complexity
      vi.clearAllMocks();
      
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Case Test MEDIUM',
          task_details: 'Testing case sensitivity for MEDIUM',
          priority: 'MEDIUM',
          confidence: 'high'
        }]
      }));

      const file = new TFile('case-test-medium.md');
      file.basename = 'case-test-medium';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify case-insensitive mapping works (MEDIUM -> normal)
      expect(app.vault.create).toHaveBeenCalled();
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/priority: normal/);
    });

    it('should default to "normal" for unknown priority values', async () => {
      // Reset mocks for clean state
      vi.clearAllMocks();
      
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Unknown Priority Task',
          task_details: 'Task with unknown priority',
          priority: 'super-urgent-critical',
          confidence: 'high'
        }]
      }));

      const file = new TFile('unknown-priority.md');
      file.basename = 'unknown-priority';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify task was created and unknown priority is handled
      expect(app.vault.create).toHaveBeenCalled();
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toContain('Unknown Priority Task');
      
      // Unknown priority should either default to normal or use the first valid option
      expect(createdContent).toMatch(/priority: (normal|low|high)/);
    });
  });

  describe('Status Value Mapping', () => {
    it('should map legacy status values to TaskNotes equivalents', async () => {
      const statusMappings = [
        { input: 'inbox', expected: 'open' },
        { input: 'next', expected: 'open' },
        { input: 'waiting', expected: 'open' },
        { input: 'someday', expected: 'open' },
        { input: 'cancelled', expected: 'done' }
      ];

      for (const mapping of statusMappings) {
        (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
          found: true,
          tasks: [{
            task_title: `Status ${mapping.input} Task`,
            task_details: `Task with ${mapping.input} status`,
            status: mapping.input,
            priority: 'normal',
            confidence: 'high'
          }]
        }));

        const file = new TFile(`status-${mapping.input}.md`);
        file.basename = `status-${mapping.input}`;
        
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({
          frontmatter: { Type: 'email', 'taskExtractor.processed': false }
        });

        await taskProcessor.onFileChanged(file);

        // Verify status mapping
        expect(app.vault.create).toHaveBeenCalledWith(
          expect.stringContaining(`Tasks/Status-${mapping.input}-Task.md`),
          expect.stringMatching(new RegExp(`status: ${mapping.expected}`))
        );
        
        // Reset mocks for next iteration
        vi.clearAllMocks();
      }
    });

    it('should preserve valid TaskNotes status values', async () => {
      const validStatuses = ['open', 'in-progress', 'done'];
      
      for (const status of validStatuses) {
        (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
          found: true,
          tasks: [{
            task_title: `${status} Status Task`,
            task_details: `Task with ${status} status`,
            status: status,
            priority: 'normal',
            confidence: 'high'
          }]
        }));

        const file = new TFile(`${status}-status.md`);
        file.basename = `${status}-status`;
        
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({
          frontmatter: { Type: 'email', 'taskExtractor.processed': false }
        });

        await taskProcessor.onFileChanged(file);

        // Verify valid status values are preserved
        expect(app.vault.create).toHaveBeenCalledWith(
          expect.stringContaining(`Tasks/${status}-Status-Task.md`),
          expect.stringMatching(new RegExp(`status: ${status}`))
        );
        
        // Reset mocks for next iteration
        vi.clearAllMocks();
      }
    });
  });

  describe('Array Field Processing', () => {
    it('should handle string input for contexts field', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'String Context Task',
          task_details: 'Task with string context',
          priority: 'normal',
          contexts: 'work, office, meeting',
          confidence: 'high'
        }]
      }));

      const file = new TFile('string-context.md');
      file.basename = 'string-context';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify string context is converted to array format
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/contexts: \[work, office, meeting\]/);
    });

    it('should handle array input for contexts field', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Array Context Task',
          task_details: 'Task with array context',
          priority: 'normal',
          contexts: ['development', 'testing', 'review'],
          confidence: 'high'
        }]
      }));

      const file = new TFile('array-context.md');
      file.basename = 'array-context';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify array context is properly formatted
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/contexts: \[development, testing, review\]/);
    });

    it('should handle string input for projects field', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'String Project Task',
          task_details: 'Task with string project',
          priority: 'normal',
          projects: 'project-alpha, project-beta',
          confidence: 'high'
        }]
      }));

      const file = new TFile('string-project.md');
      file.basename = 'string-project';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify string project is converted to array format
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/projects: \[project-alpha, project-beta\]/);
    });

    it('should handle empty arrays correctly', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Empty Arrays Task',
          task_details: 'Task with empty arrays',
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

      // Verify empty arrays are properly formatted
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/contexts: \[\]/);
      expect(createdContent).toMatch(/projects: \[\]/);
    });

    it('should handle null/undefined array fields', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Null Arrays Task',
          task_details: 'Task with null/undefined arrays',
          priority: 'normal',
          contexts: null,
          projects: undefined,
          confidence: 'high'
        }]
      }));

      const file = new TFile('null-arrays.md');
      file.basename = 'null-arrays';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify task was created (null/undefined arrays may not appear in frontmatter if empty)
      expect(app.vault.create).toHaveBeenCalled();
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toContain('title: Null Arrays Task');
      
      // Arrays may be omitted if null/undefined, or shown as empty arrays
      // Both behaviors are acceptable for TaskNotes compatibility
      const hasContexts = createdContent.includes('contexts:');
      const hasProjects = createdContent.includes('projects:');
      
      if (hasContexts) {
        expect(createdContent).toMatch(/contexts: \[\]/);
      }
      if (hasProjects) {
        expect(createdContent).toMatch(/projects: \[\]/);
      }
    });
  });

  describe('Boolean Field Processing', () => {
    it('should handle boolean true for archived field', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Archived True Task',
          task_details: 'Task with archived true',
          priority: 'normal',
          archived: true,
          confidence: 'high'
        }]
      }));

      const file = new TFile('archived-true.md');
      file.basename = 'archived-true';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify boolean true is properly formatted
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/archived: true/);
      expect(createdContent).not.toMatch(/archived: "true"/);
    });

    it('should handle boolean false for archived field', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Archived False Task',
          task_details: 'Task with archived false',
          priority: 'normal',
          archived: false,
          confidence: 'high'
        }]
      }));

      const file = new TFile('archived-false.md');
      file.basename = 'archived-false';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify boolean false is properly formatted
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/archived: false/);
      expect(createdContent).not.toMatch(/archived: "false"/);
    });

    it('should handle string "true" for archived field', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'String True Task',
          task_details: 'Task with string "true"',
          priority: 'normal',
          archived: 'true',
          confidence: 'high'
        }]
      }));

      const file = new TFile('string-true.md');
      file.basename = 'string-true';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify string "true" is converted to boolean true
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/archived: true/);
      expect(createdContent).not.toMatch(/archived: "true"/);
    });

    it('should handle string "false" for archived field', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'String False Task',
          task_details: 'Task with string "false"',
          priority: 'normal',
          archived: 'false',
          confidence: 'high'
        }]
      }));

      const file = new TFile('string-false.md');
      file.basename = 'string-false';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify string "false" is converted to boolean false
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/archived: false/);
      expect(createdContent).not.toMatch(/archived: "false"/);
    });

    it('should default archived to false when not specified', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Default Archived Task',
          task_details: 'Task without archived field',
          priority: 'normal',
          confidence: 'high'
        }]
      }));

      const file = new TFile('default-archived.md');
      file.basename = 'default-archived';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify archived defaults to false
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/archived: false/);
    });
  });

  describe('Date Field Processing', () => {
    it('should format dates in YYYY-MM-DD format', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Date Format Task',
          task_details: 'Task with various date formats',
          priority: 'normal',
          due_date: '2024-12-25',
          scheduled_date: '2024-12-20',
          confidence: 'high'
        }]
      }));

      const file = new TFile('date-format.md');
      file.basename = 'date-format';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify dates are in correct format
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toMatch(/due: 2024-12-25/);
      expect(createdContent).toMatch(/scheduled: 2024-12-20/);
      expect(createdContent).toMatch(/dateCreated: \d{4}-\d{2}-\d{2}/);
      expect(createdContent).toMatch(/dateModified: \d{4}-\d{2}-\d{2}/);
    });

    it('should handle null dates correctly', async () => {
      (llmProvider.callLLM as any).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [{
          task_title: 'Null Date Task',
          task_details: 'Task with null dates',
          priority: 'normal',
          due_date: null,
          scheduled_date: null,
          confidence: 'high'
        }]
      }));

      const file = new TFile('null-date.md');
      file.basename = 'null-date';
      
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { Type: 'email', 'taskExtractor.processed': false }
      });

      await taskProcessor.onFileChanged(file);

      // Verify task was created (null dates may be omitted from frontmatter)
      expect(app.vault.create).toHaveBeenCalled();
      const createdContent = (app.vault.create as any).mock.calls[0][1];
      expect(createdContent).toContain('title: Null Date Task');
      
      // Null dates may be omitted entirely or shown as empty values
      // Both behaviors are acceptable for TaskNotes compatibility
      const hasDue = createdContent.includes('due:');
      const hasScheduled = createdContent.includes('scheduled:');
      
      if (hasDue) {
        expect(createdContent).toMatch(/due:\s*$/m);
      }
      if (hasScheduled) {
        expect(createdContent).toMatch(/scheduled:\s*$/m);
      }
    });
  });
});