/**
 * Primitivos de UI.
 *
 * Réplica de los componentes del panel de Shifty: cards a 22px, botones pill,
 * Onest, y el morado de marca. Solo clases semánticas — nunca hex sueltos.
 */

import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Info, Pencil, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs))
}

// ─────────────────────────────────────────────────────────────
// Nombre editable en línea (doble clic o lápiz)
// ─────────────────────────────────────────────────────────────

export function InlineName({
  value,
  onCommit,
  ariaLabel,
  className,
  autoEdit,
  onEditEnd,
}: {
  value: string
  onCommit: (v: string) => void
  ariaLabel: string
  className?: string
  autoEdit?: boolean
  onEditEnd?: () => void
}) {
  const [editing, setEditing] = useState(!!autoEdit)
  const [draft, setDraft] = useState(value)

  function start() {
    setDraft(value)
    setEditing(true)
  }

  function stop(save: boolean) {
    setEditing(false)
    onEditEnd?.()
    const v = draft.trim()
    if (save && v && v !== value) onCommit(v)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => stop(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            stop(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            stop(false)
          }
        }}
        className={cn(
          'w-full min-w-0 rounded-md border border-border-focus bg-surface-elevated px-2 py-1',
          'text-[0.78rem] font-bold text-content-primary outline-none',
          className,
        )}
      />
    )
  }

  return (
    <span className="group/name inline-flex min-w-0 items-center gap-1">
      <span className={cn('truncate', className)} title={value} onDoubleClick={start}>
        {value}
      </span>
      <button
        type="button"
        onClick={start}
        aria-label={ariaLabel}
        className={cn(
          'shrink-0 rounded-md p-1 text-content-muted opacity-0 transition-opacity',
          'hover:bg-surface hover:text-brand group-hover/name:opacity-100',
          'focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand',
        )}
      >
        <Pencil size={11} strokeWidth={2.5} />
      </button>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Botón
// ─────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-content-inverted shadow-cta hover:bg-brand-dark hover:shadow-cta-hover active:scale-[.98]',
  secondary:
    'bg-surface-elevated text-content-primary border border-border hover:border-content-muted hover:bg-surface active:scale-[.98]',
  ghost: 'text-content-secondary hover:text-content-primary hover:bg-surface',
  danger: 'bg-destructive text-content-inverted hover:brightness-95 active:scale-[.98]',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-[0.85rem]',
  md: 'h-11 px-6 text-[0.95rem]',
  lg: 'h-13 px-8 text-[1rem]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  className,
  children,
  // Por defecto un <button> es type="submit": dentro de un formulario cualquier
  // botón lo enviaría sin querer. Aquí casi ninguno lo es.
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition-all duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:pointer-events-none disabled:opacity-40',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card bg-surface-elevated border border-border-soft shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  eyebrow,
  action,
  info,
}: {
  title: ReactNode
  subtitle?: ReactNode
  eyebrow?: string
  action?: ReactNode
  info?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
      <div className="min-w-0">
        {eyebrow && <span className="eyebrow eyebrow--purple mb-2">{eyebrow}</span>}
        {/* El título fluye como texto normal y el InfoTip va incrustado al
            final. Si el h3 fuera flex, cada trozo del título (el texto llano y
            el <span> en cursiva) sería un item independiente y en pantallas
            estrechas se repartirían en columnas en vez de partir por palabras. */}
        <h3 className="h3">
          {title}
          {info && <span className="ml-2 inline-flex translate-y-0.5 align-middle">{info}</span>}
        </h3>
        {subtitle && (
          <p className="mt-1 text-[0.9rem] leading-relaxed text-content-secondary">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Badge
// ─────────────────────────────────────────────────────────────

type BadgeTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const BADGE_TONES: Record<BadgeTone, string> = {
  brand: 'bg-brand-light text-brand',
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-destructive-light text-destructive',
  info: 'bg-info-light text-info',
  neutral: 'bg-surface text-content-secondary',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[0.72rem] font-bold',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Toggle
// ─────────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-3 py-1',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      )}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          // inline-flex + items-center en vez de absolute: un thumb absolute sin
          // `left` fija su posición por el algoritmo de "static position", que
          // varía según el contexto y lo hacía aparecer desplazado sobre el
          // texto. Así el thumb vive en flujo normal, sin ambigüedad posible.
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors duration-200',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          checked ? 'bg-brand' : 'bg-border',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'h-5 w-5 rounded-pill bg-surface-elevated shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-[0.92rem] font-semibold text-content-primary">{label}</span>
        {hint && <span className="mt-0.5 block text-[0.8rem] leading-snug text-content-secondary">{hint}</span>}
      </span>
    </label>
  )
}

// ─────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────

export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 999,
  className,
  ...props
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'>) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      onChange={(e) => {
        const n = Number(e.target.value)
        onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min)
      }}
      className={cn(
        'h-input w-full rounded-md border border-border bg-surface-elevated px-3 text-center text-[0.95rem] font-semibold text-content-primary',
        'transition-colors focus:border-border-focus focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-input w-full rounded-md border border-border bg-surface-elevated px-3.5 text-[0.95rem] font-medium text-content-primary',
        'placeholder:text-content-muted transition-colors focus:border-border-focus focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// Field — etiqueta + pista + control, el envoltorio de cualquier ajuste
// ─────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  info,
  children,
}: {
  label: string
  hint?: string
  info?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[0.85rem] font-bold text-content-primary">{label}</span>
        {info}
      </div>
      {hint && (
        <p className="mb-2.5 text-[0.8rem] leading-relaxed text-content-secondary">{hint}</p>
      )}
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// InfoTip — explicación a demanda, nunca encima
// ─────────────────────────────────────────────────────────────

export function InfoTip({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        type="button"
        aria-label={`Qué es ${title}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded-pill transition-colors',
          open ? 'bg-brand text-content-inverted' : 'text-content-muted hover:bg-surface hover:text-brand',
        )}
      >
        <Info size={14} strokeWidth={2.5} />
      </button>
      {open && (
        <div className="animate-slide-down absolute top-7 left-1/2 z-50 w-72 -translate-x-1/2 rounded-lg border border-border-soft bg-surface-elevated p-4 shadow-lg">
          <p className="mb-1.5 text-[0.85rem] font-bold text-content-primary">{title}</p>
          <div className="text-[0.82rem] leading-relaxed font-medium text-content-secondary">{children}</div>
        </div>
      )}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  /*
   * VA POR UN PORTAL A `document.body`, Y NO ES UN CAPRICHO.
   *
   * `position: fixed` se coloca respecto a la pantalla SOLO si ningún
   * antepasado tiene transform, filter o backdrop-filter. En cuanto uno lo
   * tiene, el fixed pasa a colocarse respecto a ESE antepasado.
   *
   * Es lo que pasaba: la animación de entrada de las tarjetas (`.stagger > *`)
   * deja puesto un transform, así que el modal de borrar una zona se anclaba a
   * la tarjeta del catálogo. Con la página desplazada, el modal aparecía medio
   * fuera por arriba: se veía el final del texto y los botones, y el título no.
   * Medido en el navegador el 2026-09-07: la caja del modal salía en -714 px.
   *
   * Sacándolo a `body` deja de depender de dónde se use. Cualquier modal nuevo
   * nace bien sin que nadie tenga que acordarse de esto.
   */
  return createPortal(
    <div className="fixed inset-0 z-100 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="animate-fade-in absolute inset-0 bg-content-primary/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'animate-pop-in relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-surface-elevated shadow-lg sm:rounded-2xl scroll-thin',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border-soft bg-surface-elevated px-6 pt-6 pb-4">
          <div>
            <h2 className="h2">{title}</h2>
            {subtitle && <p className="mt-1 text-[0.9rem] text-content-secondary">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mt-1 shrink-0 rounded-pill p-2 text-content-muted transition-colors hover:bg-surface hover:text-content-primary"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border-soft bg-surface-elevated px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ─────────────────────────────────────────────────────────────
// Métrica grande
// ─────────────────────────────────────────────────────────────

export function Stat({
  value,
  label,
  hint,
  tone = 'default',
  icon,
}: {
  value: ReactNode
  label: string
  hint?: string
  tone?: 'default' | 'brand' | 'success' | 'warning'
  icon?: ReactNode
}) {
  const toneClass =
    tone === 'brand'
      ? 'text-brand'
      : tone === 'success'
        ? 'text-success'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-content-primary'

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[0.75rem] font-bold tracking-wide text-content-secondary uppercase">
        {icon}
        {label}
      </div>
      <div className={cn('mt-1.5 text-[1.9rem] leading-none font-black tracking-tight', toneClass)}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[0.8rem] font-medium text-content-secondary">{hint}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Aviso
// ─────────────────────────────────────────────────────────────

export function Note({
  tone = 'info',
  icon,
  children,
}: {
  tone?: BadgeTone
  icon?: ReactNode
  children: ReactNode
}) {
  const tones: Record<BadgeTone, string> = {
    brand: 'bg-brand-light text-brand border-brand/15',
    success: 'bg-success-light text-success border-success/15',
    warning: 'bg-warning-light text-warning border-warning/20',
    danger: 'bg-destructive-light text-destructive border-destructive/15',
    info: 'bg-info-light text-info border-info/15',
    neutral: 'bg-surface text-content-secondary border-border-soft',
  }
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-4 py-3 text-[0.85rem] leading-relaxed font-medium',
        tones[tone],
      )}
    >
      {icon && <span className="mt-px shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Segmented control
// ─────────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-pill bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-pill px-4 py-1.5 text-[0.82rem] font-bold transition-all duration-150',
            value === o.value
              ? 'bg-surface-elevated text-content-primary shadow-sm'
              : 'text-content-secondary hover:text-content-primary',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
