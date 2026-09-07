/**
 * Tramos: de comensales a personas.
 *
 * Es el único input de verdad del producto. El resto del cálculo (horas,
 * contratos, cuadrante) sale de aquí, así que la tabla tiene que poder
 * rellenarse entera con el teclado y no dejar ninguna duda sobre lo que hace
 * cada número.
 *
 * Invariante que mantiene esta pantalla: los tramos cubren 1..∞ de forma
 * contigua. El usuario solo edita el TECHO de cada tramo y el suelo del
 * siguiente se recalcula (`rechain`), de modo que por construcción no puede
 * dejar huecos ni solapes. `validateTiers` se sigue ejecutando sobre lo que
 * llega por props: si el estado viene tocado desde fuera, el usuario ve el
 * problema en vez de un cálculo raro sin explicación.
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import { AlertTriangle, ArrowUpDown, Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  InfoTip,
  InlineName,
  Modal,
  Note,
  TextInput,
  cn,
} from '@/components/ui'
import { normalizeTiers, validateTiers } from '@/lib/staffing'
import {
  DEFAULT_BLOCKS,
  DEFAULT_ROLES,
  DEFAULT_TIERS,
  PALETTE,
  SUGGESTED_BLOCKS,
} from '@/data/presets'
import {
  borrarPuesto,
  borrarZona,
  crearPuesto,
  crearZona,
  nextColor,
  renombrarPuesto,
  renombrarZona,
  type ModelParts,
} from '@/lib/catalogo'
import type { Block, Role, StaffingModel, Tier } from '@/lib/types'

/** Grupo de puestos sin bloque válido: no debería pasar, pero si pasa se ve. */
const ORPHAN_BLOCK_ID = '__sin-bloque'

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function rangeLabel(t: Tier): string {
  return Number.isFinite(t.to) ? `${t.from} - ${t.to}` : `${t.from} o más`
}

/** Ancho en comensales de un tramo. El abierto no tiene, así que vale 30. */
function spanOf(t: Tier): number {
  return Number.isFinite(t.to) ? Math.max(1, t.to - t.from + 1) : 30
}

/**
 * Recalcula los suelos a partir de los techos: el primero arranca en 1 y cada
 * tramo empieza donde acabó el anterior. El último queda siempre abierto.
 */
function rechain(list: Tier[]): Tier[] {
  const out: Tier[] = []
  let from = 1
  for (let i = 0; i < list.length; i++) {
    const isLast = i === list.length - 1
    const to = isLast ? Number.POSITIVE_INFINITY : Math.max(from, list[i].to)
    out.push({ ...list[i], from, to })
    from = to + 1
  }
  return out
}


/** Tinte suave del color del bloque para la cabecera. Los hex vienen del dato. */
function tint(hex: string): string {
  return `${hex}14`
}

// ─────────────────────────────────────────────────────────────
// Techo del tramo
// ─────────────────────────────────────────────────────────────

/**
 * El techo se confirma al salir del campo, no en cada tecla: si se recalculara
 * mientras se escribe, teclear "120" pasaría por "1" y "12" y reencadenaría
 * toda la tabla dos veces por el camino.
 */
function BoundInput({
  value,
  min,
  onCommit,
  ariaLabel,
}: {
  value: number
  min: number
  onCommit: (v: number) => void
  ariaLabel: string
}) {
  const [draft, setDraft] = useState<string | null>(null)

  function commit() {
    if (draft !== null && draft.trim() !== '') {
      const n = Number(draft)
      if (Number.isFinite(n)) onCommit(Math.max(min, Math.round(n)))
    }
    setDraft(null)
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      value={draft ?? String(value)}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
      className={cn(
        'h-9 w-16 rounded-md border border-border bg-surface-elevated px-1.5 text-center',
        'text-[0.9rem] font-bold tabular-nums text-content-primary',
        'transition-colors focus:border-border-focus focus:outline-none',
      )}
    />
  )
}

/**
 * Celda de personal: un número compacto propio, no el `NumberInput` genérico
 * (44px de alto en todo el resto de la app) — en una tabla con siete tramos y
 * varios puestos, esa altura por fila era lo que la hacía sentir enorme.
 */
function TierCellInput({
  id,
  value,
  onChange,
  onKeyDown,
  onFocus,
  ariaLabel,
}: {
  id: string
  value: number
  onChange: (v: number) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  onFocus: (e: FocusEvent<HTMLInputElement>) => void
  ariaLabel: string
}) {
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value)
        onChange(Number.isFinite(n) ? Math.min(99, Math.max(0, n)) : 0)
      }}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      aria-label={ariaLabel}
      className={cn(
        'h-8 w-12 rounded-md border border-border bg-surface-elevated text-center',
        'text-[0.85rem] font-bold tabular-nums text-content-primary',
        'transition-colors focus:border-border-focus focus:outline-none',
      )}
    />
  )
}

/**
 * Suelo y techo de una celda. Van más pequeños y apagados que el objetivo a
 * propósito: la cifra que manda sigue siendo la de arriba, estos son los
 * topes entre los que se le deja mover. Un 0 significa "sin límite".
 */
function LimitInput({
  value,
  onChange,
  tone,
  ariaLabel,
}: {
  value: number
  onChange: (v: number) => void
  tone: 'min' | 'max'
  ariaLabel: string
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      value={value === 0 ? '' : value}
      placeholder={tone === 'min' ? 'mín' : 'máx'}
      onChange={(e) => {
        const n = Number(e.target.value)
        onChange(Number.isFinite(n) ? Math.min(99, Math.max(0, Math.round(n))) : 0)
      }}
      aria-label={ariaLabel}
      className={cn(
        'h-6 w-[26px] rounded border border-border-soft bg-surface text-center',
        'text-[0.68rem] font-bold tabular-nums text-content-secondary',
        'placeholder:font-medium placeholder:text-content-muted',
        'transition-colors focus:border-border-focus focus:outline-none',
      )}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// Modal de bloque nuevo
// ─────────────────────────────────────────────────────────────

function AddBlockModal({
  usedNames,
  usedColors,
  onClose,
  onCreate,
}: {
  usedNames: string[]
  usedColors: string[]
  onClose: () => void
  onCreate: (name: string, color: string) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(() => nextColor(usedColors, PALETTE[0]))

  return (
    <Modal
      open
      onClose={onClose}
      title="Añadir un bloque"
      subtitle="Un bloque es un área del local. Sus puestos se agrupan juntos en la tabla."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim(), color)}
            icon={<Plus size={16} />}
          >
            Añadir bloque
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[0.8rem] font-bold tracking-wide text-content-secondary uppercase">
        De un clic
      </p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_BLOCKS.map((s) => {
          const already = usedNames.some((n) => n.toLowerCase() === s.name.toLowerCase())
          return (
            <button
              key={s.name}
              type="button"
              disabled={already}
              onClick={() => onCreate(s.name, s.color)}
              className={cn(
                'inline-flex items-center gap-2 rounded-pill border px-3.5 py-2 text-[0.85rem] font-bold transition-all',
                already
                  ? 'cursor-not-allowed border-border-soft bg-surface text-content-muted'
                  : 'border-border bg-surface-elevated text-content-primary hover:border-brand hover:bg-brand-light',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              )}
            >
              <span
                className="h-2.5 w-2.5 rounded-pill"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              {s.name}
              {already && <span className="text-[0.7rem] font-semibold">ya está</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-6">
        <label
          htmlFor="nuevo-bloque"
          className="mb-2 block text-[0.8rem] font-bold tracking-wide text-content-secondary uppercase"
        >
          O escribe el tuyo
        </label>
        <TextInput
          id="nuevo-bloque"
          value={name}
          placeholder="Barra, Terraza, Reparto…"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onCreate(name.trim(), color)
          }}
        />
        <p className="mt-4 mb-2 text-[0.8rem] font-bold tracking-wide text-content-secondary uppercase">
          Color
        </p>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Usar el color ${c}`}
              aria-pressed={color === c}
              className={cn(
                'h-8 w-8 rounded-pill transition-transform',
                color === c
                  ? 'scale-110 ring-2 ring-content-primary ring-offset-2'
                  : 'hover:scale-105',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────
// Tabla de tramos
// ─────────────────────────────────────────────────────────────

type Confirm =
  | { kind: 'role'; role: Role; usedIn: number }
  | { kind: 'block'; block: Block; roleCount: number }
  | { kind: 'reset' }

export function TiersTable({
  model,
  onTiersChange,
  onRolesChange,
  onBlocksChange,
}: {
  model: StaffingModel
  onTiersChange: (t: Tier[]) => void
  onRolesChange: (r: Role[]) => void
  onBlocksChange: (b: Block[]) => void
}) {
  const uid = useId()
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [blockModal, setBlockModal] = useState(false)
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null)
  /** Los límites por celda van escondidos: son la segunda pregunta, y con
   *  ellos siempre visibles la tabla triplica de tamaño y cuesta seguirla. */
  const [showLimits, setShowLimits] = useState(false)

  /*
   * QUE SE VEA QUE LA TABLA SIGUE HACIA LA DERECHA.
   *
   * Con más de cuatro o cinco puestos la tabla no cabe y hay que arrastrarla,
   * pero nada lo indicaba: el borde de la tarjeta corta la última columna
   * limpiamente y parece el final. Quien tiene seis puestos no llega a ver los
   * dos últimos y no sabe que están.
   *
   * Se resuelve con una sombra en el borde por el que queda tabla, y se apaga
   * cuando ya no queda: una sombra siempre puesta deja de significar nada.
   */
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [sombra, setSombra] = useState({ izq: false, der: false })

  const medirSombra = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    // El margen de 1 px evita que un ancho fraccionario deje la sombra
    // encendida para siempre en una tabla que sí cabe entera.
    const izq = el.scrollLeft > 1
    const der = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    // Solo se toca el estado si de verdad cambia. Sin esto, cada evento de
    // scroll creaba un objeto nuevo y React repintaba la tabla entera en cada
    // fotograma del arrastre, que en esta tabla se nota.
    setSombra((antes) => (antes.izq === izq && antes.der === der ? antes : { izq, der }))
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    medirSombra()
    // Hay que volver a medir cuando cambia el tamaño, no solo al arrastrar:
    // añadir o quitar un puesto cambia el ancho sin que nadie haya hecho scroll.
    const ro = new ResizeObserver(medirSombra)
    ro.observe(el)
    for (const hijo of Array.from(el.children)) ro.observe(hijo)
    return () => ro.disconnect()
  }, [medirSombra])

  const { tiers, roles, blocks } = model

  /** Columnas agrupadas por bloque, en el orden en que se pintan. */
  const groups = useMemo(() => {
    const gs = blocks.map((block) => ({
      block,
      roles: roles.filter((r) => r.blockId === block.id),
    }))
    const orphans = roles.filter((r) => !blocks.some((b) => b.id === r.blockId))
    if (orphans.length) {
      gs.push({
        block: { id: ORPHAN_BLOCK_ID, name: 'Sin bloque', color: 'var(--color-content-muted)' },
        roles: orphans,
      })
    }
    return gs
  }, [blocks, roles])

  const issues = useMemo(() => validateTiers(tiers), [tiers])
  const colCount = 1 + groups.reduce((a, g) => a + Math.max(1, g.roles.length), 0) + 1

  // ── Escrituras ────────────────────────────────────────────

  /** Cambios que tocan los límites: se reencadena para no dejar huecos. */
  function commitChain(list: Tier[]) {
    onTiersChange(normalizeTiers(rechain(list)))
  }

  function setCell(tierId: string, roleId: string, v: number) {
    onTiersChange(
      tiers.map((t) => (t.id === tierId ? { ...t, staff: { ...t.staff, [roleId]: v } } : t)),
    )
  }

  /**
   * Suelo y techo de una celda. Un 0 en el suelo o un valor por encima del
   * techo posible no se guardan como límite: se borra la entrada, para no
   * dejar el objeto lleno de ceros que luego parecen un límite de verdad.
   */
  function setLimit(tierId: string, roleId: string, which: 'staffMin' | 'staffMax', v: number) {
    onTiersChange(
      tiers.map((t) => {
        if (t.id !== tierId) return t
        const next = { ...(t[which] ?? {}) }
        if (v > 0) next[roleId] = v
        else delete next[roleId]
        return { ...t, [which]: next }
      }),
    )
  }

  function setBound(index: number, v: number) {
    commitChain(tiers.map((t, i) => (i === index ? { ...t, to: v } : t)))
  }

  function zeroStaff(): Record<string, number> {
    return Object.fromEntries(roles.map((r) => [r.id, 0]))
  }

  /** Añade un tramo detrás de `index`. Con -1 o tabla vacía, crea el primero. */
  function addTierAfter(index: number) {
    if (tiers.length === 0 || index < 0) {
      commitChain([
        ...tiers,
        { id: newId('t'), from: 1, to: Number.POSITIVE_INFINITY, staff: zeroStaff() },
      ])
      return
    }
    const list = [...tiers]
    const base = list[index]
    const width = spanOf(base)
    // Se prerrellena copiando el tramo de arriba: es lo que el usuario iba a
    // hacer de todas formas, y así solo corrige lo que cambia.
    const staff = { ...base.staff }
    // Los límites se copian igual que el objetivo: duplicar un tramo y perder
    // por el camino su suelo y su techo sorprende y no se ve.
    const limits = {
      staffMin: { ...(base.staffMin ?? {}) },
      staffMax: { ...(base.staffMax ?? {}) },
    }

    if (index === list.length - 1) {
      // El último tramo es el abierto: pasa a tener techo y el nuevo hereda el "o más".
      const to = Number.isFinite(base.to) ? base.to : base.from + width - 1
      list[index] = { ...base, to }
      list.push({ id: newId('t'), from: to + 1, to: Number.POSITIVE_INFINITY, staff, ...limits })
    } else {
      list.splice(index + 1, 0, {
        id: newId('t'),
        from: base.to + 1,
        to: base.to + width,
        staff,
        ...limits,
      })
    }
    commitChain(list)
  }

  function removeTier(id: string) {
    commitChain(tiers.filter((t) => t.id !== id))
  }

  function addRole(block: Block) {
    const { parts, roleId } = crearPuesto(partes(), block)
    aplicar(parts)
    setPendingRoleId(roleId)
  }

  function renameRole(id: string, name: string) {
    aplicar(renombrarPuesto(partes(), id, name))
  }

  function removeRole(id: string) {
    aplicar(borrarPuesto(partes(), id))
  }

  /** Las tres listas juntas, que es como las mueven las funciones de `lib`. */
  function partes() {
    return { blocks, roles, tiers }
  }

  /** Aplica de golpe lo que devuelve `lib/catalogo`. */
  function aplicar(p: ModelParts) {
    if (p.blocks !== blocks) onBlocksChange(p.blocks)
    if (p.roles !== roles) onRolesChange(p.roles)
    if (p.tiers !== tiers) onTiersChange(p.tiers)
  }

  function createBlock(name: string, color: string) {
    aplicar(crearZona(partes(), name, color))
    setBlockModal(false)
  }

  function renameBlock(id: string, name: string) {
    aplicar(renombrarZona(partes(), id, name))
  }

  function removeBlock(block: Block) {
    aplicar(borrarZona(partes(), block.id))
  }

  /**
   * Los precios y el "solo jornada completa" se rellenan en el catálogo, en
   * otro paso, y no tienen nada que ver con los números de esta tabla. Al
   * restaurar los valores de ejemplo se conservan para los puestos que
   * sobreviven: perderlos sin avisar deja la pantalla de coste en blanco y
   * nadie relaciona una cosa con la otra.
   */
  function keepPrices(next: Role[]): Role[] {
    return next.map((r) => {
      const prev = roles.find((x) => x.id === r.id)
      return prev ? { ...r, hourlyCostEur: prev.hourlyCostEur, fullTimeOnly: prev.fullTimeOnly } : r
    })
  }

  function restoreDefaults() {
    onBlocksChange(DEFAULT_BLOCKS)
    onRolesChange(keepPrices(DEFAULT_ROLES))
    onTiersChange(DEFAULT_TIERS)
  }

  // ── Teclado ───────────────────────────────────────────────

  const cellId = (row: number, col: number) => `${uid}-c-${row}-${col}`

  /**
   * Tab recorre la fila (orden natural del DOM) y Enter baja a la misma columna
   * del tramo siguiente, que es como se rellena una columna de un tirón.
   * Las flechas arriba/abajo suben y bajan el número: eso ya lo hace el input.
   */
  function onCellKey(e: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const target = document.getElementById(cellId(e.shiftKey ? row - 1 : row + 1, col))
    if (target instanceof HTMLInputElement) {
      target.focus()
      target.select()
    }
  }

  // ── Render ────────────────────────────────────────────────

  const thBase = 'border-b border-border bg-surface-elevated text-left'

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader
          eyebrow="Tramos"
          title={
            <>
              Tu equipo <span className="italic text-brand">por volumen.</span>
            </>
          }
          subtitle="Dinos cuánta gente necesitas en cada tramo de comensales. Es lo único que no podemos deducir de tu histórico: sale de cómo trabajáis vosotros."
          info={
            <InfoTip title="Para qué sirve esta tabla">
              Con tus comensales franja a franja y esta tabla sabemos cuántas personas hacen falta
              a cada media hora del año. De ahí salen las horas, los contratos y el cuadrante.
            </InfoTip>
          }
          action={
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={() => setConfirm({ kind: 'reset' })}
            >
              <span className="hidden sm:inline">Volver a los valores de ejemplo</span>
              <span className="sm:hidden">Ejemplo</span>
            </Button>
          }
        />

        <div className="relative border-t border-border-soft">
          {/* Las sombras van FUERA del que hace scroll y con `pointer-events-none`:
              dentro se moverían con la tabla, y encima taparían los clics de la
              última columna, que es justo la que se quiere alcanzar. */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 left-[140px] z-40 w-6 transition-opacity duration-200',
              'bg-gradient-to-r from-content-primary/12 to-transparent',
              sombra.izq ? 'opacity-100' : 'opacity-0',
            )}
          />
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 right-0 z-40 w-8 transition-opacity duration-200',
              'bg-gradient-to-l from-content-primary/14 to-transparent',
              sombra.der ? 'opacity-100' : 'opacity-0',
            )}
          />
          <div
            ref={scrollerRef}
            onScroll={medirSombra}
            className="scroll-thin max-h-[70vh] overflow-auto"
          >
          <table className="w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  scope="col"
                  className={cn(
                    thBase,
                    'sticky top-0 left-0 z-30 w-[140px] min-w-[140px] border-r px-2.5 py-1.5 align-bottom',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[0.72rem] font-bold tracking-wide text-content-secondary uppercase">
                    Comensales
                    <InfoTip title="Cómo funcionan los tramos">
                      Solo editas el techo de cada tramo: el suelo del siguiente se ajusta solo,
                      para que ningún número de comensales se quede sin tramo. El último no tiene
                      techo — cubre todo lo que venga por encima.
                    </InfoTip>
                  </span>
                </th>

                {groups.map((g, gi) => (
                  <th
                    key={g.block.id}
                    scope="colgroup"
                    colSpan={Math.max(1, g.roles.length)}
                    className={cn(
                      thBase,
                      'sticky top-0 z-20 h-9 px-2.5',
                      gi > 0 && 'border-l-2 border-l-border',
                    )}
                    style={{
                      backgroundColor: tint(g.block.color),
                      boxShadow: `inset 0 3px 0 0 ${g.block.color}`,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-pill"
                        style={{ backgroundColor: g.block.color }}
                        aria-hidden
                      />
                      {g.block.id === ORPHAN_BLOCK_ID ? (
                        <span className="truncate text-[0.8rem] font-extrabold text-content-primary">
                          {g.block.name}
                        </span>
                      ) : (
                        <>
                          <InlineName
                            value={g.block.name}
                            ariaLabel={`Renombrar el bloque ${g.block.name}`}
                            onCommit={(v) => renameBlock(g.block.id, v)}
                            className="text-[0.8rem] font-extrabold text-content-primary"
                          />
                          <span className="ml-auto flex shrink-0 items-center">
                            <button
                              type="button"
                              onClick={() => addRole(g.block)}
                              aria-label={`Añadir un puesto a ${g.block.name}`}
                              title={`Añadir un puesto a ${g.block.name}`}
                              className="rounded-md p-1 text-content-secondary transition-colors hover:bg-surface-elevated hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
                            >
                              <Plus size={14} strokeWidth={3} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirm({
                                  kind: 'block',
                                  block: g.block,
                                  roleCount: g.roles.length,
                                })
                              }
                              aria-label={`Eliminar el bloque ${g.block.name}`}
                              title={`Eliminar el bloque ${g.block.name}`}
                              className="rounded-md p-1 text-content-muted transition-colors hover:bg-surface-elevated hover:text-destructive focus-visible:outline-2 focus-visible:outline-brand"
                            >
                              <Trash2 size={13} />
                            </button>
                          </span>
                        </>
                      )}
                    </div>
                  </th>
                ))}

                <th
                  rowSpan={2}
                  scope="col"
                  className={cn(
                    thBase,
                    'sticky top-0 z-20 w-11 min-w-11 border-l-2 border-l-border px-1 py-2 align-bottom text-center',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setBlockModal(true)}
                    aria-label="Añadir una categoría nueva, por ejemplo Terraza"
                    title="Añadir una categoría (ej. Terraza)"
                    className="mx-auto flex h-8 w-8 items-center justify-center rounded-pill text-content-secondary transition-colors hover:bg-brand-light hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Plus size={16} strokeWidth={3} />
                  </button>
                </th>

              </tr>

              <tr>
                {groups.map((g, gi) =>
                  g.roles.length === 0 ? (
                    <th
                      key={g.block.id}
                      scope="col"
                      className={cn(
                        thBase,
                        'sticky top-9 z-20 px-2.5 py-1.5',
                        gi > 0 && 'border-l-2 border-l-border',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => addRole(g.block)}
                        className="text-[0.78rem] font-bold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        + Añadir puesto
                      </button>
                    </th>
                  ) : (
                    g.roles.map((role, ri) => (
                      <th
                        key={role.id}
                        scope="col"
                        className={cn(
                          thBase,
                          // Se acota el MÁXIMO, no se sube el mínimo: el nombre
                          // largo parte en dos líneas en vez de estirar la
                          // columna, y el corto sigue ocupando lo poco que
                          // ocupaba. Con "Responsable de turno" la columna medía
                          // el doble que su contenido real, que es una casilla
                          // de dos dígitos.
                          'sticky top-9 z-20 max-w-[92px] min-w-[64px] px-1 py-1.5 align-bottom',
                          gi > 0 && ri === 0 && 'border-l-2 border-l-border',
                        )}
                      >
                        <div className="group/role flex items-start gap-1">
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill"
                            style={{ backgroundColor: role.color }}
                            aria-hidden
                          />
                          <InlineName
                            value={role.name}
                            ariaLabel={`Renombrar el puesto ${role.name}`}
                            autoEdit={pendingRoleId === role.id}
                            onEditEnd={() => setPendingRoleId(null)}
                            onCommit={(v) => renameRole(role.id, v)}
                            className="min-w-0 text-[0.78rem] leading-tight font-bold break-words text-content-primary"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setConfirm({
                                kind: 'role',
                                role,
                                usedIn: tiers.filter((t) => (t.staff[role.id] ?? 0) > 0).length,
                              })
                            }
                            aria-label={`Eliminar el puesto ${role.name}`}
                            className="ml-auto shrink-0 rounded-md p-1 text-content-muted opacity-0 transition-opacity group-hover/role:opacity-100 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </th>
                    ))
                  ),
                )}
              </tr>
            </thead>

            <tbody>
              {tiers.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="p-0">
                    <div className="sticky left-0 flex max-w-xl flex-col items-start gap-3 px-6 py-10">
                      <p className="text-[0.95rem] font-semibold text-content-secondary">
                        Todavía no hay ningún tramo. Empieza por el primero —de 1 comensal en
                        adelante— y ve partiéndolo según crezca el servicio.
                      </p>
                      <Button icon={<Plus size={16} />} onClick={() => addTierAfter(-1)}>
                        Crear el primer tramo
                      </Button>
                    </div>
                  </td>
                </tr>
              )}

              {tiers.map((t, row) => {
                const rowIssues = issues.filter((i) => i.tierId === t.id)
                const isLast = row === tiers.length - 1
                let col = -1

                return (
                  <Fragment key={t.id}>
                    <tr className="group">
                      <td
                        className={cn(
                          'sticky left-0 z-10 border-r border-b border-border-soft bg-surface-elevated px-2.5 py-1.5',
                          'group-hover:bg-surface',
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[0.85rem] font-extrabold tabular-nums text-content-primary">
                                {t.from}
                              </span>
                              {isLast ? (
                                <Badge tone="neutral">o más</Badge>
                              ) : (
                                <>
                                  <span className="text-content-muted">–</span>
                                  <BoundInput
                                    value={t.to}
                                    min={t.from}
                                    onCommit={(v) => setBound(row, v)}
                                    ariaLabel={`Hasta cuántos comensales llega el tramo que empieza en ${t.from}`}
                                  />
                                </>
                              )}
                            </div>
                          </div>

                          <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <button
                              type="button"
                              onClick={() => addTierAfter(row)}
                              aria-label={`Insertar un tramo debajo del de ${rangeLabel(t)} comensales`}
                              title="Insertar un tramo aquí"
                              className="rounded-md p-1 text-content-secondary transition-colors hover:bg-brand-light hover:text-brand focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand"
                            >
                              <Plus size={13} strokeWidth={3} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeTier(t.id)}
                              aria-label={`Eliminar el tramo de ${rangeLabel(t)} comensales`}
                              title="Eliminar este tramo"
                              className="rounded-md p-1 text-content-muted transition-colors hover:bg-destructive-light hover:text-destructive focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </td>

                      {groups.map((g, gi) =>
                        g.roles.length === 0 ? (
                          <td
                            key={g.block.id}
                            className={cn(
                              'border-b border-border-soft px-2.5 py-1.5 text-center text-content-muted',
                              'group-hover:bg-surface',
                              gi > 0 && 'border-l-2 border-l-border',
                            )}
                          >
                            —
                          </td>
                        ) : (
                          g.roles.map((role, ri) => {
                            col += 1
                            const thisCol = col
                            return (
                              <td
                                key={role.id}
                                className={cn(
                                  'border-b border-border-soft px-1.5 py-1.5',
                                  'group-hover:bg-surface',
                                  gi > 0 && ri === 0 && 'border-l-2 border-l-border',
                                )}
                              >
                                <TierCellInput
                                  id={cellId(row, thisCol)}
                                  value={t.staff[role.id] ?? 0}
                                  onChange={(v) => setCell(t.id, role.id, v)}
                                  onKeyDown={(e) => onCellKey(e, row, thisCol)}
                                  onFocus={(e) => e.currentTarget.select()}
                                  ariaLabel={`${role.name} de ${g.block.name} en el tramo de ${rangeLabel(t)} comensales`}
                                />
                                {showLimits && (
                                  <div className="mt-1 flex items-center justify-center gap-1">
                                    <LimitInput
                                      value={t.staffMin?.[role.id] ?? 0}
                                      onChange={(v) => setLimit(t.id, role.id, 'staffMin', v)}
                                      tone="min"
                                      ariaLabel={`Mínimo de ${role.name} en el tramo de ${rangeLabel(t)} comensales`}
                                    />
                                    <LimitInput
                                      value={t.staffMax?.[role.id] ?? 0}
                                      onChange={(v) => setLimit(t.id, role.id, 'staffMax', v)}
                                      tone="max"
                                      ariaLabel={`Máximo de ${role.name} en el tramo de ${rangeLabel(t)} comensales`}
                                    />
                                  </div>
                                )}
                              </td>
                            )
                          })
                        ),
                      )}

                      <td
                        aria-hidden="true"
                        className={cn(
                          'border-b border-l-2 border-border-soft border-l-border',
                          'group-hover:bg-surface',
                        )}
                      />
                    </tr>

                    {rowIssues.length > 0 && (
                      <tr>
                        <td colSpan={colCount} className="border-b border-border-soft p-0">
                          <div className="sticky left-0 max-w-xl px-4 py-2">
                            <Note tone="warning" icon={<AlertTriangle size={15} />}>
                              {rowIssues.map((i) => (
                                <p key={i.message}>{i.message}</p>
                              ))}
                            </Note>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => addTierAfter(tiers.length - 1)}
            >
              Añadir tramo
            </Button>
            <Button
              variant={showLimits ? 'primary' : 'ghost'}
              size="sm"
              icon={<ArrowUpDown size={15} />}
              onClick={() => setShowLimits((v) => !v)}
            >
              {showLimits ? 'Ocultar mínimos y máximos' : 'Mínimos y máximos'}
            </Button>
          </div>
          <p className="text-[0.78rem] font-medium text-content-muted">
            Tab pasa a la siguiente celda y Enter baja al tramo de abajo.
          </p>
        </div>
      </Card>

      {blockModal && (
        <AddBlockModal
          usedNames={blocks.map((b) => b.name)}
          usedColors={blocks.map((b) => b.color)}
          onClose={() => setBlockModal(false)}
          onCreate={createBlock}
        />
      )}

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm?.kind === 'reset'
            ? 'Volver a los valores de ejemplo'
            : confirm?.kind === 'block'
              ? `Eliminar ${confirm.block.name}`
              : confirm?.kind === 'role'
                ? `Eliminar ${confirm.role.name}`
                : ''
        }
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (!confirm) return
                if (confirm.kind === 'reset') restoreDefaults()
                else if (confirm.kind === 'block') removeBlock(confirm.block)
                else removeRole(confirm.role.id)
                setConfirm(null)
              }}
            >
              {confirm?.kind === 'reset' ? 'Restaurar' : 'Eliminar'}
            </Button>
          </>
        }
      >
        {confirm?.kind === 'reset' && (
          <p className="text-[0.92rem] leading-relaxed text-content-body">
            Se restauran los bloques, los puestos y los tramos de ejemplo. Todo lo que hayas
            cambiado en esta tabla se pierde.
          </p>
        )}
        {confirm?.kind === 'block' && (
          <p className="text-[0.92rem] leading-relaxed text-content-body">
            {confirm.roleCount === 0
              ? 'Este bloque no tiene ningún puesto, así que no se pierde nada.'
              : `Se van con él ${confirm.roleCount} ${confirm.roleCount === 1 ? 'puesto' : 'puestos'} y lo que hayas puesto en sus columnas: ${roles
                  .filter((r) => r.blockId === confirm.block.id)
                  .map((r) => r.name)
                  .join(', ')}.`}
          </p>
        )}
        {confirm?.kind === 'role' && (
          <p className="text-[0.92rem] leading-relaxed text-content-body">
            {confirm.usedIn === 0
              ? 'Este puesto está a cero en todos los tramos.'
              : `Tiene personas asignadas en ${confirm.usedIn} ${confirm.usedIn === 1 ? 'tramo' : 'tramos'}. Al borrarlo esas horas dejan de contar en la plantilla.`}
          </p>
        )}
      </Modal>
    </>
  )
}
