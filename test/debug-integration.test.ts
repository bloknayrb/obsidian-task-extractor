import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskProcessor } from '../src/task-processor';
import { DebugLogger } from '../src/debug-logger';
import { ExtractorSettings } from '../src/types';
import { LLMProviderManager } from '../src/llm-providers';

// Mock Obsidian API
const mockApp = {
  vault: {
    getMarkdownFiles: vi.fn(() => []),
    read: vi.fn(),
    create: vi.fn(),
    modify: vi.fn(),
    getAbstractFileByPath: vi.fn()
  },
  metadataCache: {
    getFileCache: vi.fn()
  },
  fileManager: {
    processFrontMatter: vi.fn()
  }
} as any;

const mockFile = {
  path: 'test-note.md',
  extension: 'md'
} as any;

describe('TaskProcessor Debug Integration', () => {
  let taskProcessor: TaskProcessor;
  let debugLogger: DebugLogger;
  let mockLLMProvider: LLMProviderManager;
  let settings: ExtractorSettings;

  beforeEach(() => {
    // Create debug logger
    debugLogger = new DebugLogger({ enabled: true, maxEntries: 100 });
    
    // Mock LLM provider
    mockLLMProvider = {
      callLLM: vi.fn()
    } as any;

    // Default settings
    settings = {
      triggerTypes: ['Email', 'Meeting Note'],
      triggerFrontmatterField: 'Type',
      ownerName: 'Test User',
      tasksFolder: 'Tasks',
      processedFrontmatterKey: 'taskExtractor.processed',
      frontmatterFields: [],
      linkBack: true
    } as ExtractorSettings;

    // Create task processor with debug logger
    taskProcessor = new TaskProcessor(mockApp, settings, mockLLMProvider, debugLogger);
  });

  it('should log file processing events when debug is enabled', async () => {
    // Setup mocks
    mockApp.metadataCache.getFileCache.mockReturnValue({
      frontmatter: { Type: 'Email' }
    });
    mockApp.vault.read.mockResolvedValue('Test email content');
    mockLLMProvider.callLLM.mockResolvedValue('{"found": false}');

    // Clear any existing logs
    debugLogger.clearLogs();

    // Process file
    await taskProcessor.onFileChanged(mockFile);

    // Check that debug logs were created
    const logs = debugLogger.getLogs();
    expect(logs.length).toBeGreaterThan(0);

    // Check for specific log entries
    const fileProcessingLogs = logs.filter(log => log.category === 'file-processing');
    expect(fileProcessingLogs.length).toBeGreaterThan(0);

    // Check for operation start log
    const startLog = logs.find(log => log.message === 'Processing file');
    expect(startLog).toBeDefined();
    expect(startLog?.correlationId).toBeDefined();
  });

  it('should not log when debug is disabled', async () => {
    // Disable debug logging
    debugLogger.updateConfig({ enabled: false });

    // Setup mocks
    mockApp.metadataCache.getFileCache.mockReturnValue({
      frontmatter: { Type: 'Email' }
    });
    mockApp.vault.read.mockResolvedValue('Test email content');
    mockLLMProvider.callLLM.mockResolvedValue('{"found": false}');

    // Clear any existing logs
    debugLogger.clearLogs();

    // Process file
    await taskProcessor.onFileChanged(mockFile);

    // Check that no debug logs were created
    const logs = debugLogger.getLogs();
    expect(logs.length).toBe(0);
  });

  it('should log file filtering decisions', async () => {
    // Setup mock for non-matching type
    mockApp.metadataCache.getFileCache.mockReturnValue({
      frontmatter: { Type: 'Note' } // Not in triggerTypes
    });

    // Clear any existing logs
    debugLogger.clearLogs();

    // Process file
    await taskProcessor.onFileChanged(mockFile);

    // Check for filtering log
    const logs = debugLogger.getLogs();
    const filterLog = logs.find(log => 
      log.message === 'File skipped: trigger type not matched'
    );
    expect(filterLog).toBeDefined();
    expect(filterLog?.data?.typeFound).toBe('note');
    expect(filterLog?.data?.acceptedTypes).toEqual(['email', 'meeting note']);
  });

  it('should log LLM call events', async () => {
    // Setup mocks for successful processing
    mockApp.metadataCache.getFileCache.mockReturnValue({
      frontmatter: { Type: 'Email' }
    });
    mockApp.vault.read.mockResolvedValue('Test email content');
    mockLLMProvider.callLLM.mockResolvedValue('{"found": true, "task_title": "Test Task", "task_details": "Test details"}');
    mockApp.vault.create.mockResolvedValue(undefined);

    // Clear any existing logs
    debugLogger.clearLogs();

    // Process file
    await taskProcessor.onFileChanged(mockFile);

    // Check for LLM call logs
    const logs = debugLogger.getLogs();
    const llmLogs = logs.filter(log => log.category === 'llm-call');
    expect(llmLogs.length).toBeGreaterThan(0);

    // Check for prompt construction log
    const promptLog = logs.find(log => 
      log.message === 'LLM prompt constructed for task extraction'
    );
    expect(promptLog).toBeDefined();

    // Check for response log
    const responseLog = logs.find(log => 
      log.message === 'LLM response received for task extraction'
    );
    expect(responseLog).toBeDefined();
  });

  it('should use correlation IDs to track related operations', async () => {
    // Setup mocks for successful processing
    mockApp.metadataCache.getFileCache.mockReturnValue({
      frontmatter: { Type: 'Email' }
    });
    mockApp.vault.read.mockResolvedValue('Test email content');
    mockLLMProvider.callLLM.mockResolvedValue('{"found": true, "task_title": "Test Task", "task_details": "Test details"}');
    mockApp.vault.create.mockResolvedValue(undefined);

    // Clear any existing logs
    debugLogger.clearLogs();

    // Process file
    await taskProcessor.onFileChanged(mockFile);

    // Check that related operations share correlation IDs
    const logs = debugLogger.getLogs();
    const startLog = logs.find(log => log.message === 'Processing file');
    expect(startLog?.correlationId).toBeDefined();

    const correlationId = startLog!.correlationId;
    const relatedLogs = logs.filter(log => log.correlationId === correlationId);
    expect(relatedLogs.length).toBeGreaterThan(1);
  });
});