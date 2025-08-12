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

describe('Manual Command User Feedback Notices', () => {
  let app: App;
  let settings: ExtractorSettings;
  let llmProvider: LLMProviderManager;
  let taskProcessor: TaskProcessor;
  let mockFile: TFile;

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

    // Create mock file
    mockFile = {
      path: 'test.md',
      extension: 'md',
      name: 'test.md'
    } as TFile;
  });

  it('should show "Extracting tasks from current note..." notice when processing starts', async () => {
    // Mock LLM to return no tasks
    vi.mocked(llmProvider.callLLM).mockResolvedValue('{"found": false, "tasks": []}');

    await taskProcessor.processFileManually(mockFile);

    expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
  });

  it('should show success notice with task count when tasks are created', async () => {
    // Mock LLM to return tasks
    vi.mocked(llmProvider.callLLM).mockResolvedValue(JSON.stringify({
      found: true,
      tasks: [
        {
          task_title: 'Test Task 1',
          task_details: 'Details for task 1',
          confidence: 'high'
        },
        {
          task_title: 'Test Task 2', 
          task_details: 'Details for task 2',
          confidence: 'medium'
        }
      ]
    }));

    await taskProcessor.processFileManually(mockFile);

    expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
    expect(Notice).toHaveBeenCalledWith('Task Extractor: Created 2 task notes');
  });

  it('should show "No tasks found" notice when no tasks are extracted', async () => {
    // Mock LLM to return no tasks
    vi.mocked(llmProvider.callLLM).mockResolvedValue('{"found": false, "tasks": []}');

    await taskProcessor.processFileManually(mockFile);

    expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
    expect(Notice).toHaveBeenCalledWith('Task Extractor: No tasks found in current note');
  });

  it('should show error notice when owner name is not configured', async () => {
    // Set owner name to empty
    settings.ownerName = '';

    await taskProcessor.processFileManually(mockFile);

    expect(Notice).toHaveBeenCalledWith('Task Extractor: Owner name not configured in plugin settings');
  });

  it('should show error notice for non-markdown files', async () => {
    const nonMdFile = {
      path: 'test.txt',
      extension: 'txt',
      name: 'test.txt'
    } as TFile;

    await taskProcessor.processFileManually(nonMdFile);

    expect(Notice).toHaveBeenCalledWith('Task Extractor: Active file is not a markdown note');
  });

  it('should show error notice when file is null', async () => {
    await taskProcessor.processFileManually(null as any);

    expect(Notice).toHaveBeenCalledWith('Task Extractor: No active note to process');
  });

  it('should show "No tasks found" notice when LLM processing fails', async () => {
    // Mock LLM to throw error - this gets caught internally and returns no tasks
    vi.mocked(llmProvider.callLLM).mockRejectedValue(new Error('LLM Error'));

    await taskProcessor.processFileManually(mockFile);

    expect(Notice).toHaveBeenCalledWith('Extracting tasks from current note...');
    expect(Notice).toHaveBeenCalledWith('Task Extractor: No tasks found in current note');
  });
});