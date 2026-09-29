"""Extrai as strings de texto em portugues do bundle do jogo.

O cliente carrega todos os textos de UI, tooltips e tutoriais embutidos. Ler
essas strings e' a forma mais direta de aprender as regras do jogo, porque sao
a explicacao que os proprios desenvolvedores escreveram.
"""
import re
import sys
import os
import json

DIR = sys.argv[1] if len(sys.argv) > 1 else "js"
MIN = int(sys.argv[2]) if len(sys.argv) > 2 else 30

# strings JS de aspas duplas, tolerando escapes
PADRAO = re.compile(r'"((?:[^"\\\n]|\\.){%d,600})"' % MIN)
ACENTO = re.compile(r'\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|[À-ÿ]')


def desescapa(s):
    try:
        return json.loads('"' + s.replace('\\\n', '') + '"')
    except Exception:
        try:
            return s.encode().decode("unicode_escape")
        except Exception:
            return s


def parece_texto(t):
    """Filtra codigo/CSS/ids e fica so com frase humana."""
    if len(t) < MIN:
        return False
    if not re.search(r"[a-zA-ZÀ-ÿ]{3}", t):
        return False
    palavras = t.split()
    if len(palavras) < 4:
        return False
    # descarta lixo tipico de bundle
    ruim = ("function", "return ", "var ", "=>", "{", "}", "://", "px ",
            "0 0 ", "translate", "rgba(", "#000", "__", "webkit")
    if any(r in t for r in ruim):
        return False
    if sum(c.isalpha() or c.isspace() for c in t) / len(t) < 0.75:
        return False
    return True


def main():
    vistos = set()
    saida = []
    for nome in sorted(os.listdir(DIR)):
        if not nome.endswith(".js"):
            continue
        bruto = open(os.path.join(DIR, nome), encoding="utf-8", errors="ignore").read()
        for m in PADRAO.finditer(bruto):
            cru = m.group(1)
            if not ACENTO.search(cru) and not re.search(r"[a-z] [a-z]", cru):
                continue
            t = desescapa(cru).strip()
            if not parece_texto(t) or t in vistos:
                continue
            vistos.add(t)
            saida.append(t)
    saida.sort(key=len)
    for t in saida:
        print(t)
    print(f"\n--- {len(saida)} strings ---", file=sys.stderr)


if __name__ == "__main__":
    main()
