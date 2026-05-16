import { themePresets } from '../client/src/config/themePresets';
import { getContrastRatio } from '../client/src/utils/contrast';

function lightness(hsl: string): number {
  const m = hsl.match(/hsl[a]?\(\s*\d+(?:\.\d+)?(?:deg|rad|grad|turn)?(?:,|\s)\s*\d+(?:\.\d+)?%\s*(?:,|\s)\s*(\d+(?:\.\d+)?)%/i);
  return m ? parseFloat(m[1]) : 50;
}

type Row = {
  id: string;
  name: string;
  primaryPair: number;
  secondaryPair: number;
  accentPair: number;
  fgOnBg: number;
  fgOnCard: number;
  borderOnBg: number;
  borderOnCard: number;
  bgCardDelta: number;
  cardMutedDelta: number;
};

const rows: Row[] = themePresets.map((p) => {
  const t = p.tokens;
  const bg = t['--background'];
  const card = t['--card'];
  const muted = t['--muted'];
  const border = t['--border'];
  return {
    id: p.id,
    name: p.name,
    primaryPair: getContrastRatio(t['--primary-foreground'], t['--primary']),
    secondaryPair: getContrastRatio(t['--secondary-foreground'], t['--secondary']),
    accentPair: getContrastRatio(t['--accent-foreground'], t['--accent']),
    fgOnBg: getContrastRatio(t['--foreground'], bg),
    fgOnCard: getContrastRatio(t['--card-foreground'], card),
    borderOnBg: getContrastRatio(border, bg),
    borderOnCard: getContrastRatio(border, card),
    bgCardDelta: Math.abs(lightness(bg) - lightness(card)),
    cardMutedDelta: Math.abs(lightness(card) - lightness(muted)),
  };
});

const fail = {
  primaryPairLT45: rows.filter(r => r.primaryPair < 4.5).length,
  secondaryPairLT45: rows.filter(r => r.secondaryPair < 4.5).length,
  accentPairLT45: rows.filter(r => r.accentPair < 4.5).length,
  fgOnBgLT7: rows.filter(r => r.fgOnBg < 7).length,
  fgOnCardLT7: rows.filter(r => r.fgOnCard < 7).length,
  borderOnBgLT3: rows.filter(r => r.borderOnBg < 3).length,
  borderOnCardLT3: rows.filter(r => r.borderOnCard < 3).length,
  bgCardDeltaLT2: rows.filter(r => r.bgCardDelta < 2).length,
  cardMutedDeltaLT3: rows.filter(r => r.cardMutedDelta < 3).length,
};

const worst = {
  primaryPair: [...rows].sort((a,b)=>a.primaryPair-b.primaryPair).slice(0,8),
  secondaryPair: [...rows].sort((a,b)=>a.secondaryPair-b.secondaryPair).slice(0,8),
  accentPair: [...rows].sort((a,b)=>a.accentPair-b.accentPair).slice(0,8),
  borderOnBg: [...rows].sort((a,b)=>a.borderOnBg-b.borderOnBg).slice(0,8),
  borderOnCard: [...rows].sort((a,b)=>a.borderOnCard-b.borderOnCard).slice(0,8),
  bgCardDelta: [...rows].sort((a,b)=>a.bgCardDelta-b.bgCardDelta).slice(0,8),
  cardMutedDelta: [...rows].sort((a,b)=>a.cardMutedDelta-b.cardMutedDelta).slice(0,8),
};

console.log(JSON.stringify({ presets: rows.length, fail, worst }, null, 2));
