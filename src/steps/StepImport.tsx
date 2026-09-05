/**
 * Paso 1 — Portada e importación.
 *
 * Es la pantalla que decide si el usuario sigue o cierra la pestaña, así que
 * hace tres cosas y ninguna más: promete algo concreto, ofrece una sola acción
 * principal (soltar el fichero) y deja a mano la salida para quien no lo tenga
 * delante (los datos de ejemplo).
 *
 * El análisis no es decoración: recorre los pasos reales de `lib/fakeAI` y los
 * va marcando. Cuando termina llama a `loadDataset`, que ya avanza de paso.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react'
import {
  ArrowRight,
  CalendarRange,
  Check,
  Clock,
  FileSpreadsheet,
  HelpCircle,
  Laptop,
  Loader2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Upload,
  Users,
} from 'lucide-react'
import { ANALYSIS_STEPS, analyzeFile } from '@/lib/fakeAI'
import { usePlanner } from '@/hooks/usePlanner'
import { QueVasAObtener } from '@/components/QueVasAObtener'
import { Button, Card, Modal, Note, cn } from '@/components/ui'

const TOTAL_STEPS = ANALYSIS_STEPS.length

type Phase = 'idle' | 'analyzing' | 'done'

const SELLING_POINTS: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <ShieldCheck size={17} strokeWidth={2.4} />,
    title: 'Sin registro',
    text: 'Ni email, ni tarjeta, ni comercial llamándote luego.',
  },
  {
    icon: <Clock size={17} strokeWidth={2.4} />,
    title: 'En dos minutos',
    text: 'Cuatro pasos y tienes plantilla, contratos y cuadrante.',
  },
  {
    icon: <Laptop size={17} strokeWidth={2.4} />,
    title: 'Tus datos no salen de aquí',
    text: 'El fichero se lee en tu navegador. No se sube a ningún servidor.',
  },
]

const HOW_IT_WORKS: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <FileSpreadsheet size={18} strokeWidth={2.2} />,
    title: 'Nos das tu histórico de comensales',
    text: 'Lo que saque tu TPV, tal cual. De ahí sacamos cuánta gente entró por tu puerta cada media hora, día a día, durante un año entero.',
  },
  {
    icon: <CalendarRange size={18} strokeWidth={2.2} />,
    title: 'Te enseñamos tu año y tu semana',
    text: 'Tu horario, tus semanas raras (Semana Santa, agosto, la fiesta del barrio) y hasta dónde quieres llegar con plantilla fija. Corriges lo que no cuadre: tú conoces tu casa mejor que ningún fichero.',
  },
  {
    icon: <SlidersHorizontal size={18} strokeWidth={2.2} />,
    title: 'Dices cuánta gente pide cada nivel de sala',
    text: 'De 1 a 10 comensales, un camarero y uno de cocina. De 11 a 25, dos camareros… Esa tabla es tuya y es la única regla que hace falta. Viene rellena con algo razonable para que no arranques en blanco.',
  },
  {
    icon: <Users size={18} strokeWidth={2.2} />,
    title: 'Te devolvemos la plantilla y el cuadrante',
    text: 'Cuántas personas, con qué contratos y en qué turnos. Y, aparte, las horas del año que son pico puro: esas no compensa contratarlas, se cubren con extras.',
  },
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** "hace 5 minutos" en vez de una fecha ISO: nadie lee una fecha para saber
 *  si eso que hay guardado es de hoy o de la semana pasada. */
function haceCuanto(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} ${min === 1 ? 'minuto' : 'minutos'}`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`
  const d = Math.round(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

export function StepImport() {
  const p = usePlanner()
  const inputId = useId()

  const [phase, setPhase] = useState<Phase>('idle')
  /** Paso en curso. -1 = aún no ha empezado; TOTAL_STEPS = todos hechos. */
  const [current, setCurrent] = useState(-1)
  const [source, setSource] = useState<{ name: string; size: number | null } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [howOpen, setHowOpen] = useState(false)
  const [doneInfo, setDoneInfo] = useState<{ weeks: number; year: number } | null>(null)

  // dragleave salta también al pasar sobre los hijos del contenedor: se cuenta
  // la profundidad para no apagar el estado visual a mitad de arrastre.
  const dragDepth = useRef(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // Un fichero soltado FUERA de la zona hace que el navegador lo abra y se lleve
  // por delante la sesión. Como no hay backend, eso significa empezar de cero.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  async function run(file: File | null) {
    if (phase !== 'idle') return
    setError(null)
    setDoneInfo(null)
    setCurrent(-1)
    setPhase('analyzing')
    setSource(
      file
        ? { name: file.name, size: file.size }
        : { name: 'Datos de ejemplo · restaurante de menú y carta', size: null },
    )

    try {
      const dataset = await analyzeFile(
        file ? { name: file.name, size: file.size } : null,
        (progress) => {
          if (alive.current) setCurrent(progress.step)
        },
      )
      if (!alive.current) return

      setCurrent(TOTAL_STEPS)
      setDoneInfo({ weeks: dataset.weeks.length, year: dataset.year })
      setPhase('done')
      // Medio segundo para que se vea el último check antes de cambiar de paso:
      // si no, el trabajo terminado no se llega a leer.
      await sleep(650)
      if (!alive.current) return
      p.loadDataset(dataset)
    } catch {
      if (!alive.current) return
      setPhase('idle')
      setCurrent(-1)
      setSource(null)
      setError('No hemos podido leer ese fichero. Prueba con otro o tira con los datos de ejemplo.')
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    // Se limpia el valor para que volver a elegir el mismo fichero vuelva a disparar.
    e.target.value = ''
    if (file) void run(file)
  }

  function onDragEnter(e: DragEvent<HTMLLabelElement>) {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  function onDragOver(e: DragEvent<HTMLLabelElement>) {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void run(file)
  }

  const working = phase !== 'idle'
  const pct = phase === 'done' ? 100 : current < 0 ? 4 : ((current + 0.55) / TOTAL_STEPS) * 100

  return (
    <div className="mx-auto max-w-3xl pt-6 sm:pt-12">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <div className="animate-slide-up text-center">
        <span className="eyebrow eyebrow--purple">Planificador de plantilla</span>

        <h1 className="h1 mt-4 text-[2rem] sm:text-[2.6rem] md:text-[3.05rem]">
          ¿Cuánta gente necesitas de verdad?
          <br />
          <span className="text-brand italic">Tu histórico ya lo sabe.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-[1.02rem] leading-relaxed text-content-body sm:text-[1.08rem]">
          Súbenos el histórico de comensales de tu TPV y te decimos la plantilla que pide tu
          demanda real: cuántas personas, con qué contratos y en qué turnos. Gratis y sin
          registrarte.
        </p>
      </div>

      <div className="stagger mt-8 grid gap-3 sm:grid-cols-3">
        {SELLING_POINTS.map((s) => (
          <div
            key={s.title}
            className="flex items-start gap-3 rounded-card border border-border-soft bg-surface-elevated px-4 py-3.5 text-left"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-brand-light text-brand">
              {s.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.88rem] font-bold text-content-primary">{s.title}</span>
              <span className="mt-0.5 block text-[0.78rem] leading-snug text-content-secondary">
                {s.text}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* Lo guardado se OFRECE, no se restaura solo: esta es la pantalla que
          vende el producto, y a un visitante nuevo no le puede saltar encima
          el plan de otro día antes de haberla visto. */}
      {p.savedMeta && (
        <div className="mt-8">
          <Card className="animate-pop-in border-brand/30 bg-brand-light px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.95rem] font-bold text-content-primary">
                  Sigues con {p.savedMeta.fileName}
                </p>
                <p className="mt-0.5 text-[0.82rem] text-content-secondary">
                  {p.savedMeta.weeks} semanas de {p.savedMeta.year}, guardado {haceCuanto(p.savedMeta.savedAt)}.
                  Se guarda solo en este navegador.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={p.resumeSaved} iconRight={<ArrowRight size={15} />}>
                  Seguir donde lo dejé
                </Button>
                <Button size="sm" variant="ghost" onClick={p.discardSaved}>
                  Empezar de cero
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Subida / análisis ──────────────────────────────────── */}
      <div className="mt-10">
        {!working ? (
          <>
            <input
              id={inputId}
              type="file"
              onChange={onPick}
              className="peer sr-only"
              aria-label="Subir tu histórico de comensales"
              aria-describedby={`${inputId}-hint`}
            />
            <label
              htmlFor={inputId}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-12 text-center transition-all duration-200 sm:py-16',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-brand',
                dragging
                  ? 'border-brand bg-brand-light shadow-md'
                  : 'border-border bg-surface-elevated hover:border-brand/45 hover:bg-brand-light/35',
              )}
            >
              <span
                className={cn(
                  'flex h-14 w-14 items-center justify-center rounded-pill transition-colors',
                  dragging ? 'bg-brand text-content-inverted' : 'bg-brand-light text-brand',
                )}
              >
                <Upload size={24} strokeWidth={2.2} />
              </span>

              <span className="h3 mt-5 block text-content-primary">
                {dragging ? 'Suéltalo aquí' : 'Arrastra aquí tu fichero'}
              </span>
              <span className="mt-1.5 block text-[0.92rem] font-medium text-content-secondary">
                o haz clic para buscarlo en tu ordenador
              </span>

              <span
                id={`${inputId}-hint`}
                className="mt-5 block max-w-sm text-[0.8rem] leading-relaxed text-content-muted"
              >
                Da igual el formato: el export de tu TPV, un Excel, un CSV, un PDF de listados.
                Ya nos apañamos nosotros con las columnas.
              </span>
            </label>

            {error && (
              <div className="mt-4">
                <Note tone="danger" icon={<TriangleAlert size={16} />}>
                  {error}
                </Note>
              </div>
            )}

            {/* Lo que se lleva, antes de pedirle nada. Aquí es donde se cae la
                gente: el que duda se pone a pelearse con el export de su TPV
                sin saber todavía si le va a servir. */}
            <div className="mt-10">
              <QueVasAObtener onDemo={() => void run(null)} />
            </div>

            {/* ── Salida para quien no tenga el fichero a mano ──── */}
            <div className="mt-7 flex flex-col items-center">
              <div className="flex w-full items-center gap-4">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[0.72rem] font-bold tracking-widest text-content-muted uppercase">
                  o
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button
                size="lg"
                className="mt-6"
                onClick={() => void run(null)}
                icon={<Sparkles size={17} strokeWidth={2.3} />}
                iconRight={<ArrowRight size={16} />}
              >
                Probar con datos de ejemplo
              </Button>

              <p className="mt-3 max-w-md text-center text-[0.8rem] leading-relaxed text-content-secondary">
                52 semanas de un restaurante de menú y carta de verdad, con su agosto flojo y sus
                comidas de empresa de diciembre. Míralo funcionando y luego sube lo tuyo.
              </p>
            </div>
          </>
        ) : (
          <Card className="animate-pop-in overflow-hidden px-5 py-6 sm:px-7 sm:py-7">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-brand-light text-brand">
                <FileSpreadsheet size={20} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="h4 truncate text-content-primary">{source?.name}</p>
                <p className="mt-0.5 text-[0.8rem] font-medium text-content-secondary">
                  {phase === 'done' && doneInfo
                    ? `${doneInfo.weeks} semanas de ${doneInfo.year}, leídas.`
                    : source?.size != null
                      ? `${formatSize(source.size)} · leyéndolo aquí, en tu navegador`
                      : 'Leyéndolo aquí, en tu navegador'}
                </p>
              </div>
              <span
                className={cn(
                  'ml-auto shrink-0 rounded-pill px-3 py-1 text-[0.72rem] font-bold',
                  phase === 'done' ? 'bg-success-light text-success' : 'bg-brand-light text-brand',
                )}
              >
                {phase === 'done' ? 'Listo' : 'Analizando'}
              </span>
            </div>

            <div className="mt-5 h-1.5 overflow-hidden rounded-pill bg-surface">
              <div
                className={cn(
                  'h-full rounded-pill transition-[width] duration-500 ease-out',
                  phase === 'done' ? 'bg-success' : 'bg-brand',
                )}
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progreso del análisis"
              />
            </div>

            <ol className="mt-5 space-y-0.5">
              {ANALYSIS_STEPS.map((s, i) => {
                const done = i < current
                const active = i === current
                return (
                  <li key={s.label} className="flex items-start gap-3 py-2">
                    <span
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill transition-colors',
                        done
                          ? 'bg-success-light text-success'
                          : active
                            ? 'bg-brand-light text-brand'
                            : 'bg-surface text-content-muted',
                      )}
                    >
                      {done ? (
                        <span className="animate-pop-in flex">
                          <Check size={14} strokeWidth={3} />
                        </span>
                      ) : active ? (
                        <Loader2 size={13} strokeWidth={2.6} className="animate-spin" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-pill bg-content-muted" />
                      )}
                    </span>

                    <span className="min-w-0">
                      <span
                        className={cn(
                          'block text-[0.9rem] leading-snug font-bold transition-colors',
                          done || active ? 'text-content-primary' : 'text-content-muted',
                        )}
                      >
                        {s.label}
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 block text-[0.78rem] leading-snug',
                          active ? 'text-content-secondary' : 'text-content-muted',
                        )}
                      >
                        {s.detail}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ol>

            {/* Lo que se anuncia por voz: el paso en curso, no la lista entera. */}
            <p aria-live="polite" className="sr-only">
              {phase === 'done'
                ? 'Análisis terminado.'
                : current >= 0
                  ? `${ANALYSIS_STEPS[current].label}. Paso ${current + 1} de ${TOTAL_STEPS}.`
                  : 'Empezando el análisis.'}
            </p>
          </Card>
        )}
      </div>

      {/* ── Cómo funciona ──────────────────────────────────────── */}
      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={() => setHowOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-pill px-3 py-2 text-[0.85rem] font-semibold text-content-secondary transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <HelpCircle size={15} strokeWidth={2.3} />
          Cómo funciona esto
        </button>
      </div>

      <Modal
        open={howOpen}
        onClose={() => setHowOpen(false)}
        title="Cómo funciona"
        subtitle="Cuatro pasos. Ninguno te pide nada que no tengas ya."
        footer={<Button onClick={() => setHowOpen(false)}>Entendido</Button>}
      >
        <ol className="space-y-5">
          {HOW_IT_WORKS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="relative flex shrink-0 flex-col items-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-brand-light text-brand">
                  {s.icon}
                </span>
                {i < HOW_IT_WORKS.length - 1 && <span className="mt-2 w-px flex-1 bg-border-soft" />}
              </span>
              <span className="min-w-0 pb-1">
                <span className="block text-[0.7rem] font-bold tracking-widest text-content-muted uppercase">
                  Paso {i + 1}
                </span>
                <span className="mt-1 block text-[0.95rem] font-bold text-content-primary">
                  {s.title}
                </span>
                <span className="mt-1 block text-[0.86rem] leading-relaxed text-content-secondary">
                  {s.text}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-6">
          <Note tone="neutral" icon={<Laptop size={16} />}>
            No hay servidor detrás. El cálculo entero ocurre en esta pestaña, así que si la
            cierras se pierde: descárgate el resultado al terminar.
          </Note>
        </div>
      </Modal>

      {/* ── Pie ────────────────────────────────────────────────── */}
      <footer className="mt-16 border-t border-border-soft pt-8 text-center">
        <img src="/shifty-logo.svg" alt="Shifty" className="mx-auto h-6 w-auto" />
        <p className="mx-auto mt-3 max-w-md text-[0.82rem] leading-relaxed text-content-secondary">
          Shifty es el marketplace de personal de hostelería: extras verificados en tu barra en
          cuestión de horas, para tapar los picos sin engordar la plantilla todo el año.
        </p>
        <a
          href="https://shifty.es"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 rounded-pill px-2 py-1 text-[0.82rem] font-bold text-brand transition-colors hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          shifty.es
          <ArrowRight size={14} />
        </a>
      </footer>
    </div>
  )
}
