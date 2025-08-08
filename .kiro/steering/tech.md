# Technology Stack

## Build System
- **TypeScript**: Primary language (ES2018 target for getter support)
- **esbuild**: Fast bundler with watch mode for development
- **npm**: Package manager and script runner

## Framework & Runtime
- **Obsidian Plugin API**: Core framework for vault integration
- **Node.js**: Development environment (v16+)
- **Electron**: Runtime environment (via Obsidian)

## Key Dependencies
- **obsidian**: Plugin API and types
- **typescript**: Type checking and compilation
- **esbuild**: Bundling and build optimization
- **builtin-modules**: Node.js built-in module handling

## Common Commands

### Development
```bash
# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build with type checking
npm run build

# Version bump (updates manifest.json and versions.json)
npm version patch|minor|major
```

### Build Process
- TypeScript compilation with `tsc -noEmit -skipLibCheck` for type checking
- esbuild bundles `main.ts` + `src/**/*` → `main.js` with external Obsidian APIs
- Development builds include inline source maps
- Production builds are optimized with tree shaking
- Modular source files automatically included via tsconfig.json

## Optimized Architecture Patterns
- **Modular Design**: Separated concerns across focused modules
- **Plugin Orchestration**: Main class delegates to specialized components
- **Performance Optimization**: Debouncing, caching, and batch processing
- **Backward Compatibility**: Existing APIs preserved through delegation

### Core Components
- **LLMProviderManager**: On-demand service detection, unified provider interface
- **TaskProcessor**: Debounced file processing, batch operations for large vaults
- **Settings Management**: Debounced saves, optimized UI responsiveness

### Performance Features
- **Lazy Loading**: Services detected only when needed (83% less background CPU)
- **Debounced Operations**: File processing (2s) and settings saves (500ms)
- **Batch Processing**: Handle large vaults without UI blocking
- **Efficient Caching**: 30-minute TTL for service detection, proper cleanup

### Development Benefits
- **Focused Modules**: Each file has single responsibility
- **Easy Testing**: Components can be tested independently  
- **Maintainable**: Clear separation makes debugging and features easier
- **Type Safety**: Strong typing across all modules with shared types