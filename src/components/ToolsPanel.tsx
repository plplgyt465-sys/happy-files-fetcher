import { useState, useMemo } from 'react';
import { Wrench, Zap, ChevronDown, ChevronRight, Search, Play, CheckCircle, XCircle } from 'lucide-react';
import type { ToolDefinition, ToolCategory } from '@/hooks/useToolSystem';
import type { SkillDefinition } from '@/hooks/useSkillSystem';

interface ToolsPanelProps {
  tools: ToolDefinition[];
  skills: SkillDefinition[];
  toolCount: number;
  skillCount: number;
  onExecuteSkill?: (skillId: string) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  file: '📁', search: '🔍', analysis: '📊', agent: '🤖', task: '📋',
  plan: '📝', web: '🌐', utility: '🔧', team: '👥', code: '💻',
  output: '📤', project: '🏗️', refactor: '🔄', generation: '🧩',
  workflow: '⚙️', debug: '🐛', testing: '🧪', documentation: '📖',
};

const ToolsPanel = ({ tools, skills, toolCount, skillCount, onExecuteSkill }: ToolsPanelProps) => {
  const [activeTab, setActiveTab] = useState<'tools' | 'skills'>('tools');
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Group tools by category
  const toolsByCategory = useMemo(() => {
    const filtered = search
      ? tools.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase()))
      : tools;
    const map = new Map<string, ToolDefinition[]>();
    for (const t of filtered) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return map;
  }, [tools, search]);

  // Group skills by category
  const skillsByCategory = useMemo(() => {
    const filtered = search
      ? skills.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase()))
      : skills;
    const map = new Map<string, SkillDefinition[]>();
    for (const s of filtered) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return map;
  }, [skills, search]);

  return (
    <div className="flex flex-col h-full border-t border-border">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-card border-b border-border">
        <button
          onClick={() => setActiveTab('tools')}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            activeTab === 'tools' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Wrench className="w-3 h-3" />
          Tools ({toolCount})
        </button>
        <button
          onClick={() => setActiveTab('skills')}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            activeTab === 'skills' ? 'bg-accent/20 text-accent' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Zap className="w-3 h-3" />
          Skills ({skillCount})
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-1 border-b border-border">
        <div className="flex items-center gap-1 bg-secondary/50 rounded px-2 py-0.5">
          <Search className="w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === 'tools' ? 'Search tools...' : 'Search skills...'}
            className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'tools' ? (
          <div className="py-1">
            {Array.from(toolsByCategory.entries()).map(([category, catTools]) => (
              <div key={category}>
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/30 uppercase tracking-wider"
                >
                  {expandedCategories.has(category) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span>{CATEGORY_ICONS[category] || '📦'}</span>
                  <span>{category}</span>
                  <span className="ml-auto text-[9px] bg-secondary/50 px-1 rounded">{catTools.length}</span>
                </button>
                {expandedCategories.has(category) && (
                  <div className="pl-4 pr-2">
                    {catTools.map(tool => (
                      <div key={tool.name} className="py-0.5 group">
                        <div className="flex items-start gap-1.5">
                          <span className="text-[10px] font-mono text-primary/80 font-medium leading-tight">{tool.name}</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{tool.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-1">
            {Array.from(skillsByCategory.entries()).map(([category, catSkills]) => (
              <div key={category}>
                <button
                  onClick={() => toggleCategory('skill-' + category)}
                  className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/30 uppercase tracking-wider"
                >
                  {expandedCategories.has('skill-' + category) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span>{CATEGORY_ICONS[category] || '📦'}</span>
                  <span>{category}</span>
                  <span className="ml-auto text-[9px] bg-secondary/50 px-1 rounded">{catSkills.length}</span>
                </button>
                {expandedCategories.has('skill-' + category) && (
                  <div className="pl-4 pr-2">
                    {catSkills.map(skill => (
                      <div key={skill.id} className="py-1 group">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">{skill.icon}</span>
                          <span className="text-[10px] font-medium text-foreground/90">{skill.name}</span>
                          {onExecuteSkill && (
                            <button
                              onClick={() => onExecuteSkill(skill.id)}
                              className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-primary/20 transition-all"
                              title="Run skill"
                            >
                              <Play className="w-2.5 h-2.5 text-primary" />
                            </button>
                          )}
                        </div>
                        <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{skill.description}</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {skill.steps.map((step, i) => (
                            <span key={i} className="text-[8px] text-muted-foreground/60 font-mono">{step.tool}{i < skill.steps.length - 1 ? ' →' : ''}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolsPanel;