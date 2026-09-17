/**
 * 水管工大冒险 · Pipe Jump
 * Original 2D platformer — no Nintendo assets/branding.
 */
(() => {
  "use strict";

  // ---------- Constants ----------
  const W = 800;
  const H = 480;
  const TILE = 32;
  const GRAVITY = 0.55;
  const MOVE_ACCEL = 0.55;
  const MOVE_MAX = 4.2;
  const FRICTION = 0.82;
  const JUMP_V = -11.2;
  const COYOTE_FRAMES = 6;
  const JUMP_BUFFER = 8;
  const INVULN_FRAMES = 90;
  const START_LIVES = 3;

  const STATE = {
    START: "start",
    PLAY: "play",
    PAUSE: "pause",
    WIN: "win",
    OVER: "over",
    DEAD: "dead",
  };

  // ---------- Canvas ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // ---------- Input ----------
  const keys = Object.create(null);
  const justPressed = Object.create(null);

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "p", "escape"].includes(k) || e.code === "Space") {
      e.preventDefault();
    }
    const id = normalizeKey(e);
    if (!keys[id]) justPressed[id] = true;
    keys[id] = true;
  });
  window.addEventListener("keyup", (e) => {
    keys[normalizeKey(e)] = false;
  });
  window.addEventListener("blur", () => {
    for (const k of Object.keys(keys)) keys[k] = false;
  });

  function normalizeKey(e) {
    if (e.code === "Space" || e.key === " ") return "space";
    const k = e.key.toLowerCase();
    if (k === "arrowleft") return "left";
    if (k === "arrowright") return "right";
    if (k === "arrowup") return "up";
    if (k === "arrowdown") return "down";
    if (k === "escape") return "esc";
    return k;
  }

  function held(id) {
    return !!keys[id];
  }
  function pressed(id) {
    return !!justPressed[id];
  }
  function clearJust() {
    for (const k of Object.keys(justPressed)) justPressed[k] = false;
  }

  function setVirtualKey(id, down) {
    if (!id) return;
    if (down) {
      if (!keys[id]) justPressed[id] = true;
      keys[id] = true;
    } else {
      keys[id] = false;
    }
  }

  // ---------- Touch / pointer on-screen controls ----------
  (function setupTouchControls() {
    const root = document.getElementById("touch-controls");
    if (!root) return;

    const activePointers = new Map(); // pointerId -> key id

    function bindButton(btn) {
      const keyId = btn.getAttribute("data-key");
      if (!keyId) return;

      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensureAudio();
        activePointers.set(e.pointerId, keyId);
        setVirtualKey(keyId, true);
        btn.classList.add("is-active");
        try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      };
      const up = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = activePointers.get(e.pointerId) || keyId;
        activePointers.delete(e.pointerId);
        // Only release if no other pointer still holding same key
        let still = false;
        for (const v of activePointers.values()) {
          if (v === id) { still = true; break; }
        }
        if (!still) {
          setVirtualKey(id, false);
          btn.classList.remove("is-active");
        }
        try { btn.releasePointerCapture(e.pointerId); } catch (_) {}
      };

      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("lostpointercapture", (e) => {
        const id = activePointers.get(e.pointerId);
        if (!id) return;
        activePointers.delete(e.pointerId);
        let still = false;
        for (const v of activePointers.values()) {
          if (v === id) { still = true; break; }
        }
        if (!still) {
          setVirtualKey(id, false);
          btn.classList.remove("is-active");
        }
      });

      // Block legacy touch scroll on buttons
      btn.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
      btn.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
    }

    root.querySelectorAll(".touch-btn").forEach(bindButton);

    // Prevent canvas page scroll / pinch zoom gestures
    const stage = document.getElementById("stage") || canvas;
    const block = (e) => { e.preventDefault(); };
    stage.addEventListener("touchstart", block, { passive: false });
    stage.addEventListener("touchmove", block, { passive: false });
    canvas.addEventListener("touchstart", block, { passive: false });
    canvas.addEventListener("touchmove", block, { passive: false });

    // Tap canvas to start / continue / retry (menus)
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      ensureAudio();
      // Only inject menu confirm when not already using a touch button
      if (state === STATE.START || state === STATE.WIN || state === STATE.OVER || state === STATE.PAUSE) {
        setVirtualKey("space", true);
        // Release next frame so it acts as a tap
        requestAnimationFrame(() => setVirtualKey("space", false));
      }
    });
  })();

  // ---------- Audio (simple beeps) ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (_) {
        audioCtx = null;
      }
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function beep(freq, dur, type, vol) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol ?? 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  const SFX = {
    jump: () => beep(420, 0.08, "square", 0.07),
    coin: () => {
      beep(880, 0.06, "square", 0.07);
      setTimeout(() => beep(1175, 0.1, "square", 0.07), 60);
    },
    stomp: () => beep(180, 0.12, "triangle", 0.1),
    hit: () => beep(120, 0.25, "sawtooth", 0.09),
    die: () => {
      beep(300, 0.15, "sawtooth", 0.1);
      setTimeout(() => beep(200, 0.2, "sawtooth", 0.1), 120);
      setTimeout(() => beep(100, 0.35, "sawtooth", 0.1), 280);
    },
    win: () => {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, "square", 0.08), i * 140));
    },
    pause: () => beep(330, 0.06, "sine", 0.05),
    block: () => beep(260, 0.05, "triangle", 0.06),
  };

  // ---------- Level data ----------
  // Legend:
  // . empty  G ground  B brick  ? question  P pipe body  T pipe top
  // C coin  E enemy  F flag pole  S spawn
  // Platform bricks etc. use solid tiles

  function buildLevel() {
    // World width in tiles ~ 120 (~3840 px) — one long completable stage
    const rows = [
      "........................................................................................................................",
      "........................................................................................................................",
      "........................................................................................................................",
      ".................................?......................?...............................................................",
      "........................................................................................................................",
      "...................?.......BB?BB...............................C.C.C.......................?............................",
      "..............................................C.........................................................................",
      ".........C.C.C..............................C...C...............BBBB.......................BB?BB..........C.C...........",
      "..........................................C.......C....................................................C.....C..........",
      "......................E.................BBBBBBBBBBB.....E....................E..........................................",
      "..............BB?BB..........PP.....................................PP..............BBBB........PP......................",
      ".............................PP.................?...................PP..........................PP..........E...........",
      ".........E...................PP......E..............................PP.....E....................PP......................",
      "GGGGGGGGGGGGGGGGGG....GGGGGGGGGGGGGGGGGGGGGGGGGGGGGG....GGGGGGGGGGGGGGGGGGGGGGGGGGGG....GGGGGGGGGGGGGGGGGGGGGGFFFFGGGGGG",
      "GGGGGGGGGGGGGGGGGG....GGGGGGGGGGGGGGGGGGGGGGGGGGGGGG....GGGGGGGGGGGGGGGGGGGGGGGGGGGG....GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
    ];

    // Pad / verify width
    const h = rows.length;
    const w = rows[0].length;
    const solids = [];
    const coins = [];
    const qblocks = [];
    const enemies = [];
    const pipes = [];
    let spawn = { x: 3 * TILE, y: 11 * TILE };
    let flagX = (w - 8) * TILE;
    let flagY = (h - 3) * TILE;

    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const ch = rows[ty][tx];
        const x = tx * TILE;
        const y = ty * TILE;
        switch (ch) {
          case "G":
            solids.push({ x, y, w: TILE, h: TILE, type: "ground" });
            break;
          case "B":
            solids.push({ x, y, w: TILE, h: TILE, type: "brick" });
            break;
          case "?":
            qblocks.push({
              x, y, w: TILE, h: TILE,
              used: false, bounce: 0, coinsLeft: 1,
            });
            solids.push({ x, y, w: TILE, h: TILE, type: "qblock", ref: qblocks[qblocks.length - 1] });
            break;
          case "P":
            solids.push({ x, y, w: TILE, h: TILE, type: "pipe" });
            pipes.push({ x, y });
            break;
          case "C":
            coins.push({ x: x + 6, y: y + 6, w: 20, h: 20, taken: false, bob: Math.random() * Math.PI * 2 });
            break;
          case "E":
            enemies.push({
              x, y: y + 4, w: 28, h: 28,
              vx: -0.8, alive: true, squash: 0, dir: -1,
            });
            break;
          case "F":
            flagX = x;
            flagY = y;
            break;
          case "S":
            spawn = { x, y };
            break;
          default:
            break;
        }
      }
    }

    // Extra floating platforms for variety (manual)
    const extras = [
      { x: 42 * TILE, y: 8 * TILE, w: TILE, h: TILE, type: "brick" },
      { x: 43 * TILE, y: 8 * TILE, w: TILE, h: TILE, type: "brick" },
      { x: 44 * TILE, y: 8 * TILE, w: TILE, h: TILE, type: "brick" },
      { x: 68 * TILE, y: 7 * TILE, w: TILE, h: TILE, type: "brick" },
      { x: 69 * TILE, y: 7 * TILE, w: TILE, h: TILE, type: "brick" },
      { x: 70 * TILE, y: 7 * TILE, w: TILE, h: TILE, type: "brick" },
      { x: 71 * TILE, y: 7 * TILE, w: TILE, h: TILE, type: "brick" },
      { x: 90 * TILE, y: 9 * TILE, w: TILE, h: TILE, type: "brick" },
      { x: 91 * TILE, y: 9 * TILE, w: TILE, h: TILE, type: "brick" },
    ];
    for (const e of extras) solids.push(e);

    // Decor clouds (non-solid)
    const clouds = [
      { x: 120, y: 60, s: 1 },
      { x: 400, y: 40, s: 1.3 },
      { x: 780, y: 70, s: 1 },
      { x: 1200, y: 50, s: 1.4 },
      { x: 1600, y: 80, s: 1 },
      { x: 2100, y: 45, s: 1.2 },
      { x: 2600, y: 65, s: 1 },
      { x: 3100, y: 55, s: 1.3 },
      { x: 3500, y: 40, s: 1 },
    ];

    const hills = [
      { x: 80, y: 13 * TILE, r: 50 },
      { x: 520, y: 13 * TILE, r: 70 },
      { x: 1100, y: 13 * TILE, r: 55 },
      { x: 1800, y: 13 * TILE, r: 80 },
      { x: 2500, y: 13 * TILE, r: 60 },
      { x: 3200, y: 13 * TILE, r: 75 },
    ];

    // Bushes
    const bushes = [
      { x: 200, y: 13 * TILE },
      { x: 640, y: 13 * TILE },
      { x: 1400, y: 13 * TILE },
      { x: 2000, y: 13 * TILE },
      { x: 2800, y: 13 * TILE },
      { x: 3400, y: 13 * TILE },
    ];

    return {
      w: w * TILE,
      h: h * TILE,
      tilesH: h,
      tilesW: w,
      solids,
      coins,
      qblocks,
      enemies,
      pipes,
      clouds,
      hills,
      bushes,
      spawn,
      flag: { x: flagX, y: flagY - TILE * 4, h: TILE * 5, poleX: flagX + 12 },
      pits: findPits(rows),
    };
  }

  function findPits(rows) {
    const ground = rows[rows.length - 2];
    const pits = [];
    let i = 0;
    while (i < ground.length) {
      if (ground[i] === ".") {
        const start = i;
        while (i < ground.length && ground[i] === ".") i++;
        pits.push({ x: start * TILE, w: (i - start) * TILE });
      } else i++;
    }
    return pits;
  }

  // ---------- Game state ----------
  let state = STATE.START;
  let level = null;
  let player = null;
  let camera = { x: 0, y: 0 };
  let score = 0;
  let coinsGot = 0;
  let lives = START_LIVES;
  let frame = 0;
  let deadTimer = 0;
  let winTimer = 0;
  let floatingTexts = [];
  let particles = [];

  function resetPlayer() {
    const s = level.spawn;
    player = {
      x: s.x,
      y: s.y,
      w: 24,
      h: 30,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
      coyote: 0,
      jumpBuf: 0,
      invuln: 0,
      anim: 0,
      dead: false,
    };
  }

  function startGame() {
    ensureAudio();
    level = buildLevel();
    score = 0;
    coinsGot = 0;
    lives = START_LIVES;
    floatingTexts = [];
    particles = [];
    resetPlayer();
    camera.x = 0;
    state = STATE.PLAY;
    deadTimer = 0;
    winTimer = 0;
  }

  function respawn() {
    resetPlayer();
    player.invuln = INVULN_FRAMES;
    camera.x = Math.max(0, player.x - W * 0.35);
    state = STATE.PLAY;
    deadTimer = 0;
  }

  function addFloat(x, y, text, color) {
    floatingTexts.push({ x, y, text, color: color || "#fff", life: 50, vy: -1.2 });
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < (n || 8); i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4 - 1,
        life: 20 + Math.random() * 20,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  // ---------- Collision helpers ----------
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function solidAt(px, py, pw, ph, ignoreQUsed) {
    const hits = [];
    for (const s of level.solids) {
      if (s.type === "qblock" && s.ref && ignoreQUsed) {
        // still solid even when used
      }
      if (px < s.x + s.w && px + pw > s.x && py < s.y + s.h && py + ph > s.y) {
        hits.push(s);
      }
    }
    return hits;
  }

  // ---------- Update ----------
  function updatePlay() {
    frame++;

    // Pause
    if (pressed("p") || pressed("esc")) {
      state = STATE.PAUSE;
      SFX.pause();
      return;
    }

    const left = held("left") || held("a");
    const right = held("right") || held("d");
    const jumpKey = pressed("up") || pressed("w") || pressed("space");
    const jumpHeld = held("up") || held("w") || held("space");

    if (jumpKey) player.jumpBuf = JUMP_BUFFER;

    // Horizontal
    if (left) {
      player.vx -= MOVE_ACCEL;
      player.facing = -1;
    } else if (right) {
      player.vx += MOVE_ACCEL;
      player.facing = 1;
    } else {
      player.vx *= FRICTION;
      if (Math.abs(player.vx) < 0.05) player.vx = 0;
    }
    player.vx = Math.max(-MOVE_MAX, Math.min(MOVE_MAX, player.vx));

    // Jump
    if (player.onGround) player.coyote = COYOTE_FRAMES;
    else if (player.coyote > 0) player.coyote--;

    if (player.jumpBuf > 0) player.jumpBuf--;

    if (player.jumpBuf > 0 && player.coyote > 0) {
      player.vy = JUMP_V;
      player.onGround = false;
      player.coyote = 0;
      player.jumpBuf = 0;
      SFX.jump();
    }
    // Variable jump height
    if (!jumpHeld && player.vy < -3) {
      player.vy *= 0.55;
    }

    player.vy += GRAVITY;
    if (player.vy > 14) player.vy = 14;

    // Move X
    player.x += player.vx;
    let hits = solidAt(player.x, player.y, player.w, player.h);
    for (const s of hits) {
      if (player.vx > 0) player.x = s.x - player.w;
      else if (player.vx < 0) player.x = s.x + s.w;
      player.vx = 0;
    }
    // World bounds
    if (player.x < 0) { player.x = 0; player.vx = 0; }
    if (player.x + player.w > level.w) { player.x = level.w - player.w; player.vx = 0; }

    // Move Y
    player.y += player.vy;
    player.onGround = false;
    hits = solidAt(player.x, player.y, player.w, player.h);
    for (const s of hits) {
      if (player.vy > 0) {
        player.y = s.y - player.h;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0) {
        player.y = s.y + s.h;
        player.vy = 0;
        // Hit block from below
        hitBlockFromBelow(s);
      }
    }

    // Pit death
    if (player.y > level.h + 40) {
      killPlayer();
      return;
    }

    // Coins
    for (const c of level.coins) {
      if (c.taken) continue;
      c.bob += 0.08;
      if (aabb(player, c)) {
        c.taken = true;
        coinsGot++;
        score += 100;
        SFX.coin();
        addFloat(c.x, c.y, "+100", "#ffd93d");
        burst(c.x + 10, c.y + 10, "#ffd93d", 6);
      }
    }

    // Question block bounce anim
    for (const q of level.qblocks) {
      if (q.bounce > 0) q.bounce--;
    }

    // Enemies
    for (const e of level.enemies) {
      if (!e.alive) {
        if (e.squash > 0) e.squash--;
        continue;
      }
      e.x += e.vx;
      // Turn at edges / walls
      const feetY = e.y + e.h + 1;
      const frontX = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
      const wall = solidAt(frontX, e.y + 4, 2, e.h - 8);
      const groundAhead = solidAt(frontX, feetY, 2, 4);
      if (wall.length || !groundAhead.length) {
        e.vx *= -1;
        e.dir = e.vx < 0 ? -1 : 1;
      }
      // Gravity stick
      const under = solidAt(e.x, e.y + e.h, e.w, 4);
      if (!under.length) {
        e.y += 2;
      } else {
        e.y = under[0].y - e.h;
      }

      if (!aabb(player, e)) continue;
      // Stomp?
      const stomping = player.vy > 0 && player.y + player.h - e.y < 16;
      if (stomping) {
        e.alive = false;
        e.squash = 30;
        player.vy = JUMP_V * 0.55;
        score += 200;
        SFX.stomp();
        addFloat(e.x, e.y, "+200", "#fff");
        burst(e.x + e.w / 2, e.y + e.h / 2, "#8B4513", 10);
      } else if (player.invuln <= 0) {
        killPlayer();
        return;
      }
    }

    if (player.invuln > 0) player.invuln--;
    player.anim++;

    // Flag / goal
    const flag = level.flag;
    const nearFlag =
      player.x + player.w > flag.poleX - 8 &&
      player.x < flag.poleX + 16 &&
      player.y + player.h > flag.y &&
      player.y < flag.y + flag.h;
    if (nearFlag) {
      state = STATE.WIN;
      winTimer = 0;
      score += 1000 + lives * 500;
      SFX.win();
      addFloat(player.x, player.y - 20, "过关！", "#ffd93d");
    }

    // Camera
    const target = player.x - W * 0.35;
    camera.x += (target - camera.x) * 0.12;
    if (camera.x < 0) camera.x = 0;
    if (camera.x > level.w - W) camera.x = Math.max(0, level.w - W);

    updateFx();
  }

  function hitBlockFromBelow(s) {
    if (s.type === "qblock" && s.ref && !s.ref.used) {
      s.ref.used = true;
      s.ref.bounce = 10;
      coinsGot++;
      score += 200;
      SFX.coin();
      addFloat(s.x, s.y - 20, "+200", "#ffd93d");
      burst(s.x + 16, s.y, "#ffd93d", 8);
      // Spawn rising coin visual via particle
      particles.push({
        x: s.x + 10, y: s.y - 10,
        vx: 0, vy: -3, life: 30, color: "#ffd93d", size: 8, coin: true,
      });
    } else if (s.type === "brick" || s.type === "qblock") {
      SFX.block();
      if (s.type === "qblock" && s.ref) s.ref.bounce = 8;
    }
  }

  function killPlayer() {
    if (player.dead) return;
    player.dead = true;
    lives--;
    SFX.die();
    burst(player.x + player.w / 2, player.y + player.h / 2, "#e74c3c", 14);
    state = STATE.DEAD;
    deadTimer = 90;
  }

  function updateDead() {
    if (deadTimer === 90) player.vy = -9;
    deadTimer--;
    player.vy += GRAVITY * 0.45;
    player.y += player.vy;
    updateFx();
    if (deadTimer <= 0) {
      if (lives <= 0) {
        state = STATE.OVER;
      } else {
        respawn();
      }
    }
  }

  function updateFx() {
    for (const t of floatingTexts) {
      t.y += t.vy;
      t.life--;
    }
    floatingTexts = floatingTexts.filter((t) => t.life > 0);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life--;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function updatePause() {
    if (pressed("p") || pressed("esc") || pressed("space") || pressed("enter")) {
      state = STATE.PLAY;
      SFX.pause();
    }
  }

  function updateStart() {
    if (pressed("space") || pressed("enter") || pressed("up") || pressed("w")) {
      startGame();
    }
  }

  function updateWinOver() {
    winTimer++;
    updateFx();
    if (pressed("space") || pressed("enter") || pressed("r")) {
      startGame();
    }
  }

  // ---------- Draw ----------
  function draw() {
    ctx.clearRect(0, 0, W, H);

    if (state === STATE.START) {
      drawStart();
      return;
    }

    drawWorld();
    drawHUD();

    if (state === STATE.PAUSE) drawOverlay("暂停", "按 P / Esc / 空格 / 点「跳」继续");
    if (state === STATE.WIN) drawOverlay("过关成功！", `得分 ${score}　按空格或点「跳」再玩`);
    if (state === STATE.OVER) drawOverlay("游戏结束", `得分 ${score}　按空格或点「跳」重开`);
  }

  function drawStart() {
    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#5c94fc");
    g.addColorStop(1, "#87ceeb");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Decorative hills
    drawHill(150, H - 40, 90, false);
    drawHill(400, H - 40, 120, false);
    drawHill(650, H - 40, 100, false);
    ctx.fillStyle = "#5a9e3c";
    ctx.fillRect(0, H - 48, W, 48);
    ctx.fillStyle = "#6bb340";
    ctx.fillRect(0, H - 48, W, 8);

    // Title card
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(180, 90, 440, 220, 12);
    ctx.fill();

    ctx.fillStyle = "#ffd93d";
    ctx.font = "bold 42px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("水管工大冒险", W / 2, 160);
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#ecf0f1";
    ctx.fillText("Pipe Jump", W / 2, 190);

    // Mini plumber icon
    drawPlumber(W / 2 - 12, 210, 1, 0, false);

    ctx.fillStyle = "#fff";
    ctx.font = "18px sans-serif";
    const blink = Math.floor(Date.now() / 400) % 2 === 0;
    if (blink) ctx.fillText("按 空格 / 点击 / 点「跳」开始", W / 2, 280);

    ctx.font = "13px sans-serif";
    ctx.fillStyle = "#bdc3c7";
    ctx.fillText("收集金币 · 踩扁怪物 · 抵达终点旗帜", W / 2, 360);
    ctx.fillText("键盘或屏幕按钮均可操作", W / 2, 385);
  }

  function drawWorld() {
    const cam = Math.floor(camera.x);

    // Sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#5c94fc");
    g.addColorStop(0.7, "#7eb6ff");
    g.addColorStop(1, "#a0d0ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Parallax clouds
    for (const c of level.clouds) {
      drawCloud(c.x - cam * 0.4, c.y, c.s);
    }

    // Hills
    for (const h of level.hills) {
      drawHill(h.x - cam * 0.6, h.y, h.r, true);
    }

    // Bushes
    for (const b of level.bushes) {
      drawBush(b.x - cam, b.y);
    }

    // Solids
    for (const s of level.solids) {
      const sx = s.x - cam;
      if (sx + s.w < -TILE || sx > W + TILE) continue;
      if (s.type === "ground") drawGround(sx, s.y, s.w, s.h);
      else if (s.type === "brick") drawBrick(sx, s.y);
      else if (s.type === "pipe") drawPipeTile(sx, s.y, s);
      else if (s.type === "qblock") {
        const q = s.ref;
        const by = s.y - (q && q.bounce > 0 ? (10 - Math.abs(q.bounce - 5)) : 0);
        drawQBlock(sx, by, q && q.used);
      }
    }

    // Flag
    drawFlag(level.flag.poleX - cam, level.flag.y, level.flag.h);

    // Coins
    for (const c of level.coins) {
      if (c.taken) continue;
      const cy = c.y + Math.sin(c.bob) * 3;
      drawCoin(c.x - cam, cy, c.w);
    }

    // Enemies
    for (const e of level.enemies) {
      if (!e.alive && e.squash <= 0) continue;
      drawEnemy(e.x - cam, e.y, e);
    }

    // Player
    if (state !== STATE.DEAD || deadTimer > 30) {
      const blink = player.invuln > 0 && Math.floor(player.invuln / 4) % 2 === 0;
      if (!blink) {
        drawPlumber(player.x - cam, player.y, player.facing, player.anim, !player.onGround);
      }
    } else {
      // death flip
      drawPlumber(player.x - cam, player.y, player.facing, 0, true);
    }

    // Particles & floats
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life / 15);
      if (p.coin) {
        drawCoin(p.x - cam, p.y, p.size + 4);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - cam, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }
    for (const t of floatingTexts) {
      ctx.globalAlpha = Math.min(1, t.life / 20);
      ctx.fillStyle = t.color;
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t.text, t.x - cam, t.y);
      ctx.globalAlpha = 1;
    }
  }

  function drawHUD() {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, 36);

    ctx.textAlign = "left";
    ctx.font = "bold 16px monospace";
    ctx.fillStyle = "#fff";
    ctx.fillText(`分数 ${String(score).padStart(6, "0")}`, 16, 24);

    ctx.fillStyle = "#ffd93d";
    ctx.fillText(`● × ${coinsGot}`, 200, 24);

    ctx.fillStyle = "#ff6b6b";
    ctx.fillText(`命 × ${lives}`, 320, 24);

    ctx.fillStyle = "#ecf0f1";
    ctx.textAlign = "right";
    ctx.font = "13px sans-serif";
    ctx.fillText("水管工大冒险", W - 16, 22);
  }

  function drawOverlay(title, sub) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffd93d";
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, W / 2, H / 2 - 20);
    ctx.fillStyle = "#fff";
    ctx.font = "18px sans-serif";
    ctx.fillText(sub, W / 2, H / 2 + 24);
  }

  // ---------- Sprites (shapes) ----------
  function drawPlumber(x, y, facing, anim, inAir) {
    const walk = !inAir && Math.abs(player?.vx || 0) > 0.3;
    const leg = walk ? Math.sin(anim * 0.4) * 3 : 0;

    ctx.save();
    ctx.translate(x + 12, y);
    ctx.scale(facing, 1);
    ctx.translate(-12, 0);

    // Cap
    ctx.fillStyle = "#27ae60";
    ctx.fillRect(4, 0, 16, 6);
    ctx.fillRect(2, 4, 20, 4);
    // Head
    ctx.fillStyle = "#f5cba7";
    ctx.fillRect(6, 8, 14, 10);
    // Eye
    ctx.fillStyle = "#2c3e50";
    ctx.fillRect(14, 10, 3, 3);
    // Mustache / smile
    ctx.fillStyle = "#6d4c41";
    ctx.fillRect(12, 14, 8, 2);
    // Body overalls
    ctx.fillStyle = "#2980b9";
    ctx.fillRect(4, 18, 16, 10);
    // Strap
    ctx.fillStyle = "#f1c40f";
    ctx.fillRect(6, 18, 3, 6);
    ctx.fillRect(15, 18, 3, 6);
    // Arms
    ctx.fillStyle = "#f5cba7";
    ctx.fillRect(0, 18, 4, 8);
    ctx.fillRect(20, 18, 4, 8);
    // Legs
    ctx.fillStyle = "#1a5276";
    ctx.fillRect(6, 28 + Math.min(0, leg), 5, 4 - Math.min(0, leg));
    ctx.fillRect(14, 28 - Math.min(0, leg), 5, 4 + Math.min(0, leg));
    // Boots
    ctx.fillStyle = "#6d4c41";
    ctx.fillRect(5, 30, 7, 2);
    ctx.fillRect(13, 30, 7, 2);

    ctx.restore();
  }

  function drawEnemy(x, y, e) {
    if (!e.alive) {
      // Squashed
      ctx.fillStyle = "#8B4513";
      ctx.fillRect(x, y + 18, e.w, 10);
      ctx.fillStyle = "#5d3a1a";
      ctx.fillRect(x + 4, y + 20, 6, 4);
      ctx.fillRect(x + 18, y + 20, 6, 4);
      return;
    }
    const bob = Math.sin(frame * 0.15 + x) * 1;
    // Body
    ctx.fillStyle = "#a0522d";
    ctx.beginPath();
    ctx.ellipse(x + e.w / 2, y + e.h / 2 + bob, 13, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Cap shade
    ctx.fillStyle = "#6b3a1f";
    ctx.beginPath();
    ctx.ellipse(x + e.w / 2, y + 10 + bob, 13, 6, 0, Math.PI, 0);
    ctx.fill();
    // Eyes
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 6, y + 10 + bob, 6, 7);
    ctx.fillRect(x + 16, y + 10 + bob, 6, 7);
    ctx.fillStyle = "#111";
    const look = e.dir < 0 ? 0 : 2;
    ctx.fillRect(x + 7 + look, y + 12 + bob, 3, 4);
    ctx.fillRect(x + 17 + look, y + 12 + bob, 3, 4);
    // Feet
    ctx.fillStyle = "#3e2723";
    ctx.fillRect(x + 2, y + 24, 10, 5);
    ctx.fillRect(x + 16, y + 24, 10, 5);
  }

  function drawCoin(x, y, size) {
    const s = size || 20;
    ctx.fillStyle = "#f1c40f";
    ctx.beginPath();
    ctx.ellipse(x + s / 2, y + s / 2, s / 2, s / 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f9e79f";
    ctx.beginPath();
    ctx.ellipse(x + s / 2 - 1, y + s / 2 - 1, s / 4, s / 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d4ac0d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x + s / 2, y + s / 2, s / 2, s / 2.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawGround(x, y, w, h) {
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#27ae60";
    ctx.fillRect(x, y, w, 8);
    // Dirt pattern
    ctx.fillStyle = "#a93226";
    ctx.fillRect(x + 4, y + 14, 6, 6);
    ctx.fillRect(x + 18, y + 20, 8, 5);
    ctx.fillStyle = "#1e8449";
    ctx.fillRect(x, y + 6, w, 2);
  }

  function drawBrick(x, y) {
    ctx.fillStyle = "#d35400";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = "#a04000";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.beginPath();
    ctx.moveTo(x, y + 16);
    ctx.lineTo(x + TILE, y + 16);
    ctx.moveTo(x + 16, y);
    ctx.lineTo(x + 16, y + 16);
    ctx.moveTo(x + 8, y + 16);
    ctx.lineTo(x + 8, y + TILE);
    ctx.moveTo(x + 24, y + 16);
    ctx.lineTo(x + 24, y + TILE);
    ctx.stroke();
  }

  function drawQBlock(x, y, used) {
    if (used) {
      ctx.fillStyle = "#7f8c8d";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = "#5d6d7e";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
      return;
    }
    ctx.fillStyle = "#f39c12";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "#e67e22";
    ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    const pulse = 0.7 + Math.sin(frame * 0.15) * 0.3;
    ctx.globalAlpha = pulse;
    ctx.fillText("?", x + 16, y + 24);
    ctx.globalAlpha = 1;
    // Rivets
    ctx.fillStyle = "#d68910";
    [[4, 4], [TILE - 8, 4], [4, TILE - 8], [TILE - 8, TILE - 8]].forEach(([rx, ry]) => {
      ctx.fillRect(x + rx, y + ry, 4, 4);
    });
  }

  function drawPipeTile(x, y, s) {
    // Only draw from the left tile of a pipe pair to avoid double-draw seams
    const leftNeighbor = level.solids.find(
      (o) => o.type === "pipe" && o.x === s.x - TILE && o.y === s.y
    );
    if (leftNeighbor) return; // right half drawn by left tile

    const rightSibling = level.solids.find(
      (o) => o.type === "pipe" && o.x === s.x + TILE && o.y === s.y
    );
    const pipeW = rightSibling ? TILE * 2 : TILE;
    const above = level.solids.find(
      (o) => o.type === "pipe" && o.x === s.x && o.y === s.y - TILE
    );
    const isTop = !above;
    if (isTop) {
      ctx.fillStyle = "#145a32";
      ctx.fillRect(x - 4, y, pipeW + 8, 16);
      ctx.fillStyle = "#27ae60";
      ctx.fillRect(x - 2, y + 2, pipeW + 4, 12);
      ctx.fillStyle = "#1e8449";
      ctx.fillRect(x, y + 14, pipeW, TILE - 14);
      ctx.fillStyle = "#2ecc71";
      ctx.fillRect(x + 4, y + 16, 8, TILE - 16);
      ctx.fillStyle = "#0e3d22";
      ctx.fillRect(x + pipeW - 10, y + 16, 6, TILE - 16);
    } else {
      ctx.fillStyle = "#1e8449";
      ctx.fillRect(x, y, pipeW, TILE);
      ctx.fillStyle = "#2ecc71";
      ctx.fillRect(x + 4, y, 8, TILE);
      ctx.fillStyle = "#0e3d22";
      ctx.fillRect(x + pipeW - 10, y, 6, TILE);
    }
  }

  function drawFlag(x, y, h) {
    // Pole
    ctx.fillStyle = "#bdc3c7";
    ctx.fillRect(x, y, 4, h);
    ctx.fillStyle = "#f1c40f";
    ctx.beginPath();
    ctx.arc(x + 2, y, 5, 0, Math.PI * 2);
    ctx.fill();
    // Flag cloth
    const wave = Math.sin(frame * 0.1) * 3;
    ctx.fillStyle = "#e74c3c";
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 8);
    ctx.lineTo(x + 36 + wave, y + 18);
    ctx.lineTo(x + 4, y + 28);
    ctx.closePath();
    ctx.fill();
    // Castle-ish block at base
    ctx.fillStyle = "#7f8c8d";
    ctx.fillRect(x - 20, y + h - TILE, 48, TILE);
    ctx.fillStyle = "#95a5a6";
    ctx.fillRect(x - 16, y + h - TILE + 8, 12, 16);
    ctx.fillRect(x + 8, y + h - TILE + 8, 12, 16);
  }

  function drawCloud(x, y, s) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    const r = 18 * s;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 1.1, y - r * 0.3, r * 0.85, 0, Math.PI * 2);
    ctx.arc(x + r * 2.1, y, r * 0.95, 0, Math.PI * 2);
    ctx.arc(x + r * 1.0, y + r * 0.35, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHill(x, y, r, clip) {
    ctx.fillStyle = "#2d8a3e";
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#3da34f";
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.1, r * 0.55, Math.PI, 0);
    ctx.fill();
  }

  function drawBush(x, y) {
    ctx.fillStyle = "#229954";
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.arc(x + 18, y - 4, 18, 0, Math.PI * 2);
    ctx.arc(x + 36, y, 15, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Loop ----------
  function tick() {
    switch (state) {
      case STATE.START:
        updateStart();
        break;
      case STATE.PLAY:
        updatePlay();
        break;
      case STATE.PAUSE:
        updatePause();
        break;
      case STATE.DEAD:
        updateDead();
        break;
      case STATE.WIN:
      case STATE.OVER:
        updateWinOver();
        break;
    }
    draw();
    clearJust();
    requestAnimationFrame(tick);
  }

  // Boot
  drawStart();
  requestAnimationFrame(tick);
})();
