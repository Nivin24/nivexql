import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Trash2, Play, Sparkles, ChevronDown, ChevronUp, 
  BarChart2, Table as TableIcon, Download, MessageSquare, 
  Loader2, Zap, AlignLeft, Pencil, Check, Palette, GripVertical, Pin, LayoutGrid, Info, Send, Copy, Star, Clock, X
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { format } from 'sql-formatter';
import { useAppStore, type NotebookCell } from '../../store/useAppStore';
import { apiQuery, apiGenerateSql, apiFixSql, apiAnalyzeResults, apiGenerateFollowUps } from '../../lib/api';
import { editorThemes } from '../../lib/editorThemes';
import { toast } from '../shared/Toast';
import D3Chart from '../viz/D3Chart';
import PivotTable from '../viz/PivotTable';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

function diffLines(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = (oldStr || '').split('\n');
  const newLines = (newStr || '').split('\n');
  const dp: number[][] = Array(oldLines.length + 1).fill(null).map(() => Array(newLines.length + 1).fill(0));
  
  for (let i = 1; i <= oldLines.length; i++) {
    for (let j = 1; j <= newLines.length; j++) {
      if (oldLines[i - 1].trim() === newLines[j - 1].trim()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  let i = oldLines.length;
  let j = newLines.length;
  const diff: DiffLine[] = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1].trim() === newLines[j - 1].trim()) {
      diff.unshift({ type: 'unchanged', value: newLines[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: 'added', value: newLines[j - 1] });
      j--;
    } else {
      diff.unshift({ type: 'removed', value: oldLines[i - 1] });
      i--;
    }
  }
  return diff;
}


let isAutocompleteRegistered = false;

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
  const favorites = useAppStore(s => s.favorites);
  const addFavorite = useAppStore(s => s.addFavorite);
  const removeFavorite = useAppStore(s => s.removeFavorite);
  const dashboardMode = useAppStore(s => s.dashboardMode);

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

  // Premium Tab States
  const [leftTab, setLeftTab] = useState<'sql' | 'chat' | 'diff' | 'history'>('sql');
  const [chatInput, setChatInput] = useState('');
  const [hoveredProfileCol, setHoveredProfileCol] = useState<{ col: string; x: number; y: number } | null>(null);
  const [copiedResults, setCopiedResults] = useState(false);
  const [selectedHistoryIdx, setSelectedHistoryIdx] = useState<number | null>(null);

  const getColProfile = (colName: string) => {
    if (!cell.queryResult) return null;
    const vals = cell.queryResult.rows.map(r => r[colName]);
    const total = vals.length;
    const nulls = vals.filter(v => v === null || v === undefined || v === '').length;
    
    const distinctSet = new Set(vals.filter(v => v !== null && v !== undefined && v !== ''));
    const distinctCount = distinctSet.size;

    const numericVals = vals.map(v => Number(v)).filter(n => !isNaN(n) && typeof n === 'number' && n !== null);
    const isNumeric = numericVals.length > 0 && numericVals.length >= total * 0.7;

    let min: any = null, max: any = null, avg = 0, sum = 0;
    if (isNumeric && numericVals.length > 0) {
      min = Math.min(...numericVals);
      max = Math.max(...numericVals);
      sum = numericVals.reduce((a, b) => a + b, 0);
      avg = sum / numericVals.length;
    } else if (vals.length > 0) {
      const nonNullVals = vals.filter(v => v !== null && v !== undefined && v !== '').map(String);
      if (nonNullVals.length > 0) {
        nonNullVals.sort();
        min = nonNullVals[0];
        max = nonNullVals[nonNullVals.length - 1];
      }
    }

    const freq: Record<string, number> = {};
    vals.forEach(v => {
      const key = v === null || v === undefined || v === '' ? '(null)' : String(v);
      freq[key] = (freq[key] || 0) + 1;
    });
    const sortedFreq = Object.entries(freq)
      .map(([value, count]) => ({ value, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return {
      type: isNumeric ? 'numeric' : 'categorical',
      total,
      nulls,
      distinct: distinctCount,
      isNumeric,
      numericStats: isNumeric ? {
        sum: Math.round(sum * 100) / 100,
        min: min !== null ? Number(min) : 0,
        max: max !== null ? Number(max) : 0,
        avg: Math.round(avg * 100) / 100
      } : null,
      frequentValues: sortedFreq.map(f => ({
        val: f.value,
        count: f.count,
        pct: f.pct
      }))
    };
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = { role: 'user' as const, content: chatInput };
    const currentHistory = cell.chatHistory || [];
    const updatedHistory = [...currentHistory, userMessage];

    updateCell(cell.id, { 
      chatHistory: updatedHistory,
      agentStatus: 'generating'
    });
    const refinementPrompt = chatInput;
    setChatInput('');
    appendAgentLog(cell.id, `🤖 Chat refining query...`);

    try {
      const { sql: generated, suggested_name } = await apiGenerateSql(
        refinementPrompt, 
        schema, 
        globalContext, 
        updatedHistory
      );

      let formattedSql = generated;
      try {
        formattedSql = format(generated, { language: 'postgresql', keywordCase: 'upper' });
      } catch { /* fallback */ }

      const assistantMessage = { 
        role: 'assistant' as const, 
        content: `I've updated the query to reflect your request.`,
        sql: formattedSql 
      };

      updateCell(cell.id, {
        sql: formattedSql,
        chatHistory: [...updatedHistory, assistantMessage],
        name: suggested_name || cell.name,
        agentStatus: 'done'
      });

      appendAgentLog(cell.id, `✅ SQL query refined successfully.`);
      await runQuery(generated);
      setLeftTab('sql');
    } catch (err: unknown) {
      const e = err as Error;
      appendAgentLog(cell.id, `❌ Chat refinement failed: ${e.message}`);
      updateCell(cell.id, { agentStatus: 'error' });
      toast.error('Refinement failed', e.message);
    }
  };

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

  // Handle Editor Mounting - Register Themes & Schema Autocomplete
  const handleEditorWillMount = (monaco: any) => {
    editorThemes.forEach(theme => {
      monaco.editor.defineTheme(theme.id, theme.definition);
    });

    if (!isAutocompleteRegistered) {
      monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: ['.', ' ', ','],
        provideCompletionItems: (model: any, position: any) => {
          const schema = useAppStore.getState().schema;
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          // Get line content up to the cursor to check for table.column autocompletion
          const lineContent = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
          });

          // Check if typing after a dot (e.g. "users.")
          const dotMatch = lineContent.match(/([a-zA-Z0-9_"]+)\.$/);
          if (dotMatch) {
            const tableName = dotMatch[1].replace(/"/g, '').toLowerCase();
            const matchedTable = schema.find((t: any) => t.name.toLowerCase() === tableName);
            if (matchedTable) {
              const colItems = matchedTable.columns.map((col: any) => ({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `${col.type}${col.isPrimaryKey ? ' (PK)' : ''}`,
                insertText: col.name,
                range,
              }));
              return { suggestions: colItems };
            }
          }

          // Basic SQL keywords
          const keywords = [
            'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'JOIN',
            'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ON', 'AND', 'OR', 'NOT',
            'AS', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'COUNT',
            'SUM', 'AVG', 'MIN', 'MAX', 'HAVING', 'IN', 'LIKE', 'IS NULL', 'IS NOT NULL'
          ];

          const items: any[] = [];

          // Add keywords
          keywords.forEach(kw => {
            items.push({
              label: kw,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: kw,
              range,
            });
          });

          // Add tables
          schema.forEach((table: any) => {
            items.push({
              label: table.name,
              kind: monaco.languages.CompletionItemKind.Class,
              detail: `Table (${table.rowCount ?? 0} rows)`,
              insertText: table.name,
              range,
            });

            // Add table columns
            table.columns.forEach((col: any) => {
              items.push({
                label: `${table.name}.${col.name}`,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `Column of ${table.name} (${col.type})`,
                insertText: `${table.name}.${col.name}`,
                range,
              });

              items.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `Column of ${table.name} (${col.type})`,
                insertText: col.name,
                range,
              });
            });
          });

          return { suggestions: items };
        }
      });
      isAutocompleteRegistered = true;
    }
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
      
      const history = cell.sqlHistory || [];
      const latest = history[history.length - 1];
      const newHistory = queryToRun.trim() && queryToRun !== latest ? [...history, queryToRun] : history;

      updateCell(cell.id, {
        agentStatus: 'done',
        showViz: true,
        sqlHistory: newHistory,
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
          
          let cleanPrevSql = generated;
          try {
            cleanPrevSql = format(generated, { language: 'postgresql', keywordCase: 'upper' });
          } catch {}
          
          updateCell(cell.id, { previousSql: cleanPrevSql });
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
    const state = useAppStore.getState();
    const activeNb = state.notebooks.find(n => n.id === state.activeNotebookId);
    if (!activeNb) return;
    const currentCells = activeNb.cells;
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

  const handleCopyResults = () => {
    if (!cell.queryResult) return;
    const { columns, rows } = cell.queryResult;
    
    // Format as CSV
    const csvHeader = columns.join(',');
    const csvRows = rows.map(row => 
      columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Escape quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    );
    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    navigator.clipboard.writeText(csvContent);
    setCopiedResults(true);
    toast.success('Copied!', 'Query results copied to clipboard as CSV.');
    setTimeout(() => setCopiedResults(false), 2000);
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

  const renderDashboardVisual = () => {
    if (!cell.queryResult) {
      return (
        <div className="flex flex-col items-center justify-center h-full opacity-20 gap-3 p-8">
          <Zap className="w-12 h-12 text-text-muted animate-pulse" />
          <span className="text-xs font-semibold text-text-muted">No data to display</span>
        </div>
      );
    }
    
    if ((!cell.viewMode && cell.showViz) || cell.viewMode === 'chart') {
      return (
        <D3Chart 
          data={cell.queryResult.rows} 
          columns={cell.queryResult.columns} 
          chartType={cell.vizType}
          onDrillDown={handleDrillDown}
        />
      );
    }
    
    if (cell.viewMode === 'pivot') {
      return (
        <div className="p-4 overflow-auto scrollbar-thin h-full">
          <PivotTable
            data={cell.queryResult.rows}
            columns={cell.queryResult.columns}
          />
        </div>
      );
    }
    
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
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-3 py-1.5 border-b border-surface-border/30 bg-surface-base/50 shrink-0">
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
                    <div className="flex items-center gap-1.5 justify-between">
                      <div className="flex items-center gap-1">
                        <span>{c}</span>
                        <span className={`transition-opacity text-accent ${sortCol === c ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                          {sortCol === c && sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      </div>
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
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      {/* Cell Name — centered above card */}
      <div className="flex items-center justify-center mb-1 h-6">
        {isEditingName && !dashboardMode ? (
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
            onClick={() => { if (!dashboardMode) { setNameInput(cell.name || ''); setIsEditingName(true); } }}
            className={`group flex items-center gap-1.5 text-[11px] font-bold text-text-muted transition-all px-3 py-1 rounded-full ${!dashboardMode ? 'hover:bg-surface-muted border border-transparent hover:border-surface-border/50 hover:text-text-secondary cursor-pointer' : 'cursor-default'}`}
            title={!dashboardMode ? "Click to rename cell" : ""}
          >
            <span className={cell.name ? "text-text-secondary" : "text-text-muted italic opacity-60"}>
              {cell.name || `Analysis Cell ${index + 1}`}
            </span>
            {!dashboardMode && <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />}
          </button>
        )}
      </div>

      <div className="group glass rounded-2xl overflow-hidden border border-surface-border hover:border-accent/30 transition-all duration-300 shadow-card">
      {!dashboardMode && (
        <div className={`flex items-center gap-3 px-4 py-3 bg-surface-card border-b border-surface-border ${cell.isPinned ? 'bg-accent/5' : ''}`}>
          <div className="flex items-center gap-1">
            <div data-drag-handle className="cursor-grab active:cursor-grabbing p-1 text-text-muted hover:text-text-primary transition-colors">
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
            <button 
              onClick={() => {
                if (!cell.sql.trim()) {
                  toast.warning('No SQL to save', 'Write or generate SQL before saving.');
                  return;
                }
                if (favorites.includes(cell.sql)) {
                  removeFavorite(cell.sql);
                  toast.info('Snippet removed', 'Query removed from saved snippets.');
                } else {
                  addFavorite(cell.sql);
                  toast.success('Snippet saved!', 'Query saved to snippets catalog.');
                }
              }} 
              className="btn-ghost p-1.5" 
              title={favorites.includes(cell.sql) ? "Remove Bookmark" : "Bookmark Query"}
            >
              <Star className={`w-4 h-4 ${favorites.includes(cell.sql) ? 'text-warning fill-warning' : 'text-text-muted hover:text-warning'}`} />
            </button>
            <button onClick={() => generateSql()} className="btn-ghost p-1.5" title="Generate Insight"><Sparkles className="w-4 h-4 text-accent" /></button>
            <button onClick={() => removeCell(cell.id)} className="btn-ghost p-1.5 text-danger/60 hover:text-danger" title="Delete Cell"><Trash2 className="w-4 h-4" /></button>
            <button onClick={() => setIsExpanded(!isExpanded)} className="btn-ghost p-1.5" title={isExpanded ? "Collapse" : "Expand"}>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {dashboardMode ? (
        /* STORYTELLING DASHBOARD CELL LAYOUT */
        <div className="flex flex-col flex-1 min-h-0 bg-surface-card/10">
          {cell.insights ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch p-6 min-h-0 w-full">
              {/* Left Column: Storytelling Narrative / Insights (span 5 of 12) */}
              <div className="xl:col-span-5 flex flex-col gap-4 bg-surface-card/45 glass border border-surface-border/50 rounded-3xl p-6 overflow-y-auto scrollbar-thin shadow-sm relative min-h-[250px] xl:min-h-0">
                {/* Ambient glow in card */}
                <div className="absolute top-0 left-0 w-32 h-32 bg-accent/5 rounded-full blur-[40px] pointer-events-none" />
                
                <div className="flex items-center gap-2 text-accent border-b border-surface-border/30 pb-2.5 shrink-0">
                  <div className="p-1 bg-accent/10 rounded-lg">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Analysis Narrative</span>
                </div>
                <div className={`text-${uiTextSize} text-text-secondary leading-relaxed font-medium flex-1`}>
                  {renderMarkdown(cell.insights)}
                </div>
              </div>

              {/* Right Column: Visual D3 Chart or Table (span 7 of 12) */}
              <div className="xl:col-span-7 flex flex-col bg-surface-card border border-surface-border/50 rounded-3xl overflow-hidden min-h-[40vh] relative shadow-sm">
                <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border/30 bg-surface-base/35 shrink-0">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {((!cell.viewMode && cell.showViz) || cell.viewMode === 'chart') ? `${cell.vizType} Chart` : (cell.viewMode === 'pivot' ? 'Pivot Matrix' : 'Data View')}
                  </span>
                  {cell.queryResult && (
                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider bg-surface-muted/50 px-2 py-0.5 rounded border border-surface-border/40">
                      {cell.queryResult.rowCount} rows
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
                  {renderDashboardVisual()}
                </div>
              </div>
            </div>
          ) : (
            /* Standalone full-width visual if no insights present */
            <div className="p-6">
              <div className="flex flex-col bg-surface-card border border-surface-border/50 rounded-3xl overflow-hidden min-h-[45vh] relative shadow-sm w-full">
                <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border/30 bg-surface-base/35 shrink-0">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {((!cell.viewMode && cell.showViz) || cell.viewMode === 'chart') ? `${cell.vizType} Chart` : (cell.viewMode === 'pivot' ? 'Pivot Matrix' : 'Data View')}
                  </span>
                  {cell.queryResult && (
                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider bg-surface-muted/50 px-2 py-0.5 rounded border border-surface-border/40">
                      {cell.queryResult.rowCount} rows
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
                  {renderDashboardVisual()}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ORIGINAL EDIT MODE CELL LAYOUT */
        isExpanded && (
          <div className="flex flex-col flex-1 h-[75vh]">
            {/* Resizable split grid */}
            <div ref={splitRef} className="flex flex-1 min-h-0 relative" style={{ userSelect: dragActive ? 'none' : 'auto' }}>
              {/* Left: SQL Editor / Chat / Diff */}
              <div className="flex flex-col border-r border-surface-border bg-[#0a0e1a]/50 overflow-hidden min-h-0" style={{ width: `${splitPct}%` }}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-surface-border/50 text-[10px] uppercase font-bold">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setLeftTab('sql')} 
                      className={`pb-1 border-b-2 transition-all ${leftTab === 'sql' ? 'border-accent text-accent font-bold' : 'border-transparent text-text-muted hover:text-text-primary'}`}
                    >
                      SQL Query
                    </button>
                    <button 
                      onClick={() => setLeftTab('chat')} 
                      className={`pb-1 border-b-2 transition-all flex items-center gap-1 ${leftTab === 'chat' ? 'border-accent text-accent font-bold' : 'border-transparent text-text-muted hover:text-text-primary'}`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> AI Chat
                    </button>
                    {cell.previousSql && cell.previousSql !== cell.sql && (
                      <button 
                        onClick={() => setLeftTab('diff')} 
                        className={`pb-1 border-b-2 transition-all flex items-center gap-1 text-warning ${leftTab === 'diff' ? 'border-warning font-bold' : 'border-transparent opacity-75 hover:opacity-100'}`}
                      >
                        <Zap className="w-3.5 h-3.5" /> AI Auto-Fix Diff
                      </button>
                    )}
                    <button 
                      onClick={() => { setLeftTab('history'); setSelectedHistoryIdx(null); }} 
                      className={`pb-1 border-b-2 transition-all flex items-center gap-1 ${leftTab === 'history' ? 'border-accent text-accent font-bold' : 'border-transparent text-text-muted hover:text-text-primary'}`}
                    >
                      <Clock className="w-3.5 h-3.5" /> Versions
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {leftTab === 'sql' && (
                      <>
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
                      </>
                    )}

                    {leftTab === 'chat' && (
                      <button 
                        onClick={() => updateCell(cell.id, { chatHistory: [] })} 
                        className="text-text-muted hover:text-text-primary transition-colors"
                        title="Clear Chat History"
                      >
                        Clear Chat
                      </button>
                    )}

                    {leftTab === 'diff' && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            updateCell(cell.id, { previousSql: undefined });
                            setLeftTab('sql');
                            toast.success('AI Diff accepted');
                          }}
                          className="text-accent hover:text-accent-hover font-bold transition-colors"
                        >
                          Keep Fixed
                        </button>
                        <span className="text-text-muted">|</span>
                        <button 
                          onClick={() => {
                            if (cell.previousSql) {
                              updateCell(cell.id, { sql: cell.previousSql, previousSql: undefined });
                              setLeftTab('sql');
                              toast.info('Reverted to original SQL');
                            }
                          }}
                          className="text-danger hover:text-danger-hover font-bold transition-colors"
                        >
                          Revert
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {leftTab === 'sql' && (
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
                )}

                {leftTab === 'chat' && (
                  <div className="flex-1 flex flex-col min-h-0 bg-[#070b14]/30 p-4">
                    {/* Chat Message Thread */}
                    <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-1 scrollbar-thin">
                      <div className="flex flex-col gap-1.5 p-3 rounded-2xl bg-[#0b1021] border border-surface-border text-xs max-w-[85%] mr-auto shadow-sm">
                        <p className="text-text-secondary">
                          💬 <strong>AI Conversational Refinement</strong>
                        </p>
                        <p className="text-text-muted">
                          I can help you build and refine the SQL for this cell iteratively. Ask me to:
                        </p>
                        <ul className="list-disc list-inside text-text-muted space-y-1 mt-1">
                          <li>Filter: <em>"only show rows where status is active"</em></li>
                          <li>Group: <em>"group by date and count items"</em></li>
                          <li>Sort: <em>"sort by total revenue desc and limit to 10"</em></li>
                        </ul>
                      </div>

                      {(cell.chatHistory || []).map((msg, i) => (
                        <div 
                          key={i} 
                          className={`flex flex-col gap-1.5 p-3 rounded-2xl text-xs max-w-[85%] shadow-md ${
                            msg.role === 'user' 
                              ? 'bg-accent/15 border border-accent/30 ml-auto text-text-primary' 
                              : 'bg-[#0d1325] border border-surface-border mr-auto text-text-secondary'
                          }`}
                        >
                          <span className="text-[9px] uppercase tracking-wider font-bold text-text-muted">
                            {msg.role === 'user' ? 'You' : 'NivexAI'}
                          </span>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          {msg.sql && (
                            <div className="mt-1.5 p-2 bg-black/40 rounded-lg border border-surface-border/30 max-h-[140px] overflow-y-auto font-mono text-[10px] text-accent select-text">
                              {msg.sql}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Input form */}
                    <form onSubmit={handleSendChatMessage} className="flex gap-2 bg-surface-card border border-surface-border rounded-xl p-1.5 focus-within:border-accent/40 transition-colors">
                      <input 
                        type="text" 
                        value={chatInput} 
                        onChange={e => setChatInput(e.target.value)} 
                        placeholder="Ask AI to refine this cell's query..." 
                        className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none px-2"
                        disabled={cell.agentStatus === 'generating'}
                      />
                      <button 
                        type="submit" 
                        disabled={cell.agentStatus === 'generating' || !chatInput.trim()} 
                        className="p-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors flex items-center justify-center"
                      >
                        {cell.agentStatus === 'generating' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </form>
                  </div>
                )}

                {leftTab === 'diff' && cell.previousSql && (
                  <div className="flex-1 overflow-auto bg-[#050811] p-4 font-mono text-xs select-text leading-relaxed">
                    <div className="mb-3 text-[10px] text-text-muted uppercase tracking-wider font-bold">
                      Line-by-line diff of AI SQL auto-correction:
                    </div>
                    <div className="space-y-0.5">
                      {diffLines(cell.previousSql, cell.sql).map((line, idx) => {
                        let bgColor = 'transparent';
                        let textColor = 'text-text-secondary';
                        let prefix = ' ';
                        if (line.type === 'added') {
                          bgColor = 'rgba(16, 185, 129, 0.12)';
                          textColor = 'text-[#10b981] font-semibold';
                          prefix = '+';
                        } else if (line.type === 'removed') {
                          bgColor = 'rgba(239, 68, 68, 0.12)';
                          textColor = 'text-[#ef4444] line-through';
                          prefix = '-';
                        }
                        return (
                          <div 
                            key={idx} 
                            className="flex items-start px-2 py-0.5 rounded-sm"
                            style={{ backgroundColor: bgColor }}
                          >
                            <span className="w-6 select-none opacity-40 text-right pr-2 text-[10px]">{idx + 1}</span>
                            <span className="w-4 select-none opacity-50 font-bold">{prefix}</span>
                            <span className={`flex-1 whitespace-pre-wrap ${textColor}`}>{line.value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {leftTab === 'history' && selectedHistoryIdx !== null && cell.sqlHistory && (
                  <div className="flex-1 overflow-auto bg-[#050811] p-4 font-mono text-xs select-text leading-relaxed animate-in fade-in duration-200">
                    <div className="flex items-center justify-between mb-3 border-b border-surface-border/50 pb-2">
                      <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">
                        Comparing Version {selectedHistoryIdx + 1} with Current SQL:
                      </span>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => {
                            if (cell.sqlHistory) {
                              updateCell(cell.id, { sql: cell.sqlHistory[selectedHistoryIdx] });
                              setLeftTab('sql');
                              toast.success('Restored SQL', `Restored to version ${selectedHistoryIdx + 1}`);
                            }
                          }}
                          className="text-accent hover:underline text-[10px] font-bold"
                        >
                          Restore this Version
                        </button>
                        <span className="text-text-muted">|</span>
                        <button 
                          onClick={() => setSelectedHistoryIdx(null)}
                          className="text-text-secondary hover:text-text-primary text-[10px] font-bold"
                        >
                          Back to list
                        </button>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      {diffLines(cell.sqlHistory[selectedHistoryIdx], cell.sql).map((line, idx) => {
                        let bgColor = 'transparent';
                        let textColor = 'text-text-secondary';
                        let prefix = ' ';
                        if (line.type === 'added') {
                          bgColor = 'rgba(16, 185, 129, 0.12)';
                          textColor = 'text-[#10b981] font-semibold';
                          prefix = '+';
                        } else if (line.type === 'removed') {
                          bgColor = 'rgba(239, 68, 68, 0.12)';
                          textColor = 'text-[#ef4444] line-through';
                          prefix = '-';
                        }
                        return (
                          <div 
                            key={idx} 
                            className="flex items-start px-2 py-0.5 rounded-sm"
                            style={{ backgroundColor: bgColor }}
                          >
                            <span className="w-6 select-none opacity-40 text-right pr-2 text-[10px]">{idx + 1}</span>
                            <span className="w-4 select-none opacity-50 font-bold">{prefix}</span>
                            <span className={`flex-1 whitespace-pre-wrap ${textColor}`}>{line.value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {leftTab === 'history' && selectedHistoryIdx === null && (
                  <div className="flex-1 flex flex-col min-h-0 bg-[#070b14]/30 p-4 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-[10px] text-text-muted uppercase tracking-wider font-bold mb-3">
                      <span>Query Version History</span>
                      {cell.sqlHistory && cell.sqlHistory.length > 0 && (
                        <button 
                          onClick={() => {
                            updateCell(cell.id, { sqlHistory: [] });
                            setSelectedHistoryIdx(null);
                            toast.info('History cleared', 'SQL version history has been cleared for this cell.');
                          }}
                          className="text-text-muted hover:text-danger/80 transition-colors uppercase font-bold"
                          title="Clear all stored versions"
                        >
                          Clear History
                        </button>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                      {(!cell.sqlHistory || cell.sqlHistory.length === 0) ? (
                        <div className="text-text-muted italic text-xs py-8 text-center">
                          No previous versions saved. Run queries to save history.
                        </div>
                      ) : (
                        cell.sqlHistory.map((historySql, idx) => (
                          <div 
                            key={idx}
                            className="flex flex-col gap-2 p-3 rounded-xl border border-surface-border bg-[#0b1021]/50 hover:bg-[#0b1021]/90 transition-all group/item"
                          >
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-bold text-accent">Version {idx + 1}</span>
                              <div className="flex gap-2.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => setSelectedHistoryIdx(idx)}
                                  className="text-text-secondary hover:text-accent font-bold"
                                >
                                  View Diff
                                </button>
                                <span className="text-text-muted">|</span>
                                <button 
                                  onClick={() => {
                                    updateCell(cell.id, { sql: historySql });
                                    setLeftTab('sql');
                                    toast.success('Restored SQL', `Restored to version ${idx + 1}`);
                                  }}
                                  className="text-accent hover:underline font-bold"
                                >
                                  Restore
                                </button>
                              </div>
                            </div>
                            <pre className="text-[10px] text-text-secondary font-mono truncate bg-black/30 p-2 rounded max-h-16 overflow-hidden">
                              {historySql}
                            </pre>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div className="px-4 py-2 bg-surface-base border-t border-surface-border text-[10px] text-text-muted font-mono truncate flex items-center justify-between">
                  <span>{cell.agentLog.length > 0 ? cell.agentLog[cell.agentLog.length - 1] : 'Idle'}</span>
                  {cell.previousSql && cell.previousSql !== cell.sql && (
                    <button onClick={() => setLeftTab('diff')} className="text-warning hover:underline font-bold text-[9px]">
                      ⚠️ SQL Auto-Fixed. View Diff
                    </button>
                  )}
                </div>
              </div>

              <div
                onMouseDown={onMouseDown}
                className="w-1 cursor-col-resize bg-surface-border hover:bg-accent/50 transition-colors active:bg-accent flex-shrink-0"
                title="Drag to resize"
              />

              {/* Right: Results */}
              <div className="flex flex-col bg-surface-card overflow-hidden min-h-0 flex-1">
                <div className="flex items-center justify-between px-4 py-2 border-b border-surface-border/50">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => updateCell(cell.id, { viewMode: 'table' })}
                      className={`p-1.5 rounded-md transition-all ${(!cell.viewMode && !cell.showViz) || cell.viewMode === 'table' ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}
                      title="View Data Table"
                    >
                      <TableIcon className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => updateCell(cell.id, { viewMode: 'chart' })}
                      className={`p-1.5 rounded-md transition-all ${(!cell.viewMode && cell.showViz) || cell.viewMode === 'chart' ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}
                      title="View Chart"
                    >
                      <BarChart2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => updateCell(cell.id, { viewMode: 'pivot' })}
                      className={`p-1.5 rounded-md transition-all ${cell.viewMode === 'pivot' ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}
                      title="View Pivot Table"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>

                    <div className="h-4 w-px bg-surface-border mx-1" />
                    <button 
                      onClick={() => handleExport('csv')}
                      className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
                      title="Export CSV"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={handleCopyResults}
                      className={`p-1.5 transition-colors ${copiedResults ? 'text-success' : 'text-text-muted hover:text-text-primary'}`}
                      title="Copy to Clipboard as CSV"
                    >
                      {copiedResults ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>

                    {((!cell.viewMode && cell.showViz) || cell.viewMode === 'chart') && (
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
                  ) : ((!cell.viewMode && cell.showViz) || cell.viewMode === 'chart') ? (
                    <D3Chart 
                      data={cell.queryResult.rows} 
                      columns={cell.queryResult.columns} 
                      chartType={cell.vizType}
                      onDrillDown={handleDrillDown}
                    />
                  ) : cell.viewMode === 'pivot' ? (
                    <PivotTable
                      data={cell.queryResult.rows}
                      columns={cell.queryResult.columns}
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
                                    <div className="flex items-center gap-1.5 justify-between">
                                      <div className="flex items-center gap-1">
                                        <span>{c}</span>
                                        <span className={`transition-opacity text-accent ${sortCol === c ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                                          {sortCol === c && sortDir === 'asc' ? '↑' : '↓'}
                                        </span>
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          setHoveredProfileCol(
                                            hoveredProfileCol?.col === c 
                                              ? null 
                                              : { col: c, x: rect.left, y: rect.bottom + window.scrollY }
                                          );
                                        }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-text-muted hover:text-accent rounded"
                                        title="Show Column Profile"
                                      >
                                        <Info className="w-3.5 h-3.5" />
                                      </button>
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

                        {hoveredProfileCol && (() => {
                          const profile = getColProfile(hoveredProfileCol.col);
                          if (!profile) return null;
                          return (
                            <>
                              <div 
                                className="fixed inset-0 z-40" 
                                onClick={() => setHoveredProfileCol(null)} 
                              />
                              <div 
                                className="fixed glass text-xs rounded-2xl p-4 shadow-2xl z-50 min-w-[250px] animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-3.5"
                                style={{ 
                                  left: `${Math.min(hoveredProfileCol.x - 20, window.innerWidth - 280)}px`, 
                                  top: `${Math.min(hoveredProfileCol.y, window.innerHeight - 360)}px` 
                                }}
                              >
                                {/* Header */}
                                <div className="flex items-center justify-between border-b border-surface-border/50 pb-2.5">
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="font-bold text-text-primary truncate text-xs" title={hoveredProfileCol.col}>
                                      {hoveredProfileCol.col}
                                    </span>
                                    <span className="text-[9px] font-bold text-accent uppercase tracking-wider">
                                      {profile.isNumeric ? 'Numeric Profile' : 'Categorical Profile'}
                                    </span>
                                  </div>
                                  <button 
                                    onClick={() => setHoveredProfileCol(null)}
                                    className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="flex flex-col gap-2 text-[11px] font-medium">
                                  <div className="flex justify-between border-b border-surface-border/20 pb-1">
                                    <span className="text-text-secondary">Data Type</span>
                                    <span className="text-text-primary font-mono bg-surface-muted px-1.5 py-0.5 rounded">{profile.type}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-surface-border/20 pb-1">
                                    <span className="text-text-secondary">Total Values</span>
                                    <span className="text-text-primary font-mono">{profile.total.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-surface-border/20 pb-1">
                                    <span className="text-text-secondary">Null Count</span>
                                    <span className="text-text-primary font-mono">{profile.nulls.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-surface-border/20 pb-1">
                                    <span className="text-text-secondary">Distinct Values</span>
                                    <span className="text-text-primary font-mono">{profile.distinct.toLocaleString()}</span>
                                  </div>

                                  {profile.isNumeric && profile.numericStats && (
                                    <>
                                      <div className="flex justify-between border-b border-surface-border/20 pb-1">
                                        <span className="text-text-secondary">Sum</span>
                                        <span className="text-text-primary font-mono">{profile.numericStats.sum.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between border-b border-surface-border/20 pb-1">
                                        <span className="text-text-secondary">Min</span>
                                        <span className="text-text-primary font-mono">{profile.numericStats.min.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between border-b border-surface-border/20 pb-1">
                                        <span className="text-text-secondary">Max</span>
                                        <span className="text-text-primary font-mono">{profile.numericStats.max.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-text-secondary">Average</span>
                                        <span className="text-text-primary font-mono">{profile.numericStats.avg.toLocaleString()}</span>
                                      </div>
                                    </>
                                  )}

                                  {!profile.isNumeric && profile.frequentValues && (
                                    <div className="flex flex-col gap-1.5 mt-1.5 pt-1.5 border-t border-surface-border/30">
                                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Top Frequencies</span>
                                      <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto pr-1">
                                        {profile.frequentValues.map((v: any, idx: number) => (
                                          <div key={idx} className="flex flex-col gap-0.5">
                                            <div className="flex justify-between text-[10px]">
                                              <span className="text-text-secondary truncate max-w-[150px] font-mono">{String(v.val)}</span>
                                              <span className="text-text-primary font-mono">{v.count} ({Math.round(v.pct)}%)</span>
                                            </div>
                                            <div className="w-full bg-surface-muted h-1 rounded-full overflow-hidden">
                                              <div 
                                                className="bg-gradient-to-r from-accent/50 to-accent h-full rounded-full transition-all duration-500" 
                                                style={{ width: `${v.pct}%` }} 
                                              />
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </>
                          );
                        })()}
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
      )
    )}
    </div> {/* end main card */}
  </div>
  );
}
