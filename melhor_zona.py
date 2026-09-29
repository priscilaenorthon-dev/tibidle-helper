"""
Escolhe a melhor zona para o estado ATUAL da conta, com todas as correcoes
aprendidas: premium (taxa 5%), filtro de loot por densidade, custo de mana,
e o limite do ciclo de auto-sell.

Uso: python melhor_zona.py [nivel] [dps]
"""
import sys
import json

NIVEL = int(sys.argv[1]) if len(sys.argv) > 1 else 37
DPS = float(sys.argv[2]) if len(sys.argv) > 2 else 44.0

FRAC_FISICO = 0.20          # apos as trocas, o dano da party e majoritariamente magico
FRAC_MAGICO = 1 - FRAC_FISICO
TAXA_VENDA = 0.95           # premium: fica com 95%
CAP = 1170.0
CICLO_AUTOSELL_H = 1 / 6.0  # auto-sell roda a cada ~10 min
DENS_MIN = 8.0              # ouro/oz minimo para valer carregar
# mana: medido 152 pocoes/h x 56 ouro com ~44 dps de party
CUSTO_MANA_POR_DPS_H = (152 * 56) / 44.0

# calibrado: 400 abates em 17min42 em Orcs Edron = 1356/h contra 2207 previstos
EFICIENCIA = 0.61

ELEM = ["COMBAT_ENERGYDAMAGE", "COMBAT_FIREDAMAGE",
        "COMBAT_ICEDAMAGE", "COMBAT_EARTHDAMAGE"]


def load(p):
    d = json.loads(open(p, encoding="utf-8").read())
    return json.loads(d) if isinstance(d, str) else d


def resist(mon):
    el = {e["type"]: e["percent"] for e in mon.get("elements", [])}
    fis = 1 - el.get("COMBAT_PHYSICALDAMAGE", 0) / 100.0
    mag = max((1 - el.get(t, 0) / 100.0) for t in ELEM)
    return max(0.05, FRAC_FISICO * fis + FRAC_MAGICO * mag)


def main():
    import os
    f_novo = "data/lib-hunts-select-v005.json"
    f_hunts = f_novo if os.path.exists(f_novo) else "data/lib-hunts-select.json"
    hunts = load(f_hunts)
    print(f"catalogo: {f_hunts}")
    loots = load("data/lib-loot-tables.json")
    linhas = []

    for h in hunts:
        if h.get("levelMin", 0) > NIVEL:
            continue
        mons = h.get("monsters") or []
        if not mons:
            continue
        tw = sum(m.get("weight", 1) for m in mons) or 1
        hp = sum(m["health"] * m.get("weight", 1) for m in mons) / tw
        exp = sum(m["experience"] * m.get("weight", 1) for m in mons) / tw
        res = sum(resist(m) * m.get("weight", 1) for m in mons) / tw
        if hp <= 0:
            continue

        kills = DPS * res * 3600 / hp * EFICIENCIA
        tabela = loots.get(str(h["id"])) or []
        if isinstance(tabela, dict):
            tabela = []

        moeda = 0.0
        mantidos = []
        for it in tabela:
            p = it.get("chance", 0) / 100000.0
            mc = it.get("maxCount") or 1
            qtd = (1 + mc) / 2.0
            ouro = p * it.get("value", 0) * qtd
            peso = p * (it.get("weight") or 0) * qtd
            if it.get("currency"):
                moeda += ouro
                continue
            if ouro <= 0:
                continue
            dens = ouro / peso if peso > 0 else float("inf")
            if dens >= DENS_MIN:
                mantidos.append((ouro, peso))

        item_ouro = sum(o for o, _ in mantidos) * TAXA_VENDA
        item_peso = sum(p for _, p in mantidos)

        bruto = kills * (moeda + item_ouro)
        peso_h = kills * item_peso
        # a mochila so e problema se encher antes do ciclo do auto-sell
        horas_cheia = CAP / peso_h if peso_h > 0 else 999
        seguro = horas_cheia > CICLO_AUTOSELL_H * 2

        mana = CUSTO_MANA_POR_DPS_H * DPS
        liquido = bruto - mana
        xp = kills * exp

        linhas.append(dict(id=h["id"], t=h["title"], lvl=h.get("levelMin", 0),
                           hp=hp, exp=exp, kills=kills, xp=xp, bruto=bruto,
                           liq=liquido, cheia=horas_cheia, seguro=seguro,
                           lure=max((x["max"] for x in h.get("lureTiers") or []), default=1)))

    # score: media geometrica de xp/h e ouro liquido/h, normalizados
    mx = max(r["xp"] for r in linhas) or 1
    mg = max(max(r["liq"] for r in linhas), 1)
    for r in linhas:
        r["score"] = ((r["xp"] / mx) * (max(r["liq"], 0) / mg)) ** 0.5

    print(f"nivel {NIVEL} · DPS {DPS} · eficiencia {EFICIENCIA:.0%} · taxa {TAXA_VENDA:.0%} "
          f"(premium) · mana {CUSTO_MANA_POR_DPS_H*DPS:.0f} ouro/h")
    print(f"{'id':>4} {'lvl':>4} {'hunt':<30} {'HP':>5} {'kills/h':>8} "
          f"{'XP/h':>8} {'ouro liq/h':>11} {'enche':>7} {'lure':>4}  score")
    print("-" * 96)
    for r in sorted(linhas, key=lambda x: -x["score"])[:14]:
        cheia = f"{r['cheia']:.1f}h" if r["cheia"] < 99 else "nunca"
        flag = "" if r["seguro"] else "  <-- enche antes do auto-sell"
        print(f"{r['id']:>4} {r['lvl']:>4} {r['t'][:30]:<30} {r['hp']:>5.0f} "
              f"{r['kills']:>8.0f} {r['xp']:>8.0f} {r['liq']:>11.0f} "
              f"{cheia:>7} {r['lure']:>4}  {r['score']:.3f}{flag}")

    atual = next((r for r in linhas if r["id"] == 124), None)
    if atual:
        pos = sorted(linhas, key=lambda x: -x["score"]).index(atual) + 1
        print(f"\nAtual (124 Orcs Edron Cave): posicao {pos} de {len(linhas)} · "
              f"XP {atual['xp']:.0f}/h · ouro liquido {atual['liq']:.0f}/h")


if __name__ == "__main__":
    main()
