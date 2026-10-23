/* PULSO: ARQUIVO 013
 * HTML/CSS/JavaScript local, sem bibliotecas externas.
 * Seções: regras, trilha, detecção local de gritos, sustos, interface e narrativa.
 * O microfone só é solicitado pelo botão Ativar; nenhum áudio é gravado ou enviado.
 */
(() => {
'use strict';

// ===== REGRAS E SEQUÊNCIAS =====
const LANES = [
  { name: 'Esquerda', key: 'A', arrow: '←', color: '#bf81ee', angle: -Math.PI / 2, midi: 57 },
  { name: 'Baixo', key: 'S', arrow: '↓', color: '#67d6e8', angle: Math.PI, midi: 60 },
  { name: 'Cima', key: 'W', arrow: '↑', color: '#add66f', angle: 0, midi: 62 },
  { name: 'Direita', key: 'D', arrow: '→', color: '#ee777b', angle: Math.PI / 2, midi: 64 }
];
const DIFFICULTIES = {
  easy: { name: 'Aprendiz', window: .225, travel: 2.2, damage: 5, speed: 1 },
  normal: { name: 'Normal', window: .165, travel: 1.8, damage: 7, speed: 1 },
  nightmare: { name: 'Pesadelo', window: .135, travel: 1.4, damage: 9, speed: 1 }
};
const SONGS = [
  { id: 'dead-line', title: 'Linha morta', subtitle: 'A ligação ainda não caiu.', bpm: 96, bars: 24, transpose: 0, motif: [0,3,2,1,0,2,3,1], label: 'O PRIMEIRO CONTATO', color: '#a7b6b0' },
  { id: 'hallway-13', title: 'Corredor 13', subtitle: 'Os passos acompanham a batida.', bpm: 124, bars: 24, transpose: -2, motif: [0,1,3,2,1,0,2,3], label: 'A PORTA ESTÁ ABERTA', color: '#cf8273' },
  { id: 'dont-look', title: 'Não olhe atrás', subtitle: 'Termine antes que ela chegue.', bpm: 148, bars: 32, transpose: 2, motif: [3,0,2,1,3,1,0,2], label: 'ÚLTIMA TRANSMISSÃO', color: '#be91c7' }
];
function songDuration(song) { return song.bars * 4 * 60 / song.bpm; }
function makeChart(song, difficulty = 'normal') {
  const step = 60 / song.bpm, total = song.bars * 4, notes = [], busy = [-1,-1,-1,-1];
  let order = 0;
  for (let half = 8; half < total * 2 - 3; half++) {
    const beat = half / 2, phrase = Math.floor(beat / 16), within = beat % 16;
    if (within < 4) continue; // The presence sings the opening call of each phrase.
    if (difficulty === 'easy' && half % 2) continue;
    if (difficulty === 'normal' && half % 2 && (half + phrase) % 3 === 0) continue;
    const lane = song.motif[(order + phrase) % song.motif.length]; order++;
    if (busy[lane] > beat - .24) continue;
    const length = difficulty !== 'easy' && half % 2 === 0 && Math.floor(beat) % 7 === 6 ? (difficulty === 'nightmare' ? 1.5 : 1) : 0;
    notes.push({ id: notes.length, lane, time: beat * step, length: length * step }); busy[lane] = beat + length;
    if (difficulty !== 'easy' && half % 2 === 0 && within === 14) {
      const second = (lane + 2) % 4;
      if (busy[second] < beat - .24) { notes.push({ id: notes.length, lane: second, time: beat * step, length: 0 }); busy[second] = beat; }
    }
    if (difficulty === 'nightmare' && half % 8 === 3) {
      const second = (lane + 1) % 4, when = beat + .25;
      if (busy[second] < when - .24) { notes.push({ id: notes.length, lane: second, time: when * step, length: 0 }); busy[second] = when; }
    }
  }
  return notes.sort((a,b) => a.time - b.time || a.lane - b.lane).map((n,id) => ({ ...n, id }));
}
class RhythmRound {
  constructor(chart, difficulty = 'normal', practice = false) {
    this.notes = chart.map(n => ({ ...n, state: 'pending', grade: null }));
    this.config = DIFFICULTIES[difficulty]; this.practice = practice;
    this.health = 80; this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.counts = { perfect: 0, good: 0, late: 0, miss: 0 };
    this.weights = 0; this.judged = 0; this.held = new Set(); this.events = [];
    this.failed = false; this.resumeUntil = -Infinity; this.lastTime = -Infinity;
  }
  get accuracy() { return this.judged ? this.weights / this.judged * 100 : 100; }
  get hits() { return this.counts.perfect + this.counts.good + this.counts.late; }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drainEvents() { return this.events.splice(0); }
  hit(grade, lane, tail = false) {
    const value = grade === 'perfect' ? 1 : grade === 'good' ? .8 : .5;
    this.counts[grade]++; this.judged++; this.weights += value;
    this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += (tail ? 150 : grade === 'perfect' ? 350 : grade === 'good' ? 200 : 100) * (1 + Math.min(3, Math.floor(this.combo / 15)));
    this.health = Math.min(100, this.health + (grade === 'perfect' ? 2 : 1));
    this.emit('hit', { grade, lane, tail });
  }
  miss(lane, ghost = false, reason = ghost ? 'wrong' : 'missed') {
    this.counts.miss++; this.judged++; this.combo = 0;
    this.health = Math.max(this.practice ? 1 : 0, this.health - (ghost ? 2.5 : this.config.damage));
    this.emit('miss', { lane, ghost, reason });
    if (this.health <= 0 && !this.failed) { this.failed = true; this.emit('failed'); }
  }
  update(time) {
    if (this.failed) return;
    this.lastTime = time;
    for (const note of this.notes) {
      if (note.state === 'pending' && time - note.time > this.config.window) {
        note.state = 'missed'; this.miss(note.lane); if (this.failed) break;
      } else if (note.state === 'holding') {
        if (!this.held.has(note.lane) && time > this.resumeUntil) { note.state = 'broken'; this.miss(note.lane, false, 'hold'); }
        else if (time >= note.time + note.length - .06 && this.held.has(note.lane)) { note.state = 'done'; this.hit('perfect', note.lane, true); }
      }
    }
  }
  press(lane, time) {
    if (this.failed || this.held.has(lane)) return false;
    this.held.add(lane);
    if (this.notes.some(n => n.lane === lane && n.state === 'holding')) return true;
    let closest = null, delta = Infinity;
    for (const note of this.notes) {
      if (note.state !== 'pending' || note.lane !== lane) continue;
      const d = Math.abs(note.time - time);
      if (d <= this.config.window && d < delta) { closest = note; delta = d; }
    }
    if (!closest) { if (time > .25) this.miss(lane, true); return false; }
    const grade = delta <= this.config.window * .34 ? 'perfect' : delta <= this.config.window * .7 ? 'good' : 'late';
    closest.state = closest.length ? 'holding' : 'done'; closest.grade = grade;
    this.hit(grade, lane); return true;
  }
  release(lane, time) {
    this.held.delete(lane);
    for (const note of this.notes) {
      if (note.lane !== lane || note.state !== 'holding') continue;
      if (time >= note.time + note.length - .09) { note.state = 'done'; this.hit('perfect', lane, true); }
      else { note.state = 'broken'; this.miss(lane, false, 'hold'); }
    }
  }
  pause() { this.held.clear(); }
  resume(time) { this.resumeUntil = time + .35; }
}

// ===== MÚSICA E EFEITOS PROCEDURAIS =====
class Soundtrack {
  constructor(song, volume = .55) {
    Object.assign(this, {song, volume, ctx:null, epoch:0, interval:null, tickNumber:0,
      nodes:new Set(), stopped:false, fallbackEpoch:0, pausedAt:null, tension:0});
  }
  async start() {
    this.fallbackEpoch=performance.now()/1000+2.4;
    try {
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return false;
      this.ctx=new Audio({latencyHint:'interactive'});await this.ctx.resume();
      const c=this.ctx, limiter=c.createDynamicsCompressor();
      limiter.threshold.value=-16;limiter.knee.value=14;limiter.ratio.value=12;
      limiter.attack.value=.004;limiter.release.value=.2;
      this.master=c.createGain();this.master.gain.value=this.volume*.6;
      this.master.connect(limiter);limiter.connect(c.destination);
      this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
      const data=this.noise.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      this.epoch=c.currentTime+2.4;
      this.drone();this.schedule();this.interval=setInterval(()=>this.schedule(),30);return true;
    } catch {
      if(this.ctx)this.ctx.close().catch(()=>{});this.ctx=null;return false;
    }
  }
  get time() {
    if(this.pausedAt!==null)return this.pausedAt;
    return this.ctx?this.ctx.currentTime-this.epoch:performance.now()/1000-this.fallbackEpoch;
  }
  setVolume(value) {this.volume=value;if(this.master&&this.ctx&&!this.stopped)this.master.gain.setTargetAtTime(value*.6,this.ctx.currentTime,.04);}
  setTension(value) {this.tension=Math.max(0,Math.min(1,value));}
  // Every source owns and disconnects its effect chain when it ends.
  chain(source,nodes) {
    this.nodes.add(source);
    source.onended=()=>{this.nodes.delete(source);[source,...nodes].forEach(n=>{try{n.disconnect();}catch{}});};
  }
  output(node,pan,chain) {
    if(this.ctx.createStereoPanner){const p=this.ctx.createStereoPanner();p.pan.value=pan;node.connect(p);p.connect(this.master);chain.push(p);}
    else node.connect(this.master);
  }
  tone(at,freq,length,gain,type='triangle',cutoff=1600,bend=null,pan=0,attack=.009) {
    if(!this.ctx||this.stopped)return;
    const c=this.ctx,o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain(),nodes=[f,g];
    o.type=type;o.frequency.setValueAtTime(freq,at);
    if(bend)o.frequency.exponentialRampToValueAtTime(bend,at+length*.8);
    f.type='lowpass';f.frequency.value=cutoff;f.Q.value=.7;
    g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),at+Math.min(attack,length*.45));
    g.gain.exponentialRampToValueAtTime(.0001,at+length);
    o.connect(f);f.connect(g);this.output(g,pan,nodes);this.chain(o,nodes);o.start(at);o.stop(at+length+.02);
  }
  hiss(at,length,gain,freq=2200,filter='highpass',pan=0) {
    if(!this.ctx||this.stopped)return;
    const c=this.ctx,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),nodes=[f,g];
    s.buffer=this.noise;s.loop=true;f.type=filter;f.frequency.value=freq;f.Q.value=1.2;
    g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),at+.006);
    g.gain.exponentialRampToValueAtTime(.0001,at+length);
    s.connect(f);f.connect(g);this.output(g,pan,nodes);this.chain(s,nodes);s.start(at);s.stop(at+length+.01);
  }
  whisper(at,length,gain=.025,pan=-.75,rising=false) {
    if(!this.ctx||this.stopped)return;
    const c=this.ctx,s=c.createBufferSource(),g=c.createGain(),nodes=[g];
    s.buffer=this.noise;s.loop=true;
    // Noise through moving vocal formants: no recordings, speech API or network.
    [420,1280,2450].forEach((hz,i)=>{
      const f=c.createBiquadFilter(),level=c.createGain();f.type='bandpass';f.Q.value=5+i*2;
      f.frequency.setValueAtTime(hz*(rising?.55:1.15),at);
      f.frequency.exponentialRampToValueAtTime(hz*(rising?1.55:.72),at+length);
      level.gain.value=[.7,.45,.18][i];s.connect(f);f.connect(level);level.connect(g);nodes.push(f,level);
    });
    g.gain.setValueAtTime(.0001,at);
    g.gain.exponentialRampToValueAtTime(gain,at+length*(rising?.87:.15));
    g.gain.exponentialRampToValueAtTime(.0001,at+length);
    this.output(g,pan,nodes);this.chain(s,nodes);s.start(at);s.stop(at+length+.02);
  }
  drone() {
    const at=this.ctx.currentTime,transpose=2**(this.song.transpose/12),length=songDuration(this.song)+4;
    this.tone(at,41.2*transpose,length,.025,'sine',180,null,-.25,.7);
    this.tone(at,41.7*transpose,length,.017,'triangle',230,null,.25,.9);
    this.whisper(at,2.3,.025,-.9,true);
  }
  schedule() {
    if(!this.ctx||this.stopped||this.pausedAt!==null)return;
    const step=60/this.song.bpm/2,hz=midi=>440*2**((midi-69)/12);
    while(this.epoch+this.tickNumber*step<this.ctx.currentTime+.22) {
      const n=this.tickNumber++,beat=n/2,at=this.epoch+n*step;
      if(at<this.ctx.currentTime-.03||beat>=this.song.bars*4)continue;
      const phrase=Math.floor(beat/16),section=Math.floor(beat/4)%4;
      const root=[33,28,32,27][section]+this.song.transpose;
      const dread=.35+.35*(beat/(this.song.bars*4))+.3*this.tension;
      if(n%2===0) {
        // The beat remains readable underneath the dissonant layers.
        if(beat%4===0||beat%4===2) {
          this.tone(at,128,.23,.38,'sine',380,34);
          this.tone(at+.12,64,.12,.065,'sine',170,40); // double heartbeat
        }
        this.tone(at,hz(root),step*1.8,.115,'sawtooth',300+section*45);
        if(beat%4===1||beat%4===3){this.hiss(at,.14,.09,1300,'bandpass');this.tone(at,165,.09,.07,'triangle',500,67);}
        if(beat%4===0) {
          [12,13,18].forEach((interval,i)=>this.tone(at,hz(root+interval),step*7.5,.009+dread*.007,'triangle',680+i*160,null,[-.65,.65,0][i],.35));
          this.tone(at,hz(root+36),step*7.6,.008+dread*.009,'sawtooth',1500,hz(root+35.8),phrase%2?.6:-.6,.7);
        }
        if(beat%16<4) {
          const lane=this.song.motif[(Math.floor(beat)+phrase)%8],f=hz(LANES[lane].midi+this.song.transpose-18);
          this.tone(at,f,step*1.65,.068,'sawtooth',850,f*.91,beat%2?.35:-.35);
          this.whisper(at,step*1.7,.026+dread*.018,beat%2?-.8:.8);
        } else if(beat%4===2)this.tone(at,hz(root+31),step*1.3,.022,'triangle',1500);
      }
      this.hiss(at,.035,n%2===0?.03:.018,5700);
      if(beat%16===12)this.whisper(at,step*7.7,.035+dread*.035,phrase%2?.9:-.9,true);
      if(beat%16===15.5){this.hiss(at,.26,.045,750,'bandpass');this.tone(at,72,.28,.06,'sine',300,30);}
      if(this.song.id==='dont-look'&&n%4===3)this.tone(at,hz(root+25),step*.6,.025,'square',1100,null,n%8===3?-.5:.5);
      if(this.tension>.65&&beat%8===6)this.whisper(at,step*3.5,.047,.1,true);
    }
  }
  voice(lane,perfect=true) {
    if(!this.ctx||this.stopped||this.pausedAt!==null)return;
    const f=440*2**((LANES[lane].midi+this.song.transpose-69)/12);
    this.tone(this.ctx.currentTime+.003,f,.17,perfect?.095:.06,'triangle',1900,f*1.015);
  }
  scare(reduced=false,kind='watcher') {
    if(!this.ctx||this.stopped||reduced)return;
    const t=this.ctx.currentTime;
    if(kind==='wrong'||kind==='hold') {
      this.hiss(t,.24,.15,1750,'bandpass',-.5);
      this.tone(t,145,.48,.17,'sawtooth',1500,41,-.3);
      this.tone(t+.07,386,.28,.045,'square',1900,164,.7);
    } else if(kind==='missed'||kind==='blackout') {
      this.whisper(t,.85,.23,.65);
      this.tone(t,76,.8,.18,'sawtooth',750,29,.15);
      this.tone(t+.08,511,.55,.035,'triangle',1400,139,-.65);
    } else if(kind==='scream') {
      this.whisper(t,.95,.25,-.8);
      this.whisper(t+.09,.9,.2,.85);
      this.tone(t,188,.85,.14,'sawtooth',1700,34);
      this.tone(t+.04,199,.75,.1,'sawtooth',1250,39,.3);
      this.hiss(t,.17,.1,2100,'bandpass');
    } else {
      this.hiss(t,.46,.13,950,'bandpass');this.tone(t,92,.6,.18,'sawtooth',1100,33);
      this.whisper(t,.65,.14,.6);this.tone(t,659,.2,.035,'triangle',2000,440);
    }
  }
  async pause() {
    if(this.pausedAt!==null)return;
    this.pausedAt=this.time;clearInterval(this.interval);if(this.ctx)await this.ctx.suspend().catch(()=>{});
  }
  async resume() {
    if(this.pausedAt===null)return;
    const paused=this.pausedAt;if(this.ctx)await this.ctx.resume().catch(()=>{});else this.fallbackEpoch=performance.now()/1000-paused;
    this.pausedAt=null;this.schedule();if(this.ctx)this.interval=setInterval(()=>this.schedule(),30);
  }
  stop() {
    if(this.stopped)return;this.stopped=true;clearInterval(this.interval);
    if(this.ctx){const c=this.ctx;if(c.state==='running')this.master.gain.setTargetAtTime(.0001,c.currentTime,.025);
      setTimeout(()=>{this.nodes.forEach(n=>{try{n.stop();}catch{}});this.nodes.clear();c.close().catch(()=>{});},120);}
  }
}

// ===== MICROFONE LOCAL E DIREÇÃO DOS SUSTOS =====
class ScreamDetector {
  constructor(threshold=.16,delay=3){this.threshold=threshold;this.delay=delay;this.reset();}
  reset(){this.pendingAt=null;this.loudSince=null;this.quietSince=null;this.latched=false;this.cooldownUntil=0;}
  feed(level,time,armed=true,suppressed=false) {
    if(level<this.threshold*.55) {
      if(this.quietSince===null)this.quietSince=time;
      if(time-this.quietSince>=.45)this.latched=false;
    }else this.quietSince=null;
    if(!armed||suppressed||this.pendingAt!==null||time<this.cooldownUntil||this.latched){this.loudSince=null;return false;}
    if(level>=this.threshold) {
      if(this.loudSince===null)this.loudSince=time;
      // Brief keyboard clicks do not arm the delayed scare.
      if(time-this.loudSince>=.18) {
        this.pendingAt=time+this.delay;this.latched=true;this.loudSince=null;return true;
      }
    }else this.loudSince=null;
    return false;
  }
  poll(time,canFire=true) {
    if(!canFire||this.pendingAt===null||time<this.pendingAt)return false;
    this.pendingAt=null;this.cooldownUntil=time+10;return true;
  }
}
class MicrophoneMonitor {
  constructor(){this.active=false;this.requesting=false;this.token=0;this.stream=null;this.ctx=null;this.source=null;this.analyser=null;this.data=null;this.error='';this.onDisconnect=null;}
  async enable() {
    if(this.active)return true;if(this.requesting)return false;
    const token=++this.token;this.requesting=true;this.error='';
    let stream=null,context=null;
    try {
      if(!navigator.mediaDevices?.getUserMedia||!window.isSecureContext)throw Object.assign(new Error(),{name:'InsecureContext'});
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)throw Object.assign(new Error(),{name:'NotSupportedError'});
      stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false});
      if(token!==this.token){stream.getTracks().forEach(t=>t.stop());return false;}
      context=new Audio({latencyHint:'interactive'});await context.resume();
      if(token!==this.token){stream.getTracks().forEach(t=>t.stop());await context.close();return false;}
      this.stream=stream;this.ctx=context;this.source=context.createMediaStreamSource(stream);this.analyser=context.createAnalyser();
      this.analyser.fftSize=1024;this.analyser.smoothingTimeConstant=0;
      this.data=new Float32Array(this.analyser.fftSize);
      this.source.connect(this.analyser); // Deliberately never connected to speakers.
      stream.getTracks().forEach(t=>{t.onended=()=>{this.stop();this.error='Disconnected';this.onDisconnect?.();};});
      this.active=true;return true;
    }catch(error){
      stream?.getTracks().forEach(t=>t.stop());if(context)context.close().catch(()=>{});
      if(token===this.token){this.stop();this.error=error.name||'UnknownError';}return false;
    }finally{if(token===this.token)this.requesting=false;}
  }
  readLevel() {
    if(!this.active||!this.analyser)return 0;
    this.analyser.getFloatTimeDomainData(this.data);
    let total=0;for(const value of this.data)total+=value*value;
    return Math.sqrt(total/this.data.length);
  }
  stop() {
    ++this.token;this.requesting=false;this.active=false;
    this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});
    try{this.source?.disconnect();this.analyser?.disconnect();}catch{}
    if(this.ctx)this.ctx.close().catch(()=>{});
    this.stream=null;this.ctx=null;this.source=null;this.analyser=null;this.data=null;
  }
}
const SCARE_PROFILES={
  wrong:[
    {image:'susto-erro.png',motion:'lunge',line:'NÃO ERA ESSA TECLA.',duration:780},
    {image:'susto-erro.png',motion:'side',line:'SUA MÃO ME CHAMOU.',duration:900}
  ],
  hold:[{image:'susto-erro.png',motion:'side',line:'EU DISSE: NÃO SOLTE.',duration:900}],
  missed:[
    {image:'susto-falta.png',motion:'hollow',line:'O SILÊNCIO TAMBÉM RESPONDE.',duration:1050},
    {image:'susto-falta.png',motion:'rise',line:'VOCÊ DEIXOU PASSAR.',duration:1100}
  ],
  scream:[
    {image:'susto-eco.png',motion:'listener',line:'EU OUVI VOCÊ GRITAR.',duration:1250},
    {image:'susto-eco.png',motion:'listener',line:'AGORA EU SEI ONDE VOCÊ ESTÁ.',duration:1350}
  ],
  watcher:[{image:'corredor.png',motion:'watcher',line:'NÃO É A SUA VOZ.',duration:800}],
  close:[{image:'susto-erro.png',motion:'lunge',line:'NÃO OLHE ATRÁS.',duration:900}],
  blackout:[{image:'susto-falta.png',motion:'hollow',line:'A LUZ NÃO VAI VOLTAR.',duration:1000}],
  final:[{image:'susto-eco.png',motion:'listener',line:'AGORA A SUA VOZ FICA AQUI.',duration:1250}]
};
class ScareDirector {
  constructor(){this.reset();}
  reset(){this.lastAt=-Infinity;this.lastByKind={};this.counts={};}
  take(kind,time,force=false) {
    if(!force&&(time-this.lastAt<4.2||time-(this.lastByKind[kind]??-Infinity)<6.5))return null;
    const choices=SCARE_PROFILES[kind]||SCARE_PROFILES.watcher,index=this.counts[kind]||0;
    this.counts[kind]=index+1;this.lastAt=time;this.lastByKind[kind]=time;
    return choices[index%choices.length];
  }
}

// ===== INTERFACE, LORE E JUMPSCARES =====
const $ = id => document.getElementById(id);
const icon = name => `<svg aria-hidden="true"><use href="#${name}"/></svg>`;
const recordKey = 'pulso.arquivo013.records.v1', settingsKey = 'pulso.arquivo013.settings.v1';
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const fmt = seconds => `${Math.floor(Math.max(0,seconds)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,seconds)%60).toString().padStart(2,'0')}`;
let settings = { volume:.55, muted:false, reduced:matchMedia('(prefers-reduced-motion: reduce)').matches, offset:0, micThreshold:.16 };
let records = [], selectedSong = 0, difficulty = 'normal', phase = 'menu', round = null, soundtrack = null;
let animation = null, runId = 0, pauseTarget = 'running', lastHudAt = -Infinity, lastBeat = -1;
let lastJudgmentAt = -Infinity, scareTimer = null, resultTimer = null, toastTimer = null, mutedBefore = .55;
let width = 400, height = 500, dpr = 1, particles = [], sources = new Map(), inputSources = new Map();
let chapterPageIndex=0, captionTimer=null; const storyEventsSeen=new Set();
const microphone=new MicrophoneMonitor(),screamDetector=new ScreamDetector(),scareDirector=new ScareDirector();
let micState='off',micMessage='',micLevel=0,micClock=0,micSuppressedUntil=0,micAnimation=null;
let lastMicFrame=null,lastMicPaint=-Infinity,calibration=null,resultAudioTimer=null;
const CHAPTERS=[{"title": "A ligação", "label": "FITA 01 / 03:33 AM", "pages": [{"title": "O arquivo tem a voz dela.", "text": "Davi é técnico de áudio e vive com esquizofrenia. Tem acompanhamento, pessoas em quem confia e uma regra para noites difíceis: registrar o que percebe antes de tirar conclusões. Às 03:33, chega um áudio de Lia, sua irmã, desaparecida durante uma filmagem no antigo Hospital Santa Dália. O arquivo tem seis segundos. A duração aumenta quando ele o reproduz.", "quote": "“Davi. Não responda quando a voz usar o meu nome.”"}, {"title": "Alguém também ouviu.", "text": "Davi envia o arquivo para Jana, sua amiga. Antes que ele descreva o sussurro, ela repete a mesma frase. Os dois recebem uma nova faixa: quatro batidas, uma porta fechando e a voz de Davi dizendo algo que ele nunca gravou. No fundo, um aparelho marca um ritmo. Lia deixou uma instrução: completar o compasso interrompe a transmissão.", "quote": "“A gente vai conferir isso juntos. A gravação aqui também mudou.” — Jana"}], "lines": ["“Ela não disse isso<br>na primeira gravação.”", "“Jana também ouviu.<br>Continue registrando.”", "“A fita acaba.<br>A voz continua.”"], "after": "Jana confirma: o mesmo rosto apareceu no monitor dela. Davi encontra uma fita sem áudio no bolso. No rótulo, uma frase escrita com a letra de Lia: O ELEVADOR NÃO TEM ANDAR 13."}, {"title": "O quarto que não existe", "label": "FITA 02 / CORREDOR 13", "pages": [{"title": "A planta termina no doze.", "text": "O hospital está fechado há quinze anos. Jana acompanha a câmera de Davi de outro lugar. A planta do edifício termina no décimo segundo quarto. No corredor, a porta seguinte está entreaberta. Lá dentro, treze gravadores reproduzem o som da respiração de pessoas ausentes. Um deles respira no ritmo de Jana.", "quote": "“Não entre ainda. Eu estou vendo a porta abrir atrás de você.”"}, {"title": "Não é uma lembrança.", "text": "Nos registros, Santa Dália abrigou uma estação de rádio no subsolo. O sinal foi desligado depois de transmitir vozes de pessoas que ainda não haviam entrado no prédio. Algo permaneceu na frequência: a Ausente. Ela copia vozes, depois nomes, depois rostos. A câmera de Jana registra a mesma figura das fitas antigas. Numa delas, a cabeça se vira para seguir alguém fora do enquadramento. A data do arquivo muda para amanhã.", "quote": "“Se eu te chamar com a voz dela, quem vai saber que não sou eu?”"}], "lines": ["“A porta treze<br>não aparece na planta.”", "“Os gravadores<br>respiram juntos.”", "“O nome de Lia<br>sumiu da etiqueta.”"], "after": "A porta cede. Lia está viva, do outro lado do vidro da cabine de rádio. Ela bate no vidro. O áudio chega um segundo antes de sua mão tocar a superfície. Atrás dela há uma cadeira vazia. Sua sombra está sentada nela."}, {"title": "A última frequência", "label": "FITA 03 / NÃO OLHE ATRÁS", "pages": [{"title": "Ela precisa de uma resposta.", "text": "A Ausente não consegue sair enquanto a transmissão estiver incompleta. Por isso coleciona respostas: um nome dito de volta, uma voz reconhecida, a última nota de uma sequência. Lia encontrou um compasso que corta a portadora antes do encerramento. Davi precisa executá-lo, enquanto Jana grava uma cópia para manter a prova fora do prédio.", "quote": "“Toque até o fim. Mas não responda à última voz.” — Lia"}, {"title": "O silêncio tem quatro batidas.", "text": "A cabine está vazia nas imagens de ontem. Nas imagens de amanhã, Davi está lá dentro. O rosto no vidro já se parece com o dele. A irmã atravessa o corredor sem olhar para a própria sombra. A última fita começa sozinha. Na linha telefônica, alguém imita a respiração de Jana.", "quote": "“Eu já sei sua voz. Só falta você me reconhecer.”"}], "lines": ["“A linha estava muda.<br>A voz ficou mais alta.”", "“Lia atravessou a porta.<br>Falta interromper o sinal.”", "“Não responda<br>à última voz.”"], "after": "Do lado de fora, Lia e Davi ouvem Jana pelo telefone. As três gravações coincidem. Lia segura o pulso de Davi. Quando Jana chama os dois pelos nomes, uma camada de ruído desaparece. O telefone anuncia FIM DA TRANSMISSÃO. Uma quarta respiração permanece na chamada."}];
const STORY_EVENTS=[[{"beat": 16, "kind": "watcher", "line": "NÃO É A SUA VOZ."}, {"beat": 48, "kind": "blackout", "line": "A PORTA NÃO ESTAVA AÍ."}, {"beat": 80, "kind": "close", "line": "ELA OUVIU DO OUTRO LADO."}], [{"beat": 16, "kind": "close", "line": "A CÂMERA TAMBÉM VIU."}, {"beat": 48, "kind": "watcher", "line": "DEVOLVE O MEU NOME."}, {"beat": 80, "kind": "blackout", "line": "A SOMBRA NÃO É DELA."}], [{"beat": 16, "kind": "blackout", "line": "A LINHA ESTAVA MUDA."}, {"beat": 48, "kind": "watcher", "line": "EU JÁ SEI SUA VOZ."}, {"beat": 80, "kind": "close", "line": "FALTA UMA ÚLTIMA RESPOSTA."}, {"beat": 112, "kind": "blackout", "line": "NÃO RESPONDA."}]];
const receptorUntil = [0,0,0,0];
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
try {
  const saved = JSON.parse(localStorage.getItem(settingsKey) || 'null');
  if (saved && typeof saved === 'object') {
    settings.volume = Number.isFinite(saved.volume) ? clamp(saved.volume,0,1) : .55;
    settings.offset = Number.isFinite(saved.offset) ? clamp(saved.offset,-150,150) : 0;
    settings.micThreshold = Number.isFinite(saved.micThreshold) ? clamp(saved.micThreshold,.04,.4) : .16;
    settings.muted = saved.muted === true; settings.reduced = typeof saved.reduced === 'boolean' ? saved.reduced : settings.reduced;
  }
  const savedRecords = JSON.parse(localStorage.getItem(recordKey) || '[]');
  if (Array.isArray(savedRecords)) records = savedRecords.filter(r => r && SONGS.some(s=>s.id===r.song) && Object.hasOwn(DIFFICULTIES,r.difficulty) && Number.isFinite(r.score) && r.score>=0 && Number.isFinite(r.accuracy) && r.accuracy>=0 && r.accuracy<=100 && Number.isFinite(r.maxCombo) && Number.isFinite(r.misses)).slice(-100);
} catch { /* Storage is optional. */ }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent=message; $('toast').hidden=false; toastTimer=setTimeout(()=>{$('toast').hidden=true;},4400); }
function announce(message) { $('announcer').textContent=message; }
function saveSettings() { try { localStorage.setItem(settingsKey,JSON.stringify(settings)); } catch { /* The game also works without storage. */ } }
function applySettings() {
  document.body.classList.toggle('reduced-effects',settings.reduced);
  $('volumeSlider').value=Math.round(settings.volume*100); $('volumeOutput').textContent=`${Math.round(settings.volume*100)}%`;
  $('offsetSlider').value=settings.offset; $('offsetOutput').textContent=`${settings.offset>0?'+':''}${settings.offset} ms`;
  $('reducedToggle').checked=settings.reduced;
  const muted=settings.muted||settings.volume===0;
  $('audioToggle').innerHTML=icon(muted?'mute':'volume'); $('audioToggle').setAttribute('aria-label',muted?'Ativar som':'Desativar som'); $('audioToggle').setAttribute('title',muted?'Ativar som':'Desativar som'); $('audioToggle').setAttribute('aria-pressed',muted);
  soundtrack?.setVolume(muted?0:settings.volume);
  screamDetector.threshold=settings.micThreshold;paintMicUI();
}
function bestRecord(song=SONGS[selectedSong].id,diff=difficulty,practice=$('practiceToggle').checked) {
  return records.filter(r=>r.song===song&&r.difficulty===diff&&r.practice===practice).sort((a,b)=>Number(b.completed)-Number(a.completed)||b.score-a.score)[0];
}
function updateMenuRecord() {
  const best=bestRecord(); $('menuRecord').textContent=best?`MELHOR: ${best.score.toLocaleString('pt-BR')} PTS`:'SEM REGISTROS';
}
function selectSong(index) {
  if(phase!=='menu'&&phase!=='result')return;
  selectedSong=clamp(index,0,SONGS.length-1);
  document.querySelectorAll('[data-song]').forEach(el=>{const active=Number(el.dataset.song)===selectedSong;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',active);}); updateMenuRecord();
}
function updateHud(time=0) {
  if(!round)return;
  $('scoreValue').textContent=Math.round(round.score).toString().padStart(6,'0');
  $('accuracyValue').innerHTML=`${Math.round(round.accuracy)}<span>%</span>`; $('missValue').textContent=round.counts.miss;
  $('healthValue').textContent=`${Math.round(round.health)}%`; $('healthFill').style.width=`${round.health}%`;
  $('healthFill').style.background=round.health<35?'#df6553':round.health<65?'#c89064':'#b8bb83';
  $('healthMessage').textContent=round.health<25?'Ela está bem atrás de você.':round.health<50?'Não deixe o ritmo escapar.':'Mantenha-a longe.';
  $('timeValue').textContent=`${fmt(Math.min(songDuration(SONGS[selectedSong]),time))} / ${fmt(Math.round(songDuration(SONGS[selectedSong])))}`;
  $('songProgress').style.width=`${clamp(time/songDuration(SONGS[selectedSong])*100,0,100)}%`;
  $('comboValue').textContent=round.combo; $('comboDisplay').hidden=round.combo<3;
  const threat=1-round.health/100;soundtrack?.setTension(threat);
  $('dangerVignette').style.opacity=settings.reduced?'0':String(Math.max(0,(threat-.45)*.57));
  document.querySelector('.stage-art').style.transform=settings.reduced?'none':`scale(${1.015+threat*.18})`;
  $('dangerLabel').textContent=round.health<25?'ELA JÁ ESTÁ AQUI.':round.health<50?'NÃO PARE. NÃO OLHE.':'VOCÊ NÃO ESTÁ SOZINHO.';
  const lines=CHAPTERS[selectedSong].lines;
  const part=time>songDuration(SONGS[selectedSong])*.67?2:time>songDuration(SONGS[selectedSong])*.35?1:0;
  $('storyMessage').innerHTML=round.health<25?'“A voz está perto.<br>Continue o compasso.”':lines[part];
}
async function startGame() {
  if(!['menu','result'].includes(phase))return;
  screamDetector.reset();scareDirector.reset();micClock=0;micSuppressedUntil=0;lastMicFrame=null;clearTimeout(resultAudioTimer);
  storyEventsSeen.clear(); clearTimeout(captionTimer); $('hauntCaption').hidden=true; $('resultLore').hidden=true;
  const id=++runId; clearTimeout(resultTimer); clearTimeout(scareTimer); cancelAnimationFrame(animation); soundtrack?.stop();
  phase='loading'; $('startButton').disabled=true; $('startButton').setAttribute('aria-busy','true');
  $('lobby').hidden=true; $('resultScreen').hidden=true; $('game').hidden=false; $('scare').hidden=true;
  document.body.classList.add('playing'); document.body.classList.remove('ended');
  const song=SONGS[selectedSong]; round=new RhythmRound(makeChart(song,difficulty),difficulty,$('practiceToggle').checked);
  $('playingTitle').textContent=song.title; $('playingBpm').textContent=`${song.bpm} BPM`; $('playingDifficulty').textContent=DIFFICULTIES[difficulty].name;
  $('phaseLabel').textContent=`0${selectedSong+1} / ${song.label}`; $('practiceBadge').hidden=!round.practice;
  $('transmissionLabel').textContent='CONECTANDO AO CORREDOR'; $('footerCaption').textContent='NÃO QUEBRE A SEQUÊNCIA.';
  $('countdown').hidden=false; $('countdownNumber').textContent='…'; $('judgment').classList.remove('visible');
  receptorUntil.fill(0); inputSources.clear(); sources.clear(); particles=[]; lastBeat=-1; lastHudAt=-Infinity;
  document.querySelectorAll('[data-lane]').forEach(el=>el.classList.remove('active'));
  window.scrollTo({top:0,behavior:'instant'}); resizeCanvas(); updateHud();
  soundtrack=new Soundtrack(song,settings.muted?0:settings.volume);
  const audioOk=await soundtrack.start();
  if(id!==runId){soundtrack.stop();return;}
  $('audioStatus').textContent=audioOk?'Áudio sincronizado com as notas.':'O navegador não disponibilizou áudio. A rodada funciona com as pistas visuais.';
  if(!audioOk)toast('Áudio indisponível neste navegador. Você pode jogar pelas pistas visuais.');
  phase='countdown'; $('startButton').disabled=false; $('startButton').removeAttribute('aria-busy');
  $('highway').focus({preventScroll:true}); announce(`${song.title}. Prepare-se. Use as setas ou A, S, W e D.`);
  animation=requestAnimationFrame(gameLoop);
}
function resizeCanvas() {
  const rect=canvas.getBoundingClientRect(); if(rect.width<1||rect.height<1)return;
  width=rect.width; height=rect.height; dpr=Math.min(2,devicePixelRatio||1);
  canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
  document.querySelector('.hit-line-label').style.top=`${targetY()+40}px`;
  if(round&&soundtrack)draw(soundtrack.time+settings.offset/1000,performance.now());
}
function targetY(){return height<350?76:89;}
function arrow(x,y,size,angle,color,outline=false,glow=0) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size/22,size/22);ctx.beginPath();
  ctx.moveTo(-8,20);ctx.lineTo(8,20);ctx.lineTo(8,2);ctx.lineTo(19,2);ctx.lineTo(0,-19);ctx.lineTo(-19,2);ctx.lineTo(-8,2);ctx.closePath();
  ctx.lineJoin='round';ctx.lineWidth=outline?2.1:2.8;
  if(glow&&!settings.reduced){ctx.shadowColor=color;ctx.shadowBlur=glow;}
  if(outline){ctx.strokeStyle=color;ctx.stroke();}
  else{ctx.strokeStyle='#07070b';ctx.fillStyle=color;ctx.fill();ctx.stroke();ctx.lineWidth=.9;ctx.strokeStyle='#ffffff88';ctx.stroke();}
  ctx.restore();
}
function draw(time,now) {
  if(!round)return;
  ctx.clearRect(0,0,width,height);const margin=14,laneW=(width-margin*2)/4,y=targetY(),speed=(height-y-15)/DIFFICULTIES[difficulty].travel;
  const centers=LANES.map((_,i)=>margin+laneW*(i+.5)),size=Math.min(24,laneW*.31);
  for(let lane=0;lane<4;lane++){
    ctx.fillStyle=lane%2?'#ffffff03':'#00000016';ctx.fillRect(margin+lane*laneW,0,laneW,height);
    ctx.fillStyle='#ffffff09';ctx.fillRect(margin+lane*laneW,0,1,height);
    if(inputSources.has(lane)){const gradient=ctx.createLinearGradient(0,y-35,0,height);gradient.addColorStop(0,`${LANES[lane].color}18`);gradient.addColorStop(1,'#ffffff00');ctx.fillStyle=gradient;ctx.fillRect(margin+lane*laneW,y-35,laneW,height-y+35);}
  }
  ctx.fillStyle='#ffffff09';ctx.fillRect(width-margin,0,1,height);
  const beat=60/SONGS[selectedSong].bpm;
  for(let b=Math.floor(time/beat);b<(time+DIFFICULTIES[difficulty].travel)*1/beat+1;b++){
    const by=y+(b*beat-time)*speed;if(by<y-8||by>height)continue;ctx.fillStyle=b%4===0?'#bdb19c0d':'#ffffff04';ctx.fillRect(margin,by,width-margin*2,1);
  }
  ctx.fillStyle='#b9ab9221';ctx.fillRect(margin,y,width-margin*2,1);
  for(const n of round.notes){
    if(n.state!=='pending'&&n.state!=='holding')continue;
    const yy=y+(n.time-time)*speed,tailY=y+(n.time+n.length-time)*speed;
    if(yy>height+45||tailY<-40)continue;
    const x=centers[n.lane],color=LANES[n.lane].color;
    if(n.length){const from=n.state==='holding'?y:yy;ctx.fillStyle=`${color}60`;ctx.fillRect(x-7,Math.max(y,from),14,Math.max(0,tailY-Math.max(y,from)));ctx.fillStyle=`${color}b0`;ctx.fillRect(x-2,Math.max(y,from),4,Math.max(0,tailY-Math.max(y,from)));ctx.fillStyle=color;ctx.fillRect(x-7,tailY-3,14,5);}
    if(n.state==='pending')arrow(x,yy,size,LANES[n.lane].angle,color,false,7);
  }
  for(let lane=0;lane<4;lane++){const lit=receptorUntil[lane]>now||inputSources.has(lane);arrow(centers[lane],y,size+1,LANES[lane].angle,lit?LANES[lane].color:'#756b70',true,lit?18:0);}
  particles=particles.filter(p=>now-p.at<350);
  if(!settings.reduced)for(const p of particles){const progress=(now-p.at)/350;ctx.globalAlpha=1-progress;ctx.strokeStyle=p.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(centers[p.lane],y,25+progress*28,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
  const bottomShade=ctx.createLinearGradient(0,height-60,0,height);bottomShade.addColorStop(0,'#09090c00');bottomShade.addColorStop(1,'#09090ccc');ctx.fillStyle=bottomShade;ctx.fillRect(0,height-60,width,60);
}
function processEvents(time,now) {
  for(const event of round.drainEvents()){
    if(event.type==='hit'){
      receptorUntil[event.lane]=now+150;particles.push({lane:event.lane,at:now,color:LANES[event.lane].color});
      $('judgment').textContent=event.tail?'SEGURADO!':{perfect:'PERFEITO!',good:'BOA!',late:'NO LIMITE'}[event.grade];
      $('judgment').dataset.grade=event.grade;$('judgment').classList.add('visible');lastJudgmentAt=now;
      if(!event.tail)soundtrack.voice(event.lane,event.grade==='perfect');
    }else if(event.type==='miss'){
      $('judgment').textContent=event.reason==='wrong'?'TECLA ERRADA':event.reason==='hold'?'SOLTOU CEDO':'NOTA PERDIDA';$('judgment').dataset.grade='miss';$('judgment').classList.add('visible');lastJudgmentAt=now;
      document.body.classList.add('screen-miss');setTimeout(()=>document.body.classList.remove('screen-miss'),180);
      if(round.health>0)triggerScare(false,event.reason||'missed');
    }else if(event.type==='failed'){finishGame(false);return;}
  }
}
function gameLoop(now) {
  if(!['running','countdown'].includes(phase))return;
  const time=soundtrack.time,chartTime=time+settings.offset/1000;
  if(phase==='countdown'){
    if(time>=0){phase='running';$('countdown').hidden=true;$('transmissionLabel').textContent='TRANSMISSÃO EM ANDAMENTO';announce('O sinal voltou. Espere suas notas.');}
    else $('countdownNumber').textContent=Math.max(1,Math.ceil(-time/0.8));
  }
  if(phase==='running'){
    round.update(chartTime);processEvents(time,now);if(phase!=='running')return;
    if(time>=songDuration(SONGS[selectedSong])+.3){finishGame(true);return;}
    const beat=Math.floor(Math.max(0,time)/(60/SONGS[selectedSong].bpm));
    if(beat!==lastBeat){lastBeat=beat;runStoryEvents(beat);const enemy=beat%16<4;
      $('turnLabel').textContent=enemy?'ELA CANTA. ESCUTE.':'SUA VEZ. MANTENHA O RITMO.';
      $('turnLabel').style.color=enemy?'#c4806d':'#c8c191';
      document.querySelectorAll('#opponentNotes>span').forEach(el=>el.classList.remove('active'));
      if(enemy){const lane=SONGS[selectedSong].motif[(beat+Math.floor(beat/16))%8];document.querySelectorAll('#opponentNotes>span')[lane]?.classList.add('active');}
      if(!settings.reduced&&beat%32===28){document.body.classList.add('signal-flash');setTimeout(()=>document.body.classList.remove('signal-flash'),650);}
    }
  }
  if(now-lastJudgmentAt>450)$('judgment').classList.remove('visible');
  if(now-lastHudAt>75){updateHud(time);lastHudAt=now;}
  draw(chartTime,now);animation=requestAnimationFrame(gameLoop);
}
function triggerScare(final=false,kind='watcher',line=null) {
  if(settings.reduced){
    if(kind==='scream'){
      clearTimeout(captionTimer);$('hauntCaption').textContent='ELA OUVIU VOCÊ GRITAR.';$('hauntCaption').hidden=false;
      captionTimer=setTimeout(()=>{$('hauntCaption').hidden=true;},2400);
    }
    return false;
  }
  if(!$('scare').hidden&&!final)return false;
  const cause=final?'final':kind,profile=scareDirector.take(cause,performance.now()/1000,final||kind==='scream');
  if(!profile)return false;
  clearTimeout(scareTimer);const overlay=$('scare');
  overlay.dataset.kind=cause;overlay.dataset.motion=profile.motion;
  $('scareImage').src='assets/'+profile.image;$('scareText').textContent=line||profile.line;
  // Ignore the game's own stinger while preserving any already scheduled echo.
  micSuppressedUntil=micClock+profile.duration/1000+1.5;
  overlay.hidden=false;$('app').classList.remove('strong-scare');void $('app').offsetWidth;
  $('app').classList.add('strong-scare');soundtrack?.scare(false,cause);
  scareTimer=setTimeout(()=>{overlay.hidden=true;$('app').classList.remove('strong-scare');},profile.duration);
  return true;
}
function runStoryEvents(beat) {
  let current=null;
  for(const event of STORY_EVENTS[selectedSong]){
    if(beat>=event.beat&&!storyEventsSeen.has(event.beat)){
      storyEventsSeen.add(event.beat);if(beat-event.beat<4)current=event;
    }
  }
  if(!current)return;
  clearTimeout(captionTimer);$('hauntCaption').textContent=current.line;$('hauntCaption').hidden=false;
  captionTimer=setTimeout(()=>{$('hauntCaption').hidden=true;},2300);
  announce('A transmissão mudou. '+current.line);
  // Scripted scares occur during the opponent's four-beat call.
  triggerScare(false,current.kind,current.line);
}

function press(lane,source) {
  if(phase!=='running'||sources.has(source))return;
  sources.set(source,lane);
  if(!inputSources.has(lane))inputSources.set(lane,new Set());
  const laneSources=inputSources.get(lane);laneSources.add(source);
  if(laneSources.size===1)round.press(lane,soundtrack.time+settings.offset/1000);
  receptorUntil[lane]=performance.now()+100;document.querySelector(`[data-lane="${lane}"]`).classList.add('active');
  processEvents(soundtrack.time,performance.now());updateHud(soundtrack.time);
}
function release(source) {
  if(!sources.has(source))return;
  const lane=sources.get(source);sources.delete(source);const laneSources=inputSources.get(lane);laneSources?.delete(source);
  if(!laneSources?.size){inputSources.delete(lane);document.querySelector(`[data-lane="${lane}"]`).classList.remove('active');if(phase==='running'){round.release(lane,soundtrack.time+settings.offset/1000);processEvents(soundtrack.time,performance.now());updateHud(soundtrack.time);}}
}
function clearInputs() { sources.clear();inputSources.clear();document.querySelectorAll('[data-lane]').forEach(el=>el.classList.remove('active'));round?.pause(); }
function pauseGame(showModal=true) {
  if(!['running','countdown'].includes(phase))return;
  pauseTarget=phase;phase='paused';cancelAnimationFrame(animation);clearInputs();soundtrack.pause();$('transmissionLabel').textContent='TRANSMISSÃO SUSPENSA';
  if(showModal&&!$('pauseDialog').open)$('pauseDialog').showModal();announce('Jogo pausado. A música e as notas estão paradas.');
}
async function resumeGame() {
  if(phase!=='paused')return;
  phase='resuming';$('resumeButton').disabled=true;
  try { await soundtrack.resume(); } finally { $('resumeButton').disabled=false; }
  if(phase!=='resuming')return;
  phase=pauseTarget;round.resume(soundtrack.time+settings.offset/1000);$('pauseDialog').close();$('transmissionLabel').textContent=phase==='running'?'TRANSMISSÃO EM ANDAMENTO':'CONECTANDO AO CORREDOR';
  $('highway').focus({preventScroll:true});announce('Transmissão retomada.');animation=requestAnimationFrame(gameLoop);
}
function finishGame(completed) {
  if(!['running','countdown'].includes(phase))return;
  phase='ending';cancelAnimationFrame(animation);clearInputs();updateHud(Math.min(soundtrack.time,songDuration(SONGS[selectedSong])));
  const result={song:SONGS[selectedSong].id,difficulty,practice:round.practice,completed,score:round.score,accuracy:Math.round(round.accuracy*100)/100,maxCombo:round.maxCombo,misses:round.counts.miss,counts:{...round.counts},date:new Date().toISOString()};
  const best=bestRecord(result.song,result.difficulty,result.practice),isRecord=completed&&result.score>0&&(!best||result.score>best.score);
  records.push(result);records=records.slice(-100);try{localStorage.setItem(recordKey,JSON.stringify(records));}catch{toast('O navegador não permitiu salvar o recorde. O resultado continua disponível nesta rodada.');}
  if(!completed&&!settings.reduced)triggerScare(true);
  else if(!completed)soundtrack.scare(true);
  const audioToStop=soundtrack;
  resultTimer=setTimeout(()=>{if(screamDetector.pendingAt===null||!microphone.active)audioToStop.stop();renderResult(result,isRecord);},!completed&&!settings.reduced?1250:220);
}
function renderResult(result,isRecord) {
  phase='result';$('scare').hidden=true;$('game').hidden=true;$('resultScreen').hidden=false;document.body.classList.remove('playing');document.body.classList.add('ended');
  $('dangerVignette').style.opacity='0';document.querySelector('.app').classList.remove('strong-scare');
  const rank=!result.completed?'X':result.accuracy===100?'SS':result.accuracy>=95?'S':result.accuracy>=85?'A':result.accuracy>=70?'B':'C';
  $('resultRank').textContent=rank;$('resultRank').style.color=result.completed?'#d2a470':'#c66b57';
  $('resultEyebrow').textContent=result.completed?'TRANSMISSÃO CONCLUÍDA':'O SINAL FOI PERDIDO';
  $('resultTitle').textContent=result.completed?(result.practice?'UM PASSO DE CADA VEZ.':'VOCÊ AINDA ESTÁ AQUI.'):'ELA ENCONTROU VOCÊ.';
  $('resultDescription').textContent=result.completed?(result.practice?'Você praticou a música inteira. Tente novamente no seu ritmo.':'Você sobreviveu à última batida. Mas o corredor continua aberto.'):'O corredor guarda seus erros. Volte e tente uma nova sequência.';
  $('resultSong').textContent=SONGS[selectedSong].title;$('resultDifficulty').textContent=DIFFICULTIES[difficulty].name;$('resultPractice').hidden=!result.practice;
  $('resultScore').textContent=result.score.toLocaleString('pt-BR');
  $('resultAccuracy').textContent=`${Math.round(result.accuracy)}%`;$('resultCombo').textContent=result.maxCombo;$('resultMisses').textContent=result.misses;
  $('judgmentTotals').innerHTML=`<span>PERFEITOS ${result.counts.perfect}</span><span>BONS ${result.counts.good}</span><span>NO LIMITE ${result.counts.late}</span>`;
  const loreTitle=result.completed?`REGISTRO RECUPERADO / ${CHAPTERS[selectedSong].title}`:'GRAVAÇÃO INTERROMPIDA';
  const loreText=result.completed?CHAPTERS[selectedSong].after:'Jana continua na linha, mas não ouve uma resposta. No arquivo aparece um nome a mais entre os créditos: o de Davi. A fita permite uma nova tentativa.';
  $('resultLore').replaceChildren();const label=document.createElement('span'),paragraph=document.createElement('p');label.textContent=loreTitle;paragraph.textContent=loreText;$('resultLore').append(label,paragraph);$('resultLore').hidden=false;
  $('newRecord').hidden=!isRecord;$('nextSongButton').hidden=selectedSong>=SONGS.length-1;
  $('transmissionLabel').textContent=result.completed?'UM SOBREVIVENTE. POR ENQUANTO.':'NENHUM SINAL DE VIDA';
  $('footerCaption').textContent='O CORREDOR CONTINUA ABERTO.';$('retryButton').focus({preventScroll:true});
  announce(`${result.completed?'Música concluída':'Fim da rodada'}. ${result.score} pontos, ${Math.round(result.accuracy)} por cento de precisão.`);updateMenuRecord();
}
function backToMenu() {
  stopMicrophone();clearTimeout(resultAudioTimer);scareDirector.reset();
  clearTimeout(captionTimer);$('hauntCaption').hidden=true;
  ++runId;cancelAnimationFrame(animation);clearTimeout(resultTimer);clearTimeout(scareTimer);soundtrack?.stop();clearInputs();
  phase='menu';$('pauseDialog').close();$('game').hidden=true;$('resultScreen').hidden=true;$('lobby').hidden=false;$('scare').hidden=true;
  $('dangerVignette').style.opacity='0';document.body.classList.remove('playing','ended','screen-miss','signal-flash');document.querySelector('.app').classList.remove('strong-scare');document.querySelector('.stage-art').style.transform='';
  $('transmissionLabel').textContent='TRANSMISSÃO INTERROMPIDA';$('footerCaption').textContent='4 SETAS. UMA CHANCE DE SAIR.';$('startButton').disabled=false;updateMenuRecord();window.scrollTo({top:0,behavior:'instant'});
}
function openDialog(id) {
  if(['loading','ending','resuming'].includes(phase))return;
  if(['countdown','running'].includes(phase))pauseGame(false);
  if(!$('pauseDialog').open)$(id).showModal();
}
function renderRecords() {
  const host=$('recordsContent');host.replaceChildren();const bests=[];
  for(const song of SONGS)for(const diff of Object.keys(DIFFICULTIES))for(const practice of [false,true]){const best=bestRecord(song.id,diff,practice);if(best)bests.push({song,diff,practice,best});}
  if(!bests.length){const p=document.createElement('p');p.className='record-empty';p.textContent='Nenhuma transmissão registrada. Entre no corredor para salvar seu primeiro resultado.';host.append(p);return;}
  const list=document.createElement('div');list.className='record-list';
  for(const {song,diff,practice,best} of bests){const row=document.createElement('div');row.className='record-row';row.innerHTML=`<strong>${song.title}</strong><span>${best.score.toLocaleString('pt-BR')} PTS</span><small>${DIFFICULTIES[diff].name}${practice?' · TREINO':''} · ${best.completed?'CONCLUÍDA':'INTERROMPIDA'}</small><small>${Math.round(best.accuracy)}% · COMBO ${best.maxCombo}</small>`;list.append(row);}host.append(list);
}

function beginChapter(){
  if(!['menu','result'].includes(phase))return;
  chapterPageIndex=0;paintChapter();$('chapterDialog').showModal();
}
function paintChapter(){
  const chapter=CHAPTERS[selectedSong],page=chapter.pages[chapterPageIndex];
  $('chapterLabel').textContent=chapter.label;$('chapterPage').textContent=`${String(chapterPageIndex+1).padStart(2,'0')} / ${String(chapter.pages.length).padStart(2,'0')}`;
  $('chapterTitle').textContent=page.title;$('chapterText').textContent=page.text;$('chapterQuote').textContent=page.quote;
  $('chapterNext').textContent=chapterPageIndex===chapter.pages.length-1?'ENTRAR NO CORREDOR':'CONTINUAR A FITA';
}
function startFromStory(){ $('chapterDialog').close();startGame(); }
function renderDossier(){
  const host=$('loreContent');host.replaceChildren();
  CHAPTERS.forEach((chapter,index)=>{
    const section=document.createElement('section');section.className='dossier-chapter';
    const label=document.createElement('small'),title=document.createElement('h3');label.textContent=chapter.label;title.textContent=`0${index+1} / ${chapter.title}`;section.append(label,title);
    chapter.pages.forEach(page=>{const sub=document.createElement('h4'),p=document.createElement('p'),quote=document.createElement('blockquote');sub.textContent=page.title;p.textContent=page.text;quote.textContent=page.quote;section.append(sub,p,quote);});
    const after=document.createElement('p');after.className='dossier-after';after.textContent='Após a música: '+chapter.after;section.append(after);host.append(section);
  });
}
$('chapterNext').addEventListener('click',()=>{if(chapterPageIndex<CHAPTERS[selectedSong].pages.length-1){chapterPageIndex++;paintChapter();$('chapterNext').focus();}else startFromStory();});
$('chapterSkip').addEventListener('click',startFromStory);
$('dossierButton').addEventListener('click',()=>{renderDossier();openDialog('loreDialog');});

// Every direction accepts arrows and WASD. Pointer capture permits independent fingers.
const keyMap={ArrowLeft:0,ArrowDown:1,ArrowUp:2,ArrowRight:3,a:0,s:1,w:2,d:3};
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  const modal=document.querySelector('dialog[open]');
  if(modal)return;
  if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  if(event.key==='Escape'||event.key.toLowerCase()==='p'){
    if(['running','countdown'].includes(phase)){event.preventDefault();if(!event.repeat)pauseGame();}return;
  }
  const lane=keyMap[event.key]??keyMap[event.key.toLowerCase()];
  if(lane!==undefined&&['running','countdown'].includes(phase)){event.preventDefault();if(!event.repeat)press(lane,`key:${event.code||event.key}`);}
});
document.addEventListener('keyup',event=>release(`key:${event.code||event.key}`));
for(const button of document.querySelectorAll('[data-lane]')){
  button.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;event.preventDefault();button.setPointerCapture(event.pointerId);press(Number(button.dataset.lane),`pointer:${event.pointerId}`);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,event=>release(`pointer:${event.pointerId}`));
  button.addEventListener('click',event=>{if(event.detail===0){const key=`tap:${button.dataset.lane}`;press(Number(button.dataset.lane),key);release(key);}});
}
document.querySelectorAll('[data-song]').forEach(button=>button.addEventListener('click',()=>selectSong(Number(button.dataset.song))));
document.querySelectorAll('[data-difficulty]').forEach(button=>button.addEventListener('click',()=>{if(phase!=='menu')return;difficulty=button.dataset.difficulty;document.querySelectorAll('[data-difficulty]').forEach(el=>{const selected=el===button;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',selected);});updateMenuRecord();}));
$('practiceToggle').addEventListener('change',updateMenuRecord);$('startButton').addEventListener('click',beginChapter);$('retryButton').addEventListener('click',startGame);
$('nextSongButton').addEventListener('click',()=>{selectSong(selectedSong+1);beginChapter();});$('menuButton').addEventListener('click',backToMenu);$('quitButton').addEventListener('click',backToMenu);
$('brandLink').addEventListener('click',event=>{event.preventDefault();if(['running','countdown'].includes(phase))pauseGame();else if(phase==='result')backToMenu();});
$('pauseButton').addEventListener('click',()=>pauseGame());$('resumeButton').addEventListener('click',resumeGame);
$('pauseDialog').addEventListener('cancel',event=>{event.preventDefault();resumeGame();});
$('settingsButton').addEventListener('click',()=>openDialog('settingsDialog'));$('helpButton').addEventListener('click',()=>openDialog('helpDialog'));
$('recordsButton').addEventListener('click',()=>{renderRecords();openDialog('recordsDialog');});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
for(const id of ['settingsDialog','helpDialog','recordsDialog','loreDialog'])$(id).addEventListener('close',()=>{if(phase==='paused'&&!$('pauseDialog').open)$('pauseDialog').showModal();});
$('volumeSlider').addEventListener('input',()=>{settings.volume=Number($('volumeSlider').value)/100;settings.muted=settings.volume===0;applySettings();saveSettings();});
$('offsetSlider').addEventListener('input',()=>{settings.offset=Number($('offsetSlider').value);applySettings();saveSettings();});
$('reducedToggle').addEventListener('change',()=>{settings.reduced=$('reducedToggle').checked;if(settings.reduced){$('scare').hidden=true;document.querySelector('.app').classList.remove('strong-scare');}applySettings();saveSettings();});
$('audioToggle').addEventListener('click',()=>{if(settings.volume===0){settings.volume=mutedBefore||.55;settings.muted=false;}else{mutedBefore=settings.volume;settings.muted=!settings.muted;}applySettings();saveSettings();toast(settings.muted?'Som desativado.':'Som ativado.');});
$('fullscreenButton').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('Tela cheia não está disponível neste navegador.');}catch{toast('O navegador não permitiu entrar em tela cheia.');}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();});window.addEventListener('blur',()=>{if(['running','countdown'].includes(phase))pauseGame();});
window.addEventListener('pagehide',()=>{soundtrack?.stop();stopMicrophone();});new ResizeObserver(resizeCanvas).observe($('highway'));
function paintMicUI() {
  const active=microphone.active,waiting=microphone.requesting;
  const setText=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  let title='MICROFONE DESLIGADO',detail='Ative se quiser que a entidade escute seus gritos.';
  if(micState==='error'){title='NÃO FOI POSSÍVEL ATIVAR';detail=micMessage;}
  if(waiting){title='AGUARDANDO PERMISSÃO';detail='Autorize o microfone na janela do navegador.';}
  if(active){
    title=calibration?'CALIBRANDO O AMBIENTE':screamDetector.pendingAt!==null?'ELA OUVIU VOCÊ.':phase==='paused'?'MICROFONE EM ESPERA':'MICROFONE ATIVO';
    detail=calibration?'Fique em silêncio por dois segundos.':screamDetector.pendingAt!==null?'O sinal alto deixou um eco na transmissão.':'Grito detectado → susto extra após 3 segundos, mesmo sem erros.';
  }
  setText('micStatus',title);setText('micDetail',detail);
  setText('micToggle',waiting?'AGUARDANDO…':active?'DESATIVAR MICROFONE':micState==='error'?'TENTAR NOVAMENTE':'ATIVAR MICROFONE');
  $('micToggle').disabled=waiting;$('micCalibrate').disabled=!active||!!calibration;
  $('micButton').classList.toggle('mic-on',active);$('micButton').setAttribute('aria-pressed',String(active));
  $('micButton').setAttribute('aria-label',active?'Microfone ativo. Abrir ajustes do microfone':'Ativar microfone opcional');
  $('micButton').title=active?'Microfone ativo — ajustes':'Microfone opcional';
  const level=active?Math.min(1,micLevel/.4):0;
  $('micLevel').style.transform=`scaleX(${level})`;
  $('micMeter').setAttribute('aria-valuenow',String(Math.round(level*100)));
  $('micThresholdMark').style.left=`${Math.min(100,settings.micThreshold/.4*100)}%`;
  $('micThreshold').value=Math.round(settings.micThreshold*100);
  setText('micThresholdOutput',`${Math.round(settings.micThreshold*100)}%`);
  $('micMeter').classList.toggle('loud',active&&micLevel>=settings.micThreshold);
  const gameText=active?(screamDetector.pendingAt!==null?'MIC · ECO DETECTADO':phase==='paused'?'MIC · EM ESPERA':'MIC · ESCUTANDO'):'MIC · DESLIGADO';
  setText('micGameStatus',gameText);$('micGameStatus').classList.toggle('mic-on',active);
  setText('micOpenButton',active?'MICROFONE ATIVO · AJUSTAR ↗':'MICROFONE OPCIONAL · ATIVAR ↗');
}
async function startMicrophone() {
  if(microphone.active||microphone.requesting)return;
  micState='request';const enabling=microphone.enable();paintMicUI();
  const ok=await enabling;
  if(!ok){
    const messages={
      NotAllowedError:'Permissão não concedida. O jogo continua; você pode permitir o microfone nas opções do navegador e tentar de novo.',
      NotFoundError:'Nenhum microfone foi encontrado. Conecte um dispositivo e tente novamente.',
      NotReadableError:'O microfone está ocupado ou indisponível. Verifique o dispositivo e tente novamente.',
      InsecureContext:'Este navegador exige HTTPS ou localhost para captar áudio. O jogo funciona sem microfone; veja LEIA-ME.txt para a alternativa local.',
      NotSupportedError:'Este navegador não oferece a análise de áudio necessária.',
      SecurityError:'O navegador bloqueou o acesso ao microfone neste endereço.'
    };
    micState=microphone.error?'error':'off';micMessage=messages[microphone.error]||'Não foi possível acessar o microfone. Verifique as permissões e tente novamente.';
    paintMicUI();return;
  }
  micState='active';micLevel=0;screamDetector.reset();micClock=0;lastMicFrame=null;
  cancelAnimationFrame(micAnimation);micAnimation=requestAnimationFrame(microphoneLoop);paintMicUI();
  announce('Microfone ativado. A análise de volume acontece neste aparelho.');
}
function stopMicrophone(update=true) {
  microphone.stop();cancelAnimationFrame(micAnimation);micAnimation=null;
  screamDetector.reset();micState='off';micLevel=0;calibration=null;lastMicFrame=null;
  if(phase==='result'){clearTimeout(resultAudioTimer);soundtrack?.stop();}
  if(update)paintMicUI();
}
function microphoneLoop(now) {
  if(!microphone.active)return;
  const delta=lastMicFrame===null?0:Math.min(.25,Math.max(0,(now-lastMicFrame)/1000));lastMicFrame=now;
  const unobstructed=!document.hidden&&!document.querySelector('dialog[open]');
  if(unobstructed&&['running','ending','result'].includes(phase))micClock+=delta;
  micLevel=microphone.readLevel();
  if(calibration){
    calibration.values.push(micLevel);
    if(now>=calibration.until){
      const samples=calibration.values.sort((a,b)=>a-b),ambient=samples[Math.floor((samples.length-1)*.95)]||0;
      settings.micThreshold=clamp(ambient*4+.035,.06,.35);screamDetector.threshold=settings.micThreshold;
      calibration=null;saveSettings();toast('Limiar calibrado. Você pode ajustar a sensibilidade abaixo.');
    }
  }
  screamDetector.feed(micLevel,micClock,phase==='running'&&unobstructed&&!calibration,micClock<micSuppressedUntil);
  // This timer has no score, accuracy, combo or health condition.
  const canFire=unobstructed&&['running','result'].includes(phase)&&$('scare').hidden;
  if(screamDetector.poll(micClock,canFire)){
    triggerScare(false,'scream');
    if(phase==='result'){
      const audioToStop=soundtrack;clearTimeout(resultAudioTimer);
      resultAudioTimer=setTimeout(()=>audioToStop?.stop(),1600);
    }
  }
  if(now-lastMicPaint>90){paintMicUI();lastMicPaint=now;}
  micAnimation=requestAnimationFrame(microphoneLoop);
}
function openMicSettings(){
  openDialog('settingsDialog');
  if($('settingsDialog').open)$('micPanel').scrollIntoView({block:'nearest',behavior:'instant'});
}
microphone.onDisconnect=()=>{
  stopMicrophone(false);micState='error';micMessage='O microfone foi desconectado. Conecte-o e tente novamente.';paintMicUI();
};
$('micToggle').addEventListener('click',()=>{if(microphone.active)stopMicrophone();else startMicrophone();});
$('micButton').addEventListener('click',openMicSettings);$('micOpenButton').addEventListener('click',openMicSettings);
$('micThreshold').addEventListener('input',()=>{
  calibration=null;settings.micThreshold=Number($('micThreshold').value)/100;screamDetector.threshold=settings.micThreshold;
  screamDetector.loudSince=null;paintMicUI();saveSettings();
});
$('micCalibrate').addEventListener('click',()=>{if(microphone.active){calibration={until:performance.now()+2200,values:[]};paintMicUI();}});

applySettings();updateMenuRecord();

})();
