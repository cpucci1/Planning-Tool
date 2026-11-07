"""Suma los bloques de la previsión: clientes actuales (ya corregidos), pilotos y nuevos, total de GMV
y, la cifra principal, los ingresos de Shifty (comisión + extras + suscripciones + equipo propio).

Entrada: un JSON escrito a mano en cada ejecución (ver SKILL.md §4), con esta forma:
{
 "resultado_modelo": "ruta/resultado_2026-11-07.json",
 "actuales": {"2026-11": {"p025": 0, "p10": 0, "p50": 0, "p90": 0, "p975": 0}, ...},   # ya corregidos
 "ratio_comision_actuales": {"2026-11": 0.1325},   # comisión / GMV de los actuales (v_shifts_closed, últimos meses)
 "otros_ingresos": {"2026-11": 465},               # suscripciones + extras + equipo propio del mes (fijo, SKILL.md §1)
 "nuevos": [
   {"nombre": "X", "prob": 0.5, "mes_arranque": "2026-12",
    "comision_pct": 18,               # opcional: la comisión de su ficha (companies.shifty_commission_pct); sin ella, 25
    "potencial_mes": 6000,            # opcional: GMV al mes con el arranque ya hecho. Sin él, curva de la base
    "fijo": {"2026-11": 2400},         # opcional: lo que ya está en el sistema y no depende de la probabilidad
    "por_mes": {"2026-12": 28000},     # opcional: GMV mes a mes (cliente de temporada: su año pasado; o el arranque que diga Crescente)
    "por_mes_ingresos": {"2026-12": 2000}}  # opcional: lo mismo en INGRESOS de Shifty (comisión); se pasa a GMV con su comisión
 ]
}
Simula 20.000 escenarios. En cada uno, cada nuevo sale o no con su probabilidad; si sale, su mes
1, 2 y 3 se sacan de la curva real de arranque de los clientes nuevos (o de su potencial con la
forma de esa curva). Los actuales se sacan de su propio rango. Se suponen independientes.
SUELO: en ningún escenario los actuales quedan por debajo de lo hecho + (agendado + temporales
previstos) × una parte sacada de lo que se facturó de lo agendado en los meses cerrados (el campo
"suelo" de cada mes del resultado del modelo). Así el rango nunca baja de lo que ya está en pantalla
salvo por la cancelación que de verdad ha habido.
"""
import json, sys
import numpy as np, pandas as pd

rng = np.random.default_rng(7)
N = 20000
cfg = json.load(open(sys.argv[1]))
mod = json.load(open(cfg['resultado_modelo']))
curva = np.array(mod['arranque_crudo'])                  # filas: clientes nuevos; columnas: mes 1, 2, 3
m3 = np.median(curva[curva[:, 2] > 0, 2]) if (curva[:, 2] > 0).any() else 1.0
forma = [float(np.median(curva[curva[:, 2] > 0, i] / curva[curva[:, 2] > 0, 2])) for i in range(3)]
Q = [.025, .1, .5, .9, .975]; QK = ['p025', 'p10', 'p50', 'p90', 'p975']


def muestra_rango(r):
    """Escenarios a partir de los cinco cuantiles, por interpolación lineal. Por debajo del 2,5 % y por
    encima del 97,5 % no hay datos: se alarga un 15 % abajo y un 10 % arriba (supuesto, SKILL.md §4)."""
    u = rng.uniform(0, 1, N)
    xs = [0.0] + Q + [1.0]; ys = [r['p025'] * 0.85] + [r[k] for k in QK] + [r['p975'] * 1.1]
    return np.interp(u, xs, ys), u


meses = list(cfg['actuales'].keys())
mmod = {m['mes']: m for m in mod['meses'] if 'suelo' in m}
SALE = [rng.uniform(0, 1, N) < n['prob'] for n in cfg.get('nuevos', [])]
out = {}
for mes in meses:
    act, u = muestra_rango(cfg['actuales'][mes])
    if mes in mmod and mmod[mes]['suelo']['ratios_facturado_de_agendado']:
        m_ = mmod[mes]
        # mismo sorteo que los actuales: un mes malo es malo en todo (si no, el suelo subiría el rango de más)
        r_ = np.quantile(m_['suelo']['ratios_facturado_de_agendado'], u)
        act = np.maximum(act, m_['hecho'] + r_ * (m_['agendado'] + m_['temporales_previstos']))
    nue = np.zeros(N)
    ing = act * cfg.get('ratio_comision_actuales', {}).get(mes, np.nan) + cfg.get('otros_ingresos', {}).get(mes, 0.0)
    for j, n in enumerate(cfg.get('nuevos', [])):
        pct = n.get('comision_pct', 25) / 100           # la comisión va sobre el coste: GMV × pct / (1 + pct)
        nue += n.get('fijo', {}).get(mes, 0.0); ing = ing + n.get('fijo', {}).get(mes, 0.0) * pct / (1 + pct)
        i = (pd.Period(mes, 'M') - pd.Period(n['mes_arranque'], 'M')).n
        if i < 0: continue
        sale = SALE[j]                     # el mismo sorteo en todos los meses: si sale, sale en todos
        col = min(i, 2)
        if n.get('por_mes_ingresos'):          # Crescente habla en ingresos de Shifty: GMV = ingresos × (1 + pct) / pct
            v = n['por_mes_ingresos'].get(mes, 0.0) * (1 + pct) / pct * rng.lognormal(0, 0.4, N)
        elif n.get("por_mes"):                                     # mes a mes: temporada o arranque contado por Crescente
            v = n['por_mes'].get(mes, 0.0) * rng.lognormal(0, 0.4, N)
        elif n.get('potencial_mes'):
            v = n['potencial_mes'] * forma[col] * rng.lognormal(0, 0.5, N)   # incertidumbre del tamaño
        else:
            v = rng.choice(curva[:, col], N)
        nue += np.where(sale, v, 0.0)
        ing = ing + np.where(sale, v, 0.0) * pct / (1 + pct)
    tot = act + nue
    out[mes] = {b: {k: round(float(np.quantile(x, q)), -2) for k, q in zip(QK, Q)} | {'media': round(float(x.mean()), -2)}
                for b, x in [('actuales', act), ('nuevos', nue), ('total', tot), ('ingresos_shifty', ing)]
                if not np.isnan(x).all()}
out['_forma_arranque'] = [round(f, 2) for f in forma]
print(json.dumps(out, ensure_ascii=False, indent=1))
