import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { getDisplayName } from '@/lib/utils';
import { Activity, AlertTriangle } from 'lucide-react';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';

interface EngagementPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: any[];
  gamesPlayed: number;
  accuracy: number;
}

export default function EngagementPerformanceModal({ 
  isOpen, 
  onClose, 
  students,
  gamesPlayed,
  accuracy
}: EngagementPerformanceModalProps) {
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || {
    learner: 'Learner',
    learnerPlural: 'Learners',
  };
  const learnerLower = terminology.learner.toLowerCase();
  const learnerPluralLower = terminology.learnerPlural.toLowerCase();
  const getPerformanceBadgeVariant = (accuracy: number): "default" | "secondary" | "destructive" | "outline" => {
    if (accuracy >= 80) return 'default';
    if (accuracy >= 60) return 'secondary';
    return 'destructive';
  };

  const getRiskColor = (riskLevel: string) => {
    if (riskLevel === 'critical') return 'text-destructive';
    if (riskLevel === 'warning') return 'text-warning';
    return 'text-success';
  };

  const getRiskLabel = (riskLevel: string) => {
    if (riskLevel === 'critical') return 'Critical';
    if (riskLevel === 'warning') return 'Needs Attention';
    return 'On Track';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] sm:max-h-[80vh] overflow-y-auto bg-card border-border p-4 sm:p-6" data-testid="engagement-performance-modal">
        <DialogHeader className="space-y-2 sm:space-y-3">
          <DialogTitle className="text-foreground flex items-center gap-2 text-base sm:text-lg">
            <Activity className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span>{terminology.learnerPlural} at this Performance Level</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm sm:text-base">
              {students.length} {students.length !== 1 ? learnerPluralLower : learnerLower} with {gamesPlayed} game{gamesPlayed !== 1 ? 's' : ''} played and {Math.round(accuracy)}% accuracy
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 sm:space-y-3 mt-3 sm:mt-4">
          {students.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground text-sm sm:text-base">
                  No {learnerPluralLower} found at this level
            </div>
          ) : (
            <>
              {students.map((student) => (
                <div
                  key={student.name}
                  className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg bg-muted/50 border border-border hover:border-border/80 transition-colors min-h-[48px] sm:min-h-[44px]"
                  data-testid={`engagement-student-${student.name}`}
                >
                  {/* Risk Indicator */}
                  <div className="flex-shrink-0">
                    <AlertTriangle className={`w-4 h-4 sm:w-5 sm:h-5 ${getRiskColor(student.riskLevel)}`} />
                  </div>

                  {/* Avatar */}
                  <Avatar className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0">
                    <div className="w-full h-full bg-surface-raised flex items-center justify-center text-btn-primary-foreground font-bold text-sm sm:text-base">
                      {student.name.charAt(0)}
                    </div>
                  </Avatar>

                  {/* Learner info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate text-sm sm:text-base" data-testid={`engagement-student-name-${student.name}`}>
                      {student.name}
                    </p>
                    <div className="flex items-center gap-1 sm:gap-2 text-xs text-muted-foreground">
                      <span className={getRiskColor(student.riskLevel)}>
                        {getRiskLabel(student.riskLevel)}
                      </span>
                      <span>•</span>
                      <span>{student.gamesPlayed} game{student.gamesPlayed !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {/* Accuracy Badge */}
                  <Badge variant={getPerformanceBadgeVariant(student.accuracy)} className="flex-shrink-0 text-xs sm:text-sm" data-testid={`engagement-student-accuracy-${student.name}`} >
                    {student.accuracy}%
                  </Badge>
                </div>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
