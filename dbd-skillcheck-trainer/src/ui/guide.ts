// Sidebar guide content, ported from the prototype: how to actually get
// better, grounded in motor-learning research (CAT, contextual interference,
// distributed practice).

export const GUIDE_HTML = `
  <div class="guide-h">
    <div class="t">Skill-Check Accuracy Guide</div>
    <div class="s">How to actually get better — grounded in motor-learning research</div>
  </div>
  <div class="guide-body">

    <div class="gsec">
      <h4><span class="n">i</span>What you're training</h4>
      <p>A DBD skill check is a textbook <b>coincidence-anticipation timing</b> (CAT) task: you press to coincide with a moving target hitting a fixed zone. This is the same skill lab studies measure with a Bassin timer (the row of LEDs racing toward a mark). The research on CAT and motor learning translates directly to what you do here.</p>
      <p>The core finding that should shape your practice: <b>the conditions that make practice feel good are usually not the ones that build lasting skill.</b> Easy, repetitive, predictable drilling produces fast in-session gains that evaporate. Harder, varied practice feels worse but sticks.</p>
    </div>

    <div class="gsec">
      <h4><span class="n">1</span>Vary everything (contextual interference)</h4>
      <p>Blocking — same condition over and over — beats varied practice <b>during</b> a session but loses badly on retention and transfer tests. Random/varied practice forces you to reconstruct the timing each rep, which builds a stronger, more flexible motor representation.</p>
      <ul>
        <li>Change the <b>pointer-speed slider</b> between sets (0.85× / 1.0× / 1.3×) instead of grinding one speed.</li>
        <li>Mix <b>zone sizes</b> down so a normal great zone feels huge by comparison.</li>
        <li>Rotate modes — Generator, then Overcharge, then Doctor — rather than 200 identical gen checks.</li>
        <li>Turn on <b>BG Noise</b> so the visual field isn't sterile (more on this below).</li>
      </ul>
      <p class="gnote">Expect your in-session numbers to drop when you do this. That dip is the point — it's the signature of practice that transfers.</p>
    </div>

    <div class="gsec">
      <h4><span class="n">2</span>Short, spaced sessions beat marathons</h4>
      <p>For the same total reps, <b>distributed practice</b> (spread across sessions with rest) produces better retention than <b>massed practice</b> (one long grind). Consolidation happens in the gaps, including sleep.</p>
      <ul>
        <li><b>10–15 min</b> focused blocks, not hour-long sessions.</li>
        <li>Several short sessions across the week &gt; one big cram.</li>
        <li>Revisit across multiple days — robustness comes from re-encountering the skill after partial forgetting.</li>
      </ul>
    </div>

    <div class="gsec">
      <h4><span class="n">3</span>Read your bias, then correct it</h4>
      <p>The <b>timing tape</b> below the dial is your feedback instrument. CAT research separates error into two kinds, and they need different fixes:</p>
      <table class="gtable">
        <tr><td>Constant error</td><td>Your average offset — consistently early or late. A <b>systematic bias</b> you can consciously correct.</td></tr>
        <tr><td>Variable error</td><td>Your spread (±SD) — how inconsistent you are. Reducing this <b>is</b> the skill; it only comes down with reps.</td></tr>
      </table>
      <ul>
        <li>Watch the <b>avg</b> readout. If it reads "−25ms early," you're jumping the gun — deliberately wait a hair longer.</li>
        <li>Watch the <b>±SD</b>. A tight cluster off-center is an easy fix (shift your timing); a wide scatter means keep drilling.</li>
        <li>Research on fast targets: people tend to fire <b>early</b> as speed climbs. If you fail Overcharge III early, that's expected — bias later.</li>
      </ul>
    </div>

    <div class="gsec">
      <h4><span class="n">4</span>Anticipate the position, react to the gong</h4>
      <p>Great checks (~33 ms window on a gen) are too tight for pure reaction — average human visual reaction is ~200–250 ms. You can't see the pointer arrive and then decide. You have to <b>pre-plan the press</b> from where the zone sits and let the gong cue your rhythm.</p>
      <ul>
        <li>The instant the zone appears, your eyes should snap to it and your hand should already be "loading."</li>
        <li>Train with the <b>warning-lead slider low</b> sometimes to wean off the audio crutch; raise it to rehearse rhythm.</li>
        <li>Keep your eyes on the <b>zone</b>, not chasing the pointer around the dial.</li>
      </ul>
    </div>

    <div class="gsec">
      <h4><span class="n">5</span>Overload, then return to normal</h4>
      <p>Briefly training <b>harder than real</b> makes the real thing feel slow — a deliberate-practice staple.</p>
      <div class="gcard">
        <div class="gc-t">Overload set → calibration set</div>
        <div class="gstep"><span class="gd"></span><div>Run a set at <b>1.3–1.5× speed</b> with a <b>smaller zone</b>. You'll miss more. Fine.</div></div>
        <div class="gstep"><span class="gd"></span><div>Drop back to <b>1.0×</b>, normal zone. It feels languid; greats land easier.</div></div>
        <div class="gstep"><span class="gd"></span><div>Finish at <b>game-realistic</b> settings to re-anchor the true timing before you stop.</div></div>
      </div>
    </div>

    <div class="gsec">
      <h4><span class="n">✦</span>The 5-minute program (one button)</h4>
      <p>The <b>▶ 5-Min Program</b> button runs this whole structure for you — it auto-switches speed, zone, task type, and pressure through five timed segments, then gives you a per-segment breakdown with your timing bias. It's the fastest way to get the research-backed routine without fiddling with controls.</p>
      <div class="gcard">
        <div class="gc-t">What it runs</div>
        <div class="gstep"><span class="gd"></span><div><b>0:45 Warm-up</b> — Generator, 1.0×. Re-find the rhythm.</div></div>
        <div class="gstep"><span class="gd"></span><div><b>1:15 Overload</b> — 1.4× speed, 0.7× zone. Harder than real.</div></div>
        <div class="gstep"><span class="gd"></span><div><b>1:15 Varied</b> — rotates Generator / Overcharge II / Madness every ~7s, BG noise on. Contextual interference.</div></div>
        <div class="gstep"><span class="gd"></span><div><b>0:45 Bias-fix</b> — Generator 1.0×. Center your timing.</div></div>
        <div class="gstep"><span class="gd"></span><div><b>1:00 Pressure</b> — continuous Merciless Storm. Under fatigue.</div></div>
      </div>
      <p class="gnote">Run it 3–4× a week, not 60 min once. Track great-rate and ±SD <b>across</b> sessions — the breakdown after each run is your scoreboard.</p>
    </div>

    <div class="gsec">
      <h4><span class="n">✦</span>Prefer to drive it yourself? (15-min version)</h4>
      <div class="gcard">
        <div class="gstep"><span class="gd"></span><div><b>2 min warm-up</b> — Generator, Drill pacing, 1.0×. Just re-find the rhythm; ignore the score.</div></div>
        <div class="gstep"><span class="gd"></span><div><b>3 min overload</b> — 1.35× speed, zone 0.7×. Push into the discomfort zone.</div></div>
        <div class="gstep"><span class="gd"></span><div><b>4 min varied</b> — alternate Generator / Overcharge II / Doctor every ~10 checks, 1.0×, <b>BG Noise on</b>.</div></div>
        <div class="gstep"><span class="gd"></span><div><b>3 min bias-fix</b> — back to Generator. Read the tape's avg; consciously correct early/late until the cluster centers on 0.</div></div>
        <div class="gstep"><span class="gd"></span><div><b>3 min pressure</b> — toggle <b>Merciless Storm</b> and survive full gens. Continuous checks under fatigue = match-realistic stress.</div></div>
      </div>
    </div>

    <div class="gsec">
      <h4><span class="n">!</span>One honest limit</h4>
      <p>Lab CAT studies note training often transfers to the trained task but <b>not perfectly to a different environment</b>. This trainer sharpens the read, the rhythm, and your timing-bias awareness — but browser input latency isn't your in-game pipeline. Use it to build the skill, then <b>calibrate exact timing in a DBD custom match</b>.</p>
    </div>

    <div class="gref">
      Principles drawn from motor-learning research on coincidence-anticipation timing, the contextual-interference effect (random vs. blocked practice), and distributed vs. massed practice (Shea &amp; Morgan; Schmidt; CAT/Bassin-timer studies). General findings, applied to this task — not DBD-specific studies.
    </div>

  </div>
`;

export const FOOT_NOTE_HTML =
  '<b>Verified vs. game data:</b> zone sizes, pointer rotation times, zone spawn positions (4–11 o’clock; DS 8–11), the +1% gen great bonus, fail penalties, per-second trigger odds, 3s fail pause (Snap Out of It: 2s), Hyperfocus (+4% speed &amp; odds, +30% bonus per token), Unnerving (good zone only, −40/50/60%), Stake Out, Madness off-centre/reversed rolls, Merciless Storm continuous chaining. ' +
  '<b>Approximated / adapted:</b> warning-gong lead time (slider), Lullaby per-token scaling, audio (the check/good/great cues are recorded skill-check sounds; the fail cue is synthesized), background-noise visuals. Storm here runs <b>unlimited</b> — a miss costs progress but never blocks. Browser input latency differs from your in-game pipeline — train the read and rhythm here, calibrate exact timing in customs. ' +
  '<b>Not affiliated with Behaviour Interactive.</b> “Dead by Daylight” and its skill-check sounds are © Behaviour Interactive Inc.; the embedded cue recordings remain their owner’s property and are used here only for non-commercial, fan-made practice. Rights holders may request removal via this project’s GitHub issues.';
