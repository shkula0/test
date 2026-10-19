// Backend demonstracyjny: dane trzymane w localStorage tej przeglądarki.
// Pozwala obejrzeć aplikację bez konfigurowania Supabase.

const STORAGE_KEY = 'trener-demo-v1';
const DEMO_MAX_MEDIA = 3 * 1024 * 1024;

// Bazowy zestaw ćwiczeń – ten sam co w supabase/002_biblioteka_cwiczen.sql.
const BASE_EXERCISES = {
  'Nogi': ['Przysiad ze sztangą', 'Przysiad przedni', 'Przysiad goblet', 'Przysiad bułgarski', 'Wykroki chodzone',
    'Wypychanie na suwnicy', 'Prostowanie nóg na maszynie', 'Uginanie nóg na maszynie', 'Wspięcia na palce'],
  'Pośladki i tył uda': ['Martwy ciąg', 'Martwy ciąg rumuński', 'Hip thrust', 'Most biodrowy', 'Odwodzenie nogi na wyciągu'],
  'Klatka': ['Wyciskanie sztangi leżąc', 'Wyciskanie hantli na skosie', 'Rozpiętki z hantlami', 'Pompki', 'Pompki na poręczach'],
  'Plecy': ['Podciąganie', 'Podciąganie z gumą', 'Ściąganie drążka do klatki', 'Wiosłowanie sztangą', 'Wiosłowanie hantlem',
    'Wiosłowanie na wyciągu siedząc'],
  'Barki': ['Wyciskanie żołnierskie', 'Wyciskanie hantli nad głowę', 'Unoszenie hantli bokiem', 'Face pull'],
  'Ramiona': ['Uginanie ramion ze sztangą', 'Uginanie ramion z hantlami (młotkowe)', 'Prostowanie ramion na wyciągu', 'Wyciskanie francuskie'],
  'Brzuch i core': ['Plank', 'Plank bokiem', 'Dead bug', 'Unoszenie nóg w zwisie', 'Pallof press'],
  'Kondycja': ['Bieżnia', 'Rower stacjonarny', 'Wioślarz (ergometr)', 'Skakanka', 'Burpees'],
};

export function createDemoBackend() {
  let db = load();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Brak dostępu do localStorage (np. tryb prywatny lub brak miejsca) – dane zostają tylko w pamięci.
    }
  }

  const byDate = (key) => (a, b) => a[key].localeCompare(b[key]) || a.created_at.localeCompare(b.created_at);

  return {
    mode: 'demo',

    demoAccounts() {
      return db.profiles.map((p) => ({ email: p.email, full_name: p.full_name, role: p.role }));
    },

    resetDemo() {
      db = seed();
      save();
    },

    async currentUser() {
      return db.profiles.find((p) => p.id === db.session) ?? null;
    },

    async signIn(email) {
      const user = db.profiles.find((p) => p.email === email.trim().toLowerCase());
      if (!user) throw new Error('Nie ma takiego konta demo.');
      db.session = user.id;
      save();
    },

    async signUp({ email, fullName, role, coachCode }) {
      email = email.trim().toLowerCase();
      if (db.profiles.some((p) => p.email === email)) throw new Error('Konto z tym adresem email już istnieje.');
      let coachId = null;
      if (role === 'client') {
        const coach = findCoach(coachCode);
        if (!coach) throw new Error('Nieprawidłowy kod trenera.');
        coachId = coach.id;
      }
      const profile = {
        id: uid(), email, full_name: fullName, role, coach_id: coachId,
        invite_code: role === 'coach' ? uid().slice(0, 6).toUpperCase() : null,
        created_at: now(),
      };
      db.profiles.push(profile);
      db.session = profile.id;
      save();
      return { needsConfirmation: false };
    },

    async signOut() {
      db.session = null;
      save();
    },

    async coachNameForCode(code) {
      return findCoach(code)?.full_name ?? null;
    },

    async getProfile(id) {
      return db.profiles.find((p) => p.id === id) ?? null;
    },

    async listClients() {
      return db.profiles
        .filter((p) => p.coach_id === db.session)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pl'));
    },

    async listPlans(clientId) {
      return db.plans
        .filter((p) => p.client_id === clientId)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },

    async getPlan(id) {
      const plan = db.plans.find((p) => p.id === id);
      if (!plan) return null;
      const exercises = db.plan_exercises
        .filter((e) => e.plan_id === id)
        .sort((a, b) => a.position - b.position);
      return { plan, exercises };
    },

    async savePlan(plan, exercises) {
      let saved = plan.id && db.plans.find((p) => p.id === plan.id);
      if (saved) {
        Object.assign(saved, { name: plan.name, notes: plan.notes, updated_at: now() });
      } else {
        saved = {
          id: uid(), coach_id: db.session, client_id: plan.client_id,
          name: plan.name, notes: plan.notes, created_at: now(), updated_at: now(),
        };
        db.plans.push(saved);
      }
      db.plan_exercises = db.plan_exercises.filter((e) => e.plan_id !== saved.id);
      exercises.forEach((e, i) => db.plan_exercises.push({ ...e, id: uid(), plan_id: saved.id, position: i }));
      save();
      return saved.id;
    },

    async deletePlan(id) {
      db.plans = db.plans.filter((p) => p.id !== id);
      db.plan_exercises = db.plan_exercises.filter((e) => e.plan_id !== id);
      save();
    },

    async listExercises() {
      const me = db.profiles.find((p) => p.id === db.session);
      return db.exercises
        .filter((e) => e.coach_id == null || e.is_public || e.coach_id === db.session || e.coach_id === me?.coach_id)
        .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    },

    async getExercise(id) {
      return db.exercises.find((e) => e.id === id) ?? null;
    },

    async saveExercise(exercise, { file, removeMedia } = {}) {
      const fields = {
        name: exercise.name,
        category: exercise.category,
        description: exercise.description,
        video_url: exercise.video_url,
        is_public: exercise.is_public,
      };
      if (file) {
        if (file.size > DEMO_MAX_MEDIA) throw new Error('W trybie demo plik może mieć maks. 3 MB.');
        Object.assign(fields, {
          media_url: await readAsDataUrl(file),
          media_type: file.type.startsWith('video/') ? 'video' : 'image',
        });
      } else if (removeMedia) {
        Object.assign(fields, { media_url: null, media_type: null });
      }

      let saved = exercise.id && db.exercises.find((e) => e.id === exercise.id);
      if (saved) {
        if (saved.coach_id !== db.session) throw new Error('Możesz edytować tylko własne ćwiczenia.');
        Object.assign(saved, fields, { updated_at: now() });
      } else {
        saved = { media_url: null, media_type: null, ...fields, id: uid(), coach_id: db.session, created_at: now(), updated_at: now() };
        db.exercises.push(saved);
      }
      save();
      return saved.id;
    },

    async deleteExercise(id) {
      db.exercises = db.exercises.filter((e) => !(e.id === id && e.coach_id === db.session));
      db.plan_exercises.forEach((e) => {
        if (e.exercise_id === id) e.exercise_id = null;
      });
      save();
    },

    async listMetrics(clientId) {
      return db.body_metrics.filter((m) => m.client_id === clientId).sort(byDate('measured_on'));
    },

    async addMetric(clientId, metric) {
      db.body_metrics.push({ ...metric, id: uid(), client_id: clientId, created_by: db.session, created_at: now() });
      save();
    },

    async deleteMetric(id) {
      db.body_metrics = db.body_metrics.filter((m) => m.id !== id);
      save();
    },

    async listLifts(clientId) {
      return db.lift_records.filter((l) => l.client_id === clientId).sort(byDate('performed_on'));
    },

    async addLift(clientId, lift) {
      db.lift_records.push({ ...lift, id: uid(), client_id: clientId, created_by: db.session, created_at: now() });
      save();
    },

    async deleteLift(id) {
      db.lift_records = db.lift_records.filter((l) => l.id !== id);
      save();
    },
  };

  function findCoach(code) {
    const normalized = (code ?? '').trim().toUpperCase();
    return db.profiles.find((p) => p.role === 'coach' && p.invite_code === normalized);
  }
}

function load() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      data.exercises ??= baseExercises();
      return data;
    }
  } catch {
    // Uszkodzone lub niedostępne dane – zaczynamy od nowa.
  }
  return seed();
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Nie udało się wczytać pliku.'));
    reader.readAsDataURL(file);
  });
}

function baseExercises() {
  return Object.entries(BASE_EXERCISES).flatMap(([category, names]) => names.map((name) => ({
    id: uid(), coach_id: null, name, category, description: '', media_url: null, media_type: null,
    video_url: '', is_public: false, created_at: now(), updated_at: now(),
  })));
}

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function seed() {
  const coach = { id: uid(), email: 'trener@demo.pl', full_name: 'Trener Demo', role: 'coach', coach_id: null, invite_code: 'DEMO01', created_at: now() };
  const anna = { id: uid(), email: 'anna@demo.pl', full_name: 'Anna Kowalska', role: 'client', coach_id: coach.id, invite_code: null, created_at: now() };
  const piotr = { id: uid(), email: 'piotr@demo.pl', full_name: 'Piotr Nowak', role: 'client', coach_id: coach.id, invite_code: null, created_at: now() };

  const plan = {
    id: uid(), coach_id: coach.id, client_id: anna.id, name: 'FBW – 3× w tygodniu',
    notes: 'Rozgrzewka 10 min przed każdym treningiem. Dni A i B wykonuj naprzemiennie.',
    created_at: now(), updated_at: now(),
  };
  const exercises_lib = baseExercises();
  exercises_lib.push({
    id: uid(), coach_id: coach.id, name: 'Wiosłowanie hantlem w podporze', category: 'Plecy',
    description: 'Kolano i dłoń na ławce, plecy proste. Ciągnij hantel w stronę biodra, łokieć blisko tułowia.',
    media_url: null, media_type: null, video_url: '', is_public: true, created_at: now(), updated_at: now(),
  });
  const libId = (name) => exercises_lib.find((e) => e.name === name)?.id ?? null;
  // Przykładowe superserie: w dniu A ćwiczenia B1–B2, w dniu B ćwiczenia B1–B3.
  const SUPERSET_WITH_PREVIOUS = ['Wiosłowanie hantlem w podporze', 'Podciąganie z gumą', 'Wykroki chodzone'];
  const ex = (day, name, sets, reps, weight, rest, notes = '') => ({ day, name, sets, reps, weight, rest, notes, exercise_id: libId(name) });
  const exercises = [
    ex('Dzień A', 'Przysiad ze sztangą', '4', '6–8', '60 kg', '2 min', 'Tempo 3-1-1'),
    ex('Dzień A', 'Wyciskanie sztangi leżąc', '4', '8', '35 kg', '2 min'),
    ex('Dzień A', 'Wiosłowanie hantlem w podporze', '3', '10–12', '14 kg', '90 s', 'Na każdą stronę'),
    ex('Dzień A', 'Plank', '3', '45 s', '', '60 s'),
    ex('Dzień B', 'Martwy ciąg rumuński', '4', '8', '50 kg', '2 min'),
    ex('Dzień B', 'Wyciskanie hantli nad głowę', '3', '10', '10 kg', '90 s'),
    ex('Dzień B', 'Podciąganie z gumą', '3', 'max', '', '2 min'),
    ex('Dzień B', 'Wykroki chodzone', '3', '12', '2×10 kg', '90 s', 'Na każdą nogę'),
  ].map((e, i) => ({ ...e, id: uid(), plan_id: plan.id, position: i, superset: SUPERSET_WITH_PREVIOUS.includes(e.name) }));

  const body_metrics = [];
  const lift_records = [];
  for (let w = 8; w >= 0; w--) {
    const date = daysAgo(w * 7);
    const week = 8 - w;
    body_metrics.push({
      id: uid(), client_id: anna.id, measured_on: date,
      weight: +(68.4 - week * 0.35 + (week % 3 === 0 ? 0.2 : 0)).toFixed(1),
      waist: +(78 - week * 0.4).toFixed(1), body_fat: +(27 - week * 0.3).toFixed(1),
      note: '', created_by: anna.id, created_at: now(),
    });
    if (week % 2 === 0) {
      lift_records.push(
        { id: uid(), client_id: anna.id, performed_on: date, exercise: 'Przysiad ze sztangą', weight: 50 + week * 2.5, reps: 6, note: '', created_by: anna.id, created_at: now() },
        { id: uid(), client_id: anna.id, performed_on: date, exercise: 'Wyciskanie sztangi leżąc', weight: 30 + week * 1.25, reps: 8, note: '', created_by: anna.id, created_at: now() },
        { id: uid(), client_id: anna.id, performed_on: date, exercise: 'Martwy ciąg rumuński', weight: 45 + week * 2.5, reps: 8, note: '', created_by: anna.id, created_at: now() },
      );
    }
  }
  body_metrics.push({
    id: uid(), client_id: piotr.id, measured_on: daysAgo(3), weight: 84.2, waist: 91, body_fat: null,
    note: 'Pomiar startowy', created_by: coach.id, created_at: now(),
  });

  return {
    session: null,
    profiles: [coach, anna, piotr],
    plans: [plan],
    exercises: exercises_lib,
    plan_exercises: exercises,
    body_metrics,
    lift_records,
  };
}
