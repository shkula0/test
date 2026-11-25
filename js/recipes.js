// Przepisy od trenera: film lub zdjęcie, składniki, kroki „krok po kroku”, czas, porcje i makro.
// Trener dodaje i edytuje, podopieczni oglądają, przeliczają porcje i odhaczają składniki oraz kroki.

import { api } from './data/index.js';
import { icons } from './icons.js';
import { exerciseMedia, exerciseThumb, isHttpUrl } from './media.js';
import { normalize } from './library.js';
import { notify } from './push.js';
import { $, html, toast, formData, formatNumber, toNumber } from './ui.js';

export const RECIPE_CATEGORIES = ['Śniadanie', 'Obiad', 'Kolacja', 'Przekąska', 'Deser', 'Koktajl', 'Inne'];

// Przepis ma te same pola zdjęcia/filmu co ćwiczenie, więc korzystamy z tych samych miniatur i odtwarzacza.
const asMedia = (recipe) => ({ ...recipe, name: recipe.title });

function meta(recipe) {
  return [
    recipe.category,
    recipe.prep_min && `${recipe.prep_min} min`,
    recipe.kcal != null && `${formatNumber(recipe.kcal, 0)} kcal`,
    recipe.protein != null && `${formatNumber(recipe.protein, 0)} g białka`,
  ].filter(Boolean).join(' · ');
}

// „60 g” × 1,5 → „90 g”; ilości bez liczby na początku („szczypta”) zostają bez zmian.
export function scaleAmount(amount, factor) {
  if (factor === 1) return amount;
  const match = String(amount).trim().match(/^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?(.*)$/);
  if (!match) return amount;
  const value = Number(match[1].replace(',', '.')) / (match[2] ? Number(match[2]) : 1);
  const scaled = Math.round(value * factor * 10) / 10;
  return `${String(scaled).replace('.', ',')}${match[3]}`;
}

// ============================================================
// Lista
// ============================================================

export async function viewRecipes(ctx) {
  const { me } = ctx;
  const isCoach = me.role === 'coach';
  const recipes = await api.listRecipes();
  const categories = RECIPE_CATEGORIES.filter((c) => recipes.some((r) => r.category === c));
  let category = '';
  let query = '';

  ctx.renderShell({
    title: 'Przepisy',
    nav: 'recipes',
    body: html`
      <p class="muted">${isCoach
        ? 'Przepisy dla Twoich podopiecznych – z filmem, składnikami i krokami.'
        : 'Przepisy od Twojego trenera. Wybierz, ugotuj, smacznego!'}</p>
      ${isCoach ? html`<a class="btn btn-block" href="#/recipe/new">${icons.plus} Nowy przepis</a>` : ''}
      ${recipes.length > 3 ? html`<label class="search">${icons.search}<input id="recipe-search" type="search" placeholder="Szukaj przepisu lub składnika…"></label>` : ''}
      ${categories.length > 1 ? html`<div class="chips scroll-x">${categories.map((c) => html`<button class="chip" data-category="${c}">${c}</button>`)}</div>` : ''}
      <div id="recipe-list" class="routine-grid"></div>`,
  });

  const list = $('#recipe-list');
  const matches = (r) => !query || normalize(r.title).includes(query)
    || r.ingredients.some((i) => normalize(i.name).includes(query));
  const draw = () => {
    document.querySelectorAll('[data-category]').forEach((chip) => chip.classList.toggle('active', chip.dataset.category === category));
    const visible = recipes.filter((r) => (!category || r.category === category) && matches(r));
    list.innerHTML = visible.length ? html`${visible.map((r) => html`
      <a class="routine-card card" href="#/recipe/${r.id}">
        <span class="routine-cover">${exerciseThumb(asMedia(r))}</span>
        <span class="routine-body">
          <strong>${r.title}</strong>
          <span class="muted small">${meta(r)}</span>
        </span>
      </a>`)}` : ctx.emptyState(recipes.length ? 'Nic nie pasuje do wyszukiwania.' : isCoach
      ? 'Nie masz jeszcze przepisów. Dodaj pierwszy – z filmem, składnikami i krokami.'
      : 'Trener nie dodał jeszcze przepisów.');
  };
  draw();
  document.querySelectorAll('[data-category]').forEach((chip) => chip.addEventListener('click', () => {
    category = category === chip.dataset.category ? '' : chip.dataset.category;
    draw();
  }));
  $('#recipe-search')?.addEventListener('input', (event) => {
    query = normalize(event.target.value);
    draw();
  });
}

// ============================================================
// Przepis
// ============================================================

export async function viewRecipe(ctx, id) {
  const { me } = ctx;
  const recipe = await api.getRecipe(id);
  if (!recipe) return ctx.viewNotFound();
  const own = recipe.coach_id === me.id;
  const baseServings = recipe.servings || 1;
  let servings = baseServings;
  const ticked = new Set();
  const doneSteps = new Set();

  const macro = (value, label, unit = 'g') => (value == null ? '' : html`<div class="macro">
    <strong>${formatNumber(value, 0)}${unit ? html`<small> ${unit}</small>` : ''}</strong><span class="muted small">${label}</span></div>`);

  ctx.renderShell({
    title: recipe.title,
    back: '/recipes',
    nav: 'recipes',
    body: html`
      ${recipe.media_url || isHttpUrl(recipe.video_url) ? exerciseMedia(asMedia(recipe)) : ''}
      <section class="card">
        <p class="muted small">${[recipe.category, recipe.prep_min && `${recipe.prep_min} min`].filter(Boolean).join(' · ')}</p>
        ${recipe.kcal != null || recipe.protein != null || recipe.carbs != null || recipe.fat != null ? html`
          <div class="macros">
            ${macro(recipe.kcal, 'kcal', '')}${macro(recipe.protein, 'białko')}${macro(recipe.carbs, 'węglowodany')}${macro(recipe.fat, 'tłuszcz')}
          </div>
          <p class="muted small center">na 1 porcję</p>` : ''}
        ${recipe.description ? html`<p class="pre-line">${recipe.description}</p>` : ''}
      </section>

      ${recipe.ingredients.length ? html`<section class="card">
        <div class="row gap recipe-head">
          <h2 class="grow">Składniki</h2>
          <div class="servings" aria-label="Liczba porcji">
            <button type="button" class="icon-btn" id="servings-minus" aria-label="Mniej porcji">−</button>
            <span id="servings-count"></span>
            <button type="button" class="icon-btn" id="servings-plus" aria-label="Więcej porcji">+</button>
          </div>
        </div>
        <ul class="ingredients" id="ingredients"></ul>
        <p class="muted small">Stuknij składnik, żeby go odhaczyć.</p>
      </section>` : ''}

      ${recipe.steps.length ? html`<section class="card">
        <h2>Krok po kroku</h2>
        <ol class="recipe-steps" id="steps">${recipe.steps.map((step, i) => html`<li data-step="${i}">
          <span class="step-no">${i + 1}</span><span class="grow pre-line">${step}</span></li>`)}</ol>
        <p class="muted small">Stuknij krok, gdy go zrobisz.</p>
      </section>` : ''}

      ${own ? html`<div class="row gap">
        <a class="btn grow" href="#/recipe/${recipe.id}/edit">${icons.edit} Edytuj</a>
        <button class="btn btn-outline danger" id="delete-recipe">${icons.trash} Usuń</button>
      </div>` : ''}`,
  });

  const drawIngredients = () => {
    if (!$('#ingredients')) return;
    const factor = servings / baseServings;
    $('#servings-count').textContent = `${servings} ${servings === 1 ? 'porcja' : servings < 5 ? 'porcje' : 'porcji'}`;
    $('#servings-minus').disabled = servings <= 1;
    $('#ingredients').innerHTML = html`${recipe.ingredients.map((item, i) => html`
      <li class="${ticked.has(i) ? 'ticked' : ''}" data-ingredient="${i}">
        <span class="tick">${ticked.has(i) ? icons.check : ''}</span>
        <span class="grow">${item.name}</span>
        <span class="amount">${scaleAmount(item.amount, factor)}</span>
      </li>`)}`;
  };
  drawIngredients();

  $('#servings-minus')?.addEventListener('click', () => { servings = Math.max(1, servings - 1); drawIngredients(); });
  $('#servings-plus')?.addEventListener('click', () => { servings = Math.min(20, servings + 1); drawIngredients(); });
  $('#ingredients')?.addEventListener('click', (event) => {
    const row = event.target.closest('[data-ingredient]');
    if (!row) return;
    const i = Number(row.dataset.ingredient);
    if (ticked.has(i)) ticked.delete(i);
    else ticked.add(i);
    drawIngredients();
  });
  $('#steps')?.addEventListener('click', (event) => {
    const row = event.target.closest('[data-step]');
    if (!row) return;
    const i = Number(row.dataset.step);
    if (doneSteps.has(i)) doneSteps.delete(i);
    else doneSteps.add(i);
    row.classList.toggle('done', doneSteps.has(i));
  });

  $('#delete-recipe')?.addEventListener('click', async () => {
    if (!confirm(`Usunąć przepis „${recipe.title}”?`)) return;
    try {
      await api.deleteRecipe(recipe.id);
      toast('Przepis usunięty');
      ctx.go('/recipes');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

// ============================================================
// Edytor (trener)
// ============================================================

export async function viewRecipeEditor(ctx, id) {
  const { me } = ctx;
  const existing = id ? await api.getRecipe(id) : null;
  if (id && (!existing || existing.coach_id !== me.id)) return ctx.viewNotFound();
  const r = existing ?? {
    title: '', category: 'Śniadanie', prep_min: null, servings: 1, kcal: null, protein: null, carbs: null, fat: null,
    description: '', video_url: '', ingredients: [], steps: [],
  };
  const ingredients = r.ingredients.map((item) => ({ ...item }));
  if (!ingredients.length) ingredients.push({ name: '', amount: '' });
  const steps = [...r.steps];
  if (!steps.length) steps.push('');
  let removeMedia = false;
  const num = (value) => (value == null ? '' : String(value).replace('.', ','));

  ctx.renderShell({
    title: existing ? 'Edytuj przepis' : 'Nowy przepis',
    back: existing ? `/recipe/${existing.id}` : '/recipes',
    nav: 'recipes',
    body: html`
      <form id="recipe-form" class="stack" autocomplete="off">
        <section class="card stack">
          <label>Nazwa<input name="title" value="${r.title}" required placeholder="np. Owsianka białkowa"></label>
          <div class="grid-3">
            <label>Kategoria<select name="category">${RECIPE_CATEGORIES.map((c) => html`<option ${c === r.category ? 'selected' : ''}>${c}</option>`)}</select></label>
            <label>Czas (min)<input name="prep_min" value="${r.prep_min ?? ''}" inputmode="numeric" placeholder="15"></label>
            <label>Porcje<input name="servings" value="${r.servings ?? ''}" inputmode="numeric" placeholder="1"></label>
          </div>
          <label>Opis<textarea name="description" rows="2" placeholder="Dla kogo, kiedy jeść, czym zastąpić…">${r.description}</textarea></label>
        </section>

        <section class="card stack">
          <h2>Makro na 1 porcję <span class="muted small">(opcjonalnie)</span></h2>
          <div class="grid-4">
            <label>kcal<input name="kcal" value="${num(r.kcal)}" inputmode="decimal"></label>
            <label>Białko (g)<input name="protein" value="${num(r.protein)}" inputmode="decimal"></label>
            <label>Węgle (g)<input name="carbs" value="${num(r.carbs)}" inputmode="decimal"></label>
            <label>Tłuszcz (g)<input name="fat" value="${num(r.fat)}" inputmode="decimal"></label>
          </div>
        </section>

        <section class="card stack">
          <h2>Film lub zdjęcie</h2>
          <label>Link do filmu (YouTube)
            <input name="video_url" type="url" value="${r.video_url}" inputmode="url" placeholder="https://youtu.be/…">
          </label>
          <p class="muted small">Dłuższy film wrzuć na YouTube jako „Niepubliczny” i wklej link.
            Krótki film lub zdjęcie (do ${api.mode === 'demo' ? '3' : '50'} MB) możesz dodać z telefonu:</p>
          <div id="media-preview">${existing?.media_url ? mediaPreview(existing) : ''}</div>
          <label class="file-input">
            <input type="file" name="file" accept="video/*,image/*">
            <span class="btn btn-outline btn-block">${icons.image} ${existing?.media_url ? 'Zmień plik' : 'Wybierz film lub zdjęcie'}</span>
          </label>
        </section>

        <section class="card stack">
          <h2>Składniki</h2>
          <div id="ingredients-edit" class="stack"></div>
          <button type="button" class="btn btn-outline btn-block" id="add-ingredient">${icons.plus} Dodaj składnik</button>
        </section>

        <section class="card stack">
          <h2>Krok po kroku</h2>
          <div id="steps-edit" class="stack"></div>
          <button type="button" class="btn btn-outline btn-block" id="add-step">${icons.plus} Dodaj krok</button>
        </section>

        <div class="sticky-actions"><button class="btn btn-block" type="submit">Zapisz przepis</button></div>
      </form>`,
  });

  const ingredientsEl = $('#ingredients-edit');
  const stepsEl = $('#steps-edit');
  const drawIngredients = () => {
    ingredientsEl.innerHTML = html`${ingredients.map((item, i) => html`
      <div class="ingredient-edit" data-i="${i}">
        <input data-k="amount" value="${item.amount}" placeholder="60 g" aria-label="Ilość ${i + 1}">
        <input data-k="name" value="${item.name}" placeholder="Składnik, np. płatki owsiane" aria-label="Składnik ${i + 1}">
        <button type="button" class="icon-btn danger" data-remove aria-label="Usuń składnik">${icons.trash}</button>
      </div>`)}`;
  };
  const drawSteps = () => {
    stepsEl.innerHTML = html`${steps.map((step, i) => html`
      <div class="step-edit" data-i="${i}">
        <span class="step-no">${i + 1}</span>
        <textarea data-step rows="2" placeholder="Co zrobić w tym kroku…" aria-label="Krok ${i + 1}">${step}</textarea>
        <button type="button" class="icon-btn danger" data-remove aria-label="Usuń krok">${icons.trash}</button>
      </div>`)}`;
  };
  drawIngredients();
  drawSteps();

  ingredientsEl.addEventListener('input', (event) => {
    const row = event.target.closest('[data-i]');
    if (row && event.target.dataset.k) ingredients[row.dataset.i][event.target.dataset.k] = event.target.value;
  });
  ingredientsEl.addEventListener('click', (event) => {
    if (!event.target.closest('[data-remove]')) return;
    ingredients.splice(Number(event.target.closest('[data-i]').dataset.i), 1);
    drawIngredients();
  });
  $('#add-ingredient').addEventListener('click', () => {
    ingredients.push({ name: '', amount: '' });
    drawIngredients();
    ingredientsEl.querySelectorAll('[data-k=amount]')[ingredients.length - 1].focus();
  });
  stepsEl.addEventListener('input', (event) => {
    const row = event.target.closest('[data-i]');
    if (row && 'step' in event.target.dataset) steps[row.dataset.i] = event.target.value;
  });
  stepsEl.addEventListener('click', (event) => {
    if (!event.target.closest('[data-remove]')) return;
    steps.splice(Number(event.target.closest('[data-i]').dataset.i), 1);
    drawSteps();
  });
  $('#add-step').addEventListener('click', () => {
    steps.push('');
    drawSteps();
    stepsEl.querySelectorAll('[data-step]')[steps.length - 1].focus();
  });

  const form = $('#recipe-form');
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
    const whole = (text, label) => {
      const value = text.trim() === '' ? null : Number(text.trim());
      if (value != null && (!Number.isInteger(value) || value <= 0)) throw new Error(`${label}: podaj liczbę całkowitą większą od zera.`);
      return value;
    };
    const decimal = (text, label) => {
      const value = text.trim() === '' ? null : toNumber(text);
      if (text.trim() !== '' && (value == null || value < 0)) throw new Error(`${label}: niepoprawna liczba.`);
      return value;
    };
    let fields;
    try {
      fields = {
        prep_min: whole(data.prep_min, 'Czas'), servings: whole(data.servings, 'Porcje'),
        kcal: decimal(data.kcal, 'kcal'), protein: decimal(data.protein, 'Białko'),
        carbs: decimal(data.carbs, 'Węglowodany'), fat: decimal(data.fat, 'Tłuszcz'),
      };
    } catch (error) {
      return toast(error.message, 'error');
    }
    const cleanIngredients = ingredients
      .map((item) => ({ name: item.name.trim(), amount: item.amount.trim() }))
      .filter((item) => item.name);
    const cleanSteps = steps.map((step) => step.trim()).filter(Boolean);
    const file = fileInput.files[0];
    const button = form.querySelector('[type=submit]');
    await ctx.submitting(form, async () => {
      if (file) button.textContent = 'Wysyłanie pliku…';
      const title = data.title.trim();
      const savedId = await api.saveRecipe({
        id: existing?.id, title, category: data.category, ...fields,
        description: data.description.trim(), video_url: videoUrl, ingredients: cleanIngredients, steps: cleanSteps,
      }, { file, removeMedia: removeMedia && !file });
      toast('Przepis zapisany', 'success');
      if (!existing) notify('clients', 'Nowy przepis od trenera', title, `#/recipe/${savedId}`);
      ctx.go(`/recipe/${savedId}`);
    });
    button.textContent = 'Zapisz przepis';
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
