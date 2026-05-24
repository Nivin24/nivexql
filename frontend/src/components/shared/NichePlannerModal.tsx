import { useState, useEffect } from 'react';
import { Sparkles, X, Play, BookOpen, AlertCircle, BarChart2, LineChart, PieChart, Layers, Activity, HelpCircle, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { apiPlanNiches, type StorytellingNiche, type NicheQuery } from '../../lib/api';
import { toast } from './Toast';

interface Props {
  onClose: () => void;
}

export default function NichePlannerModal({ onClose }: Props) {
  const schema = useAppStore(s => s.schema);
  const globalContext = useAppStore(s => s.globalContext);
  const getOrCreateNotebookByName = useAppStore(s => s.getOrCreateNotebookByName);
  const addCellToNotebook = useAppStore(s => s.addCellToNotebook);
  const setActiveNotebook = useAppStore(s => s.setActiveNotebook);

  // Session-only niche cache — survives modal open/close, clears on page refresh
  const cachedNiches = useAppStore(s => s.cachedNiches);
  const setCachedNiches = useAppStore(s => s.setCachedNiches);
  const clearCachedNiches = useAppStore(s => s.clearCachedNiches);

  const [niches, setNiches] = useState<StorytellingNiche[]>(cachedNiches ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  // Key: "nicheName::queryTitle" — preserves added state across modal open/close
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});

  const fetchNiches = async () => {
    if (!schema || schema.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiPlanNiches(schema, globalContext);
      if (data && data.niches) {
        setNiches(data.niches);
        setCachedNiches(data.niches); // write to session cache
        setSelectedIdx(0);
      } else {
        throw new Error("No niches returned from AI planner.");
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to analyze schema.");
      toast.error("Planner failed", err.message ?? "Failed to plan storytelling templates.");
    } finally {
      setLoading(false);
    }
  };

  /** Force a fresh AI analysis — clears cache then re-fetches */
  const handleRefresh = async () => {
    clearCachedNiches();
    setNiches([]);
    setSelectedIdx(0);
    await fetchNiches();
  };

  useEffect(() => {
    // If we already have cached niches, use them immediately — no API call needed
    if (cachedNiches && cachedNiches.length > 0) {
      setNiches(cachedNiches);
      return;
    }
    // Only auto-fetch if cache is empty
    fetchNiches();
  }, []); // run once on mount only


  const addedKey = (nicheName: string, queryTitle: string) => `${nicheName}::${queryTitle}`;

  /** Add a single query to the notebook tab dedicated to the current niche */
  const handleUseQuery = (niche: StorytellingNiche, query: NicheQuery) => {
    try {
      const nbId = getOrCreateNotebookByName(niche.name);
      addCellToNotebook(nbId, query.sql, query.title, query.viz);
      setAddedMap(prev => ({ ...prev, [addedKey(niche.name, query.title)]: true }));
      toast.success("Cell added to notebook!", `"${query.title}" → tab "${niche.name}". Click the tab to view it.`);
    } catch (err: any) {
      toast.error("Failed to add cell", err.message);
    }
  };

  /** Import all queries of this niche into its dedicated notebook tab */
  const handleImportAll = (niche: StorytellingNiche) => {
    try {
      const nbId = getOrCreateNotebookByName(niche.name);
      const newAdded = { ...addedMap };
      niche.queries.forEach(q => {
        addCellToNotebook(nbId, q.sql, q.title, q.viz);
        newAdded[addedKey(niche.name, q.title)] = true;
      });
      setAddedMap(newAdded);
      // Switch view to the imported notebook so user can see results
      setActiveNotebook(nbId);
      toast.success("Dashboard blueprint imported!", `Opened tab "${niche.name}" with ${niche.queries.length} cells ready to run.`);
      onClose();
    } catch (err: any) {
      toast.error("Failed to import blueprint", err.message);
    }
  };

  const getVizIcon = (vizType: string) => {
    switch (vizType) {
      case 'bar':
        return <BarChart2 className="w-3 h-3 text-accent" />;
      case 'line':
      case 'area':
        return <LineChart className="w-3 h-3 text-accent" />;
      case 'pie':
        return <PieChart className="w-3 h-3 text-accent" />;
      case 'scatter':
      case 'bubble':
        return <Activity className="w-3 h-3 text-accent" />;
      case 'pivot':
        return <Layers className="w-3 h-3 text-accent" />;
      default:
        return <HelpCircle className="w-3 h-3 text-text-muted" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#070b19]/80 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      <div className="glass border border-surface-border/50 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden relative shadow-2xl bg-gradient-to-br from-[#0c1228]/85 via-[#0e1634]/60 to-[#070b19]/90">
        
        {/* Glow Effects */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-accent/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-success/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-border/40 relative z-10 shrink-0 bg-surface-card/10">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-gradient-to-br from-accent/30 to-accent/5 border border-accent/20 rounded-2xl flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-accent animate-pulse" />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-text-primary tracking-wide uppercase">AI Storytelling Planner</h2>
                <span className="text-[9px] font-bold text-accent uppercase tracking-widest bg-accent/15 px-2 py-0.5 rounded-full border border-accent/20">
                  Niche Blueprints
                </span>
              </div>
              <p className="text-[11px] text-text-muted font-medium">
                Analyze your active database schema to generate focused analytical niches and pre-built storytelling templates.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-muted rounded-full transition-all border border-transparent hover:border-surface-border/30"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex min-h-0 relative z-10">
          {(!schema || schema.length === 0) ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
              <AlertCircle className="w-12 h-12 text-warning opacity-80" />
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">No Active Schema</h3>
              <p className="text-xs text-text-muted max-w-sm font-medium leading-relaxed">
                Connect to a database first to load its tables and schema details before using the storytelling planner.
              </p>
              <button 
                onClick={onClose}
                className="mt-2 btn-secondary px-4 py-2 text-xs"
              >
                Go back
              </button>
            </div>
          ) : loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4 bg-[#0a0f24]/20">
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border-2 border-accent/10 border-t-accent animate-spin" />
                <Sparkles className="w-6 h-6 text-accent absolute animate-pulse" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h4 className="text-xs font-bold text-text-primary uppercase tracking-widest">NivexAI Analytics Engine</h4>
                <p className="text-xs text-text-muted font-medium leading-relaxed">
                  Synthesizing {schema.length} database tables and indexing columns to curate relevant industry niches and write tailored, syntax-checked SQL query narratives...
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
              <AlertCircle className="w-12 h-12 text-danger opacity-85" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Planning Analysis Failed</h3>
                <p className="text-xs text-text-muted max-w-md font-medium leading-relaxed">
                  {error}
                </p>
              </div>
              <button 
                onClick={fetchNiches}
                className="btn-primary px-4 py-2 text-xs"
              >
                Retry Analysis
              </button>
            </div>
          ) : niches.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
              <BookOpen className="w-12 h-12 text-text-muted opacity-60" />
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">No Suggestions Found</h3>
              <p className="text-xs text-text-muted max-w-sm font-medium leading-relaxed">
                Could not automatically generate niches. Click below to manually request the AI analysis engine.
              </p>
              <button 
                onClick={fetchNiches}
                className="btn-primary px-4 py-2 text-xs"
              >
                Analyze Schema
              </button>
            </div>
          ) : (
            <>
              {/* Left Column: Niches List (35%) */}
              <div className="w-[35%] border-r border-surface-border/40 flex flex-col bg-surface-base/15">
                <div className="px-4 py-3 bg-[#0a0f24]/30 border-b border-surface-border/30 text-[10px] font-bold text-accent uppercase tracking-widest shrink-0">
                  Target Analytical Niches
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
                  {niches.map((niche, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedIdx(idx)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all relative overflow-hidden group flex flex-col gap-2 ${
                        selectedIdx === idx
                          ? 'border-accent/40 bg-accent/10 shadow-sm'
                          : 'border-surface-border/40 bg-[#0d1430]/35 hover:bg-[#0d1430]/60 hover:border-surface-border/80'
                      }`}
                    >
                      {selectedIdx === idx && (
                        <div className="absolute top-0 left-0 bottom-0 w-1 bg-accent" />
                      )}
                      <h4 className={`text-xs font-bold transition-colors ${selectedIdx === idx ? 'text-accent' : 'text-text-primary group-hover:text-accent'}`}>
                        {niche.name}
                      </h4>
                      <p className="text-[10px] text-text-secondary line-clamp-2 leading-relaxed font-medium">
                        {niche.description}
                      </p>
                      {/* Show how many queries already added from this niche */}
                      {niche.queries.some(q => addedMap[addedKey(niche.name, q.title)]) && (
                        <span className="text-[9px] font-bold text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-full self-start flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" />
                          {niche.queries.filter(q => addedMap[addedKey(niche.name, q.title)]).length}/{niche.queries.length} imported
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="p-4 border-t border-surface-border/30 bg-[#070b19]/25 shrink-0 flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-mono text-text-muted uppercase font-bold">Session Blueprints</span>
                    <span className="text-[8px] text-success/70 font-medium">✓ Cached — no re-analysis needed</span>
                  </div>
                  <button
                    onClick={handleRefresh}
                    disabled={loading}
                    className="flex items-center gap-1 text-[9px] font-bold text-accent hover:text-accent/80 uppercase transition-colors disabled:opacity-40"
                    title="Clear cache and re-analyze schema with AI"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    Re-analyze
                  </button>
                </div>

              </div>

              {/* Right Column: Queries & Templates (65%) */}
              <div className="w-[65%] flex flex-col bg-surface-base/5">
                {/* Niche Summary Banner */}
                <div className="px-6 py-5 bg-[#0a0f24]/35 border-b border-surface-border/30 shrink-0 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Selected Blueprint</span>
                    <h3 className="text-sm font-extrabold text-text-primary mt-1">{niches[selectedIdx].name}</h3>
                    <p className="text-xs text-text-secondary leading-relaxed font-medium mt-1">
                      {niches[selectedIdx].description}
                    </p>
                    {/* Destination notebook badge */}
                    <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold text-accent/80 bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full">
                      <ExternalLink className="w-2.5 h-2.5" />
                      Opens in tab: <span className="text-accent">{niches[selectedIdx].name}</span>
                    </span>
                  </div>
                  <button
                    onClick={() => handleImportAll(niches[selectedIdx])}
                    className="btn-primary py-2 px-4 text-xs font-bold flex items-center gap-1.5 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer shadow-md shrink-0 bg-gradient-to-r from-accent to-accent-hover text-white"
                  >
                    <Sparkles className="w-3.5 h-3.5 animate-pulse text-white" />
                    Import All {niches[selectedIdx].queries.length} Queries
                  </button>
                </div>

                {/* Templates Scroll area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
                  {niches[selectedIdx].queries.map((q, idx) => (
                    <div 
                      key={idx}
                      className="glass border border-surface-border/50 rounded-2xl p-5 hover:border-accent/30 transition-all flex flex-col gap-3.5 shadow-sm relative group bg-[#0d1430]/25"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-accent bg-accent/15 px-2 py-0.5 rounded border border-accent/20">
                            Template {idx + 1}
                          </span>
                          <h4 className="text-xs font-bold text-text-primary">{q.title}</h4>
                        </div>
                        <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider bg-surface-muted/50 px-2 py-0.5 rounded border border-surface-border/30 flex items-center gap-1">
                          {getVizIcon(q.viz)}
                          {q.viz}
                        </span>
                      </div>

                      <p className="text-[11px] text-text-secondary leading-relaxed font-medium">
                        {q.question}
                      </p>

                      <div className="relative">
                        <pre className="text-[10px] font-mono text-accent bg-black/40 border border-surface-border/50 rounded-xl p-3.5 overflow-x-auto max-h-36 scrollbar-thin select-text">
                          {q.sql}
                        </pre>
                      </div>

                      <div className="flex justify-end">
                        {addedMap[addedKey(niches[selectedIdx].name, q.title)] ? (
                          <button
                            disabled
                            className="py-1.5 px-3.5 text-[11px] font-bold flex items-center gap-1.5 rounded-xl border border-success/30 bg-success/10 text-success cursor-default"
                          >
                            <Check className="w-3.5 h-3.5 text-success" />
                            Added → "{niches[selectedIdx].name}"
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUseQuery(niches[selectedIdx], q)}
                            className="btn-primary py-1.5 px-3.5 text-[11px] font-bold flex items-center gap-1.5 rounded-xl hover:scale-[1.02] active:scale-95 transition-all cursor-pointer shadow-md"
                          >
                            <Play className="w-3 h-3 fill-white" />
                            Add & Run Query
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
