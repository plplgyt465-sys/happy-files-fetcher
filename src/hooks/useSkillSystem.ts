import { useCallback, useMemo } from 'react';
import type { ToolResult, ToolInput } from './useToolSystem';

export interface SkillStep {
  tool: string;
  input: ToolInput;
  description: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  icon: string;
  steps: SkillStep[];
  requiredInput?: Record<string, { type: string; description: string }>;
}

export type SkillCategory =
  | 'project'
  | 'refactor'
  | 'analysis'
  | 'generation'
  | 'workflow'
  | 'debug'
  | 'testing'
  | 'documentation'
  | 'web';

export interface SkillExecutionResult {
  skill: string;
  success: boolean;
  stepResults: ToolResult[];
  summary: string;
  duration: number;
}

export function useSkillSystem(
  executeTool: (name: string, input?: ToolInput) => ToolResult
) {
  // ════════════════════════════════════════════════════════════════
  //  16 SKILLS
  // ════════════════════════════════════════════════════════════════

  const skills: SkillDefinition[] = useMemo(() => [
    // 1. Project Scaffold
    {
      id: 'scaffold-react',
      name: 'React Project Scaffold',
      description: 'Create a complete React TypeScript project with App, styles, and entry point',
      category: 'project',
      icon: '🏗️',
      steps: [
        { tool: 'SnippetGeneratorTool', input: { type: 'component', name: 'App' }, description: 'Generate App component' },
        { tool: 'FileWriteTool', input: { fileName: 'App.css', content: '.app {\n  text-align: center;\n  padding: 2rem;\n  min-height: 100vh;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  background: linear-gradient(135deg, #0f172a, #1e293b);\n  color: #e2e8f0;\n}\n\nh1 {\n  font-size: 2.5rem;\n  background: linear-gradient(90deg, #22d3ee, #a78bfa);\n  -webkit-background-clip: text;\n  -webkit-text-fill-color: transparent;\n}' }, description: 'Create default styles' },
        { tool: 'FileWriteTool', input: { fileName: 'index.tsx', content: "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nconst root = ReactDOM.createRoot(document.getElementById('root')!);\nroot.render(<App />);" }, description: 'Create entry point' },
        { tool: 'TaskCreateTool', input: { title: 'Project scaffolded', description: 'Basic React project created' }, description: 'Track completion' },
      ],
    },
    // 2. Component Generator
    {
      id: 'generate-component',
      name: 'Component Generator',
      description: 'Generate a new React component with props interface and default export',
      category: 'generation',
      icon: '🧩',
      requiredInput: { name: { type: 'string', description: 'Component name' } },
      steps: [
        { tool: 'SnippetGeneratorTool', input: { type: 'component', name: '{{name}}' }, description: 'Generate component code' },
        { tool: 'FileWriteTool', input: { fileName: '{{name}}.tsx', content: '{{previousResult}}' }, description: 'Write component file' },
      ],
    },
    // 3. Hook Generator
    {
      id: 'generate-hook',
      name: 'Custom Hook Generator',
      description: 'Generate a custom React hook with state and effects',
      category: 'generation',
      icon: '🪝',
      requiredInput: { name: { type: 'string', description: 'Hook name (without "use" prefix)' } },
      steps: [
        { tool: 'SnippetGeneratorTool', input: { type: 'hook', name: '{{name}}' }, description: 'Generate hook code' },
        { tool: 'FileWriteTool', input: { fileName: 'use{{name}}.ts', content: '{{previousResult}}' }, description: 'Write hook file' },
      ],
    },
    // 4. Simplify (Claude Code-inspired — parallel quality review)
    {
      id: 'simplify',
      name: 'Simplify & Review',
      description: 'Run a multi-dimension code review: reuse opportunities, quality issues, and efficiency improvements',
      category: 'analysis',
      icon: '🔍',
      steps: [
        { tool: 'ProjectInfoTool', input: {}, description: 'Survey project structure' },
        { tool: 'UnusedCodeTool', input: {}, description: 'Agent 1: Find reuse opportunities (dead/duplicate code)' },
        { tool: 'ErrorParserTool', input: {}, description: 'Agent 2: Check code quality (errors, warnings)' },
        { tool: 'DependencyAnalyzerTool', input: {}, description: 'Agent 3: Efficiency review (dependency graph)' },
      ],
    },
    // 5. File Complexity Audit
    {
      id: 'complexity-audit',
      name: 'Complexity Audit',
      description: 'Measure cyclomatic complexity for all TypeScript files',
      category: 'analysis',
      icon: '📊',
      steps: [
        { tool: 'GlobTool', input: { pattern: '*.tsx' }, description: 'Find TypeScript files' },
        { tool: 'ProjectInfoTool', input: {}, description: 'Get project stats' },
      ],
    },
    // 6. Debug Workflow (Claude Code-inspired)
    {
      id: 'fix-errors',
      name: 'Debug Workflow',
      description: 'Detect TypeScript/lint errors, read affected files, create a repair checklist, and prepare targeted fixes',
      category: 'debug',
      icon: '🔧',
      steps: [
        { tool: 'ErrorParserTool', input: {}, description: 'Parse all TypeScript and lint errors' },
        { tool: 'ProjectInfoTool', input: {}, description: 'Inspect project state' },
        { tool: 'TodoWriteTool', input: { todos: [{ id: '1', content: 'Identify root cause', status: 'pending', priority: 'high' }, { id: '2', content: 'Apply targeted fix', status: 'pending', priority: 'high' }, { id: '3', content: 'Verify fix resolves error', status: 'pending', priority: 'medium' }] }, description: 'Create repair checklist' },
        { tool: 'EnterPlanModeTool', input: {}, description: 'Enter plan mode to prepare targeted fixes' },
      ],
    },
    // 7. Search & Replace Workflow
    {
      id: 'search-replace',
      name: 'Global Search & Replace',
      description: 'Search for text across all files and replace it',
      category: 'refactor',
      icon: '🔄',
      requiredInput: { search: { type: 'string', description: 'Text to search for' }, replace: { type: 'string', description: 'Replacement text' } },
      steps: [
        { tool: 'GrepTool', input: { query: '{{search}}' }, description: 'Find occurrences' },
        { tool: 'SearchReplaceTool', input: { search: '{{search}}', replace: '{{replace}}' }, description: 'Replace all' },
      ],
    },
    // 8. Rename Symbol
    {
      id: 'rename-symbol',
      name: 'Rename Symbol',
      description: 'Find and rename a symbol across all files',
      category: 'refactor',
      icon: '✏️',
      requiredInput: { oldName: { type: 'string', description: 'Current symbol name' }, newName: { type: 'string', description: 'New symbol name' } },
      steps: [
        { tool: 'FindReferencesTool', input: { symbol: '{{oldName}}' }, description: 'Find all references' },
        { tool: 'SearchReplaceTool', input: { search: '{{oldName}}', replace: '{{newName}}' }, description: 'Rename everywhere' },
      ],
    },
    // 9. Test Generator
    {
      id: 'generate-test',
      name: 'Test File Generator',
      description: 'Generate a test file for a component or function',
      category: 'testing',
      icon: '🧪',
      requiredInput: { name: { type: 'string', description: 'Name of the module to test' } },
      steps: [
        { tool: 'SnippetGeneratorTool', input: { type: 'test', name: '{{name}}' }, description: 'Generate test code' },
        { tool: 'FileWriteTool', input: { fileName: '{{name}}.test.ts', content: '{{previousResult}}' }, description: 'Write test file' },
      ],
    },
    // 10. API Service Generator
    {
      id: 'generate-api',
      name: 'API Service Generator',
      description: 'Generate API service functions for data fetching',
      category: 'generation',
      icon: '🌐',
      requiredInput: { name: { type: 'string', description: 'Service name' } },
      steps: [
        { tool: 'SnippetGeneratorTool', input: { type: 'api', name: '{{name}}' }, description: 'Generate API service' },
        { tool: 'FileWriteTool', input: { fileName: '{{name}}Service.ts', content: '{{previousResult}}' }, description: 'Write service file' },
      ],
    },
    // 11. Context Provider Generator
    {
      id: 'generate-context',
      name: 'Context Provider Generator',
      description: 'Generate a React Context with Provider and custom hook',
      category: 'generation',
      icon: '🔗',
      requiredInput: { name: { type: 'string', description: 'Context name' } },
      steps: [
        { tool: 'SnippetGeneratorTool', input: { type: 'context', name: '{{name}}' }, description: 'Generate context code' },
        { tool: 'FileWriteTool', input: { fileName: '{{name}}Context.tsx', content: '{{previousResult}}' }, description: 'Write context file' },
      ],
    },
    // 12. Type Generator
    {
      id: 'generate-types',
      name: 'Type Definitions Generator',
      description: 'Generate TypeScript type/interface definitions',
      category: 'generation',
      icon: '📐',
      requiredInput: { name: { type: 'string', description: 'Type name' } },
      steps: [
        { tool: 'SnippetGeneratorTool', input: { type: 'types', name: '{{name}}' }, description: 'Generate type definitions' },
        { tool: 'FileWriteTool', input: { fileName: 'types/{{name}}.ts', content: '{{previousResult}}' }, description: 'Write types file' },
      ],
    },
    // 13. Documentation Generator
    {
      id: 'generate-docs',
      name: 'Project Documentation',
      description: 'Generate README and project documentation from code analysis',
      category: 'documentation',
      icon: '📝',
      steps: [
        { tool: 'ProjectInfoTool', input: {}, description: 'Analyze project structure' },
        { tool: 'DependencyAnalyzerTool', input: {}, description: 'Map dependencies' },
        { tool: 'TaskCreateTool', input: { title: 'Generate README.md', description: 'Create project documentation' }, description: 'Track docs task' },
      ],
    },
    // 14. Performance Analysis
    {
      id: 'perf-analysis',
      name: 'Performance Analysis',
      description: 'Analyze code for potential performance issues',
      category: 'analysis',
      icon: '⚡',
      steps: [
        { tool: 'GrepTool', input: { query: 'useEffect' }, description: 'Find effects' },
        { tool: 'GrepTool', input: { query: 'useState' }, description: 'Find state usage' },
        { tool: 'GrepTool', input: { query: 'useMemo' }, description: 'Find memoization' },
        { tool: 'GrepTool', input: { query: 'useCallback' }, description: 'Find callbacks' },
      ],
    },
    // 15. Security Scan
    {
      id: 'security-scan',
      name: 'Security Scan',
      description: 'Scan code for common security issues',
      category: 'analysis',
      icon: '🔒',
      steps: [
        { tool: 'GrepTool', input: { query: 'dangerouslySetInnerHTML' }, description: 'Check for XSS risks' },
        { tool: 'GrepTool', input: { query: 'eval(' }, description: 'Check for eval usage' },
        { tool: 'GrepTool', input: { query: 'innerHTML' }, description: 'Check for innerHTML' },
        { tool: 'GrepTool', input: { query: 'localStorage' }, description: 'Check for localStorage usage' },
      ],
    },
    // 16. Memory Manager (Claude Code-inspired 'remember' skill)
    {
      id: 'memory-manage',
      name: 'Memory Manager',
      description: 'Review and organize project memories — recall stored context and classify into project, personal, or temporary',
      category: 'workflow',
      icon: '🧠',
      steps: [
        { tool: 'MemoryRecallTool', input: { key: 'project_preferences' }, description: 'Recall project preferences' },
        { tool: 'MemoryRecallTool', input: { key: 'coding_style' }, description: 'Recall coding style guide' },
        { tool: 'ProjectInfoTool', input: {}, description: 'Get current project state' },
        { tool: 'MemoryStoreTool', input: { key: 'last_session', value: new Date().toISOString() }, description: 'Record session timestamp' },
      ],
    },
  ], []);

  // Execute a skill
  const executeSkill = useCallback((skillId: string, userInput: Record<string, string> = {}): SkillExecutionResult => {
    const start = performance.now();
    const skill = skills.find(s => s.id === skillId);
    if (!skill) {
      return { skill: skillId, success: false, stepResults: [], summary: `Skill '${skillId}' not found`, duration: 0 };
    }

    const stepResults: ToolResult[] = [];
    let previousResult = '';

    for (const step of skill.steps) {
      // Resolve template variables in input
      const resolvedInput: ToolInput = {};
      for (const [key, value] of Object.entries(step.input)) {
        if (typeof value === 'string') {
          let resolved = value;
          // Replace {{name}}, {{search}}, etc. with user input
          for (const [uKey, uValue] of Object.entries(userInput)) {
            resolved = resolved.replace(new RegExp(`\\{\\{${uKey}\\}\\}`, 'g'), uValue);
          }
          // Replace {{previousResult}} with last tool output
          resolved = resolved.replace(/\{\{previousResult\}\}/g, previousResult);
          resolvedInput[key] = resolved;
        } else {
          resolvedInput[key] = value;
        }
      }

      const result = executeTool(step.tool, resolvedInput);
      stepResults.push(result);

      // Capture result for next step
      if (result.success && typeof result.result === 'object' && result.result !== null) {
        const r = result.result as Record<string, unknown>;
        previousResult = String(r.snippet || r.content || JSON.stringify(result.result));
      } else if (result.success) {
        previousResult = String(result.result);
      }
    }

    const allSuccess = stepResults.every(r => r.success);
    const duration = Math.round(performance.now() - start);
    
    return {
      skill: skill.name,
      success: allSuccess,
      stepResults,
      summary: allSuccess
        ? `✅ ${skill.name} completed (${stepResults.length} steps, ${duration}ms)`
        : `⚠️ ${skill.name} partially completed (some steps failed)`,
      duration,
    };
  }, [skills, executeTool]);

  // Get skills grouped by category
  const getSkillsByCategory = useCallback((): Map<string, SkillDefinition[]> => {
    const categories = new Map<string, SkillDefinition[]>();
    for (const s of skills) {
      if (!categories.has(s.category)) categories.set(s.category, []);
      categories.get(s.category)!.push(s);
    }
    return categories;
  }, [skills]);

  // Generate skill descriptions for AI
  const getSkillDescriptions = useCallback((): string => {
    let desc = `## Available Skills (${skills.length} total)\n\n`;
    desc += `To use a skill, wrap it in [SKILL:skill-id] blocks:\n`;
    desc += `[SKILL:scaffold-react]\n{}\n[/SKILL]\n\n`;
    desc += `For skills with required input:\n`;
    desc += `[SKILL:generate-component]\n{"name": "MyButton"}\n[/SKILL]\n\n`;
    
    for (const s of skills) {
      desc += `- **${s.id}** (${s.icon} ${s.name}): ${s.description}`;
      if (s.requiredInput) {
        const params = Object.entries(s.requiredInput).map(([k, v]) => `${k}: ${v.description}`);
        desc += ` [Input: ${params.join(', ')}]`;
      }
      desc += `\n  Steps: ${s.steps.map(st => st.tool).join(' → ')}\n`;
    }
    return desc;
  }, [skills]);

  // Parse and execute skill calls from AI response
  const parseAndExecuteSkillCalls = useCallback((text: string): { cleanText: string; results: SkillExecutionResult[] } => {
    const results: SkillExecutionResult[] = [];
    const skillRegex = /\[SKILL:([\w-]+)\]\n([\s\S]*?)\n?\[\/SKILL\]/g;
    let match;

    while ((match = skillRegex.exec(text)) !== null) {
      const skillId = match[1];
      let input: Record<string, string> = {};
      try {
        input = JSON.parse(match[2]);
      } catch { /* empty input */ }
      const result = executeSkill(skillId, input);
      results.push(result);
    }

    const cleanText = text.replace(skillRegex, '').trim();
    return { cleanText, results };
  }, [executeSkill]);

  return {
    skills,
    executeSkill,
    getSkillsByCategory,
    getSkillDescriptions,
    parseAndExecuteSkillCalls,
    skillCount: skills.length,
  };
}