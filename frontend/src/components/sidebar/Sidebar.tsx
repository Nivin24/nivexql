import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Database, Plus, Trash2, ChevronRight, ChevronDown, Star,
  Table, Columns, Search, Loader2, CheckCircle2, ServerCrash, X, Settings, Layout, BookOpen, Type, Clock, XCircle, Palette, Sun, Moon, BookMarked, Copy, Shield
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { ConnectionConfig } from '../../store/useAppStore';
import { apiConnectServer, apiSearchDatabases, apiSelectDatabase } from '../../lib/api';
import { editorThemes } from '../../lib/editorThemes';
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
  
  const activeCellId = useAppStore(s => s.activeCellId);
  const updateCell = useAppStore(s => s.updateCell);
  
  const globalContext = useAppStore(s => s.globalContext);
  const setGlobalContext = useAppStore(s => s.setGlobalContext);
  
  const uiTextSize = useAppStore(s => s.uiTextSize);
  const setUiTextSize = useAppStore(s => s.setUiTextSize);
  const editorTheme = useAppStore(s => s.editorTheme);
  const setEditorTheme = useAppStore(s => s.setEditorTheme);
  const queryHistory = useAppStore(s => s.queryHistory);
  const clearQueryHistory = useAppStore(s => s.clearQueryHistory);
  const favorites = useAppStore(s => s.favorites);
  const addFavorite = useAppStore(s => s.addFavorite);
  const appTheme = useAppStore(s => s.appTheme);
  const setAppTheme = useAppStore(s => s.setAppTheme);

  const toggleTheme = () => setAppTheme(appTheme === 'dark' ? 'light' : 'dark');
  
  const cycleTextSize = () => {
    const sizes: ('xs' | 'sm' | 'base' | 'lg')[] = ['xs', 'sm', 'base', 'lg'];
    const next = sizes[(sizes.indexOf(uiTextSize) + 1) % sizes.length];
    setUiTextSize(next);
  };
  
  const [tab, setTab] = useState<'schema' | 'history' | 'saved' | 'knowledge'>('schema');
  const [expandedTbls, setExpandedTbls] = useState<Record<string, boolean>>({});
  const [previewQuery, setPreviewQuery] = useState<{ sql: string, name: string } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

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
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === 'schema' && (
          <div className="p-3 flex flex-col gap-1">
            {schema.map(tbl => (
              <div key={tbl.name} className="flex flex-col">
                <div 
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-muted transition-colors cursor-pointer group"
                  onClick={() => toggleTable(tbl.name)}
                >
                  <ChevronDown className={`w-3 h-3 text-text-muted transition-transform ${expandedTbls[tbl.name] ? '' : '-rotate-90'}`} />
                  <Table className="w-3.5 h-3.5 text-accent/70" />
                  <span className="text-xs text-text-secondary font-medium truncate">{tbl.name}</span>
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
                {expandedTbls[tbl.name] && (
                  <div className="ml-7 flex flex-col gap-1 py-1 border-l border-surface-border pl-3 animate-in slide-in-from-left-1 duration-200">
                    {tbl.columns.map(col => (
                      <div key={col.name} className="flex items-center gap-2 group/col">
                        <Columns className="w-2.5 h-2.5 text-text-muted" />
                        <span className="text-[10px] text-text-muted font-mono">{col.name}</span>
                        <span className="text-[9px] text-text-muted/50 italic">{col.type}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
            <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4 flex flex-col gap-1.5">
              {queryHistory.length === 0 && (
                <div className="p-8 text-center opacity-30">
                  <Clock className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-[10px] uppercase tracking-widest font-bold">No history yet</p>
                </div>
              )}
              {queryHistory.map(h => (
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
              ))}
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
                  onClick={() => setPreviewQuery({ sql, name: 'Saved Query' })}
                  title="Click to preview query"
                >
                  <div className="flex items-center gap-2">
                    <Star className="w-3 h-3 text-warning fill-warning shrink-0" />
                    <pre className="text-[10px] text-text-secondary font-mono truncate flex-1">{sql.replace(/\s+/g, ' ').trim()}</pre>
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
            onClick={cycleTextSize}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-muted transition-colors text-text-muted hover:text-text-primary"
            title={`Toggle Text Size (Current: ${uiTextSize.toUpperCase()})`}
          >
            <Type className="w-4 h-4" />
            <span className="text-[10px] font-medium">Text: {uiTextSize.toUpperCase()}</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-surface-muted transition-colors text-text-muted hover:text-text-primary"
              title={appTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {appTheme === 'dark'
                ? <Sun className="w-4 h-4 text-warning" />
                : <Moon className="w-4 h-4 text-accent" />}
            </button>

            <div className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-muted transition-colors text-text-muted hover:text-text-primary group relative">
              <Palette className="w-4 h-4" />
              <select
                value={editorTheme}
                onChange={(e) => setEditorTheme(e.target.value)}
                className="bg-transparent border-none text-[10px] font-medium focus:outline-none cursor-pointer appearance-none pr-4"
                style={{ width: 'fit-content' }}
              >
                {editorThemes.map(t => (
                  <option key={t.id} value={t.id} className="bg-surface-card text-text-primary">{t.label}</option>
                ))}
              </select>
              <div className="absolute right-2 pointer-events-none group-hover:text-accent transition-colors">
                <ChevronDown className="w-2.5 h-2.5 opacity-60" />
              </div>
            </div>
          </div>
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
