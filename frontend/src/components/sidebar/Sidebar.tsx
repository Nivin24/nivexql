import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Database, Plus, Trash2, ChevronDown, Star,
  Table, Columns, Search, Loader2, CheckCircle2, Layout, BookOpen, Clock, XCircle, BookMarked, Copy, Shield, Settings,
  Activity, HardDrive, Lock, RefreshCw
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { 
  apiConnectServer, 
  apiSelectDatabase,
  apiGetInspectorStats,
  apiGetInspectorSessions,
  apiGetInspectorLocks,
  apiTerminateSession
} from '../../lib/api';

import { format } from 'sql-formatter';

interface SidebarProps {
  width: number;
}

export default function Sidebar({ width }: SidebarProps) {
  const connections = useAppStore(s => s.connections);
  const activeConnectionId = useAppStore(s => s.activeConnectionId);
  const removeConnection = useAppStore(s => s.removeConnection);
  const setActiveConnection = useAppStore(s => s.setActiveConnection);
  const schema = useAppStore(s => s.schema);
  const setSchema = useAppStore(s => s.setSchema);
  const setShowConnModal = useAppStore(s => s.setShowConnModal);
  const activeNotebookId = useAppStore(s => s.activeNotebookId);
  const notebooks = useAppStore(s => s.notebooks);
  const activeNotebook = notebooks.find(n => n.id === activeNotebookId);
  const activeCellId = activeNotebook?.activeCellId || null;
  const updateCell = useAppStore(s => s.updateCell);
  
  const globalContext = useAppStore(s => s.globalContext);
  const setGlobalContext = useAppStore(s => s.setGlobalContext);
  

  const queryHistory = useAppStore(s => s.queryHistory);
  const clearQueryHistory = useAppStore(s => s.clearQueryHistory);
  const favorites = useAppStore(s => s.favorites);
  const addFavorite = useAppStore(s => s.addFavorite);
  const removeFavorite = useAppStore(s => s.removeFavorite);
  const setShowSettingsModal = useAppStore(s => s.setShowSettingsModal);
  
  const [tab, setTab] = useState<'schema' | 'history' | 'saved' | 'knowledge' | 'inspector'>('schema');
  const [expandedTbls, setExpandedTbls] = useState<Record<string, boolean>>({});
  const [previewQuery, setPreviewQuery] = useState<{ sql: string, name: string } | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [schemaSearch, setSchemaSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'success' | 'failed'>('all');

  // Inspector States
  const [inspectorStats, setInspectorStats] = useState<any[]>([]);
  const [inspectorSessions, setInspectorSessions] = useState<any[]>([]);
  const [inspectorLocks, setInspectorLocks] = useState<any[]>([]);
  const [loadingInspector, setLoadingInspector] = useState(false);
  const [inspectorError, setInspectorError] = useState<string | null>(null);

  const refreshInspector = async () => {
    if (!activeConnectionId) {
      setInspectorError('No active connection');
      return;
    }
    setLoadingInspector(true);
    setInspectorError(null);
    try {
      const [statsRes, sessionsRes, locksRes] = await Promise.all([
        apiGetInspectorStats().catch(() => ({ stats: [] })),
        apiGetInspectorSessions().catch(() => ({ sessions: [] })),
        apiGetInspectorLocks().catch(() => ({ locks: [] }))
      ]);
      setInspectorStats(statsRes.stats || []);
      setInspectorSessions(sessionsRes.sessions || []);
      setInspectorLocks(locksRes.locks || []);
    } catch (err: any) {
      setInspectorError(err.message || 'Failed to fetch database diagnostics');
    } finally {
      setLoadingInspector(false);
    }
  };

  const handleTerminateSession = async (pid: number) => {
    try {
      const res = await apiTerminateSession(pid);
      if (res.status === 'terminated') {
        const sessionsRes = await apiGetInspectorSessions();
        setInspectorSessions(sessionsRes.sessions || []);
      } else {
        alert('Could not terminate session.');
      }
    } catch (err: any) {
      alert(`Error terminating session: ${err.message}`);
    }
  };

  useEffect(() => {
    if (tab === 'inspector') {
      refreshInspector();
    }
  }, [tab, activeConnectionId]);

  const handleSelectConn = async (id: string) => {
    const conn = connections.find(c => c.id === id);
    if (!conn) return;
    setActiveConnection(id);
    try {
      await apiConnectServer(conn);
      const { tables } = await apiSelectDatabase(conn.database);
      setSchema(tables);
    } catch {}
  };

  const toggleTable = (name: string) => {
    setExpandedTbls(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const formatCount = (num: number | undefined) => {
    if (num === undefined) return '';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  const insertTable = (name: string) => {
    if (activeCellId) {
      const state = useAppStore.getState();
      const activeNb = state.notebooks.find(n => n.id === state.activeNotebookId);
      if (!activeNb) return;
      const currentPrompt = activeNb.cells.find(c => c.id === activeCellId)?.prompt || '';
      updateCell(activeCellId, { prompt: currentPrompt + ` ${name} ` });
    }
  };

  const handleInsertPreview = () => {
    if (!previewQuery) return;
    const state = useAppStore.getState();
    state.addCell();
    // After adding, the cell is the last one in the active notebook
    setTimeout(() => {
      const updatedState = useAppStore.getState();
      const activeNb = updatedState.notebooks.find(n => n.id === updatedState.activeNotebookId);
      if (!activeNb) return;
      const newCellId = activeNb.cells[activeNb.cells.length - 1].id;
      updatedState.updateCell(newCellId, { sql: previewQuery.sql, prompt: previewQuery.name });
      setPreviewQuery(null);
    }, 0);
  };

  const handleCopy = () => {
    if (!previewQuery) return;
    navigator.clipboard.writeText(previewQuery.sql);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <aside 
      className="flex flex-col h-full bg-surface-base border-r border-surface-border glass transition-all duration-300"
      style={{ width }}
    >
      {/* App Header */}
      <div className="p-6 border-b border-surface-border flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <img src="/logo_combined.svg" className="h-13 w-auto self-start" alt="NivexQL Logo" />
          <div className="flex items-center gap-1.5 ml-1 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Workbench</span>
          </div>
        </div>
      </div>

      {/* Sources Section */}
      <div className="px-4 py-4 border-b border-surface-border">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Sources</span>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => useAppStore.getState().setShowSchemaDiagram(true)}
              className="p-1 hover:bg-surface-muted rounded-md transition-colors text-accent/70 hover:text-accent"
              title="View Schema Map"
            >
              <Layout className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => setShowConnModal(true)} 
              className="p-1 hover:bg-surface-muted rounded-md transition-colors"
              title="Add New Connection"
            >
              <Plus className="w-3.5 h-3.5 text-accent" />
            </button>
          </div>
        </div>
        
        <div className="flex flex-col gap-1.5">
          {connections.map(conn => (
            <div 
              key={conn.id}
              onClick={() => handleSelectConn(conn.id)}
              className={`group relative flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer
                ${activeConnectionId === conn.id 
                  ? 'bg-accent/10 border-accent/30 shadow-sm ring-1 ring-accent/20' 
                  : 'bg-surface-card/50 border-surface-border hover:border-text-muted/30'}`}
            >
              <div className={`p-1.5 rounded-lg ${activeConnectionId === conn.id ? 'bg-accent/20' : 'bg-surface-muted'}`}>
                <Database className={`w-3.5 h-3.5 ${activeConnectionId === conn.id ? 'text-accent' : 'text-text-muted'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-text-primary">
                  <span className="truncate">{conn.label}</span>
                  {conn.use_ssh && (
                    <span className="flex items-center gap-0.5 bg-warning/10 text-warning border border-warning/20 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-widest shrink-0">
                      <Shield className="w-2.5 h-2.5" />
                      SSH
                    </span>
                  )}
                </div>
                <div className="text-[9px] text-text-muted uppercase tracking-tighter">{conn.dialect} • {conn.database}</div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); removeConnection(conn.id); }}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-danger/10 hover:text-danger rounded-md transition-all"
                title="Remove Connection"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {connections.length === 0 && (
            <div className="px-1 py-4 text-center border border-dashed border-surface-border rounded-xl">
              <p className="text-[10px] text-text-muted italic">No sources connected</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border bg-surface-base/50">
        <button
          onClick={() => setTab('schema')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all
            ${tab === 'schema' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-primary'}`}
        >
          Schema
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all
            ${tab === 'history' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-primary'}`}
        >
          History
        </button>
        <button
          onClick={() => setTab('saved')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all
            ${tab === 'saved' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-primary'}`}
        >
          Saved
        </button>
        <button
          onClick={() => setTab('knowledge')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all
            ${tab === 'knowledge' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-primary'}`}
        >
          Context
        </button>
        <button
          onClick={() => setTab('inspector')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all
            ${tab === 'inspector' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-primary'}`}
        >
          Inspector
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === 'schema' && (
          <div className="p-3 flex flex-col gap-2">
            {schema.length > 0 && (
              <div className="relative flex items-center bg-surface-base border border-surface-border rounded-lg px-2.5 py-1.5 focus-within:border-accent/50 transition-colors">
                <Search className="w-3.5 h-3.5 text-text-muted shrink-0 mr-2" />
                <input
                  type="text"
                  placeholder="Filter tables/columns..."
                  value={schemaSearch}
                  onChange={e => setSchemaSearch(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
                />
                {schemaSearch && (
                  <button
                    onClick={() => setSchemaSearch('')}
                    className="text-text-muted hover:text-text-primary text-[10px] uppercase font-bold shrink-0 ml-1.5"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1">
              {schema.filter(tbl => {
                const term = schemaSearch.toLowerCase();
                if (!term) return true;
                if (tbl.name.toLowerCase().includes(term)) return true;
                return tbl.columns.some(col => col.name.toLowerCase().includes(term));
              }).map(tbl => {
                const term = schemaSearch.toLowerCase();
                const hasMatchingCol = term && tbl.columns.some(col => col.name.toLowerCase().includes(term));
                const isExpanded = expandedTbls[tbl.name] || !!hasMatchingCol;

                return (
                  <div key={tbl.name} className="flex flex-col">
                    <div 
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-muted transition-colors cursor-pointer group"
                      onClick={() => toggleTable(tbl.name)}
                    >
                      <ChevronDown className={`w-3 h-3 text-text-muted transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                      <Table className="w-3.5 h-3.5 text-accent/70" />
                      <span className="text-xs text-text-secondary font-medium truncate">
                        {schemaSearch ? (
                          (() => {
                            const parts = tbl.name.split(new RegExp(`(${schemaSearch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'));
                            return parts.map((part, idx) => 
                              part.toLowerCase() === schemaSearch.toLowerCase() 
                                ? <span key={idx} className="text-accent font-semibold">{part}</span> 
                                : part
                            );
                          })()
                        ) : tbl.name}
                      </span>
                      {tbl.rowCount !== undefined && (
                        <span className="text-[9px] font-mono text-text-muted/60 bg-surface-base px-1.5 py-0.5 rounded border border-surface-border">
                          {formatCount(tbl.rowCount)}
                        </span>
                      )}
                      <div className="flex-1" />
                      <button 
                        onClick={(e) => { e.stopPropagation(); insertTable(tbl.name); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-accent hover:bg-accent/10 rounded"
                        title="Insert table name"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="ml-7 flex flex-col gap-1 py-1 border-l border-surface-border pl-3 animate-in slide-in-from-left-1 duration-200">
                        {tbl.columns.filter(col => {
                          if (!schemaSearch) return true;
                          return tbl.name.toLowerCase().includes(term) || col.name.toLowerCase().includes(term);
                        }).map(col => (
                          <div key={col.name} className="flex items-center gap-2 group/col">
                            <Columns className="w-2.5 h-2.5 text-text-muted" />
                            <span className="text-[10px] text-text-muted font-mono">
                              {schemaSearch ? (
                                (() => {
                                  const parts = col.name.split(new RegExp(`(${schemaSearch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'));
                                  return parts.map((part, idx) => 
                                    part.toLowerCase() === schemaSearch.toLowerCase() 
                                      ? <span key={idx} className="text-accent font-semibold">{part}</span> 
                                      : part
                                  );
                                })()
                              ) : col.name}
                            </span>
                            <span className="text-[9px] text-text-muted/50 italic">{col.type}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {schema.length > 0 && schema.filter(tbl => {
                const term = schemaSearch.toLowerCase();
                if (!term) return true;
                if (tbl.name.toLowerCase().includes(term)) return true;
                return tbl.columns.some(col => col.name.toLowerCase().includes(term));
              }).length === 0 && (
                <div className="p-6 text-center text-text-muted italic text-[11px]">
                  No tables or columns match "{schemaSearch}"
                </div>
              )}
            </div>

            {activeConnectionId && schema.length === 0 && (
              <div className="p-8 text-center opacity-40">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                <span className="text-[10px] uppercase font-bold tracking-widest">Loading schema...</span>
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="flex flex-col h-full animate-in fade-in">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-2 text-accent">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Query History</span>
              </div>
              {queryHistory.length > 0 && (
                <button onClick={clearQueryHistory} className="text-[10px] text-danger/60 hover:text-danger transition-colors" title="Clear history">Clear</button>
              )}
            </div>
            <div className="px-3 pb-2 flex flex-col gap-2">
              <div className="relative flex items-center bg-surface-base border border-surface-border rounded-lg px-2.5 py-1.5 focus-within:border-accent/50 transition-colors">
                <Search className="w-3.5 h-3.5 text-text-muted shrink-0 mr-2" />
                <input
                  type="text"
                  placeholder="Search history..."
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
                />
                {historySearch && (
                  <button onClick={() => setHistorySearch('')} className="text-text-muted hover:text-text-primary text-[10px] uppercase font-bold shrink-0 ml-1.5">Clear</button>
                )}
              </div>
              <div className="flex gap-1 p-0.5 bg-surface-base border border-surface-border rounded-xl text-[9px] font-bold">
                {(['all', 'success', 'failed'] as const).map(status => (
                  <button
                    key={status}
                    onClick={() => setHistoryStatusFilter(status)}
                    className={`flex-1 py-1.5 rounded-lg capitalize transition-all cursor-pointer
                      ${historyStatusFilter === status ? 'bg-surface-muted text-text-primary border border-surface-border/50 shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4 flex flex-col gap-1.5">
              {(() => {
                const filteredHistory = queryHistory.filter(h => {
                  const term = historySearch.toLowerCase();
                  if (term) {
                    const matchSql = h.sql.toLowerCase().includes(term);
                    const matchName = h.cellName?.toLowerCase().includes(term);
                    if (!matchSql && !matchName) return false;
                  }
                  if (historyStatusFilter === 'success' && !h.success) return false;
                  if (historyStatusFilter === 'failed' && h.success) return false;
                  return true;
                });

                if (filteredHistory.length === 0) {
                  return (
                    <div className="p-8 text-center opacity-30">
                      <Clock className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-[10px] uppercase tracking-widest font-bold">No history matches</p>
                    </div>
                  );
                }

                return filteredHistory.map(h => (
                <div
                  key={h.id}
                  className="group flex flex-col gap-1 p-2.5 rounded-xl border border-surface-border/50 bg-surface-card/30 hover:border-accent/20 hover:bg-surface-card/60 cursor-pointer transition-all"
                  onClick={() => setPreviewQuery({ sql: h.sql, name: h.cellName || 'History Query' })}
                  title="Click to preview query"
                >
                  <div className="flex items-center gap-2">
                    {h.success
                      ? <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                      : <XCircle className="w-3 h-3 text-danger shrink-0" />}
                    <span className="text-[10px] font-bold text-text-muted truncate flex-1">{h.cellName}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); addFavorite(h.sql); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-warning transition-all"
                      title="Save query"
                    >
                      <Star className="w-3 h-3" />
                    </button>
                    <span className="text-[9px] text-text-muted/50 shrink-0">{h.executionMs}ms</span>
                  </div>
                  <pre className="text-[10px] text-text-secondary font-mono truncate bg-surface-base/40 rounded px-2 py-1 max-w-full">{h.sql.replace(/\s+/g, ' ').trim()}</pre>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-text-muted/60">{h.rowCount} rows</span>
                    <span className="text-[9px] text-text-muted/50">{new Date(h.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ));
            })()}
            </div>
          </div>
        )}

        {tab === 'saved' && (
          <div className="flex flex-col h-full animate-in fade-in">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-2 text-accent">
                <BookMarked className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Saved Queries</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4 flex flex-col gap-1.5">
              {favorites.length === 0 && (
                <div className="p-8 text-center opacity-30">
                  <Star className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-[10px] uppercase tracking-widest font-bold">No saved queries</p>
                  <p className="text-[9px] mt-1 text-text-muted">Star queries from History to save them here</p>
                </div>
              )}
              {favorites.map((sql, i) => (
                <div
                  key={i}
                  className="group flex flex-col gap-1 p-2.5 rounded-xl border border-surface-border/50 bg-surface-card/30 hover:border-accent/20 hover:bg-surface-card/60 cursor-pointer transition-all"
                  onClick={() => setPreviewQuery({ sql, name: `Saved Query ${i + 1}` })}
                  title="Click to preview query"
                >
                  <div className="flex items-center gap-2">
                    <Star className="w-3 h-3 text-warning fill-warning shrink-0" />
                    <pre className="text-[10px] text-text-secondary font-mono truncate flex-1">{sql.replace(/\s+/g, ' ').trim()}</pre>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFavorite(sql); }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-danger rounded transition-all shrink-0"
                      title="Delete Saved Query"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'knowledge' && (
          <div className="flex flex-col h-full p-4 gap-3 animate-in fade-in">
            <div className="flex items-center gap-2 text-accent">
              <BookOpen className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Business Context</span>
            </div>
            <p className="text-[10px] text-text-muted leading-relaxed">
              Add business rules, column definitions, or specific instructions here. 
              The agent will use this as a reference for all queries.
            </p>
            <textarea
              value={globalContext}
              onChange={(e) => setGlobalContext(e.target.value)}
              placeholder="Example: 'Revenue' is total_amount - discount..."
              className="flex-1 bg-surface-base/50 border border-surface-border rounded-xl p-3 text-xs text-text-primary focus:outline-none focus:border-accent resize-none placeholder:text-text-muted/50"
            />
          </div>
        )}

        {tab === 'inspector' && (
          <div className="flex flex-col h-full p-3.5 gap-3.5 animate-in fade-in scrollbar-thin overflow-y-auto">
            {/* Header / Refresh */}
            <div className="flex items-center justify-between border-b border-surface-border/40 pb-2">
              <div className="flex items-center gap-2 text-accent">
                <Activity className="w-4 h-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Database Diagnostics</span>
              </div>
              <button
                onClick={refreshInspector}
                disabled={loadingInspector || !activeConnectionId}
                className="p-1.5 rounded-lg bg-surface-muted/50 hover:bg-surface-muted border border-surface-border/60 text-text-secondary hover:text-text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Refresh diagnostics"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingInspector ? 'animate-spin text-accent' : ''}`} />
              </button>
            </div>

            {inspectorError && (
              <div className="p-3 rounded-xl border border-danger/20 bg-danger/10 text-danger text-[11px] leading-relaxed">
                {inspectorError}
              </div>
            )}

            {!activeConnectionId ? (
              <div className="p-8 text-center text-text-muted italic text-[11px]">
                Connect to a database to inspect active sessions, locks, and table disk usage.
              </div>
            ) : (
              <div className="flex flex-col gap-4 pb-4">
                {/* 1. TABLE SIZES & ROWS */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-text-secondary font-semibold text-[10px] uppercase tracking-wider">
                    <HardDrive className="w-3.5 h-3.5 text-accent" />
                    <span>Table Sizes & Row Counts</span>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-[250px] overflow-y-auto scrollbar-thin">
                    {inspectorStats.length === 0 ? (
                      <div className="p-4 text-center text-text-muted italic text-[10px] bg-surface-card/20 rounded-xl border border-surface-border/30">
                        No tables found.
                      </div>
                    ) : (
                      inspectorStats.map((stat, i) => (
                        <div key={i} className="p-2.5 rounded-xl border border-surface-border/40 bg-surface-card/25 flex flex-col gap-1 hover:border-accent/10 hover:bg-surface-card/50 transition-all">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-text-primary truncate max-w-[150px]" title={stat.table_name}>
                              {stat.table_name}
                            </span>
                            <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">
                              {stat.total_size}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-text-muted font-medium">
                            <span>Rows: {stat.row_count?.toLocaleString() ?? 0}</span>
                            <div className="flex gap-2 text-[9px] uppercase tracking-wider font-semibold">
                              <span>Data: {stat.table_size}</span>
                              <span className="text-text-muted/60">|</span>
                              <span>Idx: {stat.index_size}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 2. ACTIVE DB SESSIONS */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-text-secondary font-semibold text-[10px] uppercase tracking-wider">
                      <Activity className="w-3.5 h-3.5 text-success" />
                      <span>Active Sessions ({inspectorSessions.length})</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto scrollbar-thin">
                    {inspectorSessions.length === 0 ? (
                      <div className="p-4 text-center text-text-muted italic text-[10px] bg-surface-card/20 rounded-xl border border-surface-border/30">
                        No active sessions.
                      </div>
                    ) : (
                      inspectorSessions.map((sess, i) => (
                        <div key={i} className="p-2.5 rounded-xl border border-surface-border/40 bg-surface-card/25 flex flex-col gap-2 hover:border-accent/10 hover:bg-surface-card/50 transition-all group/sess relative">
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-text-primary">
                                PID: {sess.pid} <span className="text-text-muted font-normal">({sess.user}@{sess.client || 'local'})</span>
                              </span>
                              <span className="text-[9px] text-text-muted font-mono mt-0.5">
                                {sess.start_time} • state: <span className="text-success font-semibold">{sess.state}</span>
                              </span>
                            </div>
                            {sess.user !== 'local' && (
                              <button
                                onClick={() => {
                                  if (confirm(`Are you sure you want to terminate session PID ${sess.pid}?`)) {
                                    handleTerminateSession(sess.pid);
                                  }
                                }}
                                className="p-1 hover:text-danger rounded hover:bg-danger/10 transition-all shrink-0 cursor-pointer"
                                title="Terminate/Kill Session"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          {sess.query && (
                            <div className="bg-surface-base/60 p-1.5 rounded-lg border border-surface-border/30">
                              <pre className="text-[9px] font-mono text-text-secondary whitespace-pre-wrap truncate max-h-[60px] overflow-y-auto scrollbar-thin">
                                {sess.query}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 3. ACTIVE LOCKS */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-text-secondary font-semibold text-[10px] uppercase tracking-wider">
                    <Lock className="w-3.5 h-3.5 text-warning" />
                    <span>Active Database Locks ({inspectorLocks.length})</span>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto scrollbar-thin">
                    {inspectorLocks.length === 0 ? (
                      <div className="p-4 text-center text-text-muted italic text-[10px] bg-surface-card/20 rounded-xl border border-surface-border/30">
                        No active table locks.
                      </div>
                    ) : (
                      inspectorLocks.map((lock, i) => (
                        <div key={i} className="p-2.5 rounded-xl border border-surface-border/40 bg-surface-card/25 flex flex-col gap-1 hover:border-accent/10 hover:bg-surface-card/50 transition-all">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-text-primary truncate max-w-[150px]">
                              {lock.table_name}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${lock.granted ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'}`}>
                              {lock.granted ? 'GRANTED' : 'WAITING'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-text-muted font-medium">
                            <span>Mode: {lock.mode}</span>
                            <span>PID: {lock.pid} ({lock.user})</span>
                          </div>
                          {lock.query && (
                            <pre className="text-[8px] font-mono text-text-muted bg-surface-base/30 p-1 rounded border border-surface-border/20 truncate">
                              {lock.query}
                            </pre>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 bg-surface-base/50 border-t border-surface-border">
        <div className="flex items-center justify-between text-[9px] text-text-muted font-bold uppercase tracking-widest mb-3">
          <span>Settings & Status</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-success animate-pulse" />
            <span className="text-success">Live</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-muted transition-colors text-text-muted hover:text-text-primary w-full justify-center border border-dashed border-surface-border/60"
            title="Open system preferences"
          >
            <Settings className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-widest">Preferences</span>
          </button>
        </div>
      </div>

      {/* Query Preview Modal */}
      {previewQuery && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-surface-base/80 backdrop-blur-sm animate-in fade-in" onClick={() => setPreviewQuery(null)}>
          <div 
            className="w-full max-w-2xl bg-surface-card border border-surface-border shadow-2xl rounded-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between glass sticky top-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent/10 rounded-xl">
                  <Search className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-primary tracking-tight">{previewQuery.name}</h3>
                  <p className="text-[11px] text-text-muted font-medium mt-0.5">Query Preview</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className={`btn-ghost flex items-center gap-1.5 transition-colors ${isCopied ? 'text-success' : ''}`}
                >
                  {isCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span className="text-[11px] font-medium">{isCopied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto scrollbar-thin">
              <pre className="text-xs text-text-secondary font-mono bg-surface-base/50 p-4 rounded-xl border border-surface-border/50 whitespace-pre-wrap overflow-x-auto shadow-inner">
                {format(previewQuery.sql, { language: 'postgresql' })}
              </pre>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-surface-border bg-surface-muted/30 flex items-center justify-end gap-3 glass">
              <button
                onClick={() => setPreviewQuery(null)}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleInsertPreview}
                className="btn-primary"
              >
                <Plus className="w-4 h-4" />
                Insert into New Cell
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </aside>
  );
}
