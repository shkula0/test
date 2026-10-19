// Backend oparty o Supabase (wspólne dane trenera i podopiecznych).

export function createSupabaseBackend({ supabaseUrl, supabaseAnonKey }) {
  const sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

  async function run(query) {
    const { data, error } = await query;
    if (error) throw new Error(translateError(error.message));
    return data;
  }

  async function userId() {
    const { data } = await sb.auth.getSession();
    return data.session?.user.id ?? null;
  }

  return {
    mode: 'supabase',

    async currentUser() {
      const id = await userId();
      if (!id) return null;
      return run(sb.from('profiles').select('*').eq('id', id).maybeSingle());
    },

    async signIn(email, password) {
      await run(sb.auth.signInWithPassword({ email, password }));
    },

    async signUp({ email, password, fullName, role, coachCode }) {
      const data = await run(sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role, coach_code: coachCode ?? '' } },
      }));
      return { needsConfirmation: !data.session };
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async coachNameForCode(code) {
      return run(sb.rpc('coach_name_for_code', { p_code: code }));
    },

    async getProfile(id) {
      return run(sb.from('profiles').select('*').eq('id', id).maybeSingle());
    },

    async listClients() {
      const id = await userId();
      return run(sb.from('profiles').select('*').eq('coach_id', id).order('full_name'));
    },

    async listPlans(clientId) {
      return run(sb.from('plans').select('*').eq('client_id', clientId).order('updated_at', { ascending: false }));
    },

    async getPlan(id) {
      const plan = await run(sb.from('plans').select('*').eq('id', id).maybeSingle());
      if (!plan) return null;
      const exercises = await run(sb.from('plan_exercises').select('*').eq('plan_id', id).order('position'));
      return { plan, exercises };
    },

    async savePlan(plan, exercises) {
      const fields = { client_id: plan.client_id, name: plan.name, notes: plan.notes };
      const saved = plan.id
        ? await run(sb.from('plans').update(fields).eq('id', plan.id).select().single())
        : await run(sb.from('plans').insert(fields).select().single());
      await run(sb.from('plan_exercises').delete().eq('plan_id', saved.id));
      if (exercises.length) {
        await run(sb.from('plan_exercises').insert(
          exercises.map((e, i) => ({ ...stripId(e), plan_id: saved.id, position: i })),
        ));
      }
      return saved.id;
    },

    async deletePlan(id) {
      await run(sb.from('plans').delete().eq('id', id));
    },

    async listMetrics(clientId) {
      return run(sb.from('body_metrics').select('*').eq('client_id', clientId)
        .order('measured_on').order('created_at'));
    },

    async addMetric(clientId, metric) {
      await run(sb.from('body_metrics').insert({ ...metric, client_id: clientId }));
    },

    async deleteMetric(id) {
      await run(sb.from('body_metrics').delete().eq('id', id));
    },

    async listLifts(clientId) {
      return run(sb.from('lift_records').select('*').eq('client_id', clientId)
        .order('performed_on').order('created_at'));
    },

    async addLift(clientId, lift) {
      await run(sb.from('lift_records').insert({ ...lift, client_id: clientId }));
    },

    async deleteLift(id) {
      await run(sb.from('lift_records').delete().eq('id', id));
    },
  };
}

function stripId({ id, plan_id, ...rest }) {
  return rest;
}

function translateError(message) {
  const known = {
    'Invalid login credentials': 'Nieprawidłowy email lub hasło.',
    'Email not confirmed': 'Potwierdź adres email – sprawdź skrzynkę pocztową.',
    'User already registered': 'Konto z tym adresem email już istnieje.',
    'Database error saving new user': 'Nie udało się utworzyć konta – sprawdź kod trenera.',
  };
  if (known[message]) return known[message];
  if (message.startsWith('Password should be')) return 'Hasło musi mieć co najmniej 6 znaków.';
  return message;
}
