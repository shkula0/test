// Backend demonstracyjny: dane trzymane w localStorage tej przeglądarki.
// Pozwala obejrzeć aplikację bez konfigurowania Supabase.

const STORAGE_KEY = 'trener-demo-v1';

export function createDemoBackend() {
  let db = load();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Brak dostępu do localStorage (np. tryb prywatny) – dane zostają tylko w pamięci.
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
    if (stored) return JSON.parse(stored);
  } catch {
    // Uszkodzone lub niedostępne dane – zaczynamy od nowa.
  }
  return seed();
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
  const ex = (day, name, sets, reps, weight, rest, notes = '') => ({ day, name, sets, reps, weight, rest, notes });
  const exercises = [
    ex('Dzień A', 'Przysiad ze sztangą', '4', '6–8', '60 kg', '2 min', 'Tempo 3-1-1'),
    ex('Dzień A', 'Wyciskanie sztangi leżąc', '4', '8', '35 kg', '2 min'),
    ex('Dzień A', 'Wiosłowanie hantlem', '3', '10–12', '14 kg', '90 s', 'Na każdą stronę'),
    ex('Dzień A', 'Plank', '3', '45 s', '', '60 s'),
    ex('Dzień B', 'Martwy ciąg rumuński', '4', '8', '50 kg', '2 min'),
    ex('Dzień B', 'Wyciskanie hantli nad głowę', '3', '10', '10 kg', '90 s'),
    ex('Dzień B', 'Podciąganie z gumą', '3', 'max', '', '2 min'),
    ex('Dzień B', 'Wykroki chodzone', '3', '12', '2×10 kg', '90 s', 'Na każdą nogę'),
  ].map((e, i) => ({ ...e, id: uid(), plan_id: plan.id, position: i }));

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
    plan_exercises: exercises,
    body_metrics,
    lift_records,
  };
}
