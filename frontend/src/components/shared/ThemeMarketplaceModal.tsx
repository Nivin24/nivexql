import { useState } from 'react';
import { X, Sparkles, Check, Lock, ShoppingBag, Eye, Star, Zap } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { toast } from './Toast';

interface MarketplaceTheme {
  id: string;
  name: string;
  type: 'free' | 'pro';
  mode: 'light' | 'dark';
  price?: string;
  author: string;
  rating: number;
  reviews: number;
  description: string;
  colors: string[];
  bannerGradient: string;
  isFeatured?: boolean;
}

const MARKETPLACE_THEMES: MarketplaceTheme[] = [
  {
    id: 'donezo-light',
    name: 'Donezo Forest Light',
    type: 'free',
    mode: 'light',
    author: 'Donezo Design Studio',
    rating: 4.9,
    reviews: 128,
    description: 'Clean light gray canvas (#f3f4f6), crisp white cards (#ffffff), and forest emerald (#15803d) accents inspired by modern productivity dashboards.',
    colors: ['#f3f4f6', '#ffffff', '#15803d', '#111827'],
    bannerGradient: 'from-emerald-600 via-green-500 to-teal-700',
    isFeatured: true,
  },
  {
    id: 'dark',
    name: 'Obsidian Dark Glass',
    type: 'free',
    mode: 'dark',
    author: 'NivexQL Core',
    rating: 4.8,
    reviews: 310,
    description: 'Stateless dark obsidian glassmorphic aesthetic with flame amber (#f97316) highlights and deep canvas contrast.',
    colors: ['#09090b', '#121215', '#f97316', '#0ea5e9'],
    bannerGradient: 'from-orange-600 via-amber-600 to-slate-900',
    isFeatured: true,
  },
  {
    id: 'cosmic',
    name: 'Cosmic Indigo',
    type: 'free',
    mode: 'dark',
    author: 'NivexQL Core',
    rating: 4.7,
    reviews: 94,
    description: 'Midnight indigo dark mode with glowing lavender chart lines and deep space backdrop.',
    colors: ['#000000', '#030514', '#6c8dfa', '#8b9cc4'],
    bannerGradient: 'from-indigo-600 via-blue-600 to-purple-900',
  },
  {
    id: 'executive-light',
    name: 'Executive Platinum Light',
    type: 'pro',
    mode: 'light',
    price: '$19',
    author: 'Enterprise BI',
    rating: 5.0,
    reviews: 64,
    description: 'High-contrast corporate light theme with platinum blue highlights, financial metric cards, and border grids.',
    colors: ['#f8fafc', '#ffffff', '#0284c7', '#0f172a'],
    bannerGradient: 'from-sky-500 via-blue-600 to-slate-700',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    type: 'pro',
    mode: 'dark',
    price: '$29',
    author: 'Neon City Labs',
    rating: 4.9,
    reviews: 142,
    description: 'Vibrant synthwave dark theme with magenta neon glow, cyan metrics, and ultra-high contrast visual graphs.',
    colors: ['#0d0221', '#150534', '#ff007f', '#00f5d4'],
    bannerGradient: 'from-fuchsia-600 via-pink-600 to-purple-950',
  },
];

export default function ThemeMarketplaceModal() {
  const showMarketplaceModal = useAppStore(s => s.showMarketplaceModal);
  const setShowMarketplaceModal = useAppStore(s => s.setShowMarketplaceModal);
  const appTheme = useAppStore(s => s.appTheme);
  const setAppTheme = useAppStore(s => s.setAppTheme);
  const unlockedThemes = useAppStore(s => s.unlockedThemes);
  const unlockTheme = useAppStore(s => s.unlockTheme);

  const [activeFilter, setActiveFilter] = useState<'all' | 'free' | 'pro'>('all');
  const [unlockingTheme, setUnlockingTheme] = useState<MarketplaceTheme | null>(null);

  if (!showMarketplaceModal) return null;

  const filteredThemes = MARKETPLACE_THEMES.filter(t => {
    if (activeFilter === 'free') return t.type === 'free';
    if (activeFilter === 'pro') return t.type === 'pro';
    return true;
  });

  const handleApplyTheme = (theme: MarketplaceTheme) => {
    const isUnlocked = unlockedThemes.includes(theme.id) || theme.type === 'free';
    if (!isUnlocked) {
      setUnlockingTheme(theme);
      return;
    }
    setAppTheme(theme.id as any);
    toast.success(`Applied ${theme.name} theme!`);
  };

  const handleSimulateUnlock = () => {
    if (!unlockingTheme) return;
    unlockTheme(unlockingTheme.id);
    setAppTheme(unlockingTheme.id as any);
    toast.success(`🎉 Unlocked & applied ${unlockingTheme.name}!`);
    setUnlockingTheme(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#070b19]/80 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="glass border border-surface-border rounded-3xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden relative shadow-2xl bg-surface-card">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between bg-surface-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-accent/15 text-accent border border-accent/30">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-text-primary tracking-tight">Theme & Dashboard Marketplace</h2>
                <span className="text-[10px] font-bold text-accent bg-accent/15 px-2 py-0.5 rounded-full border border-accent/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Preset Store
                </span>
              </div>
              <p className="text-xs text-text-muted">Browse, preview, and apply custom light/dark dashboard presets and theme styles</p>
            </div>
          </div>

          <button
            onClick={() => setShowMarketplaceModal(false)}
            className="p-2 hover:bg-surface-muted rounded-xl text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Navigation Bar */}
        <div className="px-6 py-3 border-b border-surface-border/60 flex items-center justify-between bg-surface-base/40">
          <div className="flex items-center gap-2">
            {(['all', 'free', 'pro'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                  activeFilter === tab
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-muted/60'
                }`}
              >
                {tab === 'all' ? 'All Themes' : tab === 'free' ? 'Free Presets' : 'Pro / Paid Market'}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-text-muted font-mono">
            Showing {filteredThemes.length} presets
          </span>
        </div>

        {/* Theme Cards Grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredThemes.map(theme => {
            const isActive = appTheme === theme.id;
            const isUnlocked = unlockedThemes.includes(theme.id) || theme.type === 'free';

            return (
              <div
                key={theme.id}
                className={`rounded-2xl border transition-all flex flex-col overflow-hidden group ${
                  isActive
                    ? 'border-accent bg-surface-muted/80 ring-2 ring-accent/30 shadow-lg'
                    : 'border-surface-border bg-surface-base/60 hover:border-accent/50 hover:bg-surface-muted/40'
                }`}
              >
                {/* Banner Header */}
                <div className={`h-24 bg-gradient-to-r ${theme.bannerGradient} p-3.5 flex flex-col justify-between relative`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider bg-black/40 text-white px-2.5 py-0.5 rounded-full backdrop-blur-md border border-white/20">
                      {theme.mode} mode
                    </span>
                    
                    {theme.type === 'pro' ? (
                      <span className="text-[10px] font-bold bg-amber-500/90 text-black px-2 py-0.5 rounded-full flex items-center gap-1 font-mono shadow-sm">
                        <Zap className="w-3 h-3 fill-current" /> {theme.price} Pro
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold bg-emerald-500/90 text-white px-2 py-0.5 rounded-full shadow-sm">
                        Free
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-white drop-shadow-md">
                    <span className="text-sm font-extrabold tracking-tight">{theme.name}</span>
                    {isActive && (
                      <span className="flex items-center gap-1 text-[10px] font-bold bg-white text-black px-2 py-0.5 rounded-full shadow-sm">
                        <Check className="w-3 h-3 text-emerald-600" /> Active
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] text-text-muted">
                      <span>by {theme.author}</span>
                      <div className="flex items-center gap-1 text-amber-400 font-bold">
                        <Star className="w-3 h-3 fill-amber-400" />
                        <span>{theme.rating}</span>
                        <span className="text-text-muted">({theme.reviews})</span>
                      </div>
                    </div>

                    <p className="text-xs text-text-secondary line-clamp-3 leading-relaxed">
                      {theme.description}
                    </p>
                  </div>

                  {/* Swatch & Action */}
                  <div className="flex flex-col gap-3 pt-2 border-t border-surface-border/50">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-text-muted uppercase font-bold">Palette:</span>
                      <div className="flex items-center gap-1">
                        {theme.colors.map((c, idx) => (
                          <div
                            key={idx}
                            className="w-4 h-4 rounded-full border border-surface-border shadow-sm"
                            style={{ backgroundColor: c }}
                            title={c}
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleApplyTheme(theme)}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm ${
                        isActive
                          ? 'bg-accent/20 text-accent border border-accent/40 cursor-default'
                          : isUnlocked
                          ? 'bg-accent text-white hover:bg-accent-hover'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25'
                      }`}
                    >
                      {isActive ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Currently Active</span>
                        </>
                      ) : isUnlocked ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Apply Preset</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Unlock Pro ({theme.price})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unlock Pro Modal */}
      {unlockingTheme && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in zoom-in-95 duration-150">
          <div className="glass border border-amber-500/40 rounded-3xl p-6 max-w-md w-full bg-[#0c1022] shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400">
                <Zap className="w-5 h-5 fill-amber-400" />
                <h3 className="font-extrabold text-base text-text-primary">Unlock {unlockingTheme.name}</h3>
              </div>
              <button onClick={() => setUnlockingTheme(null)} className="text-text-muted hover:text-text-primary cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              This theme is part of the <strong>Pro Theme Marketplace Tier</strong>. Confirm to unlock and apply this preset immediately to your active workspace.
            </p>

            <div className="bg-surface-muted/60 p-3 rounded-2xl border border-surface-border flex items-center justify-between">
              <span className="text-xs font-bold text-text-primary">{unlockingTheme.name}</span>
              <span className="text-xs font-mono font-bold text-amber-400">{unlockingTheme.price} Pro</span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setUnlockingTheme(null)}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-text-muted hover:bg-surface-muted border border-surface-border transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSimulateUnlock}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Unlock & Apply</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
