import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { apiConnectServer, apiSelectDatabase } from '../lib/api';
import type { StorytellingNiche } from '../lib/api';

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
  sqlHistory?: string[];
  runOnMount?: boolean;
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
  showSettingsModal: boolean;
  showNichePlanner: boolean;

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
  appTheme: 'dark' | 'light' | 'cosmic';
  uiStyle: 'classic' | 'liquid';
  dashboardMode: boolean;

  // Niche Planner — session-only cache (not persisted)
  cachedNiches: StorytellingNiche[] | null;
  setCachedNiches: (niches: StorytellingNiche[]) => void;
  clearCachedNiches: () => void;

  // Actions - Connections
  addConnection: (c: ConnectionConfig) => void;
  removeConnection: (id: string) => void;
  setActiveConnection: (id: string | null) => void;
  setSchema: (tables: SchemaTable[]) => void;
  setSidebarWidth: (updater: (prev: number) => number) => void;
  setEditorHeight: (updater: (prev: number) => number) => void;
  setShowSchemaDiagram: (show: boolean) => void;
  setShowConnModal: (show: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  setShowNichePlanner: (show: boolean) => void;
  reconnectActiveConnection: () => Promise<void>;

  // Actions - Notebooks
  addNotebook: () => void;
  removeNotebook: (id: string) => void;
  setActiveNotebook: (id: string) => void;
  renameNotebook: (id: string, name: string) => void;
  getOrCreateNotebookByName: (name: string) => string;

  // Actions - Cells (operate on active notebook)
  addCell: (sql?: string, name?: string, vizType?: string) => void;
  addCellToNotebook: (notebookId: string, sql?: string, name?: string, vizType?: string) => void;
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
  removeFavorite: (sql: string) => void;
  setUiTextSize: (size: 'xs' | 'sm' | 'base' | 'lg') => void;
  setEditorTheme: (id: string) => void;
  addQueryHistory: (entry: Omit<QueryHistoryEntry, 'id' | 'timestamp'>) => void;
  clearQueryHistory: () => void;
  setAppTheme: (theme: 'dark' | 'light' | 'cosmic') => void;
  setUiStyle: (style: 'classic' | 'liquid') => void;
  setDashboardMode: (mode: boolean) => void;
  exportNotebook: (format: 'json' | 'sql' | 'html' | 'ipynb') => void;
  exportDashboard: () => void;
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
  sqlHistory: [],
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

const D3_RENDER_SCRIPT = `
function renderChart(containerId, data, columns, chartType) {
  const container = document.getElementById(containerId);
  if (!container || !data || !data.length) return;
  container.innerHTML = '';
  const svg = d3.select(container).append('svg')
    .style('width', '100%')
    .style('height', '100%')
    .style('display', 'block');
  const tooltip = d3.select(container).append('div')
    .attr('class', 'd3-tooltip')
    .style('position', 'absolute')
    .style('background', 'rgba(10, 14, 26, 0.95)')
    .style('border', '1px solid rgba(255, 255, 255, 0.15)')
    .style('border-radius', '6px')
    .style('padding', '8px 12px')
    .style('color', '#fff')
    .style('font-size', '11px')
    .style('pointer-events', 'none')
    .style('box-shadow', '0 4px 12px rgba(0, 0, 0, 0.4)')
    .style('z-index', '100')
    .style('display', 'none')
    .style('font-family', 'system-ui, sans-serif')
    .style('line-height', '1.4');

  function formatVal(v) {
    if (v === null || v === undefined) return '';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    if (Number.isInteger(n)) return n.toLocaleString();
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function detectAxes(data, columns) {
    const numericCols = columns.filter(c => {
      const sample = data.slice(0, 10).map(r => r[c]);
      return sample.every(v => v !== null && !isNaN(Number(v)));
    });
    const categoricalCols = columns.filter(c => !numericCols.includes(c));
    const xCol = categoricalCols[0] ?? columns[0];
    const yCol = numericCols[0] ?? columns[1] ?? columns[0];
    const zCol = numericCols[1] ?? numericCols[0];
    return { xCol, yCol, zCol };
  }

  const { xCol, yCol, zCol } = detectAxes(data, columns);
  const W = container.clientWidth;
  const H = container.clientHeight;
  const margin = { top: 20, right: 24, bottom: 60, left: 60 };
  const width  = W - margin.left - margin.right;
  const height = H - margin.top - margin.bottom;

  svg.attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

  const addGrid = (scale) => {
    g.append('g').attr('class', 'grid')
      .call(d3.axisLeft(scale).tickSize(-width).tickFormat(() => ''))
      .selectAll('line').attr('stroke', '#1c2540').attr('stroke-dasharray', '3,3');
    g.select('.grid .domain').remove();
  };

  const showTip = (event, d) => {
    let htmlContent = '<strong>' + xCol + ':</strong> ' + d[xCol] + '<br/><strong>' + yCol + ':</strong> ' + d[yCol];
    if (chartType === 'bubble') {
      htmlContent += '<br/><strong>' + zCol + ':</strong> ' + d[zCol];
    }
    tooltip.style('display', 'block')
      .style('left', (event.offsetX + 12) + 'px')
      .style('top',  (event.offsetY - 24) + 'px')
      .html(htmlContent);
  };
  const hideTip = () => tooltip.style('display', 'none');

  if (chartType === 'bar') {
    const xScale = d3.scaleBand().domain(data.map(d => String(d[xCol]))).range([0, width]).padding(0.3);
    const yMax = d3.max(data, d => +d[yCol]) ?? 0;
    const yScale = d3.scaleLinear().domain([0, yMax * 1.1]).nice().range([height, 0]);
    addGrid(yScale);
    g.append('g').attr('transform', 'translate(0,' + height + ')').call(d3.axisBottom(xScale))
      .selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 11).attr('transform', 'rotate(-30)').style('text-anchor', 'end');
    g.append('g').call(d3.axisLeft(yScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 11);
    
    g.selectAll('rect').data(data).join('rect')
      .attr('x', d => xScale(String(d[xCol])))
      .attr('y', d => yScale(+d[yCol]))
      .attr('width', xScale.bandwidth())
      .attr('height', d => height - yScale(+d[yCol]))
      .attr('rx', 4).attr('fill', '#6c8dfa').attr('opacity', 0.85).style('cursor', 'pointer')
      .on('mouseover', function(event, d) { d3.select(this).attr('opacity', 1).attr('fill', '#8aa5fc'); showTip(event, d); })
      .on('mousemove', (event, d) => showTip(event, d))
      .on('mouseleave', function() { d3.select(this).attr('opacity', 0.85).attr('fill', '#6c8dfa'); hideTip(); });

    g.selectAll('.bar-label')
      .data(data)
      .join('text')
      .attr('class', 'bar-label')
      .attr('x', d => xScale(String(d[xCol])) + xScale.bandwidth() / 2)
      .attr('y', d => yScale(+d[yCol]) - 6)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e8edf8')
      .attr('font-size', '10px')
      .attr('font-weight', '500')
      .text(d => formatVal(d[yCol]));
  }

  else if (chartType === 'line' || chartType === 'area') {
    const xScale = d3.scalePoint().domain(data.map(d => String(d[xCol]))).range([0, width]).padding(0.1);
    const yMax = d3.max(data, d => +d[yCol]) ?? 0;
    const yScale = d3.scaleLinear().domain([0, yMax * 1.1]).nice().range([height, 0]);
    addGrid(yScale);
    g.append('g').attr('transform', 'translate(0,' + height + ')').call(d3.axisBottom(xScale))
      .selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 11).attr('transform', 'rotate(-30)').style('text-anchor', 'end');
    g.append('g').call(d3.axisLeft(yScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 11);
    
    if (chartType === 'area') {
      const area = d3.area().x(d => xScale(String(d[xCol]))).y0(height).y1(d => yScale(+d[yCol])).curve(d3.curveMonotoneX);
      const grad = svg.append('defs').append('linearGradient').attr('id', 'area-grad-' + containerId).attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
      grad.append('stop').attr('offset', '0%').attr('stop-color', '#6c8dfa').attr('stop-opacity', 0.4);
      grad.append('stop').attr('offset', '100%').attr('stop-color', '#6c8dfa').attr('stop-opacity', 0.05);
      g.append('path').datum(data).attr('fill', 'url(#area-grad-' + containerId + ')').attr('d', area);
    }

    const line = d3.line().x(d => xScale(String(d[xCol]))).y(d => yScale(+d[yCol])).curve(d3.curveMonotoneX);
    g.append('path').datum(data).attr('fill', 'none').attr('stroke', '#6c8dfa').attr('stroke-width', 2.5).attr('d', line);
    
    g.selectAll('circle').data(data).join('circle')
      .attr('cx', d => xScale(String(d[xCol])))
      .attr('cy', d => yScale(+d[yCol]))
      .attr('r', 4).attr('fill', '#6c8dfa').attr('stroke', '#0a0e1a').attr('stroke-width', 2).style('cursor', 'pointer')
      .on('mouseover', function(event, d) { d3.select(this).attr('r', 6).attr('fill', '#8aa5fc'); showTip(event, d); })
      .on('mouseleave', function() { d3.select(this).attr('r', 4).attr('fill', '#6c8dfa'); hideTip(); });

    g.selectAll('.line-label')
      .data(data)
      .join('text')
      .attr('class', 'line-label')
      .attr('x', d => xScale(String(d[xCol])))
      .attr('y', d => yScale(+d[yCol]) - 8)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e8edf8')
      .attr('font-size', '10px')
      .attr('font-weight', '500')
      .text(d => formatVal(d[yCol]));
  }

  else if (chartType === 'scatter' || chartType === 'bubble') {
    const xNum = columns.filter(c => !isNaN(Number(data[0]?.[c])))[0] ?? columns[0];
    const yNum = columns.filter(c => !isNaN(Number(data[0]?.[c])))[1] ?? columns[1] ?? columns[0];
    const xScale = d3.scaleLinear().domain(d3.extent(data, d => +d[xNum])).nice().range([0, width]);
    const yScale = d3.scaleLinear().domain(d3.extent(data, d => +d[yNum])).nice().range([height, 0]);
    const zScale = d3.scaleLinear().domain(d3.extent(data, d => +d[zCol])).range([5, 25]);
    addGrid(yScale);
    g.append('g').attr('transform', 'translate(0,' + height + ')').call(d3.axisBottom(xScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 11);
    g.append('g').call(d3.axisLeft(yScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 11);

    g.selectAll('circle').data(data).join('circle')
      .attr('cx', d => xScale(+d[xNum]))
      .attr('cy', d => yScale(+d[yNum]))
      .attr('r', d => chartType === 'bubble' ? zScale(+d[zCol]) : 5)
      .attr('fill', '#6c8dfa').attr('opacity', 0.6).attr('stroke', '#6c8dfa').attr('stroke-width', 1.5).style('cursor', 'pointer')
      .on('mouseover', function(event, d) { d3.select(this).attr('opacity', 1).attr('stroke', '#fff'); showTip(event, d); })
      .on('mouseleave', function() { d3.select(this).attr('opacity', 0.6).attr('stroke', '#6c8dfa'); hideTip(); });

    g.selectAll('.scatter-label')
      .data(data)
      .join('text')
      .attr('class', 'scatter-label')
      .attr('x', d => xScale(+d[xNum]))
      .attr('y', d => yScale(+d[yNum]) - (chartType === 'bubble' ? zScale(+d[zCol]) + 4 : 8))
      .attr('text-anchor', 'middle')
      .attr('fill', '#e8edf8')
      .attr('font-size', '9px')
      .attr('font-weight', '500')
      .text(d => formatVal(d[yNum]));
  }

  else if (chartType === 'pie') {
    let radius;
    let pieCenterX;
    let pieCenterY;
    let legendX;
    let legendY;
    const isVertical = width < 420;
    const sliceCount = isVertical ? 8 : 10;
    const pieData = data.slice(0, sliceCount);
    const color = d3.scaleOrdinal(d3.schemeTableau10);

    if (isVertical) {
      const pieHeight = height - 50;
      radius = Math.min(width, pieHeight) / 2 - 15;
      pieCenterX = width / 2;
      pieCenterY = radius + 10;
      legendX = 0;
      legendY = pieCenterY + radius + 20;
    } else {
      const pieWidth = width - 140;
      radius = Math.min(pieWidth, height) / 2 - 20;
      pieCenterX = pieWidth / 2 + 10;
      pieCenterY = height / 2;
      legendX = width - 120;
      legendY = Math.max(10, (height - (pieData.length * 18)) / 2);
    }

    const pie = d3.pie().value(d => +d[yCol]).sort(null);
    const arc = d3.arc().innerRadius(radius * 0.55).outerRadius(radius).cornerRadius(4);
    const pieG = g.append('g').attr('transform', 'translate(' + pieCenterX + ',' + pieCenterY + ')');
    const arcs = pie(pieData);

    pieG.selectAll('path').data(arcs).join('path')
      .attr('d', arc)
      .attr('fill', (_d, i) => color(i.toString()))
      .attr('stroke', '#0a0e1a')
      .attr('stroke-width', 3).style('cursor', 'pointer')
      .on('mouseover', function(event, d) { d3.select(this).attr('opacity', 0.8).attr('transform', 'scale(1.05)'); showTip(event, d.data); })
      .on('mousemove', (event, d) => showTip(event, d.data))
      .on('mouseleave', function() { d3.select(this).attr('opacity', 1).attr('transform', 'scale(1)'); hideTip(); });

    pieG.selectAll('.pie-label').data(arcs).join('text')
      .attr('class', 'pie-label')
      .attr('transform', function(d) { return 'translate(' + arc.centroid(d) + ')'; })
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffff')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .text(d => {
        const percent = ((d.endAngle - d.startAngle) / (2 * Math.PI)) * 100;
        if (percent > 12) {
          return String(d.data[xCol]).slice(0, 8) + ' (' + formatVal(d.data[yCol]) + ')';
        } else if (percent > 5) {
          return formatVal(d.data[yCol]);
        }
        return '';
      });

    const legend = g.append('g').attr('transform', 'translate(' + legendX + ', ' + legendY + ')');
    if (isVertical) {
      let currentX = 0;
      let currentY = 0;
      const colWidth = 90;
      pieData.forEach((d, i) => {
        const row = legend.append('g').attr('transform', 'translate(' + currentX + ', ' + currentY + ')');
        row.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2.5).attr('fill', color(i.toString()));
        row.append('text').attr('x', 16).attr('y', 9).attr('fill', '#8b9cc4').attr('font-size', '9px').text(String(d[xCol]).slice(0, 10));
        currentX += colWidth;
        if (currentX + colWidth > width) {
          currentX = 0;
          currentY += 15;
        }
      });
    } else {
      pieData.forEach((d, i) => {
        const row = legend.append('g').attr('transform', 'translate(0, ' + (i * 18) + ')');
        row.append('rect').attr('width', 12).attr('height', 12).attr('rx', 3).attr('fill', color(i.toString()));
        row.append('text').attr('x', 20).attr('y', 10).attr('fill', '#8b9cc4').attr('font-size', '10px').text(String(d[xCol]).slice(0, 15));
      });
    }
  }

  if (chartType !== 'pie') {
    g.append('text').attr('x', width / 2).attr('y', height + 52).attr('text-anchor', 'middle').attr('fill', '#8b9cc4').attr('font-size', 11).attr('font-weight', 'bold').text(xCol);
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', -48).attr('text-anchor', 'middle').attr('fill', '#8b9cc4').attr('font-size', 11).attr('font-weight', 'bold').text(yCol);
  }
}
`;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const initialNotebook = createNotebook('Analysis 1');
      return {
        connections: [],
        activeConnectionId: null,
        schema: [],
        showConnModal: false,
        showSettingsModal: false,
        showNichePlanner: false,

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
        uiStyle: 'classic',
        dashboardMode: false,

        // Niche cache — session-only, starts empty
        cachedNiches: null,

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
        setShowSettingsModal: (showSettingsModal) => set({ showSettingsModal }),
        setShowNichePlanner: (showNichePlanner) => set({ showNichePlanner }),
        reconnectActiveConnection: async () => {
          const state = get();
          const activeId = state.activeConnectionId;
          if (!activeId) return;
          const conn = state.connections.find(c => c.id === activeId);
          if (!conn) return;
          try {
            await apiConnectServer(conn);
            const { tables } = await apiSelectDatabase(conn.database);
            set({ schema: tables });
          } catch (err) {
            console.error("Auto-reconnection failed:", err);
          }
        },

        setCachedNiches: (niches) => set({ cachedNiches: niches }),
        clearCachedNiches: () => set({ cachedNiches: null }),

        addNotebook: () => set((s) => {
          const nb = createNotebook(`Analysis ${s.notebooks.length + 1}`);
          return { notebooks: [...s.notebooks, nb], activeNotebookId: nb.id };
        }),
        getOrCreateNotebookByName: (name) => {
          const state = get();
          const existing = state.notebooks.find(n => n.name.toLowerCase() === name.toLowerCase());
          if (existing) {
            set({ activeNotebookId: existing.id });
            return existing.id;
          }
          const nb: NotebookSession = {
            id: Math.random().toString(36).substring(2, 9),
            name,
            cells: [],
            activeCellId: null
          };
          set((s) => ({
            notebooks: [...s.notebooks, nb],
            activeNotebookId: nb.id
          }));
          return nb.id;
        },
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

        addCell: (sql, name, vizType) => set((s) => updateActiveNotebook(s, nb => {
          const newCell = createCell();
          if (sql) {
            newCell.sql = sql;
            newCell.runOnMount = true;
          }
          if (name) newCell.name = name;
          if (vizType) {
            newCell.vizType = vizType as NotebookCell['vizType'];
            newCell.showViz = true;
            newCell.viewMode = 'chart';
          }
          return { cells: [...nb.cells, newCell], activeCellId: newCell.id };
        })),
        addCellToNotebook: (notebookId, sql, name, vizType) => set((s) => {
          const newCell = createCell();
          if (sql) {
            newCell.sql = sql;
            newCell.runOnMount = true;
          }
          if (name) newCell.name = name;
          if (vizType) {
            newCell.vizType = vizType as NotebookCell['vizType'];
            newCell.showViz = true;
            newCell.viewMode = 'chart';
          }
          return {
            notebooks: s.notebooks.map(nb =>
              nb.id === notebookId
                ? { ...nb, cells: [...nb.cells, newCell], activeCellId: newCell.id }
                : nb
            )
          };
        }),
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
        removeFavorite: (sql) => set((s) => ({
          favorites: s.favorites.filter(x => x !== sql)
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
        setUiStyle: (uiStyle) => set({ uiStyle }),
        setDashboardMode: (dashboardMode) => set({ dashboardMode }),

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
              <div style="background: rgba(17, 22, 37, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); backdrop-filter: blur(12px); position: relative;">
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
                ${c.queryResult && ((!c.viewMode && c.showViz) || c.viewMode === 'chart') ? `
                  <div style="margin-bottom: 24px;">
                    <strong style="display: block; font-size: 11px; color: #8f9cae; text-transform: uppercase; margin-bottom: 6px;">Visualization (${c.vizType})</strong>
                    <div style="background: rgba(10, 14, 26, 0.2); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 12px; height: 350px; position: relative; overflow: hidden;" id="chart-${c.id}"></div>
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

            const chartInitializations = activeNb.cells
              .filter(c => c.queryResult && ((!c.viewMode && c.showViz) || c.viewMode === 'chart'))
              .map(c => `
                try {
                  renderChart("chart-${c.id}", ${JSON.stringify(c.queryResult!.rows)}, ${JSON.stringify(c.queryResult!.columns)}, "${c.vizType}");
                } catch(e) {
                  console.error("Failed to render chart for ${c.id}:", e);
                }
              `).join('\n');

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

              <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
              <script>
                ${D3_RENDER_SCRIPT}

                document.addEventListener("DOMContentLoaded", () => {
                  ${chartInitializations}
                });
              </script>
            </body>
            </html>
          `;
            filename = `nivexql_${activeNb.name.replace(/\s+/g, '_')}_${Date.now()}.html`;
            mime = 'text/html';
          } else if (format === 'ipynb') {
            const jupyterCells: unknown[] = [];

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

        exportDashboard: () => {
            const state = get();
            const activeNb = state.notebooks.find(n => n.id === state.activeNotebookId);
            if (!activeNb || activeNb.cells.length === 0) return;

            const cellsHtml = activeNb.cells
              .filter(c => c.queryResult)
              .map((c) => {
                const tableRows = c.queryResult!.rows.slice(0, 50).map(r =>
                  `<tr>${c.queryResult!.columns.map(col =>
                    `<td>${r[col] !== null && r[col] !== undefined ? String(r[col]) : '<em style="opacity:.35">null</em>'}</td>`
                  ).join('')}</tr>`
                ).join('');

                const tableHeaders = c.queryResult!.columns.map(col =>
                  `<th>${col}</th>`
                ).join('');

                const vizBadge = ((!c.viewMode && c.showViz) || c.viewMode === 'chart')
                  ? `<span class="badge">${c.vizType ?? 'chart'} chart</span>`
                  : `<span class="badge table">table · ${c.queryResult!.rowCount} rows</span>`;

                return `
<article class="card">
  <header>
    <h2>${c.name || 'Untitled'}</h2>
    ${vizBadge}
  </header>
  ${c.insights ? `<blockquote>${c.insights}</blockquote>` : ''}
  ${((!c.viewMode && c.showViz) || c.viewMode === 'chart') ? `
    <div class="chart-wrap" id="chart-${c.id}"></div>
  ` : `
    <div class="table-wrap">
      <table>
        <thead><tr>${tableHeaders}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `}
</article>`;
              }).join('\n');

            const chartInitializations = activeNb.cells
              .filter(c => c.queryResult && ((!c.viewMode && c.showViz) || c.viewMode === 'chart'))
              .map(c => `
                try {
                  renderChart("chart-${c.id}", ${JSON.stringify(c.queryResult!.rows)}, ${JSON.stringify(c.queryResult!.columns)}, "${c.vizType}");
                } catch(e) {
                  console.error("Failed to render chart for ${c.id}:", e);
                }
              `).join('\n');

            const content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${activeNb.name} — Dashboard</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#060913;--surface:rgba(13,20,48,.75);--border:rgba(255,255,255,.08);
      --text:#e2e8f0;--muted:#8f9cae;--accent:#3b82f6;--success:#10b981;
    }
    html{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.55}
    body{padding:48px 24px 80px;max-width:1400px;margin:0 auto}
    /* Title */
    .page-title{font-size:clamp(1.6rem,3vw,2.4rem);font-weight:900;letter-spacing:-.02em;
      background:linear-gradient(135deg,var(--accent),#a78bfa);-webkit-background-clip:text;
      -webkit-text-fill-color:transparent;background-clip:text;margin-bottom:6px}
    .page-meta{font-size:12px;color:var(--muted);margin-bottom:48px}
    /* Grid */
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(520px,100%),1fr));gap:28px}
    /* Card */
    .card{background:var(--surface);border:1px solid var(--border);border-radius:20px;
      padding:28px 28px 24px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
      display:flex;flex-direction:column;gap:16px;break-inside:avoid;
      box-shadow:0 12px 40px rgba(0,0,0,.28)}
    .card header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .card h2{font-size:15px;font-weight:700;color:var(--text);line-height:1.3}
    .badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
      padding:3px 10px;border-radius:999px;white-space:nowrap;flex-shrink:0;
      background:rgba(59,130,246,.15);color:var(--accent);border:1px solid rgba(59,130,246,.3)}
    .badge.table{background:rgba(16,185,129,.1);color:var(--success);border-color:rgba(16,185,129,.3)}
    blockquote{font-size:12.5px;color:var(--muted);border-left:3px solid var(--accent);
      padding:8px 14px;border-radius:4px;background:rgba(59,130,246,.05);font-style:italic;line-height:1.6}
    /* Table */
    .table-wrap{overflow-x:auto;border-radius:10px;border:1px solid var(--border);background:#090d16;flex:1}
    table{width:100%;border-collapse:collapse;font-size:12px}
    thead{position:sticky;top:0;background:#0d1321;z-index:1}
    th{padding:9px 12px;text-align:left;color:var(--muted);font-size:10px;font-weight:700;
      text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--border)}
    td{padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.04);color:var(--text);
      max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:rgba(255,255,255,.03)}
    /* Chart */
    .chart-wrap{height:320px;width:100%;position:relative;background:rgba(10,14,26,0.2);
      border-radius:12px;border:1px solid var(--border);padding:12px;overflow:hidden}
    .d3-tooltip{position:absolute;background:rgba(10,14,26,0.95);border:1px solid rgba(255,255,255,0.15);
      border-radius:6px;padding:8px 12px;color:#fff;font-size:11px;pointer-events:none;
      box-shadow:0 4px 12px rgba(0, 0, 0, 0.4);z-index:100;display:none;
      font-family:system-ui,sans-serif;line-height:1.4}
    /* Footer */
    footer{margin-top:64px;text-align:center;font-size:11px;color:var(--muted);opacity:.6}
    @media(max-width:640px){body{padding:24px 16px 60px}.card{padding:18px 16px 16px}}
  </style>
</head>
<body>
  <h1 class="page-title">${activeNb.name}</h1>
  <p class="page-meta">Exported ${new Date().toLocaleString()} · ${activeNb.cells.filter(c => c.queryResult).length} insights</p>
  <div class="grid">
    ${cellsHtml}
  </div>
  <footer>Generated by NivexQL</footer>

  <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <script>
    ${D3_RENDER_SCRIPT}

    document.addEventListener("DOMContentLoaded", () => {
      ${chartInitializations}
    });
  </script>
</body>
</html>`;

            const blob = new Blob([content], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${activeNb.name.replace(/\s+/g, '_')}_dashboard_${Date.now()}.html`;
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
          schema: state.schema,
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
          uiStyle: state.uiStyle,
          dashboardMode: state.dashboardMode,
        }),
      }
  )
);
