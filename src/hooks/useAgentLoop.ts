import { useCallback, useRef } from 'react';
import type { CodeFile, FileOperation } from './useCodeStore';
import type { Diagnostic } from './useStaticAnalysis';
import type { AIProvider } from './useCodeStore';

// ── Types ──────────────────────────────────────────────────────────────────

export type AgentState =
  | 'idle'
  | 'intent'
  | 'context'
  | 'planning'
  | 'selecting'
  | 'executing'
  | 'building'
  | 'detecting'
  | 'fixing'
  | 'reflecting'
  | 'verifying'
  | 'memory'
  | 'finalizing'
  | 'done'
  | 'error';

export interface AgentStep {
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
  thought: string;
  state: AgentState;
  durationMs: number;
}

export interface AgentLoopResult {
  text: string;
  fileOps: FileOperation[];
  steps: AgentStep[];
}

interface AgentDecision {
  type: 'tool' | 'final';
  tool?: string;
  input?: Record<string, unknown>;
  thought?: string;
  phase?: string;
  state?: string;
  response?: string;
  files?: { name: string; content: string }[];
}

const MAX_ITERATIONS = 50;

// ── State label mapping ────────────────────────────────────────────────────

export const STATE_LABELS: Record<AgentState, string> = {
  idle:       'Idle',
  intent:     '🧠 يفهم الطلب...',
  context:    '📂 يجمع السياق...',
  planning:   '📋 يخطط ويضع المعايير...',
  selecting:  '🔧 يختار الأدوات...',
  executing:  '⚙️ ينفذ ويكتب الملفات...',
  building:   '🏗️ يبني الهيكل الرئيسي...',
  detecting:  '🔍 يكشف الأخطاء...',
  fixing:     '🩺 يصلح تلقائياً...',
  reflecting: '🪞 يفكر ويراجع ما أنجز...',
  verifying:  '✅ يتحقق من اكتمال المهمة...',
  memory:     '🧠 يحفظ السياق...',
  finalizing: '🏁 يُنهي المهمة...',
  done:       '✅ اكتملت المهمة',
  error:      '❌ خطأ',
};

function mapPhase(p: string | undefined): AgentState {
  const map: Record<string, AgentState> = {
    intent:     'intent',
    context:    'context',
    planning:   'planning',
    selecting:  'selecting',
    executing:  'executing',
    execution:  'executing',
    building:   'building',
    detecting:  'detecting',
    parsing:    'detecting',
    fixing:     'fixing',
    fix:        'fixing',
    reflecting: 'reflecting',
    reflect:    'reflecting',
    verifying:  'verifying',
    verify:     'verifying',
    memory:     'memory',
    finalizing: 'finalizing',
    // legacy
    analyzing:  'intent',
    reading:    'context',
    editing:    'executing',
    done:       'done',
  };
  return map[p?.toLowerCase() || ''] || 'intent';
}

// ── Language helper ────────────────────────────────────────────────────────

function getLangFromExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    tsx: 'typescript', ts: 'typescript', jsx: 'javascript', js: 'javascript',
    css: 'css', json: 'json', html: 'html', md: 'markdown', txt: 'plaintext',
  };
  return map[ext] || 'plaintext';
}

// ── Glob pattern → RegExp ──────────────────────────────────────────────────

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\x00/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`, 'i');
}

// ── Tool executor ──────────────────────────────────────────────────────────

function executeTool(
  tool: string,
  input: Record<string, unknown>,
  workingFiles: CodeFile[],
  diagnostics: Diagnostic[],
  memory: Map<string, string>,
): unknown {
  const t = tool.toLowerCase();

  // ── FileList ──────────────────────────────────────────────────────────
  if (t === 'filelist') {
    return {
      files: workingFiles.map(f => ({
        name: f.name,
        language: f.language,
        lines: f.content.split('\n').length,
        size: f.content.length,
      })),
      totalFiles: workingFiles.length,
    };
  }

  // ── FileRead ──────────────────────────────────────────────────────────
  if (t === 'fileread') {
    const fileName = String(input.fileName || input.file || input.path || '');
    const file = workingFiles.find(f => f.name === fileName);
    if (!file) return { error: `File '${fileName}' not found in project` };
    return { fileName, content: file.content, lines: file.content.split('\n').length };
  }

  // ── FileWrite / FileCreate ────────────────────────────────────────────
  if (t === 'filewrite' || t === 'filecreate') {
    const fileName = String(input.fileName || input.name || input.file || '');
    const content = String(input.content || '');
    if (!fileName) return { error: 'fileName is required' };
    if (!content) return { error: 'content is required' };
    const exists = workingFiles.some(f => f.name === fileName);
    return { success: true, fileName, action: exists ? 'updated' : 'created', lines: content.split('\n').length };
  }

  // ── FileEdit ──────────────────────────────────────────────────────────
  if (t === 'fileedit') {
    const fileName = String(input.fileName || input.name || input.file || '');
    const oldString = String(input.oldString || input.old || '');
    const newString = String(input.newString || input.new || '');
    if (!fileName) return { error: 'fileName is required' };
    const file = workingFiles.find(f => f.name === fileName);
    if (!file) return { error: `File '${fileName}' not found` };
    if (!file.content.includes(oldString)) return { error: `oldString not found in '${fileName}'` };
    return { success: true, fileName, action: 'edited', replaced: oldString.slice(0, 60) + '...' };
  }

  // ── FileDelete ────────────────────────────────────────────────────────
  if (t === 'filedelete') {
    const fileName = String(input.fileName || input.name || input.file || '');
    if (!fileName) return { error: 'fileName is required' };
    const exists = workingFiles.some(f => f.name === fileName);
    if (!exists) return { error: `File '${fileName}' not found` };
    return { success: true, fileName, action: 'deleted' };
  }

  // ── GlobTool ──────────────────────────────────────────────────────────
  if (t === 'globtool' || t === 'glob') {
    const pattern = String(input.pattern || input.glob || '**/*');
    let regex: RegExp;
    try { regex = globToRegex(pattern); }
    catch { regex = /.*/; }
    const matches = workingFiles.filter(f => regex.test(f.name));
    return {
      pattern,
      matches: matches.map(f => ({ name: f.name, language: f.language, lines: f.content.split('\n').length })),
      count: matches.length,
    };
  }

  // ── GrepTool ──────────────────────────────────────────────────────────
  if (t === 'greptool' || t === 'grep') {
    const query = String(input.query || input.search || '').toLowerCase();
    if (!query) return { error: 'query is required' };
    const filePattern = String(input.filePattern || input.pattern || '');
    let targetFiles = workingFiles;
    if (filePattern) {
      try {
        const r = globToRegex(filePattern);
        targetFiles = workingFiles.filter(f => r.test(f.name));
      } catch { /* use all files */ }
    }
    const results: { file: string; line: number; content: string }[] = [];
    for (const f of targetFiles) {
      const lines = f.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(query)) {
          results.push({ file: f.name, line: i + 1, content: lines[i].trim() });
          if (results.length >= 60) break;
        }
      }
      if (results.length >= 60) break;
    }
    return { query, results, count: results.length };
  }

  // ── ErrorParser ───────────────────────────────────────────────────────
  if (t === 'errorparser') {
    const errors = diagnostics.filter(d => d.severity === 'error');
    const warnings = diagnostics.filter(d => d.severity === 'warning');
    return {
      total: diagnostics.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      hasErrors: errors.length > 0,
      errors: errors.map(d => ({ file: d.file, line: d.line, column: d.column, message: d.message, type: d.type })),
      warnings: warnings.map(d => ({ file: d.file, line: d.line, message: d.message })),
    };
  }

  // ── TSChecker ─────────────────────────────────────────────────────────
  if (t === 'tschecker') {
    const fileName = String(input.fileName || input.file || '');
    const fileDiags = fileName
      ? diagnostics.filter(d => d.file === fileName)
      : diagnostics;
    return {
      file: fileName || 'all files',
      errors: fileDiags.filter(d => d.severity === 'error').map(d => ({ line: d.line, column: d.column, message: d.message, type: d.type })),
      warnings: fileDiags.filter(d => d.severity === 'warning').map(d => ({ line: d.line, column: d.column, message: d.message })),
      hasErrors: fileDiags.some(d => d.severity === 'error'),
      total: fileDiags.length,
    };
  }

  // ── SearchCode ────────────────────────────────────────────────────────
  if (t === 'searchcode') {
    const query = String(input.query || input.search || '').toLowerCase();
    if (!query) return { error: 'query is required' };
    const results: { file: string; line: number; content: string }[] = [];
    for (const f of workingFiles) {
      const lines = f.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(query)) {
          results.push({ file: f.name, line: i + 1, content: lines[i].trim() });
          if (results.length >= 30) break;
        }
      }
      if (results.length >= 30) break;
    }
    return { query, results, count: results.length };
  }

  // ── ProjectInfo ───────────────────────────────────────────────────────
  if (t === 'projectinfo') {
    const byType: Record<string, number> = {};
    let totalLines = 0;
    for (const f of workingFiles) {
      const ext = f.name.split('.').pop() || 'unknown';
      byType[ext] = (byType[ext] || 0) + 1;
      totalLines += f.content.split('\n').length;
    }
    return {
      files: workingFiles.map(f => ({ name: f.name, language: f.language, lines: f.content.split('\n').length })),
      totalFiles: workingFiles.length,
      totalLines,
      byType,
      errors: diagnostics.filter(d => d.severity === 'error').length,
      warnings: diagnostics.filter(d => d.severity === 'warning').length,
    };
  }

  // ── MemoryStore ───────────────────────────────────────────────────────
  if (t === 'memorystore' || t === 'memoryset') {
    const key = String(input.key || '');
    const value = String(input.value || '');
    if (!key) return { error: 'key is required' };
    memory.set(key, value);
    return { success: true, key, stored: true, totalKeys: memory.size };
  }

  // ── MemoryRead ────────────────────────────────────────────────────────
  if (t === 'memoryread' || t === 'memoryget' || t === 'memoryrecall') {
    const key = String(input.key || '');
    if (!key) {
      const all: Record<string, string> = {};
      memory.forEach((v, k) => { all[k] = v; });
      return { all, count: memory.size };
    }
    const value = memory.get(key);
    if (value === undefined) return { error: `No memory found for key '${key}'` };
    return { key, value };
  }

  // ── PlanCreate ────────────────────────────────────────────────────────
  if (t === 'plancreate' || t === 'plan') {
    const steps = Array.isArray(input.steps) ? (input.steps as string[]) : [];
    const goal = String(input.goal || '');
    const successCriteria = Array.isArray(input.success_criteria) ? (input.success_criteria as string[]) : [];
    const minFiles = Number(input.minimum_files || 6);
    memory.set('__plan__', JSON.stringify({ steps, goal, successCriteria, minFiles }));
    if (goal) memory.set('__goal__', goal);
    if (successCriteria.length) memory.set('__criteria__', JSON.stringify(successCriteria));
    memory.set('__min_files__', String(minFiles));
    return { success: true, plan: steps, goal, successCriteria, minFiles, stepsCount: steps.length };
  }

  // ── ReflectTool ─────────────────────────────────────────────────────────
  if (t === 'reflecttool' || t === 'reflect') {
    const what_done    = String(input.what_done    || '');
    const what_missing = String(input.what_missing || '');
    const next         = String(input.next         || 'continue');
    const lm = what_missing.toLowerCase().trim();
    const has_missing  = lm !== '' && lm !== 'none' && lm !== 'nothing' && lm !== 'n/a' && lm !== '-';
    memory.set('__reflection__', JSON.stringify({ what_done, what_missing, next, ts: Date.now() }));
    return {
      stored: true,
      has_missing_work: has_missing,
      action_required: has_missing
        ? 'CONTINUE — missing work detected, keep writing files'
        : 'READY — all work complete, proceed to GoalCheckTool',
      reflection: { what_done, what_missing, next },
    };
  }

  // ── GoalCheckTool ────────────────────────────────────────────────────────
  if (t === 'goalchecktool' || t === 'goalcheck') {
    const criteria  = Array.isArray(input.criteria) ? (input.criteria as string[]) : [];
    const minFiles  = Number(memory.get('__min_files__') || 6);
    const errorCount = diagnostics.filter(d => d.severity === 'error').length;
    const results: { criterion: string; met: boolean; detail: string }[] = [];

    for (const criterion of criteria) {
      const lc = criterion.toLowerCase();

      if (lc.includes('no error') || lc.includes('0 error') || lc.includes('errors = 0')) {
        results.push({ criterion, met: errorCount === 0, detail: `${errorCount} errors` });
        continue;
      }

      if (lc.includes('app.tsx') && (lc.includes('updated') || lc.includes('rewritten') || lc.includes('no counter') || lc.includes('no default'))) {
        const app = workingFiles.find(f => f.name === 'App.tsx');
        const isDefault = !app || app.content.includes('Count:') || (app.content.includes('count') && app.content.includes('setCount') && !app.content.includes('Route'));
        results.push({ criterion, met: !isDefault, detail: isDefault ? 'App.tsx still has default counter — MUST rewrite' : 'App.tsx has been rewritten' });
        continue;
      }

      if (lc.includes('routing') || lc.includes('router') || lc.includes('route')) {
        const app = workingFiles.find(f => f.name === 'App.tsx');
        const hasRouting = !!(app?.content.includes('Route') || app?.content.includes('Router') || app?.content.includes('BrowserRouter'));
        results.push({ criterion, met: hasRouting, detail: hasRouting ? 'Routing found in App.tsx' : 'No routing — add react-router-dom' });
        continue;
      }

      if (lc.includes('app.css') && (lc.includes('updated') || lc.includes('rewritten'))) {
        const css = workingFiles.find(f => f.name === 'App.css');
        const isDefault = !css || css.content.includes('.app {') && css.content.length < 500;
        results.push({ criterion, met: !isDefault, detail: isDefault ? 'App.css still has placeholder' : 'App.css updated' });
        continue;
      }

      if (lc.match(/\d+\+?\s*files/) || lc.includes('minimum files') || lc.includes('enough files') || lc.includes('6+ files') || lc.includes('multiple files')) {
        const numMatch = lc.match(/(\d+)/);
        const required = numMatch ? parseInt(numMatch[1]) : minFiles;
        results.push({ criterion, met: workingFiles.length >= required, detail: `${workingFiles.length} files exist (need ${required})` });
        continue;
      }

      results.push({ criterion, met: workingFiles.length >= minFiles, detail: `${workingFiles.length} files` });
    }

    const allMet = results.every(r => r.met);
    const readyToFinalize = allMet && errorCount === 0;

    return {
      criteria: results,
      all_met: allMet,
      errors: errorCount,
      file_count: workingFiles.length,
      ready_to_finalize: readyToFinalize,
      summary: readyToFinalize
        ? '✅ All criteria met — safe to send final'
        : `❌ NOT ready — ${results.filter(r => !r.met).map(r => r.detail).join('; ')}`,
    };
  }

  // ── VerifyCodeTool ───────────────────────────────────────────────────────
  if (t === 'verifycodetool' || t === 'verifycode') {
    const pattern = String(input.pattern || input.check || '');
    const inFile  = String(input.inFile  || input.file  || '');
    if (!pattern) return { error: 'pattern is required' };

    const targetFiles = inFile
      ? workingFiles.filter(f => f.name === inFile)
      : workingFiles;

    let regex: RegExp;
    try   { regex = new RegExp(pattern, 'i'); }
    catch { regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }

    const results: { file: string; found: boolean; line?: number; snippet?: string }[] = [];
    for (const f of targetFiles) {
      const lines = f.content.split('\n');
      let found = false;
      let foundLine: number | undefined;
      let snippet: string | undefined;
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          found = true; foundLine = i + 1; snippet = lines[i].trim().slice(0, 80);
          break;
        }
      }
      results.push({ file: f.name, found, line: foundLine, snippet });
    }

    const anyFound = results.some(r => r.found);
    return { pattern, inFile: inFile || 'all files', found: anyFound, count: results.filter(r => r.found).length, results };
  }

  return { error: `Unknown tool: '${tool}'. Available: FileList, FileRead, FileWrite, FileEdit, FileDelete, GlobTool, GrepTool, ErrorParser, TSChecker, ProjectInfo, SearchCode, MemoryStore, MemoryRead, PlanCreate, ReflectTool, GoalCheckTool, VerifyCodeTool` };
}

// ── Main hook ──────────────────────────────────────────────────────────────

export function useAgentLoop() {
  const abortRef = useRef(false);
  const memoryRef = useRef<Map<string, string>>(new Map());

  const run = useCallback(async (
    userPrompt: string,
    files: CodeFile[],
    diagnostics: Diagnostic[],
    provider: AIProvider,
    onStateChange: (state: AgentState, thought?: string) => void,
    onStep: (step: AgentStep) => void,
  ): Promise<AgentLoopResult> => {
    abortRef.current = false;

    const messages: { role: string; content: string }[] = [
      { role: 'user', content: userPrompt },
    ];

    const steps: AgentStep[] = [];
    let workingFiles: CodeFile[] = files.map(f => ({ ...f }));
    const fileOps: FileOperation[] = [];
    const memory = memoryRef.current;

    onStateChange('intent', 'يحلل الطلب...');
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      if (abortRef.current) break;
      iterations++;

      let decision: AgentDecision;
      try {
        const res = await fetch('/api/agent/think', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages,
            files: workingFiles.map(f => ({ name: f.name, content: f.content })),
            diagnostics,
            provider,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Server error ${res.status}`);
        }
        decision = await res.json();
      } catch (err) {
        onStateChange('error', String(err));
        return { text: `Agent error: ${String(err)}`, fileOps, steps };
      }

      // ── FINAL ──────────────────────────────────────────────────────────
      if (decision.type === 'final') {
        onStateChange('done', decision.thought);

        if (Array.isArray(decision.files)) {
          for (const f of decision.files) {
            if (!f.name || !f.content) continue;
            fileOps.push({ filename: f.name, content: f.content, type: 'create' });
            const idx = workingFiles.findIndex(w => w.name === f.name);
            if (idx >= 0) {
              workingFiles[idx] = { ...workingFiles[idx], content: f.content };
            } else {
              workingFiles.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: f.name,
                language: getLangFromExt(f.name),
                content: f.content,
              });
            }
          }
        }
        return { text: decision.response || '✅ اكتملت المهمة بنجاح', fileOps, steps };
      }

      // ── TOOL CALL ───────────────────────────────────────────────────────
      if (decision.type === 'tool' && decision.tool) {
        const phase = mapPhase(decision.phase || decision.state);
        onStateChange(phase, decision.thought);

        const t0 = Date.now();
        const toolInput = decision.input || {};
        const toolName = decision.tool;

        // Execute tool client-side
        const toolResult = executeTool(toolName, toolInput, workingFiles, diagnostics, memory);
        const durationMs = Date.now() - t0;

        const step: AgentStep = {
          tool: toolName,
          input: toolInput,
          result: toolResult,
          thought: decision.thought || '',
          state: phase,
          durationMs,
        };
        steps.push(step);
        onStep(step);

        const tl = toolName.toLowerCase();

        // FileWrite / FileCreate — apply to working files AND accumulate fileOps
        if (tl === 'filewrite' || tl === 'filecreate') {
          const fileName = String(toolInput.fileName || toolInput.name || toolInput.file || '');
          const content = String(toolInput.content || '');
          if (fileName && content) {
            const idx = workingFiles.findIndex(w => w.name === fileName);
            if (idx >= 0) {
              workingFiles[idx] = { ...workingFiles[idx], content };
            } else {
              workingFiles.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: fileName,
                language: getLangFromExt(fileName),
                content,
              });
            }
            const existingOpIdx = fileOps.findIndex(op => op.filename === fileName);
            if (existingOpIdx >= 0) {
              fileOps[existingOpIdx] = { filename: fileName, content, type: 'update' };
            } else {
              fileOps.push({ filename: fileName, content, type: 'create' });
            }
          }
        }

        // FileEdit — apply in-place surgical replacement
        if (tl === 'fileedit') {
          const fileName = String(toolInput.fileName || toolInput.name || toolInput.file || '');
          const oldString = String(toolInput.oldString || toolInput.old || '');
          const newString = String(toolInput.newString || toolInput.new || '');
          if (fileName && oldString !== undefined) {
            const idx = workingFiles.findIndex(w => w.name === fileName);
            if (idx >= 0) {
              const newContent = workingFiles[idx].content.replace(oldString, newString);
              workingFiles[idx] = { ...workingFiles[idx], content: newContent };
              const existingOpIdx = fileOps.findIndex(op => op.filename === fileName);
              if (existingOpIdx >= 0) {
                fileOps[existingOpIdx] = { filename: fileName, content: newContent, type: 'update' };
              } else {
                fileOps.push({ filename: fileName, content: newContent, type: 'update' });
              }
            }
          }
        }

        // FileDelete
        if (tl === 'filedelete') {
          const fileName = String(toolInput.fileName || toolInput.name || toolInput.file || '');
          if (fileName) {
            workingFiles = workingFiles.filter(w => w.name !== fileName);
            fileOps.push({ filename: fileName, content: '', type: 'delete' });
          }
        }

        // Add to conversation
        messages.push({
          role: 'assistant',
          content: JSON.stringify({
            type: 'tool',
            tool: toolName,
            input: toolInput,
            thought: decision.thought,
            phase: decision.phase,
          }),
        });
        messages.push({
          role: 'user',
          content: JSON.stringify({
            type: 'tool_result',
            tool: toolName,
            result: toolResult,
            success: true,
          }),
        });

        // ── Smart Stop Condition ──────────────────────────────────────────
        // If GoalCheckTool says ready_to_finalize=true, inject a strong system
        // hint so the AI knows it MUST send "final" on the very next turn.
        if ((tl === 'goalchecktool' || tl === 'goalcheck') && (toolResult as Record<string, unknown>).ready_to_finalize === true) {
          messages.push({
            role: 'user',
            content: JSON.stringify({
              type: 'system',
              message: '✅ SMART STOP: GoalCheckTool confirmed all criteria are met and 0 errors. You MUST now send the "final" JSON response immediately. Do NOT call any more tools.',
            }),
          });
        }

        // Also stop if ReflectTool says has_missing_work is false and
        // the project already has 6+ files (safety net for lazy agents)
        if ((tl === 'reflecttool' || tl === 'reflect') &&
            (toolResult as Record<string, unknown>).has_missing_work === false &&
            workingFiles.length >= 6) {
          messages.push({
            role: 'user',
            content: JSON.stringify({
              type: 'system',
              message: `🪞 REFLECTION PASSED: No missing work. ${workingFiles.length} files exist. Now call GoalCheckTool to confirm all criteria, then send "final".`,
            }),
          });
        }
      }
    }

    onStateChange('done', 'اكتمل (وصل الحد الأقصى للدورات)');
    return { text: '✅ اكتمل التنفيذ', fileOps, steps };
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const clearMemory = useCallback(() => {
    memoryRef.current.clear();
  }, []);

  return { run, abort, clearMemory };
}
