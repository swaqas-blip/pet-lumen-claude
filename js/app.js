/*
 * PetLumen prototype UI: hash router, views, and event handlers.
 * Views return HTML strings; events are handled by delegation on the document
 * using data-form / data-action attributes.
 */
(function (PL) {
  'use strict';

  const store = PL.store;
  const U = PL.util;
  const C = PL.catalog;
  const app = document.getElementById('app');

  const ui = { dataPage: 1, dataQuery: '', actPage: 1, actPet: '', actAction: '', timeline: 'all' };
  const PAGE = { data: 20, activity: 40 };

  // ---------- Helpers ----------
  const h = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const go = (hash) => {
    if (location.hash === hash) render();
    else location.hash = hash;
  };
  const speciesIcon = (pet) => (pet.species === 'cat' ? '🐱' : '🐶');
  const sevClass = (n) => (n >= 4 ? 'sev-high' : n >= 3 ? 'sev-mid' : 'sev-low');
  const recent = (ts, minutes) => ts && Date.now() - Date.parse(ts) < minutes * 60000;
  const nl2br = (s) => h(s).replace(/\n/g, '<br>');

  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = `toast ${type || ''}`;
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }
  PL.ui = { toast };

  function pager(page, total, size, action) {
    const pages = Math.max(1, Math.ceil(total / size));
    if (pages === 1) return '';
    return `<div class="pager">
      <button class="btn btn-ghost btn-sm" data-action="${action}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
      <span class="muted small">Page ${page} of ${pages}</span>
      <button class="btn btn-ghost btn-sm" data-action="${action}" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next →</button>
    </div>`;
  }

  // ---------- Layout ----------
  function header(user, view) {
    const link = (href, label, key) => `<a href="${href}" class="${view === key ? 'active' : ''}">${label}</a>`;
    return `
      <header class="topbar"><div class="wrap topbar-inner">
        <a class="brand" href="#/${user ? 'pets' : 'login'}" aria-label="PetLumen home">
          <img src="assets/logo.svg" alt="" width="34" height="34"><span class="wordmark">Pet<span>Lumen</span></span>
        </a>
        <nav class="nav" aria-label="Main">
          ${user ? link('#/pets', 'My pets', 'pets') + link('#/activity', 'Activity', 'activity') : ''}
          ${link('#/data', 'Synthetic data', 'data')}
        </nav>
        <div class="userbox">
          ${user
            ? `<span class="user-name" title="${h(user.email)}">${h(user.name)}</span>
               ${user.synthetic ? '<span class="badge badge-syn">Synthetic</span>' : ''}
               <button class="btn btn-ghost btn-sm" data-action="sign-out">Sign out</button>`
            : '<a class="btn btn-sm btn-primary" href="#/login">Sign in</a>'}
        </div>
      </div></header>
      ${user && user.synthetic
        ? `<div class="syn-banner" role="note"><div class="wrap">You are viewing <strong>${h(user.name)}</strong>, a <strong>synthetic test account</strong>. This is generated sample data, not a real customer.</div></div>`
        : ''}`;
  }

  const footer = () => `
    <footer class="footer"><div class="wrap">
      <p><strong>PetLumen is a class prototype (MGMT 485).</strong> It organizes owner-entered information and shares general, sourced care information.
      It does not diagnose or treat, does not replace a veterinarian, and is not a 24/7 veterinary service.
      In an emergency, contact your veterinarian or an emergency animal hospital.</p>
      <p class="muted">Data is stored only in this browser.</p>
    </div></footer>`;

  // ---------- Views ----------
  function viewLogin() {
    return `
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Prototype · Pet health, made clearer</p>
          <h1>Your pet’s health, in one clear place.</h1>
          <p class="lead">PetLumen helps first-time puppy owners manage their pet’s everyday health by connecting a digital health profile, symptom history, and personalized wellness guidance in one place.</p>
          <ul class="feature-list">
            <li><span class="fi">📁</span><div><strong>Pet Health Profile</strong><br>Keep vaccines, visits, medications, and uploaded records together.</div></li>
            <li><span class="fi">📈</span><div><strong>Symptom Tracking</strong><br>Record what changed and when, then review it on a dated timeline.</div></li>
            <li><span class="fi">💡</span><div><strong>Wellness Guidance</strong><br>Care information matched to your pet’s profile, with visible sources.</div></li>
          </ul>
        </div>
        <div class="card auth-card">
          <h2>Get started</h2>
          <button class="btn btn-primary btn-block" data-action="demo-sign-in">Continue as Demo Owner</button>
          <p class="muted small">Includes a sample puppy, Maple, with earlier records and observations.</p>
          <div class="divider"><span>or use your own account</span></div>
          <form data-form="sign-up" novalidate>
            <label>Your name<input name="name" autocomplete="name" required maxlength="80"></label>
            <label>Email<input name="email" type="email" autocomplete="email" required maxlength="120"></label>
            <button class="btn btn-block" type="submit">Create account or sign in</button>
          </form>
          <p class="muted small">Prototype accounts have no password and live only in this browser.</p>
        </div>
      </section>`;
  }

  function viewPets(user) {
    const pets = store.petsOf(user.id);
    const today = U.today();
    const cards = pets
      .map((p) => {
        const age = PL.guidance.ageInfo(p.birthDate);
        const syms = store.symptomsOf(p.id);
        const s30 = syms.filter((s) => U.daysBetween(s.date, today) <= 30).length;
        const recs = store.recordsOf(p.id).length;
        return `
          <a class="card pet-card" href="#/pet/${h(p.id)}">
            <div class="avatar" aria-hidden="true">${speciesIcon(p)}</div>
            <div class="pet-card-body">
              <h3>${h(p.name)} ${p.sample ? '<span class="badge">Sample</span>' : ''}${p.synthetic ? '<span class="badge badge-syn">Synthetic</span>' : ''}</h3>
              <p class="muted">${h(p.breed || (p.species === 'cat' ? 'Cat' : 'Dog'))} · ${h(age.label)}</p>
              <div class="chips">
                <span class="chip">${recs} record${recs === 1 ? '' : 's'}</span>
                <span class="chip">${s30} symptom${s30 === 1 ? '' : 's'} in 30 days</span>
                ${syms[0] ? `<span class="chip">Last entry ${h(U.fmtDate(syms[0].date))}</span>` : ''}
              </div>
            </div>
          </a>`;
      })
      .join('');
    return `
      <div class="page-head">
        <div><h1>My pets</h1><p class="muted">Open a profile to log a symptom, add a record, or view guidance.</p></div>
        <a class="btn btn-primary" href="#/pet/new">+ Add a pet</a>
      </div>
      ${pets.length
        ? `<div class="pets-grid">${cards}</div>`
        : `<div class="card empty"><div class="empty-icon">🐾</div><h2>No pets yet</h2><p class="muted">Start with your pet’s basic details. You can add records and symptoms next.</p><a class="btn btn-primary" href="#/pet/new">Create a pet profile</a></div>`}`;
  }

  function viewPetForm(pet) {
    const p = pet || { species: 'dog', size: '', sex: '', neutered: false };
    const breeds = [...C.dogBreeds, ...C.catBreeds].map(([b]) => `<option value="${h(b)}">`).join('');
    const opt = (val, label, cur) => `<option value="${h(val)}" ${String(cur) === String(val) ? 'selected' : ''}>${h(label)}</option>`;
    return `
      <a class="back" href="${pet ? `#/pet/${h(pet.id)}` : '#/pets'}">← ${pet ? h(pet.name) : 'All pets'}</a>
      <div class="card form-card">
        <h1>${pet ? `Edit ${h(pet.name)}’s profile` : 'Create a pet profile'}</h1>
        <p class="muted">Only name, species, and birth date are required. More details make guidance more specific.</p>
        <form data-form="pet" data-pet-id="${pet ? h(pet.id) : ''}" novalidate>
          <fieldset><legend>Basics</legend>
            <div class="row">
              <label>Name *<input name="name" required maxlength="40" value="${h(p.name)}"></label>
              <label>Species *<select name="species">${opt('dog', 'Dog', p.species)}${opt('cat', 'Cat', p.species)}</select></label>
            </div>
            <div class="row">
              <label>Breed<input name="breed" list="breed-list" maxlength="60" value="${h(p.breed)}" placeholder="Start typing…"><datalist id="breed-list">${breeds}</datalist></label>
              <label>Size<select name="size">${opt('', 'Select…', p.size)}${Object.entries(C.sizes).map(([k, v]) => opt(k, v, p.size)).join('')}</select></label>
            </div>
            <div class="row">
              <label>Birth date (or best estimate) *<input name="birthDate" type="date" required max="${U.today()}" value="${h(p.birthDate)}"></label>
              <label>Weight (lb)<input name="weightLb" type="number" min="0" max="350" step="0.1" value="${h(p.weightLb)}"></label>
            </div>
            <div class="row">
              <label>Sex<select name="sex">${opt('', 'Select…', p.sex)}${opt('female', 'Female', p.sex)}${opt('male', 'Male', p.sex)}</select></label>
              <label class="check"><input type="checkbox" name="neutered" ${p.neutered ? 'checked' : ''}> Spayed / neutered</label>
            </div>
          </fieldset>
          <fieldset><legend>Health details</legend>
            <label>Current medications &amp; preventives<input name="medications" maxlength="200" value="${h(p.medications)}" placeholder="e.g. Monthly heartworm and flea/tick preventive"></label>
            <label>Allergies<input name="allergies" maxlength="200" value="${h(p.allergies)}" placeholder="e.g. Chicken"></label>
            <label>Known conditions<input name="conditions" maxlength="200" value="${h(p.conditions)}"></label>
          </fieldset>
          <fieldset><legend>Care team</legend>
            <div class="row">
              <label>Primary clinic<input name="clinic" maxlength="80" value="${h(p.clinic)}"></label>
              <label>Microchip #<input name="microchip" maxlength="40" value="${h(p.microchip)}"></label>
            </div>
          </fieldset>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">${pet ? 'Save changes' : 'Create profile'}</button>
            <a class="btn btn-ghost" href="${pet ? `#/pet/${h(pet.id)}` : '#/pets'}">Cancel</a>
          </div>
        </form>
      </div>`;
  }

  const TABS = [
    ['overview', 'Overview'], ['records', 'Records'], ['symptoms', 'Symptoms'],
    ['timeline', 'Timeline'], ['guidance', 'Guidance'], ['summary', 'Vet summary'],
  ];

  function viewPet(user, pet, tab) {
    const age = PL.guidance.ageInfo(pet.birthDate);
    const stage = PL.guidance.lifeStage(pet, age);
    const body = { overview: tabOverview, records: tabRecords, symptoms: tabSymptoms, timeline: tabTimeline, guidance: tabGuidance, summary: tabSummary }[tab];
    return `
      <a class="back" href="#/pets">← All pets</a>
      <section class="card pet-hero">
        <div class="avatar avatar-lg" aria-hidden="true">${speciesIcon(pet)}</div>
        <div class="pet-hero-body">
          <h1>${h(pet.name)} ${pet.sample ? '<span class="badge">Sample pet</span>' : ''}${pet.synthetic ? '<span class="badge badge-syn">Synthetic</span>' : ''}</h1>
          <p class="muted">${[pet.breed, pet.sex && pet.sex[0].toUpperCase() + pet.sex.slice(1), age.label, stage, pet.weightLb && `${pet.weightLb} lb`].filter(Boolean).map(h).join(' · ')}</p>
        </div>
        <a class="btn btn-ghost" href="#/pet/${h(pet.id)}/edit">Edit profile</a>
      </section>
      <nav class="tabs" role="tablist">
        ${TABS.map(([k, l]) => `<a role="tab" aria-selected="${k === tab}" class="${k === tab ? 'active' : ''}" href="#/pet/${h(pet.id)}/${k}">${l}</a>`).join('')}
      </nav>
      <div class="tab-body">${body(user, pet)}</div>`;
  }

  function tabOverview(user, pet) {
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v ? h(v) : '<span class="muted">Not set</span>'}</dd></div>`;
    const items = timelineItems(pet).slice(0, 5);
    return `
      <div class="two-col">
        <section class="card">
          <h2>Health profile</h2>
          <dl class="facts">
            ${row('Species', pet.species === 'cat' ? 'Cat' : 'Dog')}
            ${row('Breed', pet.breed)}
            ${row('Size', C.sizes[pet.size])}
            ${row('Birth date', U.fmtDate(pet.birthDate))}
            ${row('Weight', pet.weightLb ? `${pet.weightLb} lb` : '')}
            ${row('Spayed / neutered', pet.neutered ? 'Yes' : 'No')}
            ${row('Medications', pet.medications)}
            ${row('Allergies', pet.allergies)}
            ${row('Conditions', pet.conditions)}
            ${row('Primary clinic', pet.clinic)}
            ${row('Microchip', pet.microchip)}
          </dl>
          <p class="small muted">Last updated ${h(U.fmtTs(pet.updatedAt))}</p>
        </section>
        <div class="stack">
          <section class="card">
            <h2>Quick actions</h2>
            <div class="quick">
              <a class="btn btn-primary" href="#/pet/${h(pet.id)}/symptoms">Log a symptom</a>
              <a class="btn" href="#/pet/${h(pet.id)}/records">Add a record</a>
              <a class="btn" href="#/pet/${h(pet.id)}/guidance">Wellness guidance</a>
              <a class="btn" href="#/pet/${h(pet.id)}/summary">Vet summary</a>
            </div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Recent history</h2><a href="#/pet/${h(pet.id)}/timeline" class="small">Full timeline →</a></div>
            ${items.length ? `<ol class="timeline compact">${items.map(timelineItemHtml).join('')}</ol>` : '<p class="muted">Nothing logged yet.</p>'}
          </section>
        </div>
      </div>`;
  }

  function tabRecords(user, pet) {
    const records = store.recordsOf(pet.id);
    return `
      <div class="two-col">
        <section class="card">
          <h2>Add a veterinary record</h2>
          <form data-form="record" data-pet-id="${h(pet.id)}" novalidate>
            <div class="row">
              <label>Date *<input name="date" type="date" required max="${U.today()}" value="${U.today()}"></label>
              <label>Type *<select name="type">${C.recordTypes.map((t) => `<option>${h(t)}</option>`).join('')}</select></label>
            </div>
            <label>Title *<input name="title" required maxlength="100" placeholder="e.g. 16-week DHPP vaccine"></label>
            <label>Clinic<input name="clinic" maxlength="80" value="${h(pet.clinic)}"></label>
            <label>Notes<textarea name="notes" rows="3" maxlength="1000" placeholder="What the vet said, next due date, lot number…"></textarea></label>
            <label>Attach a file (PDF or photo, up to 10 MB)<input name="file" type="file" accept="application/pdf,image/*"></label>
            <button class="btn btn-primary" type="submit">Save record</button>
          </form>
        </section>
        <section class="card">
          <h2>Records on file <span class="count">${records.length}</span></h2>
          ${records.length
            ? `<ul class="list">${records.map((r) => `
              <li class="list-item">
                <div class="li-date">${h(U.fmtDate(r.date))}</div>
                <div class="li-body">
                  <div><span class="tag">${h(r.type)}</span> <strong>${h(r.title)}</strong> ${recent(r.createdAt, 60) ? '<span class="badge badge-new">Just added</span>' : ''}</div>
                  ${r.clinic ? `<div class="muted small">${h(r.clinic)}</div>` : ''}
                  ${r.notes ? `<p class="small">${nl2br(r.notes)}</p>` : ''}
                  ${r.attachment ? `<button class="link-btn small" data-action="open-file" data-id="${h(r.id)}">📎 ${h(r.attachment.name)} (${Math.max(1, Math.round(r.attachment.size / 1024))} KB)</button>` : ''}
                </div>
              </li>`).join('')}</ul>`
            : '<p class="muted">No records yet. Add vaccines, exams, or upload paperwork from your clinic.</p>'}
        </section>
      </div>`;
  }

  function tabSymptoms(user, pet) {
    const symptoms = store.symptomsOf(pet.id);
    const latestFlags = symptoms.find((s) => recent(s.createdAt, 30) && s.redFlags && s.redFlags.length);
    return `
      ${latestFlags ? `<div class="alert alert-urgent" role="alert"><strong>Warning signs logged.</strong> ${h(latestFlags.redFlags.join('; '))} can be emergencies. Contact your veterinarian or an emergency animal hospital now. PetLumen cannot assess emergencies.</div>` : ''}
      <div class="two-col">
        <section class="card">
          <h2>Log a symptom or change</h2>
          <form data-form="symptom" data-pet-id="${h(pet.id)}" novalidate>
            <div class="row">
              <label>Date noticed *<input name="date" type="date" required max="${U.today()}" value="${U.today()}"></label>
              <label>Area *<select name="category">${C.symptomCategories.map((c) => `<option>${h(c)}</option>`).join('')}</select></label>
            </div>
            <label>What did you notice? *<textarea name="description" rows="2" required maxlength="300" placeholder="e.g. Vomited once after eating quickly"></textarea></label>
            <fieldset class="severity"><legend>How noticeable is it? *</legend>
              <div class="seg">
                ${C.severities.map((l, i) => `<label class="seg-opt"><input type="radio" name="severity" value="${i + 1}" ${i === 1 ? 'checked' : ''}><span><b>${i + 1}</b>${h(l)}</span></label>`).join('')}
              </div>
            </fieldset>
            <label>How long has it lasted?<select name="duration">${C.durations.map((d) => `<option>${h(d)}</option>`).join('')}</select></label>
            <details class="flags">
              <summary>Any warning signs? <span class="muted small">(check all that apply)</span></summary>
              ${C.redFlags.map((f) => `<label class="check"><input type="checkbox" name="redFlags" value="${h(f)}"> ${h(f)}</label>`).join('')}
            </details>
            <button class="btn btn-primary" type="submit">Save entry</button>
          </form>
        </section>
        <section class="card">
          <div class="card-head"><h2>Symptom log <span class="count">${symptoms.length}</span></h2><a href="#/pet/${h(pet.id)}/timeline" class="small">View timeline →</a></div>
          ${symptoms.length
            ? `<ul class="list">${symptoms.map((s) => `
              <li class="list-item">
                <div class="li-date">${h(U.fmtDate(s.date))}</div>
                <div class="li-body">
                  <div><span class="tag">${h(s.category)}</span> <span class="sev ${sevClass(s.severity)}">${h(s.severity)}/5 ${h(C.severities[s.severity - 1])}</span> ${recent(s.createdAt, 60) ? '<span class="badge badge-new">Just added</span>' : ''}</div>
                  <p>${h(s.description)}</p>
                  <div class="muted small">Duration: ${h(s.duration)}</div>
                  ${s.redFlags && s.redFlags.length ? `<div class="small flag-text">⚠ ${h(s.redFlags.join('; '))}</div>` : ''}
                </div>
              </li>`).join('')}</ul>`
            : '<p class="muted">No entries yet. Logging small changes now makes patterns easier to explain later.</p>'}
        </section>
      </div>`;
  }

  function timelineItems(pet) {
    const items = [];
    store.symptomsOf(pet.id).forEach((s) => items.push({ kind: 'symptom', date: s.date, createdAt: s.createdAt, title: s.description, tag: s.category, sev: s.severity, flags: s.redFlags, sub: `Duration: ${s.duration}` }));
    store.recordsOf(pet.id).forEach((r) => items.push({ kind: 'record', date: r.date, createdAt: r.createdAt, title: r.title, tag: r.type, sub: [r.clinic, r.attachment && `📎 ${r.attachment.name}`].filter(Boolean).join(' · ') }));
    items.push({ kind: 'profile', date: U.toISODate(new Date(pet.createdAt)), createdAt: pet.createdAt, title: `${pet.name}’s profile created in PetLumen`, tag: 'Profile' });
    return items.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  function timelineItemHtml(it) {
    return `
      <li class="tl tl-${it.kind}">
        <span class="tl-dot" aria-hidden="true"></span>
        <div class="tl-date">${h(U.fmtDate(it.date))}</div>
        <div class="tl-body">
          <div><span class="tag tag-${it.kind}">${h(it.kind === 'symptom' ? `Symptom · ${it.tag}` : it.kind === 'record' ? `Record · ${it.tag}` : it.tag)}</span>
            ${it.sev ? `<span class="sev ${sevClass(it.sev)}">${h(it.sev)}/5</span>` : ''}
            ${recent(it.createdAt, 60) ? '<span class="badge badge-new">New</span>' : ''}</div>
          <div class="tl-title">${h(it.title)}</div>
          ${it.sub ? `<div class="muted small">${h(it.sub)}</div>` : ''}
          ${it.flags && it.flags.length ? `<div class="small flag-text">⚠ ${h(it.flags.join('; '))}</div>` : ''}
        </div>
      </li>`;
  }

  function tabTimeline(user, pet) {
    const all = timelineItems(pet);
    const items = ui.timeline === 'all' ? all : all.filter((i) => i.kind === ui.timeline);
    const groups = [];
    items.forEach((it) => {
      const key = U.parseDate(it.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] });
      groups[groups.length - 1].items.push(it);
    });
    const chip = (v, l) => `<button class="chip-btn ${ui.timeline === v ? 'active' : ''}" data-action="timeline-filter" data-v="${v}">${l}</button>`;
    return `
      <section class="card">
        <div class="card-head">
          <h2>Health timeline</h2>
          <div class="chip-row">${chip('all', 'Everything')}${chip('symptom', 'Symptoms')}${chip('record', 'Records')}</div>
        </div>
        <p class="muted small">Symptoms and veterinary records in date order, newest first.</p>
        ${groups.length
          ? groups.map((g) => `<h3 class="tl-month">${h(g.key)}</h3><ol class="timeline">${g.items.map(timelineItemHtml).join('')}</ol>`).join('')
          : '<p class="muted">Nothing to show for this filter.</p>'}
      </section>`;
  }

  function tabGuidance(user, pet) {
    const g = PL.guidance.build(pet, store.recordsOf(pet.id), store.symptomsOf(pet.id));
    store.logGuidance(pet.id, user.id, g.cards.length);
    const pri = { urgent: 'Act now', attention: 'Worth attention', info: 'Good to know' };
    return `
      <div class="alert alert-info">General information matched to ${h(pet.name)}’s profile and log, summarized from the sources shown on each item. It is <strong>not a diagnosis</strong> or treatment plan — use it to decide what to discuss with your veterinarian.</div>
      <section class="card">
        <h2>Profile details this guidance uses</h2>
        <div class="chips">${g.facts.map((f) => `<span class="chip">${h(f)}</span>`).join('')}</div>
        <p class="small muted">Generated ${h(U.fmtDate(g.generatedOn))}. Details look wrong? <a href="#/pet/${h(pet.id)}/edit">Update the profile</a> and guidance updates automatically.</p>
      </section>
      <div class="guidance">
        ${g.cards.map((c) => `
          <article class="card g-card pri-${c.priority}">
            <div class="g-top"><span class="tag">${h(c.category)}</span><span class="pri">${pri[c.priority]}</span></div>
            <h3>${h(c.title)}</h3>
            <p>${h(c.why)}</p>
            <ul>${c.actions.map((a) => `<li>${h(a)}</li>`).join('')}</ul>
            ${c.ask.length ? `<details><summary>Questions to ask your vet</summary><ul>${c.ask.map((q) => `<li>${h(q)}</li>`).join('')}</ul>
              <button class="link-btn small" data-action="add-questions" data-pet="${h(pet.id)}" data-q="${h(c.ask.join('\n'))}">+ Add to my vet questions</button></details>` : ''}
            <div class="g-uses"><span class="small muted">Based on:</span> ${c.uses.map((u) => `<span class="chip chip-sm">${h(u)}</span>`).join('')}</div>
            <div class="g-sources small"><span class="muted">Source${c.sources.length > 1 ? 's' : ''}:</span>
              ${c.sources.map((s) => (s.url ? `<a href="${h(s.url)}" target="_blank" rel="noopener">${h(s.name)}</a> <span class="muted">(${h(s.org)})</span>` : `${h(s.name)} <span class="muted">(${h(s.org)})</span>`)).join(' · ')}
            </div>
          </article>`).join('')}
      </div>`;
  }

  function summaryData(pet) {
    const today = U.today();
    const age = PL.guidance.ageInfo(pet.birthDate);
    const symptoms = store.symptomsOf(pet.id).filter((s) => U.daysBetween(s.date, today) <= 30);
    const records = store.recordsOf(pet.id).slice(0, 6);
    return { today, age, symptoms, records };
  }

  function summaryText(pet, user) {
    const { today, age, symptoms, records } = summaryData(pet);
    const lines = [
      `PetLumen visit summary for ${pet.name}`,
      `Prepared ${U.fmtDate(today)} by ${user.name}${user.synthetic ? ' (SYNTHETIC TEST ACCOUNT)' : ''}`,
      '',
      `${pet.species === 'cat' ? 'Cat' : 'Dog'} · ${pet.breed || 'Breed not set'} · ${pet.sex || 'Sex not set'} · ${age.label} (born ${U.fmtDate(pet.birthDate)})`,
      `Weight: ${pet.weightLb ? `${pet.weightLb} lb` : 'not set'} · Spayed/neutered: ${pet.neutered ? 'yes' : 'no'}`,
      `Medications: ${pet.medications || 'none listed'}`,
      `Allergies: ${pet.allergies || 'none listed'}`,
      `Conditions: ${pet.conditions || 'none listed'}`,
      '',
      'Symptoms in the last 30 days:',
      ...(symptoms.length ? symptoms.map((s) => `- ${U.fmtDate(s.date)} · ${s.category} · ${s.severity}/5 · ${s.description} (${s.duration})${s.redFlags && s.redFlags.length ? ` · WARNING SIGNS: ${s.redFlags.join('; ')}` : ''}`) : ['- None logged']),
      '',
      'Recent records:',
      ...(records.length ? records.map((r) => `- ${U.fmtDate(r.date)} · ${r.type} · ${r.title}${r.clinic ? ` · ${r.clinic}` : ''}`) : ['- None on file']),
      '',
      'Questions for the vet:',
      ...(pet.vetQuestions ? pet.vetQuestions.split('\n').filter(Boolean).map((q) => `- ${q}`) : ['- None yet']),
      '',
      'Owner-reported information organized with PetLumen. Not a diagnosis.',
    ];
    return lines.join('\n');
  }

  function tabSummary(user, pet) {
    store.logVetSummary(pet.id, user.id);
    const { today, age, symptoms, records } = summaryData(pet);
    const qs = (pet.vetQuestions || '').split('\n').filter(Boolean);
    return `
      <div class="summary-actions no-print">
        <button class="btn btn-primary" data-action="print">Print / save as PDF</button>
        <button class="btn" data-action="copy-summary" data-pet="${h(pet.id)}">Copy as text</button>
      </div>
      <article class="card summary" id="vet-summary">
        <header class="summary-head">
          <img src="assets/logo.svg" alt="" width="36" height="36">
          <div><h2>Visit summary: ${h(pet.name)}</h2>
          <p class="muted small">Prepared ${h(U.fmtDate(today))} by ${h(user.name)}${user.synthetic ? ' · <strong>Synthetic test account</strong>' : ''}${pet.sample ? ' · Sample pet' : ''}</p></div>
        </header>
        <section>
          <h3>Pet details</h3>
          <table class="kv">
            <tr><th>Species / breed</th><td>${h(pet.species === 'cat' ? 'Cat' : 'Dog')} · ${h(pet.breed || 'Not set')}</td></tr>
            <tr><th>Age</th><td>${h(age.label)} (born ${h(U.fmtDate(pet.birthDate))})</td></tr>
            <tr><th>Sex / spayed-neutered</th><td>${h(pet.sex || 'Not set')} · ${pet.neutered ? 'Yes' : 'No'}</td></tr>
            <tr><th>Weight</th><td>${pet.weightLb ? `${h(pet.weightLb)} lb` : 'Not set'}</td></tr>
            <tr><th>Medications</th><td>${h(pet.medications || 'None listed')}</td></tr>
            <tr><th>Allergies</th><td>${h(pet.allergies || 'None listed')}</td></tr>
            <tr><th>Conditions</th><td>${h(pet.conditions || 'None listed')}</td></tr>
            <tr><th>Primary clinic</th><td>${h(pet.clinic || 'Not set')}</td></tr>
          </table>
        </section>
        <section>
          <h3>Symptoms in the last 30 days (${symptoms.length})</h3>
          ${symptoms.length
            ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Area</th><th>Severity</th><th>What was noticed</th><th>Duration</th></tr></thead><tbody>
              ${symptoms.map((s) => `<tr><td>${h(U.fmtDate(s.date))}</td><td>${h(s.category)}</td><td>${h(s.severity)}/5</td><td>${h(s.description)}${s.redFlags && s.redFlags.length ? `<div class="flag-text small">⚠ ${h(s.redFlags.join('; '))}</div>` : ''}</td><td>${h(s.duration)}</td></tr>`).join('')}
              </tbody></table></div>`
            : '<p class="muted">None logged.</p>'}
        </section>
        <section>
          <h3>Recent records</h3>
          ${records.length
            ? `<ul class="plain">${records.map((r) => `<li><strong>${h(U.fmtDate(r.date))}</strong> · ${h(r.type)} · ${h(r.title)}${r.clinic ? ` <span class="muted">(${h(r.clinic)})</span>` : ''}</li>`).join('')}</ul>`
            : '<p class="muted">None on file.</p>'}
        </section>
        <section>
          <h3>Questions for the vet</h3>
          ${qs.length ? `<ol>${qs.map((q) => `<li>${h(q)}</li>`).join('')}</ol>` : '<p class="muted">None yet.</p>'}
        </section>
        <p class="small muted summary-foot">Owner-reported information organized with PetLumen. Not a diagnosis.</p>
      </article>
      <section class="card no-print">
        <h2>My questions for the vet</h2>
        <form data-form="questions" data-pet-id="${h(pet.id)}">
          <label>One question per line<textarea name="questions" rows="4" maxlength="2000">${h(pet.vetQuestions)}</textarea></label>
          <button class="btn" type="submit">Save questions</button>
        </form>
      </section>`;
  }

  function viewActivity(user) {
    const pets = store.petsOf(user.id);
    const petName = Object.fromEntries(pets.map((p) => [p.id, p.name]));
    let rows = store.activityOf(user.id);
    if (ui.actPet) rows = rows.filter((a) => a.petId === ui.actPet);
    if (ui.actAction) rows = rows.filter((a) => a.action === ui.actAction);
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / PAGE.activity));
    ui.actPage = Math.min(ui.actPage, pages);
    const slice = rows.slice((ui.actPage - 1) * PAGE.activity, ui.actPage * PAGE.activity);
    return `
      <div class="page-head"><div><h1>Activity history</h1>
        <p class="muted">Every profile update, record upload, symptom entry, and guidance request is saved with the user, pet, action, and time.</p></div></div>
      <section class="card">
        <div class="filters">
          <label>Pet<select data-filter="actPet"><option value="">All pets</option>${pets.map((p) => `<option value="${h(p.id)}" ${ui.actPet === p.id ? 'selected' : ''}>${h(p.name)}</option>`).join('')}</select></label>
          <label>Action<select data-filter="actAction"><option value="">All actions</option>${Object.entries(C.actions).map(([k, v]) => `<option value="${k}" ${ui.actAction === k ? 'selected' : ''}>${h(v)}</option>`).join('')}</select></label>
          <span class="muted small">${total} event${total === 1 ? '' : 's'}</span>
        </div>
        ${slice.length
          ? `<div class="table-wrap"><table class="data"><thead><tr><th>Time</th><th>User</th><th>Pet</th><th>Action</th><th>Detail</th></tr></thead><tbody>
            ${slice.map((a) => `<tr><td class="nowrap">${h(U.fmtTs(a.ts))}</td><td>${h(user.name)}</td><td>${a.petId ? h(petName[a.petId] || a.petId) : '<span class="muted">—</span>'}</td><td><span class="tag tag-act">${h(C.actions[a.action] || a.action)}</span></td><td>${h(a.detail)}</td></tr>`).join('')}
            </tbody></table></div>`
          : '<p class="muted">No activity matches these filters.</p>'}
        ${pager(ui.actPage, total, PAGE.activity, 'act-page')}
      </section>`;
  }

  function ownersTable() {
    const d = store.data;
    const q = ui.dataQuery.trim().toLowerCase();
    const petCount = {};
    const petNames = {};
    d.pets.forEach((p) => {
      petCount[p.ownerId] = (petCount[p.ownerId] || 0) + 1;
      (petNames[p.ownerId] = petNames[p.ownerId] || []).push(p.name);
    });
    let owners = d.users.filter((u) => u.synthetic);
    if (q) owners = owners.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.id.includes(q) || (petNames[u.id] || []).some((n) => n.toLowerCase().includes(q)));
    const total = owners.length;
    const pages = Math.max(1, Math.ceil(total / PAGE.data));
    ui.dataPage = Math.min(ui.dataPage, pages);
    const slice = owners.slice((ui.dataPage - 1) * PAGE.data, ui.dataPage * PAGE.data);
    const last = {};
    const ids = new Set(slice.map((u) => u.id));
    d.activity.forEach((a) => {
      if (ids.has(a.userId) && (!last[a.userId] || a.ts > last[a.userId])) last[a.userId] = a.ts;
    });
    return `
      <p class="muted small">${total} synthetic owner${total === 1 ? '' : 's'}${q ? ' match' : ''}</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Account</th><th>Email</th><th>Pets</th><th>Last activity</th><th></th></tr></thead><tbody>
        ${slice.map((u) => `<tr>
          <td><strong>${h(u.name)}</strong> <span class="badge badge-syn">Synthetic</span><div class="muted small">${h(u.id)}</div></td>
          <td>${h(u.email)}</td>
          <td>${petCount[u.id] || 0}<div class="muted small">${h((petNames[u.id] || []).join(', '))}</div></td>
          <td class="nowrap">${h(U.fmtTs(last[u.id]))}</td>
          <td><button class="btn btn-sm" data-action="view-as" data-id="${h(u.id)}">Open account</button></td>
        </tr>`).join('')}
      </tbody></table></div>
      ${pager(ui.dataPage, total, PAGE.data, 'data-page')}`;
  }

  function viewData() {
    const d = store.data;
    const synUsers = d.users.filter((u) => u.synthetic);
    const synIds = new Set(synUsers.map((u) => u.id));
    const synPets = d.pets.filter((p) => p.synthetic);
    const synPetIds = new Set(synPets.map((p) => p.id));
    const synActivity = d.activity.filter((a) => synIds.has(a.userId));
    const counts = {};
    synActivity.forEach((a) => (counts[a.action] = (counts[a.action] || 0) + 1));
    const dogs = synPets.filter((p) => p.species === 'dog').length;
    const puppies = synPets.filter((p) => p.species === 'dog' && PL.guidance.ageInfo(p.birthDate).months < 12).length;
    const stat = (n, l) => `<div class="stat"><div class="stat-n">${n.toLocaleString()}</div><div class="stat-l">${l}</div></div>`;
    const realUsers = d.users.filter((u) => !u.synthetic);
    return `
      <div class="syn-hero" role="note">
        <strong>SYNTHETIC TEST DATA.</strong> Every account on this page is generated for prototype testing. They are not real customers and must never be presented as customer validation.
      </div>
      <div class="page-head"><div><h1>Synthetic dataset</h1>
        <p class="muted">${PL.seed.SYNTHETIC_OWNERS.toLocaleString()} labeled synthetic owners with linked pet profiles and sample activity, generated ${h(U.fmtTs(d.seededAt))}.</p></div>
        <div class="head-actions"><button class="btn" data-action="export-data">Export JSON</button><button class="btn btn-danger" data-action="reset-data">Reset all data</button></div>
      </div>
      <div class="stats">
        ${stat(synUsers.length, 'Synthetic owners')}
        ${stat(synPets.length, 'Linked pet profiles')}
        ${stat(puppies, `Puppies under 1 year (of ${dogs.toLocaleString()} dogs)`)}
        ${stat(d.records.filter((r) => synPetIds.has(r.petId)).length, 'Veterinary records')}
        ${stat(d.symptoms.filter((s) => synPetIds.has(s.petId)).length, 'Symptom entries')}
        ${stat(synActivity.length, 'Activity events')}
      </div>
      <div class="two-col">
        <section class="card">
          <h2>Synthetic activity by action</h2>
          <table class="data"><tbody>${Object.entries(C.actions).map(([k, v]) => `<tr><td>${h(v)}</td><td class="num">${(counts[k] || 0).toLocaleString()}</td></tr>`).join('')}</tbody></table>
        </section>
        <section class="card">
          <h2>Non-synthetic accounts in this browser</h2>
          <ul class="plain">${realUsers.map((u) => `<li><strong>${h(u.name)}</strong> <span class="muted small">${h(u.email)}</span> · ${store.petsOf(u.id).length} pet(s) · ${store.activityOf(u.id).length} events</li>`).join('')}</ul>
          <p class="small muted">The Demo Owner’s pet, Maple, is sample data for demonstrations.</p>
        </section>
      </div>
      <section class="card">
        <div class="card-head"><h2>Synthetic owner accounts</h2>
          <input id="data-search" class="search" type="search" placeholder="Search name, email, ID, or pet…" value="${h(ui.dataQuery)}" aria-label="Search synthetic owners"></div>
        <div id="owners-table">${ownersTable()}</div>
      </section>`;
  }

  const notFound = (msg) => `<div class="card empty"><h2>Not found</h2><p class="muted">${h(msg)}</p><a class="btn" href="#/pets">Back to my pets</a></div>`;

  // ---------- Router ----------
  function render() {
    const [view = '', id, tab] = location.hash.replace(/^#\/?/, '').split('/');
    const user = store.currentUser();
    let html;
    let key = view || 'pets';

    if (!user && key !== 'data') {
      key = 'login';
      html = viewLogin();
    } else if (key === 'login') {
      return go('#/pets');
    } else if (key === 'pets') {
      html = viewPets(user);
    } else if (key === 'pet') {
      key = 'pets';
      const pet = id === 'new' ? null : store.pet(id);
      if (id === 'new') html = viewPetForm(null);
      else if (!pet || pet.ownerId !== user.id) html = notFound('This pet is not on your account.');
      else if (tab === 'edit') html = viewPetForm(pet);
      else html = viewPet(user, pet, TABS.some(([k]) => k === tab) ? tab : 'overview');
    } else if (key === 'activity') {
      html = viewActivity(user);
    } else if (key === 'data') {
      html = viewData();
    } else {
      html = notFound('That page does not exist.');
    }

    app.innerHTML = `${header(user, key)}<main class="wrap main">${html}</main>${footer()}`;
  }

  // ---------- Form handlers ----------
  const str = (fd, k) => String(fd.get(k) || '').trim();
  const fail = (form, msg) => {
    toast(msg, 'error');
    const bad = form.querySelector(':invalid');
    if (bad) bad.focus();
    return false;
  };

  const forms = {
    'sign-up'(form, fd) {
      const name = str(fd, 'name');
      const email = str(fd, 'email');
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(form, 'Enter your name and a valid email.');
      const existing = store.findUserByEmail(email);
      if (existing && existing.synthetic) return fail(form, 'That email belongs to a synthetic test account. Use your own email.');
      if (existing) {
        store.signIn(existing.id);
        toast(`Welcome back, ${existing.name}.`);
      } else {
        store.createUser({ name, email });
        toast('Account created.');
      }
      go('#/pets');
    },

    pet(form, fd) {
      const user = store.currentUser();
      const weight = str(fd, 'weightLb');
      const fields = {
        name: str(fd, 'name'), species: str(fd, 'species') || 'dog', breed: str(fd, 'breed'), size: str(fd, 'size'),
        sex: str(fd, 'sex'), neutered: fd.get('neutered') === 'on', birthDate: str(fd, 'birthDate'),
        weightLb: weight === '' ? null : Math.round(Number(weight) * 10) / 10,
        allergies: str(fd, 'allergies'), medications: str(fd, 'medications'), conditions: str(fd, 'conditions'),
        clinic: str(fd, 'clinic'), microchip: str(fd, 'microchip'),
      };
      if (!fields.name) return fail(form, 'Please enter a name.');
      if (!fields.birthDate) return fail(form, 'Please enter a birth date (an estimate is fine).');
      if (fields.birthDate > U.today()) return fail(form, 'Birth date cannot be in the future.');
      if (fields.weightLb !== null && !(fields.weightLb >= 0)) return fail(form, 'Weight must be a positive number.');
      const id = form.dataset.petId;
      if (id) {
        const changed = store.updatePet(id, user.id, fields);
        toast(changed.length ? 'Profile saved.' : 'No changes to save.');
        go(`#/pet/${id}`);
      } else {
        const pet = store.createPet(user.id, fields);
        toast(`${pet.name}’s profile created.`);
        go(`#/pet/${pet.id}`);
      }
    },

    async record(form, fd) {
      const user = store.currentUser();
      const petId = form.dataset.petId;
      const fields = { date: str(fd, 'date'), type: str(fd, 'type'), title: str(fd, 'title'), clinic: str(fd, 'clinic'), notes: str(fd, 'notes') };
      if (!fields.date || fields.date > U.today()) return fail(form, 'Enter a record date that is not in the future.');
      if (!fields.title) return fail(form, 'Please add a title for this record.');
      const file = fd.get('file');
      let attachment = null;
      if (file && file.size) {
        if (file.size > 10 * 1024 * 1024) return fail(form, 'Files must be 10 MB or smaller.');
        fields.id = U.uid('r');
        try {
          await PL.files.put(fields.id, file);
          attachment = { name: file.name, size: file.size, type: file.type };
        } catch (e) {
          console.error(e);
          return fail(form, 'Could not store the file in this browser.');
        }
      }
      store.addRecord(petId, user.id, fields, attachment);
      toast(attachment ? 'Record and file saved.' : 'Record saved.');
      render();
    },

    symptom(form, fd) {
      const user = store.currentUser();
      const petId = form.dataset.petId;
      const fields = {
        date: str(fd, 'date'), category: str(fd, 'category'), severity: Number(fd.get('severity')) || 2,
        description: str(fd, 'description'), duration: str(fd, 'duration'), redFlags: fd.getAll('redFlags').map(String),
      };
      if (!fields.date || fields.date > U.today()) return fail(form, 'Enter a date that is not in the future.');
      if (!fields.description) return fail(form, 'Describe what you noticed.');
      store.addSymptom(petId, user.id, fields);
      toast(fields.redFlags.length ? 'Saved. Warning signs logged — contact a veterinarian now.' : 'Symptom saved to the timeline.', fields.redFlags.length ? 'error' : '');
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    questions(form, fd) {
      store.saveVetQuestions(form.dataset.petId, String(fd.get('questions') || '').trim());
      toast('Questions saved.');
      render();
    },
  };

  // ---------- Click actions ----------
  const actions = {
    'demo-sign-in'() {
      store.signIn('u_demo');
      go('#/pets');
    },
    'sign-out'() {
      store.signOut();
      go('#/login');
    },
    'view-as'(btn) {
      store.signIn(btn.dataset.id);
      toast('Opened a synthetic test account.');
      go('#/pets');
    },
    'timeline-filter'(btn) {
      ui.timeline = btn.dataset.v;
      render();
    },
    'act-page'(btn) {
      ui.actPage = Number(btn.dataset.page);
      render();
    },
    'data-page'(btn) {
      ui.dataPage = Number(btn.dataset.page);
      document.getElementById('owners-table').innerHTML = ownersTable();
    },
    print() {
      window.print();
    },
    async 'copy-summary'(btn) {
      const text = summaryText(store.pet(btn.dataset.pet), store.currentUser());
      try {
        await navigator.clipboard.writeText(text);
        toast('Summary copied.');
      } catch (e) {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        toast('Summary copied.');
      }
    },
    'add-questions'(btn) {
      const pet = store.pet(btn.dataset.pet);
      const existing = (pet.vetQuestions || '').split('\n').filter(Boolean);
      const add = btn.dataset.q.split('\n').filter((q) => !existing.includes(q));
      store.saveVetQuestions(pet.id, [...existing, ...add].join('\n'));
      toast(add.length ? `Added ${add.length} question${add.length === 1 ? '' : 's'} to the vet summary.` : 'Already in your questions.');
    },
    async 'open-file'(btn) {
      try {
        const rec = store.data.records.find((r) => r.id === btn.dataset.id);
        if (rec && rec.attachment && rec.attachment.synthetic) return toast('Synthetic record: only file details were generated, there is no file to open.');
        const file = await PL.files.get(btn.dataset.id);
        if (!file) return toast('That file is not stored in this browser.', 'error');
        const url = URL.createObjectURL(file);
        const a = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener' });
        if (!/^(application\/pdf|image\/)/.test(file.type)) a.download = file.name || 'record';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (e) {
        toast('Could not open the file.', 'error');
      }
    },
    'export-data'() {
      const d = store.data;
      const syn = new Set(d.users.filter((u) => u.synthetic).map((u) => u.id));
      const pets = d.pets.filter((p) => syn.has(p.ownerId));
      const petIds = new Set(pets.map((p) => p.id));
      const out = {
        notice: 'SYNTHETIC TEST DATA generated for the PetLumen prototype. Not real customers.',
        generatedAt: d.seededAt,
        users: d.users.filter((u) => syn.has(u.id)), pets,
        records: d.records.filter((r) => petIds.has(r.petId)),
        symptoms: d.symptoms.filter((s) => petIds.has(s.petId)),
        activity: d.activity.filter((a) => syn.has(a.userId)),
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
      Object.assign(document.createElement('a'), { href: url, download: 'petlumen-synthetic-data.json' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
    async 'reset-data'() {
      if (!confirm('Reset all PetLumen data in this browser? Your own accounts, pets, and uploads will be deleted and the synthetic dataset regenerated.')) return;
      await store.reset();
      Object.assign(ui, { dataPage: 1, dataQuery: '', actPage: 1, actPet: '', actAction: '', timeline: 'all' });
      toast('Data reset.');
      go('#/login');
    },
  };

  // ---------- Wiring ----------
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form || !forms[form.dataset.form]) return;
    e.preventDefault();
    forms[form.dataset.form](form, new FormData(form));
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !actions[el.dataset.action]) return;
    e.preventDefault();
    actions[el.dataset.action](el, e);
  });

  let searchTimer;
  document.addEventListener('input', (e) => {
    if (e.target.id === 'data-search') {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        ui.dataQuery = e.target.value;
        ui.dataPage = 1;
        document.getElementById('owners-table').innerHTML = ownersTable();
      }, 150);
    }
    // Fill size and species automatically when a known breed is chosen.
    if (e.target.name === 'breed') {
      const form = e.target.form;
      const dog = C.dogBreeds.find(([b]) => b.toLowerCase() === e.target.value.trim().toLowerCase());
      const cat = C.catBreeds.find(([b]) => b.toLowerCase() === e.target.value.trim().toLowerCase());
      if (dog || cat) {
        form.elements.species.value = dog ? 'dog' : 'cat';
        if (dog) form.elements.size.value = dog[1];
      }
    }
  });

  document.addEventListener('change', (e) => {
    const f = e.target.dataset && e.target.dataset.filter;
    if (f) {
      ui[f] = e.target.value;
      ui.actPage = 1;
      render();
    }
  });

  window.addEventListener('hashchange', () => {
    render();
    window.scrollTo(0, 0);
  });

  store
    .init()
    .then(render)
    .catch((e) => {
      console.error(e);
      app.innerHTML = '<p class="loading">PetLumen could not open browser storage. Private browsing or blocked site data can cause this.</p>';
    });
})(window.PL);
