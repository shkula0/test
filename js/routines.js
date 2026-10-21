// Rutyny „na wolną chwilę”: krótkie treningi mobilności, postawy, rozciągania itp.
// Trener je tworzy (film + opcjonalna lista ćwiczeń), podopieczni oglądają i odhaczają „Zrobione”.

import { api } from './data/index.js';
import { icons } from './icons.js';
import { normalize, resolveExercise } from './library.js';
import { exerciseMedia, exerciseThumb, hasMedia, isHttpUrl } from './media.js';
import { $, html, toast, formatDate, formData, todayIso } from './ui.js';

export const ROUTINE_CATEGORIES = ['Mobilność', 'Postawa', 'Rozciąganie', 'Kondycja', 'Core', 'Regeneracja', 'Inne'];
const LEVELS = ['Łatwy', 'Średni', 'Trudny'];

// Rutyna ma te same pola zdjęcia/filmu co ćwiczenie, więc korzystamy z tych samych miniatur.
const asMedia = (routine) => ({ ...routine, name: routine.title });

function meta(routine) {
  return [routine.category, routine.duration_min && `${routine.duration_min} min`, routine.level].filter(Boolean).join(' · ');
}

// ============================================================
// Lista
// ============================================================

export async function viewRoutines(ctx) {
  const { me } = ctx;
  const isCoach = me.role === 'coach';
  const [routines, completions] = await Promise.all([
    api.listRoutines(),
    isCoach ? [] : api.listCompletions({ clientId: me.id }),
  ]);
  const doneCount = new Map();
  for (const c of completions) doneCount.set(c.routine_id, (doneCount.get(c.routine_id) ?? 0) + 1);
  const categories = ROUTINE_CATEGORIES.filter((c) => routines.some((r) => r.category === c));
  let category = '';

  ctx.renderShell({
    title: 'Rutyny',
    nav: 'routines',
    body: html`
      <p class="muted">${isCoach
        ? 'Krótkie treningi dla Twoich podopiecznych na wolną chwilę – mobilność, postawa, rozciąganie.'
        : 'Krótkie treningi na wolną chwilę od Twojego trenera. Włącz film i ćwicz razem.'}</p>
      ${isCoach ? html`<a class="btn btn-block" href="#/routine/new">${icons.plus} Nowa rutyna</a>` : ''}
      ${categories.length > 1 ? html`<div class="chips scroll-x">${categories.map((c) => html`<button class="chip" data-category="${c}">${c}</button>`)}</div>` : ''}
      <div id="routine-list" class="routine-grid"></div>`,
  });

  const list = $('#routine-list');
  const draw = () => {
    document.querySelectorAll('[data-category]').forEach((chip) => chip.classList.toggle('active', chip.dataset.category === category));
    const visible = routines.filter((r) => !category || r.category === category);
    list.innerHTML = visible.length ? html`${visible.map((r) => html`
      <a class="routine-card card" href="#/routine/${r.id}">
        <span class="routine-cover">${exerciseThumb(asMedia(r))}</span>
        <span class="routine-body">
          <strong>${r.title}</strong>
          <span class="muted small">${meta(r)}</span>
          ${doneCount.get(r.id) ? html`<span class="routine-done">${icons.check} Zrobione ${doneCount.get(r.id)}×</span>` : ''}
        </span>
      </a>`)}` : ctx.emptyState(isCoach
      ? 'Nie masz jeszcze rutyn. Dodaj pierwszą – np. „Hip mobility” z filmem do ćwiczenia razem.'
      : 'Trener nie dodał jeszcze rutyn.');
  };
  draw();
  document.querySelectorAll('[data-category]').forEach((chip) => chip.addEventListener('click', () => {
    category = category === chip.dataset.category ? '' : chip.dataset.category;
    draw();
  }));
}

// ============================================================
// Rutyna
// ============================================================

export async function viewRoutine(ctx, id) {
  const { me } = ctx;
  const routine = await api.getRoutine(id);
  if (!routine) return ctx.viewNotFound();
  const isCoach = me.role === 'coach';
  const own = routine.coach_id === me.id;
  const [library, completions, clients] = await Promise.all([
    api.listExercises(),
    api.listCompletions(isCoach ? { routineId: id } : { clientId: me.id, routineId: id }),
    isCoach ? api.listClients() : [],
  ]);
  const today = todayIso();
  const doneToday = completions.find((c) => c.client_id === me.id && c.completed_on === today);

  // Trener: kto z podopiecznych robił tę rutynę.
  const byClient = new Map();
  for (const c of completions) {
    const entry = byClient.get(c.client_id) ?? { count: 0, last: c.completed_on };
    entry.count += 1;
    if (c.completed_on > entry.last) entry.last = c.completed_on;
    byClient.set(c.client_id, entry);
  }
  const clientName = (cid) => clients.find((c) => c.id === cid)?.full_name ?? 'Podopieczny';

  ctx.renderShell({
    title: routine.title,
    back: '/routines',
    nav: 'routines',
    body: html`
      ${routine.media_url || isHttpUrl(routine.video_url) ? exerciseMedia(asMedia(routine)) : ''}
      <section class="card">
        <p class="muted small">${meta(routine)}</p>
        ${routine.description ? html`<p class="pre-line">${routine.description}</p>` : ''}
      </section>

      ${routine.items.length ? html`<section class="card">
        <h2>Ćwiczenia po kolei</h2>
        <ol class="routine-items">${routine.items.map((item, i) => {
          const info = resolveExercise(library, { id: item.exercise_id, name: item.name });
          const text = html`<span class="ex-label">${i + 1}</span>
            <span class="ex-text"><strong>${item.name}</strong>${item.amount ? html`<span class="ex-details">${item.amount}</span>` : ''}</span>`;
          // Trener: przy ćwiczeniu bez zdjęcia/filmu kwadrat „+ film” prowadzi do dodania klipu.
          if (own && !hasMedia(info)) {
            const query = new URLSearchParams({ name: item.name, back: `/routine/${routine.id}`, ...(info ? { id: info.id } : {}) });
            return html`<li><span class="ex-row">${text}
              <a class="thumb thumb-add" href="#/exercise/media?${query.toString()}" aria-label="Dodaj film do ćwiczenia ${item.name}">${icons.plus}<span>film</span></a>
            </span></li>`;
          }
          return info
            ? html`<li><a class="ex-row" href="#/exercise/${info.id}?back=/routine/${routine.id}">${text}${exerciseThumb(info, { animate: true })}</a></li>`
            : html`<li><span class="ex-row">${text}</span></li>`;
        })}</ol>
      </section>` : ''}

      ${isCoach ? html`
        <section class="card">
          <h2>Kto robił</h2>
          ${byClient.size ? html`<ul class="history">${[...byClient].map(([cid, e]) => html`<li>
            <span class="grow">${clientName(cid)}</span><span class="muted small">${e.count}× · ostatnio ${formatDate(e.last)}</span></li>`)}</ul>`
            : html`<p class="muted small">Nikt jeszcze nie odhaczył tej rutyny.</p>`}
        </section>
        ${own ? html`<div class="row gap">
          <a class="btn grow" href="#/routine/${routine.id}/edit">${icons.edit} Edytuj</a>
          <button class="btn btn-outline danger" id="delete-routine">${icons.trash} Usuń</button>
        </div>` : ''}`
      : html`
        <div class="sticky-actions">
          <button class="btn btn-block ${doneToday ? 'btn-outline' : ''}" id="routine-done">
            ${icons.check} ${doneToday ? 'Zrobione dzisiaj – cofnij' : 'Zrobione!'}
          </button>
        </div>
        <p class="muted small center">${completions.length
          ? `Zrobione ${completions.length}× · ostatnio ${formatDate(completions[0].completed_on)}`
          : 'Po zakończeniu kliknij „Zrobione!” – liczy się do Twojej serii.'}</p>`}`,
  });

  $('#routine-done')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      if (doneToday) {
        await api.deleteCompletion(doneToday.id);
        toast('Cofnięto');
      } else {
        await api.addCompletion(routine.id, me.id, today);
        toast('Super, zrobione! 💪', 'success');
      }
      viewRoutine(ctx, id);
    } catch (error) {
      toast(error.message, 'error');
      event.currentTarget.disabled = false;
    }
  });

  $('#delete-routine')?.addEventListener('click', async () => {
    if (!confirm(`Usunąć rutynę „${routine.title}”?`)) return;
    await api.deleteRoutine(routine.id);
    toast('Rutyna usunięta');
    ctx.go('/routines');
  });
}

// ============================================================
// Edytor (trener)
// ============================================================

export async function viewRoutineEditor(ctx, id) {
  const { me } = ctx;
  const existing = id ? await api.getRoutine(id) : null;
  if (id && (!existing || existing.coach_id !== me.id)) return ctx.viewNotFound();
  const library = await api.listExercises();
  const r = existing ?? { title: '', category: 'Mobilność', duration_min: null, level: 'Łatwy', description: '', video_url: '', items: [] };
  const items = r.items.map((item) => ({ ...item }));
  if (!items.length) items.push({ name: '', exercise_id: null, amount: '' });
  let removeMedia = false;

  ctx.renderShell({
    title: existing ? 'Edytuj rutynę' : 'Nowa rutyna',
    back: existing ? `/routine/${existing.id}` : '/routines',
    nav: 'routines',
    body: html`
      <form id="routine-form" class="stack" autocomplete="off">
        <section class="card stack">
          <label>Nazwa<input name="title" value="${r.title}" required placeholder="np. Hip mobility"></label>
          <div class="grid-3">
            <label>Kategoria<select name="category">${ROUTINE_CATEGORIES.map((c) => html`<option ${c === r.category ? 'selected' : ''}>${c}</option>`)}</select></label>
            <label>Czas (min)<input name="duration_min" value="${r.duration_min ?? ''}" inputmode="numeric" placeholder="12"></label>
            <label>Poziom<select name="level">${LEVELS.map((l) => html`<option ${l === r.level ? 'selected' : ''}>${l}</option>`)}</select></label>
          </div>
          <label>Opis<textarea name="description" rows="3" placeholder="Dla kogo, kiedy robić, na co uważać…">${r.description}</textarea></label>
        </section>

        <section class="card stack">
          <h2>Film</h2>
          <label>Link do filmu (YouTube)
            <input name="video_url" type="url" value="${r.video_url}" inputmode="url" placeholder="https://youtu.be/…">
          </label>
          <p class="muted small">Dłuższe filmy wrzuć na YouTube jako „Niepubliczny” i wklej link – widzi go tylko ten, kto ma link.
            Krótki klip (do ${api.mode === 'demo' ? '3' : '50'} MB) możesz dodać z telefonu:</p>
          <div id="media-preview">${existing?.media_url ? mediaPreview(existing) : ''}</div>
          <label class="file-input">
            <input type="file" name="file" accept="video/*,image/*">
            <span class="btn btn-outline btn-block">${icons.image} ${existing?.media_url ? 'Zmień plik' : 'Wybierz film lub zdjęcie'}</span>
          </label>
        </section>

        <section class="card stack">
          <h2>Ćwiczenia po kolei <span class="muted small">(opcjonalnie)</span></h2>
          <div id="items" class="stack"></div>
          <datalist id="routine-exercises">${library.map((e) => html`<option value="${e.name}">`)}</datalist>
          <button type="button" class="btn btn-outline btn-block" id="add-item">${icons.plus} Dodaj ćwiczenie</button>
        </section>

        <div class="sticky-actions"><button class="btn btn-block" type="submit">Zapisz rutynę</button></div>
      </form>`,
  });

  const itemsEl = $('#items');
  const drawItems = () => {
    itemsEl.innerHTML = html`${items.map((item, i) => html`
      <div class="routine-item-edit" data-i="${i}">
        <span class="ex-label">${i + 1}</span>
        <input data-k="name" value="${item.name}" list="routine-exercises" placeholder="Ćwiczenie" aria-label="Ćwiczenie ${i + 1}">
        <input data-k="amount" value="${item.amount}" placeholder="np. 45 s / strona" aria-label="Ile ${i + 1}">
        <button type="button" class="icon-btn danger" data-remove aria-label="Usuń ćwiczenie">${icons.trash}</button>
      </div>`)}`;
  };
  drawItems();

  itemsEl.addEventListener('input', (event) => {
    const row = event.target.closest('[data-i]');
    if (!row || !event.target.dataset.k) return;
    items[row.dataset.i][event.target.dataset.k] = event.target.value;
  });
  itemsEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    items.splice(Number(button.closest('[data-i]').dataset.i), 1);
    drawItems();
  });
  $('#add-item').addEventListener('click', () => {
    items.push({ name: '', exercise_id: null, amount: '' });
    drawItems();
    itemsEl.querySelectorAll('[data-k=name]')[items.length - 1].focus();
  });

  const form = $('#routine-form');
  const fileInput = form.elements.file;
  const preview = $('#media-preview');
  const maxBytes = (api.mode === 'demo' ? 3 : 50) * 1024 * 1024;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > maxBytes) {
      toast(`Plik jest za duży (maks. ${maxBytes / 1024 / 1024} MB). Dłuższy film wrzuć na YouTube i wklej link.`, 'error');
      fileInput.value = '';
      return;
    }
    preview.innerHTML = mediaPreview({ media_url: URL.createObjectURL(file), media_type: file.type.startsWith('video/') ? 'video' : 'image' });
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
    if (videoUrl && !isHttpUrl(videoUrl)) return toast('Link do filmu musi zaczynać się od https://', 'error');
    const duration = data.duration_min.trim() === '' ? null : Number(data.duration_min);
    if (duration != null && (!Number.isInteger(duration) || duration <= 0)) return toast('Czas podaj w pełnych minutach.', 'error');
    const findLib = (name) => library.find((e) => normalize(e.name) === normalize(name));
    const cleanItems = items
      .map((item) => ({ name: item.name.trim(), amount: item.amount.trim(), exercise_id: findLib(item.name)?.id ?? null }))
      .filter((item) => item.name);
    const file = fileInput.files[0];
    const button = form.querySelector('[type=submit]');
    await ctx.submitting(form, async () => {
      if (file) button.textContent = 'Wysyłanie pliku…';
      const savedId = await api.saveRoutine({
        id: existing?.id, title: data.title.trim(), category: data.category, duration_min: duration, level: data.level,
        description: data.description.trim(), video_url: videoUrl, items: cleanItems,
      }, { file, removeMedia: removeMedia && !file });
      toast('Rutyna zapisana', 'success');
      ctx.go(`/routine/${savedId}`);
    });
    button.textContent = 'Zapisz rutynę';
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
