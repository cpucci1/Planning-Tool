/**
 * "Seguir en el ordenador": en el móvil, una franja fina bajo la cabecera que
 * ofrece mandarse el enlace por correo para abrirlo luego en el ordenador
 * (2026-11-04, petición de Crescente).
 *
 * Se cierra con la X y no vuelve en esa visita: lo llamativo, solo si se puede
 * cerrar. Si el envío no está encendido o falla, nunca se queda en un error:
 * se ofrece copiar el enlace, que hace lo mismo a mano.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, Laptop, Mail, X } from 'lucide-react'
import { Button, Modal, Note, TextInput } from './ui'
import { mandarEnlacePorCorreo, type ResultadoSeguirLuego } from '@/lib/backend'

const CLAVE_CERRADO = 'shifty-planning:seguir-luego-cerrado'
const BASE_URL = 'https://planificador.shifty.es'
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/

/** Móvil: pantalla estrecha. Una tableta en horizontal ya trabaja bien. */
function useEsMovil(): boolean {
  const consulta = '(max-width: 767px)'
  const [es, setEs] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(consulta).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(consulta)
    if (!mq) return
    const cambio = () => setEs(mq.matches)
    mq.addEventListener('change', cambio)
    return () => mq.removeEventListener('change', cambio)
  }, [])
  return es
}

function leerCerrado(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_CERRADO) === '1'
  } catch {
    return false
  }
}

export function SeguirEnOrdenador({ planToken }: { planToken?: string | null }) {
  const esMovil = useEsMovil()
  const [cerrado, setCerrado] = useState(leerCerrado)
  const [abierto, setAbierto] = useState(false)
  // La franja entra suave, no de golpe.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!esMovil || cerrado) return
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [esMovil, cerrado])

  if (!esMovil || cerrado) return null

  const cerrar = () => {
    setVisible(false)
    try {
      sessionStorage.setItem(CLAVE_CERRADO, '1')
    } catch {
      // modo privado: se cierra igual en esta pantalla
    }
    window.setTimeout(() => setCerrado(true), 200)
  }

  return (
    <>
      <div
        className={`border-b border-border-soft bg-brand-light transition-all duration-200 ease-out ${visible ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}
      >
        <div className="mx-auto flex max-w-[1680px] items-center gap-3 px-4 py-2.5">
          <Laptop size={18} strokeWidth={2.4} className="shrink-0 text-brand" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[0.82rem] leading-snug font-semibold text-content-primary">
            En el ordenador se ve mejor.{' '}
            <button
              type="button"
              onClick={() => setAbierto(true)}
              className="font-bold text-brand underline underline-offset-2"
            >
              Mándamelo por correo
            </button>
          </p>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar el aviso de seguir en el ordenador"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-content-secondary transition-colors hover:bg-surface"
          >
            <X size={16} strokeWidth={2.6} />
          </button>
        </div>
      </div>
      <ModalSeguirLuego open={abierto} onClose={() => setAbierto(false)} planToken={planToken} />
    </>
  )
}

function ModalSeguirLuego({ open, onClose, planToken }: { open: boolean; onClose: () => void; planToken?: string | null }) {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoSeguirLuego | null>(null)
  const [copiado, setCopiado] = useState(false)
  const enlace = planToken ? `${BASE_URL}/?plan=${planToken}` : `${BASE_URL}/`
  const valido = EMAIL_RE.test(email.trim())

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!valido || enviando) return
    setEnviando(true)
    setResultado(await mandarEnlacePorCorreo(email.trim(), planToken))
    setEnviando(false)
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin portapapeles el enlace sigue escrito en pantalla para copiarlo a mano.
    }
  }

  const cerrar = () => {
    onClose()
    // Al volver a abrir, empieza limpia.
    window.setTimeout(() => {
      setResultado(null)
      setCopiado(false)
    }, 200)
  }

  const enviado = resultado === 'enviado'
  const fallo = resultado !== null && !enviado && resultado !== 'email'

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title={enviado ? 'Te lo hemos mandado' : 'Sigue en el ordenador'}
      subtitle={
        enviado
          ? `Míralo en ${email.trim()}. Ábrelo en el ordenador cuando te venga bien.`
          : planToken
            ? 'Te mandamos el enlace a tu plan guardado y un resumen de lo que te da.'
            : 'Te mandamos el enlace y un resumen de lo que te da, para abrirlo cuando estés delante del ordenador.'
      }
      footer={
        enviado ? (
          <Button onClick={cerrar}>Hecho</Button>
        ) : (
          <>
            <Button variant="ghost" className="whitespace-nowrap" onClick={cerrar}>
              Ahora no
            </Button>
            <Button
              type="submit"
              form="form-seguir-luego"
              disabled={!valido || enviando}
              className="whitespace-nowrap"
              icon={<Mail size={15} strokeWidth={2.5} />}
            >
              {enviando ? 'Enviando…' : 'Enviármelo'}
            </Button>
          </>
        )
      }
    >
      {enviado ? (
        <p className="flex items-center gap-2 text-[0.92rem] font-semibold text-content-primary">
          <Check size={18} strokeWidth={2.6} className="text-brand" /> Si no lo ves, mira en promociones o spam.
        </p>
      ) : (
        <form id="form-seguir-luego" onSubmit={enviar} className="space-y-3">
          <label htmlFor="seguir-luego-email" className="block text-[0.85rem] font-bold text-content-primary">
            Tu correo
          </label>
          <TextInput
            id="seguir-luego-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="nombre@tulocal.es"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (resultado === 'email') setResultado(null)
            }}
          />
          {resultado === 'email' && (
            <p className="text-[0.82rem] font-semibold text-destructive">Ese correo no parece bien escrito. Revísalo.</p>
          )}
          <p className="text-[0.78rem] leading-snug text-content-muted">
            Solo lo usamos para mandarte este enlace. No lo guardamos ni te escribiremos más.
          </p>
          {fallo && (
            <Note tone="neutral">
              <p>
                {resultado === 'tope'
                  ? 'Hoy ya no podemos mandar más correos.'
                  : 'Ahora mismo no podemos mandar el correo.'}{' '}
                Copia el enlace y ábrelo en el ordenador:
              </p>
              <p className="mt-1.5 break-all font-semibold text-content-primary">{enlace}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={copiar}
                icon={copiado ? <Check size={14} strokeWidth={2.6} /> : <Copy size={14} strokeWidth={2.5} />}
              >
                {copiado ? 'Copiado' : 'Copiar el enlace'}
              </Button>
            </Note>
          )}
        </form>
      )}
    </Modal>
  )
}
