// Zdjęcia i filmy ćwiczeń: miniatury, odtwarzacz, linki do YouTube.

import { html, initials } from './ui.js';
import { icons } from './icons.js';

export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function youTubeId(value) {
  if (!isHttpUrl(value)) return null;
  const url = new URL(value);
  const host = url.hostname.replace(/^(www|m)\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
  }
  return id && /^[\w-]{6,20}$/.test(id) ? id : null;
}

// Mała miniatura do list.
export function exerciseThumb(exercise) {
  const yt = youTubeId(exercise?.video_url);
  if (exercise?.media_type === 'image') {
    return html`<img class="thumb" src="${exercise.media_url}" alt="" loading="lazy">`;
  }
  if (yt) {
    return html`<span class="thumb thumb-play"><img src="https://i.ytimg.com/vi/${yt}/mqdefault.jpg" alt="" loading="lazy">${icons.play}</span>`;
  }
  if (exercise?.media_type === 'video') {
    return html`<span class="thumb thumb-play"><video src="${exercise.media_url}#t=0.5" preload="metadata" muted playsinline></video>${icons.play}</span>`;
  }
  return html`<span class="thumb thumb-empty">${initials(exercise?.name ?? '?')}</span>`;
}

export function hasMedia(exercise) {
  return Boolean(exercise?.media_url || isHttpUrl(exercise?.video_url));
}

// Pełny podgląd: zdjęcie lub film z pliku oraz film z linku.
export function exerciseMedia(exercise) {
  const yt = youTubeId(exercise.video_url);
  return html`
    ${exercise.media_type === 'image' ? html`<img class="media" src="${exercise.media_url}" alt="${exercise.name}">` : ''}
    ${exercise.media_type === 'video' ? html`<video class="media" src="${exercise.media_url}" controls playsinline preload="metadata"></video>` : ''}
    ${yt ? html`<div class="media media-embed"><iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="${exercise.name}"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>` : ''}
    ${!yt && isHttpUrl(exercise.video_url) ? html`<a class="btn btn-outline btn-block" href="${exercise.video_url}" target="_blank" rel="noopener">${icons.play} Obejrzyj film</a>` : ''}`;
}
