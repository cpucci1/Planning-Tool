"""Previsión de facturación (GMV de turnos terminados) de los clientes actuales de Shifty.

Modelo "pickup" por cliente, validado el 07-11-2026 (informe en prevision-facturacion/):
  lo que falta de cada cliente = a·agendado + b·vacantes + c·ritmo de 3 meses + d·mismo mes del año pasado
  con los pesos aprendidos de los 9 últimos meses cerrados, al mismo día relativo del mes (±3 días),
  y un rango "conformal" sacado de cuánto se equivocó en cada mes cerrado a ese mismo día.
Los temporales previstos (días de puestos temporales ya pedidos cuya semana no está montada,
tp_revenue_forecast_days, el mismo segmento "previsto" de la pantalla de Facturación) se suman como
demanda casi segura: previsto × la parte de lo agendado que acabó facturada en los meses cerrados a ese
mismo día. No pasan por los pesos del modelo, que lejos del mes dan poco peso a lo agendado. Y ningún
cuantil queda por debajo del SUELO: hecho + (agendado + previsto) × esa misma parte (SKILL.md §1).
Solo lo RECURRENTE (Crescente, 07-11-2026): los anuncios de servicio no recurrente
(job_offers.is_non_recurring_service: festivales, ferias, eventos) salen de toda la historia, del
ritmo, del mismo mes del año pasado y de lo que hay hoy. Es el mismo corte que la pantalla de
Facturación y la presentación "Shifty Work en números".

Solo LEE la base (REST con la clave de servicio de Web-Panel/.env.local, que nunca se imprime).
No escribe nada en ningún sitio salvo en la carpeta de datos que se le pasa.

Uso:
  python prevision.py DATA_DIR [--hoy 2026-11-07] [--meses 3] [--refrescar]
Salida: DATA_DIR/resultado_<hoy>.json y un resumen por pantalla.
"""
import argparse, csv, json, os, sys, urllib.parse, urllib.request
import numpy as np, pandas as pd
from scipy.optimize import nnls

ENV = os.path.expanduser('~/Desktop/Shifty/Github/Web-Panel/.env.local')
FE_BASE = ['booked', 'vac', 'runrem', 'ly_rem']  # variables del modelo validado (SKILL.md §1 y §6)
REC = 9                                        # meses cerrados con los que aprende
KMIN, KMAX = -70, 30                           # días respecto al día 1 del mes
Q = [.025, .1, .5, .9, .975]

ap = argparse.ArgumentParser()
ap.add_argument('data'); ap.add_argument('--hoy'); ap.add_argument('--meses', type=int, default=3)
ap.add_argument('--refrescar', action='store_true')
ap.add_argument('--fe', default=','.join(FE_BASE),
                help='variables, separadas por comas; candidatas extra: findes_rem, run6rem, ly_seas')
A = ap.parse_args()
FE = A.fe.split(',')
D = A.data.rstrip('/') + '/'; os.makedirs(D, exist_ok=True)
HOY = pd.Timestamp(A.hoy) if A.hoy else pd.Timestamp.now(tz='Europe/Madrid').normalize().tz_localize(None)
MHOY = HOY.to_period('M'); CERRADO = MHOY - 1   # último mes cerrado


# ---------- 1. Descarga (solo lectura) ----------
def fetch():
    env = {}
    for l in open(ENV):
        if '=' in l and not l.startswith('#'):
            k, v = l.strip().split('=', 1); env[k] = v.strip('"')
    url, key = env['VITE_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']

    def get(table, select, flt='', order='id'):
        rows, off = [], 0
        while True:
            q = f"{url}/rest/v1/{table}?select={urllib.parse.quote(select, safe=',*')}{flt}&order={order}"
            req = urllib.request.Request(q, headers={'apikey': key, 'Authorization': 'Bearer ' + key,
                                                     'Range-Unit': 'items', 'Range': f'{off}-{off + 999}'})
            d = json.load(urllib.request.urlopen(req, timeout=180)); rows += d
            if len(d) < 1000: break
            off += 1000
        with open(f'{D}{table}.csv', 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
        print('descargado', table, len(rows), file=sys.stderr)
    get('companies', 'id,name,is_test,created_at,shifty_commission_pct')
    get('job_offers', 'id,company_id,created_at,approval_status,is_non_recurring_service')
    get('job_days', 'id,job_offer_id,date,headcount_needed,created_at,job_day_status_id,updated_at,'
        'estimated_payment_per_worker', '&date=gte.2024-06-01')
    get('shifts', 'id,job_day_id,status_id,created_at,cancelled_at', '&created_at=gte.2024-06-01')
    get('v_shifts_closed', 'shift_id,is_officially_squared,cost_total_company,cost_total_company_best',
        order='shift_id')
    get('cost_centers', 'id,company_id')
    # temporales previstos: función solo para el servidor (sin permiso para anon ni authenticated)
    req = urllib.request.Request(f"{url}/rest/v1/rpc/tp_revenue_forecast_days", data=b'{}', method='POST',
                                 headers={'apikey': key, 'Authorization': 'Bearer ' + key,
                                          'Content-Type': 'application/json'})
    tf = json.load(urllib.request.urlopen(req, timeout=180))
    with open(f'{D}previsto.csv', 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['cost_center_id', 'date', 'gmv'])
        w.writerows([(r['cost_center_id'], r['date'], r['gmv']) for r in tf
                     if r.get('gmv') is not None and not r.get('is_non_recurring_service')])
    print('descargado previsto', len(tf), file=sys.stderr)
    open(D + 'descarga.txt', 'w').write(str(HOY.date()))


if (A.refrescar or not os.path.exists(D + 'descarga.txt') or not os.path.exists(D + 'previsto.csv')
        or open(D + 'descarga.txt').read() != str(HOY.date())):
    fetch()

# ---------- 2. Preparar ----------
co = pd.read_csv(D + 'companies.csv'); jo = pd.read_csv(D + 'job_offers.csv')
jd = pd.read_csv(D + 'job_days.csv'); sh = pd.read_csv(D + 'shifts.csv'); vc = pd.read_csv(D + 'v_shifts_closed.csv')
test = set(co.loc[co.is_test == True, 'id']); names = co.set_index('id').name
jd = jd.merge(jo[['id', 'company_id', 'approval_status']].rename(columns={'id': 'job_offer_id'}), on='job_offer_id', how='left')
jd = jd[jd.company_id.notna() & ~jd.company_id.isin(test)].copy()
# solo lo recurrente: lo no recurrente (festivales, ferias, eventos) no entra en ningún cálculo
nr = set(jo.loc[jo.is_non_recurring_service == True, 'id'])
jd = jd[~jd.job_offer_id.isin(nr)].copy()


def loc(s):
    return pd.to_datetime(s, utc=True, format='ISO8601').dt.tz_convert('Europe/Madrid').dt.tz_localize(None)


for c in ['created_at', 'updated_at']: jd[c] = loc(jd[c])
jd['date'] = pd.to_datetime(jd.date)
sh = sh.merge(jd[['id', 'date', 'company_id', 'estimated_payment_per_worker']]
              .rename(columns={'id': 'job_day_id', 'company_id': 'cid'}), on='job_day_id', how='inner')
for c in ['created_at', 'cancelled_at']: sh[c] = loc(sh[c])
vc['val'] = np.where(vc.is_officially_squared == True, vc.cost_total_company, vc.cost_total_company_best)
sh = sh.merge(vc[['shift_id', 'val']].rename(columns={'shift_id': 'id'}), on='id', how='left')
sh.loc[sh.status_id != 5, 'val'] = np.nan
# factor de cada empresa: lo facturado de verdad / pago estimado por persona (coeficiente, comisión, horas)
ok = sh[(sh.status_id == 5) & (sh.val > 0) & (sh.estimated_payment_per_worker > 0)]
fac = (ok.val / ok.estimated_payment_per_worker).groupby(ok.cid).median()
gfac = (ok.val / ok.estimated_payment_per_worker).median()
sh['est'] = sh.estimated_payment_per_worker * sh.cid.map(fac).fillna(gfac)
jd['est'] = jd.estimated_payment_per_worker * jd.company_id.map(fac).fillna(gfac)
sh['m'] = sh.date.dt.to_period('M'); jd['m'] = jd.date.dt.to_period('M')
first = sh[sh.status_id == 5].groupby('cid').date.min()
Fm = sh[sh.status_id == 5].groupby(['cid', 'm']).val.sum().unstack(fill_value=0)
# temporales previstos por cliente y mes (solo existen desde hoy en adelante: no tocan el pasado)
pv = pd.read_csv(D + 'previsto.csv', parse_dates=['date'])
pv = pv.merge(pd.read_csv(D + 'cost_centers.csv').rename(columns={'id': 'cost_center_id', 'company_id': 'cid'}),
              on='cost_center_id', how='left')
pv = pv[pv.cid.notna() & ~pv.cid.isin(test) & (pv.date >= HOY)]
if HOY != pd.Timestamp.now(tz='Europe/Madrid').normalize().tz_localize(None):
    # la función solo sabe lo que falta por montar HOY: en una foto de otro día se colaría el futuro
    print('aviso: --hoy no es hoy, los temporales previstos no se usan', file=sys.stderr); pv = pv.iloc[0:0]
PREV = pv.groupby(['cid', pv.date.dt.to_period('M')]).gmv.sum()
# lo de cada turno ya terminado, por jornada: para medir cuánto de lo agendado acaba facturado
fin_n = sh[sh.status_id == 5].groupby('job_day_id').size()

# ---------- 3. Foto de cada día: hecho, agendado y vacantes por cliente ----------
months = pd.period_range('2025-01', MHOY + A.meses - 1, freq='M')
rows = []; pares = []; REAL = []
for M in months:
    s = sh[sh.m == M]; j = jd[jd.m == M]; start = M.to_timestamp()
    Ffin = s[s.status_id == 5].groupby('cid').val.sum()
    jdcan = j.job_day_status_id == 5
    for k in range(KMIN, KMAX + 1):
        t = start + pd.Timedelta(days=k)
        if t > HOY or t >= (M + 1).to_timestamp(): continue
        pares.append((M, k))
        done = s[(s.status_id == 5) & (s.date < t)].groupby('cid').val.sum()
        alive = (s.created_at <= t) & ~(s.cancelled_at <= t) & ~((s.status_id == 6) & s.cancelled_at.isna())
        fut = s[alive & (s.date >= t)]
        booked = fut.groupby('cid').est.sum(); nb = fut.groupby('job_day_id').size()
        jj = j[(j.date >= t) & (j.created_at <= t) & ~(jdcan & (j.updated_at <= t))].copy()
        jj['open'] = (jj.headcount_needed - jj.id.map(nb).fillna(0)).clip(lower=0)
        vac = (jj.open * jj.est).groupby(jj.company_id).sum()
        if M <= CERRADO and fut.est.sum() >= 1000:
            # de lo agendado ese día, cuánto se facturó: por jornada, hasta lo agendado (las sustituciones cuentan)
            b_ = fut.groupby('job_day_id').agg(nb=('id', 'size'), eb=('est', 'sum'))
            real = (np.minimum(b_.index.map(fin_n).fillna(0).values / b_.nb.values, 1) * b_.eb.values).sum()
            REAL.append((M, k, float(b_.eb.sum()), float(real)))
        for c in set(done.index) | set(booked.index) | set(vac.index) | set(Ffin.index):
            rows.append((M, k, c, done.get(c, 0.0), booked.get(c, 0.0), vac.get(c, 0.0), Ffin.get(c, 0.0)))
snap = pd.DataFrame(rows, columns=['M', 'k', 'cid', 'done', 'booked', 'vac', 'F'])
REAL = pd.DataFrame(REAL, columns=['M', 'k', 'agendado', 'facturado']); REAL['ratio'] = REAL.facturado / REAL.agendado

# ---------- 4. Variables por cliente ----------
out = []
grupos = {key: g for key, g in snap.groupby(['M', 'k'])}
vacio = snap.iloc[0:0]
for (M, k) in pares:
    g = grupos.get((M, k), vacio)
    t = M.to_timestamp() + pd.Timedelta(days=int(k)); tm = t.to_period('M'); last = tm - 1
    hist = [p for p in [last - i for i in range(6)] if p in Fm.columns]
    act6 = set(Fm.index[(Fm[hist] > 0).any(axis=1)]) if hist else set()
    g = g.set_index('cid')
    # clientes actuales = ya habían facturado antes del mes en que se hace la foto
    uni = [c for c in (act6 | set(g.index)) if c in first.index and first[c].to_period('M') < min(tm, M)]
    G = g.reindex(uni).fillna({'done': 0, 'booked': 0, 'vac': 0, 'F': 0})
    G['M'] = M; G['k'] = k
    r3 = [p for p in [last, last - 1, last - 2] if p in Fm.columns]
    G['run3'] = Fm.reindex(G.index)[r3].mean(axis=1).fillna(0) if r3 else 0
    G['ly'] = [Fm.at[c, M - 12] if (c in Fm.index and (M - 12) in Fm.columns) else 0.0 for c in G.index]
    out.append(G.reset_index().rename(columns={'index': 'cid'}))
df = pd.concat(out)
# temporales previstos de la foto de hoy (en el pasado no existían): fuera de los pesos, se suman después
hoyk = {MHOY + i: int((HOY - (MHOY + i).to_timestamp()).days) for i in range(A.meses)}
df['tprev'] = 0.0
for (c, M), v in PREV.items():
    if M not in hoyk: continue
    sel = (df.M == M) & (df.k == hoyk[M]) & (df.cid == c)
    if not sel.any():
        print(f'aviso: previsto de {names.get(c)} en {M} sin cliente actual; va a nuevos', file=sys.stderr); continue
    df.loc[sel, 'tprev'] = v
dim = df.M.apply(lambda p: p.days_in_month)
df['frac'] = ((dim - df.k.clip(lower=0)) / dim).clip(0, 1)
df['runrem'] = df.run3 * df.frac; df['ly_rem'] = df.ly * df.frac
# --- variables candidatas (SKILL.md §6, se prueban con --fe) ---
def findes_restantes(M, k):
    d = pd.date_range(max(M.to_timestamp(), M.to_timestamp() + pd.Timedelta(days=int(k))), (M + 1).to_timestamp() - pd.Timedelta(days=1))
    return float(((d.day_of_week >= 4)).sum())   # viernes, sábados y domingos que quedan
fr = {(M, k): findes_restantes(M, k) for M, k in df[['M', 'k']].drop_duplicates().itertuples(index=False)}
df['findes_rem'] = df.run3 * [fr[(M, k)] / 13.0 for M, k in zip(df.M, df.k)]
if 'run6rem' in FE:
  df['run6'] = [Fm.loc[c, [p for p in [(M.to_timestamp() + pd.Timedelta(days=int(k))).to_period('M') - 1 - i for i in range(6)] if p in Fm.columns]].mean() if c in Fm.index else 0.0 for c, M, k in zip(df.cid, df.M, df.k)]
  df['run6rem'] = df.run6.fillna(0) * df.frac
df['ly_seas'] = df.runrem * ((df.ly + 500) / (df.run3 + 500)).clip(0.2, 3) * (df.ly > 0)
df['tm'] = [(M.to_timestamp() + pd.Timedelta(days=int(k))).to_period('M') for M, k in zip(df.M, df.k)]


# ---------- 5. Ajuste honesto (solo meses cerrados en el momento de la foto) y rango ----------
def fit(M, k):
    tm = (M.to_timestamp() + pd.Timedelta(days=int(k))).to_period('M')
    tr = df[(df.M <= tm - 1) & (df.M >= tm - REC) & (df.M <= CERRADO) & (df.k >= k - 3) & (df.k <= k + 3)]
    if tr.M.nunique() < 4: return None, tm
    return nnls(tr[FE].values, (tr.F - tr.done).values)[0], tm


R = []; coefs = {}
for (M, k), x in df.groupby(['M', 'k']):
    if M < pd.Period('2025-07', 'M'): continue
    b, tm = fit(M, k)
    if b is None: continue
    coefs[(M, k)] = b
    R.append((M, k, tm, x.done.sum(), x.booked.sum(), x.vac.sum(), x.tprev.sum(), x.done.sum() + (x[FE].values @ b).sum(), x.F.sum()))
R = pd.DataFrame(R, columns=['M', 'k', 'tm', 'done', 'booked', 'vac', 'prev', 'pred', 'F'])
R['lr'] = np.log((R.F + 1) / (R.pred + 1))


def band(M, k, tm):
    e = R[(R.M <= tm - 1) & (R.M <= CERRADO) & (R.k >= k - 3) & (R.k <= k + 3)]
    if e.M.nunique() < 6: return [np.nan] * len(Q), e.M.nunique()
    return [np.quantile(e.lr, q) for q in Q], e.M.nunique()


def ratios_suelo(k, tm):
    """Qué parte de lo agendado acabó facturada, en los meses cerrados de los que aprende el modelo, al
    mismo día relativo (±3). Antes de empezar el mes casi nunca hay agendado que medir (menos de 6
    meses): se usa la primera semana del mes (días 0 a 6). Supuesto, SKILL.md §1."""
    e = REAL[(REAL.M <= tm - 1) & (REAL.M >= tm - REC) & (REAL.M <= CERRADO)]
    w = e[(e.k >= k - 3) & (e.k <= k + 3)]
    if w.M.nunique() < 6: w = e[(e.k >= 0) & (e.k <= 6)]
    return w.ratio.values


bt = []
for r in R.itertuples():
    b, n = band(r.M, r.k, r.tm)
    ps = [r.pred * np.exp(v) for v in b]
    rs = ratios_suelo(r.k, r.tm)
    if len(rs):
        # previsto: lo que se factura de lo agendado en cada cuantil; suelo: hecho + (agendado + previsto) igual
        ps = [max(p + r.prev * float(np.quantile(rs, q)), r.done + float(np.quantile(rs, q)) * (r.booked + r.prev))
              for p, q in zip(ps, Q)]
    bt.append(ps + [n])
R[['p025', 'p10', 'p50', 'p90', 'p975', 'n_meses']] = bt

ev = R[(R.M <= CERRADO) & R.p10.notna()]
ev = ev.assign(in80=(ev.F >= ev.p10) & (ev.F <= ev.p90), in95=(ev.F >= ev.p025) & (ev.F <= ev.p975))
examen = {'wape_todo': round(float((ev.pred - ev.F).abs().sum() / ev.F.sum()), 3),
          'cobertura80': round(float(ev.in80.mean()), 2), 'cobertura95': round(float(ev.in95.mean()), 2),
          'meses_evaluados': int(ev.M.nunique()), 'variables': FE}
for a, b_ in [(-70, -29), (-28, -1), (0, 6), (7, 13), (14, 20), (21, 30)]:
    s_ = ev[(ev.k >= a) & (ev.k <= b_)]
    if len(s_): examen[f'dias_{a}_{b_}'] = {'wape': round(float((s_.pred - s_.F).abs().sum() / s_.F.sum()), 3), 'cob80': round(float(s_.in80.mean()), 2), 'cob95': round(float(s_.in95.mean()), 2)}

# ---------- 6. Curva de arranque de un cliente nuevo ----------
fm_months = [p for p in Fm.columns if p <= CERRADO]
curva = []
for c, f in first.items():
    fp = f.to_period('M')
    if fp < pd.Period('2025-07', 'M') or fp + 2 > CERRADO: continue
    curva.append([Fm.at[c, fp + i] if (fp + i) in Fm.columns else 0.0 for i in range(3)])
curva = np.array(curva)
arranque = {'clientes': int(len(curva))}
for i in range(3):
    v = curva[:, i]
    arranque[f'mes{i + 1}'] = {'p25': round(float(np.quantile(v, .25))), 'mediana': round(float(np.median(v))),
                               'p75': round(float(np.quantile(v, .75))), 'p90': round(float(np.quantile(v, .9))),
                               'media': round(float(v.mean())), 'siguen_pidiendo_pct': round(float((v > 0).mean() * 100))}

# ---------- 7. Previsión de los meses pedidos ----------
res = {'hoy': str(HOY.date()), 'ultimo_mes_cerrado': str(CERRADO), 'examen': examen, 'arranque_nuevos': arranque,
       'arranque_crudo': curva.round().tolist(), 'meses': []}
for i in range(A.meses):
    M = MHOY + i; k = int((HOY - M.to_timestamp()).days)
    x = df[(df.M == M) & (df.k == k)]; r = R[(R.M == M) & (R.k == k)]
    if r.empty: res['meses'].append({'mes': str(M), 'error': 'sin datos para ese día'}); continue
    r = r.iloc[0]; b = coefs[(M, k)]; rs = ratios_suelo(k, r.tm); med = float(np.median(rs)) if len(rs) else 1.0
    x = x.assign(prev=x.done + x[FE].values @ b + x.tprev * med, nombre=x.cid.map(names))
    top = x.sort_values('prev', ascending=False).head(15)
    # nuevos: lo que ya hay en el sistema de clientes que no habían facturado nunca antes de este mes
    s_all = snap[(snap.M == M) & (snap.k == k)]
    nuevos = s_all[~s_all.cid.isin(x.cid)]
    nuevos = nuevos[(nuevos.done + nuevos.booked + nuevos.vac) > 0]
    res['meses'].append({
        'mes': str(M), 'dia_relativo': k, 'meses_para_rango': int(r.n_meses),
        'hecho': round(r.done), 'agendado': round(r.booked), 'temporales_previstos': round(r.prev),
        'vacantes': round(r.vac),
        'suelo': {'ratios_facturado_de_agendado': [round(float(v), 3) for v in rs],
                  **({q_: round(r.done + float(np.quantile(rs, q)) * (r.booked + r.prev))
                      for q_, q in zip(['p025', 'p10', 'p50'], Q[:3])} if len(rs) else {})},
        'modelo': round(r.pred + r.prev * med), 'modelo_sin_previsto': round(r.pred), 'p025': round(r.p025), 'p10': round(r.p10), 'p50': round(r.p50),
        'p90': round(r.p90), 'p975': round(r.p975),
        'pesos': dict(zip(FE, [round(float(v), 3) for v in b])),
        'top_clientes': [{'cliente': t.nombre, 'hecho': round(t.done), 'agendado': round(t.booked),
                          'temporales_previstos': round(t.tprev),
                          'vacantes': round(t.vac), 'ritmo3m': round(t.run3), 'mismo_mes_ano_pasado': round(t.ly),
                          'prevision': round(t.prev)} for t in top.itertuples()],
        'peso_top5_pct': round(float(top.prev.head(5).sum() / max(x.prev.sum(), 1) * 100)),
        'nuevos_en_sistema': [{'cliente': names.get(c), 'hecho': round(d), 'agendado': round(bk), 'vacantes': round(v)}
                              for c, d, bk, v in zip(nuevos.cid, nuevos.done, nuevos.booked, nuevos.vac)],
    })
# cómo cerraron los meses ya cerrados que se predijeron: para el registro
res['cerrados'] = [{'mes': str(M), 'facturado': round(float(Fm[M].drop(list(test), errors='ignore').sum()))}
                   for M in Fm.columns if CERRADO - 3 <= M <= CERRADO]
json.dump(res, open(f'{D}resultado_{HOY.date()}.json', 'w'), ensure_ascii=False, indent=1, default=str)
print(json.dumps(res, ensure_ascii=False, indent=1, default=str))
