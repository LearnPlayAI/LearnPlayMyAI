import { themePresets } from '../client/src/config/themePresets';
import { getContrastWarnings } from '../client/src/utils/contrast';

let totalWarnings = 0;
let totalCritical = 0;
const pairCounts = new Map<string, number>();
const criticalByPreset: Array<{id:string;name:string;count:number;top:string[]}> = [];

for (const preset of themePresets) {
  const warnings = getContrastWarnings(preset.tokens || {});
  const critical = warnings.filter((w) => w.level === 'error');
  totalWarnings += warnings.length;
  totalCritical += critical.length;
  for (const w of warnings) {
    pairCounts.set(w.pair, (pairCounts.get(w.pair) || 0) + 1);
  }
  if (critical.length > 0) {
    const top = critical.slice(0, 5).map((w) => `${w.pair} (${w.ratio.toFixed(2)}/${w.required})`);
    criticalByPreset.push({ id: preset.id, name: preset.name, count: critical.length, top });
  }
}

const sortedPairs = Array.from(pairCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

console.log(JSON.stringify({
  presets: themePresets.length,
  totalWarnings,
  totalCritical,
  presetsWithCritical: criticalByPreset.length,
  topPairs: sortedPairs,
  criticalByPreset: criticalByPreset.slice(0, 20),
}, null, 2));
