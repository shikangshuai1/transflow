import { useState, useEffect } from 'react';
import {
  LANGUAGES,
  QUICK_TARGET_LANGS,
  getLanguageByCode,
} from '../../src/lib/constants';
import './App.css';

type EngineInfo = {
  id: string;
  name: string;
  requiresApiKey: boolean;
  supportedLanguages: string[];
};

type Tab = 'main' | 'settings' | 'stats';

function App() {
  // ⚠️ 所有 hooks 必须在这里，不能在条件分支之后
  const [tab, setTab] = useState<Tab>('main');
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [primaryEngine, setPrimaryEngine] = useState('deepseek');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [cacheStats, setStats] = useState<Record<string, number> | null>(null);
  const [testing, setTesting] = useState<Record<string, boolean | null>>({});

  const testKey = async (engineId: string) => {
    const key = apiKeys[engineId];
    if (!key) return;
    setTesting((p) => ({ ...p, [engineId]: null })); // null = testing
    try {
      const r = await browser.runtime.sendMessage({ type: 'TEST_APIKEY', payload: { engineId, key } }) as { valid: boolean };
      setTesting((p) => ({ ...p, [engineId]: r?.valid === true }));
    } catch {
      setTesting((p) => ({ ...p, [engineId]: false }));
    }
  };

  // 加载引擎列表 + 设置 + API Keys
  useEffect(() => {
    browser.runtime.sendMessage({ type: 'GET_ENGINES' }).then((r: unknown) => {
      const d = r as { engines: EngineInfo[] };
      if (d?.engines) setEngines(d.engines);
    });
    browser.runtime.sendMessage({ type: 'GET_SETTINGS' }).then((r: unknown) => {
      const d = r as { settings: { targetLang: string; primaryEngine: string } };
      if (d?.settings?.targetLang) setTargetLang(d.settings.targetLang);
      if (d?.settings?.primaryEngine) setPrimaryEngine(d.settings.primaryEngine);
    });
    browser.runtime.sendMessage({ type: 'GET_APIKEYS' }).then((r: unknown) => {
      const d = r as { keys: Record<string, string> };
      if (d?.keys) setApiKeys(d.keys);
    });
  }, []);

  // 切换到统计页时加载数据
  useEffect(() => {
    if (tab !== 'stats') return;
    browser.runtime.sendMessage({ type: 'GET_CACHE_STATS' }).then((r) => {
      if (r && typeof r === 'object' && 'entries' in r) setStats(r as Record<string, number>);
    }).catch(() => {});
  }, [tab]);

  const sendToTab = async (type: string, payload: Record<string, unknown> = {}) => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (tabId) {
      browser.tabs.sendMessage(tabId, { type, payload })
        .then(() => window.close())
        .catch(() => window.close());
    } else window.close();
  };

  const saveSettings = () => {
    browser.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: { targetLang, primaryEngine },
    }).catch(() => {});
  };

  const saveKey = (id: string, key: string) => {
    const next = { ...apiKeys, [id]: key };
    setApiKeys(next);
    browser.runtime.sendMessage({ type: 'SET_APIKEY', payload: { engineId: id, key } }).catch(() => {});
  };

  // ---- 主页 ----
  if (tab === 'main') {
    return (
      <div className="popup">
        <header className="popup-header">
          <h1>🌐 TransFlow</h1>
          <span className="version">v0.1.0</span>
        </header>

        <section className="section">
          <label className="label">目标语言</label>
          <select className="select" value={targetLang} onChange={(e) => { setTargetLang(e.target.value); saveSettings(); }}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.nativeName}</option>)}
          </select>
          <div className="quick-langs">
            {QUICK_TARGET_LANGS.map((code) => {
              const lang = getLanguageByCode(code);
              return (
                <button key={code} className={`chip ${targetLang === code ? 'active' : ''}`} onClick={() => { setTargetLang(code); saveSettings(); }}>
                  {lang?.nativeName ?? code}
                </button>
              );
            })}
          </div>
        </section>

        <section className="section actions">
          <button className="btn primary" onClick={() => sendToTab('TRANSLATE_PAGE', { targetLang })}>
            🔄 翻译此页面
          </button>
          <button className="btn secondary" onClick={() => sendToTab('REVERT_PAGE')}>
            ↩ 还原原文
          </button>
          <span className="hint">源语言: 自动检测 · 目标: {getLanguageByCode(targetLang)?.nativeName ?? targetLang}</span>
        </section>

        <section className="section engines">
          <h2 className="section-title">翻译引擎</h2>
          <ul className="engine-list">
            {engines.slice(0, 5).map((e) => (
              <li key={e.id} className="engine-item">
                <span className="engine-name">{e.name}</span>
                <span className={`engine-badge ${e.requiresApiKey ? (apiKeys[e.id] ? 'ready' : 'needs-key') : 'free'}`}>
                  {e.requiresApiKey ? (apiKeys[e.id] ? '✅ 已配置' : '🔑 需 Key') : '🆓 免费'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <footer className="popup-footer">
          <button className="btn link" onClick={() => setTab('settings')}>⚙ 设置</button>
          <button className="btn link" onClick={() => setTab('stats')}>📊 统计</button>
        </footer>
      </div>
    );
  }

  // ---- 设置页 ----
  if (tab === 'settings') {
    return (
      <div className="popup" style={{ maxHeight: 480, overflowY: 'auto' }}>
        <header className="popup-header">
          <h1>⚙ 设置</h1>
          <button className="back-btn" onClick={() => setTab('main')}>← 返回</button>
        </header>

        <section className="section">
          <h2 className="section-title">主力引擎</h2>
          <select className="select" value={primaryEngine} onChange={(e) => { setPrimaryEngine(e.target.value); saveSettings(); }}>
            {engines.map((e) => <option key={e.id} value={e.id}>{e.name}{e.id === 'deepseek' ? '（推荐）' : ''}</option>)}
          </select>
        </section>

        <section className="section">
          <h2 className="section-title">默认目标语言</h2>
          <select className="select" value={targetLang} onChange={(e) => { setTargetLang(e.target.value); saveSettings(); }}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.nativeName}</option>)}
          </select>
        </section>

        <section className="section">
          <h2 className="section-title">API Key</h2>
          <p className="privacy-note">🔒 Key 仅存本地，直连引擎 API，不经过第三方服务器。</p>
          {engines.filter((e) => e.requiresApiKey).map((e) => {
            const t = testing[e.id];
            return (
              <div key={e.id} className="apikey-row">
                <label className="apikey-label">{e.name}</label>
                <input type="password" className="apikey-input" value={apiKeys[e.id] || ''}
                  onChange={(ev) => saveKey(e.id, ev.target.value)}
                  placeholder={e.id === 'deepseek' ? 'sk-...' : e.id === 'openai' ? 'sk-...' : '输入 Key'} />
                {apiKeys[e.id] && (
                  <span className={`test-link ${t === null ? 'testing' : t === true ? 'ok' : t === false ? 'fail' : ''}`}
                    onClick={() => t === null ? null : testKey(e.id)}>
                    {t === null ? '⏳ 检测中' : t === true ? '✅ 有效' : t === false ? '❌ 无效' : '测试'}
                  </span>
                )}
              </div>
            );
          })}
        </section>
      </div>
    );
  }

  // ---- 统计页 ----
  const refreshStats = () => {
    browser.runtime.sendMessage({ type: 'GET_CACHE_STATS' }).then((r) => {
      if (r && typeof r === 'object' && 'entries' in r) setStats(r as Record<string, number>);
    }).catch(() => {});
  };

  return (
    <div className="popup">
      <header className="popup-header">
        <h1>📊 统计</h1>
        <button className="back-btn" onClick={() => setTab('main')}>← 返回</button>
      </header>

      <section className="section">
        {cacheStats ? (
          <>
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-val">{cacheStats.entries}</div><div className="stat-lbl">缓存条目</div><div className="stat-sub">条</div></div>
              <div className="stat-card"><div className="stat-val">{cacheStats.hitRate}%</div><div className="stat-lbl">命中率</div><div className="stat-sub">{cacheStats.cacheHits}/{cacheStats.totalFragments}</div></div>
              <div className="stat-card"><div className="stat-val">{cacheStats.apiCalls}</div><div className="stat-lbl">API 调用</div><div className="stat-sub">次</div></div>
              <div className="stat-card"><div className="stat-val">{cacheStats.avgLatencyMs}ms</div><div className="stat-lbl">平均延迟</div><div className="stat-sub">{cacheStats.totalFragments} 片段</div></div>
            </div>
            <button className="btn secondary" style={{ marginTop: 10, fontSize: 12, padding: '6px 12px' }} onClick={refreshStats}>🔄 刷新</button>
          </>
        ) : (
          <p style={{ fontSize: 13, color: '#999', textAlign: 'center', padding: 20 }}>加载中...</p>
        )}
        <p className="stat-note">⚠ 统计仅在当前会话有效，重启浏览器后归零。</p>
      </section>
    </div>
  );
}

export default App;
