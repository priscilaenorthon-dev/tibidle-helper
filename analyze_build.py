"""
Cruza o estado real da party com o catalogo de magias e o bestiario para
recomendar: magias por personagem, prey e hunt.

Fontes:
  data/estado-party.json  - estado ao vivo lido da arvore React
  data/lib-misc.json      - /spells, /bestiary/list, /potions
  data/lib-hunts-select.json
"""
import json
import re

VOC_PT = {"KNIGHT": "Cavaleiro", "PALADIN": "Paladino",
          "SORCERER": "Feiticeiro", "DRUID": "Druida"}
# skill que alimenta a formula de cada vocacao
SKILL_DA_VOC = {"KNIGHT": "melee", "PALADIN": "distance",
                "SORCERER": "magic", "DRUID": "magic"}


def load(p):
    d = json.loads(open(p, encoding="utf-8").read())
    return json.loads(d) if isinstance(d, str) else d


def avaliar_formula(expr, level, maglevel, skill, attack):
    """Avalia a formula de dano publicada pelo jogo, com guarda-chuva."""
    if not expr:
        return None
    e = expr.lower()
    subs = {
        "magiclevel": maglevel, "maglevel": maglevel, "magic": maglevel,
        "level": level, "skill": skill, "attack": attack,
    }
    # substitui identificadores por valores, do mais longo pro mais curto
    for k in sorted(subs, key=len, reverse=True):
        e = re.sub(r"\b" + k + r"\b", str(subs[k]), e)
    if not re.fullmatch(r"[0-9\.\+\-\*/\(\)\s]+", e):
        return None
    try:
        return abs(eval(e, {"__builtins__": {}}, {}))
    except Exception:
        return None


def dano_magia(sp, membro):
    voc = membro["vocation"]
    lvl = membro["level"]
    mag = membro["skills"]["magic"]["value"]
    skill = membro["skills"][SKILL_DA_VOC[voc]]["value"]
    arma = (membro.get("equipment") or {}).get("weapon") or {}
    attack = (arma.get("attrs") or {}).get("attack", 0) or 0

    f = sp.get("formula") or {}
    lo = avaliar_formula(f.get("min"), lvl, mag, skill, attack)
    hi = avaliar_formula(f.get("max"), lvl, mag, skill, attack)
    if lo is None and hi is None:
        return None
    lo = lo if lo is not None else hi
    hi = hi if hi is not None else lo
    return (lo + hi) / 2.0


def elegivel(sp, membro):
    vocs = [v.lower() for v in (sp.get("vocations") or [])]
    if VOC_PT and membro["vocation"].lower() not in vocs:
        return False
    if not sp.get("available", True):
        return False
    if sp.get("level", 0) > membro["level"]:
        return False
    if sp.get("mana", 0) > membro["maxMana"]:
        return False
    return True


def main():
    est = load("data/estado-party.json")
    misc = load("data/lib-misc.json")
    spells = misc["spells"]
    party = est["combat"]["party"]

    print("=" * 100)
    print("DIAGNOSTICO DA PARTY")
    print("=" * 100)
    for m in party:
        eq = m.get("equipment") or {}
        arma = (eq.get("weapon") or {}).get("name", "-")
        armadura = sum((s.get("attrs") or {}).get("armor", 0) or 0
                       for s in eq.values())
        kit = ", ".join(k["name"] for k in m.get("kit") or []) or "!! VAZIO !!"
        sk = m["skills"]
        imb_livres = sum(((s.get("imbue") or {}).get("slots", 0) or 0)
                         - len(s.get("imbuements") or []) for s in eq.values())
        print(f"\n{VOC_PT[m['vocation']]:<11} nivel {m['level']}  "
              f"HP {m['maxHp']:>4}  Mana {m['maxMana']:>4}  armadura {armadura:>3}")
        print(f"  skills   melee {sk['melee']['value']:>3} · dist {sk['distance']['value']:>3} · "
              f"escudo {sk['shielding']['value']:>3} · magico {sk['magic']['value']:>3}")
        print(f"  arma     {arma}")
        print(f"  magias   {kit}")
        print(f"  bless    {len(m.get('blessings') or [])}/5     "
              f"encaixes de imbue LIVRES: {imb_livres}")

    print("\n" + "=" * 100)
    print("MAGIAS DISPONIVEIS QUE VOCE NAO ESTA USANDO")
    print("=" * 100)
    for m in party:
        equipadas = {k["name"] for k in m.get("kit") or []}
        cands = []
        for sp in spells:
            if not elegivel(sp, m):
                continue
            d = dano_magia(sp, m)
            cd = max(sp.get("cooldownMs", 0), sp.get("groupCooldownMs", 0)) or 1000
            dps = (d / (cd / 1000.0)) if d else 0
            por_mana = (d / sp["mana"]) if d and sp.get("mana") else 0
            cands.append((dps, por_mana, d, sp))

        print(f"\n--- {VOC_PT[m['vocation']]} (mana {m['maxMana']}, "
              f"magico {m['skills']['magic']['value']}) ---")
        ataque = [c for c in cands if c[0] > 0 and c[3].get('group') == 'attack']
        ataque.sort(key=lambda c: -c[0])
        if not ataque:
            print("   nenhuma magia de dano elegivel")
        print(f"   {'magia':<24} {'palavras':<16} {'lvl':>4} {'mana':>5} "
              f"{'dano':>7} {'cd':>6} {'dps':>7} {'d/mana':>7}")
        for dps, pm, d, sp in ataque[:7]:
            mark = " *EQUIPADA*" if sp["name"] in equipadas else ""
            cd = max(sp.get("cooldownMs", 0), sp.get("groupCooldownMs", 0))
            print(f"   {sp['name'][:24]:<24} {(sp.get('words') or '')[:16]:<16} "
                  f"{sp.get('level',0):>4} {sp.get('mana',0):>5} {d:>7.0f} "
                  f"{cd/1000:>5.1f}s {dps:>7.1f} {pm:>7.1f}{mark}")

        cura = [c for c in cands if c[3].get("group") == "healing"]
        if cura:
            print(f"   -- cura/suporte --")
            for dps, pm, d, sp in sorted(cura, key=lambda c: -(c[2] or 0))[:4]:
                print(f"   {sp['name'][:24]:<24} {(sp.get('words') or '')[:16]:<16} "
                      f"{sp.get('level',0):>4} {sp.get('mana',0):>5} "
                      f"{(d or 0):>7.0f}")

    print("\n" + "=" * 100)
    print("PREY - SLOTS")
    print("=" * 100)
    roster = est["shell"]["roster"]
    for r in roster:
        slots = r.get("preySlots") or []
        ativos = sum(1 for s in slots if s.get("creature"))
        print(f"\n{VOC_PT[r['vocation']]:<11} {ativos}/{len(slots)} slots ativos")
        for i, s in enumerate(slots, 1):
            if s.get("creature"):
                print(f"   slot {i}: {s['creature']} · {s.get('bonus')} · "
                      f"{s.get('msLeft',0)/3600000:.1f}h restantes")
            else:
                print(f"   slot {i}: VAZIO — lista: {', '.join(s.get('list', [])[:5])}...")


if __name__ == "__main__":
    main()
