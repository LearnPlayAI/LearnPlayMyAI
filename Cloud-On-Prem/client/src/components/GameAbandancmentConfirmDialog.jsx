import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

export default function GameAbandonmentConfirmDialog({ 
  isOpen, 
  onOpenChange, 
  onConfirm, 
  gameMode = "game" 
}) {
  const gameTypeText = gameMode === "single" ? "Single Player" : 
                       gameMode === "1v1" ? "1v1 Multiplayer" : "Multiplayer";

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md mx-4 sm:mx-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive text-lg sm:text-xl">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>Leave Active Game?</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p className="text-sm sm:text-base">
              You're about to leave an active {gameTypeText} game. This will result in:
            </p>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2 sm:p-3 space-y-2">
              <div className="flex items-center gap-2 text-destructive font-medium text-sm sm:text-base">
                <span>⚠️</span>
                <span>Abandonment Penalty</span>
              </div>
              <ul className="text-xs sm:text-sm space-y-1 ml-4 sm:ml-6">
                <li>• <strong>-30 XP</strong> deducted from your account</li>
                <li>• <strong>+1 Loss</strong> added to your record</li>
                <li>• Your opponent (if any) will be declared the winner</li>
              </ul>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              This penalty helps maintain fair play for all players. Are you sure you want to continue?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <AlertDialogCancel 
            className="min-h-[48px] sm:min-h-[44px] w-full sm:w-auto"
            data-testid="button-cancel-leave"
          >
            Stay in Game
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className="min-h-[48px] sm:min-h-[44px] w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-leave"
          >
            Leave Game (-30 XP)
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}