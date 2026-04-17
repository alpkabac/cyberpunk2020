'use client';

import { useMemo, useState } from 'react';
import { Character, Zone, Armor } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import { hitLocationRollRanges } from '@/lib/game-logic/lookups';
import { maxLayeredSP } from '@/lib/game-logic/formulas';
import {
  isSeveredConditionName,
  severedConditionName,
  zoneFromSeveredConditionName,
} from '@/lib/game-logic/conditions';

interface BodyTabProps {
  character: Character;
  editable: boolean;
}

const ZONE_LABELS: Record<Zone, string> = {
  Head: 'Head',
  Torso: 'Torso',
  rArm: 'Right Arm',
  lArm: 'Left Arm',
  rLeg: 'Right Leg',
  lLeg: 'Left Leg',
};

const ZONE_ORDER: Zone[] = ['Head', 'Torso', 'rArm', 'lArm', 'rLeg', 'lLeg'];

/**
 * FNFF d10 hit-location table — numeric range shown on the doll for quick
 * reference. Mirrors `hitLocationRollRanges` in lookups.
 */

/** Fill colour by effective SP — darker = tougher armor. */
function spFill(effectiveSP: number): string {
  if (effectiveSP <= 0) return '#f1f5f9'; // slate-100 (bare)
  if (effectiveSP < 10) return '#bae6fd'; // sky-200
  if (effectiveSP < 20) return '#38bdf8'; // sky-400
  if (effectiveSP < 30) return '#0284c7'; // sky-600
  return '#0c4a6e'; // sky-900
}

function strokeFor(zone: Zone, selected: boolean, severed: boolean): string {
  if (severed) return '#7f1d1d'; // red-900
  if (selected) return '#b45309'; // amber-700
  return '#111827'; // gray-900
}

export function BodyTab({ character, editable }: BodyTabProps) {
  const [selected, setSelected] = useState<Zone>('Torso');
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);

  const armorItems = useMemo(
    () => character.items.filter((i): i is Armor => i.type === 'armor' && i.equipped),
    [character.items],
  );

  const layeredSpByZone: Record<Zone, number> = useMemo(() => {
    const result = {} as Record<Zone, number>;
    for (const zone of ZONE_ORDER) {
      const spValues: number[] = [];
      for (const a of armorItems) {
        const cov = a.coverage?.[zone];
        if (cov && cov.stoppingPower > 0) spValues.push(cov.stoppingPower);
      }
      if (spValues.length === 0) result[zone] = 0;
      else if (spValues.length === 1) result[zone] = spValues[0];
      else result[zone] = maxLayeredSP(spValues);
    }
    return result;
  }, [armorItems]);

  const severedByZone: Partial<Record<Zone, boolean>> = useMemo(() => {
    const out: Partial<Record<Zone, boolean>> = {};
    for (const c of character.conditions ?? []) {
      const zone = zoneFromSeveredConditionName(c.name);
      if (zone) out[zone] = true;
    }
    return out;
  }, [character.conditions]);

  const severedConditions = (character.conditions ?? []).filter((c) =>
    isSeveredConditionName(c.name),
  );

  const btm = character.derivedStats?.btm ?? 0;
  const woundState = character.derivedStats?.woundState ?? 'Uninjured';

  const hitLoc = character.hitLocations[selected];
  const ablation = hitLoc.ablation;
  const effectiveSP = Math.max(0, hitLoc.stoppingPower - ablation);
  const layeredSP = layeredSpByZone[selected];
  const sdpSum = character.sdp.sum[selected] ?? 0;
  const sdpCur = character.sdp.current[selected] ?? 0;
  const isSevered = !!severedByZone[selected];

  // What armor items cover the selected zone?
  const coveringArmor = armorItems.filter(
    (a) => (a.coverage?.[selected]?.stoppingPower ?? 0) > 0,
  );

  const removeSeverance = (zone: Zone) => {
    if (!editable) return;
    const name = severedConditionName(zone);
    if (!name) return;
    const next = (character.conditions ?? []).filter((c) => c.name !== name);
    updateCharacterField(character.id, 'conditions', next);
  };

  // SVG geometry — facing the viewer; character's RIGHT side is on viewer's LEFT.
  const zonePaths: Record<Zone, { shape: 'circle' | 'rect'; props: Record<string, number> }> = {
    Head: { shape: 'circle', props: { cx: 90, cy: 40, r: 22 } },
    Torso: { shape: 'rect', props: { x: 65, y: 65, width: 50, height: 92, rx: 4 } },
    rArm: { shape: 'rect', props: { x: 38, y: 70, width: 22, height: 90, rx: 6 } },
    lArm: { shape: 'rect', props: { x: 120, y: 70, width: 22, height: 90, rx: 6 } },
    rLeg: { shape: 'rect', props: { x: 70, y: 160, width: 20, height: 78, rx: 4 } },
    lLeg: { shape: 'rect', props: { x: 92, y: 160, width: 20, height: 78, rx: 4 } },
  };

  const renderZone = (zone: Zone) => {
    const { shape, props } = zonePaths[zone];
    const zoneHitLoc = character.hitLocations[zone];
    const zoneAbl = zoneHitLoc.ablation;
    const zoneEffSP = Math.max(0, zoneHitLoc.stoppingPower - zoneAbl);
    const severed = !!severedByZone[zone];
    const isSel = selected === zone;
    const fill = severed ? '#fecaca' : spFill(zoneEffSP);
    const stroke = strokeFor(zone, isSel, severed);
    const common = {
      fill,
      stroke,
      strokeWidth: isSel ? 3 : severed ? 2.5 : 1.5,
      strokeDasharray: severed ? '5 3' : undefined,
      onClick: () => setSelected(zone),
      style: { cursor: 'pointer' as const },
    };

    return (
      <g key={zone}>
        {shape === 'circle' ? (
          <circle {...(props as { cx: number; cy: number; r: number })} {...common} />
        ) : (
          <rect
            {...(props as { x: number; y: number; width: number; height: number; rx: number })}
            {...common}
          />
        )}
        {/* SP label in the zone */}
        {shape === 'circle' ? (
          <text
            x={props.cx}
            y={props.cy + 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={zoneEffSP >= 20 ? '#fff' : '#111827'}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            SP {zoneEffSP}
          </text>
        ) : (
          <text
            x={props.x + props.width / 2}
            y={props.y + props.height / 2 + 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={zoneEffSP >= 20 ? '#fff' : '#111827'}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            SP {zoneEffSP}
          </text>
        )}
        {/* Severance X mark */}
        {severed &&
          shape === 'rect' &&
          (() => {
            const x1 = props.x + 2;
            const y1 = props.y + 2;
            const x2 = props.x + props.width - 2;
            const y2 = props.y + props.height - 2;
            return (
              <g style={{ pointerEvents: 'none' }}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7f1d1d" strokeWidth={3} />
                <line x1={x2} y1={y1} x2={x1} y2={y2} stroke="#7f1d1d" strokeWidth={3} />
              </g>
            );
          })()}
        {/* Ablation pip */}
        {zoneAbl > 0 && (
          <text
            x={
              shape === 'circle'
                ? (props.cx as number) + 16
                : (props.x as number) + (props.width as number) - 4
            }
            y={shape === 'circle' ? (props.cy as number) - 14 : (props.y as number) + 10}
            textAnchor="end"
            fontSize={9}
            fontWeight={700}
            fill="#9a3412"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            −{zoneAbl}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Summary bar */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="border-2 border-black p-2 bg-white">
          <div className="text-[10px] uppercase text-gray-600">Wound state</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="font-bold text-base">{woundState}</div>
            {character.isStabilized && woundState !== 'Dead' && woundState.startsWith('Mortal') && (
              <span
                className="text-[9px] font-bold uppercase px-1.5 py-0.5 border border-teal-800 bg-teal-100 text-teal-950 rounded-sm"
                title="Ongoing death saves suppressed until new damage"
              >
                Stabilized
              </span>
            )}
          </div>
          <div className="text-gray-600">
            Damage {character.damage}/{character.damage >= 41 ? 'DEAD' : 40}
          </div>
        </div>
        <div className="border-2 border-black p-2 bg-white">
          <div className="text-[10px] uppercase text-gray-600">BTM</div>
          <div className="font-bold text-base">{btm}</div>
          <div className="text-gray-600">Body Type Mod</div>
        </div>
        <div className="border-2 border-black p-2 bg-white">
          <div className="text-[10px] uppercase text-gray-600">Stun target</div>
          <div className="font-bold text-base">
            ≤ {character.derivedStats?.stunSaveTarget ?? character.stats.bt.total}
          </div>
          <div className="text-gray-600">{character.isStunned ? 'STUNNED' : 'OK'}</div>
        </div>
        <div className="border-2 border-black p-2 bg-white">
          <div className="text-[10px] uppercase text-gray-600">Severed limbs</div>
          <div
            className={`font-bold text-base ${
              severedConditions.length > 0 ? 'text-red-700' : ''
            }`}
          >
            {severedConditions.length}
          </div>
          <div className="text-gray-600">
            {severedConditions.length > 0
              ? severedConditions
                  .map((c) => c.name.replace('severed_', '').replace(/_/g, ' '))
                  .join(', ')
              : 'None'}
          </div>
        </div>
      </section>

      {/* Paper-doll + zone detail */}
      <section className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-start">
        <div className="border-2 border-black bg-[#f5f5dc] p-3 flex flex-col items-center">
          <svg viewBox="0 0 180 250" width="180" height="250" role="img" aria-label="Body diagram">
            {ZONE_ORDER.map((z) => renderZone(z))}
          </svg>
          <div className="text-[10px] text-gray-700 mt-2 leading-tight text-center">
            Click a zone for details.
            <br />
            Fill shade ≈ effective SP. Dashed red = severed.
          </div>
        </div>

        <div className="border-2 border-black bg-white p-3 min-h-[260px]">
          <div className="flex items-baseline justify-between mb-2 border-b-2 border-black pb-1">
            <h3 className="text-lg font-bold uppercase">{ZONE_LABELS[selected]}</h3>
            <span className="text-xs text-gray-600">
              d10 hit range:{' '}
              <span className="font-mono font-bold">{hitLocationRollRanges[selected]}</span>
            </span>
          </div>

          {isSevered && (
            <div className="border-2 border-red-900 bg-red-50 p-2 mb-2 text-xs">
              <div className="font-bold uppercase text-red-900">Limb severed</div>
              <p className="text-red-950 mt-0.5">
                FNFF: single hit dealt &gt;8 final damage. Limb is gone until cyberware /
                medtech replacement. Ongoing Mortal 0 death save already resolved when the hit
                landed.
              </p>
              {editable && (
                <button
                  type="button"
                  onClick={() => removeSeverance(selected)}
                  className="mt-1 text-[10px] font-bold uppercase px-2 py-0.5 border border-red-900 text-red-900 bg-white hover:bg-red-100"
                  title="Clear the severance condition (e.g. cyberware install or narrative healing)"
                >
                  Clear severance (replaced / healed)
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
            <div className="border border-gray-400 p-2">
              <div className="text-[10px] uppercase text-gray-600">Effective SP</div>
              <div className="font-bold text-lg">{effectiveSP}</div>
              <div className="text-[10px] text-gray-600">
                base {hitLoc.stoppingPower}
                {ablation > 0 && ` − ${ablation} abl`}
              </div>
            </div>
            <div className="border border-gray-400 p-2">
              <div className="text-[10px] uppercase text-gray-600">Layered SP (equipped)</div>
              <div className="font-bold text-lg">{layeredSP}</div>
              <div className="text-[10px] text-gray-600">
                {coveringArmor.length === 0
                  ? 'no armor covering'
                  : `${coveringArmor.length} piece${coveringArmor.length === 1 ? '' : 's'}`}
              </div>
            </div>
            <div className="border border-gray-400 p-2">
              <div className="text-[10px] uppercase text-gray-600">Ablation</div>
              <div className="font-bold text-lg">{ablation}</div>
              <div className="text-[10px] text-gray-600">
                penetrating hits ablate 1 each (FNFF L6350)
              </div>
            </div>
            <div className="border border-gray-400 p-2">
              <div className="text-[10px] uppercase text-gray-600">Cyberlimb SDP</div>
              <div className="font-bold text-lg">
                {sdpSum > 0 ? `${sdpCur} / ${sdpSum}` : '—'}
              </div>
              <div className="text-[10px] text-gray-600">
                {sdpSum > 0 ? 'Tracked on Combat tab' : 'No cyberlimb installed'}
              </div>
            </div>
          </div>

          {coveringArmor.length > 0 && (
            <div className="border-t border-gray-300 pt-2 mb-2">
              <div className="text-[10px] font-bold uppercase text-gray-700 mb-1">
                Equipped armor covering this zone
              </div>
              <ul className="text-xs space-y-0.5">
                {coveringArmor.map((a) => {
                  const cov = a.coverage?.[selected];
                  return (
                    <li key={a.id} className="flex justify-between">
                      <span>{a.name}</span>
                      <span className="font-mono text-gray-700">
                        SP {cov?.stoppingPower ?? 0}
                        {cov?.ablation ? ` − ${cov.ablation} abl` : ''} · EV {a.encumbrance ?? 0}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-gray-600 leading-snug border-t border-gray-300 pt-2">
            <strong>Damage pipeline for this zone:</strong> raw dmg{' '}
            {selected === 'Head' && <em>×2 (head)</em>} − effective SP{' '}
            <strong>{effectiveSP}</strong> (AP halves first) − BTM <strong>{btm}</strong>{' '}
            (min 1 if armor pierced). &gt;8 final to{' '}
            {selected === 'Head'
              ? 'head → auto-kill.'
              : selected === 'Torso'
                ? 'torso does not sever.'
                : 'limb → severed + Mortal-0 save.'}
          </p>
        </div>
      </section>

      {/* Zone grid for quick scan */}
      <section>
        <h3 className="text-sm font-bold uppercase mb-2 border-b-2 border-black pb-1">
          All zones
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {ZONE_ORDER.map((z) => {
            const h = character.hitLocations[z];
            const eff = Math.max(0, h.stoppingPower - h.ablation);
            const layered = layeredSpByZone[z];
            const sev = !!severedByZone[z];
            const isSel = selected === z;
            return (
              <button
                key={z}
                type="button"
                onClick={() => setSelected(z)}
                className={`text-left border-2 p-2 ${
                  sev
                    ? 'border-red-900 bg-red-50'
                    : isSel
                      ? 'border-amber-700 bg-amber-50'
                      : 'border-black bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-baseline">
                  <span className="font-bold">{ZONE_LABELS[z]}</span>
                  <span className="text-[10px] text-gray-500">
                    d10 {hitLocationRollRanges[z]}
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>
                    SP <strong>{eff}</strong>
                    {layered > 0 && layered !== eff && (
                      <span className="text-blue-700 ml-1">(layer {layered})</span>
                    )}
                  </span>
                  {h.ablation > 0 && (
                    <span className="text-orange-700">−{h.ablation} abl</span>
                  )}
                </div>
                {sev && (
                  <div className="text-[10px] font-bold uppercase text-red-900 mt-0.5">
                    Severed
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
