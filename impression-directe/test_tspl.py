# Fabrique UNE étiquette de test dans le langage de l'imprimante (TSPL), pour le rouleau indiqué.
# Usage : python test_tspl.py 40x30 | 50x40 | ronde   -> écrit test_<rouleau>.bin
import sys, os

ROULEAUX = {"40x30": (40, 30), "50x40": (50, 40), "ronde": (32.5, 15)}
r = sys.argv[1] if len(sys.argv) > 1 else "40x30"
w, h = ROULEAUX[r]
W, H = int(w * 8), int(h * 8)  # 203 dpi = 8 points par mm

def bitmap_test():
    # 2 petits carrés côte à côte : A = octets 0x00, B = octets 0xFF -> on saura lequel imprime en noir
    rows = []
    for _ in range(24):
        rows.append(b"\x00\x00\x00" + b"\xff\xff\xff")
    return b"".join(rows)

lignes = [
    f"SIZE {w} mm,{h} mm",
    "GAP 2 mm,0 mm",
    "DIRECTION 1,0",
    "REFERENCE 0,0",
    "CLS",
    f"BOX 4,4,{W - 4},{H - 4},2",
]
if r == "ronde":
    lignes += ['TEXT 12,14,"2",0,1,1,"TEST"', 'TEXT 12,60,"1",0,1,1,"A    B"']
    y_bmp = 80
else:
    lignes += [
        'TEXT 16,16,"3",0,1,1,"TEST FRENCHY"',
        'TEXT 16,62,"2",0,1,1,"Impression directe"',
        f'TEXT 16,100,"2",0,1,1,"Rouleau {r}"',
        f'TEXT 16,{H - 70},"2",0,1,1,"A        B"',
    ]
    y_bmp = H - 44
job = ("\r\n".join(lignes) + "\r\n").encode("ascii")
job += f"BITMAP 16,{y_bmp},6,24,0,".encode("ascii") + bitmap_test() + b"\r\n"
job += b"PRINT 1,1\r\n"
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"test_{r}.bin")
open(out, "wb").write(job)
print("étiquette de test prête :", out, f"({len(job)} octets, {w} x {h} mm)")
