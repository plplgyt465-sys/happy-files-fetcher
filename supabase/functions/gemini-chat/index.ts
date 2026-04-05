import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOOL_DESCRIPTIONS = `
## Available Tools (44 total)

To use a tool, wrap it in [TOOL_CALL:ToolName] blocks with JSON input:
[TOOL_CALL:FileReadTool]
{"fileName": "App.tsx"}
[/TOOL_CALL]

### FILE (8)
- **FileReadTool**: Read content of a file, optionally specifying line range (required: fileName)
- **FileWriteTool**: Create or overwrite a file with content (required: fileName, content)
- **FileEditTool**: Edit file by replacing a string with another (required: fileName, oldString, newString)
- **FileDeleteTool**: Delete a file from the project (required: fileName)
- **FileRenameTool**: Rename a file (required: oldName, newName)
- **FileCopyTool**: Copy a file to a new location (required: source, destination)
- **FileMoveTool**: Move a file to a new location (required: oldName, newName)
- **FileInfoTool**: Get metadata about a file (required: fileName)

### SEARCH (6)
- **GlobTool**: Find files matching a glob pattern (required: pattern)
- **GrepTool**: Search for text across all files (required: query)
- **SearchReplaceTool**: Search and replace text across files (required: search, replace)
- **FindSymbolTool**: Find where a symbol is defined (required: symbol)
- **FindReferencesTool**: Find all references to a symbol (required: symbol)
- **ToolSearchTool**: Search for available tools by name or category

### ANALYSIS (5)
- **ErrorParserTool**: Get all current diagnostics and errors
- **TSCheckerTool**: Check a specific file for TypeScript issues (required: fileName)
- **ProjectInfoTool**: Get full project overview and statistics
- **DependencyAnalyzerTool**: Analyze import dependency graph
- **UnusedCodeTool**: Find unused exports across the project

### CODE (4)
- **LSPTool**: Language server operations: hover, definition, references (required: fileName, operation, line)
- **CodeComplexityTool**: Calculate cyclomatic complexity of a file (required: fileName)
- **CodeFormatterTool**: Format code in a file (required: fileName)
- **SnippetGeneratorTool**: Generate code snippets (required: type, name)
- **NotebookEditTool**: Edit a Jupyter notebook cell (required: fileName, cellIndex, content)

### TASK (5)
- **TaskCreateTool**: Create a new task (required: title)
- **TaskUpdateTool**: Update a task status or details (required: taskId)
- **TaskListTool**: List all tasks
- **TaskDeleteTool**: Delete a task (required: taskId)
- **ProgressTrackTool**: Get progress across all tasks
- **TimeEstimateTool**: Estimate time for a task (required: description)

### PLAN (2)
- **EnterPlanModeTool**: Enter plan mode (AI plans without executing)
- **ExitPlanModeTool**: Exit plan mode (AI can execute changes)

### AGENT (4)
- **AgentTool**: Spawn a sub-agent with a specific instruction (required: instruction)
- **SendMessageTool**: Send a message to another agent (required: to, message)
- **CoordinatorTool**: Start multi-agent coordination (required: plan)
- **DelegateTool**: Delegate a task to a specific agent (required: agentId, task)

### TEAM (2)
- **TeamCreateTool**: Create a team of agents (required: name)
- **TeamDeleteTool**: Delete a team (required: teamId)

### UTILITY (6)
- **SleepTool**: Wait for a specified duration
- **SyntheticOutputTool**: Generate structured output in JSON or markdown (required: data)
- **MemoryStoreTool**: Store persistent memory (required: key, value)
- **MemoryRecallTool**: Recall stored memory (required: key)
- **DiffTool**: Compare two files (required: file1, file2)
- **BashTool**: Execute shell commands (simulated: ls, cat, wc, echo, pwd, date) (required: command)

## Available Skills (16 total)

To use a skill, wrap it in [SKILL:skill-id] blocks:
[SKILL:scaffold-react]
{}
[/SKILL]

- **scaffold-react** (🏗️): Create a complete React project scaffold
- **generate-component** (🧩): Generate a React component [Input: name]
- **generate-hook** (🪝): Generate a custom React hook [Input: name]
- **code-review** (🔍): Full code review with errors, complexity, unused code
- **complexity-audit** (📊): Measure complexity for all files
- **fix-errors** (🔧): Detect and prepare to fix errors
- **search-replace** (🔄): Global search and replace [Input: search, replace]
- **rename-symbol** (✏️): Rename a symbol across all files [Input: oldName, newName]
- **generate-test** (🧪): Generate a test file [Input: name]
- **generate-api** (🌐): Generate API service functions [Input: name]
- **generate-context** (🔗): Generate React Context provider [Input: name]
- **generate-types** (📐): Generate TypeScript types [Input: name]
- **generate-docs** (📝): Generate project documentation
- **perf-analysis** (⚡): Analyze performance patterns
- **security-scan** (🔒): Scan for security issues
- **memory-manage** (🧠): Store and recall project memories
`;

const SYSTEM_INSTRUCTIONS = `You are an expert AI coding assistant integrated into VibeCode — a professional live coding platform with 44 tools and 16 skills.

## MODES
You operate in one of three modes based on the user's request:
- CREATE: Build new features/projects from scratch
- EDIT: Modify existing files with minimal changes
- FIX: Fix specific errors — modify ONLY the file(s) with the problem

## CRITICAL RULES
1. ALL projects MUST use React with TypeScript (.tsx files). NEVER generate plain HTML files.
2. When creating or editing code, respond with file blocks:
[FILE:filename.ext]
(full file content)
[/FILE]

3. You can include multiple [FILE] blocks.
4. Include explanation text OUTSIDE [FILE] blocks.
5. If the user asks a question without needing code changes, answer normally.
6. Always write COMPLETE file contents, not partial snippets.
7. Supported file types: .tsx, .ts, .css, .json, .md
8. Respond in the same language the user writes in.
9. The project structure must always include:
   - App.tsx: Main component
   - App.css: Styles
   - index.tsx: Entry point that renders App into #root
10. Use React hooks and functional components only.
11. Import React at the top of every .tsx file.
12. CRITICAL: Do NOT escape normal code characters with markdown backslashes.

${TOOL_DESCRIPTIONS}

## TOOL USAGE
You can call tools to interact with the project. Use [TOOL_CALL:ToolName] blocks.
You can use multiple tool calls in a single response.
Tool results are automatically executed and returned.

## SKILL USAGE
Skills are pre-built multi-step workflows. Use [SKILL:skill-id] blocks.
Skills automatically chain multiple tools together.

## SAFETY RULES
- Do NOT duplicate component declarations
- Do NOT redeclare variables that already exist
- Do NOT break existing imports
- Do NOT delete files unless explicitly asked
- In FIX mode: modify ONLY the broken file(s)
- In EDIT mode: modify ONLY the requested file(s)
- ALWAYS preserve existing functionality

## ERROR FIXING
When fixing errors:
1. Use [TOOL_CALL:ErrorParserTool] to get diagnostics
2. Use [TOOL_CALL:FileReadTool] to read the problematic file
3. Apply the minimal fix using [FILE:] blocks
4. Return ONLY the changed file(s)

## DEPENDENCY SYSTEM
When the user needs external libraries, use CDN imports:
import axios from "https://esm.sh/axios"

## STRUCTURED RESPONSE
After explanation and [FILE:] blocks, if there are issues:
[DIAGNOSTICS]
{"errors": [{"file": "App.tsx", "line": 12, "message": "description", "type": "SyntaxError"}]}
[/DIAGNOSTICS]
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, files, mode, history } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build file context
    let filesContext = "";
    if (Array.isArray(files)) {
      for (const f of files) {
        filesContext += `\n--- ${f.name} ---\n${f.content}\n`;
      }
    }

    // Build conversation messages
    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_INSTRUCTIONS },
    ];

    // Add conversation history
    if (Array.isArray(history)) {
      const recentHistory = history.slice(-20);
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role === 'ai' ? 'assistant' : 'user',
          content: msg.content,
        });
      }
    }

    // Add current message with file context
    const modePrefix = mode ? `[MODE: ${mode}]\n` : '';
    const userMessage = filesContext
      ? `${modePrefix}--- CURRENT PROJECT FILES ---\n${filesContext}\n--- END FILES ---\n\nUser request: ${prompt}`
      : `${modePrefix}${prompt}`;

    messages.push({ role: "user", content: userMessage });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `AI returned status ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "Could not get a response.";

    // Extract diagnostics if present
    let diagnostics = null;
    const diagMatch = reply.match(/\[DIAGNOSTICS\]\n([\s\S]*?)\n\[\/DIAGNOSTICS\]/);
    if (diagMatch) {
      try {
        diagnostics = JSON.parse(diagMatch[1]);
      } catch { /* ignore parse errors */ }
    }

    return new Response(JSON.stringify({ reply, diagnostics }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});