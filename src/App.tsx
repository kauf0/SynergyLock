import { useState, useEffect, useCallback } from "react";
import "./App.css";

const API_BASE = "https://api.deadlock-api.com/v1";
const ASSETS_BASE = "https://assets.deadlock-api.com/v2";

interface Hero {
  id: number;
  name: string;
  images: { icon_hero_card: string };
}

// Response shape from /v1/analytics/hero-comb-stats
interface HeroCombRaw {
  hero_ids: number[];
  wins: number;
  losses: number;
  matches: number;
}

// Normalized shape we work with internally
interface HeroComb {
  heroIds: number[];
  wins: number;
  matches: number;
  winrate: number;
}

// Badge = tier * 10 + subtier (0-6).
// We filter by tier only so we use tier*10 as min and tier*10+6 as max.
const RANKS = [
  { label: "All Ranks", min: 0,   max: 116 },
  { label: "Obscurus",  min: 0,   max: 6   },
  { label: "Initiate",  min: 10,  max: 16  },
  { label: "Seeker",    min: 20,  max: 26  },
  { label: "Alchemist", min: 30,  max: 36  },
  { label: "Arcanist",  min: 40,  max: 46  },
  { label: "Ritualist", min: 50,  max: 56  },
  { label: "Emissary",  min: 60,  max: 66  },
  { label: "Archon",    min: 70,  max: 76  },
  { label: "Oracle",    min: 80,  max: 86  },
  { label: "Phantom",   min: 90,  max: 96  },
  { label: "Ascendant", min: 100, max: 106 },
  { label: "Eternus",   min: 110, max: 116 },
];

function winrateColor(wr: number): string {
  if (wr >= 0.58) return "#4ade80";
  if (wr >= 0.54) return "#a3e635";
  if (wr >= 0.50) return "#facc15";
  return "#f87171";
}

export default function App() {
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Hero | null>(null);
  const [synergies, setSynergies] = useState<HeroComb[]>([]);
  const [rankIdx, setRankIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [heroesLoading, setHeroesLoading] = useState(true);

  useEffect(() => {
    fetch(`${ASSETS_BASE}/heroes?only_active=true`)
      .then((r) => r.json())
      .then((data: Hero[]) => setHeroes(data.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(console.error)
      .finally(() => setHeroesLoading(false));
  }, []);

  const fetchSynergies = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setSynergies([]);
    const rank = RANKS[rankIdx];
    try {
      const params = new URLSearchParams({
        min_matches: "100",
        min_average_badge: String(rank.min),
        max_average_badge: String(rank.max),
        include_hero_ids: String(selected.id),
        comb_size: "2",
      });
      const res = await fetch(`${API_BASE}/analytics/hero-comb-stats?${params}`);
      const raw: HeroCombRaw[] = await res.json();
      const result: HeroComb[] = raw
        .map((c) => ({
          heroIds: c.hero_ids,
          wins: c.wins,
          matches: c.matches,
          winrate: c.matches > 0 ? c.wins / c.matches : 0,
        }))
        .sort((a, b) => b.winrate - a.winrate)
        .slice(0, 15);
      setSynergies(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selected, rankIdx]);

  useEffect(() => { fetchSynergies(); }, [fetchSynergies]);

  const heroById = (id: number) => heroes.find((h) => h.id === id);
  const partnerId = (c: HeroComb) => c.heroIds.find((id) => id !== selected?.id) ?? c.heroIds[0];
  const filteredHeroes = heroes.filter((h) =>
    h.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app">
      <div className="header">
        <span className="header-title">Deadlock Synergy</span>
        <select
          className="rank-select"
          value={rankIdx}
          onChange={(e) => setRankIdx(Number(e.target.value))}
        >
          {RANKS.map((r, i) => (
            <option key={i} value={i}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="search-wrap">
        <input
          className="search-input"
          placeholder="Search hero..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {search && (
          <button className="clear-btn" onClick={() => setSearch("")}>x</button>
        )}
      </div>

      {/* Hero grid - shown when nothing selected or while searching */}
      {(!selected || search) && (
        <div className="hero-grid-wrap">
          {heroesLoading ? (
            <div className="status-msg">Loading heroes...</div>
          ) : (
            <div className="hero-grid">
              {filteredHeroes.map((hero) => (
                <button
                  key={hero.id}
                  className={`hero-card ${selected?.id === hero.id ? "active" : ""}`}
                  onClick={() => { setSelected(hero); setSearch(""); }}
                  title={hero.name}
                >
                  {hero.images?.icon_hero_card
                    ? <img src={hero.images.icon_hero_card} alt={hero.name} />
                    : <div className="hero-initial">{hero.name[0]}</div>
                  }
                  <span className="hero-name">{hero.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Synergy panel */}
      {selected && !search && (
        <div className="synergy-panel">
          <div className="selected-bar">
            <button className="back-btn" onClick={() => setSelected(null)}>← Back</button>
            {selected.images?.icon_hero_card && (
              <img src={selected.images.icon_hero_card} alt={selected.name} className="selected-icon" />
            )}
            <span className="selected-name">{selected.name}</span>
          </div>

          <div className="table-head">
            <span>Partner</span>
            <span>Win Rate</span>
            <span>Matches</span>
          </div>

          {loading ? (
            <div className="status-msg">Loading...</div>
          ) : synergies.length === 0 ? (
            <div className="status-msg">No data for this rank filter</div>
          ) : (
            <div className="synergy-list">
              {synergies.map((comb, i) => {
                const pid = partnerId(comb);
                const partner = heroById(pid);
                const wr = Math.round(comb.winrate * 100);
                const color = winrateColor(comb.winrate);
                return (
                  <div key={i} className="synergy-row">
                    <div className="partner-cell">
                      <span className="row-num">#{i + 1}</span>
                      {partner?.images?.icon_hero_card && (
                        <img src={partner.images.icon_hero_card} alt="" className="partner-icon" />
                      )}
                      <span className="partner-name">{partner?.name ?? `Hero ${pid}`}</span>
                    </div>
                    <div className="wr-cell">
                      <div className="wr-bar" style={{ width: `${wr}%`, background: color }} />
                      <span style={{ color }}>{wr}%</span>
                    </div>
                    <span className="matches-cell">{comb.matches.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
