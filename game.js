'use strict';

// ========== DOM REFERENCES ==========
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('gameContainer');
const flashOverlay = document.getElementById('flashOverlay');
const uiMap = {
    start: document.getElementById('startScreen'),
    gameOver: document.getElementById('gameOverScreen'),
    scoreBoard: document.getElementById('scoreBoard'),
    scoreVal: document.getElementById('scoreVal'),
    waveLabel: document.getElementById('waveLabel'),
    waveVal: document.getElementById('waveVal'),
    finalScore: document.getElementById('finalScore'),
    finalWaveLabel: document.getElementById('finalWaveLabel'),
    finalWave: document.getElementById('finalWave'),
    modeNormalBtn: document.getElementById('modeNormalBtn'),
    modeInfiniteBtn: document.getElementById('modeInfiniteBtn'),
    restartBtn: document.getElementById('restartBtn'),
    waveAnnounce: document.getElementById('waveAnnounce'),
    hunterStatus: document.getElementById('hunterStatus'),
    startHint: document.getElementById('startHint'),
    timerLine: document.getElementById('timerLine'),
    timerVal: document.getElementById('timerVal'),
    finalTime: document.getElementById('finalTime'),
    finalTimeLabel: document.getElementById('finalTimeLabel')
};
const mobileControls = document.getElementById('mobileControls');
const hunterToggle = document.getElementById('hunterToggle');
const virtualKeyboard = document.getElementById('virtualKeyboard');

// ========== GAME CONSTANTS ==========
const GAME_WIDTH = 1200;
const GAME_HEIGHT = 800;
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

// Gameplay tuning
const MOBILE_BREAKPOINT = 800;
const WAVE_BASE_ENEMIES = 4;
const WAVE_ENEMY_MULTIPLIER = 1.5;
const WAVE_COOLDOWN_FRAMES = 180;
const SPAWN_RATE_MIN_NORMAL = 40;
const SPAWN_RATE_BASE_NORMAL = 100;
const SPAWN_RATE_MIN_INFINITE = 20;
const SPAWN_RATE_BASE_INFINITE = 80;
const BONUS_SPAWN_CHANCE = 0.015;
const DEBRIS_SPAWN_CHANCE = 0.35;
const INFINITE_LEVEL_INTERVAL = 1200;

// Scoring
const SCORE_DEBRIS = 50;
const SCORE_ENEMY_PER_CHAR = 100;
const SCORE_BONUS_KILL = 5000;

// Physics / timing
const MAX_FRAME_DT = 100;
const FRAME_REFERENCE = 16.67;
const SHAKE_DURATION_MS = 50;
const GAME_OVER_SHOW_DELAY_MS = 3000;
const RESIZE_DEBOUNCE_MS = 100;

canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

// ========== LOOP CONTROL ==========
let animationFrameId = null;
let lastTime = 0;
let spawnTimer = 0;
let isMobile = false;
let shiftActive = false;
let textSizeMultiplier = 1.0;
let textSizeInitialized = false;

// Text size control DOM refs
const textSizeValueEl = document.getElementById('textSizeValue');
const textSizeUpBtn = document.getElementById('textSizeUp');
const textSizeDownBtn = document.getElementById('textSizeDown');

/** Debounced resize handler to prevent excessive reflows */
let resizeTimeout = null;
function resizeGame() {
    isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

    // Set default text size multiplier for mobile on first load only
    if (!textSizeInitialized) {
        textSizeInitialized = true;
        if (isMobile) {
            textSizeMultiplier = 1.4;
            updateTextSizeDisplay();
        }
    }

    if (isMobile) {
        gameContainer.style.width = '100vw';
        gameContainer.style.height = '';
        mobileControls.style.display = 'flex';
        uiMap.startHint.innerHTML = "<span style='color:#0ff'>TAP DEBRIS</span> TO DESTROY<br><span style='color:#FFD700'>TAP BUTTON</span> FOR HUNTER MODE";
    } else {
        const scale = Math.min(
            (window.innerWidth * 0.9) / GAME_WIDTH,
            (window.innerHeight * 0.9) / GAME_HEIGHT
        );
        gameContainer.style.width = `${GAME_WIDTH * scale}px`;
        gameContainer.style.height = `${GAME_HEIGHT * scale}px`;
        mobileControls.style.display = 'none';
        uiMap.startHint.innerHTML = "[SPACEBAR] TO TOGGLE HUNTER MODE";
    }
    if (player) player.updatePosition();
}
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resizeGame, RESIZE_DEBOUNCE_MS);
});
setTimeout(resizeGame, RESIZE_DEBOUNCE_MS);

// --- VIRTUAL KEYBOARD ---
const KEYS_QWERTY = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

function createKeyboard() {
    virtualKeyboard.innerHTML = '';
    KEYS_QWERTY.forEach((rowStr, rIdx) => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'kb-row';
        if (rIdx === 1) rowDiv.style.padding = '0 5%';
        // Removed padding for rIdx === 2 to allow full width

        const chars = rowStr.split('');
        if (rIdx === 2) {
            const shiftKey = document.createElement('div');
            shiftKey.className = 'kb-key';
            shiftKey.innerHTML = '⇧';
            shiftKey.id = 'key-shift';
            shiftKey.style.flex = '1.5';
            shiftKey.addEventListener('touchstart', (e) => { e.preventDefault(); toggleShift(); });
            rowDiv.appendChild(shiftKey);
        }

        chars.forEach(char => {
            const keyDiv = document.createElement('div');
            keyDiv.className = 'kb-key';
            keyDiv.dataset.char = char;
            keyDiv.innerText = char.toLowerCase();
            keyDiv.addEventListener('touchstart', (e) => {
                e.preventDefault();
                keyDiv.classList.add('pressed');
                setTimeout(() => keyDiv.classList.remove('pressed'), 100);
                handleVirtualInput(shiftActive ? char.toUpperCase() : char.toLowerCase());
                if (navigator.vibrate) navigator.vibrate(5);
            });
            rowDiv.appendChild(keyDiv);
        });

        if (rIdx === 2) {
            const spacer = document.createElement('div');
            spacer.className = 'kb-key';
            spacer.style.visibility = 'hidden';
            spacer.style.flex = '1.5';
            rowDiv.appendChild(spacer);
        }
        virtualKeyboard.appendChild(rowDiv);
    });
}
createKeyboard();

/** Cached list of all keyboard key elements for shift toggling */
const allKeyElements = () => document.querySelectorAll('.kb-key[data-char]');
let cachedKeys = null;

function toggleShift() {
    shiftActive = !shiftActive;
    const shiftBtn = document.getElementById('key-shift');
    if (shiftActive) {
        shiftBtn.classList.add('shift-active');
    } else {
        shiftBtn.classList.remove('shift-active');
    }
    if (!cachedKeys) cachedKeys = allKeyElements();
    cachedKeys.forEach(k => {
        k.innerText = shiftActive ? k.dataset.char.toUpperCase() : k.dataset.char.toLowerCase();
    });
}

// --- INPUTS ---
hunterToggle.addEventListener('touchstart', (e) => {
    e.preventDefault(); if (!gameActive) return; toggleHunterMode();
});

canvas.addEventListener('touchstart', (e) => {
    if (!gameActive) return;
    if (e.cancelable) e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        handleCanvasTouch(t.clientX, t.clientY);
    }
}, { passive: false });

function handleCanvasTouch(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const gameX = (clientX - rect.left) * scaleX;
    const gameY = (clientY - rect.top) * scaleY;
    const touchRadius = 60;

    for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        const dx = gameX - d.x; const dy = gameY - d.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < (d.radius + touchRadius)) {
            d.pendingDeath = true;
            d.pendingDeathTimer = 0;
            d.pointsEarned = 50;
            player.shoot(d);
            score += 50; scoreUpdate();
            if (navigator.vibrate) navigator.vibrate(10);
            return;
        }
    }
}

function toggleHunterMode() {
    if (hunterMode) {
        hunterMode = false;
        uiMap.hunterStatus.innerText = "SYSTEM: NORMAL"; uiMap.hunterStatus.style.color = "#666";
        if (isMobile) hunterToggle.classList.remove('active');
        activeTarget = null;
    } else {
        const bonuses = enemies.filter(en => en.isBonus && !en.markedForDeletion && !en.isDying);
        if (bonuses.length > 0) {
            hunterMode = true;
            uiMap.hunterStatus.innerText = "SYSTEM: HUNTER MODE ENGAGED"; uiMap.hunterStatus.style.color = "#FFD700";
            if (isMobile) hunterToggle.classList.add('active');
            activeTarget = bonuses[0];
            audio.playTone(1200, 'square', 0.2, 0.2);
        } else {
            audio.error();
            gameContainer.style.borderColor = "red";
            setTimeout(() => gameContainer.style.borderColor = "rgba(0, 255, 255, 0.2)", 200);
        }
    }
}

// ========== ASSETS ==========
const CHAR_POOL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DEBRIS_POOL = '0123456789!@#$%^&*()';
let CHAR_WIDTH = 0;

const COLORS = {
    player: '#00ffff',
    bullet: '#ff00ff',
    enemy: '#ff3333',
    bonus: '#FFD700',
    debris: '#FF8800',
    particle: '#ffffff',
    textTyped: '#00ff00',
    textUntyped: '#ffffff',
    lockOn: '#ffff00'
};

// ========== AUDIO ENGINE ==========
/** Synthesized audio engine using Web Audio API */
class SoundSynthesis {
    constructor() {
        this.ctx = null;
        this.musicInterval = null;
        this.isMuted = false;
    }

    init() {
        try {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        } catch (e) {
            console.error('Audio init failed', e);
        }
    }

    playTone(freq, type, duration, vol = 0.1) {
        if (!this.ctx || this.isMuted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
        // Prevent memory leaks by disconnecting finished nodes
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    playNoise(duration, vol = 0.2) {
        if (!this.ctx || this.isMuted) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
        // Prevent memory leaks by disconnecting finished nodes
        noise.onended = () => { noise.disconnect(); gain.disconnect(); };
    }

    shoot() {
        this.playTone(880, 'triangle', 0.1, 0.1);
        this.playTone(1760, 'sawtooth', 0.05, 0.05);
    }

    hit() { this.playTone(440, 'square', 0.1, 0.1); }

    explode() {
        this.playNoise(0.5, 0.3);
        this.playTone(100, 'sawtooth', 0.5, 0.2);
    }

    waveClear() {
        this.playTone(440, 'sine', 0.5, 0.1);
        setTimeout(() => this.playTone(554, 'sine', 0.5, 0.1), 100);
        setTimeout(() => this.playTone(659, 'sine', 0.5, 0.1), 200);
    }

    error() {
        if (!this.ctx || this.isMuted) return;
        this.playTone(150, 'sawtooth', 0.15, 0.2);
        setTimeout(() => this.playTone(100, 'sawtooth', 0.15, 0.2), 50);
    }

    bonusSpawn() {
        if (!this.ctx || this.isMuted) return;
        this.playTone(600, 'sine', 0.1, 0.1);
        setTimeout(() => this.playTone(1200, 'sine', 0.3, 0.1), 100);
    }

    debrisExplode() {
        this.playNoise(0.15, 0.15);
        this.playTone(200, 'sawtooth', 0.15, 0.1);
    }

    catastrophicEnding(intensity) {
        if (!this.ctx || this.isMuted) return;
        this.playNoise(1.0, 0.5);
        this.playTone(100, 'sawtooth', 3.0, 0.5);
    }

    startMusic() {
        if (!this.ctx || this.isMuted) return;
        this.stopMusic();
        const notes = [110, 110, 130.81, 110, 146.83, 110, 130.81, 98];
        let noteIdx = 0;
        this.musicInterval = setInterval(() => {
            this.playTone(notes[noteIdx], 'sawtooth', 0.2, 0.05);
            noteIdx = (noteIdx + 1) % notes.length;
        }, 250);
    }

    stopMusic() {
        if (this.musicInterval) {
            clearInterval(this.musicInterval);
            this.musicInterval = null;
        }
    }
}
const audio = new SoundSynthesis();

/**
 * Efficiently removes items marked for deletion using swap-and-truncate (O(n)).
 * Replaces the old splice-based approach which was O(n²) worst case.
 */
function cleanArray(arr) {
    let writeIdx = 0;
    for (let i = 0; i < arr.length; i++) {
        if (!arr[i].markedForDeletion) {
            arr[writeIdx++] = arr[i];
        }
    }
    arr.length = writeIdx;
}

// ========== GAME STATE ==========
let gameActive = false;
let score = 0;
let frames = 0;
let activeTarget = null;
let hunterMode = false;
let currentMode = 'NORMAL';
let wave = 1;
let enemiesToSpawn = 0;
let waveInProgress = false;
let waveCooldown = 0;
let infiniteDifficultyLevel = 1;
let gameStartTime = 0;
let elapsedTime = 0;
let player;
let bullets = [];
let enemies = [];
let debris = [];
let particles = [];
let shockwaves = [];
let floatingTexts = [];
let drawList = [];

// ========== GAME ENTITIES ==========
/** The player ship, always at the bottom of the screen */
class Player {
    constructor() {
        this.x = GAME_WIDTH / 2;
        this.y = GAME_HEIGHT - 80;
        this.radius = 20;
        this.color = COLORS.player;
        this.angle = -HALF_PI;
        this.visible = true;
        this.updatePosition();
    }

    updatePosition() {
        this.y = isMobile ? GAME_HEIGHT - 120 : GAME_HEIGHT - 80;
    }

    update(dt) {
        let targetAngle = -HALF_PI;
        if (activeTarget && !activeTarget.markedForDeletion) {
            const dx = activeTarget.x - this.x;
            const dy = activeTarget.y - this.y;
            targetAngle = Math.atan2(dy, dx);
        }
        this.angle = this.lerpAngle(this.angle, targetAngle, 0.2 * dt);
    }

    lerpAngle(a, b, t) {
        const diff = b - a;
        let d = diff % TWO_PI;
        if (d > Math.PI) d -= TWO_PI;
        if (d < -Math.PI) d += TWO_PI;
        return a + d * Math.min(t, 1.0);
    }

    draw() {
        if (!this.visible) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle + HALF_PI);
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.moveTo(0, -25);
        ctx.lineTo(15, 15);
        ctx.lineTo(0, 5);
        ctx.lineTo(-15, 15);
        ctx.closePath();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
        ctx.fill();
        ctx.restore();
    }

    shoot(target) {
        bullets.push(new Bullet(this.x, this.y, target));
        if (target && target.pendingBullets !== undefined) target.pendingBullets++;
        createMiniParticles(
            this.x + Math.cos(this.angle) * 25,
            this.y + Math.sin(this.angle) * 25,
            5, '#0ff', 4
        );
        audio.shoot();
    }
}

// ========== PARALLAX BACKGROUND METEORITES ==========
class BackgroundStar {
    constructor() {
        this.x = Math.random() * GAME_WIDTH;
        this.y = Math.random() * GAME_HEIGHT;
        this.speed = Math.random() * 0.5 + 0.1;
        this.size = Math.random() * 2 + 0.5;
        this.alpha = Math.random() * 0.15 + 0.05;
        this.drift = (Math.random() - 0.5) * 0.15;
        // Subtle warm/cool color variation
        const hue = Math.random() < 0.3 ? 30 : (Math.random() < 0.5 ? 200 : 0);
        const sat = Math.floor(Math.random() * 20 + 10);
        this.color = `hsl(${hue}, ${sat}%, 70%)`;
    }
    update(dt) {
        this.y += this.speed * dt;
        this.x += this.drift * dt;
        if (this.y > GAME_HEIGHT + 10) { this.y = -10; this.x = Math.random() * GAME_WIDTH; }
        if (this.x < -10) this.x = GAME_WIDTH + 10;
        if (this.x > GAME_WIDTH + 10) this.x = -10;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
    }
}
const bgStars = [];
for (let i = 0; i < 40; i++) bgStars.push(new BackgroundStar());

/** Orphan rings that persist after bullet dies */
const orphanRings = [];

/** Draw an array of hollow oval rings */
function drawRings(rings) {
    for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        ctx.save();
        ctx.globalAlpha = ring.alpha;
        ctx.strokeStyle = 'rgba(210, 255, 255, 0.9)';
        ctx.lineWidth = 1;
        ctx.translate(ring.x, ring.y);
        ctx.rotate(ring.angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, ring.r * 0.4, ring.r, 0, 0, TWO_PI);
        ctx.stroke();
        ctx.restore();
    }
}

/** Homing bullet that tracks its target, with hollow ring exhaust */
class Bullet {
    constructor(x, y, target) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.radius = 4;
        this.speed = 25;
        this.markedForDeletion = false;
        const destX = target ? target.x : x;
        const destY = target ? target.y : y - 100;
        const dx = destX - x;
        const dy = destY - y;
        const dist = Math.hypot(dx, dy) || 1;
        this.vx = (dx / dist) * this.speed;
        this.vy = (dy / dist) * this.speed;
        // Hollow ring exhaust
        this.rings = [];
        this.ringTimer = 0;
    }

    update(dt) {
        // Spawn a ring every ~2 frames
        this.ringTimer += dt;
        if (this.ringTimer >= 2) {
            const perpAngle = Math.atan2(this.vy, this.vx) + HALF_PI;
            const side = Math.random() < 0.5 ? 1 : -1;
            const driftSpeed = (Math.random() * 0.6 + 0.3) * side;
            this.rings.push({
                x: this.x,
                y: this.y,
                vx: Math.cos(perpAngle) * driftSpeed,
                vy: Math.sin(perpAngle) * driftSpeed,
                r: 1.5,
                growSpeed: Math.random() * 0.35 + 0.2,
                maxR: Math.random() * 10 + 8,
                alpha: 0.55,
                decay: Math.random() * 0.02 + 0.01,
                angle: Math.atan2(this.vy, this.vx)
            });
            this.ringTimer = 0;
        }

        // Update rings
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const ring = this.rings[i];
            ring.x += ring.vx * dt;
            ring.y += ring.vy * dt;
            ring.r = Math.min(ring.r + ring.growSpeed * dt, ring.maxR);
            ring.alpha -= ring.decay * dt;
            if (ring.alpha <= 0) this.rings.splice(i, 1);
        }

        if (this.target && !this.target.markedForDeletion) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                this.vx = (dx / dist) * this.speed;
                this.vy = (dy / dist) * this.speed;
            }
        }
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.x < 0 || this.x > GAME_WIDTH || this.y < 0 || this.y > GAME_HEIGHT) {
            this.markedForDeletion = true;
        }
    }

    draw() {
        const dirAngle = Math.atan2(this.vy, this.vx);

        // Draw hollow oval exhaust (perspective rings)
        drawRings(this.rings);

        // Draw main bullet
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = COLORS.bullet;
        ctx.fillStyle = COLORS.bullet;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
    }
}

class Enemy {
    constructor() {
        this.x = Math.random() * (GAME_WIDTH - 100) + 50; this.y = -100;
        this.text = this.generateText(); this.radius = 20 + (this.text.length - 1) * 8;
        let speedMult = (currentMode === 'NORMAL') ? wave : infiniteDifficultyLevel;
        let baseSpeed = isMobile ? 0.4 : 0.5;
        this.speed = Math.random() * 0.5 + baseSpeed + (speedMult * 0.05);
        this.markedForDeletion = false; this.isDying = false;
        this.pendingDeath = false; this.pendingDeathTimer = 0; this.pointsEarned = 0; this.pendingBullets = 0;
        this.angle = 0; this.sides = Math.floor(Math.random() * 3) + 3;
        this.typedIndex = 0;
        let wiggleChance = 0.05 + (score / 10000); this.canWiggle = Math.random() < Math.min(wiggleChance, 0.25);
        this.wobblePhase = Math.random() * TWO_PI; this.wobbleSpeed = Math.random() * 0.05 + 0.02;
        this.isBonus = false;
    }
    generateText() {
        let difficulty = (currentMode === 'NORMAL') ? wave : infiniteDifficultyLevel;
        let len = 1; if (difficulty > 2) len = 2; if (difficulty > 5) len = 3; if (difficulty > 10) len = 4;
        if (Math.random() < 0.1) len += 1;
        let s = ""; for (let i = 0; i < len; i++) s += CHAR_POOL.charAt(Math.floor(Math.random() * CHAR_POOL.length));
        return s;
    }
    update(dt) {
        // Safety timeout: if bullet never arrives, force visual kill after ~3s
        if (this.pendingDeath && !this.markedForDeletion) {
            this.pendingDeathTimer += dt;
            if (this.pendingDeathTimer > 180) {
                visualKillEnemy(this);
                return;
            }
        }
        if (this.markedForDeletion) return;
        const dx = player.x - this.x; const dy = player.y - this.y; const dist = Math.hypot(dx, dy);
        if (dist > 0) {
            let wobble = 0;
            if (this.canWiggle) { this.wobblePhase += this.wobbleSpeed * dt; wobble = Math.sin(this.wobblePhase) * 1.5; }
            this.x += (dx / dist * this.speed + wobble) * dt; this.y += (dy / dist * this.speed) * dt;
        }
        this.angle += 0.02 * dt;
        if (this.y > GAME_HEIGHT + this.radius) { this.markedForDeletion = true; if (activeTarget === this) activeTarget = null; }
    }
    draw() {
        if (this.markedForDeletion) return;
        ctx.save(); ctx.translate(this.x, this.y);
        if (this === activeTarget) {
            ctx.save(); ctx.rotate(-this.angle); ctx.strokeStyle = COLORS.lockOn; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, this.radius + 15, 0, TWO_PI); ctx.stroke(); ctx.restore();
        }
        ctx.rotate(this.angle); ctx.shadowBlur = 15; ctx.shadowColor = COLORS.enemy; ctx.strokeStyle = COLORS.enemy; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < this.sides; i++) {
            const rot = (i * TWO_PI) / this.sides; const x = Math.cos(rot) * this.radius; const y = Math.sin(rot) * this.radius;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.stroke(); ctx.fillStyle = 'rgba(255, 51, 51, 0.1)'; ctx.fill(); ctx.restore();
        this.drawText(COLORS.textTyped, COLORS.textUntyped);
    }
    drawText(colorTyped, colorUntyped) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.textAlign = "center";
        const fontSize = (24 + (this.radius - 20) / 2) * textSizeMultiplier; ctx.font = `bold ${fontSize}px 'Source Code Pro', monospace`; ctx.textBaseline = "middle";
        const textYOffset = fontSize / 2 + 8; // scales with font size to stay above enemy shape
        const scaleF = fontSize / 24; const charW = CHAR_WIDTH * scaleF; const totalW = this.text.length * charW; const startX = -totalW / 2;
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)"; ctx.beginPath(); ctx.roundRect(startX - 6, -this.radius - textYOffset - fontSize / 2 - 6, totalW + 12, fontSize + 12, 4); ctx.fill();
        let currentX = startX;
        for (let i = 0; i < this.text.length; i++) {
            const char = this.text[i]; ctx.fillStyle = (i < this.typedIndex) ? colorTyped : colorUntyped;
            if (i === this.typedIndex && this === activeTarget) { ctx.shadowBlur = 10; ctx.shadowColor = "#ffff00"; if (this.isBonus) ctx.shadowColor = "#ffffff"; } else { ctx.shadowBlur = 0; }
            ctx.fillText(char, currentX + charW / 2, -this.radius - textYOffset); currentX += charW;
        }
        ctx.restore();
    }
}

class BonusEnemy extends Enemy {
    constructor() {
        super(); this.color = COLORS.bonus; this.isBonus = true;
        this.text = this.generateBonusText(); this.radius = 25 + (this.text.length - 1) * 8;
        this.speed = this.speed * 1.5; this.x = GAME_WIDTH + 50; this.y = Math.random() * (GAME_HEIGHT - 200) + 100;
        this.initialY = this.y; this.time = 0;
    }
    generateBonusText() {
        const len = Math.floor(Math.random() * 6) + 10; let s = ""; for (let i = 0; i < len; i++) s += CHAR_POOL.charAt(Math.floor(Math.random() * CHAR_POOL.length)); return s;
    }
    update(dt) {
        if (this.isDying) return;
        this.x -= this.speed * dt; this.time += dt * 0.05; this.y = this.initialY + Math.sin(this.time) * 100;
        if (this.y < 50) this.y = 50; if (this.y > GAME_HEIGHT - 50) this.y = GAME_HEIGHT - 50;
        this.angle += 0.05 * dt;
        if (this.x < -100) {
            this.markedForDeletion = true;
            if (activeTarget === this) { activeTarget = null; if (hunterMode) toggleHunterMode(); }
        }
    }
    draw() {
        if (this.markedForDeletion) return;
        ctx.save(); ctx.translate(this.x, this.y);
        if (this === activeTarget && hunterMode) {
            ctx.save(); ctx.rotate(-this.angle * 2); ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 4;
            ctx.setLineDash([10, 5]); ctx.beginPath(); ctx.arc(0, 0, this.radius + 25, 0, TWO_PI); ctx.stroke(); ctx.restore();
        }
        ctx.rotate(this.angle); ctx.shadowBlur = 25; ctx.shadowColor = this.color; ctx.strokeStyle = this.color; ctx.lineWidth = 4;
        const sides = 6; ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const rot = (i * TWO_PI) / sides; const x = Math.cos(rot) * this.radius; const y = Math.sin(rot) * this.radius;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.stroke(); ctx.fillStyle = 'rgba(255, 215, 0, 0.2)'; ctx.fill(); ctx.restore();
        if (hunterMode) this.drawText('#00ff00', '#FFD700');
    }
}

class Debris {
    constructor(x, y) {
        this.x = x; this.y = y; this.char = DEBRIS_POOL.charAt(Math.floor(Math.random() * DEBRIS_POOL.length));
        this.radius = 15; this.angle = Math.random() * TWO_PI;
        this.vx = (Math.random() - 0.5) * 6; this.vy = -Math.random() * 3; this.markedForDeletion = false;
        this.pendingDeath = false; this.pendingDeathTimer = 0; this.pointsEarned = 0; this.pendingBullets = 0;
    }
    update(dt) {
        if (this.pendingDeath) {
            // Stop moving, wait for bullet
            if (!this.markedForDeletion) {
                this.pendingDeathTimer += dt;
                if (this.pendingDeathTimer > 180) {
                    visualKillDebris(this);
                }
            }
            return;
        }
        this.x += this.vx * dt; this.y += this.vy * dt; this.vy += 0.05 * dt; this.vy = Math.min(this.vy, 3);
        this.vx *= 0.98; if (this.y > GAME_HEIGHT + 50 || this.x < -50 || this.x > GAME_WIDTH + 50) this.markedForDeletion = true;
    }
    draw() {
        if (this.markedForDeletion) return;
        ctx.save(); ctx.translate(this.x, this.y); ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, TWO_PI); ctx.fill();
        ctx.strokeStyle = COLORS.debris; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = COLORS.debris; ctx.font = `900 ${Math.round(22 * textSizeMultiplier)}px 'Source Code Pro', monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(this.char, 0, 1); ctx.restore();
    }
}

// ========== ENHANCED PARTICLE SYSTEM ==========
/** Particle with varied shapes (circle, square, spark) and trailing effect.
 *  Set mini=true for lightweight shoot/hit sparks (no trail, tiny, fast fade). */
class Particle {
    constructor(x, y, color, speedVal, mini = false) {
        this.x = x; this.y = y; this.color = color;
        this.mini = mini;
        const angle = Math.random() * TWO_PI;
        const speed = Math.random() * speedVal + 0.5;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.markedForDeletion = false;

        if (mini) {
            // Mini sparks: tiny, fast-decaying, no trail
            this.life = 0.8;
            this.decay = Math.random() * 0.04 + 0.03;
            this.shape = 0; // always circle
            this.baseSize = Math.random() * 1.5 + 0.8;
            this.rotation = 0;
            this.rotSpeed = 0;
            this.trail = [];
            this.trailMax = 0;
            this.trailTimer = 0;
        } else {
            // Full explosion particles
            this.life = 1.0;
            this.decay = Math.random() * 0.015 + 0.008;
            this.shape = Math.floor(Math.random() * 3);
            this.baseSize = Math.random() * 4 + 2;
            this.rotation = Math.random() * TWO_PI;
            this.rotSpeed = (Math.random() - 0.5) * 0.15;
            this.trail = [];
            this.trailMax = 5;
            this.trailTimer = 0;
        }
    }
    update(dt) {
        // Store trail position every other frame (skip for mini)
        if (!this.mini) {
            this.trailTimer += dt;
            if (this.trailTimer >= 2) {
                this.trail.push({ x: this.x, y: this.y, life: this.life });
                if (this.trail.length > this.trailMax) this.trail.shift();
                this.trailTimer = 0;
            }
        }
        // Slow drift in space (no gravity)
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 0.995; // very slight friction for space feel
        this.vy *= 0.995;
        this.rotation += this.rotSpeed * dt;
        this.life -= this.decay * dt;
        if (this.life <= 0) this.markedForDeletion = true;
    }
    draw() {
        // Draw trail
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const trailAlpha = (i / this.trail.length) * this.life * 0.4;
            const trailSize = this.baseSize * (i / this.trail.length) * this.life * 0.6;
            ctx.save();
            ctx.globalAlpha = trailAlpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(t.x, t.y, trailSize, 0, TWO_PI);
            ctx.fill();
            ctx.restore();
        }
        // Draw main particle
        const size = this.baseSize * this.life;
        if (size <= 0.1) return;
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = this.color;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        if (this.shape === 0) {
            // Circle
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, TWO_PI);
            ctx.fill();
        } else if (this.shape === 1) {
            // Square
            ctx.fillRect(-size, -size, size * 2, size * 2);
        } else {
            // Spark — elongated in velocity direction
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 2.5, size * 0.5, 0, 0, TWO_PI);
            ctx.fill();
        }
        ctx.restore();
    }
}

/** Expanding shockwave ring effect */
class Shockwave {
    constructor(x, y, color, maxRadius = 80) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = 5;
        this.maxRadius = maxRadius;
        this.life = 1.0;
        this.speed = 4;
        this.lineWidth = 4;
        this.markedForDeletion = false;
    }
    update(dt) {
        this.radius += this.speed * dt;
        this.life = 1.0 - (this.radius / this.maxRadius);
        this.lineWidth = 4 * this.life;
        if (this.life <= 0) this.markedForDeletion = true;
    }
    draw() {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.life * 0.7;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.lineWidth;
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, TWO_PI);
        ctx.stroke();
        ctx.restore();
    }
}

/** Floating score text that drifts upward and fades */
class FloatingText {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 1.0;
        this.decay = 0.012;
        this.vy = -1.5;
        this.markedForDeletion = false;
        this.scale = 0.5;
    }
    update(dt) {
        this.y += this.vy * dt;
        this.life -= this.decay * dt;
        // Pop-in scale effect
        if (this.scale < 1.0) this.scale = Math.min(1.0, this.scale + 0.08 * dt);
        if (this.life <= 0) this.markedForDeletion = true;
    }
    draw() {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.font = `bold ${Math.round(22 * this.scale)}px 'Orbitron', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

// ========== GAME LIFECYCLE ==========
/** Initialize a new game with the given mode ('NORMAL' or 'INFINITE') */
function init(mode) {
    resizeGame();
    audio.init();
    audio.startMusic();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    gameContainer.classList.remove('glitch-active');
    flashOverlay.classList.remove('flash-active');
    flashOverlay.classList.remove('flash-fade');
    ctx.font = "bold 24px 'Source Code Pro', monospace";
    CHAR_WIDTH = ctx.measureText('M').width;

    player = new Player();
    bullets = [];
    enemies = [];
    debris = [];
    particles = [];
    shockwaves = [];
    floatingTexts = [];
    drawList = [];
    score = 0;
    wave = 1;
    frames = 0;
    activeTarget = null;
    hunterMode = false;
    uiMap.hunterStatus.innerText = 'SYSTEM: NORMAL';
    uiMap.hunterStatus.style.color = '#666';
    if (isMobile) hunterToggle.classList.remove('active');
    gameActive = true;
    currentMode = mode;
    infiniteDifficultyLevel = 1;
    lastTime = performance.now();
    spawnTimer = 0;
    waveCooldown = 0;

    if (currentMode === 'NORMAL') {
        uiMap.waveLabel.classList.remove('hidden');
        uiMap.waveVal.classList.remove('hidden');
        uiMap.timerLine.classList.add('hidden');
        startWave();
    } else {
        uiMap.waveLabel.classList.add('hidden');
        uiMap.waveVal.classList.add('hidden');
        uiMap.timerLine.classList.remove('hidden');
        uiMap.timerVal.innerText = '00:00';
        gameStartTime = performance.now();
        elapsedTime = 0;
        uiMap.waveAnnounce.innerText = 'INFINITE MODE';
        uiMap.waveAnnounce.classList.add('show-announce');
        setTimeout(() => uiMap.waveAnnounce.classList.remove('show-announce'), 2000);
    }
    scoreUpdate();
    requestAnimationFrame(loop);
}

function startWave() {
    enemiesToSpawn = WAVE_BASE_ENEMIES + Math.floor(wave * WAVE_ENEMY_MULTIPLIER);
    waveInProgress = true;
    waveCooldown = 0;
    uiMap.waveAnnounce.innerText = 'WAVE ' + wave;
    uiMap.waveAnnounce.style.color = '#0ff';
    uiMap.waveAnnounce.classList.add('show-announce');
    setTimeout(() => uiMap.waveAnnounce.classList.remove('show-announce'), 2000);
    uiMap.waveVal.innerText = wave;
}

function createParticles(x, y, count, color, speed = 5) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color, speed));
    }
}

/** Mini sparks for shooting/typing hits — no trails, tiny, fast fade */
function createMiniParticles(x, y, count, color, speed = 4) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color, speed, true));
    }
}

function spawnManager(dt) {
    spawnTimer += dt;
    let spawnRate = 0;
    if (currentMode === 'NORMAL') {
        if (!waveInProgress || enemiesToSpawn <= 0) return;
        spawnRate = Math.max(SPAWN_RATE_MIN_NORMAL, SPAWN_RATE_BASE_NORMAL - (wave * 3));
    } else {
        infiniteDifficultyLevel = 1 + Math.floor(frames / INFINITE_LEVEL_INTERVAL);
        spawnRate = Math.max(SPAWN_RATE_MIN_INFINITE, SPAWN_RATE_BASE_INFINITE - (infiniteDifficultyLevel * 2));
    }
    if (spawnTimer >= spawnRate) {
        if (Math.random() < BONUS_SPAWN_CHANCE) {
            enemies.push(new BonusEnemy());
            audio.bonusSpawn();
        } else {
            enemies.push(new Enemy());
        }
        if (currentMode === 'NORMAL') enemiesToSpawn--;
        spawnTimer = 0;
    }
}

function spawnDebris(x, y, amount) {
    if (Math.random() > DEBRIS_SPAWN_CHANCE) return;
    for (let i = 0; i < amount; i++) {
        debris.push(new Debris(x, y));
    }
}

function checkWaveStatus(dt) {
    if (currentMode === 'INFINITE') return;
    // Count enemies that are truly alive (not pending death)
    const aliveEnemies = enemies.filter(e => !e.pendingDeath && !e.markedForDeletion).length;
    if (waveInProgress && enemiesToSpawn === 0 && aliveEnemies === 0 && debris.length === 0) {
        waveInProgress = false;
        waveCooldown = WAVE_COOLDOWN_FRAMES;
        uiMap.waveAnnounce.innerText = 'WAVE ' + wave + ' CLEARED';
        uiMap.waveAnnounce.style.color = '#0f0';
        uiMap.waveAnnounce.classList.add('show-announce');
        audio.waveClear();
    }
    if (!waveInProgress && waveCooldown > 0) {
        waveCooldown -= dt;
        if (waveCooldown <= 0) {
            wave++;
            startWave();
        }
    }
}

/** Gameplay kill — immediately removes enemy from play, defers visual explosion to bullet impact */
function killEnemy(enemy) {
    enemy.isDying = true;
    enemy.pendingDeath = true;
    enemy.pendingDeathTimer = 0;

    // Score added immediately so gameplay isn't interrupted
    const textLen = enemy.text.length;
    const pointsEarned = enemy.isBonus ? SCORE_BONUS_KILL : SCORE_ENEMY_PER_CHAR * textLen;
    score += pointsEarned;
    scoreUpdate();
    enemy.pointsEarned = pointsEarned;

    if (activeTarget === enemy) activeTarget = null;
}

/** Visual explosion — called when bullet reaches a pending-death enemy */
function visualKillEnemy(enemy) {
    if (enemy.markedForDeletion) return; // already exploded
    enemy.markedForDeletion = true;

    const textLen = enemy.text.length;
    const bonusMult = enemy.isBonus ? 2 : 1;

    // Capped particle counts for performance
    const baseParticles = Math.min(10 + (textLen * 5), 40) * bonusMult;
    const sparkParticles = Math.min(8 + (textLen * 3), 25) * bonusMult;
    const cyanParticles = Math.min(textLen * 2, 12) * bonusMult;

    // Main colored explosion
    createParticles(enemy.x, enemy.y, baseParticles, enemy.isBonus ? COLORS.bonus : COLORS.enemy, 8 + textLen);
    // White sparkles
    createParticles(enemy.x, enemy.y, sparkParticles, '#fff', 10 + textLen);
    // Cyan accent sparks
    createParticles(enemy.x, enemy.y, cyanParticles, '#0ff', 6);

    // Shockwave ring
    const shockRadius = 60 + (textLen * 15);
    shockwaves.push(new Shockwave(enemy.x, enemy.y, enemy.isBonus ? '#FFD700' : '#ff3333', shockRadius));
    if (enemy.isBonus) {
        shockwaves.push(new Shockwave(enemy.x, enemy.y, '#fff', shockRadius * 1.5));
    }

    shakeScreen(6 + textLen * 2);
    audio.explode();

    // Floating score text
    const scoreColor = enemy.isBonus ? '#FFD700' : '#0ff';
    floatingTexts.push(new FloatingText(enemy.x, enemy.y - enemy.radius - 30, '+' + enemy.pointsEarned, scoreColor));

    const debrisCount = Math.max(1, Math.floor(textLen / 2));
    spawnDebris(enemy.x, enemy.y, debrisCount);
}

/** Visual explosion for debris — scaled-down version of enemy explosion */
function visualKillDebris(d) {
    if (d.markedForDeletion) return;
    d.markedForDeletion = true;
    createParticles(d.x, d.y, 8, COLORS.debris, 3);
    createParticles(d.x, d.y, 5, '#fff', 2);
    shockwaves.push(new Shockwave(d.x, d.y, COLORS.debris, 30));
    shakeScreen(3);
    audio.debrisExplode();
    floatingTexts.push(new FloatingText(d.x, d.y - 20, '+' + d.pointsEarned, COLORS.debris));
}

function triggerGameOver(killerRadius = 20) {
    if (!gameActive) return;
    gameActive = false;
    const intensity = Math.min(1.5, Math.max(0.2, (score / 5000) + ((killerRadius - 20) / 30)));
    audio.catastrophicEnding(intensity);
    audio.stopMusic();
    flashOverlay.classList.add('flash-active');
    setTimeout(() => {
        flashOverlay.classList.remove('flash-active');
        flashOverlay.classList.add('flash-fade');
    }, 100);
    gameContainer.classList.add('glitch-active');
    setTimeout(() => {
        const particleCount = Math.min(500, 100 + (score * 0.2));
        createParticles(player.x, player.y, particleCount, '#00ffff', 10 + (20 * intensity));
        createParticles(player.x, player.y, particleCount / 2, '#ff00ff', 5 + (10 * intensity));
        player.visible = false;
        enemies.forEach(e => createParticles(e.x, e.y, 20, COLORS.enemy, 8));
        debris.forEach(d => createParticles(d.x, d.y, 10, COLORS.debris, 6));
        enemies = [];
        debris = [];
        bullets = [];
        shakeScreen(30 + (100 * intensity));
        setTimeout(() => {
            gameContainer.classList.remove('glitch-active');
            uiMap.gameOver.classList.remove('hidden');
            uiMap.finalScore.innerText = score;
            uiMap.finalWaveLabel.style.display = (currentMode === 'NORMAL') ? 'block' : 'none';
            if (currentMode === 'NORMAL') uiMap.finalWave.innerText = wave;
            if (currentMode === 'INFINITE') {
                uiMap.finalTimeLabel.classList.remove('hidden');
                uiMap.finalTime.innerText = formatTime(elapsedTime);
            } else {
                uiMap.finalTimeLabel.classList.add('hidden');
            }
            uiMap.start.classList.add('hidden');
            uiMap.scoreBoard.classList.add('hidden');
        }, GAME_OVER_SHOW_DELAY_MS);
    }, 200 * intensity);
}

function checkCollisions() {
    bullets.forEach(bullet => {
        if (bullet.target) {
            // Target already exploded — bullet still arrives with impact spark
            if (bullet.target.markedForDeletion) {
                const distSq = (bullet.x - bullet.target.x) ** 2 + (bullet.y - bullet.target.y) ** 2;
                if (distSq < 400) {
                    bullet.markedForDeletion = true;
                    createMiniParticles(bullet.x, bullet.y, 5, COLORS.bullet, 3);
                }
                return;
            }
            const distSq = (bullet.x - bullet.target.x) ** 2 + (bullet.y - bullet.target.y) ** 2;
            if (distSq < 400) {
                bullet.markedForDeletion = true;
                if (bullet.target.pendingDeath) {
                    // Count remaining bullets targeting this enemy (excluding this one)
                    const remaining = bullets.filter(b => !b.markedForDeletion && b.target === bullet.target && b !== bullet).length;
                    if (remaining === 0) {
                        if (bullet.target instanceof Enemy) {
                            visualKillEnemy(bullet.target);
                        } else {
                            visualKillDebris(bullet.target);
                        }
                    } else {
                        // Non-final bullet — impact spark, enemy still waiting
                        createMiniParticles(bullet.x, bullet.y, 5, COLORS.bullet, 3);
                    }
                } else {
                    // Intermediate bullet hit — small impact spark
                    createMiniParticles(bullet.x, bullet.y, 4, COLORS.bullet, 2);
                }
            }
        }
    });
    enemies.forEach(enemy => {
        if (!enemy.markedForDeletion && !enemy.isDying) {
            const distSq = (player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2;
            const radiusSum = player.radius + enemy.radius;
            if (distSq < radiusSum * radiusSum) {
                if (enemy.isBonus) return;
                triggerGameOver(enemy.radius);
            }
        }
    });
    debris.forEach(d => {
        if (!d.markedForDeletion && !d.pendingDeath) {
            const distSq = (player.x - d.x) ** 2 + (player.y - d.y) ** 2;
            const radiusSum = player.radius + d.radius;
            if (distSq < radiusSum * radiusSum) {
                triggerGameOver(d.radius);
                d.markedForDeletion = true;
            }
        }
    });
}

function scoreUpdate() {
    uiMap.scoreVal.innerText = score;
}

/** Format milliseconds as MM:SS */
function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function updateTimer() {
    elapsedTime = performance.now() - gameStartTime;
    uiMap.timerVal.innerText = formatTime(elapsedTime);
}

function shakeScreen(intensity = 5) {
    const offsetX = Math.random() * intensity - intensity / 2;
    const offsetY = Math.random() * intensity - intensity / 2;
    gameContainer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    setTimeout(() => { gameContainer.style.transform = 'translate(0, 0)'; }, SHAKE_DURATION_MS);
}

// ========== MAIN GAME LOOP ==========
function loop(timestamp) {
    animationFrameId = requestAnimationFrame(loop);
    let dt = timestamp - lastTime;
    lastTime = timestamp;
    if (isNaN(dt)) dt = FRAME_REFERENCE;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
    const timeScale = dt / FRAME_REFERENCE;

    // Clear canvas
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Draw parallax background meteorites
    bgStars.forEach(s => { s.update(timeScale); s.draw(); });

    // Update game state
    if (gameActive) {
        player.update(timeScale);
        checkWaveStatus(timeScale);
        spawnManager(timeScale);
        checkCollisions();
        if (currentMode === 'INFINITE') updateTimer();
    }
    player.draw();

    // Update and draw entities
    bullets.forEach(b => b.update(timeScale));
    // Transfer rings from dying bullets to orphan pool before cleanup
    bullets.forEach(b => {
        if (b.markedForDeletion && b.rings.length > 0) {
            orphanRings.push(...b.rings);
            b.rings = [];
        }
    });
    cleanArray(bullets);
    bullets.forEach(b => b.draw());

    // Update and draw orphan rings (persist after bullet dies)
    for (let i = orphanRings.length - 1; i >= 0; i--) {
        const ring = orphanRings[i];
        ring.x += ring.vx * timeScale;
        ring.y += ring.vy * timeScale;
        ring.r = Math.min(ring.r + ring.growSpeed * timeScale, ring.maxR);
        ring.alpha -= ring.decay * timeScale;
        if (ring.alpha <= 0) { orphanRings.splice(i, 1); continue; }
    }
    drawRings(orphanRings);

    enemies.forEach(e => e.update(timeScale));
    cleanArray(enemies);

    debris.forEach(d => d.update(timeScale));
    cleanArray(debris);

    particles.forEach(p => p.update(timeScale));
    cleanArray(particles);

    shockwaves.forEach(s => s.update(timeScale));
    cleanArray(shockwaves);

    floatingTexts.forEach(f => f.update(timeScale));
    cleanArray(floatingTexts);

    // Depth-sorted draw for enemies and debris
    drawList.length = 0;
    for (let i = 0; i < enemies.length; i++) drawList.push(enemies[i]);
    for (let i = 0; i < debris.length; i++) drawList.push(debris[i]);
    drawList.sort((a, b) => a.y - b.y);
    for (let i = 0; i < drawList.length; i++) drawList[i].draw();

    // Draw effects on top of everything
    shockwaves.forEach(s => s.draw());
    particles.forEach(p => p.draw());
    floatingTexts.forEach(f => f.draw());

    frames += timeScale;
}

// ========== INPUT HANDLING ==========
function handleVirtualInput(char) {
    handleInputLogic(char);
}

window.addEventListener('keydown', (e) => {
    if (!gameActive) return;
    if (e.code === 'Space') {
        e.preventDefault();
        toggleHunterMode();
        return;
    }
    if (e.key.length === 1) handleInputLogic(e.key);
});

/** Core input logic — matches typed characters to enemies/debris */
function handleInputLogic(char) {
    if (!gameActive) return;
    let hit = false;

    // Hunter mode — only target the active bonus enemy
    if (hunterMode) {
        if (activeTarget && activeTarget.isBonus && !activeTarget.isDying) {
            const expected = activeTarget.text[activeTarget.typedIndex];
            if (char === expected) {
                activeTarget.typedIndex++;
                player.shoot(activeTarget);
                createMiniParticles(activeTarget.x, activeTarget.y - activeTarget.radius - 20, 5, '#FFD700', 5);
                audio.hit();
                if (activeTarget.typedIndex >= activeTarget.text.length) {
                    killEnemy(activeTarget);
                    if (hunterMode) toggleHunterMode();
                }
                hit = true;
            } else {
                audio.error();
                shakeScreen(4);
            }
        }
        return;
    }

    // Try to match debris first
    const matchingDebris = debris.filter(d => d.char === char && !d.pendingDeath && !d.markedForDeletion);
    if (matchingDebris.length > 0) {
        matchingDebris.sort((a, b) =>
            ((a.x - player.x) ** 2 + (a.y - player.y) ** 2) -
            ((b.x - player.x) ** 2 + (b.y - player.y) ** 2)
        );
        const targetDebris = matchingDebris[0];
        targetDebris.pendingDeath = true;
        targetDebris.pendingDeathTimer = 0;
        targetDebris.pointsEarned = SCORE_DEBRIS;
        player.shoot(targetDebris);
        score += SCORE_DEBRIS;
        scoreUpdate();
        hit = true;
    }

    // Try to continue typing the active target
    if (!hit && activeTarget && !activeTarget.isDying && !activeTarget.isBonus) {
        const expected = activeTarget.text[activeTarget.typedIndex];
        if (char === expected) {
            activeTarget.typedIndex++;
            player.shoot(activeTarget);
            createMiniParticles(activeTarget.x, activeTarget.y - activeTarget.radius - 20, 5, '#0f0', 5);
            audio.hit();
            if (activeTarget.typedIndex >= activeTarget.text.length) killEnemy(activeTarget);
            hit = true;
        } else {
            if (!hit) shakeScreen(2);
        }
    }

    // Try to find a new target that starts with this character
    if (!hit && (!activeTarget || activeTarget.isDying)) {
        const candidates = enemies.filter(e =>
            !e.markedForDeletion && !e.isDying && !e.isBonus &&
            e.typedIndex === 0 && e.text[0] === char
        );
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.y - a.y);
            activeTarget = candidates[0];
            activeTarget.typedIndex++;
            player.shoot(activeTarget);
            if (activeTarget.typedIndex >= activeTarget.text.length) killEnemy(activeTarget);
            hit = true;
        }
    }
}

// ========== UI EVENT BINDINGS ==========
const textSizeControl = document.getElementById('textSizeControl');
uiMap.modeNormalBtn.addEventListener('click', () => {
    uiMap.start.classList.add('hidden');
    uiMap.scoreBoard.classList.remove('hidden');
    textSizeControl.classList.add('hidden');
    init('NORMAL');
});
uiMap.modeInfiniteBtn.addEventListener('click', () => {
    uiMap.start.classList.add('hidden');
    uiMap.scoreBoard.classList.remove('hidden');
    textSizeControl.classList.add('hidden');
    init('INFINITE');
});
uiMap.restartBtn.addEventListener('click', () => {
    uiMap.gameOver.classList.add('hidden');
    uiMap.start.classList.remove('hidden');
    uiMap.scoreBoard.classList.add('hidden');
    textSizeControl.classList.remove('hidden');
});

// Text size controls
function updateTextSizeDisplay() {
    textSizeValueEl.textContent = Math.round(textSizeMultiplier * 100) + '%';
}
textSizeUpBtn.addEventListener('click', () => {
    if (textSizeMultiplier < 2.0) {
        textSizeMultiplier = Math.round((textSizeMultiplier + 0.1) * 10) / 10;
        updateTextSizeDisplay();
    }
});
textSizeDownBtn.addEventListener('click', () => {
    if (textSizeMultiplier > 0.6) {
        textSizeMultiplier = Math.round((textSizeMultiplier - 0.1) * 10) / 10;
        updateTextSizeDisplay();
    }
});

// Prevent touch events on buttons from propagating to canvas
const buttons = document.querySelectorAll('button');
buttons.forEach(btn => {
    btn.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: false });
});

