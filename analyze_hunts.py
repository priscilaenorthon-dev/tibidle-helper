"""
Ranqueia as hunts do Tibidle por EXP/h e Ouro/h para o estado atual da party.

Modelo:
  - Metricas independentes de DPS: exp_por_hp e ouro_por_hp.
    Elas medem quanto retorno voce extrai por unidade de dano causado,
    que e o recurso realmente escasso num idle game.
  - DPS efetivo por hunt = DPS_base ajustado pela resistencia do monstro.
    Convencao confirmada nos dados: element percent POSITIVO = resistencia
    (Wasp EARTH 100 = imune), NEGATIVO = fraqueza.
  - Calibracao: leitura ao vivo em Terramites Ankrahmun (hunt 138).
"""
import json
from collections import defaultdict

# ---- calibracao medida ao vivo (painel "Estatisticas do grupo") ----
DPS_KNIGHT, DPS_PALADIN, DPS_SORC, DPS_DRUID = 10.4, 13.6, 4.9, 4.3
DPS_BASE = DPS_KNIGHT + DPS_PALADIN + DPS_SORC + DPS_DRUID
FRAC_FISICO = (DPS_KNIGHT + DPS_PALADIN) / DPS_BASE   # ~0.72
FRAC_MAGICO = 1 - FRAC_FISICO
NIVEL = 36
CAP_MOCHILA = 1170.0   # oz

ELEM_MAGICOS = ["COMBAT_ENERGYDAMAGE", "COMBAT_FIREDAMAGE",
                "COMBAT_ICEDAMAGE", "COMBAT_EARTHDAMAGE"]


def load(p):
    d = json.loads(open(p, encoding="utf-8").read())
    return json.loads(d) if isinstance(d, str) else d


def fator_resistencia(monstro):
    """Multiplicador de DPS efetivo contra este monstro (1.0 = neutro)."""
    el = {e["type"]: e["percent"] for e in monstro.get("elements", [])}
    fis = 1 - el.get("COMBAT_PHYSICALDAMAGE", 0) / 100.0
    # sorc/druid escolhem o melhor elemento disponivel
    mag = max((1 - el.get(t, 0) / 100.0) for t in ELEM_MAGICOS)
    return max(0.05, FRAC_FISICO * fis + FRAC_MAGICO * mag)


def media_ponderada(monstros, campo):
    tw = sum(m.get("weight", 1) for m in monstros) or 1
    return sum(m.get(campo, 0) * m.get("weight", 1) for m in monstros) / tw


DENSIDADE_MIN = 8.0   # ouro por oz: abaixo disso o item nao paga a mochila


def loot_por_kill(tabela):
    """Separa o loot em moeda (nao pesa na pratica) e itens carregaveis.

    Moeda vai direto pro contador de OURO; itens precisam ser carregados ate a
    cidade e vendidos, competindo pelos 1170oz da mochila. Por isso o que
    importa num item nao e o valor bruto e sim a densidade (ouro/oz).
    """
    moeda = 0.0
    itens = []          # (nome, valor_esperado, peso_esperado, densidade)
    for it in tabela:
        if not isinstance(it, dict):
            continue
        p = it.get("chance", 0) / 100000.0          # denominador confirmado: gold coin 100000 = 100%
        mc = it.get("maxCount") or 1
        qtd = (1 + mc) / 2.0                         # contagem uniforme 1..maxCount
        val = p * it.get("value", 0) * qtd
        pes = p * (it.get("weight") or 0) * qtd
        if it.get("currency"):
            moeda += val
            continue
        if val <= 0:
            continue                                 # chaves de boss, sem valor de venda
        dens = val / pes if pes > 0 else float("inf")
        itens.append((it.get("name", "?"), val, pes, dens))
    return moeda, itens


def politica_loot(itens, densidade_min=DENSIDADE_MIN):
    """Aplica um filtro de loot racional: so carrega o que compensa o peso."""
    manter = [i for i in itens if i[3] >= densidade_min]
    return sum(i[1] for i in manter), sum(i[2] for i in manter), manter


def main():
    hunts = load("data/lib-hunts-select.json")
    loots = load("data/lib-loot-tables.json")

    linhas = []
    for h in hunts:
        mons = h.get("monsters") or []
        if not mons:
            continue
        hp = media_ponderada(mons, "health")
        exp = media_ponderada(mons, "experience")
        if hp <= 0:
            continue

        tw = sum(m.get("weight", 1) for m in mons) or 1
        resist = sum(fator_resistencia(m) * m.get("weight", 1) for m in mons) / tw

        tabela = loots.get(str(h["id"])) or loots.get(h["id"]) or []
        if isinstance(tabela, dict):
            tabela = []
        moeda_kill, itens = loot_por_kill(tabela)
        item_kill, peso_kill, mantidos = politica_loot(itens)

        dps_ef = DPS_BASE * resist
        kills_h = dps_ef * 3600 / hp
        xp_h = kills_h * exp
        ouro_h = kills_h * (moeda_kill + item_kill)

        # quantas horas ate encher a mochila (viagem de volta a cidade)
        peso_h = kills_h * peso_kill
        horas_cheia = CAP_MOCHILA / peso_h if peso_h > 0 else 999

        lure_max = max((t["max"] for t in h.get("lureTiers") or []), default=1)

        linhas.append(dict(
            id=h["id"], titulo=h["title"], lvl=h.get("levelMin", 0),
            premium=h.get("premium", False), hp=hp, exp=exp, resist=resist,
            kills_h=kills_h, xp_h=xp_h, ouro_h=ouro_h,
            moeda_h=kills_h * moeda_kill, item_h=kills_h * item_kill,
            horas_cheia=horas_cheia, lure=lure_max, mantidos=mantidos,
            monstros=", ".join(m["name"] for m in mons)[:44],
        ))

    liberadas = [r for r in linhas if r["lvl"] <= NIVEL]
    bloqueadas = [r for r in linhas if r["lvl"] > NIVEL]

    # score combinado: media geometrica normalizada de xp/h e ouro/h
    mx_xp = max((r["xp_h"] for r in liberadas), default=1) or 1
    mx_go = max((r["ouro_h"] for r in liberadas), default=1) or 1
    for r in liberadas:
        r["score"] = ((r["xp_h"] / mx_xp) * (r["ouro_h"] / mx_go)) ** 0.5

    def tabela(rs, titulo, chave, n=12):
        print(f"\n{'='*112}\n{titulo}\n{'='*112}")
        print(f"{'id':>4} {'lvl':>4} {'hunt':<30} {'HP':>5} {'exp':>4} {'kills/h':>8} "
              f"{'XP/h':>8} {'ouro/h':>8} {'=moeda':>8} {'+itens':>8} {'cheia':>7} {'lure':>4}")
        print("-" * 112)
        for r in sorted(rs, key=chave, reverse=True)[:n]:
            hc = f"{r['horas_cheia']:.1f}h" if r["horas_cheia"] < 99 else "  -"
            print(f"{r['id']:>4} {r['lvl']:>4} {r['titulo'][:30]:<30} {r['hp']:>5.0f} "
                  f"{r['exp']:>4.0f} {r['kills_h']:>8.0f} {r['xp_h']:>8.0f} "
                  f"{r['ouro_h']:>8.0f} {r['moeda_h']:>8.0f} {r['item_h']:>8.0f} "
                  f"{hc:>7} {r['lure']:>4}")

    def detalhe(r):
        print(f"\n{'-'*112}\nFILTRO DE LOOT RECOMENDADO - {r['id']} {r['titulo']} "
              f"(carregar so densidade >= {DENSIDADE_MIN:.0f} ouro/oz)\n{'-'*112}")
        print(f"  monstros: {r['monstros']}")
        if not r["mantidos"]:
            print("  nenhum item compensa carregar - hunt puramente de moeda")
        for nome, val, pes, dens in sorted(r["mantidos"], key=lambda x: -x[1]):
            d = "sem peso" if dens == float("inf") else f"{dens:>7.0f} ouro/oz"
            print(f"  {nome:<28} {val*r['kills_h']:>9.0f} ouro/h   {d}")

    print(f"DPS base medido: {DPS_BASE:.1f}/s  |  fisico {FRAC_FISICO:.0%}  "
          f"|  nivel {NIVEL}  |  {len(liberadas)} hunts liberadas / {len(linhas)} totais")

    tabela(liberadas, "MELHOR EQUILIBRIO XP + OURO (score combinado)", lambda r: r["score"])
    tabela(liberadas, "MAIOR XP/h", lambda r: r["xp_h"])
    tabela(liberadas, "MAIOR OURO/h", lambda r: r["ouro_h"])
    tabela(bloqueadas, "BLOQUEADAS - PROXIMOS ALVOS AO SUBIR DE NIVEL",
           lambda r: -r["lvl"], n=14)

    melhor = max(liberadas, key=lambda r: r["score"])
    detalhe(melhor)

    atual = next((r for r in linhas if r["id"] == 138), None)
    if atual:
        print(f"\n{'='*112}\nCOMPARATIVO COM SUA HUNT ATUAL (138 Terramites Ankrahmun)\n{'='*112}")
        for r in (atual, melhor):
            print(f"  {r['id']:>4} {r['titulo'][:30]:<30} XP/h {r['xp_h']:>8.0f}  "
                  f"ouro/h {r['ouro_h']:>8.0f}  enche em {r['horas_cheia']:.1f}h")
        if atual["xp_h"] > 0:
            print(f"\n  ganho de XP: {melhor['xp_h']/atual['xp_h']:.1f}x   "
                  f"variacao de ouro: {(melhor['ouro_h']/atual['ouro_h']-1)*100:+.0f}%")
        detalhe(atual)


if __name__ == "__main__":
    main()
