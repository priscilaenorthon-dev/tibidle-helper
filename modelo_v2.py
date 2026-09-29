# -*- coding: utf-8 -*-
"""
Modelo v2 - calibrado com as medicoes de 2026-08-29 (nivel 41).
Corrige as duas falhas do melhor_zona.py:
  1) lure agora entra no calculo (teto de alvo)
  2) custo de consumivel por ABATE, proporcional ao HP - nao proporcional ao DPS
Uso: python modelo_v2.py [nivel]
"""
import sys, json

NIVEL = int(sys.argv[1]) if len(sys.argv) > 1 else 42

# --- ancoras MEDIDAS em Orcs Edron Cave (124) ---
ABATES_MED = 1367.0   # abates/h medidos
LURE_MED   = 4        # monstros simultaneos
HP_MED     = 78.0     # HP medio do Orc
DPS        = 41.9     # DPS da party
OURO_LIQ   = 5100.0   # ouro liquido/h medido
OURO_KILL  = 9.45     # ouro de loot por abate (filtro aplicado, taxa premium)
BONUS_EXP  = 1.30     # 3x prey +10% EXP

# teto de alvo: abates/h por ponto de lure
POR_LURE = ABATES_MED / LURE_MED                    # ~342
# teto de dano: fracao do DPS que vira abate
EF_DANO = ABATES_MED * HP_MED / (DPS * 3600)        # ~0.707
# custo de consumivel por ponto de HP abatido
bruto_med = ABATES_MED * OURO_KILL
CUSTO_POR_HP = (bruto_med - OURO_LIQ) / (ABATES_MED * HP_MED)

def load(p):
    d = json.loads(open(p, encoding="utf-8").read())
    return json.loads(d) if isinstance(d, str) else d

def main():
    hs = load("data/lib-hunts-select-v005.json")
    loots = load("data/lib-loot-tables.json")
    print(f"nivel {NIVEL} | DPS {DPS} | ancora: {ABATES_MED:.0f} abates/h em lure {LURE_MED}, HP {HP_MED:.0f}")
    print(f"  teto de alvo: {POR_LURE:.0f} abates/h por ponto de lure")
    print(f"  teto de dano: {EF_DANO:.0%} do DPS vira abate")
    print(f"  consumivel: {CUSTO_POR_HP:.4f} ouro por ponto de HP abatido\n")
    print(f"{'id':>4} {'lvl':>4} {'hunt':<28} {'lure':>4} {'HP':>5} {'abates/h':>9} {'trava':>6} {'XP/h':>9} {'ouro/h':>8}")
    print("-"*96)
    linhas = []
    for h in hs:
        if h["levelMin"] > NIVEL: continue
        mons = h["monsters"]; tw = sum(m.get("weight",1) for m in mons)
        hp  = sum(m["health"]*m.get("weight",1) for m in mons)/tw
        exp = sum(m["experience"]*m.get("weight",1) for m in mons)/tw
        lure = max((t["max"] for t in h.get("lureTiers") or []), default=1)
        teto_alvo = POR_LURE * lure
        teto_dano = EF_DANO * DPS * 3600 / hp
        abates = min(teto_alvo, teto_dano)
        trava = "lure" if teto_alvo < teto_dano else "dano"
        tab = loots.get(str(h["id"])) or []
        ouro_kill = 0.0
        for it in (tab if isinstance(tab, list) else []):
            p = it.get("chance",0)/100000.0; mc = it.get("maxCount") or 1; q = (1+mc)/2.0
            o = p*it.get("value",0)*q; w = p*(it.get("weight") or 0)*q
            if it.get("currency"): ouro_kill += o; continue
            if o <= 0: continue
            if (o/w if w > 0 else 9e9) >= 8.0: ouro_kill += o*0.95
        liquido = abates * (ouro_kill - CUSTO_POR_HP*hp)
        xp = abates * exp * BONUS_EXP
        linhas.append((xp, h["id"], h["levelMin"], h["title"], lure, hp, abates, trava, liquido))
    for xp,i,lv,t,lu,hp,ab,tr,og in sorted(linhas, reverse=True)[:16]:
        m = " <<<" if i == 124 else ""
        print(f"{i:>4} {lv:>4} {t[:28]:<28} {lu:>4} {hp:>5.0f} {ab:>9,.0f} {tr:>6} {xp:>9,.0f} {og:>8,.0f}{m}")

main()
