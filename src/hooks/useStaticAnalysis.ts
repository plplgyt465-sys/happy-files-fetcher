import { useMemo } from 'react';
import type { CodeFile } from './useCodeStore';

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  type: 'SyntaxError' | 'Warning' | 'Info';
  severity: 'error' | 'warning' | 'info';
}

function analyzeFile(file: CodeFile, allFiles: CodeFile[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = file.content.split('\n');
  const isTsx = /\.(tsx|jsx|ts|js)$/.test(file.name);

  if (!isTsx) return diagnostics;

  // 1. Detect duplicate variable declarations
  const declared = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match const/let/var declarations
    const varMatch = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)/);
    if (varMatch) {
      const name = varMatch[1];
      if (declared.has(name)) {
        diagnostics.push({
          file: file.name,
          line: i + 1,
          column: (line.indexOf(name) || 0) + 1,
          message: `Duplicate declaration: '${name}' was already declared at line ${declared.get(name)}`,
          type: 'Warning',
          severity: 'warning',
        });
      } else {
        declared.set(name, i + 1);
      }
    }
    // Match function declarations
    const fnMatch = line.match(/^\s*(?:export\s+)?function\s+(\w+)/);
    if (fnMatch) {
      const name = fnMatch[1];
      if (declared.has(name)) {
        diagnostics.push({
          file: file.name,
          line: i + 1,
          column: (line.indexOf(name) || 0) + 1,
          message: `Duplicate declaration: '${name}' was already declared at line ${declared.get(name)}`,
          type: 'Warning',
          severity: 'warning',
        });
      } else {
        declared.set(name, i + 1);
      }
    }
  }

  // 2. Detect missing imports (references to unknown identifiers in JSX)
  const importedNames = new Set<string>();
  const localNames = new Set(declared.keys());
  // Common globals that don't need imports
  const globals = new Set([
    'React', 'console', 'window', 'document', 'Math', 'JSON', 'Date',
    'Array', 'Object', 'String', 'Number', 'Boolean', 'Promise',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'fetch', 'alert', 'confirm', 'prompt', 'undefined', 'null',
    'true', 'false', 'NaN', 'Infinity', 'parseInt', 'parseFloat',
    'Map', 'Set', 'Error', 'RegExp', 'Symbol',
  ]);

  for (const line of lines) {
    // Collect imported names
    const importMatch = line.match(/import\s+(?:type\s+)?(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]+)\})?\s+from/);
    if (importMatch) {
      if (importMatch[1]) importedNames.add(importMatch[1]);
      if (importMatch[2]) {
        importMatch[2].split(',').forEach(n => {
          const name = n.trim().split(/\s+as\s+/).pop()?.trim();
          if (name) importedNames.add(name);
        });
      }
    }
    const nsImport = line.match(/import\s+\*\s+as\s+(\w+)\s+from/);
    if (nsImport) importedNames.add(nsImport[1]);
  }

  // Check JSX component usage (capitalized tags like <ComponentName)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const jsxTags = line.matchAll(/<([A-Z]\w+)/g);
    for (const m of jsxTags) {
      const tag = m[1];
      if (!importedNames.has(tag) && !localNames.has(tag) && !globals.has(tag)) {
        diagnostics.push({
          file: file.name,
          line: i + 1,
          column: (m.index || 0) + 1,
          message: `'${tag}' is used but not imported or declared`,
          type: 'Warning',
          severity: 'warning',
        });
      }
    }
  }

  // 3. Detect unmatched brackets/braces/parens (basic syntax validation)
  const stack: { char: string; line: number }[] = [];
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const closers = new Set([')', '}', ']']);
  let inString = false;
  let stringChar = '';
  let inComment = false;
  let inLineComment = false;
  let inTemplate = false;

  for (let i = 0; i < lines.length; i++) {
    inLineComment = false;
    for (let j = 0; j < lines[i].length; j++) {
      const ch = lines[i][j];
      const prev = j > 0 ? lines[i][j - 1] : '';
      const next = j < lines[i].length - 1 ? lines[i][j + 1] : '';

      if (inLineComment) break;
      if (inComment) {
        if (ch === '*' && next === '/') { inComment = false; j++; }
        continue;
      }
      if (inString) {
        if (ch === stringChar && prev !== '\\') inString = false;
        continue;
      }
      if (inTemplate) {
        if (ch === '`' && prev !== '\\') inTemplate = false;
        continue;
      }

      if (ch === '/' && next === '/') { inLineComment = true; continue; }
      if (ch === '/' && next === '*') { inComment = true; j++; continue; }
      if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
      if (ch === '`') { inTemplate = true; continue; }

      if (pairs[ch]) {
        stack.push({ char: ch, line: i + 1 });
      } else if (closers.has(ch)) {
        const expected = stack.pop();
        if (!expected) {
          diagnostics.push({
            file: file.name, line: i + 1, column: j + 1,
            message: `Unexpected '${ch}' — no matching opening bracket`,
            type: 'SyntaxError', severity: 'error',
          });
        } else if (pairs[expected.char] !== ch) {
          diagnostics.push({
            file: file.name, line: i + 1, column: j + 1,
            message: `Mismatched bracket: expected '${pairs[expected.char]}' but found '${ch}' (opened at line ${expected.line})`,
            type: 'SyntaxError', severity: 'error',
          });
        }
      }
    }
  }

  for (const unclosed of stack) {
    diagnostics.push({
      file: file.name, line: unclosed.line, column: 0,
      message: `Unclosed '${unclosed.char}' — missing '${pairs[unclosed.char]}'`,
      type: 'SyntaxError', severity: 'error',
    });
  }

  // 4. Detect import of files that don't exist in the project
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const importPath = line.match(/from\s+['"]\.\/([^'"]+)['"]/);
    if (importPath) {
      const importedFile = importPath[1];
      const possibleNames = [
        importedFile,
        importedFile + '.tsx', importedFile + '.ts',
        importedFile + '.jsx', importedFile + '.js',
        importedFile + '.css',
      ];
      const exists = allFiles.some(f => possibleNames.includes(f.name));
      if (!exists && !importedFile.endsWith('.css')) {
        diagnostics.push({
          file: file.name, line: i + 1, column: 1,
          message: `Import '${importedFile}' — file not found in project`,
          type: 'Warning', severity: 'warning',
        });
      }
    }
  }

  return diagnostics;
}

export function useStaticAnalysis(files: CodeFile[]): Diagnostic[] {
  return useMemo(() => {
    const all: Diagnostic[] = [];
    for (const file of files) {
      all.push(...analyzeFile(file, files));
    }
    return all;
  }, [files]);
}
