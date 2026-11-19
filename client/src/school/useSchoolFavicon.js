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
    const previousType = favicon.getAttribute('type');
    favicon.href = logo;
    favicon.type = logo.slice(5, logo.indexOf(';'));
    return () => {
      if (created) favicon.remove();
      else if (previousHref) {
        favicon.href = previousHref;
        if (previousType) favicon.type = previousType;
        else favicon.removeAttribute('type');
      } else favicon.remove();
    };
  }, [logo]);
}
