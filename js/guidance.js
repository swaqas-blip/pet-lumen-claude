/*
 * Wellness Guidance engine.
 *
 * Rule-based (no AI-generated answers): each guidance item states which profile
 * details it used and lists the public source it summarizes, so owners can see
 * where information comes from. Guidance is general information to discuss with
 * a veterinarian — it never diagnoses or recommends treatment.
 */
(function (PL) {
  'use strict';
  const U = PL.util;

  const SOURCES = {
    canineVax: { name: '2022 AAHA Canine Vaccination Guidelines', org: 'American Animal Hospital Association', url: 'https://www.aaha.org/resources/2022-aaha-canine-vaccination-guidelines/' },
    felineVax: { name: '2020 AAHA/AAFP Feline Vaccination Guidelines', org: 'American Association of Feline Practitioners', url: 'https://catvets.com/' },
    canineLife: { name: '2019 AAHA Canine Life Stage Guidelines', org: 'American Animal Hospital Association', url: 'https://www.aaha.org/' },
    felineLife: { name: '2021 AAHA/AAFP Feline Life Stage Guidelines', org: 'American Association of Feline Practitioners', url: 'https://catvets.com/' },
    dental: { name: '2019 AAHA Dental Care Guidelines for Dogs and Cats', org: 'American Animal Hospital Association', url: 'https://www.aaha.org/' },
    nutrition: { name: 'WSAVA Global Nutrition Guidelines', org: 'World Small Animal Veterinary Association', url: 'https://wsava.org/global-guidelines/global-nutrition-guidelines/' },
    heartworm: { name: 'Heartworm prevention recommendations', org: 'American Heartworm Society', url: 'https://www.heartwormsociety.org/' },
    parasites: { name: 'Parasite control recommendations', org: 'Companion Animal Parasite Council', url: 'https://capcvet.org/' },
    socialization: { name: 'Position Statement on Puppy Socialization', org: 'American Veterinary Society of Animal Behavior', url: 'https://avsab.org/' },
    poison: { name: 'Animal Poison Control Center', org: 'ASPCA', url: 'https://www.aspca.org/pet-care/animal-poison-control' },
    avma: { name: 'Pet owner resources', org: 'American Veterinary Medical Association', url: 'https://www.avma.org/' },
    log: { name: "Your pet's PetLumen profile and log", org: 'Owner-entered information', url: null },
  };

  function ageInfo(birthDate, today) {
    const days = U.daysBetween(birthDate, today || U.today());
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30.44);
    const years = Math.floor(days / 365.25);
    let label;
    if (days < 0) label = 'Birth date is in the future';
    else if (weeks < 16) label = `${weeks} week${weeks === 1 ? '' : 's'}`;
    else if (months < 24) label = `${months} months`;
    else label = `${years} years`;
    return { days, weeks, months, years, label };
  }

  function lifeStage(pet, age) {
    if (pet.species === 'cat') return age.months < 12 ? 'Kitten' : age.years >= 10 ? 'Senior' : 'Adult';
    const big = pet.size === 'large' || pet.size === 'giant';
    if (age.months < (big ? 15 : 12)) return 'Puppy';
    return age.years >= (big ? 6 : 8) ? 'Senior' : 'Adult';
  }

  const PRIORITY_ORDER = { urgent: 0, attention: 1, info: 2 };

  function build(pet, records, symptoms, today) {
    today = today || U.today();
    const age = ageInfo(pet.birthDate, today);
    const stage = lifeStage(pet, age);
    const dog = pet.species === 'dog';
    const young = stage === 'Puppy' || stage === 'Kitten';
    const baby = dog ? 'puppy' : 'kitten';
    const vax = records.filter((r) => r.type === 'Vaccination');
    const lastVax = vax[0] || null;
    const lastVisit = records.find((r) => r.type === 'Wellness exam' || r.type === 'Vaccination') || null;
    const within = (d) => symptoms.filter((s) => U.daysBetween(s.date, today) <= d);
    const s30 = within(30);
    const s7 = within(7);
    const meds = (pet.medications || '').toLowerCase();

    const facts = {
      species: `Species: ${dog ? 'Dog' : 'Cat'}`,
      breed: `Breed: ${pet.breed || 'Not set'}`,
      age: `Age: ${age.label}`,
      stage: `Life stage: ${stage}`,
      size: dog ? `Size: ${PL.catalog.sizes[pet.size] || 'Not set'}` : null,
      weight: `Weight: ${pet.weightLb ? `${pet.weightLb} lb` : 'Not set'}`,
      neutered: `Spayed/neutered: ${pet.neutered ? 'Yes' : 'No'}`,
      meds: `Medications: ${pet.medications || 'None listed'}`,
      allergies: `Allergies: ${pet.allergies || 'None listed'}`,
      conditions: `Conditions: ${pet.conditions || 'None listed'}`,
      records: `Records on file: ${records.length}`,
      vax: `Last vaccination record: ${lastVax ? U.fmtDate(lastVax.date) : 'None on file'}`,
      symptoms: `Symptom entries, last 30 days: ${s30.length}`,
    };

    const cards = [];
    const add = (c) =>
      cards.push({ priority: 'info', ask: [], ...c, uses: c.uses.map((k) => facts[k]).filter(Boolean) });

    // ---------- Symptom-driven items ----------
    const flagged = s7.filter((s) => s.redFlags && s.redFlags.length);
    if (flagged.length) {
      const flags = [...new Set(flagged.flatMap((s) => s.redFlags))];
      add({
        id: 'red-flags', priority: 'urgent', category: 'Warning signs',
        title: 'Warning signs were logged — contact a veterinarian now',
        why: `You recorded: ${flags.join('; ')}. These can be emergencies. PetLumen cannot assess an emergency.`,
        uses: ['symptoms'],
        actions: [
          'Call your veterinarian or the nearest emergency animal hospital right away.',
          'For a suspected poisoning, the ASPCA Animal Poison Control Center is available at (888) 426-4435 (a fee may apply).',
          'Bring the packaging of anything your pet may have eaten, and your visit summary.',
        ],
        sources: [SOURCES.poison, SOURCES.avma],
      });
    }
    const severe = s7.filter((s) => Number(s.severity) >= 4);
    if (severe.length) {
      add({
        id: 'severe', priority: 'attention', category: 'Symptoms',
        title: `A ${severe[0].severity >= 5 ? 'severe' : 'significant'} change was logged this week`,
        why: `"${severe[0].description}" on ${U.fmtDate(severe[0].date)} was rated ${severe[0].severity}/5.`,
        uses: ['symptoms', 'age'],
        actions: [
          'Consider calling your veterinarian to describe the change and ask whether a visit is needed.',
          'Keep logging what you notice (when it happens, how long it lasts) so the timeline is accurate.',
        ],
        ask: ['Based on these entries, should my pet be seen, and how soon?', 'What changes should make me call back right away?'],
        sources: [SOURCES.log, SOURCES.avma],
      });
    }
    if (young && age.months < 6 && s7.some((s) => s.category === 'Digestive' || s.category === 'Eating & drinking')) {
      add({
        id: 'young-digestive', priority: 'attention', category: 'Symptoms',
        title: `Stomach upsets matter more in a young ${baby}`,
        why: `A digestive or appetite change was logged in the last 7 days for ${pet.name}, a ${age.label.replace(/ (\w+?)s?$/, '-$1')}-old ${baby}. Very young pets can become dehydrated faster than adults.`,
        uses: ['age', 'symptoms', 'vax'],
        actions: [
          'Call your veterinarian if vomiting or diarrhea continues or repeats, if there is blood, or if your pet stops eating or drinking or seems lethargic.',
          `Mention where your ${baby} is in the vaccine series — your vet will want to know.`,
        ],
        ask: ['Is this normal after a food change, or should we come in?'],
        sources: [SOURCES.log, dog ? SOURCES.canineVax : SOURCES.felineVax],
      });
    }
    const byCat = {};
    s30.forEach((s) => (byCat[s.category] = (byCat[s.category] || 0) + 1));
    Object.entries(byCat)
      .filter(([, n]) => n >= 2)
      .forEach(([cat, n]) =>
        add({
          id: `pattern-${cat}`, priority: 'info', category: 'Symptoms',
          title: `Pattern: ${n} "${cat}" entries in the last 30 days`,
          why: 'Repeated entries in the same area are worth sharing, even if each one seemed minor.',
          uses: ['symptoms'],
          actions: ['Open the Vet summary tab and bring it to your next visit or call.', 'Note anything that changed around the same time (food, treats, routine, environment).'],
          ask: [`Could these ${cat.toLowerCase()} changes be connected?`],
          sources: [SOURCES.log],
        })
      );

    // ---------- Preventive care ----------
    if (young && age.weeks < 26) {
      const daysSinceVax = lastVax ? U.daysBetween(lastVax.date, today) : null;
      const overdue = daysSinceVax === null ? age.weeks >= 9 : daysSinceVax > 28 && age.weeks < 20;
      add({
        id: 'vaccine-series', priority: overdue ? 'attention' : 'info', category: 'Preventive care',
        title: dog ? 'Puppy vaccine series' : 'Kitten vaccine series',
        why: lastVax
          ? `Last vaccination on file: ${lastVax.title} (${U.fmtDate(lastVax.date)}, ${daysSinceVax} days ago).`
          : `No vaccination record is on file for this ${age.label} old ${baby}.`,
        uses: ['age', 'species', 'vax', 'records'],
        actions: dog
          ? [
            'Core puppy vaccines (distemper, adenovirus, parvovirus) are generally given every 2–4 weeks starting at 6–8 weeks of age, until at least 16 weeks old.',
            'Rabies vaccination timing follows local law; ask your vet when it is due.',
            lastVax ? 'Add each dose as a record so the series stays complete in one place.' : 'Upload any shelter or breeder vaccine paperwork as a record.',
          ]
          : [
            'Core kitten vaccines (FVRCP) are generally given every 3–4 weeks until about 16–20 weeks of age.',
            'Ask your vet about rabies and feline leukemia (FeLV) vaccination for your kitten.',
            'Upload shelter or breeder paperwork as a record so the series stays complete.',
          ],
        ask: ['When is the next dose due, and when is the series complete?', 'Which non-core vaccines fit our lifestyle?'],
        sources: [dog ? SOURCES.canineVax : SOURCES.felineVax],
      });
    } else if (!lastVisit || U.daysBetween(lastVisit.date, today) > 365) {
      add({
        id: 'annual-visit', priority: 'attention', category: 'Preventive care',
        title: 'No wellness visit on file in the last 12 months',
        why: lastVisit ? `Most recent exam or vaccination record: ${U.fmtDate(lastVisit.date)}.` : 'No exam or vaccination records are on file yet.',
        uses: ['records', 'vax', 'stage'],
        actions: ['If you have records from another clinic, add them so the history is complete.', 'Ask your clinic whether an exam or booster is due.'],
        ask: ['Which vaccines or tests are due this year?'],
        sources: [dog ? SOURCES.canineLife : SOURCES.felineLife],
      });
    }

    if (dog && young && age.weeks < 20) {
      add({
        id: 'socialization', category: 'Behavior',
        title: 'Socialization window',
        why: `At ${age.label}, your puppy is in or near the main socialization period (about 3–14 weeks of age).`,
        uses: ['age', 'vax'],
        actions: [
          'Offer short, positive experiences with new people, sounds, surfaces, and handling.',
          'Puppy classes can start as early as 7–8 weeks when the puppy has had at least one set of vaccines and deworming, about a week before the first class.',
          'Avoid areas with unknown dogs or dog waste until your vet says the vaccine series is far enough along.',
        ],
        ask: ['Which places are safe for my puppy at this stage?'],
        sources: [SOURCES.socialization],
      });
    }

    if (dog) {
      const hasPrev = /heartworm/.test(meds);
      add({
        id: 'parasites', priority: hasPrev || age.weeks < 8 ? 'info' : 'attention', category: 'Preventive care',
        title: hasPrev ? 'Keep the parasite preventive on schedule' : 'No heartworm preventive listed',
        why: hasPrev ? `Listed on profile: ${pet.medications}.` : 'The profile does not list a heartworm or flea/tick preventive.',
        uses: ['meds', 'weight', 'age'],
        actions: [
          'The American Heartworm Society recommends year-round heartworm prevention and regular heartworm testing.',
          'Year-round flea, tick, and intestinal parasite control is commonly recommended; products are dosed by weight, so keep the weight on the profile current.',
          hasPrev ? 'Log the product name and dose in Medications so it shows on your vet summary.' : 'If your pet already receives a preventive, add it under Medications.',
        ],
        ask: ['Which preventive fits my pet’s weight and our area?', 'How often should fecal and heartworm tests be done?'],
        sources: [SOURCES.heartworm, SOURCES.parasites],
      });
    } else {
      add({
        id: 'parasites-cat', category: 'Preventive care',
        title: 'Parasite prevention for cats',
        why: pet.medications ? `Listed on profile: ${pet.medications}.` : 'No preventive is listed on the profile.',
        uses: ['meds', 'weight'],
        actions: ['Indoor cats can still get fleas and intestinal parasites; ask whether year-round prevention is recommended.', 'Never use a dog flea product on a cat unless your veterinarian says it is safe.'],
        ask: ['Does my indoor cat need year-round prevention?'],
        sources: [SOURCES.parasites],
      });
    }

    add({
      id: 'nutrition', category: 'Nutrition',
      title: young ? `Feeding a growing ${baby}` : 'Food and body condition',
      why: young
        ? `${pet.name} is a ${age.label.replace(/ (\w+?)s?$/, '-$1')}-old ${dog ? `${(PL.catalog.sizes[pet.size] || '').toLowerCase()} ` : ''}${baby}${pet.weightLb ? ` weighing ${pet.weightLb} lb` : ''}.`
        : `${pet.name} is a ${stage.toLowerCase()} ${dog ? 'dog' : 'cat'}${pet.weightLb ? ` weighing ${pet.weightLb} lb` : ''}.`,
      uses: ['age', 'stage', 'size', 'weight', 'allergies'],
      actions: [
        young ? 'Choose a complete and balanced food labeled for growth (or all life stages).' : 'Choose a complete and balanced food for your pet’s life stage.',
        dog && young && (pet.size === 'large' || pet.size === 'giant')
          ? 'Large and giant breed puppies benefit from food formulated for large-breed growth; avoid overfeeding and extra calcium supplements.'
          : 'Ask your vet to show you how to check body condition score at home.',
        'Change foods gradually over about a week to reduce stomach upset.',
        pet.allergies ? `Check ingredient labels for listed allergies: ${pet.allergies}.` : 'Treats should be a small part of daily calories.',
      ],
      ask: ['How much should my pet eat per day right now?', 'What is my pet’s ideal body condition score?'],
      sources: [SOURCES.nutrition],
    });

    if (!pet.neutered && age.months >= 4 && age.years < 2) {
      add({
        id: 'spay-neuter', category: 'Preventive care',
        title: 'Plan a spay/neuter conversation',
        why: `${pet.name} is ${age.label} old and the profile lists them as not spayed/neutered.`,
        uses: ['neutered', 'age', 'size', 'species'],
        actions: [
          'Timing is an individual decision; your veterinarian will consider breed, size, health, and lifestyle.',
          dog && (pet.size === 'large' || pet.size === 'giant') ? 'For large and giant breeds, some guidance suggests discussing waiting until growth is complete.' : 'Ask about recovery time and what to prepare at home.',
        ],
        ask: ['What timing do you recommend for my pet, and why?'],
        sources: [dog ? SOURCES.canineLife : SOURCES.felineLife],
      });
    }

    add({
      id: 'dental', category: 'Preventive care',
      title: young ? 'Start a tooth-brushing habit early' : 'Daily dental care',
      why: `Dental care applies at every life stage; ${pet.name} is in the ${stage.toLowerCase()} stage.`,
      uses: ['stage'],
      actions: [
        'Daily tooth brushing with pet toothpaste is the most effective home care.',
        young ? 'Short, positive sessions handling the mouth make brushing easier later.' : 'Ask whether a dental exam or cleaning is due at the next visit.',
      ],
      ask: ['Are there signs of dental disease I should watch for?'],
      sources: [SOURCES.dental],
    });

    if (stage === 'Senior') {
      add({
        id: 'senior', priority: 'info', category: 'Preventive care',
        title: 'Senior wellness check-ins',
        why: `${pet.name} is ${age.label} old, which is the senior life stage for ${dog ? 'this size of dog' : 'cats'}.`,
        uses: ['age', 'stage', 'size', 'conditions'],
        actions: ['Ask whether checkups every 6 months make sense.', 'Log changes in mobility, thirst, appetite, weight, or behavior — gradual changes are easy to miss.'],
        ask: ['Which screening tests do you recommend at this age?'],
        sources: [dog ? SOURCES.canineLife : SOURCES.felineLife],
      });
    }

    if (young) {
      add({
        id: 'toxins', category: 'Safety',
        title: `${dog ? 'Puppy' : 'Kitten'}-proof against common toxins`,
        why: `Young pets explore with their mouths. ${pet.name} is ${age.label} old.`,
        uses: ['age', 'species'],
        actions: [
          dog ? 'Keep chocolate, xylitol (in some gum and peanut butter), grapes/raisins, onions, and human medications out of reach.'
            : 'Keep lilies, human medications, string, and household cleaners out of reach.',
          'Save the ASPCA Animal Poison Control number: (888) 426-4435 (a fee may apply).',
        ],
        sources: [SOURCES.poison],
      });
    }

    if (pet.allergies || pet.conditions) {
      add({
        id: 'profile-health', category: 'Records',
        title: 'Keep health notes visible to every caregiver',
        why: [pet.allergies && `Allergies: ${pet.allergies}`, pet.conditions && `Conditions: ${pet.conditions}`].filter(Boolean).join('. ') + '.',
        uses: ['allergies', 'conditions', 'meds'],
        actions: ['These appear on the Vet summary — share it with sitters, groomers, or a new clinic.'],
        sources: [SOURCES.log],
      });
    }

    cards.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    return { age, stage, facts: Object.values(facts).filter(Boolean), cards, generatedOn: today };
  }

  PL.guidance = { build, ageInfo, lifeStage, SOURCES };
})(window.PL);
