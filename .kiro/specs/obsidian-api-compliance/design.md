# Design Document: Obsidian API Compliance Improvements

## Overview

Simple, focused improvements to use Obsidian's recommended APIs. Two small changes, zero breaking changes, maintain all current performance.

## Architecture

**No architecture changes.** Just swap two implementation details:

1. **Frontmatter**: Use `FileManager.processFrontMatter` instead of regex
2. **Network**: Use `requestUrl` instead of `fetch`

## Components and Interfaces

### 1. Frontmatter Processing (src/task-processor.ts)

**Replace this:**
```typescript
// Current: Manual regex parsing
const content = await this.app.vault.read(file);
const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
// ... manual modification
```

**With this:**
```typescript
// New: Official API
await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
  const keys = this.settings.processedFrontmatterKey.split('.');
  let current = frontmatter;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = true;
});
```

### 2. Network Requests (src/llm-providers.ts)

**Replace this:**
```typescript
// Current: Standard fetch
const resp = await fetch(endpoint, { method: 'POST', headers, body });
```

**With this:**
```typescript
// New: Obsidian API
import { requestUrl } from 'obsidian';
const resp = await requestUrl({ url: endpoint, method: 'POST', headers, body });
```

## Data Models

**No changes.** All existing interfaces, settings, and types remain identical.

## Error Handling

**Keep existing error handling.** If new APIs fail, log warning and continue.

## Testing Strategy

1. Test frontmatter processing with nested keys
2. Test all LLM providers still work
3. Verify performance unchanged
4. Confirm zero user-visible changes