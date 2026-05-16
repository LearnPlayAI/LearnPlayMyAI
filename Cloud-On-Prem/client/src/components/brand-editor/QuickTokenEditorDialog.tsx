import { useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColorPicker } from './ColorPicker';
import { useBrandEditor } from './BrandEditorShell';
import { buildQuickEditGroup, isColorToken, tokenLabel } from './tokenQuickEdit';

export function QuickTokenEditorDialog() {
  const {
    state,
    updateToken,
    isSaving,
    hasChanges,
    pendingTokenChanges,
    save,
    scrollToSection,
    quickEditKey,
    closeQuickEdit,
  } = useBrandEditor();

  const group = useMemo(() => {
    if (!quickEditKey) return null;
    return buildQuickEditGroup(quickEditKey, Object.keys(state.tokens || {}));
  }, [quickEditKey, state.tokens]);

  return (
    <Dialog open={!!quickEditKey} onOpenChange={(open) => (!open ? closeQuickEdit() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{group?.title || 'Quick Editor'}</DialogTitle>
          <DialogDescription>{group?.description || 'Edit token values for the selected UI element.'}</DialogDescription>
          {group?.components && group.components.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Primitive contracts: {group.components.join(', ')}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">Target theme: {state.brandName || 'Current Theme'}</p>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="space-y-3">
            {(group?.tokens || []).map((tokenKey) => {
              const current = state.tokens[tokenKey] || '';
              if (isColorToken(tokenKey)) {
                return (
                  <div key={tokenKey} className="space-y-2 rounded-lg border p-3">
                    <ColorPicker
                      label={tokenLabel(tokenKey)}
                      description={tokenKey}
                      value={current}
                      onChange={(value) => updateToken(tokenKey, value)}
                    />
                    <div className="rounded-md border p-2" style={{ borderColor: 'var(--stroke-default)' }}>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Live Preview</p>
                      <div
                        className="rounded px-2 py-2 text-sm font-medium border"
                        style={{
                          backgroundColor: current || 'var(--surface-primary)',
                          color: 'var(--text-primary)',
                          borderColor: 'var(--stroke-default)',
                        }}
                      >
                        {tokenLabel(tokenKey)}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={tokenKey} className="rounded-lg border p-3 space-y-2">
                  <Label className="text-sm">{tokenLabel(tokenKey)}</Label>
                  <Input value={current} onChange={(e) => updateToken(tokenKey, e.target.value)} />
                  <p className="text-xs text-muted-foreground">{tokenKey}</p>
                  <div className="rounded-md border p-2" style={{ borderColor: 'var(--stroke-default)' }}>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Live Preview</p>
                    <div className="rounded px-2 py-2 text-sm font-medium border" style={{ borderColor: 'var(--stroke-default)' }}>
                      {current || tokenKey}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" onClick={() => {
              if (quickEditKey) scrollToSection(quickEditKey);
            }}
          >
            Open In Left Panel
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={closeQuickEdit}>
              Close
            </Button>
            <Button onClick={async () => {
                await save();
              }}
              disabled={!hasChanges || isSaving}
              data-testid="button-quick-save-theme"
            >
              {isSaving ? 'Saving...' : `Save Theme Changes (${pendingTokenChanges})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default QuickTokenEditorDialog;
