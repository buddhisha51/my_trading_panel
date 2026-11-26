import { ExternalLink, RefreshCw, Search } from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState } from 'react';
import { tauriBridge } from '../../services/tauriBridge';
import { useMarketStore } from '../../stores/marketStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { NewsCategory } from '../../types/market';
import { evaluateFeedResilience, parseUtcIso } from '../../utils/calendarAlerts';

export function NewsFeedWidget() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const news = useMarketStore((s) => s.news);
  const metadata = useMarketStore((s) => s.metadata);
  const syncing = useMarketStore((s) => s.syncing);
  const loadMarketData = useMarketStore((s) => s.loadMarketData);
  const refreshMarketSync = useMarketStore((s) => s.refreshMarketSync);

  const [query, setQuery] = useState('');

  useEffect(() => {
    void loadMarketData();
  }, [loadMarketData]);

  const toggleCategory = (cat: NewsCategory) => {
    const active = settings.newsCategories.includes(cat);
    const next = active
      ? settings.newsCategories.filter((c) => c !== cat)
      : [...settings.newsCategories, cat];
    void updateSettings({ newsCategories: next });
  };

  const filteredNews = useMemo(() => {
    const catSet = new Set(settings.newsCategories);
    const q = query.trim().toLowerCase();
    return news.filter((item) => {
      if (catSet.size > 0 && !catSet.has(item.category)) return false;
      if (q) {
        const hay = `${item.title} ${item.sourceName} ${item.relatedCurrencies.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [news, query, settings.newsCategories]);

  const resilience = useMemo(
    () =>
      evaluateFeedResilience(
        metadata.filter((m) => m.provider !== 'faireconomy'),
        null,
        news.length > 0,
        DateTime.utc(),
      ),
    [metadata, news.length],
  );

  return (
    <div className="space-y-2 text-[11px]">
      {/* Category Chips + Refresh */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1">
          {(['forex', 'crypto', 'macro'] as NewsCategory[]).map((cat) => {
            const active = settings.newsCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`rounded border px-2 py-0.5 text-[10px] font-medium capitalize transition-colors ${
                  active
                    ? 'border-blue-500/60 bg-blue-500/20 text-blue-300'
                    : 'border-slate-800 bg-slate-950/60 text-slate-500 hover:text-slate-300'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={syncing}
          onClick={() => void refreshMarketSync(true)}
          title="Refresh news feeds via Rust backend"
          className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Headline Filter Input */}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter headlines or currency..."
          className="w-full rounded border border-slate-800 bg-slate-950 py-1 pr-2 pl-6 text-[10px] text-slate-100 placeholder:text-slate-600"
        />
      </div>

      {resilience.label && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
          {resilience.label}
        </div>
      )}

      {/* Headlines Feed */}
      {filteredNews.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 px-3 py-3 text-center text-[10px] text-slate-500">
          No cached headlines yet. Feeds sync automatically in the background when online.
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredNews.slice(0, 40).map((item) => {
            const pub = parseUtcIso(item.publishedAt);
            const rel = pub.isValid ? pub.toRelative() : '';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => void tauriBridge.openExternalUrl(item.url)}
                className="group block w-full rounded border border-slate-800 bg-slate-950/75 p-2 text-left transition-colors hover:border-slate-700 hover:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-1.5">
                  <span className="line-clamp-2 text-[11px] font-medium leading-snug text-slate-100 group-hover:text-blue-300">
                    {item.title}
                  </span>
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-slate-600 group-hover:text-blue-400" />
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-slate-400">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-medium text-slate-300">
                    {item.sourceName}
                  </span>
                  <span className="uppercase text-slate-500">{item.category}</span>
                  {item.relatedCurrencies.slice(0, 3).map((cur) => (
                    <span
                      key={cur}
                      className="rounded bg-blue-500/15 px-1 py-0.5 font-mono text-blue-300"
                    >
                      {cur}
                    </span>
                  ))}
                  {rel && <span className="ml-auto text-slate-500">{rel}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
