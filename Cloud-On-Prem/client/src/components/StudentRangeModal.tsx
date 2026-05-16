import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { getDisplayName } from '@/lib/utils';
import { Trophy, Target } from 'lucide-react';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';

interface StudentRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  range: string;
  students: any[];
  isLoading: boolean;
}

export default function StudentRangeModal({ 
  isOpen, 
  onClose, 
  range, 
  students, 
  isLoading 
}: StudentRangeModalProps) {
  const { terminology } = useOrganizationTerminology();
  
  const getPerformanceBadgeVariant = (accuracy: number): "default" | "secondary" | "destructive" | "outline" => {
    if (accuracy >= 80) return 'default';
    if (accuracy >= 60) return 'secondary';
    return 'destructive';
  };

  const getRangeColor = (range: string) => {
    if (range === '80-100%') return 'text-success';
    if (range === '60-80%') return 'text-warning';
    return 'text-destructive';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[85vh] sm:max-h-[80vh] overflow-y-auto bg-card border-border p-4 sm:p-6" data-testid="student-range-modal">
        <DialogHeader className="space-y-2 sm:space-y-3">
          <DialogTitle className="text-foreground flex items-center gap-1 sm:gap-2 text-base sm:text-lg flex-wrap">
            <Target className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span>{terminology?.learnerPlural || 'Learners'} in </span>
            <span className={getRangeColor(range)}>{range}</span>
            <span> Range</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm sm:text-base">
            {students.length} {students.length !== 1 ? (terminology?.learnerPlural?.toLowerCase() || 'learners') : (terminology?.learner?.toLowerCase() || 'learner')} performing in this range
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 sm:space-y-3 mt-3 sm:mt-4">
          {isLoading ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground text-sm sm:text-base">
              Loading {terminology?.learnerPlural?.toLowerCase() || 'learners'}...
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground text-sm sm:text-base">
              No {terminology?.learnerPlural?.toLowerCase() || 'learners'} found in this range
            </div>
          ) : (
            <>
              {students.map((student, index) => (
                <div
                  key={student.userId}
                  className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg bg-muted/50 border border-border hover:border-border/80 transition-colors min-h-[48px] sm:min-h-[44px]"
                  data-testid={`range-student-${student.userId}`}
                >
                  {/* Rank */}
                  <div className="flex-shrink-0 w-6 sm:w-8 text-center">
                    {index < 3 ? (
                      <Trophy className={`w-4 h-4 sm:w-5 sm:h-5 ${index === 0 ? 'text-warning' : index === 1 ? 'text-muted-foreground' : 'text-warning'}`} />
                    ) : (
                      <span className="text-muted-foreground font-medium text-xs sm:text-sm">#{index + 1}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <Avatar className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0">
                    <div className="w-full h-full bg-surface-raised flex items-center justify-center text-btn-primary-foreground font-bold text-sm sm:text-base">
                      {getDisplayName(student).charAt(0)}
                    </div>
                  </Avatar>

                  {/* Learner Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate text-sm sm:text-base" data-testid={`range-student-name-${student.userId}`}>
                      {getDisplayName(student)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {student.totalGames} quiz{student.totalGames !== 1 ? 'zes' : ''} taken
                    </p>
                  </div>

                  {/* Accuracy Badge */}
                  <Badge variant={getPerformanceBadgeVariant(student.accuracy)} className="flex-shrink-0 text-xs sm:text-sm" data-testid={`range-student-accuracy-${student.userId}`} >
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
