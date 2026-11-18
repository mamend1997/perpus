import { useEffect } from 'react';

export default function useSchoolFavicon(logo) {
  useEffect(() => {
    if (!logo) return undefined;
    let favicon = document.querySelector('link[rel~="icon"]');
    const created = !favicon;
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    const previousHref = favicon.getAttribute('href');
    favicon.href = logo;
    return () => {
      if (created) favicon.remove();
      else if (previousHref) favicon.href = previousHref;
      else favicon.remove();
    };
  }, [logo]);
}
