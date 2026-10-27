/*
 * PetLumen data layer.
 * All app data lives in one object saved to IndexedDB so changes survive a page
 * refresh. Uploaded record files are stored in a separate object store.
 */
window.PL = window.PL || {};

(function (PL) {
  'use strict';

  // ---------- Utilities ----------
  const pad = (n) => String(n).padStart(2, '0');
  const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  // Whole days from a to b (b - a), using local calendar dates.
  const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  const fmtDate = (s) =>
    s ? parseDate(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const fmtTs = (ts) =>
    ts ? new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  PL.util = { toISODate, parseDate, daysBetween, fmtDate, fmtTs, uid, today: () => toISODate(new Date()) };

  // ---------- Shared catalog ----------
  PL.catalog = {
    dogBreeds: [
      ['Labrador Retriever', 'large'], ['Golden Retriever', 'large'], ['French Bulldog', 'small'],
      ['German Shepherd', 'large'], ['Standard Poodle', 'medium'], ['Toy Poodle', 'toy'],
      ['Beagle', 'medium'], ['Dachshund', 'small'], ['Bernese Mountain Dog', 'giant'],
      ['Great Dane', 'giant'], ['Mixed breed', 'medium'], ['Australian Shepherd', 'medium'],
      ['Cavalier King Charles Spaniel', 'small'], ['Chihuahua', 'toy'], ['Boxer', 'large'],
      ['Shih Tzu', 'small'], ['Pembroke Welsh Corgi', 'medium'], ['Siberian Husky', 'large'],
      ['Goldendoodle', 'large'], ['Yorkshire Terrier', 'toy'], ['Border Collie', 'medium'],
      ['Miniature Schnauzer', 'small'], ['Newfoundland', 'giant'], ['Cocker Spaniel', 'medium'],
    ],
    catBreeds: [
      ['Domestic Shorthair', 'small'], ['Domestic Longhair', 'small'], ['Siamese', 'small'],
      ['Maine Coon', 'medium'], ['Ragdoll', 'medium'], ['British Shorthair', 'small'],
    ],
    sizes: { toy: 'Toy breed', small: 'Small breed', medium: 'Medium breed', large: 'Large breed', giant: 'Giant breed' },
    recordTypes: ['Vaccination', 'Wellness exam', 'Medication', 'Lab result', 'Dental', 'Surgery / procedure', 'Other'],
    symptomCategories: [
      'Digestive', 'Skin & coat', 'Energy & behavior', 'Eyes & ears', 'Mobility',
      'Respiratory', 'Urinary', 'Dental', 'Eating & drinking', 'Other',
    ],
    severities: ['Barely noticeable', 'Mild', 'Moderate', 'Significant', 'Severe'],
    durations: ['Less than a day', '1–2 days', '3–7 days', 'More than a week', 'Comes and goes'],
    redFlags: [
      'Trouble breathing',
      'Collapse or unable to stand',
      'Seizure',
      'Suspected poisoning or toxin ingestion',
      'Repeated vomiting or vomiting blood',
      'Swollen belly or retching with nothing coming up',
      'Pale, gray, or blue gums',
      'Major injury or heavy bleeding',
    ],
    actions: {
      account_created: 'Account created',
      profile_created: 'Profile created',
      profile_updated: 'Profile updated',
      record_added: 'Record added',
      record_uploaded: 'Record uploaded',
      symptom_logged: 'Symptom logged',
      guidance_requested: 'Guidance requested',
      vet_summary_prepared: 'Vet summary prepared',
    },
  };

  // ---------- Persistence (IndexedDB) ----------
  // The whole state is kept in memory and saved as one object. IndexedDB is
  // used instead of localStorage because the synthetic dataset alone is ~4 MB.
  const DB_NAME = 'petlumen';
  const SCHEMA = 1;
  let db = null;
  let idb = null;

  function openIdb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('state');
        req.result.createObjectStore('files');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(storeName, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = idb.transaction(storeName, mode);
      const req = fn(t.objectStore(storeName));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  // The object is cloned synchronously when put() is called, so the saved
  // snapshot always matches the state at the moment of the change.
  let pendingWrites = 0;
  function persist() {
    pendingWrites++;
    return tx('state', 'readwrite', (s) => s.put(db, 'db'))
      .catch((e) => {
        console.error('PetLumen: could not save', e);
        if (PL.ui) PL.ui.toast('Could not save: browser storage is full or blocked.', 'error');
      })
      .finally(() => pendingWrites--);
  }
  window.addEventListener('beforeunload', (e) => {
    if (pendingWrites > 0) e.preventDefault();
  });

  const byId = (list, id) => list.find((x) => x.id === id) || null;
  const byDateDesc = (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

  function log(userId, petId, action, detail) {
    db.activity.push({ id: uid('a'), userId, petId: petId || null, action, detail: detail || '', ts: new Date().toISOString() });
  }

  // Avoid logging the same "view" interaction repeatedly when a tab is re-opened.
  function logOnce(userId, petId, action, detail, windowMs) {
    const cutoff = Date.now() - windowMs;
    for (let i = db.activity.length - 1; i >= 0; i--) {
      const a = db.activity[i];
      if (Date.parse(a.ts) < cutoff) break;
      if (a.userId === userId && a.petId === petId && a.action === action) return false;
    }
    log(userId, petId, action, detail);
    persist();
    return true;
  }

  const PET_FIELDS = [
    'name', 'species', 'breed', 'size', 'sex', 'neutered', 'birthDate', 'weightLb',
    'allergies', 'medications', 'conditions', 'clinic', 'microchip',
  ];
  const FIELD_LABELS = {
    name: 'name', species: 'species', breed: 'breed', size: 'size', sex: 'sex', neutered: 'spay/neuter status',
    birthDate: 'birth date', weightLb: 'weight', allergies: 'allergies', medications: 'medications',
    conditions: 'conditions', clinic: 'clinic', microchip: 'microchip',
  };

  PL.store = {
    async init() {
      idb = await openIdb();
      const saved = await tx('state', 'readonly', (s) => s.get('db'));
      db = saved && saved.schema === SCHEMA ? saved : null;
      if (!db) {
        db = PL.seed.build(new Date());
        await persist();
      }
      return db;
    },
    async reset() {
      await tx('files', 'readwrite', (s) => s.clear());
      db = PL.seed.build(new Date());
      await persist();
    },
    get data() {
      return db;
    },

    // Session
    signIn(userId) {
      db.session = { userId };
      persist();
    },
    signOut() {
      db.session = { userId: null };
      persist();
    },
    currentUser() {
      return db.session && db.session.userId ? byId(db.users, db.session.userId) : null;
    },

    // Queries
    user: (id) => byId(db.users, id),
    pet: (id) => byId(db.pets, id),
    findUserByEmail: (email) => db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null,
    petsOf: (userId) => db.pets.filter((p) => p.ownerId === userId),
    recordsOf: (petId) => db.records.filter((r) => r.petId === petId).sort(byDateDesc),
    symptomsOf: (petId) => db.symptoms.filter((s) => s.petId === petId).sort(byDateDesc),
    activityOf: (userId) => db.activity.filter((a) => a.userId === userId).sort((a, b) => b.ts.localeCompare(a.ts)),

    // Mutations — each one records a trackable interaction in the activity history.
    createUser({ name, email }) {
      const user = { id: uid('u'), name, email, synthetic: false, createdAt: new Date().toISOString() };
      db.users.push(user);
      log(user.id, null, 'account_created', '');
      db.session = { userId: user.id };
      persist();
      return user;
    },

    createPet(ownerId, fields) {
      const now = new Date().toISOString();
      const pet = { id: uid('p'), ownerId, vetQuestions: '', createdAt: now, updatedAt: now };
      PET_FIELDS.forEach((k) => (pet[k] = fields[k]));
      db.pets.push(pet);
      log(ownerId, pet.id, 'profile_created', `${pet.name} added`);
      persist();
      return pet;
    },

    updatePet(petId, userId, fields) {
      const pet = byId(db.pets, petId);
      const changed = PET_FIELDS.filter((k) => fields[k] !== undefined && fields[k] !== pet[k]);
      if (!changed.length) return [];
      changed.forEach((k) => (pet[k] = fields[k]));
      pet.updatedAt = new Date().toISOString();
      log(userId, petId, 'profile_updated', `Changed ${changed.map((k) => FIELD_LABELS[k]).join(', ')}`);
      persist();
      return changed;
    },

    saveVetQuestions(petId, text) {
      byId(db.pets, petId).vetQuestions = text;
      persist();
    },

    addRecord(petId, userId, fields, attachment) {
      const rec = { id: fields.id || uid('r'), petId, createdAt: new Date().toISOString(), attachment: attachment || null };
      ['date', 'type', 'title', 'clinic', 'notes'].forEach((k) => (rec[k] = fields[k]));
      db.records.push(rec);
      if (attachment) log(userId, petId, 'record_uploaded', `${rec.type}: ${rec.title} (${attachment.name})`);
      else log(userId, petId, 'record_added', `${rec.type}: ${rec.title}`);
      persist();
      return rec;
    },

    addSymptom(petId, userId, fields) {
      const s = { id: uid('s'), petId, createdAt: new Date().toISOString() };
      ['date', 'category', 'severity', 'description', 'duration', 'redFlags'].forEach((k) => (s[k] = fields[k]));
      db.symptoms.push(s);
      log(userId, petId, 'symptom_logged', `${s.category} (severity ${s.severity}/5): ${s.description}`);
      persist();
      return s;
    },

    logGuidance(petId, userId, cardCount) {
      return logOnce(userId, petId, 'guidance_requested', `${cardCount} guidance items shown`, 2 * 60 * 1000);
    },
    logVetSummary(petId, userId) {
      return logOnce(userId, petId, 'vet_summary_prepared', 'Visit summary opened', 2 * 60 * 1000);
    },
  };

  // ---------- Uploaded record files ----------
  PL.files = {
    put: (id, file) => tx('files', 'readwrite', (s) => s.put(file, id)),
    get: (id) => tx('files', 'readonly', (s) => s.get(id)),
  };
})(window.PL);
