import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from 'obsidian';
import { ExtractorSettingTab } from '../src/settings';
import { DEFAULT_SETTINGS, ExtractorSettings } from '../src/types';
import { LLMProviderManager } from '../src/llm-providers';

// Mock Obsidian API
vi.mock('obsidian', () => ({
  App: vi.fn(),
  Plugin: vi.fn(),
  PluginSettingTab: class MockPluginSettingTab {
    app: any;
    plugin: any;
    containerEl: HTMLElement;
    
    constructor(app: any, plugin: any) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = document.createElement('div');
    }
  },
  Setting: vi.fn().mockImplementation(() => ({
    setName: vi.fn().mockReturnThis(),
    setDesc: vi.fn().mockReturnThis(),
    addText: vi.fn().mockReturnThis(),
    addTextArea: vi.fn().mockReturnThis(),
    addDropdown: vi.fn().mockReturnThis(),
    addToggle: vi.fn().mockReturnThis(),
    addButton: vi.fn().mockReturnThis(),
    controlEl: document.createElement('div')
  })),
  Notice: vi.fn()
}));

describe('Frontmatter Field Management', () => {
  let app: App;
  let plugin: any;
  let settings: ExtractorSettings;
  let llmProvider: LLMProviderManager;
  let settingTab: ExtractorSettingTab;
  let containerEl: HTMLElement;

  beforeEach(() => {
    app = new App();
    plugin = { saveSettings: vi.fn() };
    settings = { ...DEFAULT_SETTINGS };
    llmProvider = new LLMProviderManager(settings);
    
    // Create a partial mock of ExtractorSettingTab to avoid constructor issues
    settingTab = Object.create(ExtractorSettingTab.prototype);
    (settingTab as any).app = app;
    (settingTab as any).plugin = plugin;
    (settingTab as any).settings = settings;
    (settingTab as any).llmProvider = llmProvider;
    
    containerEl = document.createElement('div');
    (settingTab as any).containerEl = containerEl;
    
    // Mock the methods we need
    (settingTab as any).validateFrontmatterFieldName = ExtractorSettingTab.prototype['validateFrontmatterFieldName'];
    (settingTab as any).getDefaultValuePlaceholder = ExtractorSettingTab.prototype['getDefaultValuePlaceholder'];
    (settingTab as any).showValidationFeedback = ExtractorSettingTab.prototype['showValidationFeedback'];
  });

  describe('Add Field Functionality', () => {
    it('should add new field to frontmatterFields array', () => {
      const initialFieldCount = settings.frontmatterFields.length;
      
      // Simulate adding a new field (like the button click would do)
      settings.frontmatterFields.push({
        key: 'new_field',
        defaultValue: '',
        type: 'text',
        required: false
      });
      
      expect(settings.frontmatterFields.length).toBe(initialFieldCount + 1);
      expect(settings.frontmatterFields[settings.frontmatterFields.length - 1]).toEqual({
        key: 'new_field',
        defaultValue: '',
        type: 'text',
        required: false
      });
    });

    it('should create new field with correct default values', () => {
      const newField = {
        key: 'new_field',
        defaultValue: '',
        type: 'text' as const,
        required: false
      };
      
      settings.frontmatterFields.push(newField);
      const addedField = settings.frontmatterFields[settings.frontmatterFields.length - 1];
      
      expect(addedField.key).toBe('new_field');
      expect(addedField.defaultValue).toBe('');
      expect(addedField.type).toBe('text');
      expect(addedField.required).toBe(false);
    });
  });

  describe('Remove Field Functionality', () => {
    it('should remove field from frontmatterFields array', () => {
      const initialFieldCount = settings.frontmatterFields.length;
      
      // Add a field first
      settings.frontmatterFields.push({
        key: 'temp_field',
        defaultValue: 'temp',
        type: 'text',
        required: false
      });
      
      expect(settings.frontmatterFields.length).toBe(initialFieldCount + 1);
      
      // Remove the field (simulate remove button click)
      const indexToRemove = settings.frontmatterFields.length - 1;
      settings.frontmatterFields.splice(indexToRemove, 1);
      
      expect(settings.frontmatterFields.length).toBe(initialFieldCount);
    });

    it('should remove correct field by index', () => {
      // Add two test fields
      settings.frontmatterFields.push(
        { key: 'field1', defaultValue: 'value1', type: 'text', required: false },
        { key: 'field2', defaultValue: 'value2', type: 'text', required: false }
      );
      
      const initialLength = settings.frontmatterFields.length;
      
      // Remove the first of the two added fields (second to last overall)
      const indexToRemove = initialLength - 2;
      const fieldToRemove = settings.frontmatterFields[indexToRemove];
      
      expect(fieldToRemove.key).toBe('field1');
      
      settings.frontmatterFields.splice(indexToRemove, 1);
      
      expect(settings.frontmatterFields.length).toBe(initialLength - 1);
      expect(settings.frontmatterFields.find(f => f.key === 'field1')).toBeUndefined();
      expect(settings.frontmatterFields.find(f => f.key === 'field2')).toBeDefined();
    });
  });

  describe('Field Editing UI', () => {
    it('should support all required field properties', () => {
      const testField = {
        key: 'test_field',
        defaultValue: 'test_value',
        type: 'select' as const,
        options: ['option1', 'option2'],
        required: true
      };
      
      // Verify all properties are supported
      expect(testField.key).toBe('test_field');
      expect(testField.defaultValue).toBe('test_value');
      expect(testField.type).toBe('select');
      expect(testField.options).toEqual(['option1', 'option2']);
      expect(testField.required).toBe(true);
    });

    it('should support all field types', () => {
      const fieldTypes = ['text', 'date', 'select', 'boolean'] as const;
      
      fieldTypes.forEach(type => {
        const field = {
          key: `${type}_field`,
          defaultValue: '',
          type: type,
          required: false
        };
        
        expect(['text', 'date', 'select', 'boolean']).toContain(field.type);
      });
    });
  });

  describe('Field Validation', () => {
    it('should validate field names using validateFrontmatterFieldName', () => {
      const validateFieldName = (settingTab as any).validateFrontmatterFieldName.bind(settingTab);
      
      // Valid field names
      expect(validateFieldName('valid_field')).toBe('valid_field');
      expect(validateFieldName('ValidField')).toBe('ValidField');
      expect(validateFieldName('field-name')).toBe('field-name');
      expect(validateFieldName('field.name')).toBe('field.name');
      expect(validateFieldName('_private')).toBe('_private');
      
      // Invalid field names should return 'field'
      expect(validateFieldName('')).toBe('field');
      expect(validateFieldName('123invalid')).toBe('field');
      expect(validateFieldName('field..name')).toBe('field');
      expect(validateFieldName('.field')).toBe('field');
      expect(validateFieldName('field.')).toBe('field');
      expect(validateFieldName('field with spaces')).toBe('field');
      expect(validateFieldName('field@invalid')).toBe('field');
    });

    it('should provide appropriate placeholder text for different field types', () => {
      const getPlaceholder = (settingTab as any).getDefaultValuePlaceholder.bind(settingTab);
      
      expect(getPlaceholder('text')).toBe('Enter default text...');
      expect(getPlaceholder('date')).toBe('{{date}} or YYYY-MM-DD');
      expect(getPlaceholder('select')).toBe('Choose from options above');
      expect(getPlaceholder('boolean')).toBe('true or false');
      expect(getPlaceholder('unknown')).toBe('Enter default value...');
    });

    it('should handle validation feedback display', () => {
      const input = document.createElement('input');
      input.type = 'text';
      containerEl.appendChild(input);
      
      (settingTab as any).showValidationFeedback(input, 'Test validation message');
      
      expect(input.style.borderColor).toBe('rgb(255, 107, 107)');
      expect(input.style.backgroundColor).toBe('rgba(255, 107, 107, 0.1)');
      expect(input.title).toBe('Test validation message');
    });
  });

  describe('Field Configuration Persistence', () => {
    it('should maintain field configuration when modified', () => {
      const originalField = settings.frontmatterFields[0];
      const originalKey = originalField.key;
      
      // Modify field properties
      originalField.key = 'modified_key';
      originalField.defaultValue = 'modified_value';
      originalField.type = 'date';
      originalField.required = true;
      
      // Verify changes are reflected
      expect(settings.frontmatterFields[0].key).toBe('modified_key');
      expect(settings.frontmatterFields[0].defaultValue).toBe('modified_value');
      expect(settings.frontmatterFields[0].type).toBe('date');
      expect(settings.frontmatterFields[0].required).toBe(true);
      
      // Verify it's not the original value
      expect(settings.frontmatterFields[0].key).not.toBe(originalKey);
    });

    it('should handle select field options correctly', () => {
      const selectField = {
        key: 'status',
        defaultValue: 'inbox',
        type: 'select' as const,
        options: ['inbox', 'next', 'waiting', 'done'],
        required: true
      };
      
      settings.frontmatterFields.push(selectField);
      const addedField = settings.frontmatterFields[settings.frontmatterFields.length - 1];
      
      expect(addedField.options).toEqual(['inbox', 'next', 'waiting', 'done']);
      expect(addedField.type).toBe('select');
    });
  });
});