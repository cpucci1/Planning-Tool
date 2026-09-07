/**
 * Entrar con el email para guardar el plan.
 *
 * Sustituye a `AccountTeaserModal`, que era una maqueta declarada: pedia email y
 * movil y no los mandaba a ningun sitio.
 *
 * POR QUE EMAIL Y NO MOVIL. Decision de Crescente del 2026-09-06. El movil
 * obligaba a mandar SMS, que se pagan, y en la base de produccion de Shifty el
 * telefono es unico en toda `auth.users`, asi que un duenno de restaurante que
 * ya fuera trabajador no habria podido tener aqui una cuenta aparte. Con email y
 * en un proyecto propio, las dos cosas dejan de existir.
 *
 * COMO FUNCIONA. Dos pasos en el mismo modal: se pide el correo, llega un codigo
 * de seis digitos, se escribe y ya hay sesion. No hay "registrarse" separado de
 * "entrar": si el correo no existe se crea la cuenta y si existe entra. Una
 * pantalla menos que explicar.
 *
 * Y AL ENTRAR SE RECLAMA EL PLAN, que es el unico motivo por el que existe este
 * modal. Si eso falla, se dice: haber entrado y que el plan no se guarde es
 * exactamente lo que la persona vino a evitar.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Mail, ShieldCheck } from 'lucide-react'
import { Button, Modal, Note, TextInput } from './ui'
import { comprobarCodigo, pedirCodigo } from '@/lib/backend'

type Fase = 'email' | 'codigo' | 'listo'

export function CuentaModal({
  open,
  onClose,
  onEntrado,
}: {
  open: boolean
  onClose: () => void
  /** Se llama con la sesion ya abierta. Aqui es donde se reclama el plan. */
  onEntrado: () => Promise<void>
}) {
  const [fase, setFase] = useState<Fase>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * El mensaje de arriba no siempre es un fallo. Cuando se pide un segundo
   * código antes de tiempo, lo que hay que decir es "ya lo tienes en el correo",
   * y eso en rojo parece que algo se ha roto cuando no se ha roto nada.
   */
  const [avisoSuave, setAvisoSuave] = useState(false)

  // Al cerrarse vuelve a su estado inicial. Sin esto, quien lo cierra a mitad y
  // lo vuelve a abrir se encuentra el paso del codigo sin haber pedido ninguno.
  useEffect(() => {
    if (!open) {
      setFase('email')
      setCodigo('')
      setError(null)
      setAvisoSuave(false)
      setCargando(false)
    }
  }, [open])

  async function mandarCodigo(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setAvisoSuave(false)
    setCargando(true)
    try {
      await pedirCodigo(email.trim())
      setFase('codigo')
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : ''
      // OJO CON EL LÍMITE DE FRECUENCIA, que no es un fallo: es que ya se mandó
      // uno hace menos de un minuto. Tratarlo como un error dejaba a la persona
      // en la pantalla del correo, con un cartel rojo y SIN forma de escribir el
      // código que ya tenía en la bandeja. Se pasa a la pantalla del código
      // igual, que es donde puede hacer algo con él.
      const esPorFrecuencia =
        /rate limit|only request this after|after \d+ seconds|429/i.test(mensaje)
      if (esPorFrecuencia) {
        setFase('codigo')
        setAvisoSuave(true)
        setError('Ya te habíamos mandado un código hace un momento. Míralo en tu correo y escríbelo aquí.')
      } else {
        // El error de Supabase no se enseña tal cual: dice cosas que no le
        // sirven a nadie.
        setError('No hemos podido mandar el código. Revisa el correo y vuelve a intentarlo.')
      }
    } finally {
      setCargando(false)
    }
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setAvisoSuave(false)
    setCargando(true)
    try {
      await comprobarCodigo(email.trim(), codigo.trim())
      // Ya hay sesion. Ahora lo que de verdad importa: que el plan quede suyo.
      await onEntrado()
      setFase('listo')
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : ''
      setError(
        mensaje.includes('planning_')
          ? 'Has entrado, pero no hemos podido guardar este plan en tu cuenta. Vuelve a intentarlo desde el botón de guardar.'
          : 'Ese código no es válido o ha caducado. Pide otro y prueba de nuevo.',
      )
    } finally {
      setCargando(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        fase === 'listo'
          ? 'Guardado en tu cuenta'
          : fase === 'codigo'
            ? 'Mira tu correo'
            : 'Guarda este plan para no perderlo'
      }
      subtitle={
        fase === 'listo'
          ? 'Puedes cerrar esto y seguir trabajando.'
          : fase === 'codigo'
            ? `Te hemos mandado un código de seis dígitos a ${email}.`
            : 'Sin contraseña. Te mandamos un código al correo y ya está.'
      }
    >
      {fase === 'listo' && (
        <div className="space-y-4">
          <Note tone="success" icon={<ShieldCheck size={16} strokeWidth={2.4} />}>
            Este plan ya es tuyo. Entra con el mismo correo desde cualquier ordenador y lo tendrás
            ahí, con los nombres que le hayas puesto a tu gente.
          </Note>
          <div className="flex justify-end">
            <Button onClick={onClose}>Seguir trabajando</Button>
          </div>
        </div>
      )}

      {fase === 'email' && (
        <form onSubmit={mandarCodigo} className="space-y-4">
          <p className="text-[0.9rem] leading-relaxed text-content-secondary">
            Lo que has hecho vive ahora mismo solo en este navegador. Con tu correo lo recuperas
            desde cualquier sitio, y la semana que viene no vuelves a empezar de cero.
          </p>

          <div>
            <label
              htmlFor="cuenta-email"
              className="mb-1.5 block text-[0.82rem] font-bold text-content-primary"
            >
              Tu correo
            </label>
            <TextInput
              id="cuenta-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@turestaurante.es"
            />
          </div>

          {error && <Note tone={avisoSuave ? 'info' : 'danger'}>{error}</Note>}

          <p className="text-[0.78rem] leading-relaxed text-content-muted">
            Solo lo usamos para que puedas volver a tu plan. No te apuntamos a ninguna lista de
            correo ni te llama nadie.
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              Ahora no
            </Button>
            <Button
              type="submit"
              disabled={cargando || !email.trim()}
              icon={cargando ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            >
              {cargando ? 'Mandando…' : 'Mándame el código'}
            </Button>
          </div>
        </form>
      )}

      {fase === 'codigo' && (
        <form onSubmit={confirmar} className="space-y-4">
          <div>
            <label
              htmlFor="cuenta-codigo"
              className="mb-1.5 block text-[0.82rem] font-bold text-content-primary"
            >
              El código
            </label>
            <TextInput
              id="cuenta-codigo"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="text-center text-[1.3rem] font-black tracking-[0.4em] tabular-nums"
            />
          </div>

          {error && <Note tone={avisoSuave ? 'info' : 'danger'}>{error}</Note>}

          <p className="text-[0.78rem] leading-relaxed text-content-muted">
            Si no te llega en un minuto, mira en spam.
          </p>

          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setFase('email')
                setCodigo('')
                setError(null)
                setAvisoSuave(false)
              }}
            >
              Cambiar el correo
            </Button>
            <Button type="submit" disabled={cargando || codigo.length < 6}>
              {cargando ? 'Comprobando…' : 'Entrar'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
