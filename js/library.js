// Biblioteka ćwiczeń: lista, karta ćwiczenia i edytor (zdjęcie, film, opis).

import { api } from './data/index.js';
import { icons } from './icons.js';
import { exerciseMedia, exerciseThumb, hasMedia, isHttpUrl } from './media.js';
import { $, html, toast, formData } from './ui.js';

export const CATEGORIES = [
  'Nogi', 'Pośladki i tył uda', 'Klatka', 'Plecy', 'Barki', 'Ramiona', 'Brzuch i core', 'Kondycja', 'Mobilność', 'Inne',
];

// Skąd pochodzi ćwiczenie – pokazywane jako mała etykieta.
export function sourceLabel(exercise, me) {
  if (exercise.coach_id == null) return 'Bazowe';
  if (exercise.coach_id === me.id) return exercise.is_public ? 'Twoje · udostępnione' : 'Twoje';
  if (exercise.coach_id === me.coach_id) return 'Od trenera';
  return 'Od innego trenera';
}

// Bezpieczny link powrotu przekazany w adresie (?back=/plan/...).
function backFrom(params, fallback) {
  const back = params.get('back');
  return back && back.startsWith('/') ? back : fallback;
}

export async function viewLibrary(ctx, params) {
  const { me } = ctx;
  const exercises = await api.listExercises();
  const state = { query: params.get('q') ?? '', category: '', onlyMine: false };
  const categories = [...new Set([...CATEGORIES, ...exercises.map((e) => e.category).filter(Boolean)])]
    .filter((c) => exercises.some((e) => e.category === c));

  ctx.renderShell({
    title: 'Ćwiczenia',
    nav: 'library',
    body: html`
      <a class="btn btn-block" href="#/exercise/new">${icons.plus} Dodaj ćwiczenie</a>
      <label class="search">${icons.search}
        <input type="search" id="library-search" placeholder="Szukaj ćwiczenia…" value="${state.query}" autocomplete="off" aria-label="Szukaj ćwiczenia">
      </label>
      <div class="chips scroll-x">
        <button class="chip" data-mine>Tylko moje</button>
        ${categories.map((c) => html`<button class="chip" data-category="${c}">${c}</button>`)}
      </div>
      <div id="library-list"></div>`,
  });

  const list = $('#library-list');
  const draw = () => {
    const q = normalize(state.query);
    const visible = exercises.filter((e) => (!q || normalize(e.name).includes(q))
      && (!state.category || e.category === state.category)
      && (!state.onlyMine || e.coach_id === me.id));
    $('[data-mine]').classList.toggle('active', state.onlyMine);
    document.querySelectorAll('[data-category]').forEach((chip) => chip.classList.toggle('active', chip.dataset.category === state.category));
    list.innerHTML = visible.length
      ? html`<ul class="list card">${visible.map((e) => html`
          <li><a href="#/exercise/${e.id}" class="list-item">
            ${exerciseThumb(e)}
            <span class="grow"><strong>${e.name}</strong><br>
              <span class="muted small">${[e.category, sourceLabel(e, me)].filter(Boolean).join(' · ')}</span></span>
            ${icons.chevron}
          </a></li>`)}</ul>`
      : ctx.emptyState(state.query ? `Nie ma ćwiczenia „${state.query}”. Dodaj je przyciskiem powyżej.` : 'Brak ćwiczeń w tym widoku.');
  };
  draw();

  $('#library-search').addEventListener('input', (event) => {
    state.query = event.target.value;
    draw();
  });
  $('[data-mine]').addEventListener('click', () => {
    state.onlyMine = !state.onlyMine;
    draw();
  });
  document.querySelectorAll('[data-category]').forEach((chip) => chip.addEventListener('click', () => {
    state.category = state.category === chip.dataset.category ? '' : chip.dataset.category;
    draw();
  }));
}

export async function viewExercise(ctx, id, params) {
  const { me } = ctx;
  const exercise = await api.getExercise(id);
  if (!exercise) return ctx.viewNotFound();
  const isCoach = me.role === 'coach';
  const own = exercise.coach_id === me.id;

  ctx.renderShell({
    title: exercise.name,
    back: backFrom(params, isCoach ? '/exercises' : '/'),
    nav: isCoach ? 'library' : 'plans',
    body: html`
      ${exerciseMedia(exercise)}
      <section class="card">
        <p class="muted small">${[exercise.category, isCoach ? sourceLabel(exercise, me) : ''].filter(Boolean).join(' · ')}</p>
        ${exercise.description
          ? html`<p class="pre-line">${exercise.description}</p>`
          : html`<p class="muted">Brak opisu techniki.</p>`}
      </section>
      ${own ? html`<div class="row gap">
        <a class="btn grow" href="#/exercise/${exercise.id}/edit">${icons.edit} Edytuj</a>
        <button class="btn btn-outline danger" id="delete-exercise">${icons.trash} Usuń</button>
      </div>` : ''}
      ${isCoach && !own ? html`<button class="btn btn-outline btn-block" id="copy-exercise">${icons.copy} Skopiuj do moich i edytuj</button>
        <p class="muted small center">Kopia pozwala dodać własne zdjęcie, film lub opis.</p>` : ''}`,
  });

  $('#delete-exercise')?.addEventListener('click', async () => {
    if (!confirm(`Usunąć ćwiczenie „${exercise.name}”? W istniejących planach zostanie sama nazwa.`)) return;
    await api.deleteExercise(exercise.id);
    toast('Ćwiczenie usunięte');
    ctx.go('/exercises');
  });

  $('#copy-exercise')?.addEventListener('click', async () => {
    const copyId = await api.saveExercise({
      name: exercise.name,
      category: exercise.category,
      description: exercise.description,
      video_url: exercise.video_url,
      is_public: false,
    });
    toast('Skopiowano do Twoich ćwiczeń', 'success');
    ctx.go(`/exercise/${copyId}/edit`);
  });
}

export async function viewExerciseEditor(ctx, id, params = new URLSearchParams()) {
  const { me } = ctx;
  const existing = id ? await api.getExercise(id) : null;
  if (id && (!existing || existing.coach_id !== me.id)) return ctx.viewNotFound();
  const ex = existing ?? { name: params.get('name') ?? '', category: '', description: '', video_url: '', is_public: false };
  const returnTo = backFrom(params, null);
  let removeMedia = false;

  ctx.renderShell({
    title: existing ? 'Edytuj ćwiczenie' : 'Nowe ćwiczenie',
    back: returnTo ?? (existing ? `/exercise/${existing.id}` : '/exercises'),
    nav: 'library',
    body: html`
      <form id="exercise-form" class="stack">
        <section class="card stack">
          <label>Nazwa<input name="exerciseName" value="${ex.name}" required autocomplete="off" placeholder="np. Przysiad ze sztangą"></label>
          <label>Partia mięśniowa
            <select name="category">
              <option value="">– wybierz –</option>
              ${[...new Set([...CATEGORIES, ex.category].filter(Boolean))].map((c) => html`<option ${c === ex.category ? 'selected' : ''}>${c}</option>`)}
            </select>
          </label>
          <label>Opis techniki i wskazówki
            <textarea name="description" rows="5" placeholder="Ustawienie, przebieg ruchu, najczęstsze błędy…">${ex.description}</textarea>
          </label>
        </section>

        <section class="card stack">
          <h2>Zdjęcie lub film</h2>
          <div id="media-preview">${existing?.media_url ? mediaPreview(existing) : ''}</div>
          <label class="file-input">
            <input type="file" name="file" accept="image/*,video/*">
            <span class="btn btn-outline btn-block">${icons.image} ${existing?.media_url ? 'Zmień plik' : 'Wybierz zdjęcie lub film'}</span>
          </label>
          <p class="muted small">Z telefonu możesz od razu nagrać film lub zrobić zdjęcie. Maks. ${api.mode === 'demo' ? '3' : '50'} MB – krótkie filmy (do ok. 1 min) sprawdzają się najlepiej.</p>
          <label>…albo link do filmu (YouTube)
            <input name="video_url" type="url" value="${ex.video_url}" inputmode="url" autocomplete="off" placeholder="https://youtu.be/…">
          </label>
        </section>

        <label class="card check">
          <input type="checkbox" name="is_public" ${ex.is_public ? 'checked' : ''}>
          <span><strong>Udostępnij innym trenerom</strong><br>
            <span class="muted small">Ćwiczenie pojawi się w bibliotece wszystkich trenerów korzystających z aplikacji. Edytować je możesz tylko Ty.</span></span>
        </label>

        <button class="btn btn-block" type="submit">Zapisz ćwiczenie</button>
      </form>`,
  });

  const form = $('#exercise-form');
  const preview = $('#media-preview');
  const fileInput = form.elements.file;
  const maxBytes = (api.mode === 'demo' ? 3 : 50) * 1024 * 1024;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > maxBytes) {
      toast(`Plik jest za duży (maks. ${maxBytes / 1024 / 1024} MB).`, 'error');
      fileInput.value = '';
      return;
    }
    const url = URL.createObjectURL(file);
    preview.innerHTML = mediaPreview({ media_url: url, media_type: file.type.startsWith('video/') ? 'video' : 'image' });
  });

  preview.addEventListener('click', (event) => {
    if (!event.target.closest('#remove-media')) return;
    fileInput.value = '';
    removeMedia = Boolean(existing?.media_url);
    preview.innerHTML = '';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = formData(form);
    const videoUrl = data.video_url.trim();
    if (videoUrl && !isHttpUrl(videoUrl)) {
      toast('Link do filmu musi zaczynać się od https://', 'error');
      return;
    }
    const file = fileInput.files[0];
    const button = form.querySelector('[type=submit]');
    await ctx.submitting(form, async () => {
      if (file) button.textContent = 'Wysyłanie pliku…';
      const savedId = await api.saveExercise({
        id: existing?.id,
        name: data.exerciseName.trim(),
        category: data.category.trim(),
        description: data.description.trim(),
        video_url: videoUrl,
        is_public: data.is_public === 'on',
      }, { file, removeMedia: removeMedia && !file });
      toast('Ćwiczenie zapisane', 'success');
      ctx.go(returnTo ?? `/exercise/${savedId}`);
    });
    button.textContent = 'Zapisz ćwiczenie';
  });
}

function mediaPreview(media) {
  return html`<div class="media-preview">
    ${media.media_type === 'video'
      ? html`<video src="${media.media_url}" controls playsinline preload="metadata"></video>`
      : html`<img src="${media.media_url}" alt="Podgląd">`}
    <button type="button" class="btn btn-ghost danger" id="remove-media">${icons.trash} Usuń plik</button>
  </div>`;
}

// Ćwiczenie do pokazania w planie/rutynie: jeśli trener ma własną wersję o tej samej nazwie
// ze zdjęciem lub filmem (np. kopię ćwiczenia bazowego), pokazujemy ją zamiast bazowej.
export function resolveExercise(library, { id, name }) {
  const byId = id ? library.find((e) => e.id === id) : null;
  const key = normalize(byId?.name ?? name);
  if (!key) return byId;
  const sameName = library.filter((e) => normalize(e.name) === key);
  const withMedia = sameName.filter(hasMedia);
  return (byId && hasMedia(byId) ? byId : null)
    ?? withMedia.find((e) => e.coach_id != null) ?? withMedia[0] ?? byId ?? sameName[0] ?? null;
}

// „+ film” z rutyny lub planu: własne ćwiczenie → edycja, bazowe/cudze → kopia do edycji,
// ćwiczenie spoza biblioteki → nowe z wpisaną nazwą. Po zapisie wracamy tam, skąd przyszliśmy.
export async function openExerciseForMedia(ctx, params) {
  const back = params.get('back');
  const backQuery = back && back.startsWith('/') ? `back=${encodeURIComponent(back)}` : '';
  const library = await api.listExercises();
  const target = resolveExercise(library, { id: params.get('id'), name: params.get('name') ?? '' });
  if (target?.coach_id === ctx.me.id) return ctx.go(`/exercise/${target.id}/edit?${backQuery}`);
  if (target) {
    const copyId = await api.saveExercise({
      name: target.name, category: target.category, description: target.description, video_url: target.video_url, is_public: false,
    });
    return ctx.go(`/exercise/${copyId}/edit?${backQuery}`);
  }
  return ctx.go(`/exercise/new?name=${encodeURIComponent(params.get('name') ?? '')}&${backQuery}`);
}

export function normalize(text) {
  return (text ?? '').toLocaleLowerCase('pl').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
}
