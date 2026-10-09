import { useEffect, useState } from 'react';
import { localToday } from '../domain/dates';

/**
 * The user's calendar day as YYYY-MM-DD. Read again whenever the page comes
 * back into view, so a library tab left open overnight shows yesterday's last
 * day as expired once it is looked at again.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => localToday(new Date()));

  useEffect(() => {
    const refresh = () => setToday(localToday(new Date()));
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return today;
}
