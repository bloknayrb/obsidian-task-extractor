# Technology Stack

## Build System
- **TypeScript**: Primary language (ES6 target)
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
- esbuild bundles `main.ts` → `main.js` with external Obsidian APIs
- Development builds include inline source maps
- Production builds are optimized with tree shaking

## Architecture Patterns
- **Plugin Class**: Single main class extending Obsidian's `Plugin`
- **Settings Interface**: Strongly typed configuration with defaults
- **Event-Driven**: Uses Obsidian's event system for file monitoring
- **Service Pattern**: LLM providers abstracted behind unified interface
- **Caching**: Service detection and model availability cached for performance