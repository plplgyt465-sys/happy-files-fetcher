import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------- tool / skill descriptions ----------

const TOOL_DESCRIPTIONS = `
## Available Tools (44 total)

To use a tool, wrap it in [TOOL_CALL:ToolName] blocks with JSON input:
[TOOL_CALL:FileReadTool]
{"fileName": "App.tsx"}
[/TOOL_CALL]

### FILE (8)
- **FileReadTool**: Read content of a file (required: fileName)
- **FileWriteTool**: Create or overwrite a file (required: fileName, content)
- **FileEditTool**: Edit file by replacing a string (required: fileName, oldString, newString)
- **FileDeleteTool**: Delete a file (required: fileName)
- **FileRenameTool**: Rename a file (required: oldName, newName)
- **FileCopyTool**: Copy a file (required: source, destination)
- **FileMoveTool**: Move a file (required: oldName, newName)
- **FileInfoTool**: Get metadata about a file (required: fileName)

### SEARCH (6)
- **GlobTool**: Find files matching a glob pattern (required: pattern)
- **GrepTool**: Search for text across files (required: query)
- **SearchReplaceTool**: Search and replace across files (required: search, replace)
- **FindSymbolTool**: Find where a symbol is defined (required: symbol)
- **FindReferencesTool**: Find all references to a symbol (required: symbol)
- **ToolSearchTool**: Search for available tools

### ANALYSIS (5)
- **ErrorParserTool**: Get all current diagnostics
- **TSCheckerTool**: Check a file for TypeScript issues (required: fileName)
- **ProjectInfoTool**: Get project overview
- **DependencyAnalyzerTool**: Analyze import graph
- **UnusedCodeTool**: Find unused exports

### CODE (5)
- **LSPTool**: Language server operations (required: fileName, operation, line)
- **CodeComplexityTool**: Calculate complexity (required: fileName)
- **CodeFormatterTool**: Format code (required: fileName)
- **SnippetGeneratorTool**: Generate code snippets (required: type, name)
- **NotebookEditTool**: Edit a notebook cell (required: fileName, cellIndex, content)

### TASK (6)
- **TaskCreateTool**: Create a new task (required: title)
- **TaskUpdateTool**: Update a task (required: taskId)
- **TaskListTool**: List all tasks
- **TaskDeleteTool**: Delete a task (required: taskId)
- **ProgressTrackTool**: Get progress across tasks
- **TimeEstimateTool**: Estimate time (required: description)

### PLAN (2)
- **EnterPlanModeTool**: Enter plan mode
- **ExitPlanModeTool**: Exit plan mode

### AGENT (4)
- **AgentTool**: Spawn a sub-agent (required: instruction)
- **SendMessageTool**: Send a message to another agent (required: to, message)
- **CoordinatorTool**: Start multi-agent coordination (required: plan)
- **DelegateTool**: Delegate a task (required: agentId, task)

### TEAM (2)
- **TeamCreateTool**: Create a team (required: name)
- **TeamDeleteTool**: Delete a team (required: teamId)

### UTILITY (6)
- **SleepTool**: Wait for a duration
- **SyntheticOutputTool**: Generate structured output (required: data)
- **MemoryStoreTool**: Store persistent memory (required: key, value)
- **MemoryRecallTool**: Recall stored memory (required: key)
- **DiffTool**: Compare two files (required: file1, file2)
- **BashTool**: Execute shell commands (required: command)

## Available Skills (16 total)

Use [SKILL:skill-id] blocks:
- **scaffold-react**: Create React project scaffold
- **generate-component**: Generate a React component [Input: name]
- **generate-hook**: Generate a custom hook [Input: name]
- **code-review**: Full code review
- **complexity-audit**: Measure complexity
- **fix-errors**: Detect & fix errors
- **search-replace**: Global search & replace [Input: search, replace]
- **rename-symbol**: Rename a symbol [Input: oldName, newName]
- **generate-test**: Generate a test file [Input: name]
- **generate-api**: Generate API functions [Input: name]
- **generate-context**: Generate Context provider [Input: name]
- **generate-types**: Generate TypeScript types [Input: name]
- **generate-docs**: Generate docs
- **perf-analysis**: Analyze performance
- **security-scan**: Scan for security issues
- **memory-manage**: Store & recall memories
`;

const SYSTEM_PROMPT = `You are an expert AI vibe coding agent integrated into VibeCode — a professional live coding platform with 44 tools and 16 skills.

## YOUR ROLE
You are an autonomous coding agent. You can:
1. Create, edit, and manage files in the project
2. Use tools to analyze code, find errors, search patterns
3. Execute skills for complex multi-step workflows
4. Coordinate with sub-agents for large tasks
5. Remember context across the conversation

## MODES
- CREATE: Build new features/projects from scratch
- EDIT: Modify existing files with minimal changes  
- FIX: Fix specific errors — modify ONLY the broken file(s)

## CRITICAL RULES
1. ALL projects MUST use React with TypeScript (.tsx files).
2. When creating or editing code, respond with file blocks:
[FILE:filename.ext]
(full file content)
[/FILE]
3. You can include multiple [FILE] blocks.
4. Always write COMPLETE file contents, not partial snippets.
5. Respond in the same language the user writes in.
6. Use React hooks and functional components only.
7. Import React at the top of every .tsx file.
8. Do NOT escape normal code characters with markdown backslashes.

${TOOL_DESCRIPTIONS}

## TOOL USAGE
Call tools with [TOOL_CALL:ToolName] blocks. Use multiple tool calls per response.
Tool results are automatically executed and returned.

## SKILL USAGE
Skills are pre-built workflows. Use [SKILL:skill-id] blocks.

## AGENTIC BEHAVIOR
- When given a complex task, break it down into steps
- Use tools proactively to understand the codebase before making changes
- After making changes, use ErrorParserTool to verify no errors
- Use MemoryStoreTool to remember important context
- When fixing errors, ALWAYS read the file first before editing

## SAFETY RULES
- Do NOT duplicate component declarations
- Do NOT redeclare variables that already exist
- Do NOT break existing imports
- Do NOT delete files unless asked
- In FIX mode: modify ONLY the broken file(s)
- In EDIT mode: modify ONLY the requested file(s)
- ALWAYS preserve existing functionality

## DEPENDENCY SYSTEM
Use CDN imports: import axios from "https://esm.sh/axios"

## STRUCTURED RESPONSE
After explanation and [FILE:] blocks, if there are issues:
[DIAGNOSTICS]
{"errors": [{"file": "App.tsx", "line": 12, "message": "description", "type": "SyntaxError"}]}
[/DIAGNOSTICS]
`;

// ---------- main handler ----------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, files, mode, history } = await req.json();
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured. Please enable Lovable Cloud." }),
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
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add conversation history
    if (Array.isArray(history)) {
      const recentHistory = history.slice(-20);
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role === "ai" ? "assistant" : "user",
          content: msg.content,
        });
      }
    }

    // Build current user message with file context
    const modePrefix = mode ? `[MODE: ${mode}]\n` : "";
    let userMessage = "";

    if (filesContext) {
      userMessage += `${modePrefix}--- CURRENT PROJECT FILES ---\n${filesContext}\n--- END FILES ---\n\nUser request: ${prompt}`;
    } else {
      userMessage += `${modePrefix}${prompt}`;
    }

    messages.push({ role: "user", content: userMessage });

    // Call Lovable AI Gateway (proxied through Supabase edge function)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        reasoning: {
          effort: "medium",
        },
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
          JSON.stringify({ error: "Credits exhausted. Please add funds at Settings > Workspace > Usage." }),
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
    const diagMatch = reply.match(
      /\[DIAGNOSTICS\]\n([\s\S]*?)\n\[\/DIAGNOSTICS\]/
    );
    if (diagMatch) {
      try {
        diagnostics = JSON.parse(diagMatch[1]);
      } catch {
        /* ignore */
      }
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
