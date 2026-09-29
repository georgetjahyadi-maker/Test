import React, { useEffect, useRef, useState } from 'react';
import { client, useGame, run, toast } from '../../client/client';
import { Panel, PageTitle } from '../components';
import { listSaves, putSave, readSave, deleteSave, downloadSave, readFile, type SaveMeta } from '../../client/storage';
import { formatDate } from '../../sim/core/time';
import { audio } from '../../audio/audio';
import { setAccessible } from '../../render/palette';
import { SAVE_VERSION } from '../../sim/systems/init';

function lsGet(k: string, d: string): string {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
}

const AUTOPAUSE: { id: string; label: string }[] = [
  { id: 'decision', label: 'Events that need a decision' },
  { id: 'crisis', label: 'Crises, disasters and security events' },
  { id: 'milestone', label: 'Civilization milestones' },
];

export function SystemPanel() {
  const s = useGame()!;
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [name, setName] = useState(() => `${s.une.short} ${formatDate(s.day)}`);
  const [sound, setSound] = useState(() => lsGet('helios.sound', '0') === '1');
  const [music, setMusic] = useState(() => lsGet('helios.music', '1') === '1');
  const [access, setAccess] = useState(() => lsGet('helios.accessible', '0') === '1');
  const [autosave, setAutosave] = useState(() => lsGet('helios.autosave', '1') === '1');
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => listSaves().then(setSaves);
  useEffect(() => {
    refresh();
  }, []);
  const save = async (id?: string, label?: string) => {
    const json = await client.saveJson();
    if (!json) return;
    await putSave({ id: id ?? `save-${Date.now()}`, name: label ?? name, savedAt: Date.now(), gameDate: formatDate(s.day), union: s.une.short, auto: false }, json);
    toast('Campaign saved', 'ok');
    refresh();
  };
  return (
    <div className="page">
      <PageTitle title="Game" sub={`Seed “${s.seed}” · save format v${SAVE_VERSION}`} />
      <div className="grid g2">
        <Panel title="Save campaign" accent="politics">
          <div className="row">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
            <button className="btn primary" onClick={() => save()}>Save</button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={async () => { const json = await client.saveJson(); if (json) await downloadSave(name, json); }}>Export .helios file</button>
            <input ref={fileRef} type="file" accept=".helios,.json,application/json" style={{ display: 'none' }} onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const json = await readFile(f);
                client.load(json);
                toast('Save imported', 'ok');
              } catch (err: any) {
                toast(`Could not read save: ${err?.message ?? err}`, 'crit');
              }
              e.target.value = '';
            }} />
            <button className="btn" onClick={() => fileRef.current?.click()}>Import .helios file…</button>
          </div>
          <label className="row small" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={autosave} onChange={(e) => { setAutosave(e.target.checked); lsSet('helios.autosave', e.target.checked ? '1' : '0'); }} />
            Autosave every in-game year (three rotating slots)
          </label>
          <div className="tiny muted" style={{ marginTop: 6 }}>Saves are compressed and kept in this browser's IndexedDB. Export a file to move a campaign between machines. The simulation is deterministic, so the same seed and the same decisions give the same history.</div>
        </Panel>
        <Panel title="Saved campaigns" accent="politics">
          {saves.length === 0 && <div className="small muted">No saves yet.</div>}
          <table className="t">
            <tbody>
              {saves.map((sv) => (
                <tr key={sv.id}>
                  <td><div className="hl small">{sv.name}{sv.auto ? ' (auto)' : ''}</div><div className="tiny muted">{sv.gameDate} · {sv.union} · {new Date(sv.savedAt).toLocaleString()} · {(sv.size / 1024).toFixed(0)} KB</div></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn small" onClick={async () => { const json = await readSave(sv.id); if (json) { client.load(json); toast(`Loaded ${sv.name}`, 'ok'); } }}>Load</button>
                    {!sv.auto && <button className="btn small" onClick={() => save(sv.id, sv.name)}>Overwrite</button>}
                    <button className="btn small danger" onClick={async () => { if (confirm(`Delete ${sv.name}?`)) { await deleteSave(sv.id); refresh(); } }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Auto-pause" accent="politics">
          {AUTOPAUSE.map((a) => (
            <label key={a.id} className="row small" style={{ marginBottom: 4 }}>
              <input type="checkbox" checked={s.settings.autoPause[a.id] !== false} onChange={(e) => run({ type: 'setAutoPause', category: a.id, value: e.target.checked })} />
              {a.label}
            </label>
          ))}
          <div className="tiny muted">The game pauses automatically when one of these happens, so decisions are never missed at high speed.</div>
        </Panel>
        <Panel title="Presentation" accent="politics">
          <label className="row small" style={{ marginBottom: 4 }}>
            <input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); audio.setEnabled(e.target.checked); }} />
            Interface sounds
          </label>
          <label className="row small" style={{ marginBottom: 4 }}>
            <input type="checkbox" checked={music} disabled={!sound} onChange={(e) => { setMusic(e.target.checked); audio.setMusic(e.target.checked); }} />
            Generative ambient music (changes with each era)
          </label>
          <label className="row small" style={{ marginBottom: 4 }}>
            <input type="checkbox" checked={access} onChange={(e) => { setAccess(e.target.checked); setAccessible(e.target.checked); lsSet('helios.accessible', e.target.checked ? '1' : '0'); }} />
            Colour-blind-safe palette (Okabe–Ito)
          </label>
          <div className="hr" />
          <button className="btn danger" onClick={() => { if (confirm('Leave this campaign? Unsaved progress will be lost.')) location.reload(); }}>Quit to main menu</button>
        </Panel>
        <Panel title="How to play" accent="politics" style={{ gridColumn: '1 / -1' }}>
          <div className="small" style={{ lineHeight: 1.7 }}>
            <b className="hl">You are the UNE.</b> Member states, corporations and colonies pursue their own interests. You can build UNE facilities and fleets, fund institutions, direct research and propose laws, but most change needs votes in the Chamber of Nations and the Assembly.<br />
            <b className="hl">Start with the Moon.</b> Found a polar base (Colonies → Found a settlement). Give it life support, power and a landing pad, then supply it from the LEO hub. Ice becomes water, oxygen and propellant, and local propellant makes every later step cheaper.<br />
            <b className="hl">Watch the physics.</b> The Engineering and Logistics screens show whether a ship can fly a route: delta-v, thrust-to-weight, refuelling, crew endurance and launch windows.<br />
            <b className="hl">Build legitimacy.</b> Successful projects, fair budgets and representation for settlers strengthen the Compact. Overreach, scandal and neglect weaken it. With too little support, states may leave and the union can fragment.<br />
            <b className="hl">Delegation.</b> The advisor can manage the budget, research, logistics, construction, expansion and legislation (UNE → Budget). Turn domains off to take direct control.<br />
            <b className="hl">Explanations.</b> Underlined numbers and top-bar values open a breakdown of how they were calculated.
          </div>
        </Panel>
      </div>
    </div>
  );
}
