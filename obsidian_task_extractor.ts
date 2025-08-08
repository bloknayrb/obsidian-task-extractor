/*
Obsidian Plugin: Task Extractor for Emails & Meeting Notes
Filename: obsidian-task-extractor.ts
Type: code/typescript (single-file plugin entry for quick testing)

This file is intended as a single-file starting implementation you can place into an Obsidian plugin project.

--- Minimal manifest.json (put in same plugin folder) ---
{
  "id": "task-extractor",
  "name": "Task Extractor (Email & Meeting Notes)",
  "version": "0.1.0",
  "minAppVersion": "0.13.0",
  "description": "Scans incoming Email/Meeting note files and creates TaskNotes-compatible task notes when an LLM detects a task for Bryan Kolb.",
  "author": "Bryan",
  "authorUrl": "",
  "isDesktopOnly": false
}

--- Build / install notes ---
1. Create standard Obsidian plugin project (obsidian sample plugin) and replace src/main.ts with this file.
2. Add manifest.json above, plugin.css if needed.
3. Build using your normal pipeline (esbuild/rollup). For quick local testing you may also use the sample plugin dev setup.
4. Put the built plugin folder into .obsidian/plugins/task-extractor and enable in Obsidian.

--- What this plugin does ---
- Watches notes that have frontmatter Type set to one of: "Email", "MeetingNote", "Meeting Note", "Meeting Notes" (case-insensitive).
- Sends the note text (frontmatter + body) to a configured LLM provider (OpenAI or Anthropic).
- Asks the LLM to decide if there's an explicit or implied task *for Bryan Kolb*.
- If a task is found, creates a new note compatible with the Task Notes plugin frontmatter format.
- Marks the original note with `taskExtractor.processed: true` to avoid duplicate processing.

--- Settings ---
- Provider: openai | anthropic
- API key
- Model
- Tasks folder
- Link-back -> whether to include a [[source]] link in generated task note
- Auto-mark-processed -> add a flag in the original frontmatter

*/

import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

interface ExtractorSettings {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model: string;
  tasksFolder: string;
  linkBack: boolean;
  processedFrontmatterKey: string; // default: taskExtractor.processed
  ownerName: string; // "Bryan Kolb"
  processOnUpdate: boolean; // whether to process edits as well as creation
}

const DEFAULT_SETTINGS: ExtractorSettings = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o-mini',
  tasksFolder: 'Tasks',
  linkBack: true,
  processedFrontmatterKey: 'taskExtractor.processed',
  ownerName: 'Bryan Kolb',
  processOnUpdate: false,
};

export default class TaskExtractorPlugin extends Plugin {
  settings: ExtractorSettings;
  processingFiles: Set<string> = new Set();

  async onload() {
    console.log('Loading Task Extractor plugin...');
    await this.loadSettings();

    // Register settings tab
    this.addSettingTab(new ExtractorSettingTab(this.app, this));

    // Hook into metadata changes (file created/updated)
    this.registerEvent(
      this.app.vault.on('create', (file) => this.onFileChanged(file))
    );

    if (this.settings.processOnUpdate) {
      this.registerEvent(
        this.app.vault.on('modify', (file) => this.onFileChanged(file))
      );
    }

    // Also scan existing unprocessed files once on load (non-blocking)
    this.scanExistingFiles();
  }

  onunload() {
    console.log('Unloading Task Extractor plugin...');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // When a file is created or modified
  async onFileChanged(file: TFile) {
    try {
      if (file.extension !== 'md') return;
      if (this.processingFiles.has(file.path)) return;
      this.processingFiles.add(file.path);

      const cache = this.app.metadataCache.getFileCache(file);
      const front = cache?.frontmatter;
      if (!front) return;

      // check already processed
      const processedValue = this.getFrontmatterValue(front, this.settings.processedFrontmatterKey);
      if (processedValue === true || processedValue === 'true') {
        // already processed
        this.processingFiles.delete(file.path);
        return;
      }

      const typeRaw = this.getFrontmatterValue(front, 'Type') || '';
      const type = ('' + typeRaw).toLowerCase();
      const accepted = ['email', 'meetingnote', 'meeting note', 'meeting notes'];
      if (!accepted.includes(type)) {
        this.processingFiles.delete(file.path);
        return;
      }

      // read file content
      const content = await this.app.vault.read(file);

      // call LLM
      const extraction = await this.extractTaskFromContent(content, file.path);

      if (extraction && extraction.found) {
        // create task note
        await this.createTaskNote(extraction, file);
      }

      // mark as processed if configured
      await this.markFileProcessed(file);

      this.processingFiles.delete(file.path);
    } catch (err) {
      console.error('TaskExtractor error', err);
      new Notice('Task Extractor: error processing file — see console');
      try { this.processingFiles.delete(file.path); } catch {}
    }
  }

  // scan vault once on load for unprocessed matching notes
  async scanExistingFiles() {
    const files = this.app.vault.getMarkdownFiles();
    for (const f of files) {
      const cache = this.app.metadataCache.getFileCache(f);
      const front = cache?.frontmatter;
      if (!front) continue;
      const typeRaw = this.getFrontmatterValue(front, 'Type') || '';
      const type = ('' + typeRaw).toLowerCase();
      const accepted = ['email', 'meetingnote', 'meeting note', 'meeting notes'];
      const processedValue = this.getFrontmatterValue(front, this.settings.processedFrontmatterKey);
      if (accepted.includes(type) && !(processedValue === true || processedValue === 'true')) {
        // lightweight throttle
        await this.onFileChanged(f);
      }
    }
  }

  getFrontmatterValue(front: any, key: string) {
    // Support nested keys like "taskExtractor.processed"
    if (!front) return undefined;
    if (key.includes('.')) {
      const parts = key.split('.');
      let cur = front;
      for (const p of parts) {
        if (!cur) return undefined;
        cur = cur[p];
      }
      return cur;
    }
    return front[key];
  }

  async markFileProcessed(file: TFile) {
    if (!this.settings.processedFrontmatterKey) return;
    try {
      const content = await this.app.vault.read(file);
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let newContent = content;
      if (fmMatch) {
        const fm = fmMatch[1];
        // naive append processed key
        const lines = fm.split('\n');
        const processedKey = this.settings.processedFrontmatterKey;
        // if already present, skip
        if (!new RegExp('^' + processedKey.replace('.', '\.') + ':', 'm').test(fm)) {
          lines.push(`${processedKey}: true`);
          const updatedFm = lines.join('\n');
          newContent = content.replace(fmMatch[0], `---\n${updatedFm}\n---`);
          await this.app.vault.modify(file, newContent);
        }
      } else {
        // no frontmatter — create one
        const processedKey = this.settings.processedFrontmatterKey;
        newContent = `---\n${processedKey}: true\n---\n\n` + content;
        await this.app.vault.modify(file, newContent);
      }
    } catch (e) {
      console.warn('Failed to mark file processed', e);
    }
  }

  // Compose prompt, call LLM, and parse response
  async extractTaskFromContent(content: string, sourcePath: string) {
    // Short instructive system prompt to constrain output to JSON
    const system = `You are a task extraction assistant. You will be given the full text of an email or meeting note. Determine if there is an explicit or implied actionable task for ${this.settings.ownerName} (exact name). If there is a task, output a single JSON object and nothing else. If there is no task, output {"found": false}. The JSON, when found, must include these keys:\n- found: true\n- task_title: short (6-12 words) actionable title\n- task_details: 1-3 sentences describing what to do and any context\n- due_date: ISO date YYYY-MM-DD if explicitly present in the text, otherwise null\n- priority: high|medium|low (choose best match)\n- source_excerpt: a short quoted excerpt from the note that justifies the decision (max 3 lines)\nReturn valid JSON only.`;

    const user = `SOURCE_PATH: ${sourcePath}\n---BEGIN NOTE---\n${content}\n---END NOTE---`;

    try {
      const raw = await this.callLLM(system, user);
      const parsed = this.safeParseJSON(raw);
      if (!parsed) return { found: false };
      // normalize
      if (!parsed.found) return { found: false };
      return {
        found: true,
        task_title: parsed.task_title || parsed.title || 'Unspecified task',
        task_details: parsed.task_details || parsed.details || '',
        due_date: parsed.due_date || null,
        priority: parsed.priority || 'medium',
        source_excerpt: parsed.source_excerpt || '',
      };
    } catch (e) {
      console.error('extractTaskFromContent error', e);
      return { found: false };
    }
  }

  safeParseJSON(text: string | null) {
    if (!text) return null;
    // try direct parse
    try {
      return JSON.parse(text);
    } catch {}
    // extract first {...}
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch {}
    }
    // try to fix common issues: single quotes -> double
    const fixed = text.replace(/'/g, '"');
    try { return JSON.parse(fixed); } catch {}
    return null;
  }

  // Create TaskNotes–compatible note in tasksFolder
  async createTaskNote(extraction: any, sourceFile: TFile) {
    const safeTitle = this.makeFilenameSafe(extraction.task_title || 'task');
    let filename = `${safeTitle}.md`;
    let folder = this.settings.tasksFolder.trim() || 'Tasks';
    // ensure folder exists (Obsidian will create on create)
    let path = `${folder}/${filename}`;

    // If file exists, append counter
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = `${folder}/${safeTitle}-${counter}.md`;
      counter++;
    }

    const lines: string[] = [];
    lines.push('---');
    lines.push(`task: ${extraction.task_title}`);
    lines.push(`status: "todo"`);
    lines.push(`priority: "${extraction.priority || 'medium'}"`);
    if (extraction.due_date) lines.push(`due: ${extraction.due_date}`);
    lines.push('---');
    lines.push('');
    lines.push(extraction.task_details || '');
    lines.push('');
    if (this.settings.linkBack) {
      const link = `[[${sourceFile.path}]]`;
      lines.push(`Source: ${link}`);
    }
    if (extraction.source_excerpt) {
      lines.push('');
      lines.push('> Justification excerpt:');
      lines.push('> ' + extraction.source_excerpt.replace(/\n/g, ' '));
    }

    const final = lines.join('\n');

    try {
      await this.app.vault.create(path, final);
      new Notice(`Task Extractor: created task "${extraction.task_title}"`);
    } catch (e) {
      console.error('Failed to create task note', e);
      new Notice('Task Extractor: failed to create task note — see console');
    }
  }

  makeFilenameSafe(title: string) {
    return title.replace(/[\\/:*?"<>|#%{}\\^~\[\]`;'@&=+]/g, '').replace(/\s+/g, '-').slice(0, 120);
  }

  // Provider-agnostic LLM call
  async callLLM(systemPrompt: string, userPrompt: string): Promise<string | null> {
    const provider = this.settings.provider;
    const key = this.settings.apiKey;
    if (!key) {
      new Notice('Task Extractor: API key not configured in plugin settings');
      return null;
    }

    if (provider === 'openai') {
      return await this.callOpenAI(systemPrompt, userPrompt);
    } else if (provider === 'anthropic') {
      return await this.callAnthropic(systemPrompt, userPrompt);
    }

    return null;
  }

  async callOpenAI(systemPrompt: string, userPrompt: string) {
    const endpoint = 'https://api.openai.com/v1/chat/completions';
    const body = {
      model: this.settings.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0,
      max_tokens: 800
    };

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        const text = await resp.text();
        console.error('OpenAI error', resp.status, text);
        return null;
      }
      const json = await resp.json();
      const txt = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text;
      return txt?.toString() ?? null;
    } catch (e) {
      console.error('callOpenAI error', e);
      return null;
    }
  }

  async callAnthropic(systemPrompt: string, userPrompt: string) {
    // Simple wrapper for Anthropic Claude-instruct-style API — adapt if API differs
    const endpoint = 'https://api.anthropic.com/v1/complete';
    const prompt = `${systemPrompt}\n\nHuman: ${userPrompt}\n\nAssistant:`;
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': this.settings.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.settings.model || 'claude-2.1',
          prompt: prompt,
          max_tokens_to_sample: 800,
          temperature: 0
        })
      });
      if (!resp.ok) {
        const text = await resp.text();
        console.error('Anthropic error', resp.status, text);
        return null;
      }
      const json = await resp.json();
      // anthopic returns `completion` or `completion`-like field depending on API version
      return json?.completion ?? json?.completion?.[0] ?? null;
    } catch (e) {
      console.error('callAnthropic error', e);
      return null;
    }
  }
}

class ExtractorSettingTab extends PluginSettingTab {
  plugin: TaskExtractorPlugin;

  constructor(app: App, plugin: TaskExtractorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Task Extractor Settings' });

    new Setting(containerEl)
      .setName('Provider')
      .setDesc('Choose LLM provider.')
      .addDropdown(cb => cb
        .addOption('openai', 'OpenAI')
        .addOption('anthropic', 'Anthropic')
        .setValue(this.plugin.settings.provider)
        .onChange(async (v) => { this.plugin.settings.provider = v as any; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your API key for the selected provider.')
      .addText(text => text
        .setPlaceholder('sk-...')
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (v) => { this.plugin.settings.apiKey = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Model name for the provider (e.g. gpt-4o-mini).')
      .addText(text => text
        .setValue(this.plugin.settings.model)
        .onChange(async (v) => { this.plugin.settings.model = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Tasks folder')
      .setDesc('Folder where generated task notes will be created.')
      .addText(text => text
        .setValue(this.plugin.settings.tasksFolder)
        .onChange(async (v) => { this.plugin.settings.tasksFolder = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Link back to source')
      .setDesc('Insert a link back to the source note in generated task notes.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.linkBack)
        .onChange(async (v) => { this.plugin.settings.linkBack = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Mark processed in frontmatter')
      .setDesc('Frontmatter key to mark processed notes (e.g. taskExtractor.processed).')
      .addText(text => text
        .setValue(this.plugin.settings.processedFrontmatterKey)
        .onChange(async (v) => { this.plugin.settings.processedFrontmatterKey = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Owner name')
      .setDesc('Exact name the LLM should look for when deciding tasks (e.g. "Bryan Kolb").')
      .addText(text => text
        .setValue(this.plugin.settings.ownerName)
        .onChange(async (v) => { this.plugin.settings.ownerName = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Process edits as well as new files')
      .setDesc('If enabled, modifications to matching notes will be processed too.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.processOnUpdate)
        .onChange(async (v) => { this.plugin.settings.processOnUpdate = v; await this.plugin.saveSettings(); }));

    containerEl.createEl('hr');
    containerEl.createEl('div', { text: 'Notes:' });
    containerEl.createEl('div', { text: '• The plugin asks the LLM to return JSON only. If the LLM returns text, the plugin attempts to extract the JSON object.' });
    containerEl.createEl('div', { text: '• For initial testing set Model to a low-cost model and drop your API key in the settings.' });
  }
}
