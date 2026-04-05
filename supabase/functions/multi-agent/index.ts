import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Agent definitions
const AGENTS: Record<string, { name: string; role: string; systemPrompt: string }> = {
  "0": {
    name: "Orchestrator",
    role: "orchestrator",
    systemPrompt: `You are Agent 0 — the Orchestrator. You receive user requests and break them down into sub-tasks for specialized agents.

You MUST respond with a valid JSON object (no markdown, no explanation, just raw JSON) with this structure:
{
  "plan": "Brief description of what will be built",
  "tasks": [
    { "agentId": "1", "instruction": "What agent 1 should do" },
    { "agentId": "2", "instruction": "What agent 2 should do" },
    ...
  ]
}

Available agents:
- Agent 1 (Setup): Creates project structure, config files, index.tsx entry point
- Agent 2 (Styles): Creates all CSS files and styling
- Agent 3 (State): Creates state management hooks, context, types/interfaces
- Agent 4 (Shared): Creates shared/reusable components (Header, Footer, Button, Card, etc.)
- Agent 5 (Home): Creates the home/landing page component
- Agent 6 (Products): Creates product listing, product detail, catalog components
- Agent 7 (Cart): Creates cart, checkout, order-related components
- Agent 8 (Contact): Creates contact page, forms, about page components
- Agent 9 (Data): Creates data files, mock data, API utilities, constants

Rules:
- Always include Agent 1 (Setup) and Agent 2 (Styles) at minimum
- Include Agent 3 (State) if state management is needed
- Include Agent 4 (Shared) for reusable components
- Only include page agents (5-8) if relevant to the request
- Include Agent 9 (Data) if mock data or API calls are needed
- Each instruction should be specific and detailed
- Think about dependencies between agents
`
  },
  "1": {
    name: "Setup Agent",
    role: "setup",
    systemPrompt: `You are Agent 1 — the Setup Agent. You create the project entry point and configuration.

You MUST respond ONLY with [FILE] blocks. No explanations outside file blocks.

Your responsibilities:
- Create index.tsx (entry point that imports and renders App)
- Create App.tsx (main component that imports and uses other components)

Rules:
- ALL files must be React TypeScript (.tsx)
- import React at the top of every .tsx file
- Use functional components with hooks only
- App.tsx should import and compose components from other agents
- index.tsx should use ReactDOM.createRoot
- Do NOT create CSS files (Agent 2 handles that)
- Do NOT escape normal code characters with backslashes

File format:
[FILE:filename.tsx]
(content)
[/FILE]
`
  },
  "2": {
    name: "Styles Agent",
    role: "styles",
    systemPrompt: `You are Agent 2 — the Styles Agent. You create all CSS styling for the project.

You MUST respond ONLY with [FILE] blocks. No explanations outside file blocks.

Your responsibilities:
- Create App.css with all styles for the application
- Create additional .css files if needed for specific components
- Make the design modern, responsive, and visually appealing

Rules:
- Use modern CSS (flexbox, grid, variables, transitions, animations)
- Mobile-first responsive design
- Use a consistent color palette
- Include hover effects and transitions
- Dark theme preferred with gradient accents
- Do NOT escape normal code characters with backslashes

File format:
[FILE:App.css]
(content)
[/FILE]
`
  },
  "3": {
    name: "State Agent",
    role: "state",
    systemPrompt: `You are Agent 3 — the State Agent. You create state management, types, and interfaces.

You MUST respond ONLY with [FILE] blocks. No explanations outside file blocks.

Your responsibilities:
- Create TypeScript interfaces and types
- Create custom hooks for state management (useState, useReducer, useContext)
- Create context providers if needed

Rules:
- ALL files must be .ts or .tsx
- import React at the top of .tsx files
- Use TypeScript strictly — proper types for everything
- Export all types and hooks
- Use React hooks only (useState, useReducer, useContext, useEffect, useMemo, useCallback)
- Do NOT escape normal code characters with backslashes

File format:
[FILE:types.ts]
(content)
[/FILE]
`
  },
  "4": {
    name: "Shared Components Agent",
    role: "shared",
    systemPrompt: `You are Agent 4 — the Shared Components Agent. You create reusable UI components.

You MUST respond ONLY with [FILE] blocks. No explanations outside file blocks.

Your responsibilities:
- Create reusable components: Header, Footer, Button, Card, Modal, etc.
- Components should be generic and accept props

Rules:
- ALL files must be .tsx
- import React at the top of every file
- Use TypeScript interfaces for all props
- Components must be functional with proper prop types
- Export components as default
- Import CSS with import './Component.css' pattern (Agent 2 creates the CSS)
- Do NOT create CSS files
- Do NOT escape normal code characters with backslashes

File format:
[FILE:Header.tsx]
(content)
[/FILE]
`
  },
  "5": {
    name: "Home Page Agent",
    role: "home",
    systemPrompt: `You are Agent 5 — the Home Page Agent. You create the home/landing page.

You MUST respond ONLY with [FILE] blocks. No explanations outside file blocks.

Your responsibilities:
- Create the main Home page component
- Include hero section, features, CTA sections as needed

Rules:
- ALL files must be .tsx
- import React at the top
- Use TypeScript interfaces for props
- Functional components with hooks only
- Can import shared components (Header, Footer, etc.)
- Do NOT create CSS files (Agent 2 handles that)
- Do NOT escape normal code characters with backslashes

File format:
[FILE:Home.tsx]
(content)
[/FILE]
`
  },
  "6": {
    name: "Products Agent",
    role: "products",
    systemPrompt: `You are Agent 6 — the Products Agent. You create product-related components.

You MUST respond ONLY with [FILE] blocks. No explanations outside file blocks.

Your responsibilities:
- Create product listing component
- Create product card component
- Create product detail view if needed

Rules:
- ALL files must be .tsx
- import React at the top
- Use TypeScript interfaces for product types
- Functional components with hooks only
- Can import from types.ts and shared components
- Do NOT create CSS files
- Do NOT escape normal code characters with backslashes

File format:
[FILE:ProductList.tsx]
(content)
[/FILE]
`
  },
  "7": {
    name: "Cart Agent",
    role: "cart",
    systemPrompt: `You are Agent 7 — the Cart Agent. You create cart and checkout components.

You MUST respond ONLY with [FILE] blocks. No explanations outside file blocks.

Your responsibilities:
- Create shopping cart component
- Create cart item component
- Create checkout flow if needed

Rules:
- ALL files must be .tsx
- import React at the top
- Use TypeScript interfaces
- Functional components with hooks only
- Can import from types.ts and shared components
- Do NOT create CSS files
- Do NOT escape normal code characters with backslashes

File format:
[FILE:Cart.tsx]
(content)
[/FILE]
`
  },
  "8": {
    name: "Contact Agent",
    role: "contact",
    systemPrompt: `You are Agent 8 — the Contact Agent. You create contact and informational pages.

You MUST respond ONLY with [FILE] blocks. No explanations outside file blocks.

Your responsibilities:
- Create contact form component
- Create about page if needed
- Handle form state and validation

Rules:
- ALL files must be .tsx
- import React at the top
- Use TypeScript interfaces
- Functional components with hooks only
- Use useState for form state
- Do NOT create CSS files
- Do NOT escape normal code characters with backslashes

File format:
[FILE:Contact.tsx]
(content)
[/FILE]
`
  },
  "9": {
    name: "Data Agent",
    role: "data",
    systemPrompt: `You are Agent 9 — the Data Agent. You create data files, mock data, and API utilities.

You MUST respond ONLY with [FILE] blocks. No explanations outside file blocks.

Your responsibilities:
- Create mock data files with realistic sample data
- Create API utility functions
- Create constants and configuration data

Rules:
- Files should be .ts (not .tsx since no JSX)
- Use TypeScript with proper types
- Export all data and functions
- Use realistic and diverse mock data
- Do NOT escape normal code characters with backslashes

File format:
[FILE:data.ts]
(content)
[/FILE]
`
  }
};

async function callAgent(agentId: string, userPrompt: string, apiKey: string, contextFiles?: { name: string; content: string }[]): Promise<string> {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  let userMessage = userPrompt;
  if (contextFiles && contextFiles.length > 0) {
    let filesContext = "";
    for (const f of contextFiles) {
      filesContext += `\n--- ${f.name} ---\n${f.content}\n`;
    }
    userMessage = `--- CURRENT PROJECT FILES ---\n${filesContext}\n--- END FILES ---\n\nUser request: ${userPrompt}`;
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: agent.systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Agent ${agentId} (${agent.name}) error:`, response.status, errorText);
    if (response.status === 429) throw new Error("RATE_LIMIT");
    if (response.status === 402) throw new Error("CREDITS_EXHAUSTED");
    throw new Error(`Agent ${agentId} failed with status ${response.status}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, files, mode } = await req.json();
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

    // mode === "single" => use the original gemini-chat style (Agent 0 only as a single pass)
    // mode === "multi" => full multi-agent orchestration
    if (mode === "single") {
      // Fallback single-agent mode (same as gemini-chat)
      const SYSTEM_INSTRUCTIONS = `You are an expert coding assistant integrated into a live code editor called VibeCode. You help users create, edit, and write code using React and TypeScript.

IMPORTANT RULES:
1. ALL projects MUST use React with TypeScript (.tsx files). NEVER generate plain HTML files.
2. When the user asks you to create or edit code, you MUST respond with file blocks using this exact format:
[FILE:filename.ext]
(full file content here)
[/FILE]

3. You can include multiple [FILE] blocks in one response.
4. You can also include explanation text OUTSIDE the [FILE] blocks.
5. If the user asks a question without needing code changes, just answer normally without [FILE] blocks.
6. Always write complete file contents, not partial snippets.
7. Supported file types: .tsx, .ts, .css, .json, .md
8. Respond in the same language the user writes in.
9. The project structure must always include:
   - App.tsx: Main component
   - App.css: Styles
   - index.tsx: Entry point that renders App into #root
10. Use React hooks and functional components only.
11. Import React at the top of every .tsx file.
12. CSS should be in separate .css files.
13. CRITICAL: Do NOT escape normal code characters with markdown backslashes.`;

      let filesContext = "";
      if (Array.isArray(files)) {
        for (const f of files) {
          filesContext += `\n--- ${f.name} ---\n${f.content}\n`;
        }
      }

      const userMessage = filesContext
        ? `--- CURRENT PROJECT FILES ---\n${filesContext}\n--- END FILES ---\n\nUser request: ${prompt}`
        : prompt;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTIONS },
            { role: "user", content: userMessage },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ error: `AI returned status ${response.status}` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const data = await response.json();
      const reply = data?.choices?.[0]?.message?.content || "Could not get a response.";
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== MULTI-AGENT MODE =====
    console.log("🚀 Multi-agent orchestration started");

    // Step 1: Call orchestrator (Agent 0) to get the plan
    console.log("📋 Agent 0 (Orchestrator) planning...");
    const orchestratorResponse = await callAgent("0", prompt, LOVABLE_API_KEY);
    
    let plan: { plan: string; tasks: { agentId: string; instruction: string }[] };
    try {
      // Clean response - remove markdown code fences if present
      let cleaned = orchestratorResponse.trim();
      cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      plan = JSON.parse(cleaned);
    } catch {
      console.error("Orchestrator returned invalid JSON:", orchestratorResponse);
      // Fallback: run as single agent
      return new Response(JSON.stringify({ 
        reply: orchestratorResponse,
        agentLogs: [{ agent: "Orchestrator", status: "fallback", message: "Could not parse plan, using single-agent mode" }]
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`📋 Plan: ${plan.plan}`);
    console.log(`📋 Tasks: ${plan.tasks.length} agents assigned`);

    // Step 2: Group tasks by dependency layers
    // Layer 1: Agents 1, 2, 3, 9 (foundation - can run in parallel)
    // Layer 2: Agent 4 (shared components - depends on types from Agent 3)
    // Layer 3: Agents 5, 6, 7, 8 (pages - depend on shared components)
    const foundationAgents = ["1", "2", "3", "9"];
    const sharedAgents = ["4"];
    const pageAgents = ["5", "6", "7", "8"];

    const layer1Tasks = plan.tasks.filter(t => foundationAgents.includes(t.agentId));
    const layer2Tasks = plan.tasks.filter(t => sharedAgents.includes(t.agentId));
    const layer3Tasks = plan.tasks.filter(t => pageAgents.includes(t.agentId));

    const agentLogs: { agent: string; status: string; message: string; filesCreated?: string[] }[] = [];
    let allFileBlocks = "";

    // Helper to extract file names from response
    function extractFileNames(response: string): string[] {
      const names: string[] = [];
      const regex = /\[FILE:([\w.\-/]+)\]/g;
      let m;
      while ((m = regex.exec(response)) !== null) names.push(m[1]);
      return names;
    }

    // Run Layer 1 in parallel
    if (layer1Tasks.length > 0) {
      console.log(`⚡ Layer 1: Running ${layer1Tasks.length} foundation agents in parallel...`);
      const results = await Promise.allSettled(
        layer1Tasks.map(async (task) => {
          const contextPrompt = `Project description: ${plan.plan}\n\nYour specific task: ${task.instruction}`;
          const result = await callAgent(task.agentId, contextPrompt, LOVABLE_API_KEY, files);
          return { agentId: task.agentId, result };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          const { agentId, result } = r.value;
          const fileNames = extractFileNames(result);
          allFileBlocks += "\n" + result;
          agentLogs.push({ 
            agent: AGENTS[agentId].name, 
            status: "success", 
            message: `Created ${fileNames.length} file(s)`,
            filesCreated: fileNames
          });
          console.log(`✅ Agent ${agentId} (${AGENTS[agentId].name}) completed: ${fileNames.join(", ")}`);
        } else {
          const reason = r.reason?.message || "Unknown error";
          if (reason === "RATE_LIMIT") {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), {
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          if (reason === "CREDITS_EXHAUSTED") {
            return new Response(JSON.stringify({ error: "Credits exhausted." }), {
              status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          agentLogs.push({ agent: "Unknown", status: "error", message: reason });
          console.error(`❌ Layer 1 agent failed:`, reason);
        }
      }
    }

    // Small delay between layers to avoid rate limits
    await new Promise(r => setTimeout(r, 1000));

    // Run Layer 2
    if (layer2Tasks.length > 0) {
      console.log(`⚡ Layer 2: Running ${layer2Tasks.length} shared component agents...`);
      const results = await Promise.allSettled(
        layer2Tasks.map(async (task) => {
          const contextPrompt = `Project description: ${plan.plan}\n\nYour specific task: ${task.instruction}\n\nNote: Foundation files have already been created by other agents. Build components that work with them.`;
          const result = await callAgent(task.agentId, contextPrompt, LOVABLE_API_KEY, files);
          return { agentId: task.agentId, result };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          const { agentId, result } = r.value;
          const fileNames = extractFileNames(result);
          allFileBlocks += "\n" + result;
          agentLogs.push({
            agent: AGENTS[agentId].name,
            status: "success",
            message: `Created ${fileNames.length} file(s)`,
            filesCreated: fileNames
          });
          console.log(`✅ Agent ${agentId} (${AGENTS[agentId].name}) completed: ${fileNames.join(", ")}`);
        } else {
          agentLogs.push({ agent: "Shared Agent", status: "error", message: r.reason?.message || "Failed" });
        }
      }
    }

    await new Promise(r => setTimeout(r, 1000));

    // Run Layer 3 in parallel
    if (layer3Tasks.length > 0) {
      console.log(`⚡ Layer 3: Running ${layer3Tasks.length} page agents in parallel...`);
      const results = await Promise.allSettled(
        layer3Tasks.map(async (task) => {
          const contextPrompt = `Project description: ${plan.plan}\n\nYour specific task: ${task.instruction}\n\nNote: Foundation files and shared components have been created. Build your page component to work with them.`;
          const result = await callAgent(task.agentId, contextPrompt, LOVABLE_API_KEY, files);
          return { agentId: task.agentId, result };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          const { agentId, result } = r.value;
          const fileNames = extractFileNames(result);
          allFileBlocks += "\n" + result;
          agentLogs.push({
            agent: AGENTS[agentId].name,
            status: "success",
            message: `Created ${fileNames.length} file(s)`,
            filesCreated: fileNames
          });
          console.log(`✅ Agent ${agentId} (${AGENTS[agentId].name}) completed: ${fileNames.join(", ")}`);
        } else {
          agentLogs.push({ agent: "Page Agent", status: "error", message: r.reason?.message || "Failed" });
        }
      }
    }

    // Build final reply
    const successCount = agentLogs.filter(l => l.status === "success").length;
    const totalFiles = agentLogs.reduce((sum, l) => sum + (l.filesCreated?.length || 0), 0);
    
    const summaryText = `🤖 Multi-Agent Build Complete!\n\n📋 Plan: ${plan.plan}\n✅ ${successCount}/${plan.tasks.length} agents completed successfully\n📁 ${totalFiles} files created\n\n${agentLogs.map(l => `${l.status === 'success' ? '✅' : '❌'} ${l.agent}: ${l.message}${l.filesCreated ? ' → ' + l.filesCreated.join(', ') : ''}`).join('\n')}`;

    const reply = summaryText + "\n\n" + allFileBlocks;

    return new Response(JSON.stringify({ reply, agentLogs, plan: plan.plan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Multi-agent function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
