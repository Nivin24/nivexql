import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Trash2, Play, Sparkles, ChevronDown, ChevronUp, 
  BarChart2, Table as TableIcon, Download, MessageSquare, 
  Loader2, Zap, AlignLeft, Pencil, Check, Palette, GripVertical, Pin, PinOff
} from 'lucide-react';
import Editor, { loader } from '@monaco-editor/react';
import { format } from 'sql-formatter';
import { useAppStore, type NotebookCell } from '../../store/useAppStore';
import { apiQuery, apiGenerateSql, apiFixSql, apiAnalyzeResults, apiGenerateFollowUps } from '../../lib/api';
import { editorThemes } from '../../lib/editorThemes';
import { toast } from '../shared/Toast';
import D3Chart from '../viz/D3Chart';

interface Props {
  cell: NotebookCell;
  index: number;
  isLast: boolean;
}

export default function NotebookCellComponent({ cell, index }: Props) {
  const updateCell = useAppStore(s => s.updateCell);
  const removeCell = useAppStore(s => s.removeCell);
  const appendAgentLog = useAppStore(s => s.appendAgentLog);
  const clearAgentLog = useAppStore(s => s.clearAgentLog);
  const schema = useAppStore(s => s.schema);
  const llmModel = useAppStore(s => s.llmModel);
  const globalContext = useAppStore(s => s.globalContext);
  const uiTextSize = useAppStore(s => s.uiTextSize);
  const editorTheme = useAppStore(s => s.editorTheme);
  const setEditorTheme = useAppStore(s => s.setEditorTheme);
  const togglePinCell = useAppStore(s => s.togglePinCell);

  const addQueryHistory = useAppStore(s => s.addQueryHistory);

  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(cell.name || '');
  const [splitPct, setSplitPct] = useState(50);
  const [dragActive, setDragActive] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  // Table sort / filter state
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [colFilter, setColFilter] = useState('');
  // Follow-up suggestions
  const [followUps, setFollowUps] = useState<string[]>([]);

  const setSql = (sql: string) => updateCell(cell.id, { sql });
  const setPrompt = (prompt: string) => updateCell(cell.id, { prompt });

  const handleAnalyze = async (columns = cell.queryResult?.columns, rows = cell.queryResult?.rows) => {
    if (!columns || !rows) return;
    appendAgentLog(cell.id, '🧠 Analyzing results...');
    try {
      const { insights } = await apiAnalyzeResults(cell.prompt, columns, rows);
      updateCell(cell.id, { insights });
      appendAgentLog(cell.id, '✅ Insights generated');
    } catch (err) {
      appendAgentLog(cell.id, '❌ Analysis failed');
      toast.warning('Analysis failed', 'Could not generate insights for this result set.');
    }
  };

  const handleFollowUps = async (columns: string[], rows: Record<string, unknown>[]) => {
    try {
      const { suggestions } = await apiGenerateFollowUps(cell.prompt, columns, rows);
      setFollowUps(suggestions);
    } catch { /* silent */ }
  };

  // Resizable split pane drag handling
  const onMouseDown = useCallback(() => {
    isDragging.current = true;
    setDragActive(true);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const pct = Math.min(80, Math.max(20, ((e.clientX - rect.left) / rect.width) * 100));
      setSplitPct(pct);
    };
    const onMouseUp = () => {
      isDragging.current = false;
      setDragActive(false);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Keyboard: Cmd+Enter runs SQL directly, plain Enter generates SQL (check Cmd first!)
  const onPromptKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); return; }
    if (e.key === 'Enter') generateSql();
  };

  // Handle Editor Mounting - Register Themes
  const handleEditorWillMount = (monaco: any) => {
    editorThemes.forEach(theme => {
      monaco.editor.defineTheme(theme.id, theme.definition);
    });
  };

  // Commit name change
  const commitName = () => {
    updateCell(cell.id, { name: nameInput });
    setIsEditingName(false);
  };

  // Keep local nameInput in sync if cell.name changes externally
  useEffect(() => {
    if (!isEditingName) setNameInput(cell.name || '');
  }, [cell.name, isEditingName]);

  const runQuery = async (queryToRun = cell.sql) => {
    clearAgentLog(cell.id);
    updateCell(cell.id, { agentStatus: 'verifying', queryResult: null, insights: null });
    appendAgentLog(cell.id, '🔒 Verifying query…');

    try {
      updateCell(cell.id, { agentStatus: 'executing' });
      appendAgentLog(cell.id, '⚡ Executing…');
      const t0 = Date.now();
      const data = await apiQuery(queryToRun);
      const ms = Date.now() - t0;
      
      // Auto-name manual queries if name is empty
      if (!cell.name || cell.name.startsWith('Analysis Cell')) {
        const tableMatch = queryToRun.match(/from\s+([a-zA-Z0-9_".]+)/i);
        if (tableMatch) {
          const tableName = tableMatch[1].replace(/"/g, '').split('.').pop();
          updateCell(cell.id, { name: `Analysis of ${tableName}` });
        }
      }
      
      updateCell(cell.id, {
        agentStatus: 'done',
        showViz: true,
        queryResult: {
          columns: data.columns,
          rows: data.rows,
          rowCount: data.rows.length,
          executionMs: data.execution_ms ?? ms,
        }
      });
      appendAgentLog(cell.id, `✅ Returned ${data.rows.length} rows`);
      setFollowUps([]);
      addQueryHistory({ sql: queryToRun, cellName: cell.name || `Cell ${cell.id}`, rowCount: data.rows.length, executionMs: data.execution_ms ?? ms, success: true });

      if (data.rows.length > 0 && data.rows.length < 500) {
        handleAnalyze(data.columns, data.rows);
        handleFollowUps(data.columns, data.rows);
      }
    } catch (err: unknown) {
      const e = err as Error;
      appendAgentLog(cell.id, `❌ ${e.message}`);
      updateCell(cell.id, { agentStatus: 'error' });
      toast.error('Query failed', e.message);
      addQueryHistory({ sql: queryToRun, cellName: cell.name || `Cell ${cell.id}`, rowCount: 0, executionMs: 0, success: false });
      throw err; 
    }
  };

  const generateSql = async (retryCount = 0) => {
    if (!cell.prompt.trim()) return;
    clearAgentLog(cell.id);
    updateCell(cell.id, { agentStatus: retryCount > 0 ? 'fixing' : 'generating' });
    appendAgentLog(cell.id, retryCount > 0 ? '🔧 Fixing...' : `🤖 Asking ${llmModel}…`);

    try {
      const { sql: generated, suggested_name } = await apiGenerateSql(cell.prompt, schema, globalContext);

      // Auto-format AI output before displaying — manual edits use the Format button
      let formattedSql = generated;
      try {
        formattedSql = format(generated, { language: 'postgresql', keywordCase: 'upper' });
      } catch { /* if formatter fails, fall back to raw output */ }

      updateCell(cell.id, {
        sql: formattedSql,
        vizType: 'bar',
        name: suggested_name || cell.name
      });
      
      try {
        await runQuery(generated);
      } catch (err: unknown) {
        if (retryCount < 1) {
          const e = err as Error;
          appendAgentLog(cell.id, `⚠️ Error: ${e.message}. Retrying...`);
          const { sql: fixed } = await apiFixSql(cell.prompt, generated, e.message, schema, globalContext);
          setSql(fixed);
          await runQuery(fixed);
        } else {
          throw err;
        }
      }
    } catch (err: unknown) {
      updateCell(cell.id, { agentStatus: 'error' });
      toast.error('Generation failed', 'Could not generate or fix SQL. Check your LLM connection.');
    }
  };

  const handleDrillDown = (col: string, val: any) => {
    const addCell = useAppStore.getState().addCell;
    addCell();
    const currentCells = useAppStore.getState().cells;
    const newCellId = currentCells[currentCells.length - 1].id;
    const drillPrompt = `Show me details where ${col} is "${val}" based on: ${cell.prompt}`;
    useAppStore.getState().updateCell(newCellId, { prompt: drillPrompt });
  };

  const explainQuery = async () => {
    const dialect = useAppStore.getState().connections.find(c => c.id === useAppStore.getState().activeConnectionId)?.dialect;
    const explainSql = dialect === 'postgresql' ? `EXPLAIN ANALYZE ${cell.sql}` : `EXPLAIN ${cell.sql}`;
    appendAgentLog(cell.id, '⏱️ Profiling query performance...');
    try {
      const data = await apiQuery(explainSql);
      const plan = data.rows.map(r => Object.values(r)[0]).join('\n');
      updateCell(cell.id, { insights: `📊 Execution Plan:\n${plan}` });
    } catch (err: any) {
      appendAgentLog(cell.id, `❌ Profiling failed: ${err.message}`);
    }
  };

  const handleExport = async (formatType: 'csv' | 'json') => {
    if (!cell.queryResult) return;
    try {
      const res = await fetch('http://127.0.0.1:8081/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: formatType,
          columns: cell.queryResult.columns,
          rows: cell.queryResult.rows
        })
      });
      const { data, filename, mime } = await res.json();
      const blob = new Blob([data], { type: mime });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    } catch (err) {
      appendAgentLog(cell.id, '❌ Export failed');
    }
  };

  const handleFormat = () => {
    try {
      const formatted = format(cell.sql, { language: 'postgresql', keywordCase: 'upper' });
      setSql(formatted);
    } catch {}
  };

  // Lightweight inline markdown renderer — bold, italic, code, headers, lists, hr
  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, lineIdx) => {
      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        return <hr key={lineIdx} className="border-surface-border my-2" />;
      }
      // Headers
      const h3 = line.match(/^###\s+(.+)/);
      if (h3) return <h3 key={lineIdx} className="font-bold text-text-primary mt-3 mb-1">{h3[1]}</h3>;
      const h2 = line.match(/^##\s+(.+)/);
      if (h2) return <h2 key={lineIdx} className="font-bold text-text-primary text-sm mt-3 mb-1">{h2[1]}</h2>;
      const h1 = line.match(/^#\s+(.+)/);
      if (h1) return <h1 key={lineIdx} className="font-bold text-text-primary text-base mt-3 mb-1">{h1[1]}</h1>;
      // Bullet list items
      const bullet = line.match(/^[-*]\s+(.+)/);
      const content = bullet ? bullet[1] : line;
      // Inline: bold, italic, code
      const inlineRender = (raw: string, key: number) => {
        const parts: React.ReactNode[] = [];
        const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
        let last = 0, m;
        while ((m = re.exec(raw)) !== null) {
          if (m.index > last) parts.push(raw.slice(last, m.index));
          if (m[2]) parts.push(<strong key={m.index} className="font-bold text-text-primary">{m[2]}</strong>);
          else if (m[3]) parts.push(<em key={m.index} className="italic">{m[3]}</em>);
          else if (m[4]) parts.push(<code key={m.index} className="font-mono bg-surface-muted px-1 rounded text-accent text-[0.85em]">{m[4]}</code>);
          last = m.index + m[0].length;
        }
        if (last < raw.length) parts.push(raw.slice(last));
        return <span key={key}>{parts}</span>;
      };
      if (bullet) {
        return (
          <div key={lineIdx} className="flex gap-2 my-0.5">
            <span className="text-accent mt-0.5 shrink-0">•</span>
            <span>{inlineRender(content, lineIdx)}</span>
          </div>
        );
      }
      if (!line.trim()) return <div key={lineIdx} className="h-2" />;
      return <div key={lineIdx}>{inlineRender(content, lineIdx)}</div>;
    });
  };

  // Conditional row highlighting — negative values = red tint
  const getRowHighlight = (row: Record<string, unknown>): string => {
    const vals = Object.values(row);
    for (const v of vals) {
      const n = Number(v);
      if (!isNaN(n) && isFinite(n) && n < 0) return 'bg-danger/5 border-l-2 border-l-danger/40';
    }
    return '';
  };

  return (
    <div className="flex flex-col">
      {/* Cell Name — centered above card */}
      <div className="flex items-center justify-center mb-1 h-6">
        {isEditingName ? (
          <div className="flex items-center gap-1.5 bg-surface-muted border border-accent/40 rounded-lg px-2 py-0.5">
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setIsEditingName(false); }}
              className="bg-transparent text-[11px] font-bold text-text-primary focus:outline-none w-48 text-center"
              placeholder="Give this analysis a name..."
            />
            <button onClick={commitName} className="text-success hover:text-success/80 transition-all hover:scale-110"><Check className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button
            onClick={() => { setNameInput(cell.name || ''); setIsEditingName(true); }}
            className="group flex items-center gap-1.5 text-[11px] font-bold text-text-muted hover:text-text-secondary transition-all px-3 py-1 rounded-full hover:bg-surface-muted border border-transparent hover:border-surface-border/50"
            title="Click to rename cell"
          >
            <span className={cell.name ? "text-text-secondary" : "text-text-muted italic opacity-60"}>
              {cell.name || `Analysis Cell ${index + 1}`}
            </span>
            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        )}
      </div>

      {/* Main Card */}
      <div className="group glass rounded-2xl overflow-hidden border border-surface-border hover:border-accent/30 transition-all duration-300 shadow-card">
      <div className={`flex items-center gap-3 px-4 py-3 bg-surface-card border-b border-surface-border ${cell.isPinned ? 'bg-accent/5' : ''}`}>
        <div className="flex items-center gap-1">
          <div className="cursor-grab active:cursor-grabbing p-1 text-text-muted hover:text-text-primary transition-colors">
            <GripVertical className="w-4 h-4" />
          </div>
          <span className="flex items-center justify-center w-6 h-6 rounded-md bg-surface-muted text-[10px] font-bold text-text-muted">
            {index + 1}
          </span>
        </div>
        
        <div className="flex-1 flex items-center gap-2 bg-surface-muted/50 border border-surface-border rounded-lg px-3 py-1.5 focus-within:border-accent/50 transition-colors">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <input 
            value={cell.prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={onPromptKeyDown}
            placeholder="Ask anything... (Enter to generate, Cmd+Enter to run SQL directly)"
            className={`flex-1 bg-transparent text-${uiTextSize} text-text-primary placeholder:text-text-muted focus:outline-none`}
          />
          {cell.agentStatus !== 'idle' && cell.agentStatus !== 'done' && cell.agentStatus !== 'error' && (
            <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
          )}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => togglePinCell(cell.id)} className={`btn-ghost p-1.5 ${cell.isPinned ? 'text-accent' : ''}`} title={cell.isPinned ? "Unpin Cell" : "Pin Cell"}>
            {cell.isPinned ? <Pin className="w-4 h-4 fill-accent" /> : <Pin className="w-4 h-4" />}
          </button>
          <button onClick={() => generateSql()} className="btn-ghost p-1.5" title="Generate Insight"><Sparkles className="w-4 h-4 text-accent" /></button>
          <button onClick={() => removeCell(cell.id)} className="btn-ghost p-1.5 text-danger/60 hover:text-danger" title="Delete Cell"><Trash2 className="w-4 h-4" /></button>
          <button onClick={() => setIsExpanded(!isExpanded)} className="btn-ghost p-1.5" title={isExpanded ? "Collapse" : "Expand"}>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-col flex-1 h-[75vh]">
          {/* Resizable split grid */}
          <div ref={splitRef} className="flex flex-1 min-h-0 relative" style={{ userSelect: dragActive ? 'none' : 'auto' }}>
            {/* Left: SQL Editor */}
            <div className="flex flex-col border-r border-surface-border bg-[#0a0e1a]/50 overflow-hidden min-h-0" style={{ width: `${splitPct}%` }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-surface-border/50 text-[10px] uppercase tracking-widest text-text-muted font-bold">
                <span>SQL Query</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 mr-2 pr-2 border-r border-surface-border/50">
                    <Palette className="w-3 h-3 text-text-muted" />
                    <select 
                      value={editorTheme}
                      onChange={(e) => setEditorTheme(e.target.value)}
                      className="bg-transparent border-none text-[10px] font-bold text-text-muted focus:outline-none cursor-pointer hover:text-text-primary transition-colors uppercase tracking-tight"
                    >
                      {editorThemes.map(t => (
                        <option key={t.id} value={t.id} className="bg-surface-card text-text-primary">{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={handleFormat} className="hover:text-text-primary transition-colors flex items-center gap-1" title="Format SQL Code">
                    <AlignLeft className="w-3 h-3" /> Format
                  </button>
                  <button onClick={explainQuery} className="hover:text-text-primary transition-colors flex items-center gap-1" title="Analyze Performance">
                    <Zap className="w-3 h-3" /> Profile
                  </button>
                  <button onClick={() => runQuery()} className="text-accent hover:text-accent-hover transition-colors flex items-center gap-1" title="Run Query">
                    <Play className="w-3 h-3" /> Run
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden min-h-0">
                <Editor 
                  height="100%"
                  defaultLanguage="sql"
                  theme={editorTheme}
                  beforeMount={handleEditorWillMount}
                  value={cell.sql}
                  onChange={v => setSql(v || '')}
                  options={{
                    minimap: { enabled: false },
                    fontSize: uiTextSize === 'xs' ? 10 : uiTextSize === 'sm' ? 12 : uiTextSize === 'base' ? 14 : 16,
                    padding: { top: 12 },
                    scrollBeyondLastLine: false
                  }}
                />
              </div>
              <div className="px-4 py-2 bg-surface-base border-t border-surface-border text-[10px] text-text-muted font-mono truncate">
                {cell.agentLog.length > 0 ? cell.agentLog[cell.agentLog.length - 1] : 'Idle'}
              </div>
            </div>

            {/* Draggable divider */}
            <div
              onMouseDown={onMouseDown}
              className="w-1 cursor-col-resize bg-surface-border hover:bg-accent/50 transition-colors active:bg-accent flex-shrink-0"
              title="Drag to resize"
            />

            {/* Right: Results */}
            <div className="flex flex-col bg-surface-card overflow-hidden min-h-0" style={{ width: `${100 - splitPct}%` }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-surface-border/50">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => updateCell(cell.id, { showViz: false })}
                    className={`p-1.5 rounded-md transition-all ${!cell.showViz ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}
                    title="View Data Table"
                  >
                    <TableIcon className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => updateCell(cell.id, { showViz: true })}
                    className={`p-1.5 rounded-md transition-all ${cell.showViz ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}
                    title="View Chart"
                  >
                    <BarChart2 className="w-4 h-4" />
                  </button>

                  <div className="h-4 w-px bg-surface-border mx-1" />
                  <button 
                    onClick={() => handleExport('csv')}
                    className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
                    title="Export CSV"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  {cell.showViz && (
                    <select 
                      className="bg-transparent text-[10px] text-text-muted uppercase font-bold focus:outline-none ml-2"
                      value={cell.vizType}
                      onChange={e => updateCell(cell.id, { vizType: e.target.value as any })}
                    >
                      <option value="bar">Bar</option>
                      <option value="line">Line</option>
                      <option value="area">Area</option>
                      <option value="scatter">Scatter</option>
                      <option value="bubble">Bubble</option>
                      <option value="pie">Pie</option>
                    </select>
                  )}
                </div>
                {cell.queryResult && (
                  <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
                    {cell.queryResult.rowCount} Rows • {cell.queryResult.executionMs}ms
                  </span>
                )}
              </div>
              
              <div className="flex-1 overflow-hidden relative flex flex-col">
                {!cell.queryResult ? (
                  <div className="flex flex-col items-center justify-center h-full opacity-20 gap-3">
                    <Zap className="w-12 h-12" />
                    <span className="text-xs">No data to display</span>
                  </div>
                ) : cell.showViz ? (
                  <D3Chart 
                    data={cell.queryResult.rows} 
                    columns={cell.queryResult.columns} 
                    chartType={cell.vizType}
                    onDrillDown={handleDrillDown}
                  />
                ) : (() => {
                  // Apply filter and sort
                  const filteredCols = cell.queryResult.columns.filter(c =>
                    !colFilter || c.toLowerCase().includes(colFilter.toLowerCase())
                  );
                  const sortedRows = sortCol
                    ? [...cell.queryResult.rows].sort((a, b) => {
                        const av = a[sortCol], bv = b[sortCol];
                        if (av == null) return 1; if (bv == null) return -1;
                        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
                        return sortDir === 'asc' ? cmp : -cmp;
                      })
                    : cell.queryResult.rows;
                  const handleSort = (col: string) => {
                    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                    else { setSortCol(col); setSortDir('asc'); }
                  };
                  return (
                    <>
                      {/* Column filter */}
                      <div className="px-3 py-1.5 border-b border-surface-border/30 bg-surface-base/50">
                        <input
                          value={colFilter}
                          onChange={e => setColFilter(e.target.value)}
                          placeholder="Filter columns..."
                          className="w-full bg-transparent text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none"
                        />
                      </div>
                      <div className="flex-1 overflow-auto scrollbar-thin">
                        <table className={`w-full text-${uiTextSize === 'xs' ? '[10px]' : uiTextSize} border-collapse`}>
                          <thead className="sticky top-0 bg-surface-card border-b border-surface-border z-10">
                            <tr>
                              {filteredCols.map(c => (
                                <th
                                  key={c}
                                  onClick={() => handleSort(c)}
                                  className={`px-3 py-2 text-left text-text-muted font-bold tracking-wider cursor-pointer hover:text-text-primary select-none group transition-colors ${uiTextSize === 'xs' || uiTextSize === 'sm' ? 'uppercase' : ''}`}
                                >
                                  <div className="flex items-center gap-1">
                                    <span>{c}</span>
                                    <span className={`transition-opacity text-accent ${sortCol === c ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                                      {sortCol === c && sortDir === 'asc' ? '↑' : '↓'}
                                    </span>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedRows.map((row, i) => (
                              <tr key={i} className={`border-b border-surface-border/30 hover:bg-surface-hover/50 ${getRowHighlight(row)}`}>
                                {filteredCols.map(c => (
                                  <td 
                                    key={c} 
                                    onClick={() => handleDrillDown(c, row[c])}
                                    className="px-3 py-1.5 text-text-secondary truncate max-w-[200px] cursor-pointer hover:bg-accent/10 hover:text-accent transition-colors" 
                                    title={`Click to drill down into ${c} = ${String(row[c])}`}
                                  >
                                    {String(row[c])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {cell.insights && (
            <div className="px-6 py-4 bg-accent-dim/10 border-t border-surface-border flex gap-4 animate-in fade-in slide-in-from-bottom-2 shrink-0">
              <div className="p-2 bg-accent/20 rounded-lg h-fit">
                <MessageSquare className="w-4 h-4 text-accent" />
              </div>
              <div className={`flex-1 text-${uiTextSize} text-text-secondary leading-relaxed`}>
                {renderMarkdown(cell.insights)}
              </div>
            </div>
          )}

          {/* Follow-up suggestions */}
          {followUps.length > 0 && (
            <div className="px-4 py-3 border-t border-surface-border/50 bg-surface-base/30 shrink-0">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">✨ Suggested follow-ups</p>
              <div className="flex flex-wrap gap-2">
                {followUps.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { updateCell(cell.id, { prompt: q }); setFollowUps([]); }}
                    className="text-[11px] bg-surface-muted border border-surface-border rounded-lg px-3 py-1.5 text-text-secondary hover:border-accent/50 hover:text-text-primary hover:bg-accent/5 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div> {/* end main card */}
  </div>
  );
}
