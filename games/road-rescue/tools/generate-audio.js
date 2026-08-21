/* Rebuild the four friendly local Road Rescue vehicle WAV files. */
const fs = require('fs');
const path = require('path');
const sampleRate = 22050;
const duration = 1.2;
const count = Math.floor(sampleRate * duration);
const patterns = {
  taxi: [620, 0, 760, 0],
  police: [660, 880, 660, 880],
  fire: [420, 570, 420, 570],
  ambulance: [520, 780, 520, 780],
};
function wav(name, notes) {
  const data = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const segment = Math.min(3, Math.floor(t / (duration / 4)));
    const freq = notes[segment];
    const within = (t % (duration / 4)) / (duration / 4);
    const fade = Math.min(1, within * 12, (1 - within) * 12);
    const harmonic = freq ? Math.sin(2 * Math.PI * freq * t) * .72 + Math.sin(2 * Math.PI * freq * 2 * t) * .14 : 0;
    data.writeInt16LE(Math.round(harmonic * fade * 6500), i * 2);
  }
  const out = Buffer.alloc(44 + data.length);
  out.write('RIFF', 0); out.writeUInt32LE(36 + data.length, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24); out.writeUInt32LE(sampleRate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(data.length, 40); data.copy(out, 44);
  fs.mkdirSync(path.join(__dirname, '..', 'audio'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'audio', `${name}.wav`), out);
}
for (const [name, notes] of Object.entries(patterns)) wav(name, notes);
console.log('Generated Road Rescue vehicle audio.');
