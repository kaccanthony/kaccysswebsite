// useModalVisibility.ts — replace the whole file with this
import { useEffect, useState } from 'react';

export function useModalVisibility(open: boolean, duration = 300) {
  const [shouldRender, setShouldRender] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      const t = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
      const t = setTimeout(() => setShouldRender(false), duration);
      return () => clearTimeout(t);
    }
  }, [open, duration]);

  return { shouldRender, visible };
}