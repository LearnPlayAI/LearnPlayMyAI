import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { useBrandEditor } from '../BrandEditorShell';

export function PreviewGameQuiz() {
  const { state } = useBrandEditor();
  const brandName = state.brandName || 'LearnPlay';

  const leaderboardData = [
    { rank: 1, name: 'Champion', xp: 15420, isHighlighted: false },
    { rank: 2, name: 'You', xp: 14890, isHighlighted: true },
    { rank: 3, name: 'Challenger', xp: 13560, isHighlighted: false },
  ];

  const powerUps = [
    { icon: '⏱️', name: 'Time Freeze', active: true },
    { icon: '2️⃣', name: '2x Points', active: true },
    { icon: '🎯', name: '50/50', active: false },
    { icon: '💡', name: 'Hint', active: false },
  ];

  return (
    <PreviewFrame className="min-h-[1200px]" data-testid="preview-game-quiz">
      <div className="p-6 space-y-8" style={{ backgroundColor: 'var(--quiz-lobby-bg)' }}>
        <ClickableElement
          editKey="--game-primary"
          className="rounded-xl p-4"
          style={{
            background: 'linear-gradient(135deg, var(--surface-raised), var(--game-surface-highlight))',
            border: '1px solid var(--stroke-default)',
          }}
          data-testid="preview-game-hud-header"
          aria-label="Edit game HUD header"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ 
                  backgroundColor: 'var(--game-primary)',
                  boxShadow: '0 0 15px var(--game-glow)'
                }}
              >
                <span className="text-xl">🧠</span>
              </div>
              <div>
                <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>Quiz Battle</h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Question 3 of 10</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ClickableElement
                editKey="--game-gold"
                className="flex items-center gap-2 px-4 py-2 rounded-lg"
                style={{ 
                  backgroundColor: 'var(--game-gold-light)',
                  border: '1px solid var(--game-gold)',
                  color: 'var(--game-gold)'
                }}
                data-testid="preview-hud-streak"
                aria-label="Edit streak indicator"
              >
                <span>🔥</span>
                <span className="font-bold">x5 Streak</span>
              </ClickableElement>
              <ClickableElement
                editKey="--score-badge-bg"
                className="flex items-center gap-2 px-4 py-2 rounded-lg"
                style={{ 
                  backgroundColor: 'var(--score-badge-bg)',
                  color: 'var(--score-badge-fg)',
                  boxShadow: '0 0 15px var(--game-glow)'
                }}
                data-testid="preview-hud-score"
                aria-label="Edit score display"
              >
                <span className="font-bold text-xl">2,450</span>
                <span className="text-sm">pts</span>
              </ClickableElement>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ClickableElement
              editKey="--game-xp"
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{ 
                backgroundColor: 'var(--game-surface-highlight)',
                border: '1px solid var(--game-xp)'
              }}
              data-testid="preview-hud-xp"
              aria-label="Edit XP counter"
            >
              <span>⭐</span>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>XP Earned</div>
                <div className="font-bold" style={{ color: 'var(--game-xp)' }}>+250</div>
              </div>
            </ClickableElement>
            <ClickableElement
              editKey="--game-gold"
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{ 
                backgroundColor: 'var(--game-gold-light)',
                border: '1px solid var(--game-gold)'
              }}
              data-testid="preview-hud-coins"
              aria-label="Edit coins counter"
            >
              <span>🪙</span>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Coins</div>
                <div className="font-bold" style={{ color: 'var(--game-gold)' }}>+50</div>
              </div>
            </ClickableElement>
            <ClickableElement
              editKey="--game-success"
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{ 
                backgroundColor: 'var(--game-surface-success)',
                border: '1px solid var(--game-success)'
              }}
              data-testid="preview-hud-correct"
              aria-label="Edit correct counter"
            >
              <span>✓</span>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Correct</div>
                <div className="font-bold" style={{ color: 'var(--game-success)' }}>7/10</div>
              </div>
            </ClickableElement>
            <ClickableElement
              editKey="--destructive"
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{ 
                backgroundColor: 'var(--game-surface-error)',
                border: '1px solid var(--destructive)'
              }}
              data-testid="preview-hud-incorrect"
              aria-label="Edit incorrect counter"
            >
              <span>✗</span>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Wrong</div>
                <div className="font-bold" style={{ color: 'var(--destructive)' }}>1/10</div>
              </div>
            </ClickableElement>
          </div>
        </ClickableElement>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="preview-timer-section">
          <ClickableElement
            editKey="--timer-bg"
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: 'var(--timer-bg)', border: '1px solid var(--stroke-default)' }}
            data-section="quiz-timer"
            data-testid="preview-timer-normal"
            aria-label="Edit timer normal state"
          >
            <div className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Timer (Normal)</div>
            <div className="text-4xl font-bold" style={{ color: 'var(--timer-fg)' }} data-testid="preview-timer-normal-value">0:25</div>
            <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--progress-bar-bg)' }}>
              <div className="h-full rounded-full" style={{ width: '83%', backgroundColor: 'var(--progress-bar-fill)' }} />
            </div>
          </ClickableElement>

          <ClickableElement
            editKey="--timer-warning"
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: 'var(--timer-bg)', border: '2px solid var(--timer-warning)' }}
            data-section="quiz-timer-warning"
            data-testid="preview-timer-warning"
            aria-label="Edit timer warning state"
          >
            <div className="text-sm mb-2" style={{ color: 'var(--timer-warning)' }}>Timer (Warning)</div>
            <div className="text-4xl font-bold" style={{ color: 'var(--timer-warning)' }} data-testid="preview-timer-warning-value">0:10</div>
            <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--progress-bar-bg)' }}>
              <div className="h-full rounded-full animate-pulse" style={{ width: '33%', backgroundColor: 'var(--timer-warning)' }} />
            </div>
          </ClickableElement>

          <ClickableElement
            editKey="--timer-critical"
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: 'var(--timer-bg)', border: '2px solid var(--timer-critical)' }}
            data-section="quiz-timer-critical"
            data-testid="preview-timer-critical"
            aria-label="Edit timer critical state"
          >
            <div className="text-sm mb-2" style={{ color: 'var(--timer-critical)' }}>Timer (Critical!)</div>
            <div className="text-4xl font-bold animate-pulse" style={{ color: 'var(--timer-critical)' }} data-testid="preview-timer-critical-value">0:03</div>
            <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--progress-bar-bg)' }}>
              <div className="h-full rounded-full animate-pulse" style={{ width: '10%', backgroundColor: 'var(--timer-critical)' }} />
            </div>
          </ClickableElement>
        </div>

        <ClickableElement
          editKey="--timer-bg"
          className="rounded-xl p-6 flex items-center justify-center"
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--stroke-default)' }}
          data-section="quiz-circular-timer"
          data-testid="preview-circular-timer"
          aria-label="Edit circular timer"
        >
          <div className="relative w-32 h-32" data-testid="preview-circular-timer-display">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--timer-bg)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="45" fill="none"
                stroke="var(--game-primary)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray="283"
                strokeDashoffset="70"
                style={{ filter: 'drop-shadow(0 0 8px var(--game-glow))' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>18</span>
            </div>
          </div>
          <div className="ml-6">
            <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Circular Timer</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>With glow effect</div>
          </div>
        </ClickableElement>

        <ClickableElement
          editKey="--question-card-bg"
          className="rounded-xl p-6"
          style={{
            backgroundColor: 'var(--question-card-bg)',
            border: '1px solid var(--question-card-border)',
          }}
          data-section="quiz-question"
          data-testid="preview-quiz-question-card"
          aria-label="Edit quiz question card"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium px-3 py-1 rounded-full" style={{ backgroundColor: 'var(--pill-bg)', color: 'var(--pill-fg)' }} data-testid="preview-quiz-question-number">
                Question 3 of 10
              </span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }} data-testid="preview-quiz-difficulty">
                Difficulty: Medium
              </span>
            </div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--question-card-fg)', fontFamily: 'var(--font-heading)' }} data-testid="preview-quiz-question-text">
              What is the capital city of France?
            </h2>
            
            <div className="grid gap-3 mt-4" data-testid="preview-quiz-answer-options">
              <ClickableElement
                editKey="--answer-option-bg"
                className="p-4 rounded-lg cursor-pointer transition-all"
                style={{
                  backgroundColor: 'var(--answer-option-bg)',
                  border: '2px solid var(--answer-option-border)',
                  color: 'var(--answer-option-fg)',
                }}
                data-section="quiz-answer-normal"
                data-testid="preview-quiz-answer-normal"
                aria-label="Normal answer option"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium" style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)' }}>A</span>
                  <span>London</span>
                </div>
              </ClickableElement>

              <ClickableElement
                editKey="--answer-option-selected-bg"
                className="p-4 rounded-lg cursor-pointer transition-all"
                style={{
                  backgroundColor: 'var(--answer-option-selected-bg)',
                  border: '2px solid var(--answer-option-selected-border)',
                  color: 'var(--answer-option-selected-fg)',
                }}
                data-section="quiz-answer-selected"
                data-testid="preview-quiz-answer-selected"
                aria-label="Selected answer option"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium" style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}>B</span>
                  <span>Paris (Selected)</span>
                </div>
              </ClickableElement>

              <ClickableElement
                editKey="--answer-option-correct-bg"
                className="p-4 rounded-lg cursor-pointer transition-all"
                style={{
                  backgroundColor: 'var(--answer-option-correct-bg)',
                  border: '2px solid var(--answer-option-correct-border)',
                  color: 'var(--answer-option-correct-fg)',
                }}
                data-section="quiz-answer-correct"
                data-testid="preview-quiz-answer-correct"
                aria-label="Correct answer option"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium" style={{ backgroundColor: 'var(--game-success)', color: 'var(--success-foreground)' }}>✓</span>
                  <span>Paris (Correct!)</span>
                </div>
              </ClickableElement>

              <ClickableElement
                editKey="--answer-option-incorrect-bg"
                className="p-4 rounded-lg cursor-pointer transition-all"
                style={{
                  backgroundColor: 'var(--answer-option-incorrect-bg)',
                  border: '2px solid var(--answer-option-incorrect-border)',
                  color: 'var(--answer-option-incorrect-fg)',
                }}
                data-section="quiz-answer-incorrect"
                data-testid="preview-quiz-answer-incorrect"
                aria-label="Incorrect answer option"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium" style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}>✗</span>
                  <span>Berlin (Incorrect)</span>
                </div>
              </ClickableElement>
            </div>
          </div>
        </ClickableElement>

        <ClickableElement
          editKey="--energy-bar-bg"
          className="rounded-xl p-6"
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--stroke-default)' }}
          data-section="game-hud"
          data-testid="preview-game-hud-section"
          aria-label="Edit game HUD"
        >
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-md)' }} data-testid="preview-hud-title">Game HUD Elements</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4" data-testid="preview-health-energy-bars">
              <div data-testid="preview-health-bar-container">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                    <span>❤️</span> Health
                  </span>
                  <span className="text-sm" style={{ color: 'var(--destructive)' }}>75/100</span>
                </div>
                <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--energy-bar-bg)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: '75%', backgroundColor: 'var(--destructive)', boxShadow: '0 0 8px var(--destructive)' }} data-testid="preview-health-bar-fill" />
                </div>
              </div>
              
              <div data-testid="preview-energy-bar-container">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                    <span>⚡</span> Energy
                  </span>
                  <span className="text-sm" style={{ color: 'var(--energy-bar-fill)' }}>60/100</span>
                </div>
                <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--energy-bar-bg)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: '60%', backgroundColor: 'var(--energy-bar-fill)', boxShadow: '0 0 8px var(--game-glow)' }} data-testid="preview-energy-bar-fill" />
                </div>
              </div>

              <div data-testid="preview-shield-bar-container">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                    <span>🛡️</span> Shield
                  </span>
                  <span className="text-sm" style={{ color: 'var(--game-primary)' }}>45/100</span>
                </div>
                <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--energy-bar-bg)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: '45%', backgroundColor: 'var(--game-primary)', boxShadow: '0 0 8px var(--game-glow)' }} data-testid="preview-shield-bar-fill" />
                </div>
              </div>
            </div>

            <ClickableElement
              editKey="--game-primary"
              className="p-4 rounded-lg"
              style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--stroke-default)' }}
              data-section="powerups"
              data-testid="preview-powerups-section"
              aria-label="Edit powerup indicators"
            >
              <div className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Active Power-Ups</div>
              <div className="flex flex-wrap gap-2">
                {powerUps.map((powerup, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: powerup.active ? 'var(--game-primary)' : 'var(--surface-muted)',
                      color: powerup.active ? 'var(--action-primary-fg)' : 'var(--text-muted)',
                      boxShadow: powerup.active ? '0 0 12px var(--game-glow)' : 'none',
                      opacity: powerup.active ? 1 : 0.5,
                    }}
                    data-testid={`preview-powerup-${i}`}
                  >
                    <span>{powerup.icon}</span>
                    <span>{powerup.name}</span>
                  </div>
                ))}
              </div>
            </ClickableElement>
          </div>
        </ClickableElement>

        <ClickableElement
          editKey="--arena-bg"
          className="rounded-xl overflow-hidden relative"
          style={{
            backgroundColor: 'var(--arena-bg)',
            minHeight: '280px',
          }}
          data-section="battle-arena"
          data-testid="preview-battle-arena-section"
          aria-label="Edit battle arena"
        >
          <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at center, var(--game-glow), transparent 70%)' }} data-testid="preview-arena-glow" />
          
          <div className="relative p-6">
            <h3 className="font-semibold text-center" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-lg)' }} data-testid="preview-arena-title">⚔️ Battle Arena</h3>
            
            <div className="flex items-center justify-center gap-8">
              <ClickableElement
                editKey="--game-card-face-bg"
                className="w-28 h-40 rounded-xl flex flex-col items-center justify-center transform hover:scale-105 transition-transform"
                style={{
                  backgroundColor: 'var(--game-card-face-bg)',
                  border: '3px solid var(--game-card-face-border)',
                  boxShadow: '0 0 25px var(--effect-glow)',
                }}
                data-section="card-face"
                data-testid="preview-card-player"
                aria-label="Edit player card"
              >
                <div className="text-center">
                  <div className="text-4xl mb-2">🃏</div>
                  <div className="text-sm font-medium" style={{ color: 'var(--game-card-face-fg)' }}>Player</div>
                  <div className="mt-2 flex items-center gap-1 px-2 py-1 rounded" style={{ backgroundColor: 'var(--game-primary)', color: 'var(--action-primary-fg)' }}>
                    <span>⭐</span>
                    <span className="text-xs font-bold">Lv.12</span>
                  </div>
                </div>
              </ClickableElement>

              <div className="text-4xl font-bold" style={{ color: 'var(--game-primary)', textShadow: '0 0 20px var(--game-glow)' }} data-testid="preview-arena-vs">VS</div>

              <ClickableElement
                editKey="--game-card-face-bg"
                className="w-28 h-40 rounded-xl flex flex-col items-center justify-center transform hover:scale-105 transition-transform"
                style={{
                  backgroundColor: 'var(--game-card-face-bg)',
                  border: '3px solid var(--destructive)',
                  boxShadow: '0 0 25px var(--destructive)',
                }}
                data-section="card-face-opponent"
                data-testid="preview-card-opponent"
                aria-label="Edit opponent card"
              >
                <div className="text-center">
                  <div className="text-4xl mb-2">👾</div>
                  <div className="text-sm font-medium" style={{ color: 'var(--game-card-face-fg)' }}>Opponent</div>
                  <div className="mt-2 flex items-center gap-1 px-2 py-1 rounded" style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}>
                    <span>⭐</span>
                    <span className="text-xs font-bold">Lv.15</span>
                  </div>
                </div>
              </ClickableElement>
            </div>

            <div className="mt-6 flex justify-center gap-4">
              <div className="px-4 py-2 rounded-lg" style={{ backgroundColor: 'var(--game-surface-success)', border: '1px solid var(--game-success)' }}>
                <span className="text-sm" style={{ color: 'var(--game-success)' }}>Player: 7 wins</span>
              </div>
              <div className="px-4 py-2 rounded-lg" style={{ backgroundColor: 'var(--game-surface-error)', border: '1px solid var(--destructive)' }}>
                <span className="text-sm" style={{ color: 'var(--destructive)' }}>Opponent: 3 wins</span>
              </div>
            </div>
          </div>
        </ClickableElement>

        <ClickableElement
          editKey="--leaderboard-row-bg"
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--stroke-default)' }}
          data-section="quiz-leaderboard"
          data-testid="preview-leaderboard-section"
          aria-label="Edit leaderboard section"
        >
          <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--stroke-default)', backgroundColor: 'var(--surface-muted)' }} data-testid="preview-leaderboard-header">
            <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span>🏆</span> Live Leaderboard
            </h3>
            <span className="text-sm px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--game-primary)', color: 'var(--action-primary-fg)' }}>
              LIVE
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--stroke-default)' }}>
            {leaderboardData.map((player, idx) => (
              <ClickableElement
                key={player.rank}
                editKey={player.isHighlighted ? '--leaderboard-row-highlight-bg' : '--leaderboard-row-bg'}
                className="p-4 flex items-center gap-4 transition-colors"
                style={{
                  backgroundColor: player.isHighlighted ? 'var(--leaderboard-row-highlight-bg)' : idx % 2 === 0 ? 'var(--leaderboard-row-bg)' : 'var(--leaderboard-row-alt-bg)',
                }}
                data-section={player.isHighlighted ? 'leaderboard-highlight' : 'leaderboard-row'}
                data-testid={`preview-leaderboard-row-${player.rank}`}
                aria-label={`Leaderboard rank ${player.rank}`}
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                  style={{ 
                    backgroundColor: player.rank === 1 ? 'var(--game-gold)' : player.rank === 2 ? 'var(--surface-muted)' : 'var(--surface-muted)',
                    color: player.rank === 1 ? 'var(--action-accent-fg)' : 'var(--text-primary)'
                  }}
                >
                  {player.rank === 1 ? '👑' : player.rank}
                </div>
                <div className="flex-1">
                  <p className="font-medium" style={{ color: player.isHighlighted ? 'var(--action-primary)' : 'var(--text-primary)' }}>{player.name}</p>
                  {player.isHighlighted && <span className="text-xs" style={{ color: 'var(--action-primary)' }}>That's you!</span>}
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ backgroundColor: 'var(--game-primary)', color: 'var(--action-primary-fg)', boxShadow: '0 0 10px var(--game-glow)' }}>
                  <span>⭐</span>
                  <span className="font-bold">{player.xp.toLocaleString()}</span>
                </div>
              </ClickableElement>
            ))}
          </div>
        </ClickableElement>

        <ClickableElement
          editKey="--game-success"
          className="rounded-xl overflow-hidden relative"
          style={{
            background: 'linear-gradient(135deg, var(--game-surface-success), var(--game-gold-light))',
            border: '2px solid var(--game-success)',
            boxShadow: '0 0 30px var(--game-surface-success)',
          }}
          data-section="game-result-victory"
          data-testid="preview-result-victory"
          aria-label="Edit victory result overlay"
        >
          <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at center, var(--game-gold), transparent 70%)' }} />
          
          <div className="relative p-6 text-center">
            <div className="text-6xl mb-4">🏆</div>
            <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--game-gold)' }}>VICTORY!</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--success)' }}>Quiz Passed - 85% Correct</p>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--game-surface-highlight)', border: '1px solid var(--game-xp)' }}>
                <div className="text-2xl font-bold" style={{ color: 'var(--game-xp)' }}>+350</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>XP Earned</div>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--game-gold-light)', border: '1px solid var(--game-gold)' }}>
                <div className="text-2xl font-bold" style={{ color: 'var(--game-gold)' }}>+75</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Coins</div>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--game-surface-success)', border: '1px solid var(--game-success)' }}>
                <div className="text-2xl font-bold" style={{ color: 'var(--game-success)' }}>17/20</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Score</div>
              </div>
            </div>

            <div className="p-4 rounded-lg mb-4" style={{ backgroundColor: 'var(--game-surface-highlight)', border: '1px solid var(--action-primary)' }}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-xl">🎉</span>
                <span className="font-bold" style={{ color: 'var(--action-primary)' }}>LEVEL UP!</span>
                <span className="text-xl">🎉</span>
              </div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Level 12 → Level 13</div>
            </div>

            <div className="flex justify-center gap-3">
              <button className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}>
                Play Again
              </button>
              <button className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-primary)' }}>
                Back to Lobby
              </button>
            </div>
          </div>
        </ClickableElement>

        <ClickableElement
          editKey="--destructive"
          className="rounded-xl overflow-hidden relative"
          style={{
            background: 'linear-gradient(135deg, var(--game-surface-error), var(--game-surface-muted))',
            border: '2px solid var(--destructive)',
          }}
          data-section="game-result-defeat"
          data-testid="preview-result-defeat"
          aria-label="Edit defeat result overlay"
        >
          <div className="relative p-6 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--warning)' }}>KEEP TRYING!</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Need 70% to pass - You scored 55%</p>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--game-surface-highlight)', border: '1px solid var(--game-xp)' }}>
                <div className="text-2xl font-bold" style={{ color: 'var(--game-xp)' }}>+100</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>XP for effort</div>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--game-surface-error)', border: '1px solid var(--destructive)' }}>
                <div className="text-2xl font-bold" style={{ color: 'var(--destructive)' }}>11/20</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Correct answers</div>
              </div>
            </div>

            <p className="text-sm mb-4" style={{ color: 'var(--action-primary)' }}>
              💡 Tip: Review the material and try again!
            </p>

            <div className="flex justify-center gap-3">
              <button className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}>
                Try Again
              </button>
              <button className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-primary)' }}>
                Review Lesson
              </button>
            </div>
          </div>
        </ClickableElement>
      </div>
    </PreviewFrame>
  );
}

export default PreviewGameQuiz;
