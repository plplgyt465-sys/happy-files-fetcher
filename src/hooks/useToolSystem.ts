import { useCallback, useMemo } from 'react';
import type { CodeFile } from './useCodeStore';
import type { Diagnostic } from './useStaticAnalysis';

// ──────────────────── Types ────────────────────
export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  result: unknown;
  duration?: number;
}

export interface ToolDefinition {
  name: string;
  category: ToolCategory;
  description: string;
  inputSchema: Record<string, { type: string; description: string; required?: boolean }>;
  execute: (input: ToolInput) => ToolResult;
}

export type ToolCategory =
  | 'file'
  | 'search'
  | 'analysis'
  | 'agent'
  | 'task'
  | 'plan'
  | 'web'
  | 'utility'
  | 'team'
  | 'code'
  | 'output';

export interface TaskItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  description?: string;
  assignedAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillDefinition {
  name: string;
  description: string;
  category: string;
  steps: string[];
  toolsUsed: string[];
}

// ──────────────────── Tool System Hook ────────────────────
export function useToolSystem(
  files: CodeFile[],
  updateFile: (id: string, content: string) => void,
  addFile: (name: string, lang: string) => void,
  deleteFile: (id: string) => void,
  diagnostics: Diagnostic[],
  // Extended capabilities
  onTasksChange?: (tasks: TaskItem[]) => void,
  onPlanModeChange?: (enabled: boolean) => void,
  onAgentSpawn?: (agentId: string, instruction: string) => void,
) {
  // ──── Internal State ────
  const tasks = useMemo<TaskItem[]>(() => [], []);
  
  function getLangFromExt(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      tsx: 'typescript', ts: 'typescript', jsx: 'javascript', js: 'javascript',
      css: 'css', json: 'json', html: 'html', md: 'markdown', txt: 'plaintext',
      svg: 'xml', xml: 'xml', yaml: 'yaml', yml: 'yaml',
    };
    return map[ext] || 'plaintext';
  }

  // ════════════════════════════════════════════════════════════════
  //  FILE TOOLS (1-8)
  // ════════════════════════════════════════════════════════════════

  // 1. FileReadTool
  const FileReadTool = useCallback((input: ToolInput): ToolResult => {
    const fileName = String(input.fileName || input.file || '');
    const file = files.find(f => f.name === fileName);
    if (!file) return { tool: 'FileReadTool', success: false, result: `File '${fileName}' not found` };
    
    const lines = file.content.split('\n');
    const startLine = Number(input.startLine) || 1;
    const endLine = Number(input.endLine) || lines.length;
    const content = lines.slice(startLine - 1, endLine).join('\n');
    
    return {
      tool: 'FileReadTool',
      success: true,
      result: {
        name: file.name,
        language: file.language,
        totalLines: lines.length,
        content,
        range: { start: startLine, end: Math.min(endLine, lines.length) },
      },
    };
  }, [files]);

  // 2. FileWriteTool
  const FileWriteTool = useCallback((input: ToolInput): ToolResult => {
    const fileName = String(input.fileName || input.file || '');
    const content = String(input.content || '');
    const file = files.find(f => f.name === fileName);
    
    if (file) {
      updateFile(file.id, content);
      return { tool: 'FileWriteTool', success: true, result: `Overwrote '${fileName}' (${content.split('\n').length} lines)` };
    }
    
    addFile(fileName, getLangFromExt(fileName));
    // After creation, set content via a microtask
    setTimeout(() => {
      const created = files.find(f => f.name === fileName);
      if (created) updateFile(created.id, content);
    }, 50);
    return { tool: 'FileWriteTool', success: true, result: `Created '${fileName}' (${content.split('\n').length} lines)` };
  }, [files, updateFile, addFile]);

  // 3. FileEditTool
  const FileEditTool = useCallback((input: ToolInput): ToolResult => {
    const fileName = String(input.fileName || input.file || '');
    const oldStr = String(input.oldString || input.old || '');
    const newStr = String(input.newString || input.new || '');
    const file = files.find(f => f.name === fileName);
    
    if (!file) return { tool: 'FileEditTool', success: false, result: `File '${fileName}' not found` };
    if (!file.content.includes(oldStr)) {
      return { tool: 'FileEditTool', success: false, result: `String not found in '${fileName}'` };
    }
    
    const updated = file.content.replace(oldStr, newStr);
    updateFile(file.id, updated);
    return { tool: 'FileEditTool', success: true, result: `Edited '${fileName}': replaced ${oldStr.split('\n').length} lines` };
  }, [files, updateFile]);

  // 4. FileDeleteTool
  const FileDeleteTool = useCallback((input: ToolInput): ToolResult => {
    const fileName = String(input.fileName || input.file || '');
    const file = files.find(f => f.name === fileName);
    if (!file) return { tool: 'FileDeleteTool', success: false, result: `File '${fileName}' not found` };
    if (files.length <= 1) return { tool: 'FileDeleteTool', success: false, result: 'Cannot delete the last file' };
    deleteFile(file.id);
    return { tool: 'FileDeleteTool', success: true, result: `Deleted '${fileName}'` };
  }, [files, deleteFile]);

  // 5. FileRenameTool
  const FileRenameTool = useCallback((input: ToolInput): ToolResult => {
    const oldName = String(input.oldName || '');
    const newName = String(input.newName || '');
    const file = files.find(f => f.name === oldName);
    if (!file) return { tool: 'FileRenameTool', success: false, result: `File '${oldName}' not found` };
    // Simulate rename by creating new + deleting old
    addFile(newName, getLangFromExt(newName));
    setTimeout(() => {
      const newFile = files.find(f => f.name === newName);
      if (newFile) updateFile(newFile.id, file.content);
      deleteFile(file.id);
    }, 50);
    return { tool: 'FileRenameTool', success: true, result: `Renamed '${oldName}' → '${newName}'` };
  }, [files, addFile, updateFile, deleteFile]);

  // 6. FileCopyTool
  const FileCopyTool = useCallback((input: ToolInput): ToolResult => {
    const source = String(input.source || '');
    const dest = String(input.destination || '');
    const file = files.find(f => f.name === source);
    if (!file) return { tool: 'FileCopyTool', success: false, result: `Source file '${source}' not found` };
    addFile(dest, getLangFromExt(dest));
    setTimeout(() => {
      const newFile = files.find(f => f.name === dest);
      if (newFile) updateFile(newFile.id, file.content);
    }, 50);
    return { tool: 'FileCopyTool', success: true, result: `Copied '${source}' → '${dest}'` };
  }, [files, addFile, updateFile]);

  // 7. FileMoveTool
  const FileMoveTool = useCallback((input: ToolInput): ToolResult => {
    return FileRenameTool(input);
  }, [FileRenameTool]);

  // 8. FileInfoTool
  const FileInfoTool = useCallback((input: ToolInput): ToolResult => {
    const fileName = String(input.fileName || input.file || '');
    const file = files.find(f => f.name === fileName);
    if (!file) return { tool: 'FileInfoTool', success: false, result: `File '${fileName}' not found` };
    const lines = file.content.split('\n');
    const chars = file.content.length;
    const imports = (file.content.match(/^import\s/gm) || []).length;
    const exports = (file.content.match(/^export\s/gm) || []).length;
    const functions = (file.content.match(/(?:function\s+\w+|const\s+\w+\s*=\s*(?:\([^)]*\)|[^=])\s*=>)/gm) || []).length;
    return {
      tool: 'FileInfoTool',
      success: true,
      result: { name: file.name, language: file.language, lines: lines.length, characters: chars, imports, exports, functions },
    };
  }, [files]);

  // ════════════════════════════════════════════════════════════════
  //  SEARCH TOOLS (9-14)
  // ════════════════════════════════════════════════════════════════

  // 9. GlobTool
  const GlobTool = useCallback((input: ToolInput): ToolResult => {
    const pattern = String(input.pattern || '*');
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    const matched = files.filter(f => regex.test(f.name)).map(f => f.name);
    return { tool: 'GlobTool', success: true, result: { pattern, matches: matched, count: matched.length } };
  }, [files]);

  // 10. GrepTool
  const GrepTool = useCallback((input: ToolInput): ToolResult => {
    const query = String(input.query || input.pattern || '');
    const caseSensitive = input.caseSensitive !== false;
    const fileFilter = input.fileFilter ? String(input.fileFilter) : null;
    
    const results: { file: string; line: number; content: string }[] = [];
    const searchFiles = fileFilter
      ? files.filter(f => f.name.includes(fileFilter))
      : files;
    
    for (const file of searchFiles) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = caseSensitive ? line.includes(query) : line.toLowerCase().includes(query.toLowerCase());
        if (match) {
          results.push({ file: file.name, line: i + 1, content: line.trim() });
        }
      }
    }
    return { tool: 'GrepTool', success: true, result: { query, totalMatches: results.length, matches: results.slice(0, 50) } };
  }, [files]);

  // 11. SearchReplaceTool
  const SearchReplaceTool = useCallback((input: ToolInput): ToolResult => {
    const query = String(input.search || '');
    const replacement = String(input.replace || '');
    const fileFilter = input.file ? String(input.file) : null;
    let totalReplacements = 0;
    
    const targetFiles = fileFilter ? files.filter(f => f.name === fileFilter) : files;
    for (const file of targetFiles) {
      if (file.content.includes(query)) {
        const count = (file.content.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        const updated = file.content.split(query).join(replacement);
        updateFile(file.id, updated);
        totalReplacements += count;
      }
    }
    return { tool: 'SearchReplaceTool', success: true, result: { search: query, replace: replacement, replacements: totalReplacements } };
  }, [files, updateFile]);

  // 12. FindSymbolTool
  const FindSymbolTool = useCallback((input: ToolInput): ToolResult => {
    const symbol = String(input.symbol || '');
    const results: { file: string; line: number; type: string; context: string }[] = [];
    
    const patterns = [
      { type: 'function', regex: new RegExp(`(?:function|const|let|var)\\s+${symbol}\\b`, 'g') },
      { type: 'class', regex: new RegExp(`class\\s+${symbol}\\b`, 'g') },
      { type: 'interface', regex: new RegExp(`interface\\s+${symbol}\\b`, 'g') },
      { type: 'type', regex: new RegExp(`type\\s+${symbol}\\b`, 'g') },
      { type: 'import', regex: new RegExp(`import.*\\b${symbol}\\b`, 'g') },
      { type: 'export', regex: new RegExp(`export.*\\b${symbol}\\b`, 'g') },
    ];
    
    for (const file of files) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const p of patterns) {
          if (p.regex.test(lines[i])) {
            results.push({ file: file.name, line: i + 1, type: p.type, context: lines[i].trim() });
          }
          p.regex.lastIndex = 0;
        }
      }
    }
    return { tool: 'FindSymbolTool', success: true, result: { symbol, occurrences: results.length, results } };
  }, [files]);

  // 13. FindReferencesTool
  const FindReferencesTool = useCallback((input: ToolInput): ToolResult => {
    const symbol = String(input.symbol || '');
    const results: { file: string; line: number; context: string }[] = [];
    
    for (const file of files) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(symbol)) {
          results.push({ file: file.name, line: i + 1, context: lines[i].trim() });
        }
      }
    }
    return { tool: 'FindReferencesTool', success: true, result: { symbol, totalReferences: results.length, references: results } };
  }, [files]);

  // 14. ToolSearchTool
  const ToolSearchTool = useCallback((input: ToolInput): ToolResult => {
    const query = String(input.query || '').toLowerCase();
    const category = input.category ? String(input.category) : null;
    
    let matched = toolDefinitions;
    if (category) matched = matched.filter(t => t.category === category);
    if (query) matched = matched.filter(t => 
      t.name.toLowerCase().includes(query) || t.description.toLowerCase().includes(query)
    );
    
    return {
      tool: 'ToolSearchTool',
      success: true,
      result: {
        query,
        matchedTools: matched.map(t => ({ name: t.name, category: t.category, description: t.description })),
        count: matched.length,
      },
    };
  }, []);

  // ════════════════════════════════════════════════════════════════
  //  ANALYSIS & CODE INTELLIGENCE TOOLS (15-22)
  // ════════════════════════════════════════════════════════════════

  // 15. ErrorParserTool
  const ErrorParserTool = useCallback((): ToolResult => {
    return {
      tool: 'ErrorParserTool',
      success: true,
      result: {
        total: diagnostics.length,
        errors: diagnostics.filter(d => d.severity === 'error'),
        warnings: diagnostics.filter(d => d.severity === 'warning'),
        info: diagnostics.filter(d => d.severity === 'info'),
      },
    };
  }, [diagnostics]);

  // 16. TSCheckerTool
  const TSCheckerTool = useCallback((input: ToolInput): ToolResult => {
    const fileName = String(input.fileName || input.file || '');
    const fileDiags = diagnostics.filter(d => d.file === fileName);
    return {
      tool: 'TSCheckerTool',
      success: true,
      result: { file: fileName, issues: fileDiags.length, diagnostics: fileDiags },
    };
  }, [diagnostics]);

  // 17. ProjectInfoTool
  const ProjectInfoTool = useCallback((): ToolResult => {
    const filesByType: Record<string, number> = {};
    let totalLines = 0;
    for (const f of files) {
      const ext = f.name.split('.').pop() || 'unknown';
      filesByType[ext] = (filesByType[ext] || 0) + 1;
      totalLines += f.content.split('\n').length;
    }
    return {
      tool: 'ProjectInfoTool',
      success: true,
      result: {
        files: files.map(f => ({ name: f.name, language: f.language, lines: f.content.split('\n').length })),
        totalFiles: files.length,
        totalLines,
        filesByType,
        totalDiagnostics: diagnostics.length,
      },
    };
  }, [files, diagnostics]);

  // 18. LSPTool (simulated)
  const LSPTool = useCallback((input: ToolInput): ToolResult => {
    const fileName = String(input.fileName || input.file || '');
    const operation = String(input.operation || 'hover');
    const line = Number(input.line) || 1;
    const file = files.find(f => f.name === fileName);
    
    if (!file) return { tool: 'LSPTool', success: false, result: `File '${fileName}' not found` };
    
    const lines = file.content.split('\n');
    const targetLine = lines[line - 1] || '';
    
    if (operation === 'hover') {
      return { tool: 'LSPTool', success: true, result: { operation: 'hover', file: fileName, line, content: targetLine } };
    }
    if (operation === 'definition') {
      // Simple: find where an identifier on this line is defined
      const identifiers = targetLine.match(/\b[A-Z]\w+\b/g) || [];
      const definitions: { symbol: string; file: string; line: number }[] = [];
      for (const id of identifiers) {
        for (const f of files) {
          const fLines = f.content.split('\n');
          for (let i = 0; i < fLines.length; i++) {
            if (fLines[i].match(new RegExp(`(?:function|class|interface|type|const|let|var)\\s+${id}\\b`))) {
              definitions.push({ symbol: id, file: f.name, line: i + 1 });
            }
          }
        }
      }
      return { tool: 'LSPTool', success: true, result: { operation: 'definition', definitions } };
    }
    if (operation === 'references') {
      const symbol = String(input.symbol || '');
      return FindReferencesTool({ symbol });
    }
    return { tool: 'LSPTool', success: false, result: `Unknown LSP operation: ${operation}` };
  }, [files, FindReferencesTool]);

  // 19. DependencyAnalyzerTool
  const DependencyAnalyzerTool = useCallback((): ToolResult => {
    const graph: Record<string, string[]> = {};
    for (const file of files) {
      const imports: string[] = [];
      const importRegex = /import\s+.*from\s+['"]\.?\/?([^'"]+)['"]/g;
      let m;
      while ((m = importRegex.exec(file.content)) !== null) {
        imports.push(m[1]);
      }
      graph[file.name] = imports;
    }
    return { tool: 'DependencyAnalyzerTool', success: true, result: { dependencyGraph: graph, totalFiles: files.length } };
  }, [files]);

  // 20. CodeComplexityTool
  const CodeComplexityTool = useCallback((input: ToolInput): ToolResult => {
    const fileName = String(input.fileName || input.file || '');
    const file = files.find(f => f.name === fileName);
    if (!file) return { tool: 'CodeComplexityTool', success: false, result: `File '${fileName}' not found` };
    
    const content = file.content;
    const lines = content.split('\n').length;
    const ifCount = (content.match(/\bif\s*\(/g) || []).length;
    const forCount = (content.match(/\bfor\s*\(/g) || []).length;
    const whileCount = (content.match(/\bwhile\s*\(/g) || []).length;
    const ternaryCount = (content.match(/\?.*:/g) || []).length;
    const functionCount = (content.match(/(?:function\s+\w+|\w+\s*=\s*(?:\([^)]*\)|\w+)\s*=>)/g) || []).length;
    const cyclomaticComplexity = 1 + ifCount + forCount + whileCount + ternaryCount;
    
    return {
      tool: 'CodeComplexityTool',
      success: true,
      result: { file: fileName, lines, functions: functionCount, cyclomaticComplexity, branches: { if: ifCount, for: forCount, while: whileCount, ternary: ternaryCount } },
    };
  }, [files]);

  // 21. UnusedCodeTool
  const UnusedCodeTool = useCallback((): ToolResult => {
    const exported: { file: string; symbol: string }[] = [];
    const allContent = files.map(f => f.content).join('\n');
    
    for (const file of files) {
      const exportMatches = file.content.matchAll(/export\s+(?:const|function|class|interface|type)\s+(\w+)/g);
      for (const m of exportMatches) {
        exported.push({ file: file.name, symbol: m[1] });
      }
    }
    
    const unused = exported.filter(e => {
      const importRegex = new RegExp(`import.*\\b${e.symbol}\\b`, 'g');
      const usageCount = (allContent.match(importRegex) || []).length;
      return usageCount === 0;
    });
    
    return { tool: 'UnusedCodeTool', success: true, result: { totalExports: exported.length, unusedExports: unused, unusedCount: unused.length } };
  }, [files]);

  // 22. CodeFormatterTool
  const CodeFormatterTool = useCallback((input: ToolInput): ToolResult => {
    const fileName = String(input.fileName || input.file || '');
    const file = files.find(f => f.name === fileName);
    if (!file) return { tool: 'CodeFormatterTool', success: false, result: `File '${fileName}' not found` };
    
    // Basic formatting: normalize indentation, trim trailing whitespace
    const lines = file.content.split('\n');
    const formatted = lines.map(l => l.trimEnd()).join('\n');
    updateFile(file.id, formatted);
    return { tool: 'CodeFormatterTool', success: true, result: `Formatted '${fileName}'` };
  }, [files, updateFile]);

  // ════════════════════════════════════════════════════════════════
  //  TASK & PLAN TOOLS (23-30)
  // ════════════════════════════════════════════════════════════════

  // 23. TaskCreateTool
  const TaskCreateTool = useCallback((input: ToolInput): ToolResult => {
    const title = String(input.title || '');
    const description = String(input.description || '');
    const task: TaskItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title,
      description,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tasks.push(task);
    onTasksChange?.([...tasks]);
    return { tool: 'TaskCreateTool', success: true, result: { taskId: task.id, title: task.title } };
  }, [tasks, onTasksChange]);

  // 24. TaskUpdateTool
  const TaskUpdateTool = useCallback((input: ToolInput): ToolResult => {
    const taskId = String(input.taskId || input.id || '');
    const status = input.status as TaskItem['status'] | undefined;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return { tool: 'TaskUpdateTool', success: false, result: `Task '${taskId}' not found` };
    if (status) task.status = status;
    if (input.title) task.title = String(input.title);
    if (input.description) task.description = String(input.description);
    task.updatedAt = new Date();
    onTasksChange?.([...tasks]);
    return { tool: 'TaskUpdateTool', success: true, result: { taskId: task.id, status: task.status } };
  }, [tasks, onTasksChange]);

  // 25. TaskListTool
  const TaskListTool = useCallback((): ToolResult => {
    return { tool: 'TaskListTool', success: true, result: { tasks: [...tasks], total: tasks.length } };
  }, [tasks]);

  // 26. TaskDeleteTool
  const TaskDeleteTool = useCallback((input: ToolInput): ToolResult => {
    const taskId = String(input.taskId || input.id || '');
    const idx = tasks.findIndex(t => t.id === taskId);
    if (idx < 0) return { tool: 'TaskDeleteTool', success: false, result: `Task '${taskId}' not found` };
    tasks.splice(idx, 1);
    onTasksChange?.([...tasks]);
    return { tool: 'TaskDeleteTool', success: true, result: `Deleted task '${taskId}'` };
  }, [tasks, onTasksChange]);

  // 27. EnterPlanModeTool
  const EnterPlanModeTool = useCallback((): ToolResult => {
    onPlanModeChange?.(true);
    return { tool: 'EnterPlanModeTool', success: true, result: 'Plan mode activated. AI will only plan, not execute changes.' };
  }, [onPlanModeChange]);

  // 28. ExitPlanModeTool
  const ExitPlanModeTool = useCallback((): ToolResult => {
    onPlanModeChange?.(false);
    return { tool: 'ExitPlanModeTool', success: true, result: 'Plan mode deactivated. AI can now execute changes.' };
  }, [onPlanModeChange]);

  // 29. ProgressTrackTool
  const ProgressTrackTool = useCallback((): ToolResult => {
    const done = tasks.filter(t => t.status === 'done').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    return {
      tool: 'ProgressTrackTool',
      success: true,
      result: { total: tasks.length, done, inProgress, pending, failed, percentage: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0 },
    };
  }, [tasks]);

  // 30. TimeEstimateTool
  const TimeEstimateTool = useCallback((input: ToolInput): ToolResult => {
    const description = String(input.description || '');
    const complexity = String(input.complexity || 'medium');
    const estimates: Record<string, string> = { low: '5-15 minutes', medium: '15-45 minutes', high: '1-3 hours', critical: '3-8 hours' };
    return {
      tool: 'TimeEstimateTool',
      success: true,
      result: { description, complexity, estimatedTime: estimates[complexity] || estimates.medium },
    };
  }, []);

  // ════════════════════════════════════════════════════════════════
  //  AGENT & TEAM TOOLS (31-36)
  // ════════════════════════════════════════════════════════════════

  // 31. AgentTool
  const AgentTool = useCallback((input: ToolInput): ToolResult => {
    const instruction = String(input.instruction || '');
    const agentId = String(input.agentId || 'sub-' + Date.now().toString(36));
    onAgentSpawn?.(agentId, instruction);
    return { tool: 'AgentTool', success: true, result: { agentId, instruction, status: 'spawned' } };
  }, [onAgentSpawn]);

  // 32. SendMessageTool
  const SendMessageTool = useCallback((input: ToolInput): ToolResult => {
    const to = String(input.to || '');
    const message = String(input.message || '');
    return { tool: 'SendMessageTool', success: true, result: { to, message, delivered: true, timestamp: new Date().toISOString() } };
  }, []);

  // 33. TeamCreateTool
  const TeamCreateTool = useCallback((input: ToolInput): ToolResult => {
    const name = String(input.name || '');
    const agents = (input.agents as string[]) || [];
    const teamId = 'team-' + Date.now().toString(36);
    return { tool: 'TeamCreateTool', success: true, result: { teamId, name, agents, status: 'created' } };
  }, []);

  // 34. TeamDeleteTool
  const TeamDeleteTool = useCallback((input: ToolInput): ToolResult => {
    const teamId = String(input.teamId || '');
    return { tool: 'TeamDeleteTool', success: true, result: { teamId, status: 'deleted' } };
  }, []);

  // 35. CoordinatorTool
  const CoordinatorTool = useCallback((input: ToolInput): ToolResult => {
    const plan = String(input.plan || '');
    const agentCount = Number(input.agentCount) || 3;
    return {
      tool: 'CoordinatorTool',
      success: true,
      result: { plan, agentCount, status: 'coordination_started', timestamp: new Date().toISOString() },
    };
  }, []);

  // 36. DelegateTool
  const DelegateTool = useCallback((input: ToolInput): ToolResult => {
    const agentId = String(input.agentId || '');
    const task = String(input.task || '');
    return { tool: 'DelegateTool', success: true, result: { agentId, task, status: 'delegated' } };
  }, []);

  // ════════════════════════════════════════════════════════════════
  //  UTILITY & OUTPUT TOOLS (37-44)
  // ════════════════════════════════════════════════════════════════

  // 37. SleepTool
  const SleepTool = useCallback((input: ToolInput): ToolResult => {
    const ms = Number(input.duration || input.ms || 1000);
    return { tool: 'SleepTool', success: true, result: { sleptFor: ms, message: `Waited ${ms}ms` } };
  }, []);

  // 38. SyntheticOutputTool
  const SyntheticOutputTool = useCallback((input: ToolInput): ToolResult => {
    const format = String(input.format || 'json');
    const data = input.data;
    if (format === 'json') {
      return { tool: 'SyntheticOutputTool', success: true, result: JSON.stringify(data, null, 2) };
    }
    if (format === 'markdown') {
      return { tool: 'SyntheticOutputTool', success: true, result: String(data) };
    }
    return { tool: 'SyntheticOutputTool', success: true, result: data };
  }, []);

  // 39. MemoryStoreTool
  const MemoryStoreTool = useCallback((input: ToolInput): ToolResult => {
    const key = String(input.key || '');
    const value = input.value;
    try {
      localStorage.setItem(`vibecode_memory_${key}`, JSON.stringify(value));
      return { tool: 'MemoryStoreTool', success: true, result: `Stored memory: '${key}'` };
    } catch {
      return { tool: 'MemoryStoreTool', success: false, result: 'Failed to store memory' };
    }
  }, []);

  // 40. MemoryRecallTool
  const MemoryRecallTool = useCallback((input: ToolInput): ToolResult => {
    const key = String(input.key || '');
    try {
      const raw = localStorage.getItem(`vibecode_memory_${key}`);
      if (!raw) return { tool: 'MemoryRecallTool', success: false, result: `No memory found for '${key}'` };
      return { tool: 'MemoryRecallTool', success: true, result: JSON.parse(raw) };
    } catch {
      return { tool: 'MemoryRecallTool', success: false, result: 'Failed to recall memory' };
    }
  }, []);

  // 41. SnippetGeneratorTool
  const SnippetGeneratorTool = useCallback((input: ToolInput): ToolResult => {
    const type = String(input.type || 'component');
    const name = String(input.name || 'MyComponent');
    
    const templates: Record<string, string> = {
      component: `import React from 'react';\n\ninterface ${name}Props {\n  // props\n}\n\nconst ${name}: React.FC<${name}Props> = (props) => {\n  return (\n    <div>\n      <h1>${name}</h1>\n    </div>\n  );\n};\n\nexport default ${name};`,
      hook: `import { useState, useEffect } from 'react';\n\nexport function use${name}() {\n  const [state, setState] = useState(null);\n\n  useEffect(() => {\n    // effect\n  }, []);\n\n  return { state };\n}`,
      context: `import React, { createContext, useContext, useState } from 'react';\n\ninterface ${name}ContextType {\n  // context type\n}\n\nconst ${name}Context = createContext<${name}ContextType | null>(null);\n\nexport const ${name}Provider: React.FC<{children: React.ReactNode}> = ({ children }) => {\n  return (\n    <${name}Context.Provider value={{}}>\n      {children}\n    </${name}Context.Provider>\n  );\n};\n\nexport const use${name} = () => {\n  const ctx = useContext(${name}Context);\n  if (!ctx) throw new Error('use${name} must be used within ${name}Provider');\n  return ctx;\n};`,
      types: `export interface ${name} {\n  id: string;\n  name: string;\n  createdAt: Date;\n  updatedAt: Date;\n}`,
      test: `import { describe, it, expect } from 'vitest';\n\ndescribe('${name}', () => {\n  it('should work', () => {\n    expect(true).toBe(true);\n  });\n});`,
      api: `export async function fetch${name}(): Promise<unknown> {\n  const response = await fetch('/api/${name.toLowerCase()}');\n  if (!response.ok) throw new Error('Failed to fetch ${name}');\n  return response.json();\n}`,
    };
    
    const snippet = templates[type] || templates.component;
    return { tool: 'SnippetGeneratorTool', success: true, result: { type, name, snippet } };
  }, []);

  // 42. DiffTool
  const DiffTool = useCallback((input: ToolInput): ToolResult => {
    const file1 = String(input.file1 || '');
    const file2 = String(input.file2 || '');
    const f1 = files.find(f => f.name === file1);
    const f2 = files.find(f => f.name === file2);
    if (!f1) return { tool: 'DiffTool', success: false, result: `File '${file1}' not found` };
    if (!f2) return { tool: 'DiffTool', success: false, result: `File '${file2}' not found` };
    
    const lines1 = f1.content.split('\n');
    const lines2 = f2.content.split('\n');
    const diffs: { line: number; type: 'added' | 'removed' | 'changed'; content: string }[] = [];
    const maxLen = Math.max(lines1.length, lines2.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= lines1.length) diffs.push({ line: i + 1, type: 'added', content: lines2[i] });
      else if (i >= lines2.length) diffs.push({ line: i + 1, type: 'removed', content: lines1[i] });
      else if (lines1[i] !== lines2[i]) diffs.push({ line: i + 1, type: 'changed', content: `- ${lines1[i]}\n+ ${lines2[i]}` });
    }
    return { tool: 'DiffTool', success: true, result: { file1, file2, totalDiffs: diffs.length, diffs: diffs.slice(0, 50) } };
  }, [files]);

  // 43. BashTool (simulated - executes simple JS expressions)
  const BashTool = useCallback((input: ToolInput): ToolResult => {
    const command = String(input.command || '');
    // Simulate common commands
    if (command.startsWith('ls')) {
      return { tool: 'BashTool', success: true, result: files.map(f => f.name).join('\n') };
    }
    if (command.startsWith('cat ')) {
      const fileName = command.slice(4).trim();
      const file = files.find(f => f.name === fileName);
      if (file) return { tool: 'BashTool', success: true, result: file.content };
      return { tool: 'BashTool', success: false, result: `cat: ${fileName}: No such file` };
    }
    if (command.startsWith('wc ')) {
      const fileName = command.replace(/^wc\s+-?\w*\s*/, '').trim();
      const file = files.find(f => f.name === fileName);
      if (file) {
        const lines = file.content.split('\n').length;
        const words = file.content.split(/\s+/).length;
        const chars = file.content.length;
        return { tool: 'BashTool', success: true, result: `${lines} ${words} ${chars} ${fileName}` };
      }
    }
    if (command.startsWith('echo ')) {
      return { tool: 'BashTool', success: true, result: command.slice(5) };
    }
    if (command === 'pwd') {
      return { tool: 'BashTool', success: true, result: '/project' };
    }
    if (command === 'date') {
      return { tool: 'BashTool', success: true, result: new Date().toISOString() };
    }
    return { tool: 'BashTool', success: true, result: `[Simulated] $ ${command}\n(Command simulated in browser environment)` };
  }, [files]);

  // 44. NotebookEditTool
  const NotebookEditTool = useCallback((input: ToolInput): ToolResult => {
    const fileName = String(input.fileName || input.file || '');
    const cellIndex = Number(input.cellIndex || 0);
    const content = String(input.content || '');
    const file = files.find(f => f.name === fileName);
    if (!file) return { tool: 'NotebookEditTool', success: false, result: `File '${fileName}' not found` };
    
    try {
      const notebook = JSON.parse(file.content);
      if (notebook.cells && notebook.cells[cellIndex]) {
        notebook.cells[cellIndex].source = content.split('\n');
        updateFile(file.id, JSON.stringify(notebook, null, 2));
        return { tool: 'NotebookEditTool', success: true, result: `Updated cell ${cellIndex} in '${fileName}'` };
      }
      return { tool: 'NotebookEditTool', success: false, result: `Cell ${cellIndex} not found` };
    } catch {
      return { tool: 'NotebookEditTool', success: false, result: `'${fileName}' is not a valid notebook` };
    }
  }, [files, updateFile]);

  // ════════════════════════════════════════════════════════════════
  //  TOOL REGISTRY
  // ════════════════════════════════════════════════════════════════

  const toolDefinitions: ToolDefinition[] = useMemo(() => [
    // File Tools
    { name: 'FileReadTool', category: 'file', description: 'Read content of a file, optionally specifying line range', inputSchema: { fileName: { type: 'string', description: 'File name to read', required: true }, startLine: { type: 'number', description: 'Start line (optional)' }, endLine: { type: 'number', description: 'End line (optional)' } }, execute: FileReadTool },
    { name: 'FileWriteTool', category: 'file', description: 'Create or overwrite a file with content', inputSchema: { fileName: { type: 'string', description: 'File name', required: true }, content: { type: 'string', description: 'File content', required: true } }, execute: FileWriteTool },
    { name: 'FileEditTool', category: 'file', description: 'Edit file by replacing a string with another', inputSchema: { fileName: { type: 'string', description: 'File name', required: true }, oldString: { type: 'string', description: 'String to find', required: true }, newString: { type: 'string', description: 'Replacement string', required: true } }, execute: FileEditTool },
    { name: 'FileDeleteTool', category: 'file', description: 'Delete a file from the project', inputSchema: { fileName: { type: 'string', description: 'File to delete', required: true } }, execute: FileDeleteTool },
    { name: 'FileRenameTool', category: 'file', description: 'Rename a file', inputSchema: { oldName: { type: 'string', description: 'Current name', required: true }, newName: { type: 'string', description: 'New name', required: true } }, execute: FileRenameTool },
    { name: 'FileCopyTool', category: 'file', description: 'Copy a file to a new location', inputSchema: { source: { type: 'string', description: 'Source file', required: true }, destination: { type: 'string', description: 'Destination path', required: true } }, execute: FileCopyTool },
    { name: 'FileMoveTool', category: 'file', description: 'Move a file to a new location', inputSchema: { oldName: { type: 'string', description: 'Current path', required: true }, newName: { type: 'string', description: 'New path', required: true } }, execute: FileMoveTool },
    { name: 'FileInfoTool', category: 'file', description: 'Get metadata about a file (lines, imports, exports)', inputSchema: { fileName: { type: 'string', description: 'File name', required: true } }, execute: FileInfoTool },
    // Search Tools
    { name: 'GlobTool', category: 'search', description: 'Find files matching a glob pattern', inputSchema: { pattern: { type: 'string', description: 'Glob pattern (e.g. *.tsx)', required: true } }, execute: GlobTool },
    { name: 'GrepTool', category: 'search', description: 'Search for text across all files', inputSchema: { query: { type: 'string', description: 'Search text', required: true }, caseSensitive: { type: 'boolean', description: 'Case sensitive (default true)' }, fileFilter: { type: 'string', description: 'Filter by file name' } }, execute: GrepTool },
    { name: 'SearchReplaceTool', category: 'search', description: 'Search and replace text across files', inputSchema: { search: { type: 'string', description: 'Search text', required: true }, replace: { type: 'string', description: 'Replacement', required: true }, file: { type: 'string', description: 'Specific file (optional)' } }, execute: SearchReplaceTool },
    { name: 'FindSymbolTool', category: 'search', description: 'Find where a symbol (function, class, type) is defined', inputSchema: { symbol: { type: 'string', description: 'Symbol name', required: true } }, execute: FindSymbolTool },
    { name: 'FindReferencesTool', category: 'search', description: 'Find all references to a symbol', inputSchema: { symbol: { type: 'string', description: 'Symbol name', required: true } }, execute: FindReferencesTool },
    { name: 'ToolSearchTool', category: 'search', description: 'Search for available tools by name or category', inputSchema: { query: { type: 'string', description: 'Search query' }, category: { type: 'string', description: 'Filter by category' } }, execute: ToolSearchTool },
    // Analysis Tools
    { name: 'ErrorParserTool', category: 'analysis', description: 'Get all current diagnostics and errors', inputSchema: {}, execute: ErrorParserTool },
    { name: 'TSCheckerTool', category: 'analysis', description: 'Check a specific file for TypeScript issues', inputSchema: { fileName: { type: 'string', description: 'File to check', required: true } }, execute: TSCheckerTool },
    { name: 'ProjectInfoTool', category: 'analysis', description: 'Get full project overview and statistics', inputSchema: {}, execute: ProjectInfoTool },
    { name: 'LSPTool', category: 'code', description: 'Language server operations: hover, definition, references', inputSchema: { fileName: { type: 'string', description: 'File name', required: true }, operation: { type: 'string', description: 'Operation: hover|definition|references', required: true }, line: { type: 'number', description: 'Line number', required: true }, symbol: { type: 'string', description: 'Symbol for references' } }, execute: LSPTool },
    { name: 'DependencyAnalyzerTool', category: 'analysis', description: 'Analyze import dependency graph', inputSchema: {}, execute: DependencyAnalyzerTool },
    { name: 'CodeComplexityTool', category: 'analysis', description: 'Calculate cyclomatic complexity of a file', inputSchema: { fileName: { type: 'string', description: 'File to analyze', required: true } }, execute: CodeComplexityTool },
    { name: 'UnusedCodeTool', category: 'analysis', description: 'Find unused exports across the project', inputSchema: {}, execute: UnusedCodeTool },
    { name: 'CodeFormatterTool', category: 'code', description: 'Format code in a file (trim whitespace)', inputSchema: { fileName: { type: 'string', description: 'File to format', required: true } }, execute: CodeFormatterTool },
    // Task & Plan Tools
    { name: 'TaskCreateTool', category: 'task', description: 'Create a new task', inputSchema: { title: { type: 'string', description: 'Task title', required: true }, description: { type: 'string', description: 'Task description' } }, execute: TaskCreateTool },
    { name: 'TaskUpdateTool', category: 'task', description: 'Update a task status or details', inputSchema: { taskId: { type: 'string', description: 'Task ID', required: true }, status: { type: 'string', description: 'New status: pending|in_progress|done|failed' }, title: { type: 'string', description: 'New title' } }, execute: TaskUpdateTool },
    { name: 'TaskListTool', category: 'task', description: 'List all tasks', inputSchema: {}, execute: TaskListTool },
    { name: 'TaskDeleteTool', category: 'task', description: 'Delete a task', inputSchema: { taskId: { type: 'string', description: 'Task ID', required: true } }, execute: TaskDeleteTool },
    { name: 'EnterPlanModeTool', category: 'plan', description: 'Enter plan mode (AI plans without executing)', inputSchema: {}, execute: EnterPlanModeTool },
    { name: 'ExitPlanModeTool', category: 'plan', description: 'Exit plan mode (AI can execute changes)', inputSchema: {}, execute: ExitPlanModeTool },
    { name: 'ProgressTrackTool', category: 'task', description: 'Get progress across all tasks', inputSchema: {}, execute: ProgressTrackTool },
    { name: 'TimeEstimateTool', category: 'task', description: 'Estimate time for a task', inputSchema: { description: { type: 'string', description: 'Task description', required: true }, complexity: { type: 'string', description: 'Complexity: low|medium|high|critical' } }, execute: TimeEstimateTool },
    // Agent & Team Tools
    { name: 'AgentTool', category: 'agent', description: 'Spawn a sub-agent with a specific instruction', inputSchema: { instruction: { type: 'string', description: 'Agent instruction', required: true }, agentId: { type: 'string', description: 'Agent ID (optional)' } }, execute: AgentTool },
    { name: 'SendMessageTool', category: 'agent', description: 'Send a message to another agent', inputSchema: { to: { type: 'string', description: 'Recipient agent ID', required: true }, message: { type: 'string', description: 'Message content', required: true } }, execute: SendMessageTool },
    { name: 'TeamCreateTool', category: 'team', description: 'Create a team of agents', inputSchema: { name: { type: 'string', description: 'Team name', required: true }, agents: { type: 'array', description: 'Agent IDs' } }, execute: TeamCreateTool },
    { name: 'TeamDeleteTool', category: 'team', description: 'Delete a team', inputSchema: { teamId: { type: 'string', description: 'Team ID', required: true } }, execute: TeamDeleteTool },
    { name: 'CoordinatorTool', category: 'agent', description: 'Start multi-agent coordination with a plan', inputSchema: { plan: { type: 'string', description: 'Coordination plan', required: true }, agentCount: { type: 'number', description: 'Number of agents' } }, execute: CoordinatorTool },
    { name: 'DelegateTool', category: 'agent', description: 'Delegate a task to a specific agent', inputSchema: { agentId: { type: 'string', description: 'Agent ID', required: true }, task: { type: 'string', description: 'Task to delegate', required: true } }, execute: DelegateTool },
    // Utility & Output Tools
    { name: 'SleepTool', category: 'utility', description: 'Wait for a specified duration', inputSchema: { duration: { type: 'number', description: 'Duration in milliseconds' } }, execute: SleepTool },
    { name: 'SyntheticOutputTool', category: 'output', description: 'Generate structured output in JSON or markdown', inputSchema: { format: { type: 'string', description: 'Output format: json|markdown' }, data: { type: 'any', description: 'Data to output', required: true } }, execute: SyntheticOutputTool },
    { name: 'MemoryStoreTool', category: 'utility', description: 'Store persistent memory', inputSchema: { key: { type: 'string', description: 'Memory key', required: true }, value: { type: 'any', description: 'Value to store', required: true } }, execute: MemoryStoreTool },
    { name: 'MemoryRecallTool', category: 'utility', description: 'Recall stored memory', inputSchema: { key: { type: 'string', description: 'Memory key', required: true } }, execute: MemoryRecallTool },
    { name: 'SnippetGeneratorTool', category: 'code', description: 'Generate code snippets (component, hook, context, types, test, api)', inputSchema: { type: { type: 'string', description: 'Snippet type', required: true }, name: { type: 'string', description: 'Name', required: true } }, execute: SnippetGeneratorTool },
    { name: 'DiffTool', category: 'utility', description: 'Compare two files and show differences', inputSchema: { file1: { type: 'string', description: 'First file', required: true }, file2: { type: 'string', description: 'Second file', required: true } }, execute: DiffTool },
    { name: 'BashTool', category: 'utility', description: 'Execute shell commands (simulated: ls, cat, wc, echo, pwd, date)', inputSchema: { command: { type: 'string', description: 'Command to execute', required: true } }, execute: BashTool },
    { name: 'NotebookEditTool', category: 'code', description: 'Edit a Jupyter notebook cell', inputSchema: { fileName: { type: 'string', description: 'Notebook file', required: true }, cellIndex: { type: 'number', description: 'Cell index', required: true }, content: { type: 'string', description: 'New cell content', required: true } }, execute: NotebookEditTool },
  ], [FileReadTool, FileWriteTool, FileEditTool, FileDeleteTool, FileRenameTool, FileCopyTool, FileMoveTool, FileInfoTool, GlobTool, GrepTool, SearchReplaceTool, FindSymbolTool, FindReferencesTool, ToolSearchTool, ErrorParserTool, TSCheckerTool, ProjectInfoTool, LSPTool, DependencyAnalyzerTool, CodeComplexityTool, UnusedCodeTool, CodeFormatterTool, TaskCreateTool, TaskUpdateTool, TaskListTool, TaskDeleteTool, EnterPlanModeTool, ExitPlanModeTool, ProgressTrackTool, TimeEstimateTool, AgentTool, SendMessageTool, TeamCreateTool, TeamDeleteTool, CoordinatorTool, DelegateTool, SleepTool, SyntheticOutputTool, MemoryStoreTool, MemoryRecallTool, SnippetGeneratorTool, DiffTool, BashTool, NotebookEditTool]);

  // Execute a tool by name
  const executeTool = useCallback((toolName: string, input: ToolInput = {}): ToolResult => {
    const start = performance.now();
    const tool = toolDefinitions.find(t => t.name === toolName);
    if (!tool) return { tool: toolName, success: false, result: `Tool '${toolName}' not found. Use ToolSearchTool to find available tools.` };
    try {
      const result = tool.execute(input);
      result.duration = Math.round(performance.now() - start);
      return result;
    } catch (e) {
      return { tool: toolName, success: false, result: String(e), duration: Math.round(performance.now() - start) };
    }
  }, [toolDefinitions]);

  // Parse and execute tool calls from AI response
  const parseAndExecuteToolCalls = useCallback((text: string): { cleanText: string; results: ToolResult[] } => {
    const results: ToolResult[] = [];
    const toolCallRegex = /\[TOOL_CALL:(\w+)\]\n([\s\S]*?)\n?\[\/TOOL_CALL\]/g;
    let match;
    
    while ((match = toolCallRegex.exec(text)) !== null) {
      const toolName = match[1];
      let input: ToolInput = {};
      try {
        input = JSON.parse(match[2]);
      } catch {
        // Try key=value parsing
        const lines = match[2].trim().split('\n');
        for (const line of lines) {
          const [key, ...rest] = line.split('=');
          if (key) input[key.trim()] = rest.join('=').trim();
        }
      }
      const result = executeTool(toolName, input);
      results.push(result);
    }
    
    const cleanText = text.replace(toolCallRegex, '').trim();
    return { cleanText, results };
  }, [executeTool]);

  // Generate tool descriptions for AI system prompt
  const getToolDescriptions = useCallback((): string => {
    const categories = new Map<string, ToolDefinition[]>();
    for (const t of toolDefinitions) {
      if (!categories.has(t.category)) categories.set(t.category, []);
      categories.get(t.category)!.push(t);
    }
    
    let desc = `## Available Tools (${toolDefinitions.length} total)\n\n`;
    desc += `To use a tool, wrap it in [TOOL_CALL:ToolName] blocks with JSON input:\n`;
    desc += `[TOOL_CALL:FileReadTool]\n{"fileName": "App.tsx"}\n[/TOOL_CALL]\n\n`;
    
    for (const [cat, tools] of categories) {
      desc += `### ${cat.toUpperCase()} (${tools.length})\n`;
      for (const t of tools) {
        const requiredParams = Object.entries(t.inputSchema)
          .filter(([, v]) => v.required)
          .map(([k]) => k);
        desc += `- **${t.name}**: ${t.description}`;
        if (requiredParams.length > 0) desc += ` (required: ${requiredParams.join(', ')})`;
        desc += '\n';
      }
      desc += '\n';
    }
    return desc;
  }, [toolDefinitions]);

  // Get tools grouped by category
  const getToolsByCategory = useCallback((): Map<string, ToolDefinition[]> => {
    const categories = new Map<string, ToolDefinition[]>();
    for (const t of toolDefinitions) {
      if (!categories.has(t.category)) categories.set(t.category, []);
      categories.get(t.category)!.push(t);
    }
    return categories;
  }, [toolDefinitions]);

  return {
    tools: toolDefinitions,
    executeTool,
    parseAndExecuteToolCalls,
    getToolDescriptions,
    getToolsByCategory,
    tasks,
    toolCount: toolDefinitions.length,
  };
}