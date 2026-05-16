import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Trophy, Award, Medal, Star, Target, Brain, Filter, Building2, Coins, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLevelFromXP } from '@shared/levelUtils';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { getThemeAvatarFallbackGradient, getThemeAvatarFallbackRing } from '@/lib/themePalettes';

interface QuizLeaderboardProps {
  collectionType?: 'public' | 'organization';
}

export function QuizLeaderboard({ collectionType }: QuizLeaderboardProps) {
  const { terminology, isResolved } = useOrganizationTerminology();
  const resolvedTerminology = isResolved && terminology ? terminology : {
    unit: 'Department',
    unitPlural: 'Departments',
    subUnit: 'Unit',
    subUnitPlural: 'Units',
  };
  
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('all-grades');
  const [selectedSubUnitId, setSelectedSubUnitId] = useState<string>('all-classes');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all-subjects');
  const [topN, setTopN] = useState<number>(20);
  const [days, setDays] = useState<number>(30);

  // Fetch user's organization context
  const { data: userContext } = useQuery<any>({
    queryKey: ['/api/user/roles'],
  });

  const isSuperAdmin = userContext?.isSuperAdmin || false;
  const organizations = userContext?.organizations || [];

  const normalizeRole = (value: string | null | undefined) =>
    (value || '').toLowerCase().replace(/[\s-]/g, '_');
  
  // Check if user is staff (can see all units) or learner (limited view)
  const isAdminOrTeacher = userContext?.isSuperAdmin || userContext?.roles?.some((role: any) => {
    const normalizedRole = normalizeRole(role.role);
    return normalizedRole === 'teacher' || normalizedRole === 'org_admin' || normalizedRole === 'orgadmin';
  }
  ) || false;
  
  // Get learner's assigned unit
  const studentAssignedUnitId = !isAdminOrTeacher && userContext?.unitId ? userContext.unitId : null;

  // Get current organization and check if it's a business org
  const currentOrg = organizations.find((org: any) => org.id === selectedOrgId);
  const orgType = currentOrg?.type;
  const isBusinessOrg = orgType === 'business';

  // Set default organization on load
  useEffect(() => {
    if (userContext && selectedOrgId === '') {
      // Use defaultOrganizationId, or fallback to first organization if available
      const defaultOrg = userContext.defaultOrganizationId || 
                        (userContext.organizations?.length > 0 ? userContext.organizations[0].id : '');
      setSelectedOrgId(defaultOrg);
    }
  }, [userContext, selectedOrgId]);
  
  // Set default grade for students to their assigned grade
  useEffect(() => {
    if (studentAssignedUnitId && selectedUnitId === 'all-grades') {
      setSelectedUnitId(studentAssignedUnitId);
    }
  }, [studentAssignedUnitId]);

  // Build query params for filter endpoints (include organizationId for SuperAdmin)
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (isSuperAdmin && selectedOrgId) {
      params.append('organizationId', selectedOrgId);
    }
    return params.toString();
  };

  const orgQueryString = buildQueryParams();

  // Fetch organization units - only for organization collections
  const { data: units = [] } = useQuery<any[]>({
    queryKey: ['/api/organization/units', orgQueryString],
    queryFn: async () => {
      const url = `/api/organization/units${orgQueryString ? `?${orgQueryString}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch units');
      return response.json();
    },
    enabled: collectionType === 'organization' && !!selectedOrgId,
  });

  const selectedUnitBelongsToOrg =
    selectedUnitId === 'all-grades' || units.some((unit: any) => unit.id === selectedUnitId);

  // Fetch sub-units (classes) for selected grade - only for organization collections
  const { data: subUnits = [] } = useQuery<any[]>({
    queryKey: ['/api/organization/sub-units', selectedUnitId, orgQueryString],
    queryFn: async () => {
      const url = `/api/organization/sub-units/${selectedUnitId}${orgQueryString ? `?${orgQueryString}` : ''}`;
      const response = await fetch(url);
      if (response.status === 403 || response.status === 404) {
        return [];
      }
      if (!response.ok) throw new Error('Failed to fetch sub-units');
      return response.json();
    },
    enabled: collectionType === 'organization' && !!selectedUnitId && selectedUnitId !== 'all-grades' && !!selectedOrgId && selectedUnitBelongsToOrg,
  });

  // Fetch all subjects - only for organization collections
  const { data: allSubjects = [] } = useQuery<any[]>({
    queryKey: ['/api/subjects', orgQueryString],
    queryFn: async () => {
      const url = `/api/subjects${orgQueryString ? `?${orgQueryString}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch subjects');
      return response.json();
    },
    enabled: collectionType === 'organization' && !!selectedOrgId,
  });

  // Fetch unit-subject assignments to filter subjects by grade - only for organization collections
  const { data: unitSubjectAssignments = [] } = useQuery<any[]>({
    queryKey: ['/api/organization/unit-subjects', orgQueryString],
    queryFn: async () => {
      const url = `/api/organization/unit-subjects${orgQueryString ? `?${orgQueryString}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch unit-subjects');
      return response.json();
    },
    enabled: collectionType === 'organization' && selectedUnitId !== 'all-grades' && !!selectedOrgId,
  });

  // Filter subjects based on selected grade
  const subjects = selectedUnitId === 'all-grades' 
    ? allSubjects 
    : allSubjects.filter((subject: any) => 
        unitSubjectAssignments.some(
          (usa: any) => usa.subjectId === subject.id && usa.unitId === selectedUnitId
        )
      );

  // Fetch leaderboard data with proper filter handling
  const { data: leaderboard = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/quiz-leaderboard', selectedOrgId, selectedUnitId, selectedSubUnitId, selectedSubjectId, days, topN, collectionType],
    queryFn: async () => {
      // Build query params inside queryFn to avoid stale closure issues
      const queryParams = new URLSearchParams();
      // Add organizationId for organization collections (needed for all users including teachers)
      if (collectionType === 'organization' && selectedOrgId) {
        queryParams.append('organizationId', selectedOrgId);
      }
      // Only include grade/class/subject filters for organization collections
      if (collectionType === 'organization') {
        if (selectedUnitId && selectedUnitId !== 'all-grades' && selectedUnitBelongsToOrg) {
          queryParams.append('unitId', selectedUnitId);
        }
        if (selectedSubUnitId && selectedSubUnitId !== 'all-classes') queryParams.append('subUnitId', selectedSubUnitId);
        if (selectedSubjectId && selectedSubjectId !== 'all-subjects') queryParams.append('subjectId', selectedSubjectId);
      }
      if (days) queryParams.append('days', days.toString());
      if (topN) queryParams.append('limit', topN.toString());
      if (collectionType) queryParams.append('collectionType', collectionType);

      const queryString = queryParams.toString();
      const apiUrl = `/api/quiz-leaderboard${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      return response.json();
    },
    enabled: collectionType === 'public' || !!selectedOrgId,
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });

  // Get filter description text
  const getFilterDescription = () => {
    const parts: string[] = [];
    // Only show organizational filters for organization collections
    if (collectionType === 'organization') {
      if (selectedUnitId) {
        const unit = units.find(u => u.id === selectedUnitId);
        if (unit) parts.push(unit.name);
      }
      if (selectedSubUnitId) {
        const subUnit = subUnits.find(su => su.id === selectedSubUnitId);
        if (subUnit) parts.push(subUnit.name);
      }
      if (selectedSubjectId) {
        const subject = subjects.find(s => s.id === selectedSubjectId);
        if (subject) parts.push(subject.name);
      }
    }
    if (days) {
      parts.push(`last ${days} days`);
    }
    
    return parts.length > 0 ? `Showing top ${topN} in ${parts.join(' • ')}` : `Showing top ${topN} players`;
  };

  // Reset sub-unit and subject when grade changes
  const handleUnitChange = (value: string) => {
    setSelectedUnitId(value);
    setSelectedSubUnitId('all-classes'); // Reset class when grade changes
    setSelectedSubjectId('all-subjects'); // Reset subject when grade changes
  };

  useEffect(() => {
    if (selectedUnitId !== 'all-grades' && !selectedUnitBelongsToOrg) {
      setSelectedUnitId('all-grades');
      setSelectedSubUnitId('all-classes');
    }
  }, [selectedUnitBelongsToOrg, selectedUnitId]);

  useEffect(() => {
    if (
      selectedSubUnitId !== 'all-classes' &&
      !subUnits.some((subUnit: any) => subUnit.id === selectedSubUnitId)
    ) {
      setSelectedSubUnitId('all-classes');
    }
  }, [selectedSubUnitId, subUnits]);

  if (!isResolved || isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading leaderboard...</span>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin w-6 h-6 border-3 border-primary border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-glow-gold" />;
      case 2:
        return <Medal className="w-5 h-5 text-muted-foreground" />;
      case 3:
        return <Award className="w-5 h-5 text-warning" />;
      default:
        return <Star className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'text-glow-gold font-bold';
      case 2:
        return 'text-muted-foreground font-bold';
      case 3:
        return 'text-warning font-bold';
      default:
        return 'text-muted-foreground';
    }
  };

  const getTierColor = (tier?: string) => {
    switch (tier) {
      case 'legendary':
        return 'text-glow-gold';
      case 'epic':
        return 'text-primary';
      case 'rare':
        return 'text-secondary';
      case 'common':
      default:
        return 'text-muted-foreground';
    }
  };

  const getTierGlowClass = (tier?: string) => {
    switch (tier) {
      case 'legendary':
        return 'shadow-[0_0_10px_color-mix(in_srgb,_var(--game-gold)_50%,_transparent)]';
      case 'epic':
        return 'shadow-[0_0_8px_color-mix(in_srgb,_var(--action-primary)_40%,_transparent)]';
      case 'rare':
        return 'shadow-[0_0_6px_color-mix(in_srgb,_var(--action-secondary)_30%,_transparent)]';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Filters</span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Organization Filter (SuperAdmin only) */}
          {isSuperAdmin && (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                Organization
              </label>
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger className="bg-card border-border text-foreground" data-testid="select-leaderboard-organization">
                  <SelectValue placeholder="Select Organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org: any) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Unit, sub-unit, and subject filters - only for organization collections */}
          {collectionType === 'organization' && (
            <>
              {/* Unit Filter */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">{resolvedTerminology.unit}</label>
                <Select value={selectedUnitId} onValueChange={handleUnitChange} disabled={!isAdminOrTeacher && !isBusinessOrg}>
                  <SelectTrigger className="bg-card border-border text-foreground disabled:opacity-50 disabled:cursor-not-allowed" data-testid="select-leaderboard-grade">
                    <SelectValue placeholder={`All ${resolvedTerminology.unitPlural}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-grades">All {resolvedTerminology.unitPlural}</SelectItem>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sub-unit Filter */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">{resolvedTerminology.subUnit}</label>
                <Select 
                  value={selectedSubUnitId} 
                  onValueChange={setSelectedSubUnitId}
                  disabled={!selectedUnitId}
                >
                  <SelectTrigger 
                    className="bg-card border-border text-foreground disabled:opacity-50" 
                    data-testid="select-leaderboard-class"
                  >
                    <SelectValue placeholder={`All ${resolvedTerminology.subUnitPlural}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-classes">All {resolvedTerminology.subUnitPlural}</SelectItem>
                    {subUnits.map((subUnit) => (
                      <SelectItem key={subUnit.id} value={subUnit.id}>
                        {subUnit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subject Filter */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">{isResolved && terminology ? terminology.subject : 'Subject'}</label>
                <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                  <SelectTrigger className="bg-card border-border text-foreground" data-testid="select-leaderboard-subject">
                    <SelectValue placeholder={isResolved && terminology ? `All ${terminology.subjectPlural}` : 'All Subjects'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-subjects">All {isResolved && terminology ? terminology.subjectPlural : 'Subjects'}</SelectItem>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Top N Filter */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Show Top</label>
            <Select value={topN.toString()} onValueChange={(v) => setTopN(parseInt(v))}>
              <SelectTrigger className="bg-card border-border text-foreground" data-testid="select-leaderboard-top-n">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="50">Top 50</SelectItem>
                <SelectItem value="100">Top 100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time Period Filter */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Time Period</label>
            <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
              <SelectTrigger className="bg-card border-border text-foreground" data-testid="select-leaderboard-time-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="14">Last 14 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
                <SelectItem value="365">Last Year</SelectItem>
                <SelectItem value="0">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active Filters Description */}
        <div className="text-xs text-muted-foreground italic" data-testid="text-leaderboard-filter-description">
          {getFilterDescription()}
        </div>
      </div>

      {/* Leaderboard List */}
      {leaderboard.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Trophy className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No players found with the selected filters.</p>
          <p className="text-xs mt-1">Try adjusting your filter criteria.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((player: any, index: number) => {
            const rank = index + 1;
            const level = player.currentLevel || getLevelFromXP(player.currentXP || 0);
            const accuracy = parseFloat(player.averageAccuracy) || 0;
            const gamesPlayed = player.totalGamesPlayed || 0;
            const gamesWon = player.totalGamesWon || 0;
            const coinBalance = player.coinBalance || 0;
            const cosmetics = player.equippedCosmetics || {};
            const nameColorCosmetic = cosmetics.name_color;
            const avatarRingCosmetic = cosmetics.avatar_ring;
            const avatarFrameCosmetic = cosmetics.avatar_frame;
            
            // Apply cosmetic name color
            const nameColor = nameColorCosmetic ? getTierColor(nameColorCosmetic.tier) : getRankColor(rank);
            const glowClass = avatarRingCosmetic ? getTierGlowClass(avatarRingCosmetic.tier) : '';
            
            return (
              <div
                key={player.userId}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all hover:bg-[var(--surface-muted)]/50 ${
                  rank <= 3 ? 'bg-[var(--game-gold)]/15 border border-[var(--game-gold)]/30' : 'bg-[var(--surface-raised)]/50 border border-[var(--stroke-default)]'
                } ${glowClass}`}
                data-testid={`leaderboard-player-${player.userId}`}
              >
                <div className="flex-shrink-0 w-8 flex items-center justify-center">
                  {getRankIcon(rank)}
                </div>
                
                {/* Player Avatar with Cosmetics */}
                <div className="flex-shrink-0 relative">
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center text-primary-foreground font-bold text-lg relative overflow-hidden"
                    style={{
                      background: avatarFrameCosmetic 
                        ? (avatarFrameCosmetic.effect?.color || getThemeAvatarFallbackGradient())
                        : getThemeAvatarFallbackGradient(),
                      boxShadow: avatarRingCosmetic 
                        ? `0 0 20px ${avatarRingCosmetic.effect?.color || 'var(--action-primary-fg)'}`
                        : 'none',
                      border: avatarRingCosmetic 
                        ? `3px solid ${avatarRingCosmetic.effect?.color || 'var(--action-primary-fg)'}`
                        : getThemeAvatarFallbackRing(),
                    }}
                  >
                    {player.avatarImageUrl ? (
                      <img
                        src={player.avatarImageUrl.startsWith('/') 
                          ? `/api/public-objects${player.avatarImageUrl}` 
                          : player.avatarImageUrl
                        }
                        alt={`${player.gamerName}'s avatar`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.parentElement!.textContent = player.gamerName?.charAt(0)?.toUpperCase() || '?';
                        }}
                        data-testid={`avatar-image-${player.userId}`}
                      />
                    ) : (
                      player.gamerName?.charAt(0)?.toUpperCase() || '?'
                    )}
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold truncate ${nameColor}`} data-testid={`text-player-name-${player.userId}`}>
                    {player.gamerName}
                    {(nameColorCosmetic || avatarRingCosmetic || avatarFrameCosmetic) && (
                      <span className="ml-1 text-[10px] opacity-60">✨</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      Lvl {level}
                    </Badge>
                    <Badge variant="outline" className="text-xs !text-warning flex items-center gap-1" data-testid={`badge-coins-${player.userId}`}>
                      <Coins className="w-3 h-3" />
                      {coinBalance.toLocaleString()}
                    </Badge>
                    {(nameColorCosmetic || avatarRingCosmetic || avatarFrameCosmetic) && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Cosmetics
                      </Badge>
                    )}
                  </div>
                  
                  {/* Show organizational context */}
                  {(player.unitName || player.subUnitName) && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {player.unitName && <span>{player.unitName}</span>}
                      {player.subUnitName && <span>• {player.subUnitName}</span>}
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3 mt-1.5 text-xs">
                    <div className="flex items-center gap-1 text-primary">
                      <Star className="w-3 h-3" />
                      <span>{player.currentXP || 0} XP</span>
                    </div>
                    <div className="flex items-center gap-1 text-secondary">
                      <Brain className="w-3 h-3" />
                      <span>{gamesPlayed} games</span>
                    </div>
                    <div className="flex items-center gap-1 text-glow-gold">
                      <Trophy className="w-3 h-3" />
                      <span>{gamesWon} wins</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-lg font-bold text-primary" data-testid={`text-player-accuracy-${player.userId}`}>
                    {accuracy.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">accuracy</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
