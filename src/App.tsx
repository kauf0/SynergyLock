import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

const API_DIRECT = "https://api.deadlock-api.com/v1";
const API_PROXY = "https://api.pilgrim-realm.ru:8443/v1";
const ASSETS_BASE = "https://assets.deadlock-api.com/v2";
const TIMEOUT_MS = 2200;

const MAX_PARTY = 6;

interface Hero {
  id: number;
  name: string;
  images: { icon_hero_card: string };
}

interface HeroCombRaw {
  hero_ids: number[];
  wins: number;
  losses: number;
  matches: number;
}

interface HeroComb {
  heroIds: number[];
  wins: number;
  matches: number;
  winrate: number;
}

const RANKS = [
  { label: "Obscurus",  tier: 0  },
  { label: "Initiate",  tier: 1  },
  { label: "Seeker",    tier: 2  },
  { label: "Alchemist", tier: 3  },
  { label: "Arcanist",  tier: 4  },
  { label: "Ritualist", tier: 5  },
  { label: "Emissary",  tier: 6  },
  { label: "Archon",    tier: 7  },
  { label: "Oracle",    tier: 8  },
  { label: "Phantom",   tier: 9  },
  { label: "Ascendant", tier: 10 },
  { label: "Eternus",   tier: 11 },
];

function tierToBadge(tier: number, end = false): number {
  return end ? tier * 10 + 6 : tier * 10;
}

function winrateColor(wr: number): string {
  if (wr >= 0.58) return "#4ade80";
  if (wr >= 0.54) return "#a3e635";
  if (wr >= 0.50) return "#facc15";
  return "#f87171";
}

async function apiFetch(path: string, retries = 2): Promise<Response> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${API_DIRECT}${path}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res;
  } catch {
    try {
      const res = await fetch(`${API_PROXY}${path}`);
      if (!res.ok) throw new Error(`proxy status ${res.status}`);
      return res;
    } catch {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return apiFetch(path, retries - 1);
      }
      throw new Error("all retries failed");
    }
  }
}

async function fetchCombs(
  partyIds: number[],
  combSize: number,
  rankFrom: number,
  rankTo: number
): Promise<HeroCombRaw[]> {
  const params = new URLSearchParams({
    min_matches: "100",
    min_average_badge: String(tierToBadge(RANKS[rankFrom].tier)),
    max_average_badge: String(tierToBadge(RANKS[rankTo].tier, true)),
    include_hero_ids: partyIds.join(","),
    comb_size: String(combSize),
  });
  const res = await apiFetch(`/analytics/hero-comb-stats?${params}`);
  return res.json();
}

function mergeCombs(raw: HeroCombRaw[], partyIds: number[]): HeroComb[] {
  const merged = new Map<string, HeroComb>();
  for (const c of raw) {
    if (!partyIds.every((id) => c.hero_ids.includes(id))) continue;
    const key = [...c.hero_ids].sort((a, b) => a - b).join("-");
    const existing = merged.get(key);
    if (existing) {
      existing.wins += c.wins;
      existing.matches += c.matches;
      existing.winrate = existing.wins / existing.matches;
    } else {
      merged.set(key, {
        heroIds: c.hero_ids,
        wins: c.wins,
        matches: c.matches,
        winrate: c.matches > 0 ? c.wins / c.matches : 0,
      });
    }
  }
  return [...merged.values()];
}

export default function App() {
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [search, setSearch] = useState("");
  const [party, setParty] = useState<Hero[]>([]);
  const [rankFrom, setRankFrom] = useState(0);
  const [rankTo, setRankTo] = useState(RANKS.length - 1);

  const [partyWr, setPartyWr] = useState<HeroComb | null>(null);
  const [partyWrLoading, setPartyWrLoading] = useState(false);

  const [suggestions, setSuggestions] = useState<HeroComb[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const [heroesLoading, setHeroesLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${ASSETS_BASE}/heroes?only_active=true`)
      .then((r) => r.json())
      .then((data: Hero[]) => setHeroes(data.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(console.error)
      .finally(() => setHeroesLoading(false));
  }, []);

  const fetchPartyWr = useCallback(async () => {
    if (party.length < 2) { setPartyWr(null); return; }
    setPartyWrLoading(true);
    setPartyWr(null);
    try {
      const partyIds = party.map((h) => h.id);
      const raw = await fetchCombs(partyIds, party.length, rankFrom, rankTo);
      const combs = mergeCombs(raw, partyIds);
      const exact = combs.find(
        (c) => c.heroIds.length === party.length &&
          partyIds.every((id) => c.heroIds.includes(id))
      ) ?? combs.sort((a, b) => b.matches - a.matches)[0] ?? null;
      setPartyWr(exact);
    } catch (e) {
      console.error(e);
    } finally {
      setPartyWrLoading(false);
    }
  }, [party, rankFrom, rankTo]);

  useEffect(() => { fetchPartyWr(); }, [fetchPartyWr]);

  const fetchSuggestions = useCallback(async () => {
    if (party.length === 0 || party.length >= MAX_PARTY) {
      setSuggestions([]);
      return;
    }
    setSuggestLoading(true);
    setSuggestions([]);
    try {
      const partyIds = party.map((h) => h.id);
      const raw = await fetchCombs(partyIds, party.length + 1, rankFrom, rankTo);
      const combs = mergeCombs(raw, partyIds)
        .sort((a, b) => b.winrate - a.winrate)
        .slice(0, 15);
      setSuggestions(combs);
    } catch (e) {
      console.error(e);
    } finally {
      setSuggestLoading(false);
    }
  }, [party, rankFrom, rankTo]);

  useEffect(() => {
    if (panelOpen) fetchSuggestions();
  }, [panelOpen, fetchSuggestions]);

  function toggleHero(hero: Hero) {
    setParty((prev) => {
      const inParty = prev.find((h) => h.id === hero.id);
      if (inParty) return prev.filter((h) => h.id !== hero.id);
      if (prev.length >= MAX_PARTY) return prev;
      return [...prev, hero];
    });
  }

  function handleRankFrom(idx: number) {
    setRankFrom(idx);
    if (idx > rankTo) setRankTo(idx);
  }

  function handleRankTo(idx: number) {
    setRankTo(idx);
    if (idx < rankFrom) setRankFrom(idx);
  }

  const heroById = (id: number) => heroes.find((h) => h.id === id);
  const suggestionId = (c: HeroComb) =>
    c.heroIds.find((id) => !party.some((h) => h.id === id));

  const filteredHeroes = heroes.filter((h) =>
    h.name.toLowerCase().includes(search.toLowerCase())
  );

  const partyFull = party.length >= MAX_PARTY;

  return (
    <div className="app">
      <div className="rank-range">
        <span className="rank-range-label">Rank</span>
        <select
          className="rank-select"
          value={rankFrom}
          onChange={(e) => handleRankFrom(Number(e.target.value))}
        >
          {RANKS.map((r, i) => (
            <option key={i} value={i}>{r.label}</option>
          ))}
        </select>
        <span className="rank-range-sep">–</span>
        <select
          className="rank-select"
          value={rankTo}
          onChange={(e) => handleRankTo(Number(e.target.value))}
        >
          {RANKS.map((r, i) => (
            <option key={i} value={i}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="party-bar">
        {Array.from({ length: MAX_PARTY }).map((_, i) => {
          const hero = party[i];
          return hero ? (
            <button
              key={i}
              className="party-slot filled"
              onClick={() => toggleHero(hero)}
              title={`Remove ${hero.name}`}
            >
              <img src={hero.images?.icon_hero_card} alt={hero.name} />
              <span className="party-slot-x">×</span>
            </button>
          ) : (
            <div key={i} className="party-slot empty" />
          );
        })}
        {party.length > 0 && (
          <button className="clear-party-btn" onClick={() => setParty([])}>
            Clear
          </button>
        )}
      </div>

      {party.length >= 2 && (
        <div className="party-wr-bar">
          {partyWrLoading ? (
            <span className="party-wr-loading">calculating...</span>
          ) : partyWr ? (
            <>
              <span className="party-wr-label">Party WR</span>
              <span
                className="party-wr-value"
                style={{ color: winrateColor(partyWr.winrate) }}
              >
                {Math.round(partyWr.winrate * 100)}%
              </span>
              <span className="party-wr-matches">{partyWr.matches.toLocaleString()} matches</span>
            </>
          ) : (
            <span className="party-wr-loading">no data for this combination</span>
          )}
        </div>
      )}

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

      <div className="hero-grid-wrap">
        {heroesLoading ? (
          <div className="status-msg">Loading heroes...</div>
        ) : (
          <div className="hero-grid">
            {filteredHeroes.map((hero) => {
              const inParty = party.some((h) => h.id === hero.id);
              const disabled = partyFull && !inParty;
              return (
                <button
                  key={hero.id}
                  className={`hero-card ${inParty ? "active" : ""} ${disabled ? "disabled" : ""}`}
                  onClick={() => !disabled && toggleHero(hero)}
                  title={hero.name}
                >
                  {hero.images?.icon_hero_card
                    ? <img src={hero.images.icon_hero_card} alt={hero.name} />
                    : <div className="hero-initial">{hero.name[0]}</div>
                  }
                  <span className="hero-name">{hero.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {party.length > 0 && !partyFull && (
        <div ref={panelRef} className={`suggest-panel ${panelOpen ? "open" : ""}`}>
          <button
            className="suggest-toggle"
            onClick={() => setPanelOpen((v) => !v)}
          >
            <span>Suggest next pick</span>
            <span className={`suggest-arrow ${panelOpen ? "up" : ""}`}>▲</span>
          </button>

          {panelOpen && (
            <div className="suggest-content">
              <div className="table-head">
                <span>Hero</span>
                <span>Win Rate</span>
                <span>Matches</span>
              </div>
              {suggestLoading ? (
                <div className="status-msg">Loading...</div>
              ) : suggestions.length === 0 ? (
                <div className="status-msg">No data for this combination</div>
              ) : (
                <div className="synergy-list">
                  {suggestions.map((comb, i) => {
                    const sid = suggestionId(comb);
                    if (!sid) return null;
                    const hero = heroById(sid);
                    const wr = Math.round(comb.winrate * 100);
                    const color = winrateColor(comb.winrate);
                    return (
                      <div
                        key={i}
                        className="synergy-row"
                        onClick={() => toggleHero(hero!)}
                        style={{ cursor: "pointer" }}
                        title={`Add ${hero?.name} to party`}
                      >
                        <div className="partner-cell">
                          <span className="row-num">#{i + 1}</span>
                          {hero?.images?.icon_hero_card && (
                            <img src={hero.images.icon_hero_card} alt="" className="partner-icon" />
                          )}
                          <span className="partner-name">{hero?.name ?? `Hero ${sid}`}</span>
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
      )}
    </div>
  );
}
