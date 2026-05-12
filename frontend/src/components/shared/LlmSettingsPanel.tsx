import { useState, useEffect, useRef } from 'react';
import {
  BrainCircuit, CheckCircle2, XCircle, Loader2,
  RefreshCw, ChevronDown, Wifi, WifiOff,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { apiLlmStatus, apiLlmModels, apiSetLlmConfig } from '../../lib/api';

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

export default function LlmSettingsPanel() {
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

  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [localProvider, setLocalProvider] = useState(llmProvider);
  const [localEndpoint, setLocalEndpoint] = useState(llmEndpoint);
  const [localModel, setLocalModel] = useState(llmModel);
  const [localApiKey, setLocalApiKey] = useState(llmApiKey);
  
  const [showModelList, setShowModelList] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowModelList(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-check on open
  useEffect(() => {
    if (open) checkConnection();
  }, [open, localProvider]);

  const checkConnection = async () => {
    setChecking(true);
    setErrorMsg('');
    try {
      // Temporarily set config on backend to check status
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

  const applyConfig = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      await apiSetLlmConfig(localProvider, localEndpoint, localModel, localApiKey);
      setLlmProvider(localProvider);
      setLlmEndpoint(localEndpoint);
      setLlmModel(localModel);
      setLlmApiKey(localApiKey);
      setOpen(false);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Status indicator dot
  const statusColor = {
    unknown: '#4e5e87',
    ok: '#34d399',
    error: '#f87171',
  }[llmStatus];

  const StatusIcon = llmStatus === 'ok'
    ? CheckCircle2
    : llmStatus === 'error'
      ? XCircle
      : BrainCircuit;

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="btn-ghost"
        title="LLM Settings"
        style={{ gap: '6px' }}
      >
        <div className="relative">
          <BrainCircuit className="w-3.5 h-3.5" style={{ color: '#8b9cc4' }} />
          <div
            className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
            style={{ background: statusColor }}
          />
        </div>
        <span className="text-xs hidden sm:inline">
          {llmModel.split(':')[0]}
        </span>
        {llmStatus === 'ok'
          ? <Wifi className="w-3 h-3 text-success" />
          : llmStatus === 'error'
            ? <WifiOff className="w-3 h-3 text-danger" />
            : null}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 glass rounded-xl shadow-card"
          style={{ width: 340 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-text-primary">LLM Configuration</span>
            </div>
            <div className="flex items-center gap-1.5">
              {llmStatus === 'ok' && <span className="tag-success">Connected</span>}
              {llmStatus === 'error' && <span className="tag-danger">Offline</span>}
              {llmStatus === 'unknown' && <span className="tag-accent">Unknown</span>}
            </div>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* Provider Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                LLM Provider
              </label>
              <div className="flex gap-1 p-1 bg-surface-muted rounded-lg border border-surface-border">
                {(['ollama', 'openai', 'gemini'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setLocalProvider(p)}
                    className={`flex-1 py-1 rounded-md text-[11px] capitalize transition-all
                      ${localProvider === p ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditional Endpoint / API Key */}
            {localProvider === 'ollama' ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                  Ollama Endpoint
                </label>
                <div className="flex gap-2">
                  <input
                    value={localEndpoint}
                    onChange={e => setLocalEndpoint(e.target.value)}
                    className="flex-1 bg-surface-muted border border-surface-border rounded-md px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                    placeholder="http://localhost:11434"
                  />
                  <button
                    onClick={checkConnection}
                    disabled={checking}
                    className="btn-ghost"
                    style={{ padding: '6px 10px' }}
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
                <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                  {localProvider === 'openai' ? 'OpenAI API Key' : 'Gemini API Key'}
                </label>
                <input
                  type="password"
                  value={localApiKey}
                  onChange={e => setLocalApiKey(e.target.value)}
                  className="w-full bg-surface-muted border border-surface-border rounded-md px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                  placeholder="sk-..."
                />
              </div>
            )}

            {/* Model selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                Active Model
              </label>

              <div className="relative">
                <button
                  onClick={() => setShowModelList(s => !s)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-surface-muted border border-surface-border rounded-md text-xs text-text-primary hover:border-accent transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="w-3.5 h-3.5 text-accent" />
                    <span className="font-mono">{localModel}</span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${showModelList ? 'rotate-180' : ''}`} />
                </button>

                {showModelList && (
                  <div className="absolute top-full mt-1 left-0 right-0 z-10 glass rounded-lg shadow-card overflow-hidden border border-surface-border max-h-48 overflow-y-auto scrollbar-thin">
                    {models.length > 0 ? models.map(m => (
                      <button
                        key={m.name}
                        onClick={() => { setLocalModel(m.name); setShowModelList(false); }}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-hover transition-colors text-left"
                        style={m.name === localModel ? { background: 'rgba(108,141,250,0.08)' } : {}}
                      >
                        <div className="flex items-center gap-2">
                          {m.name === localModel && <CheckCircle2 className="w-3 h-3 text-accent flex-shrink-0" />}
                          {m.name !== localModel && <div className="w-3" />}
                          <span className="text-xs font-mono text-text-primary">{m.name}</span>
                        </div>
                        <span className="text-[10px] text-text-muted">{formatBytes(m.size)}</span>
                      </button>
                    )) : (
                       <div className="px-3 py-2 text-xs text-text-muted italic">No models found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Status / error message */}
            {errorMsg && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-md text-xs text-danger" style={{ background: 'rgba(248,113,113,0.08)' }}>
                <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                <span className="break-all">{errorMsg}</span>
              </div>
            )}

            {/* Save button */}
            <button
              onClick={applyConfig}
              disabled={saving || (localProvider === 'ollama' && llmStatus !== 'ok') || (!localApiKey && localProvider !== 'ollama')}
              className="btn-primary justify-center"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StatusIcon className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : 'Apply Configuration'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
