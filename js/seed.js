/*
 * Synthetic dataset for PetLumen prototype testing.
 *
 * Builds 1,000 clearly labeled synthetic owner accounts ("Synthetic Owner 0001"…,
 * @example.test emails, synthetic: true) with linked pet profiles, records,
 * symptom entries and activity history. These are generated test data and must
 * never be presented as real customers.
 *
 * Also builds one non-synthetic "Demo Owner" account with a sample puppy so the
 * five-minute demo has earlier observations to show on the timeline.
 */
(function (PL) {
  'use strict';

  const DAY = 86400000;
  const SYNTHETIC_OWNERS = 1000;

  // Small deterministic PRNG so every fresh seed produces the same dataset shape.
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PET_NAMES = [
    'Biscuit', 'Luna', 'Milo', 'Bella', 'Cooper', 'Daisy', 'Rocky', 'Nala', 'Teddy', 'Pepper',
    'Charlie', 'Willow', 'Bear', 'Olive', 'Ziggy', 'Rosie', 'Finn', 'Hazel', 'Moose', 'Juniper',
    'Scout', 'Penny', 'Murphy', 'Clover', 'Bentley', 'Ginger', 'Ollie', 'Maple', 'Tucker', 'Poppy',
    'Koda', 'Sadie', 'Winston', 'Mochi', 'Louie', 'Pickles', 'Bruno', 'Honey', 'Gus', 'Kiwi',
  ];
  const CLINICS = [
    'Riverbend Animal Hospital', 'Oak Street Veterinary', 'Northside Pet Clinic', 'Harbor View Vets',
    'Maple Grove Animal Care', 'Summit Veterinary Center', 'Prairie Paws Clinic', 'Cedar Lane Vet',
  ];
  const SYMPTOMS = [
    ['Digestive', 'Soft stool after switching food', 2], ['Digestive', 'Vomited once after eating quickly', 2],
    ['Digestive', 'Diarrhea twice today', 3], ['Eating & drinking', 'Skipped breakfast, ate dinner normally', 1],
    ['Eating & drinking', 'Drinking more water than usual', 2], ['Skin & coat', 'Scratching behind ears', 2],
    ['Skin & coat', 'Red patch on belly', 2], ['Skin & coat', 'Dry, flaky skin', 1],
    ['Energy & behavior', 'More tired than usual after walk', 2], ['Energy & behavior', 'Restless at night', 1],
    ['Energy & behavior', 'Hiding more than usual', 2], ['Eyes & ears', 'Watery left eye', 1],
    ['Eyes & ears', 'Head shaking and ear odor', 3], ['Mobility', 'Limping on front right leg', 3],
    ['Mobility', 'Stiff getting up in the morning', 2], ['Respiratory', 'Occasional sneezing', 1],
    ['Respiratory', 'Honking cough after playing', 3], ['Urinary', 'Accidents indoors after being house-trained', 2],
    ['Dental', 'Bad breath', 1], ['Dental', 'Chewing on one side', 2],
  ];
  const ADULT_LB = { toy: 6, small: 18, medium: 40, large: 70, giant: 120 };
  const GROWTH_MONTHS = { toy: 9, small: 10, medium: 12, large: 15, giant: 18 };

  function build(nowDate) {
    const rnd = mulberry32(485);
    const T = nowDate.getTime();
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const dateOf = (t) => PL.util.toISODate(new Date(t));
    const tsOf = (t) => new Date(Math.min(t, T - 60000)).toISOString();
    const C = PL.catalog;

    const db = {
      schema: 1,
      seededAt: nowDate.toISOString(),
      session: { userId: null },
      users: [], pets: [], records: [], symptoms: [], activity: [],
    };
    let seq = 0;
    const act = (userId, petId, action, detail, t) =>
      db.activity.push({ id: `a_seed${++seq}`, userId, petId, action, detail, ts: tsOf(t) });

    function addRecord(userId, pet, t, type, title, clinic, notes, created) {
      // About a quarter of synthetic records simulate an uploaded clinic file (metadata only).
      const upload = pet.synthetic && rnd() < 0.25;
      const attachment = upload ? { name: `${type.toLowerCase().replace(/\W+/g, '-')}-${dateOf(t)}.pdf`, size: int(40, 900) * 1024, type: 'application/pdf', synthetic: true } : null;
      const rec = { id: `r_seed${++seq}`, petId: pet.id, date: dateOf(t), type, title, clinic, notes, attachment };
      const logged = Math.max(t, created) + int(1, 30) * 3600000;
      rec.createdAt = tsOf(logged);
      db.records.push(rec);
      if (upload) act(userId, pet.id, 'record_uploaded', `${type}: ${title} (${attachment.name})`, logged);
      else act(userId, pet.id, 'record_added', `${type}: ${title}`, logged);
    }

    function addSymptom(userId, pet, t, category, description, severity, duration, redFlags) {
      const logged = t + int(1, 10) * 3600000;
      db.symptoms.push({
        id: `s_seed${++seq}`, petId: pet.id, date: dateOf(t), category, severity, description, duration,
        redFlags: redFlags || [], createdAt: tsOf(logged),
      });
      act(userId, pet.id, 'symptom_logged', `${category} (severity ${severity}/5): ${description}`, logged);
    }

    function makePet(userId, n, k, joined) {
      const r = rnd();
      let species, breed, size, ageDays;
      // Weighted toward young dogs to reflect the first-time puppy owner segment.
      if (r < 0.55) {
        species = 'dog'; [breed, size] = pick(C.dogBreeds); ageDays = int(56, 365);
      } else if (r < 0.8) {
        species = 'dog'; [breed, size] = pick(C.dogBreeds); ageDays = int(366, 14 * 365);
      } else {
        species = 'cat'; [breed, size] = pick(C.catBreeds); ageDays = rnd() < 0.25 ? int(56, 365) : int(366, 16 * 365);
      }
      const birth = T - ageDays * DAY;
      const ageMonths = ageDays / 30.44;
      const young = ageMonths < 12;
      const created = Math.min(Math.max(joined, birth + 49 * DAY) + int(0, 5) * DAY, T - DAY);

      let weight;
      if (species === 'cat') weight = (size === 'medium' ? 14 : 10) * Math.min(1, 0.2 + ageMonths / 12);
      else weight = ADULT_LB[size] * Math.min(1, 0.15 + (0.85 * ageMonths) / GROWTH_MONTHS[size]);
      weight = Math.round(weight * (0.85 + rnd() * 0.3) * 10) / 10;

      const clinic = pick(CLINICS);
      const pet = {
        id: `p_syn${n}_${k + 1}`, ownerId: userId, synthetic: true,
        name: pick(PET_NAMES), species, breed, size,
        sex: rnd() < 0.5 ? 'female' : 'male',
        neutered: young ? rnd() < 0.15 : rnd() < 0.85,
        birthDate: dateOf(birth), weightLb: weight,
        allergies: rnd() < 0.1 ? pick(['Chicken', 'Beef', 'Flea bites', 'Grass pollen']) : '',
        medications: species === 'dog' && rnd() < 0.6 ? 'Monthly heartworm and flea/tick preventive'
          : species === 'cat' && rnd() < 0.3 ? 'Monthly topical flea preventive' : '',
        conditions: !young && rnd() < 0.12 ? pick(['Seasonal allergies', 'Arthritis', 'Sensitive stomach']) : '',
        clinic, microchip: rnd() < 0.5 ? `SYN-${n}${k}` : '',
        vetQuestions: '', createdAt: tsOf(created), updatedAt: tsOf(created),
      };
      db.pets.push(pet);
      act(userId, pet.id, 'profile_created', `${pet.name} added`, created);

      // Records
      const vaxName = species === 'dog' ? 'DHPP' : 'FVRCP';
      if (young) {
        [8, 12, 16].forEach((wk) => {
          const t = birth + wk * 7 * DAY;
          if (t <= T - DAY) addRecord(userId, pet, t, 'Vaccination', `${wk}-week ${vaxName} vaccine`, clinic, 'Puppy/kitten series dose.', created);
        });
        if (ageDays > 112 && rnd() < 0.7) addRecord(userId, pet, birth + int(112, Math.min(ageDays - 1, 140)) * DAY, 'Vaccination', 'Rabies vaccine', clinic, '', created);
      } else {
        const exam = T - int(20, 420) * DAY;
        addRecord(userId, pet, exam, 'Wellness exam', 'Annual wellness exam', clinic, 'Weight and body condition reviewed.', created);
        if (rnd() < 0.8) addRecord(userId, pet, exam, 'Vaccination', `${vaxName} booster`, clinic, '', created);
        if (rnd() < 0.2) addRecord(userId, pet, T - int(30, 300) * DAY, 'Dental', 'Dental cleaning', clinic, '', created);
        if (rnd() < 0.15) addRecord(userId, pet, T - int(30, 300) * DAY, 'Lab result', 'Routine bloodwork', clinic, 'Results within normal range per clinic.', created);
      }

      // Symptoms (logged after the profile existed)
      const count = pick([0, 1, 1, 2, 2, 3, 4]);
      for (let i = 0; i < count; i++) {
        const [cat, desc, base] = pick(SYMPTOMS);
        const sev = Math.max(1, Math.min(4, base + int(-1, 1)));
        addSymptom(userId, pet, created + rnd() * (T - created), cat, desc, sev, pick(C.durations));
      }

      // Guidance views and profile updates
      for (let i = int(0, 3); i > 0; i--) act(userId, pet.id, 'guidance_requested', 'Wellness guidance viewed', created + rnd() * (T - created));
      if (rnd() < 0.3) act(userId, pet.id, 'vet_summary_prepared', 'Visit summary opened', created + rnd() * (T - created));
      for (let i = int(0, 2); i > 0; i--) act(userId, pet.id, 'profile_updated', `Changed ${pick(['weight', 'medications', 'clinic', 'allergies'])}`, created + rnd() * (T - created));
    }

    for (let i = 1; i <= SYNTHETIC_OWNERS; i++) {
      const n = String(i).padStart(4, '0');
      const userId = `u_syn${n}`;
      const joined = T - int(20, 360) * DAY;
      db.users.push({
        id: userId, name: `Synthetic Owner ${n}`, email: `synthetic.owner${n}@example.test`,
        synthetic: true, createdAt: tsOf(joined),
      });
      act(userId, null, 'account_created', 'Synthetic seed account', joined);
      const pets = rnd() < 0.7 ? 1 : rnd() < 0.83 ? 2 : 3;
      for (let k = 0; k < pets; k++) makePet(userId, n, k, joined);
    }

    // ---- Demo owner with one sample puppy ----
    const demoJoined = T - 45 * DAY;
    const demo = { id: 'u_demo', name: 'Demo Owner', email: 'demo@petlumen.test', synthetic: false, demo: true, createdAt: tsOf(demoJoined) };
    db.users.push(demo);
    act(demo.id, null, 'account_created', '', demoJoined);
    const birth = T - 98 * DAY;
    const maple = {
      id: 'p_demo_maple', ownerId: demo.id, sample: true, name: 'Maple', species: 'dog',
      breed: 'Golden Retriever', size: 'large', sex: 'female', neutered: false,
      birthDate: dateOf(birth), weightLb: 22,
      allergies: '', medications: 'Monthly heartworm and flea/tick preventive', conditions: '',
      clinic: 'Lakeside Veterinary Clinic (sample)', microchip: '',
      vetQuestions: 'Is her soft stool normal after a food change?\nWhen should we schedule her spay?',
      createdAt: tsOf(T - 44 * DAY), updatedAt: tsOf(T - 44 * DAY),
    };
    db.pets.push(maple);
    act(demo.id, maple.id, 'profile_created', 'Maple added', T - 44 * DAY);
    addRecord(demo.id, maple, birth + 56 * DAY, 'Vaccination', '8-week DHPP vaccine', maple.clinic, 'First puppy series dose. Dewormed same visit.', T - 44 * DAY);
    addRecord(demo.id, maple, birth + 84 * DAY, 'Vaccination', '12-week DHPP vaccine', maple.clinic, 'Second dose. Next dose due around 16 weeks.', T - 44 * DAY);
    addSymptom(demo.id, maple, T - 12 * DAY, 'Digestive', 'Soft stool two days after switching to new puppy food', 2, '1–2 days');
    addSymptom(demo.id, maple, T - 5 * DAY, 'Skin & coat', 'Scratching behind left ear after bath', 2, '3–7 days');
    act(demo.id, maple.id, 'guidance_requested', 'Wellness guidance viewed', T - 5 * DAY + 3 * 3600000);

    return db;
  }

  PL.seed = { build, SYNTHETIC_OWNERS };
})(window.PL);
