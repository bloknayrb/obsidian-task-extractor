# Task Note Implementation Deviations: `obsidian-task-extractor` vs. `tasknotes`

This document outlines the key differences between the task note implementation in our `obsidian-task-extractor` plugin and the `tasknotes` plugin by @callumalpass.

## Core Philosophy and Approach

The two plugins have fundamentally different philosophies regarding what a "task" is and how it should be managed in Obsidian.

*   **`tasknotes`**: This plugin acts as a **task aggregator**. It scans your entire vault for lines that look like tasks (e.g., `- [ ] some task`) and presents them in a unified, interactive view. The tasks themselves live within their original notes. It is designed to find and manage existing checklist items.

*   **`obsidian-task-extractor`**: This plugin is a **task generator**. It uses a Large Language Model (LLM) to analyze the content of specific notes (e.g., meeting notes, emails) and creates new, individual task notes based on that analysis. Each task is a separate, self-contained note with rich metadata in its frontmatter.

## Detailed Implementation Deviations

| Feature | `tasknotes` by @callumalpass | `obsidian-task-extractor` (Our Plugin) |
| :--- | :--- | :--- |
| **Task Definition** | A single line in any markdown file, typically a checkbox item (`- [ ]`). | An actionable item identified by an LLM within a source note. |
| **Task Creation** | Tasks are not "created" in the sense of new files. They are identified and parsed from existing notes. | A new, separate `.md` file is created for each extracted task. |
| **Task Storage** | Tasks are stored in an in-memory database and rendered in a custom view. The original task text remains in its source file. | Each task is a file in the file system, located in a user-defined "Tasks" folder. |
| **Frontmatter Usage** | Minimal to none for task definition. The task is the line of text itself. | **Central to the implementation.** The frontmatter of the generated task note contains all of its metadata (due date, priority, status, etc.). |
| **Task Metadata** | Basic: `id`, `text`, `status` (Todo/Done), `file` (source), `line` (in source). | Rich and customizable: `task`, `status`, `priority`, `due`, `project`, `client`, `created`, `tags`, and more. |
| **Core Logic** | Scans files, parses lines with regular expressions, and updates an in-memory store. | Watches for specific note types, calls an LLM API, parses the JSON response, and creates new files with generated frontmatter. |
| **User Workflow** | 1. User writes checklist items in their notes. <br> 2. `tasknotes` finds them and displays them in a task view. | 1. User saves a note of a specific type (e.g., "Email"). <br> 2. The plugin sends the note content to an LLM. <br> 3. The LLM extracts tasks and the plugin creates new task notes. |

## Aligning Our Implementation with `tasknotes`

Aligning our plugin with the `tasknotes` implementation would require a complete rewrite and a fundamental shift in our plugin's purpose. It would mean moving from a "task generation" model to a "task aggregation" model.

The required steps would be:

1.  **Remove LLM-based Extraction**: The core feature of our plugin would be removed. This includes all logic related to `LLMProviderManager`, prompt construction, and API calls.

2.  **Implement Line-based Task Parsing**: We would need to develop a system for scanning markdown files and identifying lines that represent tasks. This would likely involve using regular expressions to find checklist items (`- [ ]`, `- [x]`).

3.  **Change Task Storage Model**: Instead of creating new files for each task, we would need to:
    *   Create an in-memory database or store to hold the parsed tasks.
    *   Develop a custom Obsidian View to display the tasks from the store. This view would need to support features like filtering, sorting, and marking tasks as complete.

4.  **Redefine the Task Data Structure**: Our `ExtractedTask` and `TaskExtractionResult` interfaces would be replaced with a much simpler interface, similar to `tasknotes`'s `Task` interface:
    ```typescript
    interface Task {
      id: string;
      text: string;
      status: 'Todo' | 'Done';
      file: string; // Path to the source file
      line: number; // Line number in the source file
    }
    ```

5.  **Overhaul Configuration**: The current settings for LLM providers, prompts, and frontmatter customization would become obsolete. New settings would be needed for things like:
    *   Defining what patterns to recognize as tasks.
    *   Configuring the appearance and behavior of the task view.

### Conclusion

`obsidian-task-extractor` and `tasknotes` are two very different plugins that address different user needs. "Aligning" with `tasknotes` would effectively mean deprecating our current plugin and building a new one from scratch that replicates the functionality of `tasknotes`. The two implementations are not compatible in their current forms.
