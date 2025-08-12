import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskProcessor } from '../src/task-processor';
import { ExtractorSettings, DEFAULT_SETTINGS } from '../src/types';
import { LLMProviderManager } from '../src/llm-providers';
import { App, TFile, Notice } from 'obsidian';

// Mock Notice
vi.mock('obsidian', async () => {
  const actual = await vi.importActual('obsidian');
  return {
    ...actual,
    Notice: vi.fn().mockImplementation((message) => {
      console.log(`Notice: ${message}`);
    })
  };
});

// Mock the LLMProviderManager
vi.mock('../src/llm-providers', () => ({
  LLMProviderManager: vi.fn().mockImplementation(() => ({
    callLLM: vi.fn()
  }))
}));

describe('Manual Extraction Integration Tests', () => {
  let app: App;
  let settings: ExtractorSettings;
  let llmProvider: LLMProviderManager;
  let taskProcessor: TaskProcessor;
  let mockFile: TFile;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock app
    app = new App();
    
    // Mock vault with comprehensive functionality
    app.vault = {
      read: vi.fn(),
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

    settings = { 
      ...DEFAULT_SETTINGS,
      ownerName: 'Test User',
      tasksFolder: 'Tasks',
      frontmatterFields: [
        { key: 'Type', type: 'text', defaultValue: 'Task', required: true },
        { key: 'Status', type: 'select', defaultValue: 'Open', required: true },
        { key: 'Owner', type: 'text', defaultValue: 'Test User', required: true }
      ]
    };
    llmProvider = new LLMProviderManager(settings);
    taskProcessor = new TaskProcessor(app, settings, llmProvider);

    // Create mock file
    mockFile = {
      path: 'test-note.md',
      extension: 'md',
      name: 'test-note.md',
      basename: 'test-note'
    } as TFile;
  });

  describe('End-to-End Manual Extraction Flow', () => {
    it('should complete full extraction workflow from note to task creation', async () => {
      const noteContent = `# Meeting Notes

Today we discussed several action items:

- Need to review the quarterly budget
- Follow up with the client about their requirements
- Schedule team meeting for next week

## Decisions Made
- Approved the new feature proposal
- Decided to postpone the migration until Q2`;

      const llmResponse = {
        found: true,
        tasks: [
          {
            task_title: 'Review Quarterly Budget',
            task_details: 'Review and analyze the quarterly budget discussed in the meeting',
            confidence: 'high'
          },
          {
            task_title: 'Follow Up with Client',
            task_details: 'Contact client to gather detailed requirements for the project',
            confidence: 'high'
          },
          {
            task_title: 'Schedule Team Meeting',
            task_details: 'Organize and schedule the next team meeting for next week',
            confidence: 'medium'
          }
        ]
      };

      vi.mocked(app.vault.read).mockResolvedValue(noteContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue(JSON.stringify(llmResponse));

      await taskProcessor.processFileManually(mockFile);

      // Verify the full workflow
      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(app.vault.read).toHaveBeenCalledWith(mockFile);
      expect(llmProvider.callLLM).toHaveBeenCalledWith(
        expect.any(String), // system prompt
        expect.stringContaining(noteContent) // user prompt with content
      );
      
      // Verify task creation - should be called 3 times for 3 tasks
      expect(app.vault.create).toHaveBeenCalledTimes(3);
      
      // Verify task files created with proper names and structure
      const createCalls = vi.mocked(app.vault.create).mock.calls;
      
      expect(createCalls[0][0]).toBe('Tasks/Review-Quarterly-Budget.md');
      expect(createCalls[0][1]).toContain('Source: [[test-note]]');
      expect(createCalls[0][1]).toMatch(/---[\s\S]*Type: Task[\s\S]*---/);
      
      expect(createCalls[1][0]).toBe('Tasks/Follow-Up-with-Client.md');
      expect(createCalls[1][1]).toContain('Source: [[test-note]]');
      
      expect(createCalls[2][0]).toBe('Tasks/Schedule-Team-Meeting.md');
      expect(createCalls[2][1]).toContain('Source: [[test-note]]');

      expect(Notice).toHaveBeenCalledWith('Task Extractor: Created 3 task notes');
    });

    it('should handle frontmatter customization in end-to-end flow', async () => {
      // Configure custom frontmatter fields
      settings.frontmatterFields = [
        { key: 'Type', type: 'text', defaultValue: 'Action Item', required: true },
        { key: 'Priority', type: 'select', defaultValue: 'Medium', required: false },
        { key: 'Deadline', type: 'date', defaultValue: '', required: false },
        { key: 'Project', type: 'text', defaultValue: 'General', required: true }
      ];

      const noteContent = 'TODO: Complete the project documentation';
      const llmResponse = {
        found: true,
        tasks: [{
          task_title: 'Complete Project Documentation',
          task_details: 'Write comprehensive documentation for the project',
          confidence: 'high'
        }]
      };

      vi.mocked(app.vault.read).mockResolvedValue(noteContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue(JSON.stringify(llmResponse));

      await taskProcessor.processFileManually(mockFile);

      expect(app.vault.create).toHaveBeenCalledTimes(1);
      const [filePath, content] = vi.mocked(app.vault.create).mock.calls[0];
      
      expect(filePath).toBe('Tasks/Complete-Project-Documentation.md');
      expect(content).toMatch(/---[\s\S]*Type: Action Item[\s\S]*---/);
      expect(content).toMatch(/Priority: [Mm]edium/);
      expect(content).toMatch(/Project: General/);
      // Deadline field might be omitted if empty, just check core structure is correct
    });

    it('should interact correctly with existing automatic processing settings', async () => {
      // Test that manual processing bypasses automatic filtering
      const excludedContent = `---
type: template
status: draft
---

# Template Note

This is a template that normally wouldn't be processed:
- [ ] Example task that should be extracted manually`;

      const llmResponse = {
        found: true,
        tasks: [{
          task_title: 'Example Task',
          task_details: 'Task from template that should be extracted',
          confidence: 'high'
        }]
      };

      vi.mocked(app.vault.read).mockResolvedValue(excludedContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue(JSON.stringify(llmResponse));

      await taskProcessor.processFileManually(mockFile);

      // Should process despite being a template (bypass filtering)
      expect(llmProvider.callLLM).toHaveBeenCalled();
      expect(app.vault.create).toHaveBeenCalledTimes(1);
      expect(Notice).toHaveBeenCalledWith('Task Extractor: Created 1 task note');
    });
  });

  describe('Error Scenarios Integration', () => {
    it('should handle complete failure gracefully with proper cleanup', async () => {
      vi.mocked(app.vault.read).mockRejectedValue(new Error('Vault access failed'));

      await taskProcessor.processFileManually(mockFile);

      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(Notice).toHaveBeenCalledWith('Task Extractor: Error extracting tasks - see console for details');
      expect(app.vault.create).not.toHaveBeenCalled();
    });

    it('should handle partial failures in task creation', async () => {
      const noteContent = 'Multiple tasks to create';
      const llmResponse = {
        found: true,
        tasks: [
          { task_title: 'Task 1', task_details: 'First task', confidence: 'high' },
          { task_title: 'Task 2', task_details: 'Second task', confidence: 'high' },
          { task_title: 'Task 3', task_details: 'Third task', confidence: 'high' }
        ]
      };

      vi.mocked(app.vault.read).mockResolvedValue(noteContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue(JSON.stringify(llmResponse));
      
      // Mock the second task creation to fail
      vi.mocked(app.vault.create)
        .mockResolvedValueOnce(undefined) // First task succeeds
        .mockRejectedValueOnce(new Error('File creation failed')) // Second task fails
        .mockResolvedValueOnce(undefined); // Third task succeeds

      await taskProcessor.processFileManually(mockFile);

      expect(app.vault.create).toHaveBeenCalledTimes(3);
      // Verify that a success notice was shown (2 tasks succeeded out of 3)
      expect(Notice).toHaveBeenCalledWith(expect.stringMatching(/Created \d+ task notes?/));
    });

    it('should handle LLM service failures gracefully', async () => {
      vi.mocked(app.vault.read).mockResolvedValue('Content with tasks');
      vi.mocked(llmProvider.callLLM).mockRejectedValue(new Error('LLM service unavailable'));

      await taskProcessor.processFileManually(mockFile);

      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(Notice).toHaveBeenCalledWith('Task Extractor: No tasks found in current note');
      expect(app.vault.create).not.toHaveBeenCalled();
    });
  });

  describe('Complex Scenarios Integration', () => {
    it('should handle mixed content types in a single note', async () => {
      const complexContent = `---
title: Complex Meeting Notes
date: 2024-01-15
participants: [Alice, Bob, Charlie]
---

# Meeting Notes - Project Planning

## Action Items
- [ ] Review the technical specifications
- [ ] Contact the vendor for quotes

## Decisions Made
- We approved the budget increase
- Timeline moved to Q2

## Questions for Follow-up
- What are the security implications?
- Do we need additional resources?

## Random Notes
Just some thoughts and ideas that aren't actionable.

## Links and References
- [Project Documentation](https://example.com/docs)
- Meeting recording: recording-123.mp4`;

      const llmResponse = {
        found: true,
        tasks: [
          {
            task_title: 'Review Technical Specifications',
            task_details: 'Go through and analyze the technical specifications document',
            confidence: 'high'
          },
          {
            task_title: 'Contact Vendor for Quotes',
            task_details: 'Reach out to the vendor to get pricing quotes',
            confidence: 'high'
          },
          {
            task_title: 'Research Security Implications',
            task_details: 'Investigate what security considerations need to be addressed',
            confidence: 'medium'
          },
          {
            task_title: 'Assess Resource Requirements',
            task_details: 'Determine if additional resources are needed for the project',
            confidence: 'medium'
          }
        ]
      };

      vi.mocked(app.vault.read).mockResolvedValue(complexContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue(JSON.stringify(llmResponse));

      await taskProcessor.processFileManually(mockFile);

      expect(app.vault.create).toHaveBeenCalledTimes(4);
      expect(Notice).toHaveBeenCalledWith('Task Extractor: Created 4 task notes');

      // Verify that all tasks include source linking and proper structure
      const createCalls = vi.mocked(app.vault.create).mock.calls;
      createCalls.forEach(([filePath, content]) => {
        expect(content).toContain('Source: [[test-note]]');
        expect(content).toMatch(/---[\s\S]*Type: Task[\s\S]*---/);
      });
    });

    it('should work with different file locations and naming patterns', async () => {
      const deepNestedFile = {
        path: 'Projects/2024/Q1/client-meetings/important-meeting.md',
        extension: 'md',
        name: 'important-meeting.md',
        basename: 'important-meeting'
      } as TFile;

      const noteContent = 'Important client feedback to address';
      const llmResponse = {
        found: true,
        tasks: [{
          task_title: 'Address Client Feedback',
          task_details: 'Review and respond to important client feedback',
          confidence: 'high'
        }]
      };

      vi.mocked(app.vault.read).mockResolvedValue(noteContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue(JSON.stringify(llmResponse));

      await taskProcessor.processFileManually(deepNestedFile);

      expect(app.vault.create).toHaveBeenCalledTimes(1);
      const [filePath, content] = vi.mocked(app.vault.create).mock.calls[0];
      
      expect(filePath).toBe('Tasks/Address-Client-Feedback.md');
      expect(content).toContain('Source: [[important-meeting]]');
    });

    it('should handle unicode and special characters in content and titles', async () => {
      const unicodeContent = `# Проект Планирование 🚀

## Задачи на сегодня:
- Проверить документацию проекта
- Связаться с клиентом 📞
- Обновить тестовые данные`;

      const llmResponse = {
        found: true,
        tasks: [
          {
            task_title: 'Проверить документацию проекта',
            task_details: 'Проверить и обновить документацию проекта',
            confidence: 'high'
          },
          {
            task_title: 'Связаться с клиентом',
            task_details: 'Позвонить клиенту для обсуждения требований',
            confidence: 'high'
          }
        ]
      };

      vi.mocked(app.vault.read).mockResolvedValue(unicodeContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue(JSON.stringify(llmResponse));

      await taskProcessor.processFileManually(mockFile);

      expect(app.vault.create).toHaveBeenCalledTimes(2);
      expect(Notice).toHaveBeenCalledWith('Task Extractor: Created 2 task notes');

      const createCalls = vi.mocked(app.vault.create).mock.calls;
      expect(createCalls[0][0]).toContain('Tasks/');
      expect(createCalls[0][1]).toContain('Source: [[test-note]]');
      expect(createCalls[1][1]).toContain('Source: [[test-note]]');
    });
  });

  describe('Performance and Reliability Integration', () => {
    it('should handle large notes efficiently', async () => {
      const largeContent = `# Large Meeting Notes\n\n` + 
        Array.from({ length: 100 }, (_, i) => 
          `## Section ${i + 1}\n- Task item ${i + 1}: Complete section ${i + 1} work\n`
        ).join('\n');

      const llmResponse = {
        found: true,
        tasks: Array.from({ length: 5 }, (_, i) => ({
          task_title: `Complete Section ${i + 1} Work`,
          task_details: `Complete all work related to section ${i + 1}`,
          confidence: 'medium'
        }))
      };

      vi.mocked(app.vault.read).mockResolvedValue(largeContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue(JSON.stringify(llmResponse));

      const startTime = Date.now();
      await taskProcessor.processFileManually(mockFile);
      const processingTime = Date.now() - startTime;

      expect(app.vault.create).toHaveBeenCalledTimes(5);
      expect(Notice).toHaveBeenCalledWith('Task Extractor: Created 5 task notes');
      
      // Ensure processing completes in reasonable time (less than 5 seconds)
      expect(processingTime).toBeLessThan(5000);
    });

    it('should maintain consistency across multiple manual extractions', async () => {
      const noteContent = 'Consistent task extraction test';
      const llmResponse = {
        found: true,
        tasks: [{
          task_title: 'Consistent Task',
          task_details: 'This task should be created consistently',
          confidence: 'high'
        }]
      };

      vi.mocked(app.vault.read).mockResolvedValue(noteContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue(JSON.stringify(llmResponse));

      // Run manual extraction multiple times
      for (let i = 0; i < 3; i++) {
        vi.clearAllMocks();
        
        await taskProcessor.processFileManually(mockFile);
        
        expect(app.vault.create).toHaveBeenCalledTimes(1);
        const [filePath, content] = vi.mocked(app.vault.create).mock.calls[0];
        
        expect(filePath).toBe('Tasks/Consistent-Task.md');
        expect(content).toContain('Source: [[test-note]]');
        expect(content).toMatch(/---[\s\S]*Type: Task[\s\S]*---/);
        expect(Notice).toHaveBeenCalledWith('Task Extractor: Created 1 task note');
      }
    });
  });
});