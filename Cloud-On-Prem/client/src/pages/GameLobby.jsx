import { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Play, Crown, Zap, Timer, Trophy, ArrowLeft, X, Clock, Settings, Building2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import CollectionModal from '@/components/ui/CollectionModal';
import { FloatingHomeButton } from '@/components/FloatingHomeButton';

const GameModeCard = ({ mode, title, description, maxPlayers, icon: Icon, onSelect, isSelected }) => (
  <Card 
    className={`cursor-pointer transition-all duration-300 hover:scale-105 border-2 ${
      isSelected 
        ? 'border-accent bg-accent/10 shadow-dialog ring-4 ring-accent/30' 
        : 'border-border hover:border-accent/50 hover:shadow-elevated'
    }`}
    onClick={() => onSelect(mode)}
    data-testid={`gamemode-${mode}`}
  >
    <CardHeader className="text-center pb-2">
      <div className="flex justify-center mb-2">
        <Icon className={`w-12 h-12 ${isSelected ? 'text-accent' : 'text-muted-foreground'}`} />
      </div>
      <CardTitle className="text-lg">{title}</CardTitle>
      <CardDescription className="text-sm">{description}</CardDescription>
    </CardHeader>
    <CardContent className="pt-2">
      <div className="flex items-center justify-center gap-2">
        <Users className="w-4 h-4" />
        <span className="text-sm font-medium">{maxPlayers} Player{maxPlayers > 1 ? 's' : ''}</span>
      </div>
    </CardContent>
  </Card>
);

// Enhanced Lobby Card with Player Details and Game Settings
const LobbyCard = ({ lobby, onJoin }) => {
  const { data: playerSessions } = useQuery({
    queryKey: [`/api/game/${lobby.id}/players`],
    enabled: !!lobby.id,
  });

  return (
    <Card className="hover:shadow-dialog transition-all duration-300 hover:scale-105 border-2 border-border hover:border-accent/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="text-lg font-bold">
            {lobby.gameMode.toUpperCase()} MODE
          </span>
          <Badge variant="outline" className="font-mono" >
            {lobby.joinCode}
          </Badge>
        </CardTitle>
        <CardDescription className="text-sm">
          <div className="flex items-center justify-between mt-2">
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {lobby.currentPlayers}/{lobby.maxPlayers} players
            </span>
            <span className="text-xs bg-success/20 text-success px-2 py-1 rounded-full">
              ACTIVE
            </span>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="space-y-4">
          {/* Game Settings */}
          <div className="grid grid-cols-2 gap-2 p-3 bg-muted/30 rounded-lg">
            <div className="text-center">
              <Timer className="w-4 h-4 mx-auto mb-1 text-accent" />
              <div className="text-xs font-medium">{Math.floor((lobby.gameTimeSeconds || 120) / 60)}m</div>
              <div className="text-xs text-muted-foreground">Game</div>
            </div>
            <div className="text-center">
              <Clock className="w-4 h-4 mx-auto mb-1 text-secondary" />
              <div className="text-xs font-medium">{lobby.roundTimeSeconds || 3}s</div>
              <div className="text-xs text-muted-foreground">Turn</div>
            </div>
          </div>

          {/* Players List */}
          <div>
            <div className="text-xs font-medium mb-2 flex items-center gap-1">
              <Users className="w-3 h-3" />
              Players in Lobby
            </div>
            <div className="grid grid-cols-2 gap-2">
              {playerSessions?.map((player) => (
                <div key={player.id} className="flex items-center gap-2 p-2 bg-muted/20 rounded">
                  <PlayerAvatar
                    user={{ gamerName: player.playerName, id: player.playerId }}
                    size="sm"
                    showCountry={true}
                    showGlow={false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{player.playerName}</div>
                    {lobby.hostPlayerId === player.playerId && (
                      <div className="flex items-center gap-1">
                        <Crown className="w-3 h-3 text-glow-gold" />
                        <span className="text-xs text-glow-gold">Host</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {/* Empty slots */}
              {Array.from({ length: lobby.maxPlayers - (playerSessions?.length || 0) }, (_, i) => (
                <div key={`empty-${i}`} className="flex items-center gap-2 p-2 bg-muted/10 rounded border-dashed border">
                  <div className="w-6 h-6 rounded-full bg-muted/30 flex items-center justify-center">
                    <Users className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <div className="text-xs text-muted-foreground">Waiting...</div>
                </div>
              ))}
            </div>
          </div>

          {/* Progress bar showing lobby fullness */}
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-accent h-2 rounded-full transition-all duration-300"
              style={{ width: `${(lobby.currentPlayers / lobby.maxPlayers) * 100}%` }}
            />
          </div>
          
          <Button onClick={() => onJoin(lobby.joinCode)}
            disabled={lobby.currentPlayers >= lobby.maxPlayers}
            className={`w-full font-bold transition-all duration-300 ${
              lobby.currentPlayers >= lobby.maxPlayers 
                ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                : 'bg-accent hover:scale-105 hover:shadow-elevated'
            }`}
            data-testid={`button-join-${lobby.id}`}
          >
            <Play className="w-4 h-4 mr-2" />
            {lobby.currentPlayers >= lobby.maxPlayers ? 'Lobby Full' : 'Join Now'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Enhanced Collection Card with Stats Information
const CollectionCard = ({ collection, isSelected, onSelect }) => {
  const { data: statTypes, isLoading: isLoadingStats } = useQuery({
    queryKey: ["/api/collections", collection.id, "stat-types"],
    enabled: !!collection.id && collection.isActive, // Only fetch for active collections
  });

  return (
    <Card 
      className={`cursor-pointer transition-all duration-300 hover:scale-105 ${
        isSelected
          ? 'border-accent bg-accent/10 shadow-dialog' 
          : 'hover:border-accent/50'
      }`}
      onClick={() => onSelect(collection)}
      data-testid={`collection-${collection.id}`}
    >
      <CardHeader className="pb-2">
        {collection.imageKey && (
          <div className="w-full h-32 rounded-lg overflow-hidden mb-2">
            <img 
              src={`/api/collections/${collection.id}/cover-image`}
              alt={collection.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <CardTitle className="text-lg">{collection.name}</CardTitle>
        <CardDescription>{collection.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-center">
          <Badge variant={collection.isActive ? "default" : "secondary"}>
            {collection.totalCards} Cards
          </Badge>
          <Badge variant={collection.isActive ? "default" : "destructive"}>
            {collection.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        
        {/* Stats and Units Section */}
        {collection.isActive && (
          <div className="border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Trophy className="w-3 h-3" />
              Battle Stats
            </div>
            {isLoadingStats ? (
              <div className="text-xs text-muted-foreground italic">Loading stats...</div>
            ) : statTypes && statTypes.length > 0 ? (
              <div className="grid grid-cols-2 gap-1">
                {statTypes.map((statType) => (
                  <div key={statType.id} className="text-xs bg-muted/30 rounded px-2 py-1">
                    <span className="font-medium">{statType.statName}</span>
                    {statType.statUnit && (
                      <span className="text-muted-foreground ml-1">({statType.statUnit})</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">No stats defined</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const CollectionSelector = ({ onSelect }) => {
  const { data: collections, isLoading } = useQuery({
    queryKey: ["/api/collections"],
  });

  if (isLoading) return <div className="text-center">Loading collections...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {collections?.map((collection) => (
        <CollectionCard
          key={collection.id}
          collection={collection}
          isSelected={false}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

const JoinLobbyForm = ({ onJoin }) => {
  const [joinCode, setJoinCode] = useState('');
  
  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Join Existing Game
        </CardTitle>
        <CardDescription>Enter a game code to join an existing lobby</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="join-code">Game Code</Label>
          <Input
            id="join-code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            className="text-center text-lg font-mono tracking-wider"
            maxLength={6}
            data-testid="input-join-code"
          />
        </div>
        <Button onClick={() => onJoin(joinCode)}
          disabled={joinCode.length !== 6}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 transition-all duration-300"
          data-testid="button-join-lobby"
        >
          <Play className="w-4 h-4 mr-2" />
          Join Game
        </Button>
      </CardContent>
    </Card>
  );
};

export default function GameLobby() {
  const [, setLocation] = useLocation();
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [selectedGameMode, setSelectedGameMode] = useState(null);
  const [roundTimeSeconds, setRoundTimeSeconds] = useState(5); // Default 5 seconds
  const [gameTimeSeconds, setGameTimeSeconds] = useState(120); // Default 2 minutes
  const [showStartModal, setShowStartModal] = useState(false);
  const [activeTab, setActiveTab] = useState('create');
  const queryClient = useQueryClient();

  // Check authentication status
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: adminCheck } = useQuery({
    queryKey: ["/api/admin/check"],
    retry: false,
    enabled: !!user,
  });

  const isSuperAdmin = adminCheck?.isAdmin || false;
  const isAnonymous = !isLoading && !user;

  const { data: lobbyData } = useQuery({
    queryKey: ["/api/game/lobbies"],
    refetchInterval: 2000, // Faster refresh every 2 seconds for better lobby list sync
  });
  
  const lobbies = lobbyData?.lobbies || [];

  const createLobbyMutation = useMutation({
    mutationFn: async ({ collectionId, gameMode, roundTimeSeconds, gameTimeSeconds }) => {
      return apiRequest(`/api/game/create-lobby`, {
        method: 'POST',
        body: JSON.stringify({ collectionId, gameMode, roundTimeSeconds, gameTimeSeconds }),
      });
    },
    onSuccess: (data) => {
      // Navigate to the game room
      setLocation(`/game/${data.gameRoom.id}`);
    },
    onError: (error) => {
    },
  });

  const joinLobbyMutation = useMutation({
    mutationFn: async (joinCode) => {
      return apiRequest(`/api/game/join-lobby`, {
        method: 'POST',
        body: JSON.stringify({ joinCode }),
      });
    },
    onSuccess: (data) => {
      setLocation(`/game/${data.gameRoom.id}`);
    },
    onError: (error) => {
    },
  });

  const handleCreateLobby = () => {
    if (!selectedCollection || !selectedGameMode) {
      return;
    }

    // For single player, skip lobby and go directly to game with timer settings
    if (selectedGameMode === 'single') {
      // Navigate directly to single player game with timer params
      setLocation(`/single-player/${selectedCollection.id}?roundTime=${roundTimeSeconds}&gameTime=${gameTimeSeconds}`);
      return;
    }

    // For 1v1, skip lobby and use instant matchmaking
    if (selectedGameMode === '1v1') {
      // Navigate directly to multiplayer 1v1 with instant matchmaking
      const gameId = `quick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setLocation(`/multiplayer-1v1/${selectedCollection.id}?roundTime=${roundTimeSeconds}&gameTime=${gameTimeSeconds}&gameId=${gameId}`);
      return;
    }

    // For 4-player mode, create lobby (keep existing system)
    createLobbyMutation.mutate({
      collectionId: selectedCollection.id,
      gameMode: selectedGameMode,
      roundTimeSeconds,
      gameTimeSeconds,
    });
  };

  const handleJoinLobby = (joinCode) => {
    if (joinCode.length !== 6) {
      return;
    }
    joinLobbyMutation.mutate(joinCode);
  };

  const gameModes = [
    {
      mode: 'single',
      title: 'Single Player',
      description: 'Play against AI opponent',
      maxPlayers: 1,
      icon: Zap,
    },
    {
      mode: '1v1',
      title: 'Head to Head',
      description: 'Challenge another player',
      maxPlayers: 2,
      icon: Crown,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Floating Home Button */}
      <FloatingHomeButton />
      
      {/* Premium Header */}
      <div className="bg-primary/20 border-b border-accent/20">
        <div className="container mx-auto px-4 py-6">
          <div className="relative">
            {/* Center Content */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-4 mb-4">
                <h1 className="text-4xl font-bold gradient-text">Game Lobby</h1>
                <div className="flex gap-3">
                  <Button onClick={() => setLocation('/quiz-lobby')}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-2 rounded-lg shadow-elevated hover:shadow-elevated transition-all duration-300 hover:scale-105"
                    data-testid="button-quiz-mode"
                  >
                    <Trophy className="w-4 h-4 mr-2" />
                    Try Quiz Mode!
                  </Button>
                  {isSuperAdmin && (
                    <Button onClick={() => setLocation('/super-admin')}
                      className="bg-warning text-destructive-foreground font-bold px-6 py-2 rounded-lg shadow-elevated hover:shadow-elevated transition-all duration-300 hover:scale-105"
                      data-testid="button-admin-panel"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Admin Panel
                    </Button>
                  )}
                  {user && user.role === 'org_admin' && (
                    <Button onClick={() => setLocation('/org-admin-dashboard')}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-2 rounded-lg shadow-elevated hover:shadow-elevated transition-all duration-300 hover:scale-105"
                      data-testid="button-org-admin-dashboard"
                    >
                      <Building2 className="w-4 h-4 mr-2" />
                      My Organization
                    </Button>
                  )}
                  {user && (user.role === 'teacher' || user.role === 'team_lead') && (
                    <Button onClick={() => setLocation('/teacher-dashboard')}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-2 rounded-lg shadow-elevated hover:shadow-elevated transition-all duration-300 hover:scale-105"
                      data-testid="button-teacher-dashboard"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      My Classes
                    </Button>
                  )}
                  {user && (user.role === 'student' || user.role === 'employee') && (
                    <Button onClick={() => setLocation('/student-dashboard')}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-2 rounded-lg shadow-elevated hover:shadow-elevated transition-all duration-300 hover:scale-105"
                      data-testid="button-student-dashboard"
                    >
                      <Trophy className="w-4 h-4 mr-2" />
                      My Learning
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-muted-foreground">Choose your battle and dominate the competition</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Anonymous User Warning */}
        {isAnonymous && (
          <div className="mb-8 p-4 border-2 border-[var(--warning)]/30 bg-warning/10 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="text-warning mt-1">⚠️</div>
              <div>
                <h3 className="font-bold text-warning mb-2">Playing as Guest</h3>
                <p className="text-sm text-warning/80 mb-3">
                  You're playing anonymously. Your <strong>wins, losses, and achievements will NOT be saved</strong> to the leaderboard.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setLocation('/register')}
                    className="border-primary/50 text-primary hover:bg-primary/10"
                    data-testid="button-create-account"
                  >
                    Create Account
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setLocation('/login')}
                    className="border-secondary/50 text-secondary hover:bg-secondary/10"
                    data-testid="button-sign-in"
                  >
                    Sign In
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Tab bar hidden - using CollectionModal for game creation */}

          <TabsContent value="create" className="space-y-8" forceMount>
            {/* Collection Selection */}
            <div>
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Trophy className="w-6 h-6 text-accent" />
                Choose Collection
              </h2>
              <CollectionSelector 
                onSelect={(collection) => {
                  setSelectedCollection(collection);
                  setShowCollectionModal(true);
                }}
              />
            </div>

            {/* Game Mode Selection */}
            {selectedCollection && (
              <div>
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Timer className="w-6 h-6 text-accent" />
                  Select Game Mode
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {gameModes.map((mode) => (
                    <GameModeCard
                      key={mode.mode}
                      {...mode}
                      isSelected={selectedGameMode === mode.mode}
                      onSelect={setSelectedGameMode}
                    />
                  ))}
                </div>
              </div>
            )}


            {/* Start Game Modal Overlay - Opens automatically when collection and game mode selected */}
            <Dialog open={selectedCollection && selectedGameMode && !createLobbyMutation.isPending} onOpenChange={() => {
              if (!createLobbyMutation.isPending) {
                setSelectedCollection(null);
                setSelectedGameMode(null);
              }
            }}>
              <DialogContent className="w-[95vw] max-w-2xl mx-auto max-h-[90vh] overflow-y-auto border-2 border-accent/30 shadow-dialog bg-background">
                <DialogHeader className="text-center px-2 sm:px-4">
                  <DialogTitle className="text-xl sm:text-2xl md:text-3xl font-bold gradient-text flex items-center justify-center gap-2 flex-wrap">
                    <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-accent" />
                    <span>Ready to Start!</span>
                  </DialogTitle>
                  <DialogDescription className="text-sm sm:text-base mt-2 px-2">
                    You've selected <strong className="break-words">{selectedCollection?.name}</strong> collection 
                    <br className="hidden sm:block" /><span className="sm:hidden"> </span>with <strong>{gameModes.find(m => m.mode === selectedGameMode)?.title}</strong> mode
                  </DialogDescription>
                </DialogHeader>
                
                {/* Timer Settings in Modal */}
                <div className="space-y-4 sm:space-y-6 mt-4 sm:mt-6 px-2 sm:px-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                    {/* Round Time Selection */}
                    <Card className="border-accent/20">
                      <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                        <CardTitle className="text-sm sm:text-base font-medium flex items-center gap-2">
                          <Timer className="w-4 h-4 sm:w-5 sm:h-5" />
                          Round Time
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
                        <div className="space-y-1 sm:space-y-2">
                          {[
                            { value: 3, label: "3 seconds", desc: "Quick rounds" },
                            { value: 5, label: "5 seconds", desc: "Standard" },
                            { value: 10, label: "10 seconds", desc: "Thoughtful" }
                          ].map((option) => (
                            <div
                              key={option.value}
                              onClick={() => setRoundTimeSeconds(option.value)}
                              className={`cursor-pointer p-2 sm:p-3 rounded-lg border transition-all hover:scale-[1.02] ${
                                roundTimeSeconds === option.value 
                                  ? 'border-accent bg-accent/10 text-accent ring-2 ring-accent/20' 
                                  : 'border-muted hover:border-accent/50 hover:bg-accent/5'
                              }`}
                              data-testid={`timer-round-${option.value}`}
                            >
                              <div className="flex justify-between items-center">
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-xs sm:text-sm">{option.label}</div>
                                  <div className="text-xs text-muted-foreground">{option.desc}</div>
                                </div>
                                {roundTimeSeconds === option.value && (
                                  <div className="w-2 h-2 sm:w-3 sm:h-3 bg-accent rounded-full flex-shrink-0 ml-2"></div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Game Duration Selection */}
                    <Card className="border-accent/20">
                      <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                        <CardTitle className="text-sm sm:text-base font-medium flex items-center gap-2">
                          <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                          Game Duration
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
                        <div className="space-y-1 sm:space-y-2">
                          {[
                            { value: 120, label: "2 minutes", desc: "Quick game" },
                            { value: 300, label: "5 minutes", desc: "Standard" },
                            { value: 600, label: "10 minutes", desc: "Extended" }
                          ].map((option) => (
                            <div
                              key={option.value}
                              onClick={() => setGameTimeSeconds(option.value)}
                              className={`cursor-pointer p-2 sm:p-3 rounded-lg border transition-all hover:scale-[1.02] ${
                                gameTimeSeconds === option.value 
                                  ? 'border-accent bg-accent/10 text-accent ring-2 ring-accent/20' 
                                  : 'border-muted hover:border-accent/50 hover:bg-accent/5'
                              }`}
                              data-testid={`timer-game-${option.value}`}
                            >
                              <div className="flex justify-between items-center">
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-xs sm:text-sm">{option.label}</div>
                                  <div className="text-xs text-muted-foreground">{option.desc}</div>
                                </div>
                                {gameTimeSeconds === option.value && (
                                  <div className="w-2 h-2 sm:w-3 sm:h-3 bg-accent rounded-full flex-shrink-0 ml-2"></div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
                
                <div className="text-center space-y-4 mt-6">
                  {/* Prominent Start Game Button */}
                  <Button onClick={handleCreateLobby} disabled={createLobbyMutation.isPending} className="w-full font-bold text-xl py-6 px-8 rounded-lg shadow-elevated hover:shadow-elevated hover:scale-105 transition-all duration-300" data-testid="button-start-game" >
                    <Play className="w-6 h-6 mr-2" />
                    {createLobbyMutation.isPending ? 'Starting Game...' : 'Start Game'}
                  </Button>
                  
                  {/* Cancel Button */}
                  <Button onClick={() => {
                      setSelectedCollection(null);
                      setSelectedGameMode(null);
                    }}
                    variant="outline"
                    className="w-full border-muted-foreground/30 hover:border-muted-foreground/50 text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-change-selection"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Change Selection
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="join" className="space-y-8">
            <JoinLobbyForm onJoin={handleJoinLobby} />
          </TabsContent>

          <TabsContent value="browse" className="space-y-8">
            {/* Browse All Active Lobbies */}
            <div>
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Users className="w-6 h-6 text-accent" />
                Browse Active Lobbies
              </h2>
              <p className="text-muted-foreground mb-6">
                Discover and join multiplayer games created by other players
              </p>

              {lobbies && lobbies.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {lobbies.map((lobby) => (
                    <LobbyCard key={lobby.id} lobby={lobby} onJoin={handleJoinLobby} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-24 h-24 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center">
                    <Users className="w-12 h-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No Active Lobbies</h3>
                  <p className="text-muted-foreground mb-6">
                    There are currently no active lobbies to join. Why not create one?
                  </p>
                  <Button onClick={() => setActiveTab('create')}
                    className="bg-accent"
                    data-testid="button-create-lobby-prompt"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Create New Lobby
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Collection Modal */}
        <CollectionModal
          collection={selectedCollection}
          isOpen={showCollectionModal}
          onClose={() => {
            setShowCollectionModal(false);
            setSelectedCollection(null);
          }}
        />
      </div>
    </div>
  );
}
