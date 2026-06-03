import { useState, useEffect } from 'react';

type EngineInfo = {
  id: string;
  name: string;
  requiresApiKey: boolean;
  supportedLanguages: string[];
};

interface Settings {
  primaryEngine: string;
  targetLang: string;
  fallbackEngines: string[];
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      background: '#f8f9fa', borderRadius: 8, padding: '10px 14px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#667eea' }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 10, color: '#999' }}>{sub}</div>
    </div>
  );
}

export default function App() {
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [settings, setSettings] = useState<Settings>({
    primaryEngine: 'deepseek',
    targetLang: 'zh-CN',
    fallbackEngines: ['google'],
  });
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  interface CacheStats {
    entries: number;
    totalFragments: number;
    cacheHits: number;
    hitRate: number;
    apiCalls: number;
    avgLatencyMs: number;
  }

  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);

  // 加载
  useEffect(() => {
    browser.runtime.sendMessage({ type: 'GET_ENGINES' }).then((res: unknown) => {
      const data = res as { engines: EngineInfo[] };
      if (data?.engines) setEngines(data.engines);
    });

    browser.runtime.sendMessage({ type: 'GET_SETTINGS' }).then((res: unknown) => {
      const data = res as { settings: Settings };
      if (data?.settings) {
        setSettings(data.settings);
      }
    });

    // 缓存统计
    refreshStats();

    // 从 storage 直接读 API Keys（因为 GET_SETTINGS 不含 keys）
    browser.runtime.sendMessage({ type: 'GET_APIKEYS' }).then((res: unknown) => {
      const data = res as { keys: Record<string, string> };
      if (data?.keys) setApiKeys(data.keys);
    });
  }, []);

  const refreshStats = () => {
    browser.runtime.sendMessage({ type: 'GET_CACHE_STATS' }).then((res: unknown) => {
      const data = res as CacheStats;
      if (typeof data?.entries === 'number') setCacheStats(data);
    }).catch(() => {});
  };

  // 保存设置
  const save = () => {
    browser.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: settings,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // 保存 API Key
  const saveKey = (engineId: string, key: string) => {
    setApiKeys((prev) => ({ ...prev, [engineId]: key }));
    browser.runtime.sendMessage({
      type: 'SET_APIKEY',
      payload: { engineId, key },
    });
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <h1>⚙ TransFlow 设置</h1>

      {/* 主力引擎 */}
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>主力翻译引擎</h2>
        <select
          value={settings.primaryEngine}
          onChange={(e) => setSettings({ ...settings, primaryEngine: e.target.value })}
          style={selectStyle}
        >
          {engines.map((e) => (
            <option key={e.id} value={e.id}>{e.name}{e.id === 'deepseek' ? '（推荐）' : ''}</option>
          ))}
        </select>
      </section>

      {/* 默认目标语言 */}
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>默认目标语言</h2>
        <select
          value={settings.targetLang}
          onChange={(e) => setSettings({ ...settings, targetLang: e.target.value })}
          style={selectStyle}
        >
          <option value="zh-CN">中文（简体）</option>
          <option value="zh-TW">中文（繁體）</option>
          <option value="en">English</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="es">Español</option>
        </select>
      </section>

      {/* API Key 管理 */}
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>API Key 管理</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
          🔒 API Key 仅存储在你的浏览器本地，翻译请求直连引擎 API，<strong>不经过任何第三方服务器</strong>。
        </p>
        {engines.filter((e) => e.requiresApiKey).map((e) => (
          <div key={e.id} style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
              {e.name}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                value={apiKeys[e.id] || ''}
                onChange={(ev) => saveKey(e.id, ev.target.value)}
                placeholder={e.id === 'deepseek' ? 'sk-...' : e.id === 'openai' ? 'sk-...' : e.id === 'claude' ? 'sk-ant-...' : '输入 API Key'}
                style={inputStyle}
              />
              <span style={{ fontSize: 12, color: apiKeys[e.id] ? '#1a7f3f' : '#999', alignSelf: 'center', minWidth: 50 }}>
                {apiKeys[e.id] ? '✅ 已设置' : '未设置'}
              </span>
            </div>
            {e.id === 'deepseek' && (
              <p style={{ fontSize: 11, color: '#999', margin: '4px 0 0' }}>
                💰 推荐：DeepSeek 性价比最高，约 ¥2/百万 token。<a href="https://platform.deepseek.com/api_keys" target="_blank" style={{ color: '#667eea' }}>获取 Key →</a>
              </p>
            )}
          </div>
        ))}
      </section>

      {/* 缓存统计 */}
      {cacheStats && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16 }}>📊 缓存统计</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <StatCard label="缓存条目" value={cacheStats.entries.toString()} sub="条" />
            <StatCard label="命中率" value={cacheStats.hitRate + '%'} sub={cacheStats.cacheHits + '/' + cacheStats.totalFragments} />
            <StatCard label="API 调用" value={cacheStats.apiCalls.toString()} sub="次" />
            <StatCard label="平均延迟" value={cacheStats.avgLatencyMs + 'ms'} sub={'处理 ' + cacheStats.totalFragments + ' 片段'} />
          </div>
          <button onClick={refreshStats} style={{ ...btnStyle, marginTop: 8, fontSize: 12, padding: '6px 16px', background: '#f0f0f0', color: '#555' }}>
            🔄 刷新统计
          </button>
          <p style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
            ⚠ 统计仅在当前浏览器会话有效。重启浏览器或重新加载扩展后计数归零。
          </p>
        </section>
      )}

      {/* 保存 */}
      <div style={{ marginTop: 32 }}>
        <button onClick={save} style={btnStyle}>
          {saved ? '✅ 已保存' : '💾 保存设置'}
        </button>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #ddd',
  fontSize: 14,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #ddd',
  fontSize: 13,
  fontFamily: 'monospace',
};

const btnStyle: React.CSSProperties = {
  padding: '10px 24px',
  borderRadius: 6,
  border: 'none',
  background: 'linear-gradient(135deg, #667eea, #764ba2)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
