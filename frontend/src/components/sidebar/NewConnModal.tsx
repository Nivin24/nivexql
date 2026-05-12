import React, { useState } from 'react';
import { Database, X, Loader2, Search, ChevronRight } from 'lucide-react';
import { useAppStore, type ConnectionConfig } from '../../store/useAppStore';
import { apiConnectServer, apiSelectDatabase } from '../../lib/api';

interface Props {
  onClose: () => void;
}

function DatabaseSelector({ initialDatabases, onSelect, loading }: { initialDatabases: string[], onSelect: (db: string) => void, loading: boolean }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState(initialDatabases);

  const handleSearch = (val: string) => {
    setSearch(val);
    const filtered = initialDatabases.filter(d => d.toLowerCase().includes(val.toLowerCase()));
    setResults(filtered);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 bg-surface-muted border border-surface-border rounded-md px-3 py-1.5">
        <Search className="w-3.5 h-3.5 text-text-muted" />
        <input
          autoFocus
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search databases..."
          className="flex-1 bg-transparent text-xs text-text-primary focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto scrollbar-thin">
        {results.map(db => (
          <button
            key={db}
            onClick={() => onSelect(db)}
            disabled={loading}
            className="group flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-surface-hover text-left transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-accent flex-shrink-0" />
            <span className="text-xs text-text-primary truncate flex-1">{db}</span>
            {loading ? <Loader2 className="w-3 h-3 animate-spin text-accent" /> : <ChevronRight className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NewConnModal({ onClose }: Props) {
  const addConnection = useAppStore(s => s.addConnection);
  const setActiveConnection = useAppStore(s => s.setActiveConnection);
  const setSchema = useAppStore(s => s.setSchema);

  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    label: '', host: 'localhost', port: 5432,
    user: 'user', password: '', database: '',
    dialect: 'postgresql' as ConnectionConfig['dialect'],
    sqlite_path: '',
  });
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectingDb, setSelectingDb] = useState(false);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { databases: dbs } = await apiConnectServer(form);
      setDatabases(dbs);
      if (form.dialect === 'sqlite') {
          handleSelectDb(form.sqlite_path);
          return;
      }
      setStep(2);
    } catch (err: any) {
      setError(err.message ?? 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDb = async (database: string) => {
    setError('');
    setSelectingDb(true);
    try {
      const { tables } = await apiSelectDatabase(database);
      const newConn: ConnectionConfig = {
        ...form,
        id: Math.random().toString(36).substring(2, 9),
        database,
        label: form.label || `${form.dialect}://${form.host}:${form.port}/${database}`
      };
      addConnection(newConn);
      setActiveConnection(newConn.id);
      setSchema(tables);
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to load tables');
    } finally {
      setSelectingDb(false);
    }
  };

  const field = (key: keyof typeof form, label: string, type = 'text') => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={form[key] as string}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? +e.target.value : e.target.value }))}
        className="bg-surface-muted border border-surface-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent transition-colors"
        placeholder={key === 'password' ? '(Optional)' : ''}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-6">
      <div className="glass rounded-2xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/20 rounded-lg"><Database className="w-5 h-5 text-accent" /></div>
            <h2 className="text-lg font-bold text-text-primary">{step === 1 ? 'Connect to Server' : 'Select Database'}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>

        {step === 1 ? (
          <form onSubmit={handleConnect} className="flex flex-col gap-4">
            {field('label', 'Connection Name')}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Dialect</label>
              <select
                className="bg-surface-muted border border-surface-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
                value={form.dialect}
                onChange={e => {
                  const d = e.target.value as any;
                  setForm(f => ({ 
                    ...f, 
                    dialect: d, 
                    port: d === 'postgresql' ? 5432 : (d === 'mysql' ? 3306 : f.port),
                    user: d === 'postgresql' ? 'user' : (d === 'mysql' ? 'root' : f.user)
                  }));
                }}
              >
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL</option>
                <option value="sqlite">SQLite</option>
              </select>
            </div>
            {form.dialect === 'sqlite' ? field('sqlite_path', 'File Path') : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">{field('host', 'Host')}</div>
                  <div>{field('port', 'Port', 'number')}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {field('user', 'Username')}
                  {field('password', 'Password', 'password')}
                </div>
              </>
            )}

            {error && <div className="text-[10px] text-danger bg-danger/10 p-3 rounded-lg border border-danger/20">{error}</div>}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
            </button>
          </form>
        ) : (
          <>
            <DatabaseSelector 
              initialDatabases={databases} 
              onSelect={handleSelectDb} 
              loading={selectingDb} 
            />
            {error && <div className="text-[10px] text-danger bg-danger/10 p-3 rounded-lg border border-danger/20 mt-4">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
