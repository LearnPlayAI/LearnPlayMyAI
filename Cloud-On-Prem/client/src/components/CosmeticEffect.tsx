interface CosmeticEffectProps {
  children: React.ReactNode;
  cosmetic?: {
    tier: string;
    effect: string;
    slot: string;
  };
  className?: string;
}

export function CosmeticEffect({ children, cosmetic, className = '' }: CosmeticEffectProps) {
  if (!cosmetic) {
    return <div className={className}>{children}</div>;
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'legendary':
        return 'text-warning';
      case 'epic':
        return 'text-primary';
      case 'rare':
        return 'text-secondary';
      case 'common':
        return 'text-muted-foreground';
      default:
        return '';
    }
  };

  const getTierGlowClass = (tier: string) => {
    switch (tier) {
      case 'legendary':
        return 'animate-pulse shadow-[0_0_15px_color-mix(in_srgb,_var(--warning)_60%,_transparent)] ring-2 ring-warning/40';
      case 'epic':
        return 'shadow-[0_0_12px_color-mix(in_srgb,_var(--game-glow)_50%,_transparent)] ring-2 ring-primary/30';
      case 'rare':
        return 'shadow-[0_0_8px_color-mix(in_srgb,_var(--action-secondary)_40%,_transparent)] ring-1 ring-secondary/30';
      default:
        return '';
    }
  };

  const getTierBorderClass = (tier: string) => {
    switch (tier) {
      case 'legendary':
        return 'border-2 border-[var(--warning)]/50';
      case 'epic':
        return 'border-2 border-primary';
      case 'rare':
        return 'border border-secondary';
      case 'common':
        return 'border border-border';
      default:
        return '';
    }
  };

  // Apply effects based on cosmetic slot
  let effectClasses = '';
  if (cosmetic.slot === 'name_color') {
    effectClasses = getTierColor(cosmetic.tier);
  } else if (cosmetic.slot === 'avatar_ring' || cosmetic.slot === 'avatar_frame') {
    effectClasses = `${getTierBorderClass(cosmetic.tier)} ${getTierGlowClass(cosmetic.tier)}`;
  }

  return (
    <div className={`relative ${effectClasses} ${className} transition-all duration-300`}>
      {children}
      {cosmetic.tier === 'legendary' && cosmetic.slot === 'avatar_ring' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
          <div className="absolute inset-0 bg-transparent animate-shimmer" />
        </div>
      )}
    </div>
  );
}
