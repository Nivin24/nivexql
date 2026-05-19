import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ConnectionConfig {
  id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  dialect: 'postgresql' | 'mysql' | 'sqlite';
  sqlite_path?: string;
  use_ssh?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_user?: string;
  ssh_password?: string;
  ssh_key_path?: string;
}

export interface SchemaTable {
  name: string;
  columns: { name: string; type: string; isPrimaryKey?: boolean }[];
  foreignKeys?: { column: string; referencedTable: string; referencedColumn: string }[];
  rowCount?: number;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionMs: number;
}

export type AgentStatus = 'idle' | 'generating' | 'fixing' | 'verifying' | 'executing' | 'done' | 'error';

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  cellName: string;
  rowCount: number;
  executionMs: number;
  timestamp: number;
  success: boolean;
}

export interface NotebookCell {
  id: string;
  name: string;
  prompt: string;
  sql: string;
  queryResult: QueryResult | null;
  agentStatus: AgentStatus;
  agentLog: string[];
  vizType: 'bar' | 'line' | 'scatter' | 'pie' | 'area' | 'bubble';
  showViz: boolean;
  viewMode?: 'table' | 'chart' | 'pivot';
  insights: string | null;
  isPinned?: boolean;
  chatHistory?: { role: 'user' | 'assistant'; content: string; sql?: string }[];
  lastActiveError?: string;
  previousSql?: string; // For visual diffing when AI corrects SQL
}

export interface NotebookSession {
  id: string;
  name: string;
  cells: NotebookCell[];
  activeCellId: string | null;
}

interface AppState {
  // Connections
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
  schema: SchemaTable[];
  showConnModal: boolean;

  // Notebooks (Tabs)
  notebooks: NotebookSession[];
  activeNotebookId: string;

  // Global Settings
  llmProvider: 'ollama' | 'openai' | 'gemini';
  llmModel: string;
  llmApiKey: string;
  llmEndpoint: string;
  llmStatus: 'ok' | 'error' | 'unknown';
  favorites: string[];
  globalContext: string;
  sidebarWidth: number;
  editorHeight: number;
  showSchemaDiagram: boolean;
  uiTextSize: 'xs' | 'sm' | 'base' | 'lg';
  editorTheme: string;
  queryHistory: QueryHistoryEntry[];
  appTheme: 'dark' | 'light';

  // Actions - Connections
  addConnection: (c: ConnectionConfig) => void;
  removeConnection: (id: string) => void;
  setActiveConnection: (id: string | null) => void;
  setSchema: (tables: SchemaTable[]) => void;
  setSidebarWidth: (updater: (prev: number) => number) => void;
  setEditorHeight: (updater: (prev: number) => number) => void;
  setShowSchemaDiagram: (show: boolean) => void;
  setShowConnModal: (show: boolean) => void;

  // Actions - Notebooks
  addNotebook: () => void;
  removeNotebook: (id: string) => void;
  setActiveNotebook: (id: string) => void;
  renameNotebook: (id: string, name: string) => void;

  // Actions - Cells (operate on active notebook)
  addCell: () => void;
  removeCell: (id: string) => void;
  setActiveCell: (id: string | null) => void;
  updateCell: (id: string, updates: Partial<NotebookCell>) => void;
  moveCell: (draggedId: string, targetId: string, position: 'before' | 'after') => void;
  togglePinCell: (id: string) => void;
  appendAgentLog: (id: string, log: string) => void;
  clearAgentLog: (id: string) => void;

  // Actions - Global Settings
  setLlmProvider: (p: 'ollama' | 'openai' | 'gemini') => void;
  setLlmModel: (m: string) => void;
  setLlmApiKey: (k: string) => void;
  setLlmEndpoint: (e: string) => void;
  setLlmStatus: (s: 'ok' | 'error' | 'unknown') => void;
  setLlmConfig: (config: Partial<Pick<AppState, 'llmProvider' | 'llmModel' | 'llmApiKey' | 'llmEndpoint'>>) => void;
  setGlobalContext: (c: string) => void;
  addFavorite: (sql: string) => void;
  setUiTextSize: (size: 'xs' | 'sm' | 'base' | 'lg') => void;
  setEditorTheme: (id: string) => void;
  addQueryHistory: (entry: Omit<QueryHistoryEntry, 'id' | 'timestamp'>) => void;
  clearQueryHistory: () => void;
  setAppTheme: (theme: 'dark' | 'light') => void;
  exportNotebook: (format: 'json' | 'sql' | 'html' | 'ipynb') => void;
}

const createCell = (): NotebookCell => ({
  id: Math.random().toString(36).substring(2, 9),
  name: '',
  prompt: '',
  sql: '',
  queryResult: null,
  agentStatus: 'idle',
  agentLog: [],
  vizType: 'bar',
  showViz: false,
  viewMode: 'table',
  insights: null,
  isPinned: false,
});

// Sanitize cells loaded from storage
const sanitizeCell = (c: NotebookCell): NotebookCell => ({
  ...c,
  agentStatus: 'idle',
  agentLog: [],
});

const createNotebook = (name: string): NotebookSession => ({
  id: Math.random().toString(36).substring(2, 9),
  name,
  cells: [createCell()],
  activeCellId: null,
});

const updateActiveNotebook = (s: AppState, updater: (nb: NotebookSession) => Partial<NotebookSession>) => ({
  notebooks: s.notebooks.map(nb => nb.id === s.activeNotebookId ? { ...nb, ...updater(nb) } : nb)
});

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const initialNotebook = createNotebook('Analysis 1');
      return {
        connections: [],
        activeConnectionId: null,
        schema: [],
        showConnModal: false,
        
        notebooks: [initialNotebook],
        activeNotebookId: initialNotebook.id,

        llmProvider: 'ollama',
      llmModel: 'qwen3:14b',
      llmApiKey: '',
      llmEndpoint: 'http://localhost:11434',
      llmStatus: 'unknown',
      favorites: [],
      globalContext: '',
      sidebarWidth: 260,
      editorHeight: 40,
      showSchemaDiagram: false,
      uiTextSize: 'sm',
      editorTheme: 'nvn-dark',
      queryHistory: [],
      appTheme: 'dark',

      addConnection: (c) => set((s) => ({ connections: [...s.connections, c] })),
      removeConnection: (id) => set((s) => ({
        connections: s.connections.filter(c => c.id !== id),
        activeConnectionId: s.activeConnectionId === id ? null : s.activeConnectionId
      })),
      setActiveConnection: (id) => set({ activeConnectionId: id }),
      setSchema: (tables) => set({ schema: tables }),
      setSidebarWidth: (fn) => set((s) => ({ sidebarWidth: fn(s.sidebarWidth) })),
      setEditorHeight: (fn) => set((s) => ({ editorHeight: fn(s.editorHeight) })),
      setShowSchemaDiagram: (showSchemaDiagram) => set({ showSchemaDiagram }),
      setShowConnModal: (showConnModal) => set({ showConnModal }),

      addNotebook: () => set((s) => {
        const nb = createNotebook(`Analysis ${s.notebooks.length + 1}`);
        return { notebooks: [...s.notebooks, nb], activeNotebookId: nb.id };
      }),
      removeNotebook: (id) => set((s) => {
        const nbs = s.notebooks.filter(n => n.id !== id);
        if (nbs.length === 0) {
          const nb = createNotebook('Analysis 1');
          return { notebooks: [nb], activeNotebookId: nb.id };
        }
        return { notebooks: nbs, activeNotebookId: s.activeNotebookId === id ? nbs[nbs.length - 1].id : s.activeNotebookId };
      }),
      setActiveNotebook: (id) => set({ activeNotebookId: id }),
      renameNotebook: (id, name) => set((s) => ({
        notebooks: s.notebooks.map(n => n.id === id ? { ...n, name } : n)
      })),

      addCell: () => set((s) => updateActiveNotebook(s, nb => {
        const newCell = createCell();
        return { cells: [...nb.cells, newCell], activeCellId: newCell.id };
      })),
      removeCell: (id) => set((s) => updateActiveNotebook(s, nb => ({
        cells: nb.cells.filter(c => c.id !== id),
        activeCellId: nb.activeCellId === id ? (nb.cells.length > 1 ? nb.cells[0].id : null) : nb.activeCellId
      }))),
      setActiveCell: (id) => set((s) => updateActiveNotebook(s, () => ({ activeCellId: id }))),
      updateCell: (id, updates) => set((s) => updateActiveNotebook(s, nb => ({
        cells: nb.cells.map(c => c.id === id ? { ...c, ...updates } : c)
      }))),
      moveCell: (draggedId, targetId, position) => set((s) => updateActiveNotebook(s, nb => {
        const fromIndex = nb.cells.findIndex(c => c.id === draggedId);
        let toIndex = nb.cells.findIndex(c => c.id === targetId);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return {};
        const newCells = [...nb.cells];
        const [moved] = newCells.splice(fromIndex, 1);
        toIndex = newCells.findIndex(c => c.id === targetId);
        if (position === 'after') toIndex += 1;
        newCells.splice(toIndex, 0, moved);
        return { cells: newCells };
      })),
      togglePinCell: (id) => set((s) => updateActiveNotebook(s, nb => {
        const mapped = nb.cells.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c);
        const pinned = mapped.filter(c => c.isPinned);
        const unpinned = mapped.filter(c => !c.isPinned);
        return { cells: [...pinned, ...unpinned] };
      })),
      appendAgentLog: (id, log) => set((s) => updateActiveNotebook(s, nb => ({
        cells: nb.cells.map(c => c.id === id ? { ...c, agentLog: [...c.agentLog, log] } : c)
      }))),
      clearAgentLog: (id) => set((s) => updateActiveNotebook(s, nb => ({
        cells: nb.cells.map(c => c.id === id ? { ...c, agentLog: [] } : c)
      }))),

      setLlmProvider: (llmProvider) => set({ llmProvider }),
      setLlmModel: (llmModel) => set({ llmModel }),
      setLlmApiKey: (llmApiKey) => set({ llmApiKey }),
      setLlmEndpoint: (llmEndpoint) => set({ llmEndpoint }),
      setLlmStatus: (llmStatus) => set({ llmStatus }),
      setLlmConfig: (config) => set((s) => ({ ...s, ...config })),
      setGlobalContext: (globalContext) => set({ globalContext }),
      addFavorite: (sql) => set((s) => ({
        favorites: s.favorites.includes(sql) ? s.favorites : [...s.favorites, sql]
      })),
      setUiTextSize: (uiTextSize) => set({ uiTextSize }),
      setEditorTheme: (editorTheme) => set({ editorTheme }),
      addQueryHistory: (entry) => set((s) => ({
        queryHistory: [
          { ...entry, id: Math.random().toString(36).substring(2, 9), timestamp: Date.now() },
          ...s.queryHistory
        ].slice(0, 100)
      })),
      clearQueryHistory: () => set({ queryHistory: [] }),
      setAppTheme: (appTheme) => set({ appTheme }),

      exportNotebook: (format) => {
        const state = get();
        const activeNb = state.notebooks.find(n => n.id === state.activeNotebookId);
        if (!activeNb || activeNb.cells.length === 0) return;

        let content = '';
        let filename = '';
        let mime = '';

        if (format === 'json') {
          const exportData = {
            exportDate: new Date().toISOString(),
            notebookName: activeNb.name,
            cells: activeNb.cells.map(c => ({
              name: c.name,
              prompt: c.prompt,
              sql: c.sql,
              resultCount: c.queryResult?.rowCount || 0,
              agentAnalysis: c.insights
            }))
          };
          content = JSON.stringify(exportData, null, 2);
          filename = `nivexql_${activeNb.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
          mime = 'application/json';
        } else if (format === 'sql') {
          content = activeNb.cells
            .filter(c => c.sql.trim().length > 0)
            .map(c => `-- ${c.name || 'Untitled Analysis'}\n-- Prompt: ${c.prompt}\n${c.sql};\n\n`)
            .join('');
          filename = `nivexql_${activeNb.name.replace(/\s+/g, '_')}_${Date.now()}.sql`;
          mime = 'application/sql';
        } else if (format === 'html') {
          const cellsHtml = activeNb.cells.map((c, i) => {
            const tableRows = c.queryResult ? c.queryResult.rows.slice(0, 100).map(r => `
              <tr>
                ${c.queryResult!.columns.map(col => `<td style="padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${r[col] !== null && r[col] !== undefined ? String(r[col]) : '<span style="color: rgba(255,255,255,0.3); font-style: italic;">null</span>'}</td>`).join('')}
              </tr>
            `).join('') : '';

            const tableHeaders = c.queryResult ? c.queryResult.columns.map(col => `
              <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); color: #8f9cae; font-weight: bold; font-size: 11px; text-transform: uppercase;">${col}</th>
            `).join('') : '';

            return `
              <div style="background: rgba(17, 22, 37, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); backdrop-filter: blur(12px);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px;">
                  <h3 style="margin: 0; font-size: 18px; color: #3b82f6;">${i + 1}. ${c.name || 'Untitled Analysis'}</h3>
                  <span style="font-size: 11px; font-weight: bold; background: rgba(59, 130, 246, 0.15); color: #3b82f6; padding: 4px 10px; border-radius: 9999px;">Cell ${i + 1}</span>
                </div>
                <div style="margin-bottom: 16px;">
                  <strong style="display: block; font-size: 11px; color: #8f9cae; text-transform: uppercase; margin-bottom: 4px;">Natural Language Question</strong>
                  <div style="font-size: 14px; color: #e2e8f0; line-height: 1.5;">${c.prompt || 'No question provided.'}</div>
                </div>
                <div style="margin-bottom: 16px;">
                  <strong style="display: block; font-size: 11px; color: #8f9cae; text-transform: uppercase; margin-bottom: 6px;">Executed SQL</strong>
                  <pre style="background: #090d16; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 14px; font-family: monospace; font-size: 12px; color: #10b981; overflow-x: auto; margin: 0; line-height: 1.6;">${c.sql}</pre>
                </div>
                ${c.insights ? `
                  <div style="margin-bottom: 16px; background: rgba(59, 130, 246, 0.05); border-left: 3px solid #3b82f6; padding: 12px 16px; border-radius: 4px;">
                    <strong style="display: block; font-size: 11px; color: #3b82f6; text-transform: uppercase; margin-bottom: 4px;">AI Analysis Findings</strong>
                    <div style="font-size: 13px; color: #cbd5e1; line-height: 1.5; white-space: pre-wrap;">${c.insights}</div>
                  </div>
                ` : ''}
                ${c.queryResult ? `
                  <div>
                    <strong style="display: block; font-size: 11px; color: #8f9cae; text-transform: uppercase; margin-bottom: 6px;">Query Results (${c.queryResult.rowCount} rows)</strong>
                    <div style="overflow-x: auto; max-height: 300px; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; background: #0a0e17;">
                      <table style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 12px; color: #cbd5e1;">
                        <thead style="position: sticky; top: 0; background: #0d1321; z-index: 1;">
                          <tr>${tableHeaders}</tr>
                        </thead>
                        <tbody>
                          ${tableRows}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('');

          content = `
            <!DOCTYPE html>
            <html lang="en" style="background: #060913; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif;">
            <head>
              <meta charset="UTF-8">
              <title>NivexQL - ${activeNb.name} Report</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 40px 20px; max-width: 1000px; margin: 0 auto; line-height: 1.5;">
              <header style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 24px; margin-bottom: 40px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 8px 12px; border-radius: 8px; font-weight: bold; font-size: 16px; color: white;">N</span>
                  <h1 style="margin: 0; font-size: 28px; background: linear-gradient(to right, #3b82f6, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">NivexQL Analytics Notebook</h1>
                </div>
                <div style="margin-top: 12px; color: #8f9cae; font-size: 13px; display: flex; gap: 20px;">
                  <span><strong>Notebook:</strong> ${activeNb.name}</span>
                  <span><strong>Generated:</strong> ${new Date().toLocaleString()}</span>
                  <span><strong>Total Cells:</strong> ${activeNb.cells.length}</span>
                </div>
              </header>
              <main>
                ${cellsHtml}
              </main>
              <footer style="margin-top: 60px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px; text-align: center; font-size: 12px; color: #8f9cae;">
                Generated by NivexQL — Open Source Stateless SQL BI Platform.
              </footer>
            </body>
            </html>
          `;
          filename = `nivexql_${activeNb.name.replace(/\s+/g, '_')}_${Date.now()}.html`;
          mime = 'text/html';
        } else if (format === 'ipynb') {
          const jupyterCells: any[] = [];
          
          jupyterCells.push({
            cell_type: 'markdown',
            metadata: {},
            source: [
              `# NivexQL Notebook Report: ${activeNb.name}\n`,
              `*Generated on: ${new Date().toLocaleString()}*\n`,
              `*Total Analyses: ${activeNb.cells.length}*`
            ]
          });

          activeNb.cells.forEach((c, idx) => {
            jupyterCells.push({
              cell_type: 'markdown',
              metadata: {},
              source: [
                `## ${idx + 1}. ${c.name || 'Untitled Analysis'}\n`,
                `**User Prompt:** ${c.prompt || 'None'}\n\n`,
                c.insights ? `### AI Summary:\n${c.insights}\n` : ''
              ]
            });

            jupyterCells.push({
              cell_type: 'code',
              execution_count: null,
              metadata: {},
              outputs: [],
              source: c.sql.split('\n').map((line, lIdx, arr) => lIdx === arr.length - 1 ? line : line + '\n')
            });
          });

          const jupyterData = {
            cells: jupyterCells,
            metadata: {
              kernelspec: {
                display_name: 'Python 3',
                language: 'python',
                name: 'python3'
              },
              language_info: {
                name: 'python'
              }
            },
            nbformat: 4,
            nbformat_minor: 2
          };
          content = JSON.stringify(jupyterData, null, 2);
          filename = `nivexql_${activeNb.name.replace(/\s+/g, '_')}_${Date.now()}.ipynb`;
          mime = 'application/x-ipynb+json';
        }

        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
    };
  },
  {
      name: 'nivexql-storage', // localStorage key
      storage: createJSONStorage(() => localStorage),
      // Only persist meaningful state — exclude all transient/runtime-only fields
      partialize: (state) => ({
        connections: state.connections,
        activeConnectionId: state.activeConnectionId,
        notebooks: state.notebooks.map(nb => ({
          ...nb,
          cells: nb.cells.map(sanitizeCell)
        })),
        activeNotebookId: state.activeNotebookId,
        llmProvider: state.llmProvider,
        llmModel: state.llmModel,
        llmApiKey: state.llmApiKey,
        llmEndpoint: state.llmEndpoint,
        globalContext: state.globalContext,
        sidebarWidth: state.sidebarWidth,
        editorHeight: state.editorHeight,
        uiTextSize: state.uiTextSize,
        editorTheme: state.editorTheme,
        queryHistory: state.queryHistory,
        favorites: state.favorites,
        appTheme: state.appTheme,
      }),
    }
  )
);
