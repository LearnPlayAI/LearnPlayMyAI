import { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import 'flag-icons/css/flag-icons.min.css';

// Country code mapping for flag-icons CSS classes
const COUNTRY_CODE_MAP = {
  'USA': 'us', 'GBR': 'gb', 'CAN': 'ca', 'DEU': 'de', 'FRA': 'fr',
  'JPN': 'jp', 'AUS': 'au', 'ITA': 'it', 'ESP': 'es', 'BRA': 'br',
  'MEX': 'mx', 'KOR': 'kr', 'NLD': 'nl', 'RUS': 'ru', 'SWE': 'se',
  'NOR': 'no', 'DNK': 'dk', 'FIN': 'fi', 'CHE': 'ch', 'AUT': 'at',
  'BEL': 'be', 'PRT': 'pt', 'POL': 'pl', 'CZE': 'cz', 'HUN': 'hu',
  'GRC': 'gr', 'TUR': 'tr', 'ISR': 'il', 'EGY': 'eg', 'ZAF': 'za',
  'IRL': 'ie', 'NZL': 'nz', 'SGP': 'sg', 'HKG': 'hk', 'TWN': 'tw',
  'IND': 'in', 'CHN': 'cn', 'ARG': 'ar', 'CHL': 'cl', 'COL': 'co', 
  'PER': 'pe', 'URY': 'uy', 'ECU': 'ec', 'BOL': 'bo', 'PRY': 'py', 
  'VEN': 've', 'GUY': 'gy', 'SUR': 'sr', 'THA': 'th', 'VNM': 'vn', 
  'PHL': 'ph', 'MYS': 'my', 'IDN': 'id',
};

/**
 * PlayerAvatar - Premium gaming avatar component with fallbacks, country flags, and cosmetic effects
 * 
 * Features:
 * - Avatar image with fallback to initials
 * - Gradient backgrounds for initials
 * - Country flag overlay
 * - Multiple size variants
 * - Premium glow effects
 * - Cosmetic avatar rings and effects
 * - Loading states
 * 
 * @param {Object} props
 * @param {Object} props.user - User object with avatar, name, country
 * @param {string} props.size - Size variant: 'xs', 'sm', 'md', 'lg', 'xl'
 * @param {boolean} props.showCountry - Whether to show country flag
 * @param {boolean} props.showGlow - Whether to show premium glow effect (overrides cosmetic glow)
 * @param {boolean} props.showCosmetics - Whether to fetch and display cosmetic effects (default: true)
 * @param {string} props.className - Additional CSS classes
 */
export function PlayerAvatar({ 
  user, 
  userId, // Extract to prevent passing to DOM
  size = 'md', 
  showCountry = false, 
  showName = false, // Extract to prevent passing to DOM
  showGlow = false,
  showCosmetics = true,
  className = '',
  ...props 
}) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Fetch active cosmetics for this user (only if showCosmetics is true and user exists)
  const { data: cosmetics } = useQuery({
    queryKey: [`/api/gamification/cosmetics/active/${user?.id}`],
    enabled: showCosmetics && !!user?.id,
    staleTime: 30000, // Cache for 30 seconds to reduce requests
  });

  // Size configurations
  const sizeClasses = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm', 
    md: 'w-12 h-12 text-base',
    lg: 'w-16 h-16 text-lg',
    xl: 'w-20 h-20 text-xl'
  };

  const flagSizes = {
    xs: 'w-3 h-3 text-sm',
    sm: 'w-4 h-4 text-base',
    md: 'w-5 h-5 text-lg',
    lg: 'w-6 h-6 text-xl',
    xl: 'w-7 h-7 text-2xl'
  };

  // Generate initials from gamer name or first/last name
  const getInitials = () => {
    if (user?.gamerName) {
      return user.gamerName.substring(0, 2).toUpperCase();
    }
    if (user?.firstName && user?.lastName) {
      return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    return user?.email?.substring(0, 2).toUpperCase() || 'U';
  };

  // Generate gradient based on user name for consistent colors
  const getGradientClass = () => {
    const name = user?.gamerName || user?.email || 'default';
    const hash = name.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    const gradients = [
      'bg-surface-raised',
      'bg-surface-raised', 
      'bg-surface-raised',
      'bg-surface-raised',
      'bg-surface-raised',
      'bg-[var(--game-gold)]',
      'bg-surface-raised'
    ];
    
    return gradients[Math.abs(hash) % gradients.length];
  };

  // Get cosmetic glow color and ring styling
  const getCosmeticStyling = () => {
    if (!cosmetics || !Array.isArray(cosmetics) || cosmetics.length === 0) {
      return { glowColor: null, ringStyle: null };
    }

    // Find avatar_ring cosmetic
    const avatarRing = cosmetics.find(c => c.type === 'avatar_ring');
    if (!avatarRing) {
      return { glowColor: null, ringStyle: null };
    }

    // Determine glow color from cosmetic name or tier using theme tokens
    let glowColor = 'color-mix(in srgb, var(--action-accent) 60%, transparent)'; // Default accent
    const name = avatarRing.name.toLowerCase();
    
    if (name.includes('blue')) {
      glowColor = 'color-mix(in srgb, var(--action-primary) 60%, transparent)';
    } else if (name.includes('green')) {
      glowColor = 'color-mix(in srgb, var(--game-success) 60%, transparent)';
    } else if (name.includes('red') || name.includes('ruby')) {
      glowColor = 'color-mix(in srgb, var(--destructive) 60%, transparent)';
    } else if (name.includes('gold') || name.includes('yellow')) {
      glowColor = 'color-mix(in srgb, var(--game-gold) 60%, transparent)';
    } else if (name.includes('cyan')) {
      glowColor = 'color-mix(in srgb, var(--game-glow) 60%, transparent)';
    } else if (avatarRing.tier === 'legendary') {
      glowColor = 'color-mix(in srgb, var(--game-gold) 60%, transparent)';
    } else if (avatarRing.tier === 'epic') {
      glowColor = 'color-mix(in srgb, var(--action-accent) 60%, transparent)';
    } else if (avatarRing.tier === 'rare') {
      glowColor = 'color-mix(in srgb, var(--action-primary) 60%, transparent)';
    }

    return {
      glowColor,
      ringStyle: {
        borderColor: glowColor,
        boxShadow: `0 0 15px ${glowColor}`
      }
    };
  };

  const { glowColor, ringStyle } = getCosmeticStyling();

  const getCountryFlag = () => {
    const flagCode = COUNTRY_CODE_MAP[user?.country];
    if (!flagCode) return null;
    
    return (
      <span 
        className={`fi fi-${flagCode} rounded-sm`}
        title={user.country}
      />
    );
  };

  const baseClasses = `
    relative inline-flex items-center justify-center rounded-full
    font-medium text-primary-foreground transition-all duration-300
    ${sizeClasses[size]}
    ${showGlow ? 'hover:scale-105 hover:shadow-elevated hover:shadow-accent/25' : ''}
    ${className}
  `;

  // Determine which glow and ring to show (cosmetic overrides default if available)
  const hasCosmeticRing = !!glowColor && !showGlow;
  const effectiveGlow = showGlow || hasCosmeticRing;

  return (
    <div className={baseClasses} {...props}>
      {/* Avatar background with glow effect (cosmetic or default) */}
      {effectiveGlow && (
        <div 
          className="absolute inset-0 rounded-full blur-sm animate-pulse" 
          style={glowColor ? { 
            background: glowColor,
            opacity: 0.4
          } : {}}
        />
      )}

      {/* Avatar content with cosmetic border */}
      <div 
        className={`relative flex items-center justify-center rounded-full ${sizeClasses[size]} overflow-hidden border-2`}
        style={ringStyle || {}}
      >
        {user?.avatarImageUrl && !imageError ? (
          <>
            {imageLoading && (
              <div className={`absolute inset-0 ${getGradientClass()} flex items-center justify-center`}>
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <img
              src={user.avatarImageUrl.startsWith('/') 
                ? `/api/public-objects${user.avatarImageUrl}` 
                : user.avatarImageUrl
              }
              alt={`${user?.gamerName || user?.email}'s avatar`}
              className="w-full h-full object-cover"
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageError(true);
                setImageLoading(false);
              }}
              data-testid={`avatar-image-${user?.id}`}
            />
          </>
        ) : (
          <div className={`w-full h-full ${getGradientClass()} flex items-center justify-center`}>
            {user ? (
              <span className="font-bold tracking-tight" data-testid={`avatar-initials-${user?.id}`}>
                {getInitials()}
              </span>
            ) : (
              <User className="w-1/2 h-1/2" data-testid="avatar-default-icon" />
            )}
          </div>
        )}
      </div>

      {/* Country flag overlay */}
      {showCountry && getCountryFlag() && (
        <div 
          className={`absolute -bottom-0.5 -right-0.5 ${flagSizes[size]} bg-background rounded-full border-2 border-background flex items-center justify-center shadow-sm overflow-hidden`}
          data-testid={`country-flag-${user?.country}`}
        >
          <div className="scale-75 flex items-center justify-center">
            {getCountryFlag()}
          </div>
        </div>
      )}

      {/* Premium glow ring */}
      {showGlow && (
        <div className="absolute inset-0 rounded-full ring-2 ring-accent/30 ring-offset-2 ring-offset-background/50" />
      )}
    </div>
  );
}

export default PlayerAvatar;
