import { describe, it, expect } from 'vitest';
import { validateSettings, DEFAULT_SETTINGS, ExtractorSettings } from '../src/types';

describe('Types - Settings Validation', () => {
  describe('frontmatter field configuration', () => {
    it('should save and load triggerFrontmatterField correctly', () => {
      const customSettings: Partial<ExtractorSettings> = {
        triggerFrontmatterField: 'Category'
      };
      
      const validated = validateSettings(customSettings);
      
      expect(validated.triggerFrontmatterField).toBe('Category');
    });

    it('should default to "Type" for backward compatibility', () => {
      const emptySettings: Partial<ExtractorSettings> = {};
      
      const validated = validateSettings(emptySettings);
      
      expect(validated.triggerFrontmatterField).toBe('Type');
    });

    it('should validate YAML key format', () => {
      const invalidSettings: Partial<ExtractorSettings> = {
        triggerFrontmatterField: '123invalid'
      };
      
      const validated = validateSettings(invalidSettings);
      
      expect(validated.triggerFrontmatterField).toBe('Type'); // Should fallback to default
    });

    it('should accept valid YAML keys with underscores and hyphens', () => {
      const validSettings: Partial<ExtractorSettings> = {
        triggerFrontmatterField: 'note_type-v2'
      };
      
      const validated = validateSettings(validSettings);
      
      expect(validated.triggerFrontmatterField).toBe('note_type-v2');
    });

    it('should reject keys with problematic dot patterns', () => {
      const invalidSettings: Partial<ExtractorSettings> = {
        triggerFrontmatterField: 'field..name'
      };
      
      const validated = validateSettings(invalidSettings);
      
      expect(validated.triggerFrontmatterField).toBe('Type');
    });

    it('should reject empty or whitespace-only field names', () => {
      const emptySettings: Partial<ExtractorSettings> = {
        triggerFrontmatterField: '   '
      };
      
      const validated = validateSettings(emptySettings);
      
      expect(validated.triggerFrontmatterField).toBe('Type');
    });
  });

  describe('numeric input validation', () => {
    it('should validate maxTokens within bounds', () => {
      const settings: Partial<ExtractorSettings> = {
        maxTokens: 1500
      };
      
      const validated = validateSettings(settings);
      
      expect(validated.maxTokens).toBe(1500);
    });

    it('should clamp maxTokens to minimum bound', () => {
      const settings: Partial<ExtractorSettings> = {
        maxTokens: 50
      };
      
      const validated = validateSettings(settings);
      
      expect(validated.maxTokens).toBe(100); // Should be clamped to minimum
    });

    it('should clamp maxTokens to maximum bound', () => {
      const settings: Partial<ExtractorSettings> = {
        maxTokens: 5000
      };
      
      const validated = validateSettings(settings);
      
      expect(validated.maxTokens).toBe(2000); // Should be clamped to maximum
    });

    it('should validate temperature within bounds', () => {
      const settings: Partial<ExtractorSettings> = {
        temperature: 0.7
      };
      
      const validated = validateSettings(settings);
      
      expect(validated.temperature).toBe(0.7);
    });

    it('should clamp temperature to bounds', () => {
      const lowSettings: Partial<ExtractorSettings> = {
        temperature: -0.5
      };
      const highSettings: Partial<ExtractorSettings> = {
        temperature: 2.0
      };
      
      const validatedLow = validateSettings(lowSettings);
      const validatedHigh = validateSettings(highSettings);
      
      expect(validatedLow.temperature).toBe(0);
      expect(validatedHigh.temperature).toBe(1);
    });

    it('should handle NaN values gracefully', () => {
      const settings: Partial<ExtractorSettings> = {
        maxTokens: NaN,
        temperature: NaN
      };
      
      const validated = validateSettings(settings);
      
      expect(validated.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
      expect(validated.temperature).toBe(DEFAULT_SETTINGS.temperature);
    });
  });

  describe('defaultTaskType validation', () => {
    it('should validate and trim defaultTaskType', () => {
      const settings: Partial<ExtractorSettings> = {
        defaultTaskType: '  Custom Task  '
      };
      
      const validated = validateSettings(settings);
      
      expect(validated.defaultTaskType).toBe('Custom Task');
    });

    it('should use default value when defaultTaskType is empty', () => {
      const settings: Partial<ExtractorSettings> = {
        defaultTaskType: '   '
      };
      
      const validated = validateSettings(settings);
      
      expect(validated.defaultTaskType).toBe('Task');
    });

    it('should use default value when defaultTaskType is not provided', () => {
      const settings: Partial<ExtractorSettings> = {};
      
      const validated = validateSettings(settings);
      
      expect(validated.defaultTaskType).toBe('Task');
    });
  });

  describe('backward compatibility', () => {
    it('should preserve existing configurations', () => {
      const existingSettings: Partial<ExtractorSettings> = {
        provider: 'openai',
        apiKey: 'sk-test123',
        model: 'gpt-4',
        ownerName: 'Test User',
        tasksFolder: 'MyTasks'
      };
      
      const validated = validateSettings(existingSettings);
      
      expect(validated.provider).toBe('openai');
      expect(validated.apiKey).toBe('sk-test123');
      expect(validated.model).toBe('gpt-4');
      expect(validated.ownerName).toBe('Test User');
      expect(validated.tasksFolder).toBe('MyTasks');
      expect(validated.triggerFrontmatterField).toBe('Type'); // Should default
      expect(validated.defaultTaskType).toBe('Task'); // Should default
    });
  });
});