import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskProcessor } from '../src/task-processor';
import { ExtractorSettings, FrontmatterField, DEFAULT_SETTINGS } from '../src/types';
import { LLMProviderManager } from '../src/llm-providers';
import { App, TFile, Vault } from './mocks/obsidian';

describe('TaskProcessor - Frontmatter Field Formatting', () => {
  let processor: TaskProcessor;
  let mockApp: any;
  let mockLLMProvider: LLMProviderManager;
  let settings: ExtractorSettings;

  beforeEach(() => {
    mockApp = new App();
    mockLLMProvider = {
      callLLM: async () => '{"found": true, "tasks": [{"task_title": "Test Task", "task_details": "Test details"}]}'
    } as any;
    
    settings = {
      ...DEFAULT_SETTINGS,
      frontmatterFields: [
        { key: 'task', defaultValue: '', type: 'text', required: true },
        { key: 'priority', defaultValue: 'medium', type: 'select', options: ['low', 'medium', 'high'], required: true },
        { key: 'due', defaultValue: '', type: 'date', required: false },
        { key: 'completed', defaultValue: 'false', type: 'boolean', required: false },
        { key: 'project', defaultValue: '', type: 'text', required: false }
      ]
    };
    
    processor = new TaskProcessor(mockApp, settings, mockLLMProvider);
  });

  describe('field value extraction', () => {
    it('should extract values using direct key match', () => {
      const extraction = {
        task_title: 'Direct Task',
        priority: 'high',
        due_date: '2024-01-15'
      };
      
      const field = { key: 'task_title', defaultValue: '', type: 'text', required: true };
      const value = (processor as any).extractFieldValue(extraction, field);
      expect(value).toBe('Direct Task');
    });

    it('should map common field names', () => {
      const extraction = {
        task_title: 'Mapped Task',
        task_details: 'Task description'
      };
      
      const taskField = { key: 'task', defaultValue: '', type: 'text', required: true };
      const detailsField = { key: 'details', defaultValue: '', type: 'text', required: false };
      
      expect((processor as any).extractFieldValue(extraction, taskField)).toBe('Mapped Task');
      expect((processor as any).extractFieldValue(extraction, detailsField)).toBe('Task description');
    });

    it('should handle template values like {{date}}', () => {
      const extraction = {};
      const field = { key: 'created', defaultValue: '{{date}}', type: 'date', required: true };
      
      const value = (processor as any).extractFieldValue(extraction, field);
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should fallback to default value when extraction value not found', () => {
      const extraction = {};
      const field = { key: 'priority', defaultValue: 'medium', type: 'select', required: true };
      
      const value = (processor as any).extractFieldValue(extraction, field);
      expect(value).toBe('medium');
    });
  });

  describe('field value formatting', () => {
    it('should format text fields with proper quoting', () => {
      const field = { key: 'task', defaultValue: '', type: 'text', required: true };
      
      // Simple text without special characters
      expect((processor as any).formatFieldValue('Simple task', field)).toBe('Simple task');
      
      // Text with special YAML characters should be quoted
      expect((processor as any).formatFieldValue('Task: with colon', field)).toBe('"Task: with colon"');
      expect((processor as any).formatFieldValue('Task #1', field)).toBe('"Task #1"');
      expect((processor as any).formatFieldValue('Task [urgent]', field)).toBe('"Task [urgent]"');
      
      // Text with quotes should be escaped
      expect((processor as any).formatFieldValue('Task "quoted"', field)).toBe('"Task \\"quoted\\""');
    });

    it('should format date fields correctly', () => {
      const field = { key: 'due', defaultValue: '', type: 'date', required: false };
      
      // Valid ISO date
      expect((processor as any).formatFieldValue('2024-01-15', field)).toBe('2024-01-15');
      
      // Template value
      expect((processor as any).formatFieldValue('{{date}}', field)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      // Invalid date
      expect((processor as any).formatFieldValue('invalid-date', field)).toBeNull();
      
      // Empty value
      expect((processor as any).formatFieldValue('', field)).toBeNull();
    });

    it('should format select fields with validation', () => {
      const field = { key: 'priority', defaultValue: 'medium', type: 'select', options: ['low', 'medium', 'high'], required: true };
      
      // Valid option
      expect((processor as any).formatFieldValue('high', field)).toBe('high');
      
      // Case insensitive matching
      expect((processor as any).formatFieldValue('HIGH', field)).toBe('high');
      
      // Invalid option should default to first option
      expect((processor as any).formatFieldValue('invalid', field)).toBe('low');
    });

    it('should format boolean fields correctly', () => {
      const field = { key: 'completed', defaultValue: 'false', type: 'boolean', required: false };
      
      // Boolean values
      expect((processor as any).formatFieldValue(true, field)).toBe('true');
      expect((processor as any).formatFieldValue(false, field)).toBe('false');
      
      // String representations
      expect((processor as any).formatFieldValue('true', field)).toBe('true');
      expect((processor as any).formatFieldValue('yes', field)).toBe('true');
      expect((processor as any).formatFieldValue('1', field)).toBe('true');
      expect((processor as any).formatFieldValue('false', field)).toBe('false');
      expect((processor as any).formatFieldValue('no', field)).toBe('false');
      expect((processor as any).formatFieldValue('0', field)).toBe('false');
      
      // Invalid values default to false
      expect((processor as any).formatFieldValue('invalid', field)).toBe('false');
    });
  });

  describe('task creation with formatted frontmatter', () => {
    it('should create task with properly formatted frontmatter fields', async () => {
      const sourceFile = new TFile('source.md');
      const extraction = {
        task_title: 'Complex Task: with [special] characters',
        priority: 'HIGH',
        due_date: '2024-01-15',
        completed: true,
        project: 'Project Alpha'
      };

      // Mock vault.create to capture the content
      let createdContent = '';
      mockApp.vault.create = async (path: string, content: string) => {
        createdContent = content;
        return new TFile(path);
      };

      await (processor as any).createTaskNote(extraction, sourceFile);

      // Verify frontmatter formatting
      expect(createdContent).toContain('Type: Task');
      expect(createdContent).toContain('task: "Complex Task: with [special] characters"');
      expect(createdContent).toContain('priority: high');
      expect(createdContent).toContain('due: 2024-01-15');
      expect(createdContent).toContain('completed: true');
      expect(createdContent).toContain('project: Project Alpha');
    });

    it('should handle missing required fields gracefully', async () => {
      const sourceFile = new TFile('source.md');
      const extraction = {
        // Missing task_title (required field)
        priority: 'medium'
      };

      let createdContent = '';
      mockApp.vault.create = async (path: string, content: string) => {
        createdContent = content;
        return new TFile(path);
      };

      await (processor as any).createTaskNote(extraction, sourceFile);

      // Should use empty placeholder for missing required field
      expect(createdContent).toContain('task: ""');
      expect(createdContent).toContain('priority: medium');
    });

    it('should skip optional fields with no values', async () => {
      const sourceFile = new TFile('source.md');
      const extraction = {
        task_title: 'Simple Task',
        priority: 'low'
        // No due date or project
      };

      let createdContent = '';
      mockApp.vault.create = async (path: string, content: string) => {
        createdContent = content;
        return new TFile(path);
      };

      await (processor as any).createTaskNote(extraction, sourceFile);

      // Should include required fields and skip empty optional ones
      expect(createdContent).toContain('task: Simple Task');
      expect(createdContent).toContain('priority: low');
      expect(createdContent).not.toContain('due:');
      expect(createdContent).not.toContain('project:');
    });
  });
});