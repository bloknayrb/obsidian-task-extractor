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

describe('Manual Processing with Various File Types and States', () => {
  let app: App;
  let settings: ExtractorSettings;
  let llmProvider: LLMProviderManager;
  let taskProcessor: TaskProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock app
    app = new App();
    
    // Mock vault
    app.vault = {
      read: vi.fn().mockResolvedValue('Test content with tasks'),
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
      ownerName: 'Test User'
    };
    llmProvider = new LLMProviderManager(settings);
    taskProcessor = new TaskProcessor(app, settings, llmProvider);
  });

  describe('File Type Validation', () => {
    it('should process .md files successfully', async () => {
      const mdFile = {
        path: 'test.md',
        extension: 'md',
        name: 'test.md'
      } as TFile;

      vi.mocked(llmProvider.callLLM).mockResolvedValue('{"found": false, "tasks": []}');

      await taskProcessor.processFileManually(mdFile);

      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(Notice).toHaveBeenCalledWith('Task Extractor: No tasks found in current note');
    });

    it('should reject .txt files with appropriate notice', async () => {
      const txtFile = {
        path: 'test.txt',
        extension: 'txt',
        name: 'test.txt'
      } as TFile;

      await taskProcessor.processFileManually(txtFile);

      expect(Notice).toHaveBeenCalledWith('Task Extractor: Active file is not a markdown note');
      expect(vi.mocked(llmProvider.callLLM)).not.toHaveBeenCalled();
    });

    it('should reject files with no extension', async () => {
      const noExtFile = {
        path: 'README',
        extension: '',
        name: 'README'
      } as TFile;

      await taskProcessor.processFileManually(noExtFile);

      expect(Notice).toHaveBeenCalledWith('Task Extractor: Active file is not a markdown note');
      expect(vi.mocked(llmProvider.callLLM)).not.toHaveBeenCalled();
    });

    it('should reject other document types like .pdf', async () => {
      const pdfFile = {
        path: 'document.pdf',
        extension: 'pdf',
        name: 'document.pdf'
      } as TFile;

      await taskProcessor.processFileManually(pdfFile);

      expect(Notice).toHaveBeenCalledWith('Task Extractor: Active file is not a markdown note');
      expect(vi.mocked(llmProvider.callLLM)).not.toHaveBeenCalled();
    });
  });

  describe('File Content States', () => {
    it('should process files with empty content', async () => {
      const mdFile = {
        path: 'empty.md',
        extension: 'md',
        name: 'empty.md'
      } as TFile;

      vi.mocked(app.vault.read).mockResolvedValue('');
      vi.mocked(llmProvider.callLLM).mockResolvedValue('{"found": false, "tasks": []}');

      await taskProcessor.processFileManually(mdFile);

      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(Notice).toHaveBeenCalledWith('Task Extractor: No tasks found in current note');
    });

    it('should process files with only frontmatter', async () => {
      const mdFile = {
        path: 'frontmatter-only.md',
        extension: 'md',
        name: 'frontmatter-only.md'
      } as TFile;

      const frontmatterOnlyContent = `---
title: Test Note
tags: [test]
---`;

      vi.mocked(app.vault.read).mockResolvedValue(frontmatterOnlyContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue('{"found": false, "tasks": []}');

      await taskProcessor.processFileManually(mdFile);

      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(vi.mocked(llmProvider.callLLM)).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(frontmatterOnlyContent)
      );
    });

    it('should process files with very large content', async () => {
      const mdFile = {
        path: 'large.md',
        extension: 'md',
        name: 'large.md'
      } as TFile;

      const largeContent = 'This is a very long note. '.repeat(1000);
      vi.mocked(app.vault.read).mockResolvedValue(largeContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue('{"found": false, "tasks": []}');

      await taskProcessor.processFileManually(mdFile);

      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(vi.mocked(llmProvider.callLLM)).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(largeContent)
      );
    });

    it('should process files with special characters and unicode', async () => {
      const mdFile = {
        path: 'unicode.md',
        extension: 'md',
        name: 'unicode.md'
      } as TFile;

      const unicodeContent = '# Test 测试 🚀\n\n- [ ] Task with émojis 💡\n- [ ] Задача на русском\n- [ ] タスク';
      vi.mocked(app.vault.read).mockResolvedValue(unicodeContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue('{"found": false, "tasks": []}');

      await taskProcessor.processFileManually(mdFile);

      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(vi.mocked(llmProvider.callLLM)).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(unicodeContent)
      );
    });
  });

  describe('Settings State Validation', () => {
    it('should reject processing when owner name is empty string', async () => {
      settings.ownerName = '';
      const mdFile = {
        path: 'test.md',
        extension: 'md',
        name: 'test.md'
      } as TFile;

      await taskProcessor.processFileManually(mdFile);

      expect(Notice).toHaveBeenCalledWith('Task Extractor: Owner name not configured in plugin settings');
      expect(vi.mocked(llmProvider.callLLM)).not.toHaveBeenCalled();
    });

    it('should reject processing when owner name is only whitespace', async () => {
      settings.ownerName = '   ';
      const mdFile = {
        path: 'test.md',
        extension: 'md',
        name: 'test.md'
      } as TFile;

      await taskProcessor.processFileManually(mdFile);

      expect(Notice).toHaveBeenCalledWith('Task Extractor: Owner name not configured in plugin settings');
      expect(vi.mocked(llmProvider.callLLM)).not.toHaveBeenCalled();
    });

    it('should process successfully when owner name is properly configured', async () => {
      settings.ownerName = 'Valid User';
      const mdFile = {
        path: 'test.md',
        extension: 'md',
        name: 'test.md'
      } as TFile;

      vi.mocked(llmProvider.callLLM).mockResolvedValue('{"found": false, "tasks": []}');

      await taskProcessor.processFileManually(mdFile);

      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(vi.mocked(llmProvider.callLLM)).toHaveBeenCalled();
    });
  });

  describe('Bypass Logic Verification', () => {
    it('should bypass frontmatter type filtering and process any note type', async () => {
      // Set up a note with frontmatter that normally would be excluded
      const mdFile = {
        path: 'excluded-type.md',
        extension: 'md',
        name: 'excluded-type.md'
      } as TFile;

      const contentWithExcludedType = `---
type: template
title: Template Note
---

This is template content that normally wouldn't be processed automatically.`;

      vi.mocked(app.vault.read).mockResolvedValue(contentWithExcludedType);
      vi.mocked(llmProvider.callLLM).mockResolvedValue('{"found": false, "tasks": []}');

      await taskProcessor.processFileManually(mdFile);

      // Should process despite having a type that might normally be excluded
      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(vi.mocked(llmProvider.callLLM)).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(contentWithExcludedType)
      );
    });

    it('should bypass duplicate prevention and allow processing already processed files', async () => {
      const mdFile = {
        path: 'already-processed.md',
        extension: 'md',
        name: 'already-processed.md'
      } as TFile;

      const processedContent = `---
title: Already Processed Note
task_extractor_processed: true
---

This note was already processed but should be processed again manually.`;

      vi.mocked(app.vault.read).mockResolvedValue(processedContent);
      vi.mocked(llmProvider.callLLM).mockResolvedValue('{"found": false, "tasks": []}');

      await taskProcessor.processFileManually(mdFile);

      // Should process despite being marked as already processed
      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(vi.mocked(llmProvider.callLLM)).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(processedContent)
      );
    });
  });

  describe('Error Recovery States', () => {
    it('should handle file read errors gracefully', async () => {
      const mdFile = {
        path: 'unreadable.md',
        extension: 'md',
        name: 'unreadable.md'
      } as TFile;

      vi.mocked(app.vault.read).mockRejectedValue(new Error('File not found'));

      await taskProcessor.processFileManually(mdFile);

      expect(Notice).toHaveBeenCalledWith('Task Extractor: Error extracting tasks - see console for details');
      expect(vi.mocked(llmProvider.callLLM)).not.toHaveBeenCalled();
    });

    it('should handle LLM errors and show appropriate notice', async () => {
      const mdFile = {
        path: 'test.md',
        extension: 'md',
        name: 'test.md'
      } as TFile;

      vi.mocked(llmProvider.callLLM).mockRejectedValue(new Error('API Error'));

      await taskProcessor.processFileManually(mdFile);

      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(Notice).toHaveBeenCalledWith('Task Extractor: No tasks found in current note');
    });
  });
});