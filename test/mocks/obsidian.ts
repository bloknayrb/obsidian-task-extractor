// Mock Obsidian API for testing
import { vi } from 'vitest';

export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;

  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.basename = this.name.split('.')[0];
    this.extension = this.name.split('.').pop() || '';
  }
}

export class Vault {
  read = vi.fn();
  create = vi.fn();
  modify = vi.fn();
  getFiles = vi.fn();
  getMarkdownFiles = vi.fn();
}

export class App {
  vault = new Vault();
  workspace = {
    on: vi.fn(),
    off: vi.fn(),
  };
}

export class Plugin {
  app: App;
  manifest: any;

  constructor(app: App, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  loadData = vi.fn();
  saveData = vi.fn();
  addSettingTab = vi.fn();
  registerEvent = vi.fn();
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }

  display = vi.fn();
  hide = vi.fn();
}

export class Setting {
  settingEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
    this.controlEl = document.createElement('div');
    this.controlEl.createDiv = (options?: any) => {
      const div = document.createElement('div');
      if (options?.cls) {
        div.className = options.cls;
      }
      return div;
    };
    this.controlEl.createEl = (tag: string, options?: any) => {
      const el = document.createElement(tag);
      if (options?.cls) {
        el.className = options.cls;
      }
      if (options?.type) {
        (el as any).type = options.type;
      }
      return el;
    };
    containerEl.appendChild(this.settingEl);
  }

  setName = vi.fn().mockReturnThis();
  setDesc = vi.fn().mockReturnThis();
  addText = vi.fn().mockReturnThis();
  addSlider = vi.fn().mockReturnThis();
  addToggle = vi.fn().mockReturnThis();
  addDropdown = vi.fn().mockReturnThis();
  addTextArea = vi.fn().mockReturnThis();
  setClass = vi.fn().mockReturnThis();
}

export const parseYaml = vi.fn();
export const stringifyYaml = vi.fn();
export const debounce = vi.fn((fn: Function, delay: number) => fn);
export const normalizePath = vi.fn((path: string) => path);
export const Notice = vi.fn();
export const requestUrl = vi.fn();
export const moment = vi.fn(() => ({
  format: vi.fn(() => '2024-01-01'),
}));