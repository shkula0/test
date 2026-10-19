// Backend oparty o Supabase (wspólne dane trenera i podopiecznych).

const MEDIA_BUCKET = 'exercise-media';

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

    async listExercises() {
      return run(sb.from('exercises').select('*').order('name'));
    },

    async getExercise(id) {
      return run(sb.from('exercises').select('*').eq('id', id).maybeSingle());
    },

    async saveExercise(exercise, { file, removeMedia } = {}) {
      const fields = {
        name: exercise.name,
        category: exercise.category,
        description: exercise.description,
        video_url: exercise.video_url,
        is_public: exercise.is_public,
      };
      const previous = exercise.id ? await this.getExercise(exercise.id) : null;

      if (file) {
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${await userId()}/${crypto.randomUUID()}.${ext}`;
        await run(sb.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' }));
        Object.assign(fields, {
          media_path: path,
          media_url: sb.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl,
          media_type: file.type.startsWith('video/') ? 'video' : 'image',
        });
      } else if (removeMedia) {
        Object.assign(fields, { media_path: null, media_url: null, media_type: null });
      }

      const saved = exercise.id
        ? await run(sb.from('exercises').update(fields).eq('id', exercise.id).select().single())
        : await run(sb.from('exercises').insert(fields).select().single());

      if (previous?.media_path && (file || removeMedia)) {
        await sb.storage.from(MEDIA_BUCKET).remove([previous.media_path]);
      }
      return saved.id;
    },

    async deleteExercise(id) {
      const exercise = await this.getExercise(id);
      await run(sb.from('exercises').delete().eq('id', id));
      if (exercise?.media_path) await sb.storage.from(MEDIA_BUCKET).remove([exercise.media_path]);
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
  if (/exceeded the maximum allowed size|Payload too large/i.test(message)) return 'Plik jest za duży (maks. 50 MB).';
  if (message.startsWith('Password should be')) return 'Hasło musi mieć co najmniej 6 znaków.';
  return message;
}
