'use client';

import { useEffect, useState } from 'react';

const greetings = [
  'Welcome back',
  'Salutations',
  "Glad you're back",
  'Hey again',
  'Great to have you back',
  'We missed you around here',
  'Good to see you again',
  'Nice to see you',
  "Look who's back",
  "You're back",
  'Hello again',
  'Happy to see you',
  "It's good to have you here",
  'Ready for another round',
  'Back for more',
  'Welcome home',
  'Good to have you around',
  'Nice to have you back',
  'Here we go again',
  'Great to see you',
  'Glad you stopped by',
  'Your dashboard awaits',
  "Let's get things rolling",
  'Welcome in',
  'Hey there',
] as const;

export default function DashboardGreeting({ username }: { username: string }) {
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const key = `dashboard-greeting:${username}`;
      let previous = -1;
      try {
        const stored = window.sessionStorage.getItem(key);
        if (stored !== null) {
          const index = Number(stored);
          if (Number.isInteger(index) && index >= 0 && index < greetings.length) previous = index;
        }
      } catch { /* A greeting still works when browser storage is unavailable. */ }

      const offset = Math.floor(Math.random() * (greetings.length - (previous < 0 ? 0 : 1)));
      const next = previous < 0 ? offset : offset >= previous ? offset + 1 : offset;
      setGreeting(greetings[next]);
      try { window.sessionStorage.setItem(key, String(next)); } catch { /* Storage is optional. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [username]);

  return <p className="section-sub">{greeting ? `${greeting}, ${username}.` : '\u00a0'}</p>;
}
