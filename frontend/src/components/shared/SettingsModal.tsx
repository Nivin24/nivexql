import { useState, useEffect, useRef } from 'react';
import {
  X, Monitor, Code, BrainCircuit, Check,
  RefreshCw, ChevronDown, Loader2,
  XCircle, CheckCircle2
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { editorThemes } from '../../lib/editorThemes';
import { apiLlmStatus, apiLlmModels, apiSetLlmConfig } from '../../lib/api';

interface SettingsModalProps {
  onClose: () => void;
}

interface OllamaModel {
  name: string;
  size: number;
  modified: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'appearance' | 'editor' | 'llm'>('appearance');

  // Store bindings
  const appTheme = useAppStore(s => s.appTheme);
  const setAppTheme = useAppStore(s => s.setAppTheme);
  const uiStyle = useAppStore(s => s.uiStyle);
  const setUiStyle = useAppStore(s => s.setUiStyle);
  const uiTextSize = useAppStore(s => s.uiTextSize);
  const setUiTextSize = useAppStore(s => s.setUiTextSize);
  const editorTheme = useAppStore(s => s.editorTheme);
  const setEditorTheme = useAppStore(s => s.setEditorTheme);

  // LLM Store states
  const llmProvider = useAppStore(s => s.llmProvider);
  const llmEndpoint = useAppStore(s => s.llmEndpoint);
  const llmModel = useAppStore(s => s.llmModel);
  const llmApiKey = useAppStore(s => s.llmApiKey);
  const llmStatus = useAppStore(s => s.llmStatus);

  const setLlmProvider = useAppStore(s => s.setLlmProvider);
  const setLlmEndpoint = useAppStore(s => s.setLlmEndpoint);
  const setLlmModel = useAppStore(s => s.setLlmModel);
  const setLlmApiKey = useAppStore(s => s.setLlmApiKey);
  const setLlmStatus = useAppStore(s => s.setLlmStatus);

  // Local state for LLM config
  const [localProvider, setLocalProvider] = useState(llmProvider);
  const [localEndpoint, setLocalEndpoint] = useState(llmEndpoint);
  const [localModel, setLocalModel] = useState(llmModel);
  const [localApiKey, setLocalApiKey] = useState(llmApiKey);

  const [models, setModels] = useState<OllamaModel[]>([]);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showModelList, setShowModelList] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelList(false);
      }
    };
    if (showModelList) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModelList]);

  // Check connection helper
  const checkConnection = async () => {
    setChecking(true);
    setErrorMsg('');
    try {
      await apiSetLlmConfig(localProvider, localEndpoint, localModel, localApiKey);
      const data = await apiLlmStatus();
      setLlmStatus(data.status === 'ok' ? 'ok' : 'error');

      const { models: mdls } = await apiLlmModels();
      setModels(mdls);

      if (mdls.length && !mdls.find(m => m.name === localModel)) {
        setLocalModel(mdls[0].name);
      }
    } catch (err: unknown) {
      setLlmStatus('error');
      setErrorMsg((err as Error).message);
      setModels([]);
    } finally {
      setChecking(false);
    }
  };

  // Run LLM check when clicking the LLM tab or changing local provider
  useEffect(() => {
    if (activeTab === 'llm') {
      checkConnection();
    }
  }, [activeTab, localProvider]);

  const applyLlmConfig = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      await apiSetLlmConfig(localProvider, localEndpoint, localModel, localApiKey);
      setLlmProvider(localProvider);
      setLlmEndpoint(localEndpoint);
      setLlmModel(localModel);
      setLlmApiKey(localApiKey);
      onClose();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  };


  const StatusIcon = llmStatus === 'ok'
    ? CheckCircle2
    : llmStatus === 'error'
      ? XCircle
      : BrainCircuit;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-250" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-surface-card border border-surface-border shadow-2xl rounded-2xl flex flex-col h-[520px] animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between glass">
          <div>
            <h2 className="text-sm font-bold text-text-primary uppercase tracking-widest">Preferences</h2>
            <p className="text-[10px] text-text-muted mt-0.5">Customize interface styles and configure AI credentials</p>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost p-1.5 rounded-full hover:bg-surface-muted transition-colors text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content body split in side tabs & pane */}
        <div className="flex flex-1 min-h-0">
          {/* Tabs navigation list */}
          <div className="w-48 border-r border-surface-border/50 bg-surface-base/30 py-4 flex flex-col gap-1">
            <button
              onClick={() => setActiveTab('appearance')}
              className={`flex items-center gap-3 px-4 py-2.5 text-xs font-semibold transition-colors text-left border-l-2
                ${activeTab === 'appearance'
                  ? 'border-accent text-accent bg-accent/5'
                  : 'border-transparent text-text-muted hover:text-text-primary hover:bg-surface-muted/30'}`}
            >
              <Monitor className="w-4 h-4" />
              Appearance
            </button>
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-3 px-4 py-2.5 text-xs font-semibold transition-colors text-left border-l-2
                ${activeTab === 'editor'
                  ? 'border-accent text-accent bg-accent/5'
                  : 'border-transparent text-text-muted hover:text-text-primary hover:bg-surface-muted/30'}`}
            >
              <Code className="w-4 h-4" />
              Code Editor
            </button>
            <button
              onClick={() => setActiveTab('llm')}
              className={`flex items-center gap-3 px-4 py-2.5 text-xs font-semibold transition-colors text-left border-l-2
                ${activeTab === 'llm'
                  ? 'border-accent text-accent bg-accent/5'
                  : 'border-transparent text-text-muted hover:text-text-primary hover:bg-surface-muted/30'}`}
            >
              <BrainCircuit className="w-4 h-4" />
              AI Assistant
            </button>
          </div>

          {/* Active Pane panel */}
          <div className="flex-1 p-6 overflow-y-auto scrollbar-thin flex flex-col gap-6">
            {activeTab === 'appearance' && (
              <div className="flex flex-col gap-5 animate-in fade-in duration-200">
                {/* UI Style */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">UI Layout Style</label>
                  <div className="flex gap-2 p-1 bg-surface-base border border-surface-border rounded-xl">
                    <button
                      onClick={() => setUiStyle('classic')}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all
                        ${uiStyle === 'classic' ? 'bg-surface-hover text-text-primary shadow-sm border border-surface-border' : 'text-text-muted hover:text-text-primary border border-transparent'}`}
                    >
                      Classic Glass
                    </button>
                    <button
                      onClick={() => setUiStyle('liquid')}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all
                        ${uiStyle === 'liquid' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
                    >
                      Apple Liquid Glass
                    </button>
                  </div>
                  <p className="text-[10px] text-text-muted italic">Select Apple Liquid Glass for translucent, liquid-distorted panels and rounded buttons.</p>
                </div>

                {/* Application Theme */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">Interface Color Theme</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['dark', 'light', 'cosmic'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setAppTheme(t)}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all gap-1.5 capitalize
                          ${appTheme === t
                            ? 'border-accent bg-accent/5 font-semibold text-text-primary'
                            : 'border-surface-border bg-surface-base/50 text-text-muted hover:border-text-muted/30 hover:text-text-primary'}`}
                      >
                        <div className={`w-4 h-4 rounded-full border
                          ${t === 'dark' ? 'bg-[#0a0e1a] border-slate-700' : ''}
                          ${t === 'light' ? 'bg-[#f0f4ff] border-slate-300' : ''}
                          ${t === 'cosmic' ? 'bg-gradient-to-br from-black to-[#111847] border-[#172054]' : ''}`}
                        />
                        <span className="text-xs">{t}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Size */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">Interface Text Size</label>
                  <div className="flex gap-1 p-1 bg-surface-base border border-surface-border rounded-xl">
                    {(['xs', 'sm', 'base', 'lg'] as const).map(size => (
                      <button
                        key={size}
                        onClick={() => setUiTextSize(size)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all
                          ${uiTextSize === size ? 'bg-surface-hover text-text-primary border border-surface-border' : 'text-text-muted hover:text-text-primary border border-transparent'}`}
                      >
                        {size.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'editor' && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">Monaco Code Editor Theme</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {editorThemes.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setEditorTheme(t.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                        ${editorTheme === t.id
                          ? 'border-accent bg-accent/5 text-text-primary font-semibold'
                          : 'border-surface-border bg-surface-base/50 text-text-muted hover:border-text-muted/30 hover:text-text-primary'}`}
                    >
                      <div className="w-5 h-5 rounded-md border border-black/20 flex-shrink-0 shadow-inner" style={{ backgroundColor: t.color }} />
                      <span className="text-xs truncate">{t.label}</span>
                      {editorTheme === t.id && <Check className="w-3.5 h-3.5 text-accent ml-auto flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'llm' && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                {/* Provider */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">AI provider</label>
                  <div className="flex gap-1 p-1 bg-surface-base border border-surface-border rounded-xl">
                    {(['ollama', 'openai', 'gemini'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setLocalProvider(p)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all
                          ${localProvider === p ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Local endpoint vs API Keys */}
                {localProvider === 'ollama' ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">Ollama Local API Endpoint</label>
                    <div className="flex gap-2">
                      <input
                        value={localEndpoint}
                        onChange={e => setLocalEndpoint(e.target.value)}
                        className="flex-1 bg-surface-base border border-surface-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                        placeholder="http://localhost:11434"
                      />
                      <button
                        onClick={checkConnection}
                        disabled={checking}
                        className="btn-ghost border border-surface-border"
                        title="Test connection"
                      >
                        {checking
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <RefreshCw className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
                      {localProvider === 'openai' ? 'OpenAI API Key' : 'Gemini API Key'}
                    </label>
                    <input
                      type="password"
                      value={localApiKey}
                      onChange={e => setLocalApiKey(e.target.value)}
                      className="w-full bg-surface-base border border-surface-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                      placeholder="sk-..."
                    />
                  </div>
                )}

                {/* Model dropdown selection */}
                <div className="flex flex-col gap-1.5" ref={modelDropdownRef}>
                  <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">Active Model Selection</label>
                  <div className="relative">
                    <button
                      onClick={() => setShowModelList(s => !s)}
                      className="w-full flex items-center justify-between px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-xs text-text-primary hover:border-accent transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <BrainCircuit className="w-3.5 h-3.5 text-accent" />
                        <span className="font-mono truncate">{localModel}</span>
                      </div>
                      <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${showModelList ? 'rotate-180' : ''}`} />
                    </button>

                    {showModelList && (
                      <div className="absolute top-full mt-1 left-0 right-0 z-50 glass rounded-xl shadow-card overflow-hidden border border-surface-border max-h-40 overflow-y-auto scrollbar-thin">
                        {models.length > 0 ? models.map(m => (
                          <button
                            key={m.name}
                            onClick={() => { setLocalModel(m.name); setShowModelList(false); }}
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface-hover transition-colors text-left"
                            style={m.name === localModel ? { background: 'rgba(108,141,250,0.08)' } : {}}
                          >
                            <div className="flex items-center gap-2">
                              {m.name === localModel && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                              {m.name !== localModel && <div className="w-3.5" />}
                              <span className="text-xs font-mono text-text-primary">{m.name}</span>
                            </div>
                            <span className="text-[10px] text-text-muted">{formatBytes(m.size)}</span>
                          </button>
                        )) : (
                          <div className="px-3 py-2 text-xs text-text-muted italic text-center">No models found online</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Errors */}
                {errorMsg && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs text-danger" style={{ background: 'rgba(248,113,113,0.08)' }}>
                    <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                    <span className="break-all">{errorMsg}</span>
                  </div>
                )}

                {/* Apply config */}
                <button
                  onClick={applyLlmConfig}
                  disabled={saving || (localProvider === 'ollama' && llmStatus !== 'ok') || (!localApiKey && localProvider !== 'ollama')}
                  className="btn-primary justify-center w-full py-2.5 mt-2"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StatusIcon className="w-3.5 h-3.5" />}
                  {saving ? 'Applying Settings…' : 'Apply AI Settings'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
