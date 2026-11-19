function parseHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function getPdfEmbedUrl(value) {
  const url = parseHttpsUrl(value);
  if (!url) return null;
  if (url.hostname === 'drive.google.com') {
    const fileId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get('id');
    if (fileId && /^[A-Za-z0-9_-]+$/.test(fileId)) {
      return `https://drive.google.com/file/d/${fileId}/preview`;
    }
  }
  return url.href;
}

export function getVideoEmbed(value) {
  const url = parseHttpsUrl(value);
  if (!url) return null;
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (hostname === 'youtu.be' || hostname === 'youtube.com' || hostname === 'youtube-nocookie.com') {
    const videoId = hostname === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    return { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${videoId}` };
  }
  if (hostname === 'vimeo.com' || hostname === 'player.vimeo.com') {
    const videoId = url.pathname.split('/').filter(Boolean).find((part) => /^\d+$/.test(part));
    if (!videoId) return null;
    const embed = new URL(`https://player.vimeo.com/video/${videoId}`);
    const privacyHash = url.searchParams.get('h');
    if (privacyHash && /^[A-Za-z0-9]+$/.test(privacyHash)) embed.searchParams.set('h', privacyHash);
    return { type: 'iframe', src: embed.href };
  }
  if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) return { type: 'video', src: url.href };
  return null;
}

export function isValidGuideUrl(value, kind) {
  if (value === '') return true;
  return kind === 'pdf' ? Boolean(getPdfEmbedUrl(value)) : Boolean(getVideoEmbed(value));
}
