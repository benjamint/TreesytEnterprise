import { useEffect } from 'react';
import { useDemoStore, type DemoNote } from '@/stores/demoStore';

/** Register notes about the current page for the Demo panel (shown collapsed, never on the page itself). */
export function useDemoNotes(notes: DemoNote[]) {
  const setNotes = useDemoStore((s) => s.setNotes);
  const key = JSON.stringify(notes);
  useEffect(() => {
    setNotes(JSON.parse(key) as DemoNote[]);
    return () => setNotes([]);
  }, [key, setNotes]);
}
