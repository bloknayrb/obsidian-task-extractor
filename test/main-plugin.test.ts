import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App, TFile, Notice, Workspace } from 'obsidian';
import { TaskProcessor } from '../src/task-processor';
import { ExtractorSettings, DEFAULT_SETTINGS } from '../src/types';
import { LLMProviderManager } from '../src/llm-providers';

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

// Mock LLMProviderManager
vi.mock('../src/llm-providers', () => ({
  LLMProviderManager: vi.fn().mockImplementation(() => ({
    callLLM: vi.fn()
  }))
}));

describe('Manual Task Extraction Command Integration', () => {
  let app: App;
  let workspace: Workspace;
  let settings: ExtractorSettings;
  let llmProvider: LLMProviderManager;
  let taskProcessor: TaskProcessor;
  let mockFile: TFile;

  // Simulate the command execution logic from main.ts
  async function executeManualTaskExtraction() {
    const activeFile = workspace.getActiveFile();
    
    if (!activeFile) {
      new Notice('No active note to process');
      return;
    }
    
    if (activeFile.extension !== 'md') {
      new Notice('Active file is not a markdown note');
      return;
    }
    
    try {
      await taskProcessor.processFileManually(activeFile);
    } catch (error) {
      console.error('Manual task extraction error:', error);
      new Notice('Error extracting tasks - see console');
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock workspace
    workspace = {
      getActiveFile: vi.fn()
    } as any;
    
    // Create mock app
    app = {
      workspace,
      vault: {
        read: vi.fn().mockResolvedValue('Test content'),
        create: vi.fn().mockResolvedValue(undefined),
        getMarkdownFiles: vi.fn().mockReturnValue([]),
        getAbstractFileByPath: vi.fn().mockReturnValue(null)
      },
      fileManager: {
        processFrontMatter: vi.fn().mockImplementation((file, callback) => {
          const frontmatter = {};
          callback(frontmatter);
          return Promise.resolve();
        })
      }
    } as any;
    
    // Create mock file
    mockFile = {
      path: 'test.md',
      extension: 'md',
      name: 'test.md'
    } as TFile;

    settings = { 
      ...DEFAULT_SETTINGS,
      ownerName: 'Test User'
    };
    llmProvider = new LLMProviderManager(settings);
    taskProcessor = new TaskProcessor(app, settings, llmProvider);
  });

  describe('Command Integration Tests', () => {
    it('should successfully execute manual task extraction flow', async () => {
      vi.mocked(workspace.getActiveFile).mockReturnValue(mockFile);
      vi.mocked(llmProvider.callLLM).mockResolvedValue('{"found": false, "tasks": []}');
      
      await executeManualTaskExtraction();
      
      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(Notice).toHaveBeenCalledWith('Task Extractor: No tasks found in current note');
    });

    it('should handle no active file case', async () => {
      vi.mocked(workspace.getActiveFile).mockReturnValue(null);
      
      await executeManualTaskExtraction();
      
      expect(Notice).toHaveBeenCalledWith('No active note to process');
    });

    it('should handle non-markdown file case', async () => {
      const nonMdFile = {
        path: 'test.txt',
        extension: 'txt',
        name: 'test.txt'
      } as TFile;
      
      vi.mocked(workspace.getActiveFile).mockReturnValue(nonMdFile);
      
      await executeManualTaskExtraction();
      
      expect(Notice).toHaveBeenCalledWith('Active file is not a markdown note');
    });

    it('should handle processing errors gracefully', async () => {
      vi.mocked(workspace.getActiveFile).mockReturnValue(mockFile);
      vi.mocked(app.vault.read).mockRejectedValue(new Error('File read error'));
      
      await executeManualTaskExtraction();
      
      expect(Notice).toHaveBeenCalledWith('Task Extractor: Error extracting tasks - see console for details');
    });

    it('should process markdown files with tasks successfully', async () => {
      vi.mocked(workspace.getActiveFile).mockReturnValue(mockFile);
      vi.mocked(llmProvider.callLLM).mockResolvedValue(JSON.stringify({
        found: true,
        tasks: [
          {
            task_title: 'Test Task',
            task_details: 'Test task details',
            confidence: 'high'
          }
        ]
      }));
      
      await executeManualTaskExtraction();
      
      expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
      expect(Notice).toHaveBeenCalledWith('Task Extractor: Created 1 task note');
    });
  });

  describe('Command Validation', () => {
    it('should validate command execution requirements', async () => {
      // Test that the command would work with valid inputs
      const validFile = {
        path: 'valid.md',
        extension: 'md',
        name: 'valid.md'
      } as TFile;

      vi.mocked(workspace.getActiveFile).mockReturnValue(validFile);
      vi.mocked(llmProvider.callLLM).mockResolvedValue('{"found": false, "tasks": []}');

      await executeManualTaskExtraction();

      expect(vi.mocked(app.vault.read)).toHaveBeenCalledWith(validFile);
    });

    it('should enforce markdown file requirement', async () => {
      const invalidExtensions = ['txt', 'doc', 'pdf', ''];
      
      for (const ext of invalidExtensions) {
        vi.clearAllMocks();
        
        const invalidFile = {
          path: `test.${ext}`,
          extension: ext,
          name: `test.${ext}`
        } as TFile;
        
        vi.mocked(workspace.getActiveFile).mockReturnValue(invalidFile);
        
        await executeManualTaskExtraction();
        
        expect(Notice).toHaveBeenCalledWith('Active file is not a markdown note');
        expect(vi.mocked(app.vault.read)).not.toHaveBeenCalled();
      }
    });
  });
});