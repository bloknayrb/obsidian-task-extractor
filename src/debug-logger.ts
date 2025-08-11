/**
 * Debug logging infrastructure for the Obsidian Task Extractor plugin
 * Provides comprehensive logging capabilities with correlation tracking and memory management
 */

export interface DebugLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  category: 'file-processing' | 'llm-call' | 'task-creation' | 'service-detection' | 'validation' | 'error';
  message: string;
  correlationId?: string;
  data?: {
    filePath?: string;
    provider?: string;
    model?: string;
    tokenUsage?: number;
    requestPayload?: any;
    responseData?: any;
    error?: string;
    processingTime?: number;
    retryAttempt?: number;
    [key: string]: any;
  };
}

export interface DebugLoggerConfig {
  enabled: boolean;
  maxEntries: number;
}

export class DebugLogger {
  private logs: DebugLogEntry[] = [];
  private config: DebugLoggerConfig;
  private correlationCounter: number = 0;

  constructor(config: DebugLoggerConfig) {
    this.config = config;
  }

  /**
   * Log a debug entry with specified level, category, and optional data
   */
  log(
    level: 'info' | 'warn' | 'error',
    category: DebugLogEntry['category'],
    message: string,
    data?: DebugLogEntry['data'],
    correlationId?: string
  ): void {
    // Skip logging if debug mode is disabled for zero performance impact
    if (!this.config.enabled) {
      return;
    }

    const entry: DebugLogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      correlationId,
      data
    };

    this.logs.push(entry);

    // Perform cleanup if we exceed maxEntries
    if (this.logs.length > this.config.maxEntries) {
      this.cleanup();
    }
  }

  /**
   * Start a new operation and return a correlation ID for tracking related log entries
   */
  startOperation(
    category: DebugLogEntry['category'],
    message: string,
    data?: DebugLogEntry['data']
  ): string {
    const correlationId = `op-${++this.correlationCounter}-${Date.now()}`;
    this.log('info', category, message, data, correlationId);
    return correlationId;
  }

  /**
   * Get all current log entries
   */
  getLogs(): DebugLogEntry[] {
    return [...this.logs]; // Return a copy to prevent external modification
  }

  /**
   * Clear all log entries
   */
  clearLogs(): void {
    this.logs = [];
    this.correlationCounter = 0;
  }

  /**
   * Export logs as formatted text string
   */
  exportLogs(): string {
    if (this.logs.length === 0) {
      return 'No debug logs available.';
    }

    const lines: string[] = [];
    lines.push('=== Obsidian Task Extractor Debug Logs ===');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Total Entries: ${this.logs.length}`);
    lines.push('');

    for (const entry of this.logs) {
      const timestamp = new Date(entry.timestamp).toISOString();
      const correlationPart = entry.correlationId ? ` [${entry.correlationId}]` : '';
      
      lines.push(`[${timestamp}] ${entry.level.toUpperCase()} ${entry.category}${correlationPart}: ${entry.message}`);
      
      if (entry.data && Object.keys(entry.data).length > 0) {
        lines.push(`  Data: ${JSON.stringify(entry.data, null, 2).split('\n').join('\n  ')}`);
      }
      
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Remove old entries to maintain memory limits
   * Keeps the most recent entries up to maxEntries limit
   */
  cleanup(): void {
    if (this.logs.length > this.config.maxEntries) {
      // Keep only the most recent maxEntries
      const entriesToRemove = this.logs.length - this.config.maxEntries;
      this.logs.splice(0, entriesToRemove);
    }
  }

  /**
   * Update the logger configuration
   */
  updateConfig(config: Partial<DebugLoggerConfig>): void {
    this.config = { ...this.config, ...config };
    
    // If debug mode was disabled, clear logs to free memory
    if (!this.config.enabled) {
      this.clearLogs();
    }
    
    // If maxEntries was reduced, cleanup immediately
    if (this.logs.length > this.config.maxEntries) {
      this.cleanup();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): DebugLoggerConfig {
    return { ...this.config };
  }

  /**
   * Check if debug logging is currently enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}