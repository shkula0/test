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

    async listWorkouts(clientId) {
      return db.workouts.filter((w) => w.client_id === clientId)
        .sort((a, b) => b.performed_on.localeCompare(a.performed_on) || b.created_at.localeCompare(a.created_at));
    },

    async getWorkout(id) {
      const workout = db.workouts.find((w) => w.id === id);
      if (!workout) return null;
      const sets = db.workout_sets.filter((s) => s.workout_id === id)
        .sort((a, b) => a.position - b.position || a.set_number - b.set_number);
      return { workout, sets };
    },

    async listWorkoutSets(clientId) {
      const workouts = new Map(db.workouts.filter((w) => w.client_id === clientId).map((w) => [w.id, w]));
      return db.workout_sets.filter((s) => workouts.has(s.workout_id)).map((s) => {
        const w = workouts.get(s.workout_id);
        return { ...s, performed_on: w.performed_on, plan_id: w.plan_id, day: w.day, workout_created_at: w.created_at };
      });
    },

    async saveWorkout(workout, sets) {
      const fields = {
        client_id: workout.client_id, plan_id: workout.plan_id, plan_name: workout.plan_name,
        day: workout.day, performed_on: workout.performed_on, notes: workout.notes,
      };
      let saved = workout.id && db.workouts.find((w) => w.id === workout.id);
      if (saved) {
        Object.assign(saved, fields, { updated_at: now() });
      } else {
        saved = { ...fields, id: uid(), created_by: db.session, created_at: now(), updated_at: now() };
        db.workouts.push(saved);
      }
      db.workout_sets = db.workout_sets.filter((s) => s.workout_id !== saved.id);
      sets.forEach((set) => db.workout_sets.push({ ...set, id: uid(), workout_id: saved.id }));
      save();
      return saved.id;
    },

    async deleteWorkout(id) {
      db.workouts = db.workouts.filter((w) => w.id !== id);
      db.workout_sets = db.workout_sets.filter((s) => s.workout_id !== id);
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
      data.workouts ??= [];
      data.workout_sets ??= [];
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
      id: uid(), client_id: anna.id, measured_on: date, source: 'self',
      weight: +(68.4 - week * 0.35 + (week % 3 === 0 ? 0.2 : 0)).toFixed(1),
      height: week === 0 ? 168 : null,
      waist: week % 2 === 0 ? +(78 - week * 0.4).toFixed(1) : null,
      hips: week % 2 === 0 ? +(101 - week * 0.3).toFixed(1) : null,
      chest: week % 4 === 0 ? 92 - week * 0.2 : null,
      arm: week % 4 === 0 ? 29 + week * 0.05 : null,
      thigh: week % 4 === 0 ? 58 - week * 0.15 : null,
      note: '', created_by: anna.id, created_at: now(),
    });
    if (week % 4 === 0) {
      body_metrics.push({
        id: uid(), client_id: anna.id, measured_on: date, source: 'scale',
        body_fat: +(27 - week * 0.3).toFixed(1), fat_mass: +(18.5 - week * 0.3).toFixed(1),
        muscle_mass: +(26.1 + week * 0.1).toFixed(1), visceral_fat: 7 - Math.floor(week / 4), body_water: +(36.2 + week * 0.05).toFixed(1),
        note: 'InBody na siłowni', created_by: coach.id, created_at: now(),
      });
    }
    if (week % 2 === 0) {
      lift_records.push(
        { id: uid(), client_id: anna.id, performed_on: date, exercise: 'Przysiad ze sztangą', weight: 50 + week * 2.5, reps: 6, note: '', created_by: anna.id, created_at: now() },
        { id: uid(), client_id: anna.id, performed_on: date, exercise: 'Wyciskanie sztangi leżąc', weight: 30 + week * 1.25, reps: 8, note: '', created_by: anna.id, created_at: now() },
        { id: uid(), client_id: anna.id, performed_on: date, exercise: 'Martwy ciąg rumuński', weight: 45 + week * 2.5, reps: 8, note: '', created_by: anna.id, created_at: now() },
      );
    }
  }
  body_metrics.push({
    id: uid(), client_id: piotr.id, measured_on: daysAgo(3), source: 'self', weight: 84.2, height: 182, waist: 91,
    note: 'Pomiar startowy', created_by: coach.id, created_at: now(),
  });

  // Dwa wcześniejsze treningi z dnia A, żeby było widać „Poprzednio”.
  const workouts = [];
  const workout_sets = [];
  const dayA = exercises.filter((e) => e.day === 'Dzień A');
  [[14, 0], [7, 1]].forEach(([ago, step]) => {
    const workout = {
      id: uid(), client_id: anna.id, plan_id: plan.id, plan_name: plan.name, day: 'Dzień A',
      performed_on: daysAgo(ago), notes: step ? 'Dobra forma, przysiad szedł lekko.' : '',
      created_by: coach.id, created_at: now(), updated_at: now(),
    };
    workouts.push(workout);
    const base = { 'Przysiad ze sztangą': [55, 8], 'Wyciskanie sztangi leżąc': [32.5, 8], 'Wiosłowanie hantlem w podporze': [12, 12], 'Plank': [0, 40] };
    dayA.forEach((ex, position) => {
      const [weight, reps] = base[ex.name];
      const count = Number.parseInt(ex.sets, 10) || 3;
      for (let set = 1; set <= count; set++) {
        workout_sets.push({
          id: uid(), workout_id: workout.id, position, label: '', exercise_name: ex.name, exercise_id: ex.exercise_id,
          set_number: set, weight: weight ? weight + step * 2.5 : null, reps: reps - (set === count ? 1 : 0) + step * (weight ? 0 : 5),
          done: true, note: '',
        });
      }
    });
  });

  return {
    session: null,
    profiles: [coach, anna, piotr],
    plans: [plan],
    exercises: exercises_lib,
    workouts,
    workout_sets,
    plan_exercises: exercises,
    body_metrics,
    lift_records,
  };
}
