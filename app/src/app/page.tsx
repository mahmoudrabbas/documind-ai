"use client";

import { useEffect } from "react";

const pageCss = `

  :root{
    --ink:#202020;
    --panel:#2A2A2A;
    --panel-2:#333333;
    --overlay:#333333ed;
    --paper:#ECEAE6;
    --muted:#9B9B9B;
    --amber:#F2B84B;
    --teal:#4FD1C5;
    --redact:#C1443B;
    --rule:rgba(255,255,255,0.10);
    --rule-strong:rgba(255,255,255,0.22);
    --maxw:1180px;
  }
  *{box-sizing:border-box;}
  html{scroll-behavior:smooth;}
  body{
    margin:0;
    background:var(--ink);
    color:var(--paper);
    font-family:'IBM Plex Sans', sans-serif;
    font-size:16px;
    line-height:1.6;
    -webkit-font-smoothing:antialiased;
  }
  ::selection{ background:var(--amber); color:#201804; }
  a{ color:inherit; }
  img{ max-width:100%; display:block; }
  .wrap{ max-width:var(--maxw); margin:0 auto; padding:0 28px; }
  .eyebrow{
    font-family:'IBM Plex Mono', monospace;
    font-size:12.5px;
    letter-spacing:0.14em;
    text-transform:uppercase;
    color:var(--teal);
  }
  h1,h2,h3{ font-family:'Fraunces', serif; font-weight:600; margin:0; letter-spacing:-0.01em; }
  :focus-visible{ outline:2px solid var(--amber); outline-offset:3px; }

  /* ===== NAV ===== */
  header.nav{
    position:sticky; top:0; z-index:50;
    background:var(--overlay);
    backdrop-filter:blur(10px);
    border-bottom:1px solid var(--rule);
    transition:background .25s ease;
  }
  .nav-inner{ display:flex; align-items:center; justify-content:space-between; padding:16px 28px; max-width:var(--maxw); margin:0 auto; }
  .brand{ display:flex; align-items:center; gap:10px; font-family:'Fraunces',serif; font-weight:600; font-size:19px; text-decoration:none; }
  .brand-mark{ width:26px; height:26px; flex-shrink:0; }
  .nav-links{ display:flex; gap:28px; font-size:14.5px; }
  .nav-links a{ text-decoration:none; color:var(--muted); transition:color .2s ease; }
  .nav-links a:hover{ color:var(--paper); }
  .nav-cta{
    font-family:'IBM Plex Mono', monospace; font-size:13px; letter-spacing:.03em;
    border:1px solid var(--rule-strong); padding:8px 16px; border-radius:2px;
    text-decoration:none; color:var(--paper); white-space:nowrap;
    transition:border-color .2s ease, background .2s ease, transform .2s ease;
  }
  .nav-cta:hover{ border-color:var(--amber); background:rgba(242,184,75,0.08); transform:translateY(-1px); }
  @media (max-width:760px){ .nav-links{ display:none; } }

  /* ===== HERO ===== */
  .hero{ padding:76px 0 60px; position:relative; overflow:hidden; }
  .hero-head{ max-width:680px; margin:0 0 44px; }
  .hero h1{ font-size:clamp(34px, 5.4vw, 56px); line-height:1.06; margin-top:14px; }
  .hero h1 em{ font-style:normal; color:var(--amber); }
  .hero p.lede{ margin-top:20px; font-size:18px; color:var(--muted); max-width:540px; }
  .hero-ctas{ display:flex; gap:14px; margin-top:32px; flex-wrap:wrap; }
  .btn{
    font-family:'IBM Plex Mono', monospace; font-size:13.5px; letter-spacing:.03em;
    padding:13px 22px; border-radius:2px; text-decoration:none; display:inline-flex; align-items:center; gap:8px;
    transition:transform .2s ease, background .2s ease, border-color .2s ease, box-shadow .2s ease;
  }
  .btn-primary{ background:var(--amber); color:#201804; font-weight:600; }
  .btn-primary:hover{ transform:translateY(-2px); box-shadow:0 10px 24px -10px rgba(242,184,75,0.5); }
  .btn-ghost{ border:1px solid var(--rule-strong); color:var(--paper); }
  .btn-ghost:hover{ border-color:var(--paper); transform:translateY(-2px); }

  /* ---- Document demo card: the signature element ---- */
  .demo{
    background:var(--panel); border:1px solid var(--rule); border-radius:6px;
    max-width:760px; margin:0 auto; overflow:hidden;
    box-shadow:0 30px 70px -30px rgba(0,0,0,0.6);
    transition:border-color .2s ease;
  }
  .demo-bar{
    display:flex; align-items:center; justify-content:space-between;
    padding:12px 18px; border-bottom:1px solid var(--rule);
    font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--muted);
  }
  .demo-bar .dots{ display:flex; gap:6px; }
  .demo-bar .dots span{ width:8px; height:8px; border-radius:50%; background:var(--rule-strong); }
  .demo-body{ padding:26px 26px 22px; min-height:230px; }
  .demo-q{
    font-family:'IBM Plex Mono', monospace; font-size:13px; color:var(--teal);
    margin-bottom:14px; display:flex; gap:8px;
  }
  .demo-answer{ font-size:17px; line-height:1.75; color:var(--paper); }
  .demo-answer[dir="rtl"]{ font-family:'IBM Plex Sans', sans-serif; text-align:right; }
  .hl{
    background-image:linear-gradient(var(--amber), var(--amber));
    background-repeat:no-repeat;
    background-size:0% 100%;
    background-position:0 88%;
    padding:1px 2px;
    animation:sweep 1.1s ease forwards;
    animation-delay:.25s;
  }
  @keyframes sweep{ to{ background-size:100% 40%; } }
  .cite-tag{
    display:inline-flex; align-items:center; gap:6px; margin-top:16px;
    font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--muted);
    border:1px solid var(--rule-strong); padding:6px 10px; border-radius:2px;
    opacity:0; animation:fadeUp .4s ease forwards; animation-delay:1.1s;
  }
  .cite-tag b{ color:var(--teal); font-weight:600; }
  .refuse-tag{
    display:inline-flex; align-items:center; gap:6px; margin-top:16px;
    font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--redact);
    border:1px solid rgba(193,68,59,0.4); padding:6px 10px; border-radius:2px;
    opacity:0; animation:fadeUp .4s ease forwards; animation-delay:1.1s;
  }
  @keyframes fadeUp{ from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:translateY(0);} }
  .demo-toggle{ display:flex; gap:8px; padding:14px 18px; border-top:1px solid var(--rule); flex-wrap:wrap; }
  .demo-toggle button{
    font-family:'IBM Plex Mono', monospace; font-size:12px; letter-spacing:.02em;
    background:transparent; border:1px solid var(--rule-strong); color:var(--muted);
    padding:8px 12px; border-radius:2px; cursor:pointer; transition:all .2s ease;
  }
  .demo-toggle button:hover{ color:var(--paper); border-color:var(--paper); }
  .demo-toggle button.active{ color:var(--ink); background:var(--paper); border-color:var(--paper); }

  /* ---- Scroll-triggered version of the same animation, used in the Flow section ---- */
  .flow-hl{
    background-image:linear-gradient(var(--amber), var(--amber));
    background-repeat:no-repeat;
    background-size:0% 100%;
    background-position:0 88%;
    padding:1px 2px;
    animation:sweep 1.1s ease forwards;
    animation-delay:.2s;
    animation-play-state:paused;
  }
  .flow-bubble.play .flow-hl{ animation-play-state:running; }
  .flow-cite{
    display:inline-flex; align-items:center; gap:6px; margin-top:14px;
    font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--muted);
    border:1px solid var(--rule-strong); padding:6px 10px; border-radius:2px;
    opacity:0; animation:fadeUp .4s ease forwards; animation-delay:1s; animation-play-state:paused;
  }
  .flow-bubble.play .flow-cite{ animation-play-state:running; }
  .flow-cite b{ color:var(--teal); font-weight:600; }

  @media (prefers-reduced-motion:reduce){
    .hl, .flow-hl{ animation:none !important; background-size:100% 40% !important; }
    .cite-tag, .refuse-tag, .flow-cite{ animation:none !important; opacity:1 !important; }
  }

  /* ===== STACK STRIP ===== */
  .stackstrip{ border-top:1px solid var(--rule); border-bottom:1px solid var(--rule); padding:22px 0; }
  .stackstrip .wrap{ display:flex; flex-wrap:wrap; gap:12px; justify-content:center; align-items:center; }
  .seal{
    font-family:'IBM Plex Mono', monospace; font-size:12px; letter-spacing:.04em;
    color:var(--muted); border:1px solid var(--rule); padding:7px 13px; border-radius:20px;
    transition:color .2s ease, border-color .2s ease;
  }
  .seal:hover{ color:var(--paper); border-color:var(--rule-strong); }

  /* ===== SECTION HEADS ===== */
  section{ padding:88px 0; }
  .section-head{ max-width:640px; margin-bottom:52px; }
  .section-head h2{ font-size:clamp(26px,3.4vw,38px); margin-top:12px; }
  .section-head p{ color:var(--muted); margin-top:14px; font-size:16px; }

  /* ===== FEATURES ===== */
  .feature-grid{ display:grid; grid-template-columns:repeat(3, 1fr); gap:1px; background:var(--rule); border:1px solid var(--rule); }
  .feature-card{ background:var(--ink); padding:30px 26px; transition:background .2s ease; }
  .feature-card:hover{ background:var(--panel); }
  .feature-tab{
    font-family:'IBM Plex Mono', monospace; font-size:11px; letter-spacing:.1em;
    color:var(--teal); border:1px solid rgba(79,209,197,0.35); display:inline-block;
    padding:3px 8px; border-radius:2px; margin-bottom:16px;
  }
  .feature-card.warn .feature-tab{ color:var(--redact); border-color:rgba(193,68,59,0.35); }
  .feature-card h3{ font-size:19px; font-weight:600; margin-bottom:10px; }
  .feature-card p{ font-size:14.5px; color:var(--muted); margin:0; }
  @media (max-width:900px){ .feature-grid{ grid-template-columns:1fr 1fr; } }
  @media (max-width:600px){ .feature-grid{ grid-template-columns:1fr; } }

  /* ===== INGESTION PIPELINE STRIP ===== */
  .pipeline{ display:flex; align-items:stretch; gap:0; overflow-x:auto; padding-bottom:10px; }
  .pstep{ flex:1 0 150px; padding:20px 18px; border-top:2px solid var(--rule-strong); position:relative; transition:border-color .2s ease; }
  .pstep + .pstep{ border-left:1px solid var(--rule); }
  .pstep:hover{ border-top-color:var(--amber); }
  .pstep .pnum{ font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--amber); }
  .pstep h4{ font-family:'Fraunces', serif; font-size:17px; margin:8px 0 6px; font-weight:600; }
  .pstep p{ font-size:13px; color:var(--muted); margin:0; }

  /* ===== FULL FLOW SECTION ===== */
  .flow-lane{ margin-bottom:64px; }
  .flow-lane:last-child{ margin-bottom:0; }
  .flow-lane-head{ display:flex; align-items:baseline; gap:12px; margin-bottom:26px; }
  .flow-lane-head .who{
    font-family:'IBM Plex Mono', monospace; font-size:12px; letter-spacing:.08em; text-transform:uppercase;
    padding:5px 10px; border-radius:2px; border:1px solid var(--rule-strong); color:var(--paper);
  }
  .flow-lane-head h3{ font-size:21px; font-weight:600; }
  .flow-steps{ display:flex; gap:0; overflow-x:auto; position:relative; }
  .flow-step{
    flex:1 0 170px; padding:18px 16px 16px; position:relative;
    opacity:0; transform:translateY(14px); transition:opacity .5s ease, transform .5s ease;
  }
  .flow-step::before{
    content:""; position:absolute; top:11px; left:0; right:0; height:2px; background:var(--rule);
  }
  .flow-step:first-child::before{ left:50%; }
  .flow-step:last-child::before{ right:50%; }
  .flow-step .dot{
    position:absolute; top:5px; left:50%; transform:translateX(-50%);
    width:14px; height:14px; border-radius:50%; background:var(--ink); border:2px solid var(--rule-strong);
    z-index:2; transition:border-color .3s ease, background .3s ease;
  }
  .flow-step.on .dot{ border-color:var(--amber); background:var(--amber); }
  .flow-step .fnum{ display:block; margin-top:22px; font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--amber); text-align:center; }
  .flow-step h4{ font-family:'Fraunces', serif; font-weight:600; font-size:15.5px; text-align:center; margin:6px 0 6px; }
  .flow-step p{ font-size:12.5px; color:var(--muted); text-align:center; margin:0; }
  @media (max-width:760px){
    .flow-steps{ flex-direction:column; }
    .flow-step::before{ top:0; bottom:0; left:11px; right:auto; width:2px; height:auto; }
    .flow-step:first-child::before{ top:50%; }
    .flow-step:last-child::before{ bottom:50%; }
    .flow-step .dot{ top:50%; left:11px; transform:translate(-50%,-50%); }
    .flow-step{ padding:16px 16px 16px 40px; text-align:left; }
    .flow-step h4, .flow-step p, .flow-step .fnum{ text-align:left; }
  }

  .flow-bubble{
    margin-top:36px; max-width:620px; background:var(--panel); border:1px solid var(--rule);
    border-radius:6px; padding:22px 24px; opacity:0; transform:translateY(14px);
    transition:opacity .5s ease, transform .5s ease;
  }
  .flow-bubble.on{ opacity:1; transform:translateY(0); }
  .flow-bubble-label{ font-family:'IBM Plex Mono', monospace; font-size:11.5px; color:var(--teal); margin-bottom:10px; }
  .flow-bubble-text{ font-size:15.5px; line-height:1.7; }

  /* ===== CONTRIBUTORS ===== */
  .crew-grid{ display:grid; grid-template-columns:repeat(3, 1fr); gap:18px; }
  @media (max-width:900px){ .crew-grid{ grid-template-columns:1fr 1fr; } }
  @media (max-width:560px){ .crew-grid{ grid-template-columns:1fr; } }
  .crew-card{
    background:var(--panel); border:1px solid var(--rule); border-radius:6px; padding:22px;
    text-decoration:none; color:var(--paper); display:flex; gap:16px; align-items:flex-start;
    transition:border-color .2s ease, transform .2s ease, background .2s ease;
  }
  .crew-card:hover{ border-color:var(--rule-strong); transform:translateY(-3px); background:var(--panel-2); }
  .crew-avatar{
    width:56px; height:56px; border-radius:50%; flex-shrink:0; border:1px solid var(--rule-strong);
    background:var(--panel-2); object-fit:cover; transition:transform .3s ease, border-color .3s ease;
  }
  .crew-card:hover .crew-avatar{ transform:scale(1.06); border-color:var(--amber); }
  .crew-name{ font-family:'Fraunces', serif; font-weight:600; font-size:17px; }
  .crew-handle{ font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--teal); margin-top:2px; }
  .crew-role{ font-size:13.5px; color:var(--muted); margin-top:8px; line-height:1.5; }
  .crew-modules{ margin-top:10px; display:flex; flex-wrap:wrap; gap:6px; }
  .crew-modules span{
    font-family:'IBM Plex Mono', monospace; font-size:10.5px; color:var(--muted);
    border:1px solid var(--rule); padding:2px 7px; border-radius:20px;
  }

  /* ===== CTA / FOOTER ===== */
  .closer{ text-align:center; padding:100px 0 80px; border-top:1px solid var(--rule); }
  .closer h2{ font-size:clamp(28px,4vw,44px); max-width:640px; margin:16px auto 0; }
  .closer p{ color:var(--muted); margin:18px auto 0; max-width:480px; }
  .closer .btn{ margin-top:32px; }
  footer{ border-top:1px solid var(--rule); padding:34px 0; }
  .footer-inner{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; font-size:13px; color:var(--muted); }
  .footer-inner a{ text-decoration:underline; text-underline-offset:3px; transition:color .2s ease; }
  .footer-inner a:hover{ color:var(--paper); }

`;

const bodyHtml = `


<header class="nav">
  <div class="nav-inner">
    <a href="#" class="brand">
      <svg class="brand-mark" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="#F2B84B" stroke-width="1.6"/>
        <path d="M7.5 9.5H16.5" stroke="#ECEAE6" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M7.5 13H13" stroke="#ECEAE6" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="15.5" cy="13" r="1.4" fill="#4FD1C5"/>
      </svg>
      DocuMind AI
    </a>
    <nav class="nav-links">
      <a href="#what">What it does</a>
      <a href="#flow">How it works</a>
      <a href="#crew">Contributors</a>
    </nav>
    <a class="nav-cta" href="https://github.com/mahmoudrabbas/documind-ai" target="_blank" rel="noopener">View source ↗</a>
  </div>
</header>

<section class="hero">
  <div class="wrap">
    <div class="hero-head">
      <span class="eyebrow">Private · Multi-tenant · Bilingual</span>
      <h1>Every answer,<br><em>traceable to a page.</em></h1>
      <p class="lede">DocuMind AI lets a company upload its own policies, contracts, and SOPs — then answers employee questions using only that evidence. A citation for every claim. A refusal when there isn't one.</p>
      <div class="hero-ctas">
        <a class="btn btn-primary" href="https://github.com/mahmoudrabbas/documind-ai" target="_blank" rel="noopener">Explore the repository</a>
        <a class="btn btn-ghost" href="#crew">Meet the team</a>
      </div>
    </div>

    <div class="demo">
      <div class="demo-bar">
        <span>hr_policy_2024.pdf — session</span>
        <div class="dots"><span></span><span></span><span></span></div>
      </div>
      <div class="demo-body" id="demoBody">
        <!-- filled by JS -->
      </div>
      <div class="demo-toggle" id="demoToggle"></div>
    </div>
  </div>
</section>

<div class="stackstrip">
  <div class="wrap">
    <span class="seal">Next.js</span>
    <span class="seal">TypeScript</span>
    <span class="seal">Express</span>
    <span class="seal">MongoDB Atlas Vector Search</span>
    <span class="seal">Docker</span>
    <span class="seal">BullMQ</span>
    <span class="seal">Tesseract OCR</span>
    <span class="seal">JWT + RBAC</span>
  </div>
</div>

<section id="what">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">What it provides</span>
      <h2>Built to be trusted with company knowledge.</h2>
      <p>Not a general chatbot with your files bolted on — a system designed around the two things enterprise Q&amp;A can't get wrong: who can see what, and whether an answer is actually true.</p>
    </div>
    <div class="feature-grid">
      <div class="feature-card">
        <span class="feature-tab">ISOLATION</span>
        <h3>True multi-tenancy</h3>
        <p>Every query is filtered by tenant and role before it ever reaches retrieval. One company can never see another's documents — enforced at the middleware and database layer, not just the UI.</p>
      </div>
      <div class="feature-card">
        <span class="feature-tab">RETRIEVAL</span>
        <h3>Hybrid search + rerank</h3>
        <p>Vector similarity and keyword search run together, merged and reranked, so answers are grounded in the passages that actually match the question — not just the ones that sound similar.</p>
      </div>
      <div class="feature-card warn">
        <span class="feature-tab">TRUST</span>
        <h3>Refusal over invention</h3>
        <p>When the evidence isn't there, DocuMind says so — explicitly — instead of generating a plausible-sounding guess. Every refusal is logged as a knowledge gap for admins to close.</p>
      </div>
      <div class="feature-card">
        <span class="feature-tab">EVIDENCE</span>
        <h3>Citations you can open</h3>
        <p>Every answer links back to the exact document, page, and section it came from, with the source snippet available to inspect — not a vague "according to your files."</p>
      </div>
      <div class="feature-card">
        <span class="feature-tab">LANGUAGE</span>
        <h3>Arabic &amp; English, natively</h3>
        <p>Full RTL/LTR layout switching and bilingual OCR — a question asked in Arabic gets an Arabic answer, cited from the same documents an English question would use.</p>
      </div>
      <div class="feature-card">
        <span class="feature-tab">VISIBILITY</span>
        <h3>Knowledge gaps, surfaced</h3>
        <p>Repeated unanswerable questions cluster into a ranked list for Company Admins — a direct signal for what to upload next, instead of a support inbox nobody reads.</p>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Ingestion, step by step</span>
      <h2>From a raw PDF to a searchable, cited passage.</h2>
      <p>Every uploaded file goes through the same six-stage pipeline before an employee can ever retrieve it.</p>
    </div>
    <div class="pipeline">
      <div class="pstep"><span class="pnum">01</span><h4>Upload</h4><p>PDF, DOCX, or TXT — validated for type, size, and file integrity.</p></div>
      <div class="pstep"><span class="pnum">02</span><h4>OCR &amp; chunk</h4><p>Scanned pages read with bilingual OCR, then split into 600–900 token passages.</p></div>
      <div class="pstep"><span class="pnum">03</span><h4>Embed &amp; index</h4><p>Each chunk vectorized and indexed, pre-filtered by tenant and access role.</p></div>
      <div class="pstep"><span class="pnum">04</span><h4>Retrieve</h4><p>Hybrid vector + keyword search, merged and reranked for the question asked.</p></div>
      <div class="pstep"><span class="pnum">05</span><h4>Verify</h4><p>Every claim in the draft answer is checked against its cited chunk before release.</p></div>
      <div class="pstep"><span class="pnum">06</span><h4>Answer</h4><p>Delivered with sources — or an explicit refusal if the evidence falls short.</p></div>
    </div>
  </div>
</section>

<section id="flow">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">The full journey</span>
      <h2>From an admin's upload to an employee's answer.</h2>
      <p>Two people, one system: a Company Admin builds the knowledge base, then an employee draws on it — governed by a fixed sequence of agents, not an open-ended one.</p>
    </div>

    <div class="flow-lane" data-lane="admin">
      <div class="flow-lane-head">
        <span class="who">Company Admin</span>
        <h3>Uploads a document</h3>
      </div>
      <div class="flow-steps">
        <div class="flow-step"><span class="dot"></span><span class="fnum">01</span><h4>Select &amp; upload</h4><p>Drags in HR_Policy_2024.pdf, tags department and access roles.</p></div>
        <div class="flow-step"><span class="dot"></span><span class="fnum">02</span><h4>Validate</h4><p>File type, size, and magic bytes checked before anything is stored.</p></div>
        <div class="flow-step"><span class="dot"></span><span class="fnum">03</span><h4>Extract &amp; OCR</h4><p>Text pulled out; scanned pages run through bilingual OCR.</p></div>
        <div class="flow-step"><span class="dot"></span><span class="fnum">04</span><h4>Chunk &amp; embed</h4><p>Split into passages, each converted to a vector and indexed.</p></div>
        <div class="flow-step"><span class="dot"></span><span class="fnum">05</span><h4>Ready</h4><p>Document status flips to "Ready" — now part of the searchable knowledge base.</p></div>
      </div>
    </div>

    <div class="flow-lane" data-lane="employee">
      <div class="flow-lane-head">
        <span class="who">Employee</span>
        <h3>Asks a question</h3>
      </div>
      <div class="flow-steps">
        <div class="flow-step"><span class="dot"></span><span class="fnum">01</span><h4>Ask</h4><p>"What's our carry-over leave policy?" — typed into the chat.</p></div>
        <div class="flow-step"><span class="dot"></span><span class="fnum">02</span><h4>Auth check</h4><p>Tenant and role verified from the session — never from the request itself.</p></div>
        <div class="flow-step"><span class="dot"></span><span class="fnum">03</span><h4>Retrieve &amp; rerank</h4><p>Hybrid search finds candidate passages; the best evidence rises to the top.</p></div>
        <div class="flow-step"><span class="dot"></span><span class="fnum">04</span><h4>Agents: draft → verify</h4><p>A Retrieval agent hands off to a Draft agent, then a Compliance agent checks every claim against the evidence.</p></div>
        <div class="flow-step"><span class="dot"></span><span class="fnum">05</span><h4>Answer or refuse</h4><p>A cited answer is returned — or an honest refusal if the evidence doesn't hold up.</p></div>
      </div>

      <div class="flow-bubble" id="flowBubble">
        <div class="flow-bubble-label">▸ Final answer, delivered to the employee</div>
        <div class="flow-bubble-text">Employees are permitted to carry over a maximum of <span class="flow-hl">five business days</span> of unused annual leave into the next fiscal year, provided it's used by the end of Q1.</div>
        <div class="flow-cite">📄 <b>HR_Policy_2024.pdf</b> · page 14 · verified by the Compliance agent</div>
      </div>
    </div>
  </div>
</section>

<section id="crew">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Contributors</span>
      <h2>Six developers. One open source project.</h2>
      <p>Every module below was designed, built, and reviewed by its owner — click through to see their work.</p>
    </div>
    <div class="crew-grid">

      <a class="crew-card" href="https://github.com/mahmoudrabbas" target="_blank" rel="noopener">
        <div>
          <div class="crew-name">Mahmoud Ramadan</div>
          <div class="crew-handle">@mahmoudrabbas</div>
          <p class="crew-role">Infrastructure lead — scaffolding, Docker, and the document upload &amp; ingestion pipeline.</p>
          <div class="crew-modules"><span>Platform</span><span>Documents</span></div>
        </div>
      </a>

      <a class="crew-card" href="https://github.com/marcoreda56-bot" target="_blank" rel="noopener">
        <div>
          <div class="crew-name">Marco Reda</div>
          <div class="crew-handle">@marcoreda56-bot</div>
          <p class="crew-role">Auth &amp; security lead — registration, JWT sessions, and the tenant-isolation middleware.</p>
          <div class="crew-modules"><span>Auth</span><span>RBAC</span></div>
        </div>
      </a>

      <a class="crew-card" href="https://github.com/omar1175" target="_blank" rel="noopener">
        <div>
          <div class="crew-name">Omar Abdelsattar</div>
          <div class="crew-handle">@omar1175</div>
          <p class="crew-role">User &amp; admin management, plus the knowledge-gap tracking that closes the feedback loop.</p>
          <div class="crew-modules"><span>Users</span><span>Knowledge Gaps</span></div>
        </div>
      </a>

      <a class="crew-card" href="https://github.com/Se7so27" target="_blank" rel="noopener">
        <div>
          <div class="crew-name">Isac Nady</div>
          <div class="crew-handle">@Se7so27</div>
          <p class="crew-role">Retrieval &amp; AI systems — hybrid search, reranking, and the LLM/embedding provider layer.</p>
          <div class="crew-modules"><span>Retrieval</span><span>Analytics</span></div>
        </div>
      </a>

      <a class="crew-card" href="https://github.com/Abdallahadel2004" target="_blank" rel="noopener">
        <div>
          <div class="crew-name">Abdullah Adel</div>
          <div class="crew-handle">@Abdallahadel2004</div>
          <p class="crew-role">Processing pipeline &amp; OCR, and the shared design system every screen is built from.</p>
          <div class="crew-modules"><span>Processing</span><span>Design System</span></div>
        </div>
      </a>

      <a class="crew-card" href="https://github.com/sohylagomaa" target="_blank" rel="noopener">
        <div>
          <div class="crew-name">Sohyla Gomaa</div>
          <div class="crew-handle">@sohylagomaa</div>
          <p class="crew-role">Chat &amp; citations lead — conversation orchestration and claim-to-source verification.</p>
          <div class="crew-modules"><span>Chat</span><span>Citations</span></div>
        </div>
      </a>

    </div>
  </div>
</section>

<section class="closer">
  <div class="wrap">
    <span class="eyebrow">Open Source Project · 2026</span>
    <h2>Read the code, or see it answer a question honestly.</h2>
    <p>The full SRS, architecture review, and sprint history live in the repository alongside the source.</p>
    <a class="btn btn-primary" href="https://github.com/mahmoudrabbas/documind-ai" target="_blank" rel="noopener">github.com/mahmoudrabbas/documind-ai</a>
  </div>
</section>

<footer>
  <div class="wrap footer-inner">
    <span>DocuMind AI — built by six developers.</span>
    <a href="https://github.com/mahmoudrabbas/documind-ai" target="_blank" rel="noopener">Source on GitHub</a>
  </div>
</footer>


`;

export default function Home() {
  useEffect(() => {
    // Load the same Google Fonts the standalone site used
    const preconnect1 = document.createElement("link");
    preconnect1.rel = "preconnect";
    preconnect1.href = "https://fonts.googleapis.com";
    document.head.appendChild(preconnect1);

    const preconnect2 = document.createElement("link");
    preconnect2.rel = "preconnect";
    preconnect2.href = "https://fonts.gstatic.com";
    preconnect2.crossOrigin = "anonymous";
    document.head.appendChild(preconnect2);

    const fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(fontLink);

    // --- Same interactive behavior as the standalone site (hero demo toggles,
    // scroll-reveal, and the flow-section citation animation) ---
    /* ---------- Hero demo (auto-plays, toggles on click) ---------- */
    const demos = [
      {
        label: "Grounded",
        q: "\u201cWhat is our policy on carry-over leave?\u201d",
        html: 'According to <span class="hl">HR Policy 2024</span>, employees may carry over a maximum of <span class="hl">five business days</span> of unused annual leave into the next fiscal year, provided it is used by the end of Q1.',
        tag: '<div class="cite-tag">📄 <b>HR_Policy_2024.pdf</b> · page 14 · §12.4</div>',
        dir: "ltr",
      },
      {
        label: "Refusal",
        q: "\u201cWhat's the remote-work equipment stipend?\u201d",
        html: 'I couldn\u2019t find enough evidence in your uploaded documents to answer this confidently — <span class="hl">I don\u2019t want to guess</span>.',
        tag: '<div class="refuse-tag">⚑ Logged as a knowledge gap for HR Admin</div>',
        dir: "ltr",
      },
      {
        label: "بالعربية",
        q: "\u201cكم عدد أيام الإجازة السنوية المسموح ترحيلها؟\u201d",
        html: 'وفقًا لسياسة الموارد البشرية 2024، يجوز للموظفين ترحيل <span class="hl">حتى خمسة أيام عمل</span> من رصيد الإجازة السنوية غير المستخدم إلى السنة المالية التالية.',
        tag: '<div class="cite-tag">📄 <b>HR_Policy_2024.pdf</b> · صفحة 14 · القسم 12.4</div>',
        dir: "rtl",
      },
    ];

    const body = document.getElementById("demoBody");
    const toggle = document.getElementById("demoToggle");

    // Bail out early if either element is missing so everything below can
    // safely assume both are non-null (TypeScript narrows on this guard).
    if (!body || !toggle) {
      return;
    }

    function render(i: number) {
      const d = demos[i];
      body!.innerHTML = `
          <div class="demo-q">▸ ${d.q}</div>
          <div class="demo-answer" dir="${d.dir}">${d.html}</div>
          ${d.tag}
        `;
      body!
        .querySelectorAll<HTMLElement>(".hl, .cite-tag, .refuse-tag")
        .forEach((el) => {
          el.style.animation = "none";
          void el.offsetWidth;
          el.style.animation = "";
        });
      [...toggle!.children].forEach((btn, idx) =>
        btn.classList.toggle("active", idx === i),
      );
    }

    demos.forEach((d, i) => {
      const btn = document.createElement("button");
      btn.textContent = d.label;
      btn.addEventListener("click", () => render(i));
      toggle.appendChild(btn);
    });

    render(0);

    /* ---------- Generic reveal-on-scroll ---------- */
    const revealables = document.querySelectorAll<HTMLElement>(
      ".feature-card, .crew-card, .pstep",
    );
    revealables.forEach((el) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(14px)";
      el.style.transition = "opacity .5s ease, transform .5s ease";
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const target = e.target as HTMLElement;
            target.style.opacity = "1";
            target.style.transform = "translateY(0)";
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    revealables.forEach((el) => io.observe(el));

    /* ---------- Flow section: staggered step reveal per lane ---------- */
    document.querySelectorAll<HTMLElement>(".flow-lane").forEach((lane) => {
      const steps = lane.querySelectorAll<HTMLElement>(".flow-step");
      const laneObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              steps.forEach((step, idx) => {
                setTimeout(() => {
                  step.style.opacity = "1";
                  step.style.transform = "translateY(0)";
                  step.classList.add("on");
                }, idx * 160);
              });
              laneObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.25 },
      );
      laneObserver.observe(lane);
    });

    /* ---------- Flow bubble: reveal + replay the citation-highlight animation ---------- */
    const flowBubble = document.getElementById("flowBubble");
    if (flowBubble) {
      const bubbleObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const target = entry.target as HTMLElement;
              target.classList.add("on");
              setTimeout(() => target.classList.add("play"), 500);
              bubbleObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.4 },
      );
      bubbleObserver.observe(flowBubble);
    }

    return () => {
      document.head.removeChild(preconnect1);
      document.head.removeChild(preconnect2);
      document.head.removeChild(fontLink);
    };
  }, []);

  return (
    <>
      <style>{pageCss}</style>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </>
  );
}