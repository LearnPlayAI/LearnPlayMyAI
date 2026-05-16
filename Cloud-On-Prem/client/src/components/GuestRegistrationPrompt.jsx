import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Crown, Trophy, Mail, User, Eye, EyeOff } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { useBrandingLogo } from '@/contexts/BrandingContext';

export default function GuestRegistrationPrompt({ gameResult, onSkip, onClose }) {
  const [showRegistration, setShowRegistration] = useState(false);
  const [formData, setFormData] = useState({
    gamerName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [, setLocation] = useLocation();
  const { orgName } = useBrandingLogo();

  const registerMutation = useMutation({
    mutationFn: async (userData) => {
      return apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
      });
    },
    onSuccess: () => {
      onClose();
      setLocation('/profile');
    },
    onError: (error) => {
    },
  });

  const handleRegister = (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      return;
    }

    registerMutation.mutate({
      gamerName: formData.gamerName,
      email: formData.email,
      password: formData.password,
      confirmPassword: formData.confirmPassword,
    });
  };

  if (!showRegistration) {
    return (
      <div className="fixed inset-0 bg-[var(--modal-overlay)] flex items-center justify-center z-50 p-4 sm:p-6 lg:p-8">
        <Card className="max-w-sm sm:max-w-md lg:max-w-lg w-full border-2 border-[var(--modal-border)] shadow-dialog bg-[var(--modal-bg)]">
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-accent rounded-full flex items-center justify-center">
              <Crown className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold gradient-text">
              Great Game!
            </CardTitle>
            <div className="mt-4 space-y-2">
              <Badge variant={gameResult === 'win' ? 'default' : 'secondary'} className="text-sm px-3 py-1" >
                {gameResult === 'win' ? '🎉 You Won!' : '💪 Good Fight!'}
              </Badge>
              <div className="text-sm text-muted-foreground">
                Join {orgName} to track your wins and climb the leaderboard!
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
              <div className="p-2 sm:p-3 bg-accent/10 rounded-lg">
                <Trophy className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1 text-accent" />
                <div className="text-xs sm:text-sm font-medium">Track Wins</div>
              </div>
              <div className="p-2 sm:p-3 bg-accent/10 rounded-lg">
                <Crown className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1 text-accent" />
                <div className="text-xs sm:text-sm font-medium">Leaderboard</div>
              </div>
              <div className="p-2 sm:p-3 bg-accent/10 rounded-lg">
                <User className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1 text-accent" />
                <div className="text-xs sm:text-sm font-medium">Profile</div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Button onClick={() => setShowRegistration(true)}
                className="w-full bg-accent"
                data-testid="button-show-registration"
              >
                <Mail className="w-4 h-4 mr-2" />
                Join {orgName} (Free)
              </Button>
              
              <Button variant="ghost" onClick={onSkip} className="w-full" data-testid="button-skip-registration" >
                Maybe Later
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[var(--modal-overlay)] flex items-center justify-center z-50 p-4 sm:p-6 lg:p-8">
      <Card className="max-w-sm sm:max-w-md lg:max-w-lg w-full border-2 border-[var(--modal-border)] shadow-dialog bg-[var(--modal-bg)] max-h-[90vh] overflow-y-auto">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-lg sm:text-xl font-bold gradient-text">
            Create Your Account
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Join thousands of players competing for glory!
          </div>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gamerName">Gamer Name</Label>
              <Input
                id="gamerName"
                type="text"
                value={formData.gamerName}
                onChange={(e) => setFormData({ ...formData, gamerName: e.target.value })}
                placeholder="Enter your gamer name"
                required
                data-testid="input-gamer-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter your email"
                required
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Create a password"
                  required
                  data-testid="input-password"
                />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2" onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Confirm your password"
                required
                data-testid="input-confirm-password"
              />
            </div>

            <div className="space-y-2 pt-4">
              <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="button-register" >
                {registerMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    Creating Account...
                  </>
                ) : (
                  <>
                    <Crown className="w-4 h-4 mr-2" />
                    Join {orgName}
                  </>
                )}
              </Button>
              
              <Button type="button" variant="ghost" onClick={onSkip} className="w-full" data-testid="button-skip-registration-form" >
                Skip for Now
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}