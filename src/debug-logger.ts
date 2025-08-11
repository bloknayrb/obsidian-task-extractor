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
  errorContext?: ErrorContext;
}

export interface ErrorContext {
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
  originalError?: any;
  additionalData?: any;
}

export interface ValidationContext {
  validationType: 'settings' | 'frontmatter' | 'field' | 'api';
  fieldName: string;
  providedValue: any;
  expectedFormat: string;
  errorReason: string;
}

export interface DebugLoggerConfig {
  enabled: boolean;
  maxEntries: number;
}

export class DebugLogger {
  private logs: DebugLogEntry[] = [];
  private config: DebugLoggerConfig;
  private correlationCounter: number = 0;
  private logFailureCount: number = 0;
  private readonly maxLogFailures: number = 5;
  
  // Performance optimization fields
  private entryPool: DebugLogEntry[] = [];
  private readonly maxPoolSize: number = 100;
  private lastCleanupTime: number = 0;
  private readonly cleanupInterval: number = 30000; // 30 seconds
  private logCount: number = 0;
  private totalLogTime: number = 0;

  constructor(config: DebugLoggerConfig) {
    this.config = config;
  }

  /**
   * Log a debug entry with specified level, category, and optional data
   * Optimized with object pooling and memory management
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

    this.safeLog(() => {
      const startTime = performance.now();
      
      // Use object pooling to reduce GC pressure
      const entry = this.getPooledEntry();
      entry.timestamp = Date.now();
      entry.level = level;
      entry.category = category;
      entry.message = message;
      entry.correlationId = correlationId;
      entry.data = data ? this.cloneData(data) : undefined;
      entry.errorContext = undefined; // Clear any previous error context

      this.logs.push(entry);
      
      // Performance tracking
      this.logCount++;
      this.totalLogTime += performance.now() - startTime;

      // Perform memory management with automatic rotation
      this.performMemoryManagement();
    });
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
   * Clear all log entries and return them to pool
   */
  clearLogs(): void {
    // Return entries to pool before clearing
    this.returnEntriesToPool(this.logs);
    this.logs = [];
    this.correlationCounter = 0;
  }

  /**
   * Export logs as formatted text string with optimized serialization
   */
  exportLogs(): string {
    if (this.logs.length === 0) {
      return 'No debug logs available.';
    }

    // Use a more efficient string building approach
    const parts: string[] = [];
    parts.push('=== Obsidian Task Extractor Debug Logs ===\n');
    parts.push(`Generated: ${new Date().toISOString()}\n`);
    parts.push(`Total Entries: ${this.logs.length}\n`);
    parts.push('');

    // Pre-allocate with estimated capacity to reduce array resizing
    const lines: string[] = new Array(this.logs.length * 3);
    let lineIndex = 0;

    for (const entry of this.logs) {
      const timestamp = new Date(entry.timestamp).toISOString();
      const correlationPart = entry.correlationId ? ` [${entry.correlationId}]` : '';
      
      lines[lineIndex++] = `[${timestamp}] ${entry.level.toUpperCase()} ${entry.category}${correlationPart}: ${entry.message}`;
      
      if (entry.data && Object.keys(entry.data).length > 0) {
        try {
          // Use optimized serialization for performance
          const serializedData = this.optimizedStringify(entry.data);
          lines[lineIndex++] = `  Data: ${serializedData.split('\n').join('\n  ')}`;
        } catch (error) {
          lines[lineIndex++] = '  Data: [Serialization Error]';
        }
      }
      
      lines[lineIndex++] = '';
    }

    // Trim the array to actual size
    lines.length = lineIndex;
    parts.push(lines.join('\n'));

    return parts.join('\n');
  }

  /**
   * Remove old entries to maintain memory limits with automatic rotation
   * Keeps the most recent entries up to maxEntries limit
   */
  cleanup(): void {
    if (this.logs.length > this.config.maxEntries) {
      // Keep only the most recent maxEntries
      const entriesToRemove = this.logs.length - this.config.maxEntries;
      const removedEntries = this.logs.splice(0, entriesToRemove);
      
      // Return removed entries to pool
      this.returnEntriesToPool(removedEntries);
    }
  }

  /**
   * Update the logger configuration with performance optimizations
   */
  updateConfig(config: Partial<DebugLoggerConfig>): void {
    this.config = { ...this.config, ...config };
    
    // If debug mode was disabled, clear logs to free memory
    if (!this.config.enabled) {
      this.clearLogs();
      // Also clear the pool to free memory
      this.entryPool = [];
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

  /**
   * Log an error with detailed context including stack trace
   * Optimized with object pooling
   */
  logError(
    message: string,
    error: Error | unknown,
    category: DebugLogEntry['category'] = 'error',
    additionalData?: any,
    correlationId?: string
  ): void {
    if (!this.config.enabled) {
      return;
    }

    this.safeLog(() => {
      const startTime = performance.now();
      const errorContext = this.extractErrorContext(error, additionalData);
      
      const entry = this.getPooledEntry();
      entry.timestamp = Date.now();
      entry.level = 'error';
      entry.category = category;
      entry.message = message;
      entry.data = additionalData ? this.cloneData(additionalData) : undefined;
      entry.correlationId = correlationId;
      entry.errorContext = errorContext;

      this.logs.push(entry);
      
      // Performance tracking
      this.logCount++;
      this.totalLogTime += performance.now() - startTime;

      // Perform memory management
      this.performMemoryManagement();
    });
  }

  /**
   * Log validation errors with detailed field and value context
   * Optimized with object pooling
   */
  logValidation(
    validationType: 'settings' | 'frontmatter' | 'field' | 'api',
    fieldName: string,
    providedValue: any,
    expectedFormat: string,
    errorReason: string,
    correlationId?: string
  ): void {
    if (!this.config.enabled) {
      return;
    }

    this.safeLog(() => {
      const startTime = performance.now();
      const validationContext: ValidationContext = {
        validationType,
        fieldName,
        providedValue: this.sanitizeValue(providedValue),
        expectedFormat,
        errorReason
      };

      const entry = this.getPooledEntry();
      entry.timestamp = Date.now();
      entry.level = 'warn';
      entry.category = 'validation';
      entry.message = `Validation failed for ${validationType}.${fieldName}: ${errorReason}`;
      entry.data = validationContext;
      entry.correlationId = correlationId;
      entry.errorContext = undefined;

      this.logs.push(entry);
      
      // Performance tracking
      this.logCount++;
      this.totalLogTime += performance.now() - startTime;

      // Perform memory management
      this.performMemoryManagement();
    });
  }

  /**
   * Log successful validation for debugging purposes
   */
  logValidationSuccess(
    validationType: 'settings' | 'frontmatter' | 'field' | 'api',
    fieldName: string,
    correlationId?: string
  ): void {
    if (!this.config.enabled) {
      return;
    }

    this.safeLog(() => {
      this.log('info', 'validation', 
        `Validation passed for ${validationType}.${fieldName}`, 
        { validationType, fieldName }, 
        correlationId
      );
    });
  }

  /**
   * Safely execute logging with graceful degradation
   */
  private safeLog(logOperation: () => void): void {
    try {
      logOperation();
      // Reset failure count on successful log
      this.logFailureCount = 0;
    } catch (error) {
      this.handleLoggingFailure(error);
    }
  }

  /**
   * Handle logging failures with graceful degradation
   */
  private handleLoggingFailure(error: unknown): void {
    this.logFailureCount++;
    
    // If we've exceeded max failures, disable logging to prevent infinite loops
    if (this.logFailureCount >= this.maxLogFailures) {
      this.config.enabled = false;
      console.warn('DebugLogger: Disabled after repeated failures. Last error:', error);
      return;
    }

    // Fall back to console warning for critical logging failures
    console.warn('DebugLogger: Logging operation failed:', error);
  }

  /**
   * Extract comprehensive error context from error objects
   */
  private extractErrorContext(error: Error | unknown, additionalData?: any): ErrorContext {
    const context: ErrorContext = {
      additionalData
    };

    if (error instanceof Error) {
      context.errorName = error.name;
      context.errorMessage = error.message;
      context.errorStack = error.stack;
    } else if (error && typeof error === 'object') {
      try {
        context.originalError = JSON.stringify(error);
      } catch {
        context.originalError = String(error);
      }
    } else {
      context.originalError = String(error);
    }

    return context;
  }

  /**
   * Sanitize values to prevent logging sensitive information
   */
  private sanitizeValue(value: any): any {
    if (typeof value === 'string') {
      // Sanitize potential API keys or tokens (show only first/last 4 chars)
      if (value.length > 10 && /^[a-zA-Z0-9_-]+$/.test(value)) {
        return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
      }
    }
    
    if (value && typeof value === 'object') {
      const sanitized = { ...value };
      // Sanitize common sensitive field names
      const sensitiveFields = ['apiKey', 'token', 'password', 'secret', 'key'];
      for (const field of sensitiveFields) {
        if (field in sanitized) {
          sanitized[field] = '[REDACTED]';
        }
      }
      return sanitized;
    }

    return value;
  }

  /**
   * Get a pooled entry or create a new one to reduce GC pressure
   */
  private getPooledEntry(): DebugLogEntry {
    if (this.entryPool.length > 0) {
      return this.entryPool.pop()!;
    }
    
    // Create new entry if pool is empty
    return {
      timestamp: 0,
      level: 'info',
      category: 'file-processing',
      message: '',
      correlationId: undefined,
      data: undefined,
      errorContext: undefined
    };
  }

  /**
   * Return entries to the pool for reuse
   */
  private returnEntriesToPool(entries: DebugLogEntry[]): void {
    for (const entry of entries) {
      // Clear references to prevent memory leaks
      entry.data = undefined;
      entry.errorContext = undefined;
      entry.correlationId = undefined;
      entry.message = '';
      
      // Only pool if we haven't exceeded max pool size
      if (this.entryPool.length < this.maxPoolSize) {
        this.entryPool.push(entry);
      }
    }
  }

  /**
   * Optimized memory management with automatic rotation
   */
  private performMemoryManagement(): void {
    const now = Date.now();
    
    // Perform cleanup if we exceed maxEntries
    if (this.logs.length > this.config.maxEntries) {
      this.cleanup();
    }
    
    // Perform periodic cleanup to prevent memory bloat
    if (now - this.lastCleanupTime > this.cleanupInterval) {
      this.periodicCleanup();
      this.lastCleanupTime = now;
    }
  }

  /**
   * Periodic cleanup to manage memory and pool size
   */
  private periodicCleanup(): void {
    // Trim pool if it's grown too large
    if (this.entryPool.length > this.maxPoolSize) {
      this.entryPool.length = this.maxPoolSize;
    }
    
    // Force cleanup if we're approaching memory limits
    const memoryThreshold = this.config.maxEntries * 0.8;
    if (this.logs.length > memoryThreshold) {
      const entriesToRemove = Math.floor(this.config.maxEntries * 0.2);
      const removedEntries = this.logs.splice(0, entriesToRemove);
      this.returnEntriesToPool(removedEntries);
    }
  }

  /**
   * Optimized deep clone for data to prevent reference leaks
   */
  private cloneData(data: any): any {
    if (data === null || typeof data !== 'object') {
      return data;
    }
    
    if (data instanceof Date) {
      return new Date(data.getTime());
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.cloneData(item));
    }
    
    // For objects, create a shallow clone and recursively clone nested objects
    const cloned: any = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        cloned[key] = this.cloneData(data[key]);
      }
    }
    
    return cloned;
  }

  /**
   * Get performance metrics for the debug logger
   */
  getPerformanceMetrics(): {
    totalLogs: number;
    averageLogTime: number;
    poolSize: number;
    maxPoolSize: number;
    memoryUsage: {
      currentLogs: number;
      maxLogs: number;
      utilizationPercent: number;
    };
  } {
    return {
      totalLogs: this.logCount,
      averageLogTime: this.logCount > 0 ? this.totalLogTime / this.logCount : 0,
      poolSize: this.entryPool.length,
      maxPoolSize: this.maxPoolSize,
      memoryUsage: {
        currentLogs: this.logs.length,
        maxLogs: this.config.maxEntries,
        utilizationPercent: (this.logs.length / this.config.maxEntries) * 100
      }
    };
  }

  /**
   * Force a memory cleanup and optimization
   */
  optimizeMemory(): void {
    // Perform aggressive cleanup
    this.periodicCleanup();
    
    // Compact the logs array if needed
    if (this.logs.length < this.config.maxEntries * 0.5) {
      // Create a new array to reduce memory fragmentation
      this.logs = [...this.logs];
    }
    
    // Trim pool to optimal size
    const optimalPoolSize = Math.min(this.maxPoolSize, Math.ceil(this.config.maxEntries * 0.1));
    if (this.entryPool.length > optimalPoolSize) {
      this.entryPool.length = optimalPoolSize;
    }
  }

  /**
   * Optimized JSON stringification with size limits to prevent memory issues
   */
  private optimizedStringify(obj: any, maxDepth: number = 5, currentDepth: number = 0): string {
    // Prevent infinite recursion and excessive memory usage
    if (currentDepth >= maxDepth) {
      return '[Max Depth Reached]';
    }
    
    // Handle primitive types quickly
    if (obj === null || obj === undefined) {
      return String(obj);
    }
    
    if (typeof obj !== 'object') {
      return typeof obj === 'string' ? `"${obj}"` : String(obj);
    }
    
    // Handle circular references and large objects
    const seen = new WeakSet();
    
    try {
      return JSON.stringify(obj, (key, value) => {
        // Handle circular references
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }
        
        // Limit string length to prevent memory bloat
        if (typeof value === 'string' && value.length > 1000) {
          return value.substring(0, 1000) + '... [Truncated]';
        }
        
        return value;
      }, 2);
    } catch (error) {
      return '[Serialization Failed]';
    }
  }
}