// Points, levels and unlockable outfits for Nova.
const EventEmitter = require('events');
const UNLOCKS = [
  { level: 2, slot: 'eyes', id: 'glasses', name: 'Round glasses 👓' },
  { level: 3, slot: 'hat', id: 'cap', name: 'Orange cap 🧢' },
  { level: 4, slot: 'neck', id: 'scarf', name: 'Cosy scarf 🧣' },
  { level: 5, slot: 'hat', id: 'headphones', name: 'Headphones 🎧' },
  { level: 6, slot: 'neck', id: 'bowtie', name: 'Bow tie 🎀' },
  { level: 7, slot: 'eyes', id: 'shades', name: 'Cool shades 🕶' },
  { level: 8, slot: 'hat', id: 'crown', name: 'Little crown 👑' },
  { level: 10, slot: 'aura', id: 'sparkles', name: 'Sparkle aura ✨' },
  { level: 12, slot: 'hat', id: 'flower', name: 'Flower 🌼' },
  { level: 15, slot: 'aura', id: 'rainbow', name: 'Rainbow glow 🌈' }
];
const levelFor = (xp) => { let lvl = 1, need = 100, acc = 0; while (xp >= acc + need) { acc += need; lvl++; need = Math.round(need * 1.15); } return { level: lvl, into: xp - acc, need }; };

class Rewards extends EventEmitter {
  init(store) { this.store = store; }
  award(points, reason) {
    const s = this.store.get();
    const xp = { total: 0, day: '', today: 0, log: [], ...(s.xp || {}) };
    const today = new Date().toDateString();
    if (xp.day !== today) { xp.day = today; xp.today = 0; }
    const before = levelFor(xp.total).level;
    xp.total += points; xp.today += points;
    xp.log = (xp.log || []).concat([{ t: Date.now(), p: points, r: reason }]).slice(-200);
    this.store.set({ xp });
    const after = levelFor(xp.total).level;
    if (after > before) {
      const unlocked = UNLOCKS.filter((u) => u.level > before && u.level <= after);
      // auto-wear the newest unlock
      if (unlocked.length) { const u = unlocked[unlocked.length - 1]; this.store.set({ outfit: { [u.slot]: u.id } }); }
      this.emit('levelup', { level: after, unlocked });
    }
    this.emit('award', { points, reason, total: xp.total });
    return xp;
  }
  status() {
    const s = this.store.get(), xp = s.xp || { total: 0, today: 0 };
    const lv = levelFor(xp.total || 0);
    return { ...lv, total: xp.total || 0, today: xp.day === new Date().toDateString() ? xp.today : 0, unlocks: UNLOCKS.map((u) => ({ ...u, unlocked: u.level <= lv.level })), outfit: s.outfit || {}, log: (xp.log || []).slice(-15).reverse() };
  }
}
module.exports = new Rewards();
module.exports.UNLOCKS = UNLOCKS;
module.exports.levelFor = levelFor;
