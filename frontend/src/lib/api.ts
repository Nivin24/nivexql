const BASE = 'http://localhost:8081';

export async function apiConnectServer(cfg: {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  dialect: string;
  sqlite_path?: string;
  use_ssh?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_user?: string;
  ssh_password?: string;
  ssh_key_path?: string;
}): Promise<{ databases: string[] }> {
  const res = await fetch(`${BASE}/api/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Connection failed' }));
    throw new Error(err.detail ?? 'Connection failed');
  }
  return res.json();
}

export async function apiSearchDatabases(search: string): Promise<{ databases: string[] }> {
  const res = await fetch(`${BASE}/api/databases?search=${encodeURIComponent(search)}`);
  if (!res.ok) throw new Error('Failed to fetch databases');
  return res.json();
}

export async function apiSelectDatabase(database: string): Promise<{
  tables: { name: string; columns: { name: string; type: string }[] }[];
}> {
  const res = await fetch(`${BASE}/api/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ database }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to load database' }));
    throw new Error(err.detail ?? 'Failed to load database');
  }
  return res.json();
}

export async function apiQuery(query: string) {
  const res = await fetch(`${BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: query }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail ?? 'Query failed');
  }
  return res.json() as Promise<{ columns: string[]; rows: Record<string, unknown>[]; execution_ms: number }>;
}

export async function apiGenerateSql(prompt: string, schema: unknown, context: string = "", chatHistory?: any[]) {
  const res = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, db_schema: schema, context, chat_history: chatHistory }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ sql: string; suggested_name?: string; suggested_viz?: string }>;
}

export async function apiFixSql(prompt: string, sql: string, error: string, schema: unknown, context: string = "") {
  const res = await fetch(`${BASE}/api/generate/fix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, sql, error, db_schema: schema, context }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ sql: string }>;
}

export async function apiAnalyzeResults(prompt: string, columns: string[], rows: any[]) {
  const res = await fetch(`${BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, columns, results: rows }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ insights: string }>;
}

export async function apiGenerateFollowUps(prompt: string, columns: string[], rows: any[]) {
  const res = await fetch(`${BASE}/api/followups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, columns, results: rows.slice(0, 20) }),
  });
  if (!res.ok) return { suggestions: [] };
  return res.json() as Promise<{ suggestions: string[] }>;
}

export async function apiFavorites(): Promise<{ queries: string[] }> {
  const res = await fetch(`${BASE}/api/favorites`);
  if (!res.ok) return { queries: [] };
  return res.json();
}

export async function apiLlmStatus(): Promise<{
  status: string; provider: string; endpoint?: string; models: string[];
}> {
  const res = await fetch(`${BASE}/api/llm/status`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiLlmModels(): Promise<{
  models: { name: string; size: number; modified: string }[];
}> {
  const res = await fetch(`${BASE}/api/llm/models`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiSetLlmConfig(provider: string, endpoint: string, model: string, api_key: string) {
  const res = await fetch(`${BASE}/api/llm/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, endpoint, model, api_key }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
