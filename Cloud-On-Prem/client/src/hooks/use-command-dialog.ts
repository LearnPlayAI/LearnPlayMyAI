import { useState, useEffect, useCallback } from 'react';

export function useCommandDialog() {
  const [isOpen, setIsOpen] = useState(false);

  const openCommandDialog = useCallback(() => setIsOpen(true), []);
  const closeCommandDialog = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    setIsOpen,
    openCommandDialog,
    closeCommandDialog,
    onOpenChange: setIsOpen,
  };
}
