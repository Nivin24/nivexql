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
  insights: string | null;
  isPinned?: boolean;
}

interface AppState {
  // Connections
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
  schema: SchemaTable[];
  showConnModal: boolean;

  // Notebook
  cells: NotebookCell[];
  activeCellId: string | null;

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

  // Actions - Notebook
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
  exportNotebook: (format: 'json' | 'sql') => void;
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
  insights: null,
  isPinned: false,
});

// Sanitize cells loaded from storage — reset transient runtime state so they always start clean
const sanitizeCell = (c: NotebookCell): NotebookCell => ({
  ...c,
  agentStatus: 'idle',
  agentLog: [],
});

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      connections: [],
      activeConnectionId: null,
      schema: [],
      showConnModal: false,
      cells: [createCell()],
      activeCellId: null,

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

      addCell: () => set((s) => {
        const newCell = createCell();
        return { cells: [...s.cells, newCell], activeCellId: newCell.id };
      }),
      removeCell: (id) => set((s) => ({
        cells: s.cells.filter(c => c.id !== id),
        activeCellId: s.activeCellId === id ? (s.cells.length > 1 ? s.cells[0].id : null) : s.activeCellId
      })),
      setActiveCell: (id) => set({ activeCellId: id }),
      updateCell: (id, updates) => set((s) => ({
        cells: s.cells.map(c => c.id === id ? { ...c, ...updates } : c)
      })),
      moveCell: (draggedId, targetId, position) => set((s) => {
        const fromIndex = s.cells.findIndex(c => c.id === draggedId);
        let toIndex = s.cells.findIndex(c => c.id === targetId);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return s;
        const newCells = [...s.cells];
        const [moved] = newCells.splice(fromIndex, 1);
        toIndex = newCells.findIndex(c => c.id === targetId);
        if (position === 'after') toIndex += 1;
        newCells.splice(toIndex, 0, moved);
        return { cells: newCells };
      }),
      togglePinCell: (id) => set((s) => {
        const mapped = s.cells.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c);
        const pinned = mapped.filter(c => c.isPinned);
        const unpinned = mapped.filter(c => !c.isPinned);
        return { cells: [...pinned, ...unpinned] };
      }),
      appendAgentLog: (id, log) => set((s) => ({
        cells: s.cells.map(c => c.id === id ? { ...c, agentLog: [...c.agentLog, log] } : c)
      })),
      clearAgentLog: (id) => set((s) => ({
        cells: s.cells.map(c => c.id === id ? { ...c, agentLog: [] } : c)
      })),

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
        if (state.cells.length === 0) return;

        let content = '';
        let filename = '';
        let mime = '';

        if (format === 'json') {
          const exportData = {
            exportDate: new Date().toISOString(),
            cells: state.cells.map(c => ({
              name: c.name,
              prompt: c.prompt,
              sql: c.sql,
              resultCount: c.queryResult?.rowCount || 0,
              agentAnalysis: c.agentAnalysis
            }))
          };
          content = JSON.stringify(exportData, null, 2);
          filename = `nivexql_notebook_${Date.now()}.json`;
          mime = 'application/json';
        } else if (format === 'sql') {
          content = state.cells
            .filter(c => c.sql.trim().length > 0)
            .map(c => `-- ${c.name || 'Untitled Analysis'}\n-- Prompt: ${c.prompt}\n${c.sql};\n\n`)
            .join('');
          filename = `nivexql_notebook_${Date.now()}.sql`;
          mime = 'application/sql';
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
    }),
    {
      name: 'nivexql-storage', // localStorage key
      storage: createJSONStorage(() => localStorage),
      // Only persist meaningful state — exclude all transient/runtime-only fields
      partialize: (state) => ({
        connections: state.connections,
        activeConnectionId: state.activeConnectionId,
        cells: state.cells.map(sanitizeCell),
        activeCellId: state.activeCellId,
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
