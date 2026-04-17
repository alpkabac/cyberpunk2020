---
id: damage-pipeline
priority: 22
keywords: damage, wound, hit, location, sp, armor, btm, bullet, shoot, attack, ablation, stopping, fnff, penetration, head
refs: CP2020Gameplay.md — Section 7 Friday Night Firefight (armor, wounds, stun/death saves, hit locations)
---

**FNFF pipeline (short):**

1. **Hit location** — d10 table or called shot (higher difficulty).
2. **Damage dice** from weapon / attack; **head** **doubles** damage (applied *before* armor).
3. Subtract **effective SP** at that location; **AP** ammo **halves** SP first.
4. **Ablation** (Staged Penetration, CP2020 L6350): SP ablates by 1 **only on a penetrating hit**
   (attack that actually exceeds effective SP). A hit fully stopped by armor does **not** ablate.
5. Apply **BTM** to damage that penetrated. **BTM may never reduce damage below 1** — if
   the attack pierced armor, the character takes **at least 1** point.
6. Add to **wound track**; wound state drives penalties (Light 0, Serious −2 REF,
   Critical ½ REF/INT/CL, Mortal ⅓ REF/INT/CL, Dead at 41).
7. **Limb / head severance** (L6424): if a single hit deals **>8 final damage** to a limb,
   the limb is severed and the character makes an **immediate Mortal-0 death save**.
   A head hit of this type kills **automatically**. A severed limb auto-applies a
   persistent condition named `severed_<limb>` (e.g. `severed_right_arm`,
   `severed_left_leg`) so the Body tab, token card, and your context reflect the
   loss until cyberware / medtech care removes it.
8. **Stun save:** flat **1d10 ≤ (BT − wound row penalty)** (Light 0 … Mortal6 −9). Required
   every time a character takes damage.
9. **Death save** (only while Mortal): flat **1d10 ≤ (BT − mortal level)** (Mortal0 −0 …
   Mortal6 −6). Failing means dead.
