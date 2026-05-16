import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { useBrandEditor } from '../BrandEditorShell';

export function PreviewQuizLobby() {
  const { state } = useBrandEditor();
  const brandName = state.brandName || 'LearnPlay';

  const leaderboard = [
    { rank: 1, name: 'Alex M.', xp: 15420, avatar: '🏆' },
    { rank: 2, name: 'Sarah K.', xp: 14890, avatar: '🥈' },
    { rank: 3, name: 'Mike J.', xp: 13560, avatar: '🥉' },
    { rank: 4, name: 'Emma W.', xp: 12340, avatar: '4' },
    { rank: 5, name: 'Chris P.', xp: 11890, avatar: '5' },
  ];

  const quizCollections = [
    { 
      name: 'Science Quiz', 
      desc: 'Test your science knowledge', 
      questions: 15, 
      difficulty: 'Easy',
      xpReward: 150,
      duration: '5 min',
      passPercentage: 70,
      status: 'passed',
      grade: 'Grade 7',
      subject: 'Science'
    },
    { 
      name: 'History Challenge', 
      desc: 'Explore world history', 
      questions: 20, 
      difficulty: 'Medium',
      xpReward: 250,
      duration: '8 min',
      passPercentage: 75,
      status: 'outstanding',
      grade: 'Grade 8',
      subject: 'History'
    },
    { 
      name: 'Math Masters', 
      desc: 'Advanced mathematics', 
      questions: 25, 
      difficulty: 'Hard',
      xpReward: 400,
      duration: '12 min',
      passPercentage: 80,
      status: 'failed',
      grade: 'Grade 9',
      subject: 'Mathematics'
    },
  ];

  const categoryFilters = [
    { name: 'All', active: true },
    { name: 'Science', active: false },
    { name: 'History', active: false },
    { name: 'Math', active: false },
    { name: 'Languages', active: false },
  ];

  const getDifficultyStyles = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'easy':
        return {
          bg: 'var(--success)',
          bgAlpha: 'color-mix(in srgb, var(--success) 20%, transparent)',
          border: 'var(--success)',
          fg: 'var(--success)'
        };
      case 'medium':
        return {
          bg: 'var(--warning)',
          bgAlpha: 'color-mix(in srgb, var(--warning) 20%, transparent)',
          border: 'var(--warning)',
          fg: 'var(--warning)'
        };
      case 'hard':
        return {
          bg: 'var(--destructive)',
          bgAlpha: 'color-mix(in srgb, var(--destructive) 20%, transparent)',
          border: 'var(--destructive)',
          fg: 'var(--destructive)'
        };
      default:
        return {
          bg: 'var(--action-primary)',
          bgAlpha: 'color-mix(in srgb, var(--action-primary) 20%, transparent)',
          border: 'var(--action-primary)',
          fg: 'var(--action-primary)'
        };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'passed':
        return { icon: '✓', text: 'Passed', bg: 'var(--success)', fg: 'var(--success-foreground)' };
      case 'failed':
        return { icon: '✗', text: 'Failed', bg: 'var(--destructive)', fg: 'var(--destructive-foreground)' };
      case 'outstanding':
        return { icon: '⏱', text: 'Outstanding', bg: 'var(--surface-muted)', fg: 'var(--action-accent)' };
      default:
        return { icon: '○', text: 'Not Started', bg: 'var(--surface-muted)', fg: 'var(--text-muted)' };
    }
  };

  return (
    <PreviewFrame className="min-h-[800px]" data-testid="preview-quiz">
      <ClickableElement 
        editKey="--gradient-primary-from"
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, var(--gradient-primary-from), var(--gradient-primary-to))`,
        }}
        data-testid="preview-quiz-hero"
        aria-label="Edit quiz hero gradient"
      >
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 left-10 w-32 h-32 rounded-full blur-2xl" style={{ backgroundColor: 'var(--game-glow)' }} data-testid="preview-quiz-glow-effect-1" />
          <div className="absolute bottom-10 right-10 w-48 h-48 rounded-full blur-2xl" style={{ backgroundColor: 'var(--game-glow)' }} data-testid="preview-quiz-glow-effect-2" />
        </div>
        
        <div className="relative p-6" data-testid="preview-quiz-hero-content">
          <div className="flex items-center justify-between mb-6" data-testid="preview-quiz-hero-header">
            <div>
              <ClickableElement 
                editKey="brand-identity" 
                as="h1" 
                className="text-2xl font-bold" 
                style={{ color: 'var(--action-primary-fg)', fontFamily: 'var(--font-heading)' }}
                data-testid="preview-quiz-title"
                aria-label="Edit quiz arena title"
              >
                Quiz Arena
              </ClickableElement>
              <p className="text-sm opacity-80" style={{ color: 'var(--action-primary-fg)', fontFamily: 'var(--font-body)' }} data-testid="preview-quiz-subtitle">
                Test your knowledge and earn XP
              </p>
            </div>
            <ClickableElement 
              editKey="--game-primary"
              className="flex items-center gap-2 px-4 py-2 rounded-lg"
              style={{ 
                backgroundColor: 'var(--game-primary)', 
                color: 'var(--action-primary-fg)',
                boxShadow: '0 0 20px var(--game-glow)'
              }}
              data-testid="preview-quiz-xp-badge"
              aria-label="Edit XP badge style"
            >
              <span>⭐</span>
              <span className="font-bold">2,450 XP</span>
            </ClickableElement>
          </div>

          <div className="flex gap-4 flex-wrap" data-testid="preview-quiz-stats">
            <ClickableElement
              editKey="--game-gold"
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ 
                backgroundColor: 'color-mix(in srgb, var(--action-primary-fg) 15%, transparent)', 
                color: 'var(--action-primary-fg)',
                border: '1px solid color-mix(in srgb, var(--action-primary-fg) 20%, transparent)'
              }}
              data-testid="preview-quiz-stat-streak"
              aria-label="Edit streak badge"
            >
              <span>🔥</span>
              <span className="font-medium">5 Day Streak</span>
            </ClickableElement>
            <ClickableElement
              editKey="--game-xp"
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ 
                backgroundColor: 'color-mix(in srgb, var(--action-primary-fg) 15%, transparent)', 
                color: 'var(--action-primary-fg)',
                border: '1px solid color-mix(in srgb, var(--action-primary-fg) 20%, transparent)'
              }}
              data-testid="preview-quiz-stat-coins"
              aria-label="Edit coins badge"
            >
              <span>🪙</span>
              <span className="font-medium">1,250 Coins</span>
            </ClickableElement>
            <ClickableElement
              editKey="--game-success"
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ 
                backgroundColor: 'color-mix(in srgb, var(--action-primary-fg) 15%, transparent)', 
                color: 'var(--action-primary-fg)',
                border: '1px solid color-mix(in srgb, var(--action-primary-fg) 20%, transparent)'
              }}
              data-testid="preview-quiz-stat-level"
              aria-label="Edit level badge"
            >
              <span>⚡</span>
              <span className="font-medium">Level 12</span>
            </ClickableElement>
          </div>
        </div>
      </ClickableElement>

      <div className="p-6 space-y-6" style={{ backgroundColor: 'var(--surface-primary)' }} data-testid="preview-quiz-main-content">
        <div data-testid="preview-quiz-filters-section">
          <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-md)' }} data-testid="preview-quiz-filters-title">
            <span>🔍</span> Filter by Category
          </h2>
          <ClickableElement
            editKey="--filter-pill-bg"
            className="flex flex-wrap gap-2"
            data-testid="preview-quiz-filter-chips"
            aria-label="Edit category filter chips"
          >
            {categoryFilters.map((filter, i) => (
              <div
                key={i}
                className="px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer"
                style={{ 
                  backgroundColor: filter.active ? 'var(--filter-pill-active-bg)' : 'var(--filter-pill-bg)',
                  color: filter.active ? 'var(--filter-pill-active-fg)' : 'var(--filter-pill-fg)',
                  border: `1px solid ${filter.active ? 'var(--action-primary)' : 'var(--stroke-default)'}`,
                }}
                data-testid={`preview-quiz-filter-chip-${i}`}
              >
                {filter.name}
              </div>
            ))}
          </ClickableElement>
        </div>

        <div data-testid="preview-quiz-collections-section">
          <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-md)' }} data-testid="preview-quiz-collections-title">
            <span>📚</span> Available Quizzes
          </h2>
          <div className="grid grid-cols-1 gap-4" data-testid="preview-quiz-collections-grid">
            {quizCollections.map((quiz, i) => {
              const diffStyles = getDifficultyStyles(quiz.difficulty);
              const statusBadge = getStatusBadge(quiz.status);
              
              return (
                <ClickableElement
                  key={i}
                  editKey="--card"
                  className="p-5 rounded-xl transition-all"
                  style={{ 
                    backgroundColor: 'var(--surface-raised)', 
                    border: '1px solid var(--stroke-default)',
                    boxShadow: '0 0 0 0 var(--game-glow)',
                  }}
                  data-testid={`preview-quiz-collection-card-${i}`}
                  aria-label={`Quiz collection: ${quiz.name}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }} data-testid={`preview-quiz-collection-name-${i}`}>
                        {quiz.name}
                      </h3>
                      <p className="text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', marginTop: 'var(--space-xs)' }}>
                        {quiz.desc}
                      </p>
                    </div>
                    <div 
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                      style={{ 
                        backgroundColor: statusBadge.bg,
                        color: statusBadge.fg
                      }}
                      data-testid={`preview-quiz-status-badge-${i}`}
                    >
                      <span>{statusBadge.icon}</span>
                      <span>{statusBadge.text}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <ClickableElement
                      editKey="--secondary"
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{ 
                        backgroundColor: 'var(--action-secondary)',
                        color: 'var(--action-secondary-fg)'
                      }}
                      data-testid={`preview-quiz-grade-badge-${i}`}
                      aria-label="Grade badge"
                    >
                      {quiz.grade}
                    </ClickableElement>
                    <ClickableElement
                      editKey="--primary"
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{ 
                        backgroundColor: 'var(--action-primary)',
                        color: 'var(--action-primary-fg)'
                      }}
                      data-testid={`preview-quiz-subject-badge-${i}`}
                      aria-label="Subject badge"
                    >
                      {quiz.subject}
                    </ClickableElement>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <span>📝</span>
                      <span>{quiz.questions} Questions</span>
                    </div>
                    <ClickableElement
                      editKey="--timer-fg"
                      className="flex items-center gap-1 text-sm"
                      style={{ color: 'var(--text-muted)' }}
                      data-testid={`preview-quiz-duration-${i}`}
                      aria-label="Quiz duration"
                    >
                      <span>⏱</span>
                      <span>{quiz.duration}</span>
                    </ClickableElement>
                    <ClickableElement
                      editKey={diffStyles.fg === 'var(--success)' ? '--success' : diffStyles.fg === 'var(--warning)' ? '--warning' : '--destructive'}
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{ 
                        backgroundColor: diffStyles.bgAlpha,
                        color: diffStyles.fg,
                        border: `1px solid ${diffStyles.border}`
                      }}
                      data-testid={`preview-quiz-difficulty-badge-${i}`}
                      aria-label={`Difficulty: ${quiz.difficulty}`}
                    >
                      {quiz.difficulty}
                    </ClickableElement>
                    <div 
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{ 
                        backgroundColor: 'color-mix(in srgb, var(--success) 20%, transparent)',
                        color: 'var(--success)',
                        border: '1px solid var(--success)'
                      }}
                      data-testid={`preview-quiz-pass-percentage-${i}`}
                    >
                      Pass: {quiz.passPercentage}%
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <ClickableElement
                      editKey="--game-xp"
                      className="flex items-center gap-2 px-3 py-1 rounded-full"
                      style={{ 
                        backgroundColor: 'color-mix(in srgb, var(--game-xp) 15%, transparent)',
                        color: 'var(--game-xp)',
                        boxShadow: '0 0 10px var(--game-glow)'
                      }}
                      data-testid={`preview-quiz-xp-reward-${i}`}
                      aria-label="XP reward"
                    >
                      <span>⭐</span>
                      <span className="font-bold">+{quiz.xpReward} XP</span>
                    </ClickableElement>
                    <ClickableElement 
                      editKey="--primary"
                      className="px-6 py-2 rounded-lg font-medium"
                      style={{ 
                        background: 'linear-gradient(135deg, var(--action-secondary), var(--action-primary))',
                        color: 'var(--action-primary-fg)'
                      }}
                      data-testid={`preview-quiz-start-button-${i}`}
                      aria-label={`Start ${quiz.name}`}
                    >
                      Start Quiz
                    </ClickableElement>
                  </div>
                </ClickableElement>
              );
            })}
          </div>
        </div>

        <ClickableElement 
          editKey="--leaderboard-row-bg"
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--stroke-default)' }}
          data-testid="preview-quiz-leaderboard-card"
          aria-label="Edit leaderboard card style"
        >
          <div 
            className="p-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--stroke-default)', backgroundColor: 'var(--surface-muted)' }}
            data-testid="preview-quiz-leaderboard-header"
          >
            <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              🏆 Leaderboard
            </h2>
            <span 
              className="text-sm px-2 py-1 rounded-full"
              style={{ backgroundColor: 'var(--game-primary)', color: 'var(--action-primary-fg)' }}
              data-testid="preview-quiz-leaderboard-live"
            >
              LIVE
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--stroke-default)' }}>
            {leaderboard.map((player, idx) => (
              <ClickableElement 
                key={player.rank} 
                editKey={idx % 2 === 0 ? '--leaderboard-row-bg' : '--leaderboard-row-alt-bg'}
                className="p-4 flex items-center gap-4 transition-colors"
                style={{ 
                  backgroundColor: idx % 2 === 0 ? 'var(--leaderboard-row-bg)' : 'var(--leaderboard-row-alt-bg)'
                }}
                data-testid={`preview-quiz-leaderboard-row-${player.rank}`}
                aria-label={`Leaderboard rank ${player.rank}`}
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                  style={{ 
                    backgroundColor: player.rank === 1 ? 'var(--game-gold)' : player.rank === 2 ? 'var(--surface-muted)' : player.rank === 3 ? 'var(--game-gold-light)' : 'var(--surface-muted)',
                    color: player.rank <= 3 ? 'var(--action-accent-fg)' : 'var(--text-muted)'
                  }}
                  data-testid={`preview-quiz-leaderboard-avatar-${player.rank}`}
                >
                  {player.avatar}
                </div>
                <div className="flex-1">
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }} data-testid={`preview-quiz-leaderboard-name-${player.rank}`}>
                    {player.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Rank #{player.rank}
                  </p>
                </div>
                <ClickableElement 
                  editKey="--game-primary"
                  className="flex items-center gap-1 px-3 py-1 rounded-full text-sm"
                  style={{ 
                    backgroundColor: 'var(--game-primary)', 
                    color: 'var(--action-primary-fg)',
                    boxShadow: '0 0 10px var(--game-glow)'
                  }}
                  data-testid={`preview-quiz-leaderboard-xp-${player.rank}`}
                  aria-label={`${player.name}'s XP: ${player.xp}`}
                >
                  <span>⭐</span>
                  <span>{player.xp.toLocaleString()}</span>
                </ClickableElement>
              </ClickableElement>
            ))}
          </div>
        </ClickableElement>

        <ClickableElement
          editKey="--energy-bar-bg"
          className="rounded-xl p-5"
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--stroke-default)' }}
          data-testid="preview-quiz-progress-section"
          aria-label="Edit progress section"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <span>📊</span> Your Progress
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                  ⭐ Level Progress
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--game-xp)' }}>Level 12 → 13</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--energy-bar-bg)' }}>
                <div 
                  className="h-full rounded-full transition-all" 
                  style={{ 
                    width: '65%', 
                    backgroundColor: 'var(--game-xp)',
                    boxShadow: '0 0 8px var(--game-glow)' 
                  }} 
                  data-testid="preview-quiz-level-progress-bar" 
                />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>650 / 1000 XP to next level</p>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                  🎯 Quizzes Completed
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>8 / 10</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--energy-bar-bg)' }}>
                <div 
                  className="h-full rounded-full transition-all" 
                  style={{ 
                    width: '80%', 
                    backgroundColor: 'var(--success)',
                  }} 
                  data-testid="preview-quiz-completion-progress-bar" 
                />
              </div>
            </div>
          </div>
        </ClickableElement>
      </div>
    </PreviewFrame>
  );
}

export default PreviewQuizLobby;
